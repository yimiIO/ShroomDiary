'use strict';

const crypto = require('node:crypto');

const SECTIONS = ['健康与生活', '安全与财务', '认知与执行', '事业与资产', '关系与信誉'];
const RECORD_TYPES = ['PLAN', 'ACTION', 'RESULT', 'OBSERVATION', 'INQUIRY'];
const TEMPLATE_VERSION = '2026-09-12-v1';
const DEFAULT_ITEMS = [
  ['01', '健康与生活', '身体维护制度化', '维持睡眠与运动安排，持续记录并跟进身体异常。'],
  ['02', '安全与财务', '守住不归零的底线', '在高风险交付前执行检查，问题出现后修订防范措施。'],
  ['03', '事业与资产', '守住创业主线', '定期核对投入是否服务EvoX主线，新想法先记录、不立即切换。'],
  ['04', '认知与执行', '保护专注工作时间', '留出不被打断的时间，推进当前最重要的工作。'],
  ['05', '事业与资产', '持续完成真实交付', '推进一个真实用户从不会到会，并记录结果。'],
  ['06', '关系与信誉', '持续兑现承诺', '讲清承诺与边界，检查履行情况，主动处理未兑现部分。'],
  ['07', '认知与执行', '记录并复核重要决策', '记录理由、预期和改变决定的条件，事后核对。'],
  ['08', '认知与执行', '持续观察自己', '记录困惑、情绪、身体和行为，不急于下结论。'],
  ['09', '认知与执行', '把反思变成行为改变', '每次重要复盘至少形成一个可以检查的调整。'],
  ['10', '事业与资产', '沉淀可复用技术资产', '保存可复用组件、测试、文档或流程，并记录后续复用。'],
  ['11', '事业与资产', '沉淀教学知识资产', '整理能力标准、诊断方法、训练任务或评估案例。'],
  ['12', '事业与资产', '建立可核验成果库', '经授权保存前后对比、考核、补训和售后证据。'],
  ['13', '事业与资产', '深挖核心专业原理', '围绕AI与能力教学学习，并用解释、复现或应用检验。'],
  ['14', '关系与信誉', '与优秀的人长期共事', '明确权责、分配和验收，复盘合作中的具体问题。'],
  ['15', '关系与信誉', '维护长期联系', '回访学员、同行或伙伴，提供真实帮助、兑现约定。'],
  ['16', '事业与资产', '稳定公开有用作品', '分享真实问题、解决过程和结果，而不只是表达观点。'],
  ['17', '安全与财务', '建立财务纪律与缓冲', '定期看账，为投入和试错设定可承受边界。'],
  ['18', '认知与执行', '欣赏优秀、接受纠错', '面对不舒服的反馈，先提取值得学习的部分。'],
  ['19', '关系与信誉', '经营亲密关系与老朋友', '投入不带业务目的的时间，表达关心、履行小承诺。'],
  ['20', '健康与生活', '保留不用于证明自己的生活', '为不以赚钱、竞争或获得认同为目的的活动留出空间。']
].map(([stableKey, section, name, minimumAction], index) => ({
  stableKey, originalNumber: index + 1, section, name, description: '', minimumAction, priority: index + 1
}));

function clean(value, max = 1000) {
  return String(value || '').trim().replace(/\s+/gu, ' ').slice(0, max);
}

function localDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  return Object.fromEntries(parts.map(item => [item.type, item.value]));
}

function weekStart(value = new Date(), offsetWeeks = 0) {
  const parts = localDate(value);
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00+08:00`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1 + offsetWeeks * 7);
  return date.toISOString().slice(0, 10);
}

async function ensureDefaultLifeOsItems(queryable, userId) {
  const existing = await queryable.query('SELECT count(*)::int AS count FROM life_os_items WHERE user_id = $1', [userId]);
  if (Number(existing.rows[0]?.count || 0) >= DEFAULT_ITEMS.length) return;
  for (const item of DEFAULT_ITEMS) {
    await queryable.query(
      `INSERT INTO life_os_items
        (id, user_id, stable_key, original_number, section, name, description, minimum_action, priority, template_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, stable_key) DO NOTHING`,
      [crypto.randomUUID(), userId, item.stableKey, item.originalNumber, item.section, item.name,
        item.description, item.minimumAction, item.priority, TEMPLATE_VERSION]
    );
  }
}

function normalizeLifeOsLinks(value, items, diaryContent) {
  const allowed = new Set((Array.isArray(items) ? items : []).map(item => String(item.stableKey || item.stable_key)));
  const content = String(diaryContent || '');
  const result = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const itemKey = clean(raw?.itemId || raw?.itemKey, 2);
    const recordType = RECORD_TYPES.includes(raw?.recordType) ? raw.recordType : null;
    const evidenceExcerpt = String(raw?.evidenceExcerpt || raw?.evidence || '').trim().slice(0, 800);
    const uniqueKey = `${itemKey}:${recordType}`;
    if (!allowed.has(itemKey) || !recordType || !evidenceExcerpt || !content.includes(evidenceExcerpt) || seen.has(uniqueKey)) continue;
    result.push({
      itemKey,
      recordType,
      evidenceExcerpt,
      summary: clean(raw.summary || raw.reason, 500),
      suggestedNextStep: clean(raw.suggestedNextStep, 500)
    });
    seen.add(uniqueKey);
    if (result.length >= 3) break;
  }
  return result;
}

async function syncDiaryLifeOsLinks(client, { userId, diary, analysisId, items, links }) {
  await client.query(
    `DELETE FROM life_os_item_links
      WHERE user_id = $1 AND diary_id = $2 AND origin = 'AI' AND user_confirmed = false`,
    [userId, diary.id]
  );
  for (const link of links) {
    const item = items.find(value => String(value.stableKey || value.stable_key) === link.itemKey);
    if (!item) continue;
    await client.query(
      `INSERT INTO life_os_item_links
        (id, user_id, item_id, diary_id, analysis_id, record_type, evidence_excerpt, summary,
         suggested_next_step, origin, user_confirmed, status, source_version, source_valid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'AI', false, 'ACTIVE', $10, true)
       ON CONFLICT (user_id, item_id, diary_id, record_type)
         WHERE status = 'ACTIVE' AND source_valid DO NOTHING`,
      [crypto.randomUUID(), userId, item.id, diary.id, analysisId, link.recordType,
        link.evidenceExcerpt, link.summary, link.suggestedNextStep, Number(diary.content_version || 1)]
    );
  }
}

async function listDiaryLifeOsLinks(queryable, userId, diaryId) {
  const result = await queryable.query(
    `SELECT l.*, i.stable_key, i.name AS item_name,
            to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS source_date
       FROM life_os_item_links l
       JOIN life_os_items i ON i.id = l.item_id AND i.user_id = l.user_id
       LEFT JOIN diaries d ON d.id = l.diary_id AND d.user_id = l.user_id
      WHERE l.user_id = $1 AND l.diary_id = $2 AND l.status = 'ACTIVE' AND l.source_valid
      ORDER BY i.priority, i.original_number`,
    [userId, diaryId]
  );
  return result.rows.map(row => ({
    id: row.id,
    itemId: row.item_id,
    itemKey: row.stable_key,
    itemName: row.item_name,
    diaryId: row.diary_id,
    sourceDate: row.source_date,
    recordType: row.record_type,
    evidenceExcerpt: row.evidence_excerpt || '',
    summary: row.summary || '',
    suggestedNextStep: row.suggested_next_step || '',
    origin: row.origin,
    userConfirmed: Boolean(row.user_confirmed)
  }));
}

const WEEKLY_REVIEW_PROMPT = `你是 Shroom 复利方向旧版每周回看助手。输入包含 20 个长期方向和本周已经与日记关联的记录。你只整理证据，不代替用户确认人生原则、创建待办或完成行动。

规则：
1. 只能引用输入中存在的 sourceKey 和 itemId；没有证据就留空。
2. 严格区分 PLAN、ACTION、RESULT、OBSERVATION、INQUIRY；计划不是行动，行动不是结果。
3. 收藏内容、引用和 AI 总结不能当作用户亲身行动。
4. accumulations 区分 ASSET_CREATED、ASSET_REUSED、RELATIONSHIP_MAINTAINED、STATE_MAINTAINED；不把一切硬算为“复利”。
5. observations 区分事实和推测，不从一次情绪或行为推断人格。
6. nextSteps 最多 5 条，只是下周继续、调整或停止的候选，由用户选择。
7. 这是可编辑草稿，不修改长期方向、优先级或正式原则。

只返回 JSON：
{"actualProgress":[{"itemId":"01","recordType":"ACTION","text":"本周实际发生的事","sourceRefs":["R1"]}],"accumulations":[{"itemId":"10","kind":"ASSET_CREATED","text":"有证据的积累","sourceRefs":["R2"]}],"observations":[{"itemId":"08","text":"值得继续观察的问题","inference":false,"sourceRefs":["R3"]}],"nextSteps":[{"itemId":"03","mode":"CONTINUE|ADJUST|STOP","action":"少量、可检查的候选动作","sourceRefs":["R1"]}],"summary":"本周证据的克制总结"}`;

function normalizeWeeklyReview(value, sources, items) {
  const sourceSet = new Set((Array.isArray(sources) ? sources : []).map(item => item.sourceKey));
  const itemSet = new Set((Array.isArray(items) ? items : []).map(item => String(item.stableKey || item.stable_key)));
  const refs = input => [...new Set((Array.isArray(input) ? input : []).map(item => clean(item, 24)).filter(item => sourceSet.has(item)))].slice(0, 12);
  const list = (input, max, mapper) => (Array.isArray(input) ? input : []).slice(0, max).map(mapper).filter(Boolean);
  const withBase = raw => {
    const itemId = clean(raw?.itemId, 2);
    const text = clean(raw?.text || raw?.action, 800);
    const sourceRefs = refs(raw?.sourceRefs);
    if (!itemSet.has(itemId) || !text || !sourceRefs.length) return null;
    return { itemId, text, sourceRefs };
  };
  return {
    summary: clean(value?.summary, 1600),
    actualProgress: list(value?.actualProgress, 20, raw => {
      const base = withBase(raw);
      if (!base) return null;
      return { ...base, recordType: RECORD_TYPES.includes(raw.recordType) ? raw.recordType : 'OBSERVATION' };
    }),
    accumulations: list(value?.accumulations, 20, raw => {
      const base = withBase(raw);
      if (!base) return null;
      const kind = ['ASSET_CREATED', 'ASSET_REUSED', 'RELATIONSHIP_MAINTAINED', 'STATE_MAINTAINED'].includes(raw.kind)
        ? raw.kind : 'STATE_MAINTAINED';
      return { ...base, kind };
    }),
    observations: list(value?.observations, 20, raw => {
      const base = withBase(raw);
      return base ? { ...base, inference: raw.inference === true } : null;
    }),
    nextSteps: list(value?.nextSteps, 5, raw => {
      const itemId = clean(raw?.itemId, 2);
      const action = clean(raw?.action || raw?.text, 800);
      const sourceRefs = refs(raw?.sourceRefs);
      if (!itemSet.has(itemId) || !action || !sourceRefs.length) return null;
      const mode = ['CONTINUE', 'ADJUST', 'STOP'].includes(raw.mode) ? raw.mode : 'CONTINUE';
      return { itemId, action, mode, sourceRefs };
    })
  };
}

module.exports = {
  DEFAULT_ITEMS,
  RECORD_TYPES,
  SECTIONS,
  TEMPLATE_VERSION,
  WEEKLY_REVIEW_PROMPT,
  ensureDefaultLifeOsItems,
  listDiaryLifeOsLinks,
  normalizeLifeOsLinks,
  normalizeWeeklyReview,
  syncDiaryLifeOsLinks,
  weekStart
};
