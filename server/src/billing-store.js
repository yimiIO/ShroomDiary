'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { featureAccessForUser } = require('./feature-access');
const {
  FEATURES,
  FEATURE_PRICE_POINT_CENTS,
  LEGAL_VERSION,
  SEVEN_DAY_CAMPAIGN_KEY,
  SEVEN_DAY_REWARD_POINT_CENTS,
  aiChargePointCents,
  commercialRollout,
  points,
  streakStatus
} = require('./billing-policy');
const { paymentConfiguration } = require('./wechat-pay');

function billingEnabled() {
  return config.billing.mode !== 'disabled';
}

async function ensureWallet(queryable, userId) {
  await queryable.query(
    'INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
}

function mapWallet(row = {}) {
  const paidPointCents = Number(row.paid_balance_cents || 0);
  const rewardPointCents = Number(row.reward_balance_cents || 0);
  const refundReservedPointCents = Math.min(
    paidPointCents,
    Math.max(0, Number(row.refund_reserved_cents || 0))
  );
  const spendablePaidPointCents = paidPointCents - refundReservedPointCents;
  return {
    paidPointCents,
    rewardPointCents,
    refundReservedPointCents,
    spendablePaidPointCents,
    availablePointCents: spendablePaidPointCents + rewardPointCents,
    paidPoints: points(paidPointCents),
    rewardPoints: points(rewardPointCents),
    refundReservedPoints: points(refundReservedPointCents),
    spendablePaidPoints: points(spendablePaidPointCents),
    availablePoints: points(spendablePaidPointCents + rewardPointCents)
  };
}

async function lockedWallet(queryable, userId) {
  await ensureWallet(queryable, userId);
  const result = await queryable.query('SELECT * FROM wallet_accounts WHERE user_id = $1 FOR UPDATE', [userId]);
  return result.rows[0];
}

async function insertLedger(queryable, input, balances) {
  const id = crypto.randomUUID();
  const result = await queryable.query(
    `INSERT INTO wallet_ledger
      (id, user_id, event_type, paid_delta_cents, reward_delta_cents,
       paid_balance_cents, reward_balance_cents, reference_type, reference_id,
       idempotency_key, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`,
    [
      id, input.userId, input.eventType, input.paidDeltaCents || 0, input.rewardDeltaCents || 0,
      balances.paid, balances.reward, input.referenceType || '',
      String(input.referenceId || '').slice(0, 160), input.idempotencyKey,
      String(input.description || '').slice(0, 240), JSON.stringify(input.metadata || {})
    ]
  );
  return result.rows[0] || null;
}

async function creditWallet(queryable, input) {
  const amount = Math.max(0, Math.round(Number(input.amountPointCents || 0)));
  if (!amount) throw Object.assign(new Error('入账金额必须大于 0'), { code: 'SHROOM_BILLING_INPUT' });
  const existing = await queryable.query(
    'SELECT * FROM wallet_ledger WHERE user_id = $1 AND idempotency_key = $2',
    [input.userId, input.idempotencyKey]
  );
  if (existing.rowCount) return {
    ledger: existing.rows[0],
    creditedPointCents: Number(existing.rows[0].metadata?.creditedPointCents || 0),
    idempotent: true
  };
  const wallet = await lockedWallet(queryable, input.userId);
  const afterLock = await queryable.query(
    'SELECT * FROM wallet_ledger WHERE user_id = $1 AND idempotency_key = $2',
    [input.userId, input.idempotencyKey]
  );
  if (afterLock.rowCount) return {
    ledger: afterLock.rows[0],
    creditedPointCents: Number(afterLock.rows[0].metadata?.creditedPointCents || 0),
    idempotent: true
  };
  const credited = amount;
  const bucket = input.bucket === 'reward' ? 'reward' : 'paid';
  const paid = Number(wallet.paid_balance_cents || 0) + (bucket === 'paid' ? credited : 0);
  const reward = Number(wallet.reward_balance_cents || 0) + (bucket === 'reward' ? credited : 0);
  const paidDelta = bucket === 'paid' ? credited : 0;
  const rewardDelta = bucket === 'reward' ? credited : 0;
  await queryable.query(
    `UPDATE wallet_accounts SET paid_balance_cents = $2, reward_balance_cents = $3,
       lifetime_paid_cents = lifetime_paid_cents + $4,
       lifetime_reward_cents = lifetime_reward_cents + $5, updated_at = now() WHERE user_id = $1`,
    [input.userId, paid, reward, bucket === 'paid' ? amount : 0, bucket === 'reward' ? amount : 0]
  );
  const ledger = await insertLedger(queryable, {
    ...input,
    paidDeltaCents: paidDelta,
    rewardDeltaCents: rewardDelta,
    metadata: {
      ...(input.metadata || {}),
      grossPointCents: amount,
      creditedPointCents: credited
    }
  }, { paid, reward });
  return { ledger, creditedPointCents: credited, idempotent: false };
}

async function consumePaidFundingLots(queryable, userId, amountPointCents) {
  let remaining = amountPointCents;
  if (!remaining) return;
  const reservedResult = await queryable.query(
    `SELECT COALESCE(sum(requested_point_cents), 0)::int AS total
       FROM billing_refund_requests
      WHERE user_id = $1 AND status IN ('REQUESTED', 'PROCESSING')`,
    [userId]
  );
  let reserved = Number(reservedResult.rows[0]?.total || 0);
  const lots = await queryable.query(
    `SELECT id, refundable_point_cents FROM billing_payment_orders
      WHERE user_id = $1 AND status IN ('PAID', 'PARTIAL_REFUND') AND refundable_point_cents > 0
      ORDER BY paid_at, created_at FOR UPDATE`,
    [userId]
  );
  for (const lot of lots.rows) {
    if (!remaining) break;
    const lotBalance = Number(lot.refundable_point_cents || 0);
    const protectedForRefund = Math.min(lotBalance, reserved);
    reserved -= protectedForRefund;
    const used = Math.min(lotBalance - protectedForRefund, remaining);
    if (!used) continue;
    await queryable.query(
      'UPDATE billing_payment_orders SET refundable_point_cents = refundable_point_cents - $2, updated_at = now() WHERE id = $1',
      [lot.id, used]
    );
    remaining -= used;
  }
  if (remaining) {
    throw Object.assign(new Error('充值余额与原支付订单无法完整核对'), {
      code: 'SHROOM_BILLING_LEDGER'
    });
  }
}

async function debitWallet(queryable, input) {
  const amount = Math.max(0, Math.round(Number(input.amountPointCents || 0)));
  if (!amount) throw Object.assign(new Error('扣款金额必须大于 0'), { code: 'SHROOM_BILLING_INPUT' });
  const existing = await queryable.query(
    'SELECT * FROM wallet_ledger WHERE user_id = $1 AND idempotency_key = $2',
    [input.userId, input.idempotencyKey]
  );
  if (existing.rowCount) return { ledger: existing.rows[0], idempotent: true };
  const wallet = await lockedWallet(queryable, input.userId);
  const afterLock = await queryable.query(
    'SELECT * FROM wallet_ledger WHERE user_id = $1 AND idempotency_key = $2',
    [input.userId, input.idempotencyKey]
  );
  if (afterLock.rowCount) return { ledger: afterLock.rows[0], idempotent: true };
  const reservedResult = await queryable.query(
    `SELECT COALESCE(sum(requested_point_cents), 0)::int AS total
       FROM billing_refund_requests
      WHERE user_id = $1 AND status IN ('REQUESTED', 'PROCESSING')`,
    [input.userId]
  );
  const refundReserved = Math.min(
    Number(wallet.paid_balance_cents || 0),
    Number(reservedResult.rows[0]?.total || 0)
  );
  const spendablePaid = Number(wallet.paid_balance_cents || 0) - refundReserved;
  const available = spendablePaid + Number(wallet.reward_balance_cents || 0);
  if (available < amount) {
    throw Object.assign(new Error('菇点不足'), {
      code: 'SHROOM_BALANCE_INSUFFICIENT',
      data: {
        requiredPointCents: amount,
        availablePointCents: available,
        missingPointCents: amount - available,
        requiredPoints: points(amount),
        availablePoints: points(available),
        missingPoints: points(amount - available)
      }
    });
  }
  const rewardUsed = Math.min(Number(wallet.reward_balance_cents || 0), amount);
  const paidNeeded = amount - rewardUsed;
  const paidUsed = Math.min(spendablePaid, paidNeeded);
  const paid = Number(wallet.paid_balance_cents || 0) - paidUsed;
  const reward = Number(wallet.reward_balance_cents || 0) - rewardUsed;
  await consumePaidFundingLots(queryable, input.userId, paidUsed);
  await queryable.query(
    `UPDATE wallet_accounts SET paid_balance_cents = $2, reward_balance_cents = $3,
       lifetime_spent_cents = lifetime_spent_cents + $4, updated_at = now() WHERE user_id = $1`,
    [input.userId, paid, reward, amount]
  );
  const ledger = await insertLedger(queryable, {
    ...input,
    paidDeltaCents: -paidUsed,
    rewardDeltaCents: -rewardUsed,
    metadata: { ...(input.metadata || {}), paidUsedPointCents: paidUsed, rewardUsedPointCents: rewardUsed }
  }, { paid, reward });
  return { ledger, paidUsedPointCents: paidUsed, rewardUsedPointCents: rewardUsed };
}

async function refundPaidBalance(queryable, input) {
  const amount = Math.max(0, Math.round(Number(input.amountPointCents || 0)));
  if (!amount) throw Object.assign(new Error('退款金额必须大于 0'), { code: 'SHROOM_BILLING_INPUT' });
  const idempotencyKey = `refund-item:${input.refundItemId}`;
  const existing = await queryable.query(
    'SELECT * FROM wallet_ledger WHERE user_id = $1 AND idempotency_key = $2',
    [input.userId, idempotencyKey]
  );
  if (existing.rowCount) return { ledger: existing.rows[0], idempotent: true };
  const wallet = await lockedWallet(queryable, input.userId);
  const orderResult = await queryable.query(
    'SELECT * FROM billing_payment_orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
    [input.paymentOrderId, input.userId]
  );
  const order = orderResult.rows[0];
  if (!order || Number(order.refundable_point_cents || 0) < amount
    || Number(wallet.paid_balance_cents || 0) < amount) {
    throw Object.assign(new Error('退款账务余额与原支付订单不一致，需要人工核验'), {
      code: 'SHROOM_BILLING_LEDGER'
    });
  }
  const paid = Number(wallet.paid_balance_cents || 0) - amount;
  const reward = Number(wallet.reward_balance_cents || 0);
  await queryable.query(
    `UPDATE wallet_accounts SET paid_balance_cents = $2,
       lifetime_refunded_cents = lifetime_refunded_cents + $3, updated_at = now()
     WHERE user_id = $1`,
    [input.userId, paid, amount]
  );
  const refunded = Number(order.refunded_point_cents || 0) + amount;
  await queryable.query(
    `UPDATE billing_payment_orders SET refundable_point_cents = refundable_point_cents - $2,
       refunded_point_cents = refunded_point_cents + $2,
       status = CASE WHEN $3 >= point_cents THEN 'REFUNDED' ELSE 'PARTIAL_REFUND' END,
       updated_at = now() WHERE id = $1`,
    [input.paymentOrderId, amount, refunded]
  );
  const ledger = await insertLedger(queryable, {
    userId: input.userId,
    eventType: 'REFUND',
    paidDeltaCents: -amount,
    referenceType: 'REFUND_REQUEST',
    referenceId: input.refundRequestId,
    idempotencyKey,
    description: '退回未消费充值余额',
    metadata: {
      refundItemId: input.refundItemId,
      paymentOrderId: input.paymentOrderId,
      providerRefundId: input.providerRefundId || ''
    }
  }, { paid, reward });
  return { ledger, idempotent: false };
}

async function activityStatus(queryable, userId) {
  const result = await queryable.query(
    `SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS diary_date
       FROM diaries WHERE user_id = $1 AND deleted_at IS NULL
       GROUP BY 1 ORDER BY 1`,
    [userId]
  );
  const todayResult = await queryable.query(
    `SELECT to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS today`,
    []
  );
  const status = streakStatus(result.rows.map(row => row.diary_date), todayResult.rows[0].today);
  const rewarded = await queryable.query(
    'SELECT awarded_at FROM billing_campaign_rewards WHERE user_id = $1 AND campaign_key = $2',
    [userId, SEVEN_DAY_CAMPAIGN_KEY]
  );
  return {
    ...status,
    campaignKey: SEVEN_DAY_CAMPAIGN_KEY,
    title: '连续记录 7 天',
    rewardPointCents: SEVEN_DAY_REWARD_POINT_CENTS,
    rewardPoints: points(SEVEN_DAY_REWARD_POINT_CENTS),
    rewarded: rewarded.rowCount > 0,
    rewardedAt: rewarded.rows[0]?.awarded_at || null,
    shareAvailable: rewarded.rowCount > 0
  };
}

async function awardSevenDayReward(queryable, userId) {
  const status = await activityStatus(queryable, userId);
  if (!status.qualified || status.rewarded) return status;
  const idempotencyKey = `campaign:${SEVEN_DAY_CAMPAIGN_KEY}`;
  const credited = await creditWallet(queryable, {
    userId,
    amountPointCents: SEVEN_DAY_REWARD_POINT_CENTS,
    bucket: 'reward',
    eventType: 'CAMPAIGN_REWARD',
    referenceType: 'CAMPAIGN',
    referenceId: SEVEN_DAY_CAMPAIGN_KEY,
    idempotencyKey,
    description: '连续完成 7 天日记活动奖励',
    metadata: {
      qualifyingStartDate: status.qualifyingStartDate,
      qualifyingEndDate: status.qualifyingEndDate
    }
  });
  if (credited.ledger) {
    await queryable.query(
      `INSERT INTO billing_campaign_rewards
        (id, user_id, campaign_key, reward_point_cents, ledger_id, qualification)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT (user_id, campaign_key) DO NOTHING`,
      [crypto.randomUUID(), userId, SEVEN_DAY_CAMPAIGN_KEY, SEVEN_DAY_REWARD_POINT_CENTS,
        credited.ledger.id, JSON.stringify({
          qualifyingStartDate: status.qualifyingStartDate,
          qualifyingEndDate: status.qualifyingEndDate
        })]
    );
  }
  return { ...(await activityStatus(queryable, userId)), newlyRewarded: true };
}

async function maybeAwardSevenDayReward(queryable, userId) {
  if (!billingEnabled()) return null;
  return awardSevenDayReward(queryable, userId);
}

async function setupNewUser(queryable, userId, acceptanceSource = 'REGISTER') {
  await ensureWallet(queryable, userId);
  for (const documentKey of ['terms', 'privacy']) {
    await queryable.query(
      `INSERT INTO legal_acceptances
        (id, user_id, document_key, document_version, acceptance_source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, document_key, document_version, acceptance_source) DO NOTHING`,
      [crypto.randomUUID(), userId, documentKey, LEGAL_VERSION, acceptanceSource]
    );
  }
}

async function acceptPaymentAgreements(queryable, userId, source = 'WALLET_BILLING') {
  for (const documentKey of ['terms', 'privacy', 'recharge', 'refund']) {
    await queryable.query(
      `INSERT INTO legal_acceptances
        (id, user_id, document_key, document_version, acceptance_source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, document_key, document_version, acceptance_source) DO NOTHING`,
      [crypto.randomUUID(), userId, documentKey, LEGAL_VERSION, source]
    );
  }
}

async function hasCurrentPaymentAgreements(queryable, userId) {
  const result = await queryable.query(
    `SELECT count(DISTINCT document_key)::int AS count FROM legal_acceptances
      WHERE user_id = $1 AND document_version = $2
        AND acceptance_source = 'WALLET_BILLING'
        AND document_key = ANY($3::varchar[])`,
    [userId, LEGAL_VERSION, ['terms', 'privacy', 'recharge', 'refund']]
  );
  return Number(result.rows[0]?.count || 0) === 4;
}

async function unlockFeature(userId, featureKey) {
  const feature = FEATURES[featureKey];
  if (!feature) throw Object.assign(new Error('解锁功能不存在'), { code: 'SHROOM_BILLING_INPUT' });
  return db.transaction(async client => {
    await lockedWallet(client, userId);
    const existing = await client.query(
      `SELECT * FROM billing_feature_entitlements
        WHERE user_id = $1 AND feature_key = $2 AND status = 'ACTIVE' FOR UPDATE`,
      [userId, featureKey]
    );
    if (existing.rowCount) return { featureKey, active: true, alreadyUnlocked: true };
    if (!await hasCurrentPaymentAgreements(client, userId)) {
      throw Object.assign(new Error('请先阅读并同意充值与退款规则'), { code: 'SHROOM_BILLING_AGREEMENT' });
    }
    const entitlementId = crypto.randomUUID();
    const debit = await debitWallet(client, {
      userId,
      amountPointCents: FEATURE_PRICE_POINT_CENTS,
      eventType: 'FEATURE_UNLOCK',
      referenceType: 'FEATURE',
      referenceId: featureKey,
      idempotencyKey: `feature-unlock:${featureKey}`,
      description: `解锁${feature.name}`,
      metadata: { featureKey, permanent: true, aiUsageSeparatelyCharged: true }
    });
    await client.query(
      `INSERT INTO billing_feature_entitlements
        (id, user_id, feature_key, price_point_cents, ledger_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [entitlementId, userId, featureKey, FEATURE_PRICE_POINT_CENTS, debit.ledger.id]
    );
    return { featureKey, active: true, alreadyUnlocked: false, ledgerId: debit.ledger.id };
  });
}

async function ensureAiFunds(userId, requiredPointCents = config.billing.minimumAiStartPointCents) {
  if (!billingEnabled()) return;
  await ensureWallet(db, userId);
  if (!await hasCurrentPaymentAgreements(db, userId)) {
    throw Object.assign(new Error('请先阅读并同意 AI 计费与退款规则'), {
      code: 'SHROOM_BILLING_AGREEMENT',
      data: { reason: 'BILLING_AGREEMENT_REQUIRED', version: LEGAL_VERSION }
    });
  }
  const result = await db.query(
    `SELECT wa.*, COALESCE((
       SELECT sum(rr.requested_point_cents) FROM billing_refund_requests rr
        WHERE rr.user_id = wa.user_id AND rr.status IN ('REQUESTED', 'PROCESSING')
     ), 0)::int AS refund_reserved_cents
       FROM wallet_accounts wa WHERE wa.user_id = $1`,
    [userId]
  );
  const wallet = mapWallet(result.rows[0]);
  const required = Math.max(config.billing.minimumAiStartPointCents,
    Math.max(1, Math.round(Number(requiredPointCents) || 0)));
  if (wallet.availablePointCents < required) {
    throw Object.assign(new Error('菇点余额不足'), {
      code: 'SHROOM_BALANCE_INSUFFICIENT',
      data: {
        requiredPointCents: required,
        availablePointCents: wallet.availablePointCents,
        missingPointCents: Math.max(0, required - wallet.availablePointCents),
        requiredPoints: points(required),
        availablePoints: wallet.availablePoints
      }
    });
  }
}

async function chargeAiUsage(userId, usageEventId, costCny, metadata = {}) {
  if (!billingEnabled()) {
    await db.query(
      `UPDATE ai_usage_events SET charge_status = 'NOT_BILLABLE' WHERE id = $1 AND user_id = $2`,
      [usageEventId, userId]
    );
    return null;
  }
  const amountPointCents = aiChargePointCents(costCny, config.billing.aiChargeMultiplier);
  if (!amountPointCents) {
    await db.query(
      `UPDATE ai_usage_events SET charge_status = 'UNPRICED' WHERE id = $1 AND user_id = $2`,
      [usageEventId, userId]
    );
    throw Object.assign(new Error('当前 AI 模型没有可用的人民币计价表'), { code: 'SHROOM_AI_PRICING_UNAVAILABLE' });
  }
  let result;
  try {
    result = await db.transaction(async client => {
      const debit = await debitWallet(client, {
        userId,
        amountPointCents,
        eventType: 'AI_USAGE',
        referenceType: 'AI_USAGE_EVENT',
        referenceId: usageEventId,
        idempotencyKey: `ai-usage:${usageEventId}`,
        description: '成功交付 AI 分析',
        metadata: { ...metadata, costCny: Number(costCny), multiplier: config.billing.aiChargeMultiplier }
      });
      await client.query(
        `UPDATE ai_usage_events SET charge_status = 'CHARGED', charged_point_cents = $3,
           charge_multiplier = $4, wallet_ledger_id = $5 WHERE id = $1 AND user_id = $2`,
        [usageEventId, userId, amountPointCents, config.billing.aiChargeMultiplier, debit.ledger.id]
      );
      return debit;
    });
  } catch (error) {
    if (error.code !== 'SHROOM_BALANCE_INSUFFICIENT') throw error;
    await db.query(
      `UPDATE ai_usage_events SET charge_status = 'ABSORBED', charged_point_cents = 0,
         charge_multiplier = $3 WHERE id = $1 AND user_id = $2`,
      [usageEventId, userId, config.billing.aiChargeMultiplier]
    );
    return { amountPointCents: 0, points: 0, absorbed: true };
  }
  return { ...result, amountPointCents, points: points(amountPointCents) };
}

async function overview(userId) {
  return db.transaction(async client => {
    await ensureWallet(client, userId);
    const walletResult = await client.query(
      `SELECT wa.*, COALESCE((
         SELECT sum(rr.requested_point_cents) FROM billing_refund_requests rr
          WHERE rr.user_id = wa.user_id AND rr.status IN ('REQUESTED', 'PROCESSING')
       ), 0)::int AS refund_reserved_cents
         FROM wallet_accounts wa WHERE wa.user_id = $1`,
      [userId]
    );
    const entitlementResult = await client.query(
      `SELECT feature_key, purchased_at FROM billing_feature_entitlements
        WHERE user_id = $1 AND status = 'ACTIVE'`,
      [userId]
    );
    const agreementResult = await client.query(
      'SELECT document_key, document_version, accepted_at FROM legal_acceptances WHERE user_id = $1',
      [userId]
    );
    const activity = await activityStatus(client, userId);
    const active = new Map(entitlementResult.rows.map(row => [row.feature_key, row]));
    const enabled = billingEnabled();
    const merchant = paymentConfiguration();
    return {
      enabled,
      mode: config.billing.mode,
      paymentReady: merchant.live,
      rollout: commercialRollout(config.billing.mode, merchant.channels.H5.live),
      merchant: {
        label: config.billing.merchantLabel,
        legalName: config.billing.merchantLegalName || '',
        invoiceLegalName: config.billing.invoiceLegalName || '',
        taxId: config.billing.merchantTaxId || '',
        subjectConsistent: merchant.subjectConsistent,
        customerService: config.billing.customerService || '',
        icpQualification: config.billing.icpQualification || '',
        appFilingNumber: config.billing.appFilingNumber || '',
        legalReady: merchant.legalReady
      },
      paymentChannels: Object.fromEntries(Object.entries(merchant.channels).map(([key, value]) => [key, {
        ready: value.ready,
        live: value.live,
        reason: value.reason,
        paymentMode: value.paymentMode,
        entryContext: value.entryContext
      }])),
      wallet: mapWallet(walletResult.rows[0]),
      features: Object.values(FEATURES).map(feature => ({
        ...feature,
        pricePointCents: FEATURE_PRICE_POINT_CENTS,
        pricePoints: points(FEATURE_PRICE_POINT_CENTS),
        active: !enabled || active.has(feature.key),
        purchasedAt: active.get(feature.key)?.purchased_at || null,
        aiUsageSeparatelyCharged: true
      })),
      activity,
      pricing: {
        pointCentsPerPoint: 100,
        yuanPerPoint: 1,
        aiChargeMultiplier: config.billing.aiChargeMultiplier,
        failedCallsCharged: false
      },
      agreements: {
        version: LEGAL_VERSION,
        accepted: agreementResult.rows,
        paymentAccepted: await hasCurrentPaymentAgreements(client, userId)
      }
    };
  });
}

async function ledger(userId, limit = 50) {
  const result = await db.query(
    `SELECT id, event_type, paid_delta_cents, reward_delta_cents,
            paid_balance_cents, reward_balance_cents, reference_type,
            reference_id, description, metadata, created_at
       FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.max(1, Math.min(100, Number(limit) || 50))]
  );
  return result.rows.map(row => ({
    id: row.id,
    eventType: row.event_type,
    paidDeltaPoints: points(row.paid_delta_cents),
    rewardDeltaPoints: points(row.reward_delta_cents),
    balancePoints: points(Number(row.paid_balance_cents) + Number(row.reward_balance_cents)),
    description: row.description,
    metadata: row.metadata || {},
    createdAt: row.created_at
  }));
}

function requireFeature(featureKey) {
  if (!FEATURES[featureKey]) throw new Error(`Unknown billing feature: ${featureKey}`);
  return async function featureEntitlement(req, res, next) {
    try {
      const platform = String(req.get('x-shroom-platform') || 'H5').toUpperCase().slice(0, 40);
      const rollout = await featureAccessForUser(req.user.id, featureKey, platform);
      if (!rollout.allowed) {
        const temporarilyUnavailable = rollout.reason === 'FEATURE_PAUSED';
        return res.json({
          code: temporarilyUnavailable ? 503 : 403,
          message: rollout.message || (rollout.reason === 'FEATURE_BETA'
            ? `${FEATURES[featureKey].name}仍在限量测试`
            : `当前账号暂不可使用${FEATURES[featureKey].name}`),
          data: {
            reason: rollout.reason, featureKey, featureName: FEATURES[featureKey].name,
            platform: rollout.platform || platform
          }
        });
      }
      if (rollout.reason === 'ADMIN_GRANT') return next();
      if (!billingEnabled()) return next();
      const result = await db.query(
        `SELECT 1 FROM billing_feature_entitlements
          WHERE user_id = $1 AND feature_key = $2 AND status = 'ACTIVE'`,
        [req.user.id, featureKey]
      );
      if (result.rowCount) return next();
      return res.json({
        code: 402,
        message: `请先解锁${FEATURES[featureKey].name}`,
        data: {
          reason: 'FEATURE_LOCKED',
          featureKey,
          featureName: FEATURES[featureKey].name,
          requiredPointCents: FEATURE_PRICE_POINT_CENTS,
          requiredPoints: points(FEATURE_PRICE_POINT_CENTS),
          aiUsageSeparatelyCharged: true
        }
      });
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  acceptPaymentAgreements,
  activityStatus,
  awardSevenDayReward,
  billingEnabled,
  chargeAiUsage,
  creditWallet,
  debitWallet,
  ensureAiFunds,
  ensureWallet,
  hasCurrentPaymentAgreements,
  ledger,
  mapWallet,
  maybeAwardSevenDayReward,
  overview,
  refundPaidBalance,
  requireFeature,
  setupNewUser,
  unlockFeature
};
