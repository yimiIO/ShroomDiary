'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const config = require('../src/config');
const { assertPaymentMatches } = require('../src/billing-payments');
const {
  allocateRefundLots,
  assertRefundMatches,
  providerRefundStatus,
  refundRequestStatus
} = require('../src/billing-refunds');
const {
  isWechatBrowser,
  paymentChannelConfiguration,
  rfc3339Shanghai,
  utf8Slice,
  verifyWechatSignature
} = require('../src/wechat-pay');

test('mini program standard payment stays closed for Shroom virtual services', () => {
  const channel = paymentChannelConfiguration('MP_WEIXIN');
  assert.equal(channel.live, false);
  assert.ok(channel.missing.includes('WECHAT_VIRTUAL_PAYMENT_REQUIRED'));
  assert.match(channel.reason, /虚拟支付/);
});

test('WeChat callback verification accepts the configured public key and rejects replay', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-wechat-pay-'));
  const publicKeyPath = path.join(directory, 'wechatpay-public.pem');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
  const before = { ...config.billing.wechatPay };
  try {
    config.billing.wechatPay.publicKeyId = 'PUB_KEY_ID_3000000001';
    config.billing.wechatPay.publicKeyPath = publicKeyPath;
    config.billing.wechatPay.platformCertPath = '';
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = 'test-nonce';
    const body = '{"event_type":"TRANSACTION.SUCCESS"}';
    const signature = crypto.sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonceStr}\n${body}\n`),
      privateKey
    ).toString('base64');
    const input = {
      timestamp,
      nonceStr,
      body,
      signature,
      serial: config.billing.wechatPay.publicKeyId
    };
    assert.equal(verifyWechatSignature(input), true);
    assert.equal(verifyWechatSignature({ ...input, nowSeconds: timestamp + 301 }), false);
    assert.equal(verifyWechatSignature({ ...input, serial: 'PUB_KEY_ID_WRONG' }), false);
  } finally {
    Object.assign(config.billing.wechatPay, before);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('H5 payment boundary detects WeChat webview and uses an explicit Shanghai expiry', () => {
  assert.equal(isWechatBrowser('MicroMessenger/8.0.68'), true);
  assert.equal(isWechatBrowser('Mozilla/5.0 Safari/605.1.15'), false);
  assert.equal(rfc3339Shanghai('2026-09-14T12:30:00.000Z'), '2026-09-14T20:30:00+08:00');
  assert.ok(Buffer.byteLength(utf8Slice('退款原因'.repeat(30), 80), 'utf8') <= 80);
});

test('refund provider states keep processing separate from final settlement', () => {
  assert.equal(providerRefundStatus({ status: 'PROCESSING' }), 'PROCESSING');
  assert.equal(providerRefundStatus({ refund_status: 'SUCCESS' }), 'SUCCEEDED');
  assert.equal(providerRefundStatus({ status: 'ABNORMAL' }), 'ABNORMAL');
  assert.equal(providerRefundStatus({}), '');
  assert.equal(refundRequestStatus(['SUCCEEDED']), 'SUCCEEDED');
  assert.equal(refundRequestStatus(['SUCCEEDED', 'CLOSED']), 'PARTIAL');
  assert.equal(refundRequestStatus(['CLOSED']), 'FAILED');
  assert.equal(refundRequestStatus(['ABNORMAL']), 'PROCESSING');
});

test('refund allocation never reuses an amount already reserved on an original payment', () => {
  const result = allocateRefundLots([
    { id: 'a', refundable_point_cents: 1000, allocated_cents: 700 },
    { id: 'b', refundable_point_cents: 2000, allocated_cents: 0 }
  ], 800);
  assert.deepEqual(result.allocations.map(item => [item.order.id, item.amount]), [['a', 300], ['b', 500]]);
  assert.equal(result.remaining, 0);
});

test('provider payment result must match order, amount, currency, merchant and app before credit', () => {
  const before = { ...config.billing.wechatPay };
  config.billing.wechatPay.mchId = '1900000109';
  config.billing.wechatPay.appId = 'wx123';
  const order = { out_trade_no: 'order-1', amount_cents: 1000 };
  const valid = {
    out_trade_no: 'order-1',
    transaction_id: 'wx-transaction-1',
    trade_state: 'SUCCESS',
    mchid: '1900000109',
    appid: 'wx123',
    attach: 'shroom_points',
    amount: { total: 1000, currency: 'CNY' }
  };
  try {
    assert.doesNotThrow(() => assertPaymentMatches(order, valid));
    assert.throws(() => assertPaymentMatches(order, { ...valid, amount: { total: 1001, currency: 'CNY' } }));
    assert.throws(() => assertPaymentMatches(order, { ...valid, appid: 'wx-other' }));
    assert.throws(() => assertPaymentMatches(order, { ...valid, transaction_id: '' }));
    assert.throws(() => assertPaymentMatches(order, { ...valid, amount: { total: 1000 } }));
  } finally { Object.assign(config.billing.wechatPay, before); }
});

test('provider refund result must match the original merchant order and exact CNY amount', () => {
  const before = { ...config.billing.wechatPay };
  config.billing.wechatPay.mchId = '1900000109';
  config.billing.wechatPay.appId = 'wx123';
  const item = {
    out_trade_no: 'order-1',
    out_refund_no: 'refund-1',
    amount_cents: 300,
    order_amount_cents: 1000
  };
  const valid = {
    mchid: '1900000109',
    out_trade_no: 'order-1',
    out_refund_no: 'refund-1',
    refund_id: 'wx-refund-1',
    status: 'SUCCESS',
    amount: { refund: 300, total: 1000, currency: 'CNY' }
  };
  try {
    assert.doesNotThrow(() => assertRefundMatches(item, valid));
    assert.throws(() => assertRefundMatches(item, { ...valid, mchid: 'other' }));
    assert.throws(() => assertRefundMatches(item, { ...valid, amount: { ...valid.amount, refund: 301 } }));
    assert.throws(() => assertRefundMatches(item, { ...valid, refund_id: '' }));
  } finally { Object.assign(config.billing.wechatPay, before); }
});
