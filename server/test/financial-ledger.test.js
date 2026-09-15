'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateOverview,
  holdingSummary,
  minorToMoney,
  moneyPayload,
  moneyToMinor,
  xirr
} = require('../src/financial-ledger');

function snapshot(date, amount, status = 'CONFIRMED', currency = 'CNY') {
  return { snapshotKind: 'PLAN_TOTAL', valuedOn: date, status, createdAt: `${date}T00:00:00Z`, payload: { amountMinor: moneyToMinor(amount), currency } };
}

function record(type, date, amount, options = {}) {
  return { recordType: type, occurredOn: date, status: options.status || 'CONFIRMED', payload: { amountMinor: moneyToMinor(amount), currency: options.currency || 'CNY', paidOutsidePlan: options.paidOutsidePlan === true } };
}

function holding(key, date, amount, costBasis, options = {}) {
  return {
    id: `${key}-${date}`,
    holdingKey: key,
    valuedOn: date,
    createdAt: `${date}T08:00:00Z`,
    currency: options.currency || 'CNY',
    status: options.status || 'CONFIRMED',
    classificationStatus: 'USER_ENTERED',
    sourceRef: '',
    payload: {
      amountMinor: moneyToMinor(amount, { allowZero: true }),
      costBasisMinor: costBasis === null ? null : moneyToMinor(costBasis, { allowZero: true }),
      currency: options.currency || 'CNY',
      channelLabel: options.channel || '支付宝',
      productName: options.product || '恒生科技',
      directionName: options.direction || '恒生科技指数',
      shareClass: options.shareClass || 'C',
      userMaxPercent: null
    }
  };
}

test('money is normalized to integer minor units without float arithmetic', () => {
  assert.equal(moneyToMinor('86,470.25'), '8647025');
  assert.equal(minorToMoney('-500000'), '-5000.00');
  assert.equal(moneyToMinor('0'), null);
  assert.equal(moneyToMinor('1.234'), null);
  assert.deepEqual(moneyPayload({ amount: '100', currency: 'cny' }).currency, 'CNY');
});

test('investment result separates contributions from balance change', () => {
  const result = calculateOverview({
    snapshots: [snapshot('2026-01-01', '100000'), snapshot('2026-06-01', '105000')],
    records: [record('EXTERNAL_CONTRIBUTION', '2026-03-01', '10000')]
  });
  assert.equal(result.currencies[0].netContribution, '10000.00');
  assert.equal(result.currencies[0].investmentPnl, '-5000.00');
});

test('one snapshot is a baseline, not zero investment profit', () => {
  const result = calculateOverview({ snapshots: [snapshot('2026-01-01', '100000')] });
  assert.equal(result.canCalculate, false);
  assert.equal(result.currencies[0].investmentPnl, null);
});

test('assets added after the baseline are external flow, not investment profit', () => {
  const result = calculateOverview({
    snapshots: [snapshot('2026-01-01', '100000'), snapshot('2026-06-01', '125000')],
    records: [record('EXISTING_ASSET_INCLUSION', '2026-03-01', '20000')]
  });
  assert.equal(result.currencies[0].netContribution, '20000.00');
  assert.equal(result.currencies[0].investmentPnl, '5000.00');
});

test('opening-day flow is not double-counted because snapshots are end-of-day values', () => {
  const result = calculateOverview({
    snapshots: [snapshot('2026-01-01', '100000'), snapshot('2026-06-01', '105000')],
    records: [record('EXTERNAL_CONTRIBUTION', '2026-01-01', '10000')]
  });
  assert.equal(result.currencies[0].netContribution, '0.00');
  assert.equal(result.currencies[0].investmentPnl, '5000.00');
});

test('zero is accepted for snapshots and holdings but not cash-flow events', () => {
  assert.equal(moneyToMinor('0', { allowZero: true }), '0');
  assert.equal(moneyToMinor('0'), null);
  assert.equal(moneyPayload({ amount: '0', currency: 'CNY' }, { allowZero: true }).amountMinor, '0');
});

test('internal transfers, buys and reinvested distributions do not increase external principal', () => {
  const result = calculateOverview({
    snapshots: [snapshot('2026-01-01', '100000'), snapshot('2026-06-01', '111000')],
    records: [
      record('EXTERNAL_CONTRIBUTION', '2026-02-01', '10000'),
      record('INTERNAL_TRANSFER', '2026-02-02', '20000'),
      record('BUY', '2026-02-03', '10000'),
      record('DIVIDEND', '2026-04-01', '1000'),
      record('RETURN_REINVESTMENT', '2026-04-02', '1000')
    ]
  });
  assert.equal(result.currencies[0].netContribution, '10000.00');
  assert.equal(result.currencies[0].investmentPnl, '1000.00');
});

test('pending and multi-currency records remain visible without false aggregation', () => {
  const result = calculateOverview({
    snapshots: [snapshot('2026-01-01', '100000'), snapshot('2026-02-01', '101000'), snapshot('2026-02-01', '5000', 'CONFIRMED', 'USD')],
    records: [record('UNCERTAIN', '2026-02-01', '9000', { status: 'DRAFT' })]
  });
  assert.equal(result.pendingCount, 1);
  assert.deepEqual(result.currencies.map(item => item.currency), ['CNY', 'USD']);
  assert.equal(result.currencies[1].investmentPnl, null);
});

test('holding summary uses only the latest snapshot for each channel and product', () => {
  const result = holdingSummary([
    holding('alipay-hstech', '2026-09-15', '167294.35', '197000'),
    holding('alipay-hstech', '2026-09-16', '250294.35', '280000'),
    holding('mky-hstech', '2026-09-15', '81057', '88000', { channel: 'mky' })
  ]);
  assert.equal(result.items.length, 2);
  assert.equal(result.totals[0].amount, '331351.35');
  assert.equal(result.totals[0].costBasis, '368000.00');
  assert.equal(result.totals[0].pnl, '-36648.65');
  assert.equal(result.channels.find(item => item.label === '支付宝').amount, '250294.35');
  assert.equal(result.products[0].amount, '331351.35');
  assert.deepEqual(result.dates, ['2026-09-15', '2026-09-16']);
});

test('holding profit stays unavailable when any current cost basis is missing', () => {
  const result = holdingSummary([
    holding('known', '2026-09-16', '100', '90'),
    holding('unknown', '2026-09-16', '50', null, { channel: '代持', product: '未知成本产品' })
  ]);
  assert.equal(result.totals[0].amount, '150.00');
  assert.equal(result.totals[0].costBasis, null);
  assert.equal(result.totals[0].pnl, null);
  assert.equal(result.totals[0].unknownCostCount, 1);
  assert.equal(result.channels.find(item => item.label === '支付宝').pnl, '10.00');
});

test('xirr is only returned for a solvable one-sign-change cash flow', () => {
  const rate = xirr([
    { date: '2025-01-01', amount: -100 },
    { date: '2026-01-01', amount: 110 }
  ]);
  assert.ok(Math.abs(rate - 0.1) < 0.001);
  assert.equal(xirr([{ date: '2026-01-01', amount: -100 }]), null);
  assert.equal(xirr([
    { date: '2024-01-01', amount: -100 },
    { date: '2025-01-01', amount: 230 },
    { date: '2026-01-01', amount: -132 }
  ]), null);
});
