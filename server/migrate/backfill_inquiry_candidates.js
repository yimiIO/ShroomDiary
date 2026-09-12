'use strict';

const db = require('../src/db');
const config = require('../src/config');
const { callJson, isAiConfigured } = require('../src/ai-engine');
const {
  buildDiaryBatches,
  normalizeHistoricalCandidates,
  storeHistoricalCandidates
} = require('../src/inquiry-backfill');

const MODEL_VERSION = 'inquiry-history-2026-09-12-v1';

const BATCH_PROMPT = `你是 Shroom 的历史日记未解之问审阅器。你的任务不是总结日记，也不是替用户回答问题，而是发现需要未来经历、行为结果、反例或跨时间比较才能逐步理解的个人问题。

规则：
1. 只根据输入日记，不得补写事实。每个候选必须引用真实 sourceDiaryIds。
2. 先判断文本是用户本人经历，还是收藏文章、AI 回答、待办或他人的健康情况；后四者不得当作用户本人的长期问题。
3. 不要输出可立即搜索的事实问题、普通待办、修辞抱怨、一次性情绪、已经有答案的观点或泛泛人生问题。
4. 问题使用第一人称、具体、中性、可被未来证据修订。一次日记的情绪不能直接升级为长期模式。
5. inquiryType 只能是 GENERAL、PSYCHOLOGICAL 或 PHYSICAL_HEALTH。心理与身体类只是长期观察线索，不得诊断疾病、推断治疗或把相关性写成因果。
6. 对健康类候选，healthObservation 只能结构化日记明确记载的观察；没有明确字段就留空，不得补写。
7. 只有证据充分时才输出；每批最多 5 个，没有就返回空数组。
8. 如果本质上属于 existingInquiries，填写其真实 id；类型必须一致，不要杜撰 id。

只返回 JSON：{"candidates":[{"question":"我需要长期观察的具体问题？","context":"目前为什么不能下结论、未来需要观察什么","confidence":0.8,"inquiryType":"GENERAL","healthObservation":{},"sourceDiaryIds":["真实日记ID"],"existingInquiryId":null}]}`;

const CONSOLIDATE_PROMPT = `你是 Shroom 的跨时间未解之问整理器。输入是从多批历史日记得到的候选，而不是确定结论。请合并语义重复的问题，去掉证据薄弱、过度推断、一次性或已经能回答的问题，保留真正值得用户确认后长期观察的少量问题。

规则：
1. 只能使用输入中真实出现的 sourceDiaryIds 和 existingInquiryId，不得创造来源。
2. 合并时保留所有直接相关的日记来源，但不要把只在主题上沾边的日记硬凑进来。
3. 问题使用第一人称、具体、中性、可修订；context 说明尚不确定之处和未来证据方向。
4. 保留每个候选的 inquiryType；合并普通与健康候选时以更谨慎的健康类型为准。healthObservation 只能保留输入已有观察，不得追加推测。
5. 健康类只作为观察和线索，不得诊断、进行因果断言、提供药物或治疗方案。
6. 最多 12 个，按长期价值和证据强度排序；confidence 低于 0.65 的不要输出。
7. 这只是待用户确认候选，不能宣布人格判断或替用户得出答案。

只返回 JSON：{"candidates":[{"question":"我需要长期观察的具体问题？","context":"目前为什么不能下结论、未来需要观察什么","confidence":0.8,"inquiryType":"PSYCHOLOGICAL","healthObservation":{},"sourceDiaryIds":["真实日记ID"],"existingInquiryId":null}]}`;

function option(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

async function main() {
  const mobile = option('mobile') || String(process.env.SHROOM_BACKFILL_MOBILE || '').trim();
  const apply = process.argv.includes('--apply');
  const replacePending = process.argv.includes('--replace-pending');
  if (!/^1[3-9]\d{9}$/.test(mobile)) throw new Error('请通过 --mobile=手机号 指定一个 Shroom 账号');
  if (!isAiConfigured()) throw new Error('AI provider is not configured');

  const userResult = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (userResult.rowCount !== 1) throw new Error('没有找到唯一的 Shroom 用户');
  const userId = userResult.rows[0].id;
  const [diaryResult, inquiryResult, pendingResult] = await Promise.all([
    db.query(
      `SELECT id, to_char(occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS diary_date, content
         FROM diaries
        WHERE user_id = $1 AND deleted_at IS NULL AND ai_allowed = true AND length(trim(content)) > 0
        ORDER BY occurred_at ASC`,
      [userId]
    ),
    db.query(
      `SELECT id, question, context, status, inquiry_type FROM inquiries
        WHERE user_id = $1 AND status IN ('OPEN', 'PAUSED') ORDER BY updated_at DESC`,
      [userId]
    ),
    db.query(
      `SELECT count(*)::int AS total FROM inquiry_candidates
        WHERE user_id = $1 AND source = 'HISTORICAL_BACKFILL' AND status = 'PENDING'`,
      [userId]
    )
  ]);
  if (pendingResult.rows[0].total && !replacePending) {
    throw new Error('这个账号已有历史待确认候选；如需重新生成，请显式使用 --replace-pending');
  }
  const batches = buildDiaryBatches(diaryResult.rows);
  if (!batches.length) throw new Error('没有允许 AI 读取的文字日记');

  const existingInquiries = inquiryResult.rows.map(row => ({
    id: row.id,
    question: row.question,
    context: String(row.context || '').slice(0, 800),
    inquiryType: row.inquiry_type,
    status: row.status
  }));
  const drafts = [];
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const response = await callJson(BATCH_PROMPT, { existingInquiries, diaries: batch }, `历史问题初筛 ${index + 1}/${batches.length}`, {
      maxTokens: 2400,
      temperature: 0.2,
      usageContext: { userId, feature: 'inquiry_historical_backfill' }
    });
    drafts.push(...normalizeHistoricalCandidates(
      response.candidates,
      batch.map(item => item.id),
      existingInquiries
    ));
  }

  let candidates = drafts;
  if (drafts.length) {
    const response = await callJson(CONSOLIDATE_PROMPT, { existingInquiries, candidates: drafts }, '历史问题跨时间整理', {
      maxTokens: 5000,
      temperature: 0.15,
      usageContext: { userId, feature: 'inquiry_historical_backfill' }
    });
    candidates = normalizeHistoricalCandidates(
      response.candidates,
      diaryResult.rows.map(item => item.id),
      existingInquiries
    ).slice(0, 12);
  }

  let inserted = 0;
  if (apply && candidates.length) {
    inserted = await db.transaction(client => storeHistoricalCandidates(client, {
      userId,
      modelVersion: config.aiModel ? `${MODEL_VERSION}:${config.aiModel}` : MODEL_VERSION,
      candidates,
      replacePending
    }));
  }
  console.log(JSON.stringify({
    ok: true,
    applied: apply,
    diaryCount: diaryResult.rowCount,
    batchCount: batches.length,
    draftCount: drafts.length,
    candidateCount: candidates.length,
    inserted,
    candidates: candidates.map(item => ({ question: item.question, evidenceCount: item.sourceDiaryIds.length }))
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
