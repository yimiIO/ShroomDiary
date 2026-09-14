'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateOverview,
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
