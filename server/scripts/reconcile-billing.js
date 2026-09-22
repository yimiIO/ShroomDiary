#!/usr/bin/env node
'use strict';

const db = require('../src/db');
const { reconcilePaymentOrder } = require('../src/billing-payments');
const { processRefundRequest } = require('../src/billing-refunds');
const { paymentConfiguration } = require('../src/wechat-pay');

async function main() {
  const status = paymentConfiguration();
  if (!status.providerReady) throw Object.assign(new Error('微信支付凭据尚未通过运行时检查'), {
    code: 'SHROOM_PAYMENT_CONFIG'
  });
  const payments = await db.query(
    `SELECT id FROM billing_payment_orders WHERE status = 'PREPAY'
       AND expires_at > now() - interval '2 hours'
      ORDER BY created_at LIMIT 100`
  );
  const refunds = await db.query(
    `SELECT id FROM billing_refund_requests WHERE status = 'PROCESSING'
      ORDER BY updated_at LIMIT 100`
  );
  const report = { paymentChecked: 0, paymentErrors: 0, refundChecked: 0, refundErrors: 0 };
  for (const row of payments.rows) {
    try { await reconcilePaymentOrder(row.id); report.paymentChecked += 1; }
    catch (error) {
      report.paymentErrors += 1;
      console.error(JSON.stringify({ type: 'payment', id: row.id, code: error.code || '', message: error.message }));
    }
  }
  for (const row of refunds.rows) {
    try { await processRefundRequest(row.id); report.refundChecked += 1; }
    catch (error) {
      report.refundErrors += 1;
      console.error(JSON.stringify({ type: 'refund', id: row.id, code: error.code || '', message: error.message }));
    }
  }
  console.log(JSON.stringify({ ok: report.paymentErrors === 0 && report.refundErrors === 0, ...report }));
  if (report.paymentErrors || report.refundErrors) process.exitCode = 1;
}

main()
  .catch(error => {
    console.error(JSON.stringify({ ok: false, code: error.code || '', message: error.message }));
    process.exitCode = 1;
  })
  .finally(() => db.close());
