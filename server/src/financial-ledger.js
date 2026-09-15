'use strict';
/* global BigInt */

const crypto = require('node:crypto');

const MONEY_SCALE = 2;
const RECORD_TYPES = Object.freeze([
  'EXTERNAL_CONTRIBUTION',
  'EXTERNAL_WITHDRAWAL',
  'INTERNAL_TRANSFER',
  'BUY',
  'SELL',
  'DIVIDEND',
  'INTEREST',
  'RETURN_REINVESTMENT',
  'FEE',
  'TAX',
  'EXISTING_ASSET_INCLUSION',
  'UNCERTAIN'
]);
const RECORD_STATUSES = Object.freeze(['DRAFT', 'CONFIRMED', 'SUPERSEDED', 'VOID']);

function dateOnly(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const date = new Date(`${match[0]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[0] ? null : match[0];
}

function currencyCode(value, fallback = 'CNY') {
  const code = String(value || fallback).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function moneyToMinor(value, options = {}) {
  const source = String(value ?? '').trim().replace(/,/g, '');
  const match = source.match(/^(\d{1,15})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const minor = BigInt(match[1]) * 100n + BigInt(String(match[2] || '').padEnd(2, '0'));
  return minor > 0n || (options.allowZero === true && minor === 0n) ? minor.toString() : null;
}

function minorToMoney(value) {
  let minor;
  try {
    minor = BigInt(String(value || '0'));
  } catch (_) {
    minor = 0n;
  }
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const major = absolute / 100n;
  const decimals = String(absolute % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${major}.${decimals}`;
}

function addMinor(left, right) {
  return (BigInt(String(left || '0')) + BigInt(String(right || '0'))).toString();
}

function subtractMinor(left, right) {
  return (BigInt(String(left || '0')) - BigInt(String(right || '0'))).toString();
}

function moneyPayload(input, options = {}) {
  const amountMinor = moneyToMinor(input.amount, options);
  const currency = currencyCode(input.currency);
  if (!amountMinor || !currency) return null;
  return {
    amountMinor,
    currency,
    sourceCategory: String(input.sourceCategory || '').trim().slice(0, 80),
    channelLabel: String(input.channelLabel || '').trim().slice(0, 120),
    productName: String(input.productName || '').trim().slice(0, 160),
    directionName: String(input.directionName || '').trim().slice(0, 160),
    note: String(input.note || '').trim().slice(0, 1200),
    paidOutsidePlan: input.paidOutsidePlan === true
  };
}

function stableFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function confirmed(rows) {
  return rows.filter(row => row.status === 'CONFIRMED');
}

function groupByCurrency(rows) {
  return rows.reduce((groups, row) => {
    const currency = row.payload?.currency;
    if (!currency) return groups;
    if (!groups[currency]) groups[currency] = [];
    groups[currency].push(row);
    return groups;
  }, {});
}

function xirr(cashflows) {
  const rows = cashflows
    .map(item => ({ date: dateOnly(item.date), amount: Number(item.amount) }))
    .filter(item => item.date && Number.isFinite(item.amount) && item.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2 || !rows.some(item => item.amount > 0) || !rows.some(item => item.amount < 0)) return null;
  let signChanges = 0;
  for (let index = 1; index < rows.length; index += 1) {
    if (Math.sign(rows[index - 1].amount) !== Math.sign(rows[index].amount)) signChanges += 1;
  }
  if (signChanges !== 1) return null;
  const first = Date.parse(`${rows[0].date}T00:00:00.000Z`);
  const npv = rate => rows.reduce((sum, item) => {
    const years = (Date.parse(`${item.date}T00:00:00.000Z`) - first) / 31557600000;
    return sum + item.amount / Math.pow(1 + rate, years);
  }, 0);
  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low);
  let highValue = npv(high);
  while (lowValue * highValue > 0 && high < 1000000) {
    high *= 10;
    highValue = npv(high);
  }
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return null;
  for (let index = 0; index < 160; index += 1) {
    const middle = (low + high) / 2;
    const value = npv(middle);
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) < 1e-7) return middle;
    if (lowValue * value <= 0) {
      high = middle;
      highValue = value;
    } else {
      low = middle;
      lowValue = value;
    }
  }
  return (low + high) / 2;
}

function calculateCurrencyOverview({ currency, records = [], snapshots = [], pendingCount = 0 }) {
  const ledger = confirmed(records).filter(row => row.payload?.currency === currency);
  const totals = confirmed(snapshots)
    .filter(row => row.snapshotKind === 'PLAN_TOTAL' && row.payload?.currency === currency)
    .sort((a, b) => a.valuedOn.localeCompare(b.valuedOn) || a.createdAt.localeCompare(b.createdAt));
  const opening = totals[0] || null;
  const latest = totals[totals.length - 1] || null;
  let contributions = '0';
  let withdrawals = '0';
  let outsideFees = '0';
  for (const row of ledger) {
    // A plan-total snapshot is treated as the end-of-day value. Events on the
    // opening date are already represented by that snapshot; events through
    // the closing date are part of the measured period.
    if (!opening || !latest || row.occurredOn <= opening.valuedOn || row.occurredOn > latest.valuedOn) continue;
    if (['EXTERNAL_CONTRIBUTION', 'EXISTING_ASSET_INCLUSION'].includes(row.recordType)) {
      contributions = addMinor(contributions, row.payload.amountMinor);
    }
    if (row.recordType === 'EXTERNAL_WITHDRAWAL') withdrawals = addMinor(withdrawals, row.payload.amountMinor);
    if (['FEE', 'TAX'].includes(row.recordType) && row.payload.paidOutsidePlan) outsideFees = addMinor(outsideFees, row.payload.amountMinor);
  }
  const netContribution = subtractMinor(contributions, withdrawals);
  let investmentPnl = null;
  let annualizedReturn = null;
  if (opening && latest && latest.valuedOn > opening.valuedOn) {
    investmentPnl = subtractMinor(
      addMinor(subtractMinor(latest.payload.amountMinor, opening.payload.amountMinor), withdrawals),
      addMinor(contributions, outsideFees)
    );
    if (latest.valuedOn > opening.valuedOn) {
      const cashflows = [{ date: opening.valuedOn, amount: -Number(opening.payload.amountMinor) / 100 }];
      for (const row of ledger) {
        if (row.occurredOn <= opening.valuedOn || row.occurredOn > latest.valuedOn) continue;
        const amount = Number(row.payload.amountMinor) / 100;
        if (['EXTERNAL_CONTRIBUTION', 'EXISTING_ASSET_INCLUSION'].includes(row.recordType)) cashflows.push({ date: row.occurredOn, amount: -amount });
        if (row.recordType === 'EXTERNAL_WITHDRAWAL') cashflows.push({ date: row.occurredOn, amount });
        if (['FEE', 'TAX'].includes(row.recordType) && row.payload.paidOutsidePlan) cashflows.push({ date: row.occurredOn, amount: -amount });
      }
      cashflows.push({ date: latest.valuedOn, amount: Number(latest.payload.amountMinor) / 100 });
      annualizedReturn = xirr(cashflows);
    }
  }
  const missing = [];
	if (!opening) missing.push('还没有记录开始时的总金额');
	if (!latest || latest === opening) missing.push('还需要记录另一天的总金额');
  if (pendingCount) missing.push(`有 ${pendingCount} 项待核对记录`);
  return {
    currency,
    opening: opening ? { amount: minorToMoney(opening.payload.amountMinor), date: opening.valuedOn } : null,
    latest: latest ? { amount: minorToMoney(latest.payload.amountMinor), date: latest.valuedOn } : null,
    contributions: minorToMoney(contributions),
    withdrawals: minorToMoney(withdrawals),
    netContribution: minorToMoney(netContribution),
    outsideFees: minorToMoney(outsideFees),
    investmentPnl: investmentPnl === null ? null : minorToMoney(investmentPnl),
    investmentPnlTone: investmentPnl === null ? 'neutral' : (BigInt(investmentPnl) > 0n ? 'positive' : (BigInt(investmentPnl) < 0n ? 'negative' : 'neutral')),
    annualizedReturn: annualizedReturn === null ? null : Number((annualizedReturn * 100).toFixed(2)),
    annualizedShortPeriod: Boolean(opening && latest && (Date.parse(latest.valuedOn) - Date.parse(opening.valuedOn)) < 31557600000),
    missing
  };
}

function calculateOverview({ records = [], snapshots = [], holdings = [] }) {
  const pendingCount = records.filter(row => row.status === 'DRAFT').length +
    snapshots.filter(row => row.status === 'DRAFT').length +
    holdings.filter(row => row.status === 'DRAFT').length;
  const currencies = new Set([
    ...Object.keys(groupByCurrency(confirmed(records))),
    ...Object.keys(groupByCurrency(confirmed(snapshots))),
    ...Object.keys(groupByCurrency(confirmed(holdings)))
  ]);
  const summaries = [...currencies].sort().map(currency => calculateCurrencyOverview({
    currency, records, snapshots, pendingCount
  }));
  const latestDate = confirmed(snapshots).reduce((latest, row) => row.valuedOn > latest ? row.valuedOn : latest, '');
  return {
    asOfDate: latestDate || null,
    pendingCount,
    currencies: summaries,
    canCalculate: summaries.some(item => item.investmentPnl !== null),
    coverageStatus: !summaries.length ? 'NOT_STARTED' : (summaries.some(item => item.missing.length) ? 'INCOMPLETE' : 'READY')
  };
}

module.exports = {
  MONEY_SCALE,
  RECORD_STATUSES,
  RECORD_TYPES,
  calculateOverview,
  currencyCode,
  dateOnly,
  minorToMoney,
  moneyPayload,
  moneyToMinor,
  stableFingerprint,
  xirr
};
