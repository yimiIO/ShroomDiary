'use strict';

const fs = require('node:fs');
const db = require('../src/db');
const { refreshWellbeingHypotheses } = require('../src/wellbeing-hypotheses');

function option(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

function resultSummary(result) {
  return {
    sourceCount: result.sourceCount,
    reviewedDomains: result.reviewedDomains,
    hypothesisCount: result.hypotheses.length,
    hypotheses: result.hypotheses.map(item => ({
      domain: item.domain,
      kind: item.kind,
      name: item.name,
      primaryConcepts: item.namedPossibilities
        .filter(value => value.role === 'PRIMARY_DIRECTION')
        .map(value => value.conceptId),
      alternatives: item.namedPossibilities
        .filter(value => value.role !== 'PRIMARY_DIRECTION')
        .map(value => ({ conceptId: value.conceptId, role: value.role })),
      evidenceStrength: item.evidenceStrength,
      evidenceCount: item.supportingEvidence.length,
      evidenceRecordIds: item.supportingEvidence.map(value => value.recordId),
      whyPossible: item.whyPossible,
      missingInformation: item.missingInformation
    }))
  };
}

async function usageSince(userId, featurePrefix, startedAt) {
  const result = await db.query(
    `SELECT model, count(*)::int AS calls,
            COALESCE(sum(prompt_tokens), 0)::bigint AS prompt_tokens,
            COALESCE(sum(completion_tokens), 0)::bigint AS completion_tokens,
            COALESCE(sum(total_tokens), 0)::bigint AS total_tokens,
            COALESCE(sum(cost_cny), 0)::numeric AS cost_cny,
            count(cost_cny)::int AS priced_calls
       FROM ai_usage_events
      WHERE user_id = $1 AND feature LIKE $2 AND created_at >= $3
      GROUP BY model ORDER BY model`,
    [userId, `${featurePrefix}%`, startedAt]
  );
  return result.rows.map(row => ({
    model: row.model,
    calls: Number(row.calls || 0),
    promptTokens: Number(row.prompt_tokens || 0),
    completionTokens: Number(row.completion_tokens || 0),
    totalTokens: Number(row.total_tokens || 0),
    costCny: Number(row.priced_calls || 0) === Number(row.calls || 0) ? Number(row.cost_cny || 0) : null
  }));
}

async function main() {
  const mobile = option('mobile') || String(process.env.SHROOM_BACKFILL_MOBILE || '').trim();
  if (!/^1[3-9]\d{9}$/u.test(mobile)) throw new Error('请通过 --mobile=手机号指定唯一账号');
  const models = (option('models') || 'deepseek-v4-flash,deepseek-v4-pro')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (models.length !== 2 || new Set(models).size !== 2) throw new Error('请通过 --models=模型A,模型B 指定两个不同模型');
  const userResult = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (userResult.rowCount !== 1) throw new Error('没有找到唯一的 Shroom 用户');
  const userId = userResult.rows[0].id;
  const startedAt = new Date();
  const featurePrefix = `wellbeing_ab_${startedAt.getTime().toString(36)}`.slice(0, 34);
  const comparisons = [];
  for (const model of models) {
    const result = await refreshWellbeingHypotheses(userId, model, {
      persist: false,
      aiOptions: { model, usageFeaturePrefix: featurePrefix }
    });
    comparisons.push({ model, ...resultSummary(result) });
  }
  const payload = JSON.stringify({
    ok: true,
    persisted: false,
    sameInput: comparisons.every(item => item.sourceCount === comparisons[0].sourceCount),
    comparisons,
    usage: await usageSince(userId, featurePrefix, startedAt)
  }, null, 2);
  const output = option('output');
  if (output) fs.writeFileSync(output, payload, { encoding: 'utf8', mode: 0o600 });
  else console.log(payload);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
