#!/usr/bin/env node
'use strict';

const config = require('../src/config');
const { paymentConfiguration } = require('../src/wechat-pay');

const status = paymentConfiguration();
const result = {
  ok: status.live,
  billingMode: config.billing.mode,
  merchantLabel: config.billing.merchantLabel,
  merchantLegalName: config.billing.merchantLegalName || '',
  subjectConsistent: status.subjectConsistent,
  legalAndQualificationReady: status.legalReady,
  providerReady: status.providerReady,
  verificationMode: status.verificationMode,
  channels: Object.fromEntries(Object.entries(status.channels).map(([key, channel]) => [key, {
    ready: channel.ready,
    live: channel.live,
    reason: channel.reason,
    missing: channel.missing
  }]))
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
