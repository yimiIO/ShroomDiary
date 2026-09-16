#!/usr/bin/env node
'use strict';

const db = require('../src/db');
const { processRefundRequest, rejectRefundRequest } = require('../src/billing-refunds');

async function main() {
  const requestId = String(process.argv[2] || '').trim();
  const action = String(process.argv[3] || 'process').trim();
  const actor = String(process.argv[4] || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new Error('Usage: npm run billing:refund -- <uuid> process <operator> OR <uuid> reject <operator> <note>');
  }
  if (action === 'reject') {
    const note = process.argv.slice(5).join(' ').trim();
    if (!note) throw new Error('Rejecting a refund requires a review note');
    const result = await rejectRefundRequest(requestId, actor, note);
    console.log(JSON.stringify({ ok: true, request: result }));
    return;
  }
  if (action !== 'process') throw new Error('Action must be process or reject');
  const result = await processRefundRequest(requestId, actor);
  console.log(JSON.stringify({ ok: true, request: result }));
}

main()
  .catch(error => {
    console.error(JSON.stringify({ ok: false, code: error.code || '', message: error.message }));
    process.exitCode = 1;
  })
  .finally(() => db.close());
