'use strict';

const config = require('./config');
const db = require('./db');
const { creditWallet } = require('./billing-store');
const { closePayment, queryPayment } = require('./wechat-pay');

function assertPaymentMatches(order, transaction) {
  if (transaction.out_trade_no !== order.out_trade_no
    || Number(transaction.amount?.total) !== Number(order.amount_cents)
    || transaction.amount?.currency !== 'CNY'
    || transaction.mchid !== config.billing.wechatPay.mchId
    || transaction.appid !== config.billing.wechatPay.appId
    || (transaction.trade_state === 'SUCCESS' && !transaction.transaction_id)
    || transaction.attach !== 'shroom_points') {
    throw Object.assign(new Error('支付结果的订单、金额、商户或应用不匹配'), {
      code: 'SHROOM_PAYMENT_VERIFY'
    });
  }
}

async function applySuccessfulPayment(client, order, transaction) {
  assertPaymentMatches(order, transaction);
  if (transaction.trade_state !== 'SUCCESS') {
    throw Object.assign(new Error('微信支付订单尚未成功'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  if (order.status === 'PAID' || order.status === 'PARTIAL_REFUND' || order.status === 'REFUNDED') return order;
  const credit = await creditWallet(client, {
    userId: order.user_id,
    amountPointCents: Number(order.point_cents),
    bucket: 'paid',
    eventType: 'PAYMENT',
    referenceType: 'PAYMENT_ORDER',
    referenceId: order.id,
    idempotencyKey: `payment:${order.id}`,
    description: '菇点充值',
    metadata: { outTradeNo: order.out_trade_no, provider: 'WECHAT_PAY' }
  });
  const updated = await client.query(
    `UPDATE billing_payment_orders SET status = 'PAID', provider_transaction_id = $2,
       refundable_point_cents = $3, payment_payload = '{}'::jsonb,
       paid_at = COALESCE($4::timestamptz, now()), last_provider_sync_at = now(), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [order.id, String(transaction.transaction_id || ''), credit.creditedPointCents,
      transaction.success_time || null]
  );
  return updated.rows[0];
}

async function reconcilePaymentOrder(orderId, userId = null) {
  const params = userId ? [orderId, userId] : [orderId];
  const result = await db.query(
    `SELECT * FROM billing_payment_orders WHERE id = $1${userId ? ' AND user_id = $2' : ''}`,
    params
  );
  const order = result.rows[0];
  if (!order) return null;
  if (order.status !== 'PREPAY') return order;
  const transaction = await queryPayment(order.out_trade_no);
  assertPaymentMatches(order, transaction);
  if (transaction.trade_state === 'SUCCESS') {
    return db.transaction(async client => {
      const locked = await client.query(
        `SELECT * FROM billing_payment_orders WHERE id = $1${userId ? ' AND user_id = $2' : ''} FOR UPDATE`,
        params
      );
      return applySuccessfulPayment(client, locked.rows[0], transaction);
    });
  }
  let providerStatus = transaction.trade_state === 'CLOSED' ? 'CLOSED' : order.status;
  if (transaction.trade_state === 'NOTPAY'
    && order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
    await closePayment(order.out_trade_no);
    providerStatus = 'CLOSED';
  }
  const updated = await db.query(
    `UPDATE billing_payment_orders SET status = $2, last_provider_sync_at = now(), updated_at = now()
      WHERE id = $1 RETURNING *`,
    [order.id, providerStatus]
  );
  return updated.rows[0];
}

module.exports = { applySuccessfulPayment, assertPaymentMatches, reconcilePaymentOrder };
