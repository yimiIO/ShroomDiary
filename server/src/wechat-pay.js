'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const config = require('./config');
const { merchantStatus } = require('./billing-policy');

const API_ORIGIN = 'https://api.mch.weixin.qq.com';
const MAX_SIGNATURE_AGE_SECONDS = 300;

function urlProblem(value, { noQuery = false } = {}) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return 'HTTPS';
    if (noQuery && (url.search || url.hash)) return 'NO_QUERY';
    return '';
  } catch (error) {
    return 'INVALID';
  }
}

function pathExists(pathValue) {
  return Boolean(String(pathValue || '').trim() && fs.existsSync(String(pathValue).trim()));
}

function paymentConfiguration() {
  const status = merchantStatus(config.billing);
  const legalReady = status.ready;
  const pay = config.billing.wechatPay;
  const callbackMissing = [];
  for (const [key, value] of [
    ['WECHAT_PAY_MCH_ID', pay.mchId],
    ['WECHAT_PAY_APP_ID', pay.appId],
    ['WECHAT_PAY_API_V3_KEY', pay.apiV3Key]
  ]) if (!String(value || '').trim()) callbackMissing.push(key);
  if (pay.apiV3Key && Buffer.byteLength(pay.apiV3Key, 'utf8') !== 32) {
    callbackMissing.push('WECHAT_PAY_API_V3_KEY_LENGTH');
  }
  const publicKeyComplete = Boolean(pay.publicKeyId && pay.publicKeyPath);
  const certificateConfigured = Boolean(pay.platformCertPath);
  if (!publicKeyComplete && !certificateConfigured) callbackMissing.push('WECHAT_PAY_VERIFICATION_KEY');
  if ((pay.publicKeyId || pay.publicKeyPath) && !publicKeyComplete) callbackMissing.push('WECHAT_PAY_PUBLIC_KEY_PAIR');
  if (pay.publicKeyId && !String(pay.publicKeyId).startsWith('PUB_KEY_ID_')) {
    callbackMissing.push('WECHAT_PAY_PUBLIC_KEY_ID_FORMAT');
  }
  if (pay.publicKeyPath && !pathExists(pay.publicKeyPath)) callbackMissing.push('WECHAT_PAY_PUBLIC_KEY_FILE');
  if (pay.platformCertPath && !pathExists(pay.platformCertPath)) callbackMissing.push('WECHAT_PAY_PLATFORM_CERT_FILE');
  if (pathExists(pay.publicKeyPath)) {
    try { crypto.createPublicKey(fs.readFileSync(pay.publicKeyPath, 'utf8')); } catch (error) {
      callbackMissing.push('WECHAT_PAY_PUBLIC_KEY_INVALID');
    }
  }
  if (pathExists(pay.platformCertPath)) {
    try { new crypto.X509Certificate(fs.readFileSync(pay.platformCertPath, 'utf8')); } catch (error) {
      callbackMissing.push('WECHAT_PAY_PLATFORM_CERT_INVALID');
    }
  }

  const providerMissing = [...callbackMissing];
  for (const [key, value] of [
    ['WECHAT_PAY_MERCHANT_SERIAL', pay.merchantSerial],
    ['WECHAT_PAY_PRIVATE_KEY_PATH', pay.privateKeyPath]
  ]) if (!String(value || '').trim()) providerMissing.push(key);
  if (pay.privateKeyPath && !pathExists(pay.privateKeyPath)) providerMissing.push('WECHAT_PAY_PRIVATE_KEY_FILE');
  if (pathExists(pay.privateKeyPath)) {
    try {
      const key = crypto.createPrivateKey(fs.readFileSync(pay.privateKeyPath, 'utf8'));
      if (key.asymmetricKeyType !== 'rsa') providerMissing.push('WECHAT_PAY_PRIVATE_KEY_RSA');
    } catch (error) { providerMissing.push('WECHAT_PAY_PRIVATE_KEY_INVALID'); }
  }
  const providerReady = providerMissing.length === 0;
  const collectionMissing = [...providerMissing];
  for (const [key, value] of [
    ['WECHAT_PAY_NOTIFY_URL', pay.notifyUrl],
    ['WECHAT_PAY_REFUND_NOTIFY_URL', pay.refundNotifyUrl]
  ]) if (!String(value || '').trim()) collectionMissing.push(key);
  const notifyProblem = pay.notifyUrl ? urlProblem(pay.notifyUrl, { noQuery: true }) : '';
  if (notifyProblem) collectionMissing.push(`WECHAT_PAY_NOTIFY_URL_${notifyProblem}`);
  const refundNotifyProblem = pay.refundNotifyUrl ? urlProblem(pay.refundNotifyUrl, { noQuery: true }) : '';
  if (refundNotifyProblem) collectionMissing.push(`WECHAT_PAY_REFUND_NOTIFY_URL_${refundNotifyProblem}`);
  const originProblem = urlProblem(config.publicOrigin);
  if (originProblem) collectionMissing.push(`PUBLIC_ORIGIN_${originProblem}`);

  const h5Missing = [...status.missing, ...collectionMissing];
  if (pay.h5Enabled !== true) h5Missing.push('WECHAT_PAY_H5_ENABLED');
  const h5Ready = h5Missing.length === 0;
  const h5Live = config.billing.mode === 'live' && h5Ready;
  return {
    ...status,
    legalReady,
    ready: h5Ready,
    missing: h5Missing,
    live: h5Live,
    providerReady,
    providerMissing,
    collectionMissing,
    callbackReady: callbackMissing.length === 0,
    callbackMissing,
    verificationMode: publicKeyComplete ? 'PUBLIC_KEY' : certificateConfigured ? 'PLATFORM_CERTIFICATE' : null,
    channels: {
      H5: {
        ready: h5Ready,
        live: h5Live,
        missing: h5Missing,
        reason: h5Live ? '' : config.billing.mode === 'disabled'
          ? '当前为免费测试期，真实充值尚未开放。'
          : 'H5 支付资质与商户配置核验完成后开放。'
      },
      MP_WEIXIN: {
        ready: false,
        live: false,
        missing: ['WECHAT_VIRTUAL_PAYMENT_REQUIRED'],
        reason: '微信小程序中的菇点属于虚拟服务，普通微信支付不开放；需另行通过微信虚拟支付审核并接入。'
      }
    }
  };
}

function paymentChannelConfiguration(clientPlatform) {
  const status = paymentConfiguration();
  return status.channels[clientPlatform] || {
    ready: false,
    live: false,
    missing: ['UNSUPPORTED_PAYMENT_CHANNEL'],
    reason: '当前客户端暂不支持充值'
  };
}

function configuredPath(pathValue, name) {
  const path = String(pathValue || '').trim();
  if (!path) throw Object.assign(new Error(`${name} 尚未配置`), { code: 'SHROOM_PAYMENT_CONFIG' });
  return path;
}

function privateKey() {
  const pem = fs.readFileSync(configuredPath(config.billing.wechatPay.privateKeyPath, '微信支付商户私钥'), 'utf8');
  const key = crypto.createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'rsa') {
    throw Object.assign(new Error('微信支付商户私钥不是 RSA 私钥'), { code: 'SHROOM_PAYMENT_CONFIG' });
  }
  return key;
}

function platformCertificate() {
  return fs.readFileSync(configuredPath(config.billing.wechatPay.platformCertPath, '微信支付平台证书'), 'utf8');
}

function verificationKey(serial) {
  const pay = config.billing.wechatPay;
  const normalized = String(serial || '').replace(/^0+/, '').toUpperCase();
  if (pay.publicKeyId && normalized === String(pay.publicKeyId).toUpperCase()) {
    return fs.readFileSync(configuredPath(pay.publicKeyPath, '微信支付公钥'), 'utf8');
  }
  if (pay.platformCertPath) {
    const certificate = new crypto.X509Certificate(platformCertificate());
    if (normalized === certificate.serialNumber.replace(/^0+/, '').toUpperCase()) return certificate.publicKey;
  }
  return null;
}

function nonce() {
  return crypto.randomBytes(16).toString('hex');
}

function signMessage(message) {
  return crypto.sign('RSA-SHA256', Buffer.from(message), privateKey()).toString('base64');
}

function authorization(method, path, body, timestamp = Math.floor(Date.now() / 1000), nonceStr = nonce()) {
  const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonceStr}\n${body || ''}\n`;
  const signature = signMessage(message);
  const pay = config.billing.wechatPay;
  return `WECHATPAY2-SHA256-RSA2048 mchid="${pay.mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${pay.merchantSerial}",signature="${signature}"`;
}

function verifyWechatSignature({ timestamp, nonceStr, body, signature, serial, nowSeconds }) {
  if (!timestamp || !nonceStr || !signature || !serial) return false;
  const timestampNumber = Number(timestamp);
  const current = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampNumber) || Math.abs(current - timestampNumber) > MAX_SIGNATURE_AGE_SECONDS) return false;
  const key = verificationKey(serial);
  if (!key) return false;
  const message = `${timestamp}\n${nonceStr}\n${body}\n`;
  return crypto.verify('RSA-SHA256', Buffer.from(message), key, Buffer.from(signature, 'base64'));
}

async function payApi(method, path, bodyObject) {
  if (!paymentConfiguration().providerReady) {
    throw Object.assign(new Error('微信支付商户凭据尚未完成配置'), { code: 'SHROOM_PAYMENT_CONFIG' });
  }
  const body = bodyObject === undefined ? '' : JSON.stringify(bodyObject);
  let response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      headers: {
        authorization: authorization(method, path, body),
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        'user-agent': 'Shroom-Diary/1.0'
      },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(config.billing.wechatPay.timeoutMs)
    });
  } catch (cause) {
    throw Object.assign(new Error('连接微信支付超时或失败'), {
      code: 'SHROOM_PAYMENT_FAILED',
      cause
    });
  }
  const raw = await response.text();
  const signed = verifyWechatSignature({
    timestamp: response.headers.get('wechatpay-timestamp'),
    nonceStr: response.headers.get('wechatpay-nonce'),
    signature: response.headers.get('wechatpay-signature'),
    serial: response.headers.get('wechatpay-serial'),
    body: raw
  });
  if (!signed) throw Object.assign(new Error('微信支付响应签名验证失败'), { code: 'SHROOM_PAYMENT_VERIFY' });
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch (error) {
    throw Object.assign(new Error('微信支付返回了无法解析的数据'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  if (!response.ok) {
    throw Object.assign(new Error(payload.message || '微信支付请求失败'), {
      code: 'SHROOM_PAYMENT_FAILED',
      providerCode: payload.code
    });
  }
  return payload;
}

function normalizedIp(value) {
  const input = String(value || '').split(',')[0].trim().replace(/^::ffff:/, '');
  return /^[\d.]+$/.test(input) || input.includes(':') ? input : '127.0.0.1';
}

function rfc3339Shanghai(value) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

function isWechatBrowser(userAgent) {
  return /MicroMessenger/i.test(String(userAgent || ''));
}

function utf8Slice(value, maxBytes) {
  let result = '';
  for (const character of String(value || '')) {
    if (Buffer.byteLength(result + character, 'utf8') > maxBytes) break;
    result += character;
  }
  return result;
}

async function createPayment(order, input = {}) {
  const channel = paymentChannelConfiguration(input.clientPlatform);
  if (!channel.live) {
    throw Object.assign(new Error(channel.reason || '当前支付渠道尚未开放'), {
      code: 'SHROOM_PAYMENT_PLATFORM',
      data: { clientPlatform: input.clientPlatform, missing: channel.missing }
    });
  }
  if (input.clientPlatform !== 'H5' || isWechatBrowser(input.userAgent)) {
    throw Object.assign(new Error(isWechatBrowser(input.userAgent)
      ? '微信内网页不能使用 H5 支付，请在系统浏览器打开'
      : '当前客户端暂不支持充值'), { code: 'SHROOM_PAYMENT_PLATFORM' });
  }
  const pay = config.billing.wechatPay;
  const payload = await payApi('POST', '/v3/pay/transactions/h5', {
    appid: pay.appId,
    mchid: pay.mchId,
    description: '菇日记-菇点充值',
    out_trade_no: order.outTradeNo,
    time_expire: rfc3339Shanghai(order.expiresAt),
    notify_url: pay.notifyUrl,
    amount: { total: order.amountCents, currency: 'CNY' },
    attach: 'shroom_points',
    scene_info: {
      payer_client_ip: normalizedIp(input.payerIp),
      h5_info: { type: 'Wap', app_name: '菇日记', app_url: config.publicOrigin }
    }
  });
  return { clientPlatform: 'H5', openidHash: null, payment: { provider: 'WECHAT_PAY', h5Url: payload.h5_url } };
}

async function queryPayment(outTradeNo) {
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config.billing.wechatPay.mchId)}`;
  return payApi('GET', path);
}

async function closePayment(outTradeNo) {
  return payApi('POST',
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`,
    { mchid: config.billing.wechatPay.mchId });
}

async function requestRefund(input) {
  const refundNotifyUrl = urlProblem(config.billing.wechatPay.refundNotifyUrl, { noQuery: true })
    ? '' : String(config.billing.wechatPay.refundNotifyUrl || '').trim();
  return payApi('POST', '/v3/refund/domestic/refunds', {
    out_trade_no: input.outTradeNo,
    out_refund_no: input.outRefundNo,
    reason: utf8Slice(input.reason || '退回未消费菇点', 80),
    ...(refundNotifyUrl ? { notify_url: refundNotifyUrl } : {}),
    amount: { refund: input.amountCents, total: input.totalAmountCents, currency: 'CNY' }
  });
}

async function queryRefund(outRefundNo) {
  return payApi('GET', `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`);
}

function decryptNotification(resource) {
  const key = Buffer.from(config.billing.wechatPay.apiV3Key, 'utf8');
  if (key.length !== 32) throw Object.assign(new Error('微信支付 APIv3 密钥长度不正确'), { code: 'SHROOM_PAYMENT_CONFIG' });
  const ciphertext = Buffer.from(String(resource?.ciphertext || ''), 'base64');
  if (ciphertext.length < 17) throw Object.assign(new Error('微信支付回调密文无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(String(resource.nonce || '')));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(String(resource.associated_data || '')));
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

function parseNotification(headers, rawBody) {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const verified = verifyWechatSignature({
    timestamp: headers['wechatpay-timestamp'],
    nonceStr: headers['wechatpay-nonce'],
    signature: headers['wechatpay-signature'],
    serial: headers['wechatpay-serial'],
    body
  });
  if (!verified) throw Object.assign(new Error('微信支付回调签名验证失败'), { code: 'SHROOM_PAYMENT_VERIFY' });
  const envelope = JSON.parse(body);
  return decryptNotification(envelope.resource);
}

module.exports = {
  authorization,
  closePayment,
  createPayment,
  decryptNotification,
  isWechatBrowser,
  normalizedIp,
  parseNotification,
  paymentChannelConfiguration,
  paymentConfiguration,
  queryPayment,
  queryRefund,
  requestRefund,
  rfc3339Shanghai,
  utf8Slice,
  verifyWechatSignature
};
