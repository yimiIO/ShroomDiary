'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { points } = require('./billing-policy');
const { assertPaymentMatches } = require('./billing-payments');
const { refundPaidBalance } = require('./billing-store');
const { queryPayment, queryRefund, requestRefund } = require('./wechat-pay');

const ITEM_TERMINAL = new Set(['SUCCEEDED', 'CLOSED', 'FAILED']);

function refundRequestStatus(statuses) {
  if (!statuses.length) return 'REQUESTED';
  if (statuses.every(status => status === 'SUCCEEDED')) return 'SUCCEEDED';
  if (!statuses.every(status => ITEM_TERMINAL.has(status))) return 'PROCESSING';
  return statuses.some(status => status === 'SUCCEEDED') ? 'PARTIAL' : 'FAILED';
}

function allocateRefundLots(orders, requestedPointCents) {
  const allocations = [];
  let remaining = Math.max(0, Number(requestedPointCents) || 0);
  for (const order of orders) {
    if (!remaining) break;
    const available = Math.max(0,
      Number(order.refundable_point_cents || 0) - Number(order.allocated_cents || 0));
    const amount = Math.min(remaining, available);
    if (!amount) continue;
    allocations.push({ order, amount });
    remaining -= amount;
  }
  return { allocations, remaining };
}

function providerRefundStatus(payload = {}) {
  const value = String(payload.status || payload.refund_status || '').toUpperCase();
  if (value === 'SUCCESS') return 'SUCCEEDED';
  if (value === 'PROCESSING') return 'PROCESSING';
  if (value === 'CLOSED') return 'CLOSED';
  if (value === 'ABNORMAL') return 'ABNORMAL';
  return '';
}

function assertRefundMatches(item, payload) {
  if (payload.out_refund_no !== item.out_refund_no
    || payload.out_trade_no !== item.out_trade_no
    || Number(payload.amount?.refund) !== Number(item.amount_cents)
    || Number(payload.amount?.total) !== Number(item.order_amount_cents)
    || payload.amount?.currency !== 'CNY'
    || (payload.mchid && payload.mchid !== config.billing.wechatPay.mchId)
    || (payload.appid && payload.appid !== config.billing.wechatPay.appId)
    || (providerRefundStatus(payload) === 'SUCCEEDED' && !payload.refund_id)) {
    throw Object.assign(new Error('微信退款的商户、订单或金额不匹配'), {
      code: 'SHROOM_PAYMENT_VERIFY'
    });
  }
}

async function refreshRequestStatus(queryable, requestId) {
  const result = await queryable.query(
    'SELECT status FROM billing_refund_items WHERE refund_request_id = $1',
    [requestId]
  );
  if (!result.rowCount) return 'REQUESTED';
  const statuses = result.rows.map(row => row.status);
  const status = refundRequestStatus(statuses);
  await queryable.query(
    `UPDATE billing_refund_requests SET status = $2,
       completed_at = CASE WHEN $2 IN ('SUCCEEDED', 'PARTIAL', 'FAILED') THEN now() ELSE completed_at END,
       updated_at = now() WHERE id = $1`,
    [requestId, status]
  );
  return status;
}

async function applyProviderRefund(refundItemId, payload) {
  return db.transaction(async client => {
    const ownerResult = await client.query(
      'SELECT refund_request_id, user_id FROM billing_refund_items WHERE id = $1',
      [refundItemId]
    );
    if (!ownerResult.rowCount) throw Object.assign(new Error('退款子单不存在'), {
      code: 'SHROOM_PAYMENT_ORDER'
    });
    await client.query(
      'SELECT id FROM billing_refund_requests WHERE id = $1 FOR UPDATE',
      [ownerResult.rows[0].refund_request_id]
    );
    await client.query(
      'SELECT user_id FROM wallet_accounts WHERE user_id = $1 FOR UPDATE',
      [ownerResult.rows[0].user_id]
    );
    const result = await client.query(
      `SELECT i.*, o.out_trade_no, o.amount_cents AS order_amount_cents
         FROM billing_refund_items i
         JOIN billing_payment_orders o ON o.id = i.payment_order_id
        WHERE i.id = $1 FOR UPDATE OF i, o`,
      [refundItemId]
    );
    const item = result.rows[0];
    if (!item) throw Object.assign(new Error('退款子单不存在'), { code: 'SHROOM_PAYMENT_ORDER' });
    assertRefundMatches(item, payload);
    const nextStatus = providerRefundStatus(payload);
    if (!nextStatus) {
      await client.query(
        `UPDATE billing_refund_items SET status = 'PROCESSING',
           provider_refund_id = COALESCE($2, provider_refund_id),
           response_note = '微信已受理，等待明确终态', updated_at = now() WHERE id = $1`,
        [item.id, payload.refund_id || null]
      );
      await refreshRequestStatus(client, item.refund_request_id);
      return { status: 'PROCESSING' };
    }
    if (nextStatus === 'SUCCEEDED' && item.status !== 'SUCCEEDED') {
      await refundPaidBalance(client, {
        userId: item.user_id,
        paymentOrderId: item.payment_order_id,
        refundRequestId: item.refund_request_id,
        refundItemId: item.id,
        providerRefundId: payload.refund_id || item.provider_refund_id,
        amountPointCents: Number(item.amount_cents)
      });
    }
    await client.query(
      `UPDATE billing_refund_items SET status = $2,
         provider_refund_id = COALESCE($3, provider_refund_id), response_note = $4,
         completed_at = CASE WHEN $2 IN ('SUCCEEDED', 'CLOSED', 'FAILED') THEN now() ELSE completed_at END,
         updated_at = now() WHERE id = $1`,
      [item.id, nextStatus, payload.refund_id || null, `微信退款状态：${nextStatus}`]
    );
    const requestStatus = await refreshRequestStatus(client, item.refund_request_id);
    return { status: nextStatus, requestStatus };
  });
}

async function prepareRefundRequest(requestId, decisionActor = '') {
  return db.transaction(async client => {
    const requestResult = await client.query(
      'SELECT * FROM billing_refund_requests WHERE id = $1 FOR UPDATE',
      [requestId]
    );
    const request = requestResult.rows[0];
    if (!request) throw Object.assign(new Error('退款申请不存在'), { code: 'SHROOM_PAYMENT_ORDER' });
    if (['REJECTED', 'SUCCEEDED', 'PARTIAL', 'FAILED'].includes(request.status)) {
      throw Object.assign(new Error(`退款申请当前状态为 ${request.status}，不能再次处理`), {
        code: 'SHROOM_BILLING_INPUT'
      });
    }
    let items = await client.query(
      `SELECT i.*, o.out_trade_no, o.amount_cents AS order_amount_cents
         FROM billing_refund_items i JOIN billing_payment_orders o ON o.id = i.payment_order_id
        WHERE i.refund_request_id = $1 ORDER BY i.created_at`,
      [requestId]
    );
    if (!items.rowCount) {
      const actor = String(decisionActor || '').trim().slice(0, 120);
      if (!actor) throw Object.assign(new Error('首次审核退款必须记录处理人'), {
        code: 'SHROOM_BILLING_INPUT'
      });
      await client.query('SELECT * FROM wallet_accounts WHERE user_id = $1 FOR UPDATE', [request.user_id]);
      const orders = await client.query(
        `SELECT o.*,
           COALESCE((SELECT sum(i.amount_cents) FROM billing_refund_items i
             JOIN billing_refund_requests r ON r.id = i.refund_request_id
            WHERE i.payment_order_id = o.id AND i.status IN ('CREATED', 'PROCESSING')
              AND r.id <> $2), 0)::int AS allocated_cents
           FROM billing_payment_orders o
          WHERE o.user_id = $1 AND o.status IN ('PAID', 'PARTIAL_REFUND')
            AND o.refundable_point_cents > 0
          ORDER BY o.paid_at, o.created_at FOR UPDATE OF o`,
        [request.user_id, request.id]
      );
      const allocation = allocateRefundLots(orders.rows, request.requested_point_cents);
      for (const { order, amount } of allocation.allocations) {
        await client.query(
          `INSERT INTO billing_refund_items
            (id, refund_request_id, user_id, payment_order_id, out_refund_no, amount_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), request.id, request.user_id, order.id,
            crypto.randomBytes(16).toString('hex'), amount]
        );
      }
      if (allocation.remaining) {
        throw Object.assign(new Error('可退余额无法对应到完整的原支付订单，需要人工核验'), {
          code: 'SHROOM_BILLING_LEDGER'
        });
      }
      await client.query(
        `UPDATE billing_refund_requests SET status = 'PROCESSING', decision_actor = $2, decided_at = now(),
           response_note = '已核验未消费余额，开始原路退款', updated_at = now() WHERE id = $1`,
        [request.id, actor]
      );
      items = await client.query(
        `SELECT i.*, o.out_trade_no, o.amount_cents AS order_amount_cents
           FROM billing_refund_items i JOIN billing_payment_orders o ON o.id = i.payment_order_id
          WHERE i.refund_request_id = $1 ORDER BY i.created_at`,
        [requestId]
      );
    }
    return { request, items: items.rows };
  });
}

async function processRefundRequest(requestId, decisionActor = '') {
  const prepared = await prepareRefundRequest(requestId, decisionActor);
  for (const item of prepared.items) {
    if (ITEM_TERMINAL.has(item.status)) continue;
    let payload;
    if (item.status === 'CREATED') {
      const payment = await queryPayment(item.out_trade_no);
      assertPaymentMatches({
        out_trade_no: item.out_trade_no,
        amount_cents: item.order_amount_cents
      }, payment);
      if (!['SUCCESS', 'REFUND'].includes(payment.trade_state)
        || !payment.transaction_id) {
        throw Object.assign(new Error('原支付订单状态或金额未通过微信查单核验'), {
          code: 'SHROOM_PAYMENT_VERIFY'
        });
      }
      try {
        payload = await requestRefund({
          outTradeNo: item.out_trade_no,
          outRefundNo: item.out_refund_no,
          reason: prepared.request.reason,
          amountCents: Number(item.amount_cents),
          totalAmountCents: Number(item.order_amount_cents)
        });
      } catch (error) {
        try { payload = await queryRefund(item.out_refund_no); } catch (queryError) {
          await db.query(
            `UPDATE billing_refund_items SET status = 'PROCESSING',
               response_note = '退款请求结果不确定，必须使用原退款单号查单后再处理', updated_at = now()
             WHERE id = $1`,
            [item.id]
          );
          throw error;
        }
      }
    } else {
      payload = await queryRefund(item.out_refund_no);
    }
    await applyProviderRefund(item.id, payload);
  }
  return getRefundRequest(requestId);
}

async function rejectRefundRequest(requestId, decisionActor, note) {
  const actor = String(decisionActor || '').trim().slice(0, 120);
  if (!actor) throw Object.assign(new Error('拒绝退款必须记录处理人'), { code: 'SHROOM_BILLING_INPUT' });
  const result = await db.query(
    `UPDATE billing_refund_requests SET status = 'REJECTED', decision_actor = $2, response_note = $3,
       decided_at = now(), completed_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'REQUESTED' RETURNING id`,
    [requestId, actor, String(note || '未通过退款核验').slice(0, 500)]
  );
  if (!result.rowCount) throw Object.assign(new Error('仅待审核退款申请可以拒绝'), {
    code: 'SHROOM_BILLING_INPUT'
  });
  return getRefundRequest(requestId);
}

function mapRefundRequest(row, items = []) {
  return {
    id: row.id,
    status: row.status,
    requestedPoints: points(row.requested_point_cents),
    reason: row.reason,
    responseNote: row.response_note,
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
    items: items.map(item => ({
      id: item.id,
      status: item.status,
      amountYuan: Number((Number(item.amount_cents) / 100).toFixed(2)),
      createdAt: item.created_at,
      completedAt: item.completed_at || null
    }))
  };
}

async function getRefundRequest(requestId, userId = null) {
  const params = userId ? [requestId, userId] : [requestId];
  const result = await db.query(
    `SELECT * FROM billing_refund_requests WHERE id = $1${userId ? ' AND user_id = $2' : ''}`,
    params
  );
  if (!result.rowCount) return null;
  const items = await db.query(
    'SELECT * FROM billing_refund_items WHERE refund_request_id = $1 ORDER BY created_at',
    [requestId]
  );
  return mapRefundRequest(result.rows[0], items.rows);
}

async function listRefundRequests(userId) {
  const result = await db.query(
    'SELECT * FROM billing_refund_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
  const list = [];
  for (const row of result.rows) list.push(await getRefundRequest(row.id, userId));
  return list;
}

module.exports = {
  allocateRefundLots,
  applyProviderRefund,
  assertRefundMatches,
  getRefundRequest,
  listRefundRequests,
  prepareRefundRequest,
  processRefundRequest,
  providerRefundStatus,
  refundRequestStatus,
  refreshRequestStatus,
  rejectRefundRequest
};
