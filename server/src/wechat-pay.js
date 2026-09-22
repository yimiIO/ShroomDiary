'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const config = require('./config');
const { merchantStatus } = require('./billing-policy');

const API_ORIGIN = 'https://api.mch.weixin.qq.com';
const WECHAT_OAUTH_ORIGIN = 'https://open.weixin.qq.com';
const WECHAT_API_ORIGIN = 'https://api.weixin.qq.com';
const MAX_SIGNATURE_AGE_SECONDS = 300;
const OAUTH_TOKEN_SECONDS = 600;

function isV2Jsapi() {
  return config.billing.wechatPay.protocol === 'v2_jsapi';
}

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
  const providerMerchantLegalName = String(pay.merchantLegalName || '').trim();
  const providerSubjectConsistent = Boolean(
    providerMerchantLegalName
    && providerMerchantLegalName === String(config.billing.merchantLegalName || '').trim()
  );
  const v2Jsapi = isV2Jsapi();
  const callbackMissing = [];
  for (const [key, value] of [['WECHAT_PAY_MCH_ID', pay.mchId], ['WECHAT_PAY_APP_ID', pay.appId]]) {
    if (!String(value || '').trim()) callbackMissing.push(key);
  }
  let publicKeyComplete = false;
  let certificateConfigured = false;
  if (v2Jsapi) {
    if (!String(pay.apiV2Key || '').trim()) callbackMissing.push('WECHAT_PAY_API_V2_KEY');
    if (pay.apiV2Key && Buffer.byteLength(pay.apiV2Key, 'utf8') !== 32) {
      callbackMissing.push('WECHAT_PAY_API_V2_KEY_LENGTH');
    }
  } else {
    if (!String(pay.apiV3Key || '').trim()) callbackMissing.push('WECHAT_PAY_API_V3_KEY');
    if (pay.apiV3Key && Buffer.byteLength(pay.apiV3Key, 'utf8') !== 32) {
      callbackMissing.push('WECHAT_PAY_API_V3_KEY_LENGTH');
    }
    publicKeyComplete = Boolean(pay.publicKeyId && pay.publicKeyPath);
    certificateConfigured = Boolean(pay.platformCertPath);
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
  }

  const providerMissing = [...callbackMissing];
  if (!providerMerchantLegalName) providerMissing.push('WECHAT_PAY_MERCHANT_LEGAL_NAME');
  else if (!providerSubjectConsistent) providerMissing.push('WECHAT_PAY_MERCHANT_SUBJECT_MISMATCH');
  const providerFields = v2Jsapi
    ? [
      ['WECHAT_OAUTH_APP_ID', pay.oauthAppId],
      ['WECHAT_OAUTH_APP_SECRET', pay.oauthAppSecret],
      ['WECHAT_PAY_MERCHANT_CERT_PATH', pay.merchantCertPath],
      ['WECHAT_PAY_PRIVATE_KEY_PATH', pay.privateKeyPath]
    ]
    : [
      ['WECHAT_PAY_MERCHANT_SERIAL', pay.merchantSerial],
      ['WECHAT_PAY_PRIVATE_KEY_PATH', pay.privateKeyPath]
    ];
  for (const [key, value] of providerFields) if (!String(value || '').trim()) providerMissing.push(key);
  if (v2Jsapi && pay.oauthAppId && pay.appId && pay.oauthAppId !== pay.appId) {
    providerMissing.push('WECHAT_OAUTH_APP_ID_MISMATCH');
  }
  if (v2Jsapi && pay.merchantCertPath && !pathExists(pay.merchantCertPath)) {
    providerMissing.push('WECHAT_PAY_MERCHANT_CERT_FILE');
  }
  if (pay.privateKeyPath && !pathExists(pay.privateKeyPath)) providerMissing.push('WECHAT_PAY_PRIVATE_KEY_FILE');
  if (pathExists(pay.privateKeyPath)) {
    try {
      const key = crypto.createPrivateKey(fs.readFileSync(pay.privateKeyPath, 'utf8'));
      if (key.asymmetricKeyType !== 'rsa') providerMissing.push('WECHAT_PAY_PRIVATE_KEY_RSA');
    } catch (error) { providerMissing.push('WECHAT_PAY_PRIVATE_KEY_INVALID'); }
  }
  const providerReady = providerMissing.length === 0;
  const collectionMissing = [...providerMissing];
  const callbackUrls = v2Jsapi
    ? [['WECHAT_PAY_NOTIFY_URL', pay.notifyUrl]]
    : [['WECHAT_PAY_NOTIFY_URL', pay.notifyUrl], ['WECHAT_PAY_REFUND_NOTIFY_URL', pay.refundNotifyUrl]];
  for (const [key, value] of callbackUrls) if (!String(value || '').trim()) collectionMissing.push(key);
  const notifyProblem = pay.notifyUrl ? urlProblem(pay.notifyUrl, { noQuery: true }) : '';
  if (notifyProblem) collectionMissing.push(`WECHAT_PAY_NOTIFY_URL_${notifyProblem}`);
  if (!v2Jsapi) {
    const refundNotifyProblem = pay.refundNotifyUrl ? urlProblem(pay.refundNotifyUrl, { noQuery: true }) : '';
    if (refundNotifyProblem) collectionMissing.push(`WECHAT_PAY_REFUND_NOTIFY_URL_${refundNotifyProblem}`);
  }
  const originProblem = urlProblem(config.publicOrigin);
  if (originProblem) collectionMissing.push(`PUBLIC_ORIGIN_${originProblem}`);

  const h5Missing = [...status.missing, ...collectionMissing];
  if (v2Jsapi && pay.jsapiEnabled !== true) h5Missing.push('WECHAT_PAY_JSAPI_ENABLED');
  if (!v2Jsapi && pay.h5Enabled !== true) h5Missing.push('WECHAT_PAY_H5_ENABLED');
  const h5Ready = h5Missing.length === 0;
  const h5Live = config.billing.mode === 'live' && h5Ready;
  return {
    ...status,
    subjectConsistent: status.subjectConsistent && providerSubjectConsistent,
    providerSubjectConsistent,
    legalReady,
    ready: h5Ready,
    missing: h5Missing,
    live: h5Live,
    providerReady,
    providerMissing,
    collectionMissing,
    callbackReady: callbackMissing.length === 0,
    callbackMissing,
    verificationMode: v2Jsapi ? 'V2_MD5'
      : publicKeyComplete ? 'PUBLIC_KEY' : certificateConfigured ? 'PLATFORM_CERTIFICATE' : null,
    channels: {
      H5: {
        ready: h5Ready,
        live: h5Live,
        missing: h5Missing,
        paymentMode: v2Jsapi ? 'JSAPI' : 'MWEB',
        entryContext: v2Jsapi ? 'WECHAT_WEBVIEW' : 'SYSTEM_BROWSER',
        reason: h5Live ? '' : config.billing.mode === 'disabled'
          ? '当前为免费测试期，真实充值尚未开放。'
          : v2Jsapi ? '微信内网页支付配置核验完成后开放。'
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

function isPersonalWechatBrowser(userAgent) {
  const value = String(userAgent || '');
  return isWechatBrowser(value) && !/wxwork/i.test(value);
}

function tokenSecret(kind) {
  return crypto.createHash('sha256').update(`${kind}|${config.tokenSecret}`).digest();
}

function signedToken(kind, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', tokenSecret(kind)).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifiedToken(kind, token, { userId, nowSeconds } = {}) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra) throw Object.assign(new Error('微信支付身份无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
  const expected = crypto.createHmac('sha256', tokenSecret(kind)).update(encoded).digest('base64url');
  if (signature.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw Object.assign(new Error('微信支付身份无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch (error) {
    throw Object.assign(new Error('微信支付身份无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  const now = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now || (userId && payload.userId !== userId)) {
    throw Object.assign(new Error('微信支付身份已失效，请重试'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  return payload;
}

function createOAuthState({ userId, returnUrl, nowSeconds }) {
  const now = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  return signedToken('wechat-oauth-state', { userId, returnUrl, exp: now + OAUTH_TOKEN_SECONDS });
}

function verifyOAuthState(token, options) {
  return verifiedToken('wechat-oauth-state', token, options);
}

function createPayerToken({ userId, openid, nowSeconds }) {
  const now = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  return signedToken('wechat-payer', { userId, openid, exp: now + OAUTH_TOKEN_SECONDS });
}

function verifyPayerToken(token, options) {
  const payload = verifiedToken('wechat-payer', token, options);
  if (!payload.openid || String(payload.openid).length > 100) {
    throw Object.assign(new Error('微信支付身份无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  return payload;
}

function oauthAuthorizationUrl({ state, redirectUrl }) {
  const pay = config.billing.wechatPay;
  const query = new URLSearchParams({
    appid: pay.oauthAppId,
    redirect_uri: redirectUrl,
    response_type: 'code',
    scope: 'snsapi_base',
    state
  });
  return `${WECHAT_OAUTH_ORIGIN}/connect/oauth2/authorize?${query.toString()}#wechat_redirect`;
}

async function exchangeOAuthCode(code) {
  const pay = config.billing.wechatPay;
  const query = new URLSearchParams({
    appid: pay.oauthAppId,
    secret: pay.oauthAppSecret,
    code: String(code || ''),
    grant_type: 'authorization_code'
  });
  let response;
  try {
    response = await fetch(`${WECHAT_API_ORIGIN}/sns/oauth2/access_token?${query.toString()}`, {
      signal: AbortSignal.timeout(pay.timeoutMs)
    });
  } catch (cause) {
    throw Object.assign(new Error('微信网页授权超时或失败'), { code: 'SHROOM_PAYMENT_FAILED', cause });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.openid) {
    throw Object.assign(new Error(payload.errmsg || '微信网页授权失败'), {
      code: 'SHROOM_PAYMENT_FAILED', providerCode: payload.errcode
    });
  }
  return { openid: String(payload.openid), scope: String(payload.scope || '') };
}

function xmlEscape(value) {
  return String(value).replace(/]]>/g, ']]]]><![CDATA[>');
}

function flatXml(fields) {
  return `<xml>${Object.entries(fields).map(([key, value]) => {
    if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error('微信支付 XML 字段无效');
    return `<${key}><![CDATA[${xmlEscape(value)}]]></${key}>`;
  }).join('')}</xml>`;
}

function decodeXmlValue(value) {
  return String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function parseFlatXml(value) {
  const xml = Buffer.isBuffer(value) ? value.toString('utf8') : String(value || '');
  if (!xml || Buffer.byteLength(xml, 'utf8') > 256 * 1024
    || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw Object.assign(new Error('微信支付 XML 无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  const root = xml.match(/^\s*<xml>([\s\S]*)<\/xml>\s*$/);
  if (!root) throw Object.assign(new Error('微信支付 XML 无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
  const result = {};
  const expression = /<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/g;
  let match;
  let cursor = 0;
  while ((match = expression.exec(root[1]))) {
    if (root[1].slice(cursor, match.index).trim() || Object.hasOwn(result, match[1])) {
      throw Object.assign(new Error('微信支付 XML 无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
    }
    result[match[1]] = match[2] === undefined ? decodeXmlValue(match[3] || '') : match[2];
    cursor = expression.lastIndex;
  }
  if (!Object.keys(result).length || root[1].slice(cursor).trim()) {
    throw Object.assign(new Error('微信支付 XML 无效'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  return result;
}

function signV2Parameters(fields, key = config.billing.wechatPay.apiV2Key) {
  const query = Object.entries(fields).filter(([name, value]) => name !== 'sign' && value !== '' && value !== null && value !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, value]) => `${name}=${value}`).join('&');
  return crypto.createHash('md5').update(`${query}&key=${key}`, 'utf8').digest('hex').toUpperCase();
}

function verifyV2Fields(fields) {
  const signature = String(fields.sign || '').toUpperCase();
  const expected = signV2Parameters(fields);
  return Boolean(signature && signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)));
}

function v2ProviderError(fields, fallback) {
  const message = fields.err_code_des || fields.return_msg || fallback;
  return Object.assign(new Error(message || '微信支付请求失败'), {
    code: 'SHROOM_PAYMENT_FAILED', providerCode: fields.err_code || fields.return_code
  });
}

async function postV2Xml(path, fields, { mutualTls = false } = {}) {
  const pay = config.billing.wechatPay;
  const payload = {
    appid: pay.appId,
    mch_id: pay.mchId,
    nonce_str: nonce(),
    ...fields
  };
  payload.sign = signV2Parameters(payload);
  const body = flatXml(payload);
  const requestOptions = {
    method: 'POST',
    hostname: 'api.mch.weixin.qq.com',
    path,
    headers: { 'content-type': 'text/xml; charset=utf-8', 'content-length': Buffer.byteLength(body) },
    timeout: pay.timeoutMs,
    ...(mutualTls ? {
      cert: fs.readFileSync(configuredPath(pay.merchantCertPath, '微信商户API证书')),
      key: fs.readFileSync(configuredPath(pay.privateKeyPath, '微信商户私钥'))
    } : {})
  };
  const raw = await new Promise((resolve, reject) => {
    const request = https.request(requestOptions, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
    request.end(body);
  }).catch(cause => {
    throw Object.assign(new Error('连接微信支付超时或失败'), { code: 'SHROOM_PAYMENT_FAILED', cause });
  });
  const result = parseFlatXml(raw);
  if (result.return_code !== 'SUCCESS') throw v2ProviderError(result, '微信支付通信失败');
  if (!verifyV2Fields(result)) throw Object.assign(new Error('微信支付响应签名验证失败'), { code: 'SHROOM_PAYMENT_VERIFY' });
  if (result.result_code !== 'SUCCESS') throw v2ProviderError(result, '微信支付业务失败');
  return result;
}

function v2ShanghaiTime(value) {
  const shifted = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function v2SuccessTime(value) {
  const raw = String(value || '');
  if (!/^\d{14}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+08:00`;
}

function canonicalV2Payment(fields) {
  return {
    appid: String(fields.appid || ''),
    mchid: String(fields.mch_id || ''),
    out_trade_no: String(fields.out_trade_no || ''),
    transaction_id: String(fields.transaction_id || ''),
    trade_state: String(fields.trade_state || (fields.result_code === 'SUCCESS' ? 'SUCCESS' : '')),
    attach: String(fields.attach || ''),
    amount: { total: Number(fields.total_fee || 0), currency: String(fields.fee_type || 'CNY') },
    success_time: v2SuccessTime(fields.time_end)
  };
}

function canonicalV2Refund(fields, forcedStatus = '') {
  const index = '0';
  const providerStatus = forcedStatus || String(fields[`refund_status_${index}`] || 'PROCESSING');
  const status = ({ SUCCESS: 'SUCCESS', PROCESSING: 'PROCESSING', CHANGE: 'ABNORMAL', REFUNDCLOSE: 'CLOSED' })[providerStatus]
    || providerStatus;
  return {
    appid: String(fields.appid || ''),
    mchid: String(fields.mch_id || ''),
    out_trade_no: String(fields.out_trade_no || ''),
    out_refund_no: String(fields.out_refund_no || fields[`out_refund_no_${index}`] || ''),
    refund_id: String(fields.refund_id || fields[`refund_id_${index}`] || ''),
    status,
    amount: {
      refund: Number(fields.refund_fee || fields[`refund_fee_${index}`] || 0),
      total: Number(fields.total_fee || 0),
      currency: String(fields.refund_fee_type || fields[`refund_fee_type_${index}`] || fields.fee_type || 'CNY')
    }
  };
}

function parseV2Notification(rawBody) {
  const fields = parseFlatXml(rawBody);
  if (fields.return_code !== 'SUCCESS' || fields.result_code !== 'SUCCESS' || !verifyV2Fields(fields)) {
    throw Object.assign(new Error('微信支付回调签名验证失败'), { code: 'SHROOM_PAYMENT_VERIFY' });
  }
  return canonicalV2Payment({ ...fields, trade_state: 'SUCCESS' });
}

function v2NotificationResponse(success, message = '') {
  return flatXml({ return_code: success ? 'SUCCESS' : 'FAIL', return_msg: message || (success ? 'OK' : 'FAIL') });
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
  const pay = config.billing.wechatPay;
  if (input.clientPlatform !== 'H5') {
    throw Object.assign(new Error('当前客户端暂不支持充值'), { code: 'SHROOM_PAYMENT_PLATFORM' });
  }
  if (isV2Jsapi()) {
    if (!isPersonalWechatBrowser(input.userAgent)) {
      throw Object.assign(new Error('请在个人微信内打开菇日记完成充值'), { code: 'SHROOM_PAYMENT_PLATFORM' });
    }
    const payer = verifyPayerToken(input.payerToken, { userId: input.userId });
    const response = await postV2Xml('/pay/unifiedorder', {
      body: '菇日记-菇点充值',
      out_trade_no: order.outTradeNo,
      time_expire: v2ShanghaiTime(order.expiresAt),
      total_fee: order.amountCents,
      fee_type: 'CNY',
      spbill_create_ip: normalizedIp(input.payerIp),
      notify_url: pay.notifyUrl,
      trade_type: 'JSAPI',
      openid: payer.openid,
      attach: 'shroom_points'
    });
    const params = {
      appId: pay.appId,
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: nonce(),
      package: `prepay_id=${response.prepay_id}`,
      signType: 'MD5'
    };
    params.paySign = signV2Parameters(params);
    return {
      clientPlatform: 'H5',
      openidHash: crypto.createHash('sha256').update(payer.openid).digest('hex'),
      payment: { provider: 'WECHAT_PAY', mode: 'JSAPI', jsapiParams: params }
    };
  }
  if (isWechatBrowser(input.userAgent)) {
    throw Object.assign(new Error('微信内网页不能使用 H5 支付，请在系统浏览器打开'), {
      code: 'SHROOM_PAYMENT_PLATFORM'
    });
  }
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
  if (isV2Jsapi()) {
    const response = await postV2Xml('/pay/orderquery', { out_trade_no: outTradeNo });
    return canonicalV2Payment(response);
  }
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config.billing.wechatPay.mchId)}`;
  return payApi('GET', path);
}

async function closePayment(outTradeNo) {
  if (isV2Jsapi()) {
    const response = await postV2Xml('/pay/closeorder', { out_trade_no: outTradeNo });
    return { out_trade_no: outTradeNo, trade_state: response.result_code === 'SUCCESS' ? 'CLOSED' : '' };
  }
  return payApi('POST',
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`,
    { mchid: config.billing.wechatPay.mchId });
}

async function requestRefund(input) {
  if (isV2Jsapi()) {
    const response = await postV2Xml('/secapi/pay/refund', {
      out_trade_no: input.outTradeNo,
      out_refund_no: input.outRefundNo,
      total_fee: input.totalAmountCents,
      refund_fee: input.amountCents,
      refund_fee_type: 'CNY',
      refund_desc: utf8Slice(input.reason || '退回未消费菇点', 80)
    }, { mutualTls: true });
    return canonicalV2Refund(response, 'PROCESSING');
  }
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
  if (isV2Jsapi()) {
    const response = await postV2Xml('/pay/refundquery', { out_refund_no: outRefundNo });
    return canonicalV2Refund(response);
  }
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
  if (isV2Jsapi()) return parseV2Notification(rawBody);
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
  canonicalV2Payment,
  closePayment,
  createOAuthState,
  createPayerToken,
  createPayment,
  decryptNotification,
  exchangeOAuthCode,
  isPersonalWechatBrowser,
  isWechatBrowser,
  normalizedIp,
  oauthAuthorizationUrl,
  parseNotification,
  parseV2Notification,
  paymentChannelConfiguration,
  paymentConfiguration,
  queryPayment,
  queryRefund,
  requestRefund,
  rfc3339Shanghai,
  signV2Parameters,
  utf8Slice,
  verifyOAuthState,
  verifyPayerToken,
  v2NotificationResponse,
  verifyWechatSignature
};
