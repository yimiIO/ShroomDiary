'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  FEATURE_PRICE_POINT_CENTS,
  aiChargePointCents,
  commercialRollout,
  merchantStatus,
  pointCentsFromYuan,
  streakStatus
} = require('../src/billing-policy');

test('AI pricing keeps actual usage separate and targets a 2.5x service price', () => {
  assert.equal(aiChargePointCents(0, 2.5), 1);
  assert.equal(aiChargePointCents(0.24, 2.5), 60);
  assert.equal(aiChargePointCents(1, 2.5), 250);
  assert.equal(FEATURE_PRICE_POINT_CENTS, 1000);
});

test('AI pricing refuses to invent a charge when the provider model has no CNY price', () => {
  assert.equal(aiChargePointCents(null, 2.5), null);
  assert.equal(aiChargePointCents(undefined, 2.5), null);
});

test('recharge yuan maps one to one to point cents without floating point drift', () => {
  assert.equal(pointCentsFromYuan(10), 1000);
  assert.equal(pointCentsFromYuan('20.25'), 2025);
  assert.equal(pointCentsFromYuan('1.001'), null);
  assert.equal(pointCentsFromYuan(0), null);
});

test('seven distinct consecutive diary creation days qualify exactly once at seven days', () => {
  const six = streakStatus([
    '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'
  ], '2026-09-14');
  assert.equal(six.qualified, false);
  assert.equal(six.currentDays, 6);
  assert.equal(six.remainingDays, 1);

  const seven = streakStatus([
    '2026-09-08', '2026-09-09', '2026-09-09', '2026-09-10', '2026-09-11',
    '2026-09-12', '2026-09-13', '2026-09-14'
  ], '2026-09-14');
  assert.equal(seven.qualified, true);
  assert.equal(seven.currentDays, 7);
  assert.equal(seven.qualifyingStartDate, '2026-09-08');
  assert.equal(seven.qualifyingEndDate, '2026-09-14');
});

test('merchant cannot accept payment unless collection and invoice subjects match', () => {
  const base = {
    merchantLegalName: '甲公司',
    invoiceLegalName: '乙公司',
    merchantTaxId: '91440000TEST',
    merchantAddress: '广东省测试地址 1 号',
    customerService: '400-000-0000',
    icpQualification: '粤 ICP 备 TEST 号',
    appFilingNumber: '粤 ICP 备 TEST 号-1A',
    legalReviewConfirmed: true
  };
  assert.equal(merchantStatus(base).ready, false);
  assert.equal(merchantStatus({ ...base, invoiceLegalName: '甲公司' }).ready, true);
});

test('H5 merchant collection needs ICP qualification and legal review, not an unpublished app filing', () => {
  const base = {
    merchantLegalName: '甲公司',
    invoiceLegalName: '甲公司',
    merchantTaxId: '91440000TEST',
    merchantAddress: '广东省测试地址 1 号',
    customerService: '400-000-0000',
    icpQualification: '',
    appFilingNumber: '',
    legalReviewConfirmed: false
  };
  const status = merchantStatus(base);
  assert.equal(status.ready, false);
  assert.ok(status.missing.includes('BILLING_ICP_QUALIFICATION'));
  assert.equal(status.missing.includes('BILLING_APP_FILING_NUMBER'), false);
  assert.ok(status.missing.includes('BILLING_LEGAL_REVIEW_CONFIRMED'));

  const h5Ready = merchantStatus({
    ...base,
    icpQualification: '琼 ICP 证 TEST 号',
    legalReviewConfirmed: true
  });
  assert.equal(h5Ready.ready, true);
});

test('commercial rollout keeps H5 free before channel approval and names future app payment paths', () => {
  const freeBeta = commercialRollout('disabled', false);
  assert.equal(freeBeta.phase, 'FREE_BETA');
  assert.equal(freeBeta.chargingLive, false);
  assert.equal(freeBeta.channels.find(item => item.key === 'H5').status, 'FREE_BETA');
  assert.equal(freeBeta.channels.find(item => item.key === 'MP_WEIXIN').statusLabel, '待接入虚拟支付');
  assert.equal(freeBeta.channels.find(item => item.key === 'APP').statusLabel, '待接入应用商店内购');

  const reviewing = commercialRollout('live', false);
  assert.equal(reviewing.phase, 'COMPLIANCE_REVIEW');
  assert.equal(reviewing.chargingLive, false);

  const partialLive = commercialRollout('live', true);
  assert.equal(partialLive.phase, 'PARTIAL_LIVE');
  assert.equal(partialLive.chargingLive, true);
});
