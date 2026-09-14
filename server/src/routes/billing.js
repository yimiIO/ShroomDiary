'use strict';

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const db = require('../db');
const { asyncRoute, fail, ok, requireUser, text } = require('../http');
const {
  FEATURES,
  LEGAL_DOCUMENTS,
  LEGAL_VERSION,
  legalDocument,
  pointCentsFromYuan,
  points
} = require('../billing-policy');
const {
  acceptPaymentAgreements,
  awardSevenDayReward,
  hasCurrentPaymentAgreements,
  ledger,
  overview,
  unlockFeature
} = require('../billing-store');
const { applySuccessfulPayment, reconcilePaymentOrder } = require('../billing-payments');
const {
  applyProviderRefund,
  getRefundRequest,
  listRefundRequests
} = require('../billing-refunds');
const {
  createPayment,
  parseNotification,
  paymentChannelConfiguration,
  paymentConfiguration
} = require('../wechat-pay');

const router = express.Router();

function mapOrder(row) {
  return {
    id: row.id,
    amountYuan: Number((Number(row.amount_cents || 0) / 100).toFixed(2)),
    points: points(row.point_cents),
    status: row.status,
    clientPlatform: row.client_platform,
    payment: row.status === 'PREPAY' ? (row.payment_payload || {}) : {},
    paidAt: row.paid_at || null,
    expiresAt: row.expires_at || null,
    providerSyncedAt: row.last_provider_sync_at || null,
    createdAt: row.created_at
  };
}

router.get('/legal', (req, res) => {
  const payment = paymentConfiguration();
  return ok(res, {
    version: LEGAL_VERSION,
    documents: Object.values(LEGAL_DOCUMENTS),
    merchant: {
      label: config.billing.merchantLabel,
      legalName: config.billing.merchantLegalName || '',
      invoiceLegalName: config.billing.invoiceLegalName || '',
      taxId: config.billing.merchantTaxId || '',
      address: config.billing.merchantAddress || '',
      customerService: config.billing.customerService || '',
      icpQualification: config.billing.icpQualification || '',
      appFilingNumber: config.billing.appFilingNumber || ''
    },
    paymentReady: payment.live,
    paymentChannels: Object.fromEntries(Object.entries(payment.channels).map(([key, value]) => [key, {
      ready: value.ready,
      live: value.live,
      reason: value.reason
    }]))
  });
});

router.get('/legal/:key', (req, res) => {
  const document = legalDocument(req.params.key, {
    legalName: config.billing.merchantLegalName,
    address: config.billing.merchantAddress,
    customerService: config.billing.customerService,
    taxId: config.billing.merchantTaxId,
    icpQualification: config.billing.icpQualification,
    appFilingNumber: config.billing.appFilingNumber
  });
  if (!document) return fail(res, 404, '协议不存在');
  const merchant = paymentConfiguration();
  return ok(res, {
    ...document,
    publishable: merchant.legalReady,
    invoiceLegalName: config.billing.invoiceLegalName || ''
  });
});

router.post('/payments/wechat/notify', async (req, res) => {
  try {
    if (!paymentConfiguration().callbackReady) return res.status(503).json({ code: 'FAIL', message: '支付回调未就绪' });
    const transaction = parseNotification(req.headers, req.rawBody);
    if (transaction.trade_state !== 'SUCCESS') return res.status(204).end();
    await db.transaction(async client => {
      const orderResult = await client.query(
        'SELECT * FROM billing_payment_orders WHERE out_trade_no = $1 FOR UPDATE',
        [transaction.out_trade_no]
      );
      const order = orderResult.rows[0];
      if (!order) throw Object.assign(new Error('支付订单不存在'), { code: 'SHROOM_PAYMENT_ORDER' });
      await applySuccessfulPayment(client, order, transaction);
    });
    return res.status(204).end();
  } catch (error) {
    console.error('wechat payment notification rejected', { code: error.code, message: error.message });
    return res.status(500).json({ code: 'FAIL', message: '回调验证失败' });
  }
});

router.post('/refunds/wechat/notify', async (req, res) => {
  try {
    if (!paymentConfiguration().callbackReady) return res.status(503).json({ code: 'FAIL', message: '退款回调未就绪' });
    const refund = parseNotification(req.headers, req.rawBody);
    const item = await db.query(
      'SELECT id FROM billing_refund_items WHERE out_refund_no = $1',
      [refund.out_refund_no]
    );
    if (!item.rowCount) throw Object.assign(new Error('退款子单不存在'), { code: 'SHROOM_PAYMENT_ORDER' });
    await applyProviderRefund(item.rows[0].id, refund);
    return res.status(204).end();
  } catch (error) {
    console.error('wechat refund notification rejected', { code: error.code, message: error.message });
    return res.status(500).json({ code: 'FAIL', message: '退款回调验证失败' });
  }
});

router.use(requireUser);

router.get('/overview', asyncRoute(async (req, res) => ok(res, await overview(req.user.id))));

router.get('/ledger', asyncRoute(async (req, res) => ok(res, {
  list: await ledger(req.user.id, req.query.limit)
})));

router.post('/agreements/accept', asyncRoute(async (req, res) => {
  if (req.body.accepted !== true || req.body.version !== LEGAL_VERSION) {
    return fail(res, 400, '请阅读并同意当前版本的协议与退款规则');
  }
  if (!paymentConfiguration().legalReady) {
    return fail(res, 503, '收费主体与协议尚未完成发布，当前不能保存收费同意');
  }
  await acceptPaymentAgreements(db, req.user.id, 'WALLET_BILLING');
  return ok(res, { accepted: true, version: LEGAL_VERSION });
}));

router.post('/activity/seven-day/claim', asyncRoute(async (req, res) => {
  const status = await db.transaction(client => awardSevenDayReward(client, req.user.id));
  if (!status.qualified) return fail(res, 400, `还需要记录 ${status.remainingDays} 天`);
  return ok(res, status, status.newlyRewarded ? '已获得 1 菇点' : '奖励已入账');
}));

router.post('/features/:key/unlock', asyncRoute(async (req, res) => {
  if (!FEATURES[req.params.key]) return fail(res, 404, '解锁功能不存在');
  const result = await unlockFeature(req.user.id, req.params.key);
  return ok(res, result, result.alreadyUnlocked ? '功能已解锁' : `已解锁${FEATURES[req.params.key].name}`);
}));

router.post('/payments/orders', asyncRoute(async (req, res) => {
  const clientPlatform = ['MP_WEIXIN', 'H5'].includes(req.body.clientPlatform)
    ? req.body.clientPlatform : '';
  if (!clientPlatform) return fail(res, 400, '当前客户端暂不支持充值');
  const channel = paymentChannelConfiguration(clientPlatform);
  if (!channel.live) return fail(res, 503, channel.reason || '当前支付渠道尚未开放', {
    reason: channel.missing[0] || 'PAYMENT_NOT_READY',
    clientPlatform
  });
  if (!await hasCurrentPaymentAgreements(db, req.user.id)) {
    return fail(res, 400, '请先阅读并同意充值与退款规则');
  }
  const amountPointCents = pointCentsFromYuan(req.body.amountYuan);
  if (!amountPointCents || amountPointCents < 100 || amountPointCents > 50000) {
    return fail(res, 400, '充值金额需要在 1–500 元之间');
  }
  const idempotencyKey = text(req.body.idempotencyKey, 160);
  if (idempotencyKey.length < 12) return fail(res, 400, '支付请求标识无效');
  const existing = await db.query(
    'SELECT * FROM billing_payment_orders WHERE user_id = $1 AND idempotency_key = $2',
    [req.user.id, idempotencyKey]
  );
  if (existing.rowCount) {
    if (Number(existing.rows[0].amount_cents) !== amountPointCents
      || existing.rows[0].client_platform !== clientPlatform) {
      return fail(res, 400, '同一支付请求标识不能变更金额或支付渠道');
    }
    return ok(res, mapOrder(existing.rows[0]));
  }
  const recent = await db.query(
    `SELECT count(*)::int AS count FROM billing_payment_orders
      WHERE user_id = $1 AND created_at > now() - interval '10 minutes'
        AND status IN ('CREATED', 'PREPAY')`,
    [req.user.id]
  );
  if (Number(recent.rows[0]?.count || 0) >= 5) return fail(res, 429, '支付请求过于频繁，请稍后再试');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const order = {
    id: crypto.randomUUID(),
    outTradeNo: crypto.randomBytes(16).toString('hex'),
    amountCents: amountPointCents,
    pointCents: amountPointCents,
    expiresAt
  };
  const inserted = await db.query(
    `INSERT INTO billing_payment_orders
      (id, out_trade_no, user_id, merchant_label, merchant_legal_name, invoice_legal_name,
       merchant_tax_id, icp_qualification, app_filing_number, amount_cents, point_cents,
       client_platform, agreement_version, idempotency_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`,
    [order.id, order.outTradeNo, req.user.id, config.billing.merchantLabel,
      config.billing.merchantLegalName, config.billing.invoiceLegalName, config.billing.merchantTaxId,
      config.billing.icpQualification, config.billing.appFilingNumber, order.amountCents, order.pointCents,
      clientPlatform, LEGAL_VERSION, idempotencyKey, expiresAt]
  );
  if (!inserted.rowCount) {
    const raced = await db.query(
      'SELECT * FROM billing_payment_orders WHERE user_id = $1 AND idempotency_key = $2',
      [req.user.id, idempotencyKey]
    );
    if (!raced.rowCount || Number(raced.rows[0].amount_cents) !== amountPointCents
      || raced.rows[0].client_platform !== clientPlatform) {
      return fail(res, 400, '支付请求冲突，请重新发起');
    }
    return ok(res, mapOrder(raced.rows[0]));
  }
  try {
    const created = await createPayment(order, {
      clientPlatform,
      payerIp: req.ip,
      userAgent: req.get('user-agent')
    });
    const updated = await db.query(
      `UPDATE billing_payment_orders SET status = 'PREPAY', payer_openid_hash = $2,
         payment_payload = $3::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
      [order.id, created.openidHash, JSON.stringify(created.payment)]
    );
    return ok(res, mapOrder(updated.rows[0]), '已创建微信支付订单');
  } catch (error) {
    await db.query(
      `UPDATE billing_payment_orders SET status = 'FAILED', updated_at = now() WHERE id = $1`,
      [order.id]
    );
    throw error;
  }
}));

router.get('/payments/orders/:id', asyncRoute(async (req, res) => {
  const result = await db.query(
    'SELECT * FROM billing_payment_orders WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return fail(res, 404, '支付订单不存在');
  const current = result.rows[0];
  const lastSyncAge = current.last_provider_sync_at
    ? Date.now() - new Date(current.last_provider_sync_at).getTime() : Infinity;
  let order = current;
  if (current.status === 'PREPAY' && lastSyncAge >= 2000 && paymentConfiguration().providerReady) {
    order = await reconcilePaymentOrder(current.id, req.user.id);
  }
  return ok(res, mapOrder(order));
}));

router.get('/refund-requests', asyncRoute(async (req, res) => ok(res, {
  list: await listRefundRequests(req.user.id)
})));

router.get('/refund-requests/:id', asyncRoute(async (req, res) => {
  const refund = await getRefundRequest(req.params.id, req.user.id);
  if (!refund) return fail(res, 404, '退款申请不存在');
  return ok(res, refund);
}));

router.post('/refund-requests', asyncRoute(async (req, res) => {
  const requestedPointCents = pointCentsFromYuan(req.body.amountYuan);
  if (!requestedPointCents) return fail(res, 400, '请输入要退回的未消费充值金额');
  const result = await db.transaction(async client => {
    const wallet = await client.query(
      'SELECT paid_balance_cents FROM wallet_accounts WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    const balances = await client.query(
      `SELECT
         COALESCE((SELECT sum(refundable_point_cents) FROM billing_payment_orders
           WHERE user_id = $1 AND status IN ('PAID', 'PARTIAL_REFUND')), 0)::int AS refundable,
         COALESCE((SELECT sum(requested_point_cents) FROM billing_refund_requests
           WHERE user_id = $1 AND status IN ('REQUESTED', 'PROCESSING')), 0)::int AS reserved`,
      [req.user.id]
    );
    const paidBalance = Number(wallet.rows[0]?.paid_balance_cents || 0);
    const refundable = Math.min(paidBalance, Number(balances.rows[0].refundable || 0));
    const availableToRequest = Math.max(0, refundable - Number(balances.rows[0].reserved || 0));
    if (requestedPointCents > availableToRequest) return { error: true };
    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO billing_refund_requests (id, user_id, requested_point_cents, reason)
       VALUES ($1, $2, $3, $4)`,
      [id, req.user.id, requestedPointCents, text(req.body.reason, 400)]
    );
    return { id };
  });
  if (result.error) return fail(res, 400, '申请金额超过当前可退且未被占用的充值余额');
  return ok(res, await getRefundRequest(result.id, req.user.id),
    '退款申请已提交，对应余额已冻结，审核后按原路径处理');
}));

module.exports = router;
