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
  canonicalV2Payment,
  createOAuthState,
  createPayerToken,
  isPersonalWechatBrowser,
  isWechatBrowser,
  parseV2Notification,
  paymentChannelConfiguration,
  paymentConfiguration,
  rfc3339Shanghai,
  signV2Parameters,
  utf8Slice,
  verifyOAuthState,
  verifyPayerToken,
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
  assert.equal(isPersonalWechatBrowser('MicroMessenger/8.0.68'), true);
  assert.equal(isPersonalWechatBrowser('MicroMessenger/8.0.68 wxwork/4.1.33'), false);
  assert.equal(isWechatBrowser('Mozilla/5.0 Safari/605.1.15'), false);
  assert.equal(rfc3339Shanghai('2026-09-14T12:30:00.000Z'), '2026-09-14T20:30:00+08:00');
  assert.ok(Buffer.byteLength(utf8Slice('退款原因'.repeat(30), 80), 'utf8') <= 80);
});

test('v2 JSAPI signs flat XML callbacks and normalizes them for the billing ledger', () => {
  const before = { ...config.billing.wechatPay };
  try {
    config.billing.wechatPay.apiV2Key = '12345678901234567890123456789012';
    const fields = {
      return_code: 'SUCCESS',
      result_code: 'SUCCESS',
      appid: 'wx123',
      mch_id: '1900000109',
      out_trade_no: 'shroom-order-1',
      transaction_id: 'wx-transaction-1',
      trade_state: 'SUCCESS',
      total_fee: '1000',
      fee_type: 'CNY',
      attach: 'shroom_points',
      nonce_str: 'nonce'
    };
    fields.sign = signV2Parameters(fields);
    const xml = `<xml>${Object.entries(fields)
      .map(([key, value]) => `<${key}><![CDATA[${value}]]></${key}>`).join('')}</xml>`;
    const parsed = parseV2Notification(xml);
    assert.equal(parsed.out_trade_no, 'shroom-order-1');
    assert.equal(parsed.amount.total, 1000);
    assert.equal(parsed.mchid, '1900000109');
    assert.equal(parsed.appid, 'wx123');
    assert.throws(() => parseV2Notification(xml.replace('<total_fee><![CDATA[1000]]>', '<total_fee><![CDATA[1001]]>')));
  } finally { Object.assign(config.billing.wechatPay, before); }
});

test('v2 JSAPI OAuth state and payer token are user-bound and expire', () => {
  const now = 1_800_000_000;
  const state = createOAuthState({ userId: 'user-1', returnUrl: 'https://shroom.evox.run/pages/shroom/wallet', nowSeconds: now });
  assert.equal(verifyOAuthState(state, { userId: 'user-1', nowSeconds: now + 60 }).userId, 'user-1');
  assert.throws(() => verifyOAuthState(state, { userId: 'user-2', nowSeconds: now + 60 }));
  assert.throws(() => verifyOAuthState(state, { userId: 'user-1', nowSeconds: now + 601 }));

  const payer = createPayerToken({ userId: 'user-1', openid: 'openid-1', nowSeconds: now });
  assert.equal(verifyPayerToken(payer, { userId: 'user-1', nowSeconds: now + 60 }).openid, 'openid-1');
  assert.throws(() => verifyPayerToken(payer, { userId: 'user-2', nowSeconds: now + 60 }));
  assert.throws(() => verifyPayerToken(payer, { userId: 'user-1', nowSeconds: now + 601 }));
});

test('v2 JSAPI live readiness uses the proven WeChat-inside-H5 channel without APIv3 material', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-wechat-v2-'));
  const privateKeyPath = path.join(directory, 'merchant-private.pem');
  const merchantCertPath = path.join(directory, 'merchant-cert.pem');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  fs.writeFileSync(merchantCertPath, 'merchant certificate placeholder');
  const billingBefore = { ...config.billing };
  const payBefore = { ...config.billing.wechatPay };
  try {
    Object.assign(config.billing, {
      mode: 'live',
      merchantLegalName: '海口澎湃体育文化有限公司',
      invoiceLegalName: '海口澎湃体育文化有限公司',
      merchantTaxId: '91460000MAKMYQ5J7G',
      merchantAddress: '海口市琼山区',
      customerService: '微信：evox077',
      icpQualification: '琼ICP备TEST号',
      legalReviewConfirmed: true
    });
    Object.assign(config.billing.wechatPay, {
      protocol: 'v2_jsapi',
      mchId: '1900000109',
      merchantLegalName: '海口澎湃体育文化有限公司',
      appId: 'wx123',
      oauthAppId: 'wx123',
      oauthAppSecret: 'oauth-secret',
      apiV2Key: '12345678901234567890123456789012',
      privateKeyPath,
      merchantCertPath,
      apiV3Key: '',
      publicKeyId: '',
      publicKeyPath: '',
      platformCertPath: '',
      notifyUrl: 'https://shroom.evox.run/api/billing/v1/payments/wechat/notify',
      refundNotifyUrl: '',
      jsapiEnabled: true,
      h5Enabled: false
    });
    const status = paymentConfiguration();
    assert.equal(status.live, true);
    assert.equal(status.verificationMode, 'V2_MD5');
    assert.equal(status.channels.H5.entryContext, 'WECHAT_WEBVIEW');
    assert.equal(status.missing.includes('WECHAT_PAY_API_V3_KEY'), false);
    assert.equal(status.missing.includes('WECHAT_PAY_VERIFICATION_KEY'), false);
  } finally {
    Object.assign(config.billing, billingBefore);
    Object.assign(config.billing.wechatPay, payBefore);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a WeChat merchant subject different from the service and invoice subject blocks live charging', () => {
  const billingBefore = { ...config.billing };
  const payBefore = { ...config.billing.wechatPay };
  try {
    Object.assign(config.billing, {
      mode: 'live',
      merchantLegalName: '海口澎湃体育文化有限公司',
      invoiceLegalName: '海口澎湃体育文化有限公司',
      merchantTaxId: '91460000MAKMYQ5J7G',
      merchantAddress: '海口市琼山区',
      customerService: '微信：evox077',
      icpQualification: '琼ICP备TEST号',
      legalReviewConfirmed: true
    });
    Object.assign(config.billing.wechatPay, {
      merchantLegalName: '海口溯野体育文化有限公司'
    });
    const status = paymentConfiguration();
    assert.equal(status.live, false);
    assert.equal(status.subjectConsistent, false);
    assert.ok(status.missing.includes('WECHAT_PAY_MERCHANT_SUBJECT_MISMATCH'));
  } finally {
    Object.assign(config.billing, billingBefore);
    Object.assign(config.billing.wechatPay, payBefore);
  }
});

test('v2 query payload becomes the same canonical payment shape used by ledger checks', () => {
  assert.deepEqual(canonicalV2Payment({
    appid: 'wx123', mch_id: '1900000109', out_trade_no: 'order-1',
    transaction_id: 'tx-1', trade_state: 'SUCCESS', total_fee: '100',
    fee_type: 'CNY', attach: 'shroom_points', time_end: '20260915123045'
  }), {
    appid: 'wx123', mchid: '1900000109', out_trade_no: 'order-1',
    transaction_id: 'tx-1', trade_state: 'SUCCESS', attach: 'shroom_points',
    amount: { total: 100, currency: 'CNY' }, success_time: '2026-09-15T12:30:45+08:00'
  });
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
