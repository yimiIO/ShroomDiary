'use strict';

const db = require('../src/db');
const config = require('../src/config');
const { callJson, isAiConfigured } = require('../src/ai-engine');
const { buildDiaryBatches } = require('../src/inquiry-backfill');
const { normalizeHistoricalWellbeingRecords, storeHistoricalWellbeingRecords } = require('../src/wellbeing-backfill');

const MODEL_VERSION = 'wellbeing-history-2026-09-13-v1';
const BATCH_PROMPT = `你是 Shroom 的历史日记身心观察提取器。你只整理用户日记中明确写下的身心事实，不回答未解之问，也不创建问题。

规则：
1. 每项必须使用输入中真实 diaryId；只能记录本人经历，收藏文本、AI 回答、他人经历、一般知识和计划不得算作本人观察。
2. evidenceExcerpt 必须是对应日记正文中连续出现的逐字原文。没有逐字证据就不要输出。
3. 可提取心理感受、压力、认知与行为变化、身体症状与部位、睡眠、饮食运动等生活因素、环境、测量和检查结果。
4. “可能、也许、好像、怀疑、不确定”等表达必须标为 UNCERTAIN；不得推断疾病、人格、因果或治疗。
5. 不要因为一篇日记没有健康内容而硬凑记录。每篇日记最多返回一项合并结果。
6. redFlags 只在原文明示需要立即或尽快求助的危险信号时保留；不得扩大解释。

只返回 JSON：{"records":[{"diaryId":"真实日记ID","healthExtraction":{"psychologicalObservations":[{"observation":"心理观察","aspect":"EMOTION|STRESS|COGNITION|BEHAVIOR","evidenceExcerpt":"逐字原文","certainty":"EXPLICIT|UNCERTAIN"}],"physicalObservations":[{"symptom":"身体观察","bodyAreas":[],"severity":null,"observedAt":"","duration":"","measurements":[],"testResults":[],"evidenceExcerpt":"逐字原文","certainty":"EXPLICIT|UNCERTAIN"}],"lifestyleFactors":[{"factor":"生活因素","category":"SLEEP|DIET|EXERCISE|CAFFEINE|ALCOHOL|MEDICATION|OTHER","evidenceExcerpt":"逐字原文","certainty":"EXPLICIT|UNCERTAIN"}],"environmentFactors":[{"observation":"环境因素","category":"TEMPERATURE|HUMIDITY|ALTITUDE|TRAVEL|LIVING_ENVIRONMENT|OTHER","evidenceExcerpt":"逐字原文","certainty":"EXPLICIT|UNCERTAIN"}],"missingInformation":[],"redFlags":[]}}]}`;

function option(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

async function main() {
  const mobile = option('mobile') || String(process.env.SHROOM_BACKFILL_MOBILE || '').trim();
  const apply = process.argv.includes('--apply');
  if (!/^1[3-9]\d{9}$/u.test(mobile)) throw new Error('请通过 --mobile=手机号指定唯一账号');
  if (!isAiConfigured()) throw new Error('AI provider is not configured');

  const userResult = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (userResult.rowCount !== 1) throw new Error('没有找到唯一的 Shroom 用户');
  const userId = userResult.rows[0].id;
  const diaryResult = await db.query(
    `SELECT d.id, to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS diary_date, d.content
       FROM diaries d
       LEFT JOIN wellbeing_records w ON w.user_id = d.user_id AND w.diary_id = d.id
      WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.ai_allowed = true
        AND length(trim(d.content)) > 0 AND w.id IS NULL
      ORDER BY d.occurred_at ASC`,
    [userId]
  );
  const batches = buildDiaryBatches(diaryResult.rows, { maxChars: 16000, maxEntries: 14, maxDiaryChars: 5000 });
  const records = [];
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const response = await callJson(BATCH_PROMPT, { diaries: batch }, `历史身心记录 ${index + 1}/${batches.length}`, {
      maxTokens: 5000,
      temperature: 0.1,
      usageContext: { userId, feature: 'wellbeing_historical_backfill' }
    });
    records.push(...normalizeHistoricalWellbeingRecords(response.records, batch));
    console.error(`processed ${index + 1}/${batches.length}: ${records.length} grounded records`);
  }

  const inserted = apply && records.length
    ? await db.transaction(client => storeHistoricalWellbeingRecords(client, {
      userId,
      records,
      modelVersion: `${MODEL_VERSION}:${config.aiModel}`
    }))
    : 0;
  const usage = await db.query(
    `SELECT count(*)::int AS calls, COALESCE(sum(total_tokens), 0)::bigint AS total_tokens,
            COALESCE(sum(cost_cny), 0)::numeric AS cost_cny
       FROM ai_usage_events WHERE user_id = $1 AND feature = 'wellbeing_historical_backfill'`,
    [userId]
  );
  console.log(JSON.stringify({
    ok: true,
    applied: apply,
    diaryCount: diaryResult.rowCount,
    batchCount: batches.length,
    candidateCount: records.length,
    inserted,
    usage: usage.rows[0]
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
