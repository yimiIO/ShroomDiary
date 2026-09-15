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
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
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

function percentageOf(numerator, denominator, decimals = 1) {
  const top = BigInt(String(numerator || '0'));
  const bottom = BigInt(String(denominator || '0'));
  if (bottom <= 0n) return null;
  const factor = 10n ** BigInt(decimals);
  const scaled = top * 100n * factor;
  const rounded = scaled >= 0n
    ? (scaled + bottom / 2n) / bottom
    : -((-scaled + bottom / 2n) / bottom);
  return Number(rounded) / Number(factor);
}

function holdingGroupSummary(rows, currencyTotalMinor) {
  const amountMinor = rows.reduce((sum, row) => sum + BigInt(row.payload.amountMinor), 0n);
  const knownCostRows = rows.filter(row => row.payload.costBasisMinor !== null && row.payload.costBasisMinor !== undefined);
  const costComplete = rows.length > 0 && knownCostRows.length === rows.length;
  const costBasisMinor = knownCostRows.reduce((sum, row) => sum + BigInt(row.payload.costBasisMinor), 0n);
  const pnlMinor = costComplete ? amountMinor - costBasisMinor : null;
  const dates = [...new Set(rows.map(row => row.valuedOn))];
  return {
    amount: minorToMoney(amountMinor.toString()),
    costBasis: costComplete ? minorToMoney(costBasisMinor.toString()) : null,
    pnl: pnlMinor === null ? null : minorToMoney(pnlMinor.toString()),
    pnlPercent: pnlMinor === null || costBasisMinor <= 0n ? null : percentageOf(pnlMinor, costBasisMinor, 2),
    pnlTone: pnlMinor === null ? 'neutral' : (pnlMinor < 0n ? 'negative' : (pnlMinor > 0n ? 'positive' : 'neutral')),
    costComplete,
    unknownCostCount: rows.length - knownCostRows.length,
    percent: currencyTotalMinor ? percentageOf(amountMinor, currencyTotalMinor, 1) : null,
    asOfDate: dates.sort().at(-1) || null,
    mixedDates: dates.length > 1,
    itemCount: rows.length
  };
}

function normalizedLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function recentActivitiesForHolding(item, records) {
  const channel = normalizedLabel(item.payload.channelLabel);
  const product = normalizedLabel(item.payload.productName);
  if (!channel || !product) return [];
  return confirmed(records)
    .filter(record => record.payload?.currency === item.currency &&
      normalizedLabel(record.payload.channelLabel) === channel &&
      normalizedLabel(record.payload.productName) === product)
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn) ||
      String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .slice(0, 3)
    .map(record => ({
      id: record.id,
      recordType: record.recordType,
      occurredOn: record.occurredOn,
      currency: record.payload.currency,
      amount: minorToMoney(record.payload.amountMinor),
      sharesPending: ['EXTERNAL_CONTRIBUTION', 'BUY'].includes(record.recordType) &&
        !String(record.payload.quantity || '').trim()
    }));
}

function holdingSummary(holdings = [], aliases = [], records = []) {
  const latestByKey = new Map();
  for (const item of holdings.filter(row => row.status === 'CONFIRMED')) {
    const key = item.holdingKey || item.id;
    const existing = latestByKey.get(key);
    if (!existing || item.valuedOn > existing.valuedOn ||
      (item.valuedOn === existing.valuedOn && String(item.createdAt) > String(existing.createdAt))) {
      latestByKey.set(key, item);
    }
  }

  const current = [...latestByKey.values()]
    .filter(item => BigInt(item.payload.amountMinor) > 0n)
    .map(item => {
      const labels = [item.payload.channelLabel, item.payload.productName]
        .filter(Boolean).map(value => value.trim().toLowerCase());
      const alias = aliases.find(mapping => {
        const appliesToRecord = !mapping.batchScope || mapping.batchScope === item.sourceRef;
        return appliesToRecord && labels.includes(String(mapping.sourceAlias || '').trim().toLowerCase());
      });
      if (!alias) return item;
      return {
        ...item,
        payload: {
          ...item.payload,
          productName: alias.productName || item.payload.productName,
          directionName: alias.directionName || item.payload.directionName,
          aliasApplied: alias.sourceAlias
        }
      };
    });

  const currencyTotals = new Map();
  for (const item of current) {
    currencyTotals.set(item.currency, (currencyTotals.get(item.currency) || 0n) + BigInt(item.payload.amountMinor));
  }

  const items = current.map(item => {
    const summary = holdingGroupSummary([item], currencyTotals.get(item.currency));
    return {
      ...item,
      ...summary,
      recentActivities: recentActivitiesForHolding(item, records),
      limitDeviation: item.payload.userMaxPercent !== null && item.payload.userMaxPercent !== undefined &&
        summary.percent !== null && summary.percent > item.payload.userMaxPercent
        ? Number((summary.percent - item.payload.userMaxPercent).toFixed(1))
        : null
    };
  });

  const directionMap = new Map();
  const productMap = new Map();
  const channelMap = new Map();
  for (const item of current) {
    const directionLabel = item.payload.directionName || '待分类';
    const directionKey = `${item.currency}:${directionLabel}`;
    const direction = directionMap.get(directionKey) || { currency: item.currency, label: directionLabel, rows: [], channels: new Set() };
    direction.rows.push(item);
    if (item.payload.channelLabel) direction.channels.add(item.payload.channelLabel);
    directionMap.set(directionKey, direction);

    const productLabel = item.payload.productName || '未识别产品';
    const productKey = `${item.currency}:${productLabel}`;
    const product = productMap.get(productKey) || {
      currency: item.currency,
      label: productLabel,
      directionName: item.payload.directionName || '',
      rows: [],
      channels: new Set(),
      shareClasses: new Set()
    };
    product.rows.push(item);
    if (item.payload.channelLabel) product.channels.add(item.payload.channelLabel);
    if (item.payload.shareClass) product.shareClasses.add(item.payload.shareClass);
    productMap.set(productKey, product);

    const channelLabel = item.payload.channelLabel || '未填渠道';
    const channelKey = `${item.currency}:${channelLabel}`;
    const channel = channelMap.get(channelKey) || { currency: item.currency, label: channelLabel, rows: [], products: new Set() };
    channel.rows.push(item);
    channel.products.add(productLabel);
    channelMap.set(channelKey, channel);
  }

  const directions = [...directionMap.entries()].map(([key, group]) => ({
    key,
    currency: group.currency,
    label: group.label,
    channelCount: group.channels.size,
    ...holdingGroupSummary(group.rows, currencyTotals.get(group.currency))
  })).sort((a, b) => Number(b.amount) - Number(a.amount));

  const products = [...productMap.entries()].map(([key, group]) => ({
    key,
    currency: group.currency,
    label: group.label,
    directionName: group.directionName,
    channels: [...group.channels],
    shareClasses: [...group.shareClasses],
    shareClassLabel: group.shareClasses.size ? ` · ${[...group.shareClasses].join(' / ')} 份额` : '',
    ...holdingGroupSummary(group.rows, currencyTotals.get(group.currency))
  })).sort((a, b) => Number(b.amount) - Number(a.amount));

  const channels = [...channelMap.entries()].map(([key, group]) => ({
    key,
    currency: group.currency,
    label: group.label,
    productCount: group.products.size,
    products: [...group.products],
    ...holdingGroupSummary(group.rows, currencyTotals.get(group.currency))
  })).sort((a, b) => Number(b.amount) - Number(a.amount));

  const totals = [...currencyTotals.entries()].map(([currency, amountMinor]) => ({
    currency,
    ...holdingGroupSummary(current.filter(item => item.currency === currency), amountMinor)
  }));
  const dates = [...new Set(items.map(item => item.valuedOn))].sort();
  return { items, totals, channels, products, directions, mixedDates: dates.length > 1, dates };
}

function currentPositionSummary(holdingData = {}, overview = {}) {
  const positions = (holdingData.totals || []).map(item => ({ ...item, source: 'HOLDINGS' }));
  const coveredCurrencies = new Set(positions.map(item => item.currency));
  for (const item of overview.currencies || []) {
    if (!item.latest || coveredCurrencies.has(item.currency)) continue;
    positions.push({
      currency: item.currency,
      amount: item.latest.amount,
      costBasis: null,
      pnl: item.investmentPnl,
      pnlPercent: null,
      pnlTone: item.investmentPnl === null
        ? 'neutral'
        : (String(item.investmentPnl).startsWith('-') ? 'negative' : (Number(item.investmentPnl) > 0 ? 'positive' : 'neutral')),
      costComplete: false,
      unknownCostCount: 0,
      asOfDate: item.latest.date,
      mixedDates: false,
      itemCount: 0,
      source: 'PLAN_TOTAL'
    });
  }
  return positions;
}

function moneyFromNumber(value) {
  const minor = Math.round(value * 100);
  if (!Number.isFinite(minor) || !Number.isSafeInteger(minor)) return null;
  return minorToMoney(String(minor));
}

function addCalendarYears(value, years) {
  const source = dateOnly(value);
  if (!source || !Number.isInteger(years)) return null;
  const date = new Date(`${source}T00:00:00.000Z`);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function remainingPeriods(fromDate, targetDate, periodsPerYear) {
  const from = dateOnly(fromDate);
  const target = dateOnly(targetDate);
  if (!from || !target || target <= from) return 0;
  const fromYear = Number(from.slice(0, 4));
  const fromMonth = Number(from.slice(5, 7));
  const fromDay = Number(from.slice(8, 10));
  const targetYear = Number(target.slice(0, 4));
  const targetMonth = Number(target.slice(5, 7));
  const targetDay = Number(target.slice(8, 10));
  const months = (targetYear - fromYear) * 12 + (targetMonth - fromMonth) + (targetDay > fromDay ? 1 : 0);
  return Math.max(0, Math.ceil(months / (12 / periodsPerYear)));
}

function financialPlanProjection({ profile = {}, rule = {}, currentPosition = null } = {}) {
  const currency = currencyCode(profile.baseCurrency || currentPosition?.currency || rule.fixedAmount?.currency);
  const years = Number(profile.targetYears);
  const rawAssumption = profile.assumedAnnualReturnPercent;
  const assumptionMissing = rawAssumption === null || rawAssumption === undefined || String(rawAssumption).trim() === '';
  const assumedAnnualReturnPercent = assumptionMissing ? null : Number(rawAssumption);
  const planStartedOn = dateOnly(profile.planStartedOn) || dateOnly(currentPosition?.asOfDate) || dateOnly(new Date());
  const targetDate = addCalendarYears(planStartedOn, years);
  const asOfDate = dateOnly(currentPosition?.asOfDate) || dateOnly(new Date());
  const base = {
    status: 'NOT_READY',
    currency,
    years: Number.isInteger(years) ? years : null,
    planStartedOn,
    targetDate,
    assumedAnnualReturnPercent,
    currentBalance: currentPosition?.amount || '0.00',
    currentAsOfDate: currentPosition?.asOfDate || null,
    frequency: rule.frequency || null,
    periodicContribution: rule.fixedAmount ? minorToMoney(rule.fixedAmount.amountMinor) : null,
    futureContributions: null,
    projectedBalance: null,
    projectedGrowth: null,
    disclaimer: '这是按用户填写的测算假设计算的数学情景，不是收益预测、投资建议或收益承诺。'
  };
  if (!Number.isInteger(years) || years < 1 || years > 60) return { ...base, status: 'MISSING_HORIZON' };
  if (assumptionMissing) return { ...base, status: 'MISSING_ASSUMPTION' };
  if (!Number.isFinite(assumedAnnualReturnPercent) || assumedAnnualReturnPercent < 0 || assumedAnnualReturnPercent > 100) {
    return { ...base, status: 'INVALID_ASSUMPTION' };
  }
  if (rule.contributionMethod !== 'FIXED' || !rule.fixedAmount) return { ...base, status: 'UNSUPPORTED_RULE' };
  if (!currency || rule.fixedAmount.currency !== currency || (currentPosition?.currency && currentPosition.currency !== currency)) {
    return { ...base, status: 'CURRENCY_MISMATCH' };
  }
  const periodsPerYear = { MONTHLY: 12, QUARTERLY: 4, YEARLY: 1 }[rule.frequency];
  if (!periodsPerYear) return { ...base, status: 'UNSUPPORTED_RULE' };
  const currentBalance = Number(currentPosition?.amount || 0);
  const periodicContribution = Number(rule.fixedAmount.amountMinor) / 100;
  if (!Number.isFinite(currentBalance) || currentBalance < 0 || !Number.isFinite(periodicContribution) || periodicContribution <= 0) {
    return { ...base, status: 'OUT_OF_RANGE' };
  }
  const periods = remainingPeriods(asOfDate, targetDate, periodsPerYear);
  if (periods === 0) return { ...base, status: 'HORIZON_REACHED', periods: 0, periodsPerYear };
  const annualRate = assumedAnnualReturnPercent / 100;
  const periodicRate = annualRate === 0 ? 0 : Math.pow(1 + annualRate, 1 / periodsPerYear) - 1;
  const growthFactor = Math.pow(1 + periodicRate, periods);
  const projectedCurrent = currentBalance * growthFactor;
  const projectedContributions = periodicRate === 0
    ? periodicContribution * periods
    : periodicContribution * ((growthFactor - 1) / periodicRate);
  const futureContributions = periodicContribution * periods;
  const projectedBalance = projectedCurrent + projectedContributions;
  const projectedGrowth = projectedBalance - currentBalance - futureContributions;
  const formatted = {
    currentBalance: moneyFromNumber(currentBalance),
    periodicContribution: moneyFromNumber(periodicContribution),
    futureContributions: moneyFromNumber(futureContributions),
    projectedBalance: moneyFromNumber(projectedBalance),
    projectedGrowth: moneyFromNumber(projectedGrowth)
  };
  if (Object.values(formatted).some(value => value === null)) return { ...base, status: 'OUT_OF_RANGE' };
  return { ...base, ...formatted, status: 'READY', periods, periodsPerYear };
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
  currentPositionSummary,
  currencyCode,
  dateOnly,
  financialPlanProjection,
  holdingSummary,
  minorToMoney,
  moneyPayload,
  moneyToMinor,
  stableFingerprint,
  xirr
};
