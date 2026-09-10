'use strict';

const { AREAS } = require('./life-os-draft');

const CHANGE_TYPES = ['keep', 'rewrite', 'merge', 'move_to_card', 'observe', 'retire'];
const BASIS_TYPES = ['chosen', 'observed', 'mixed'];
const CONFIDENCE_TYPES = ['high', 'medium', 'emerging'];
const MAX_ACTIVE_CLAUSES = 50;

const LIFE_OS_REVIEW_PROMPT = `你是 Shroom 的「人生 OS 整理器」。你的任务不是继续增加原则，而是把当前人生 OS 整理成更少、更清楚、真正能帮助跨情境判断的当前版本。

四类对象必须严格区分：
- 日记：保存发生过的经历；
- 待观察：AI 尚未被用户确认的模式假设；
- 菇卡：可以带到下一次相似时刻的理解、提醒或观察视角。菇卡不是行动、待办或承诺；
- 人生 OS：用户当前认可的价值排序、决策标准和边界，回答「什么才叫更好」。

整理规则：
1. proposedPrinciples 应是整理后的完整当前版本，理想 5–9 条，最多 50 条；证据不足时可以更少。
2. 新原则不是追加到旧原则后面。重复项要合并，具体情境内容应建议 move_to_card，不再认可或已被替代的内容应建议 retire。
3. 只有能影响真实取舍、跨至少两类情境成立、移除后会改变判断的内容，才进入人生 OS。
4. 用户主动选择的价值可以标记 chosen，不需要伪造行为证据；从经历推断的规律标记 observed，必须引用至少 2 个真实 source key；两者兼有标记 mixed。
5. 每条原则必须写清适用边界。遇到真实冲突写进 tensions 或 observe，不可强行合并。
6. sourceClauses 只能引用输入中的当前原则 key；evidence 和 counterEvidence 只能引用输入中的 source key，不得创造。
7. changes 必须解释每条旧原则的去向：keep、rewrite、merge、move_to_card、observe 或 retire。
8. cardDrafts 只保存值得复用的理解，不生成行动、待办、截止日期或执行承诺；它们只是建议，不能自动创建。
9. 语言使用第一人称、可修订、避免人格诊断和「你就是」式定性。

area 只能是：核心取向、决策与取舍、能量与节律、关系与边界、工作与创造、成长与复盘。

只返回 JSON：
{"summary":"本次整理的核心判断","proposedPrinciples":[{"key":"N1","area":"决策与取舍","principle":"第一人称上层判断标准","boundary":"适用边界或例外","reviewQuestion":"未来复盘问题","basis":"chosen|observed|mixed","confidence":"high|medium|emerging","sourceClauses":["O1"],"evidence":["D1","D2"],"counterEvidence":[]}],"changes":[{"type":"keep|rewrite|merge|move_to_card|observe|retire","fromClauses":["O1"],"toPrinciple":"N1","title":"简短变化说明","reason":"为什么这样处理"}],"cardDrafts":[{"key":"K1","fromClauses":["O3"],"seedSentence":"可复用的理解或提醒","myUnderstanding":"它来自什么经历、在什么情境可能有帮助","tags":["标签"]}],"tensions":["仍需观察的真实张力"]}`;

function clean(value, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function unique(values) {
  return [...new Set(values)];
}

function validKeys(value, keyMap) {
  return unique((Array.isArray(value) ? value : []).map(item => clean(item, 24)).filter(key => keyMap.has(key)));
}

function normalizeReviewPlan(payload, sources, currentClauses) {
  const sourceMap = new Map((Array.isArray(sources) ? sources : []).map(source => [source.key, source]));
  const clauseMap = new Map((Array.isArray(currentClauses) ? currentClauses : []).map(clause => [clause.key, clause]));
  const keyMap = new Map();

  const principles = (Array.isArray(payload?.proposedPrinciples) ? payload.proposedPrinciples : [])
    .slice(0, MAX_ACTIVE_CLAUSES)
    .map((item, index) => {
      const principle = clean(item?.principle, 600);
      if (!principle) return null;
      let key = clean(item?.key, 24) || `N${index + 1}`;
      if (keyMap.has(key)) key = `N${index + 1}`;
      keyMap.set(key, true);
      const sourceClauseKeys = validKeys(item?.sourceClauses, clauseMap);
      const evidenceKeys = validKeys(item?.evidence, sourceMap);
      const counterEvidenceKeys = validKeys(item?.counterEvidence, sourceMap);
      const basis = BASIS_TYPES.includes(item?.basis) ? item.basis : 'observed';
      if (basis === 'observed' && evidenceKeys.length < 2 && !sourceClauseKeys.length) return null;
      const inheritedRefs = sourceClauseKeys.flatMap(sourceKey => clauseMap.get(sourceKey).sourceRefs || []);
      const sourceRefs = uniqueRefs([
        ...evidenceKeys.map(sourceKey => refFromSource(sourceMap.get(sourceKey))),
        ...inheritedRefs
      ]);
      return {
        key,
        area: AREAS.includes(clean(item?.area, 40)) ? clean(item.area, 40) : '核心取向',
        principle,
        boundary: clean(item?.boundary, 600),
        reviewQuestion: clean(item?.reviewQuestion, 600),
        basis,
        confidence: CONFIDENCE_TYPES.includes(item?.confidence) ? item.confidence : 'emerging',
        sourceClauseKeys,
        sourceClauseIds: sourceClauseKeys.map(sourceKey => clauseMap.get(sourceKey).id).filter(Boolean),
        evidenceKeys,
        evidenceLabels: evidenceKeys.map(sourceKey => clean(sourceMap.get(sourceKey).label, 180)),
        counterEvidenceKeys,
        counterEvidenceLabels: counterEvidenceKeys.map(sourceKey => clean(sourceMap.get(sourceKey).label, 180)),
        sourceRefs,
        counterSourceRefs: uniqueRefs(counterEvidenceKeys.map(sourceKey => refFromSource(sourceMap.get(sourceKey))))
      };
    })
    .filter(Boolean);

  const principleKeys = new Set(principles.map(item => item.key));
  const changes = (Array.isArray(payload?.changes) ? payload.changes : []).slice(0, 40).map(item => {
    const type = CHANGE_TYPES.includes(item?.type) ? item.type : 'observe';
    return {
      type,
      fromClauseKeys: validKeys(item?.fromClauses, clauseMap),
      toPrinciple: principleKeys.has(clean(item?.toPrinciple, 24)) ? clean(item.toPrinciple, 24) : null,
      title: clean(item?.title, 240),
      reason: clean(item?.reason, 800)
    };
  }).filter(item => item.title || item.reason || item.fromClauseKeys.length);

  const cardDrafts = (Array.isArray(payload?.cardDrafts) ? payload.cardDrafts : []).slice(0, 12).map((item, index) => {
    const seedSentence = clean(item?.seedSentence, 500);
    if (!seedSentence) return null;
    return {
      key: clean(item?.key, 24) || `K${index + 1}`,
      fromClauseKeys: validKeys(item?.fromClauses, clauseMap),
      seedSentence,
      myUnderstanding: clean(item?.myUnderstanding, 5000),
      tags: unique((Array.isArray(item?.tags) ? item.tags : []).map(tag => clean(tag, 80)).filter(Boolean)).slice(0, 12)
    };
  }).filter(Boolean);

  const allSourceRefs = uniqueRefs(principles.flatMap(item => [...item.sourceRefs, ...item.counterSourceRefs]));
  return {
    summary: clean(payload?.summary, 1600),
    principles,
    changes,
    cardDrafts,
    tensions: unique((Array.isArray(payload?.tensions) ? payload.tensions : []).map(item => clean(item, 600)).filter(Boolean)).slice(0, 12),
    sourceRefs: allSourceRefs
  };
}

function refFromSource(source) {
  return source ? { type: source.type, id: String(source.id) } : null;
}

function uniqueRefs(refs) {
  const result = [];
  const seen = new Set();
  for (const ref of refs.filter(Boolean)) {
    if (!['diary', 'card'].includes(ref.type) || !ref.id) continue;
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ type: ref.type, id: String(ref.id) });
  }
  return result;
}

function confidenceLabel(value) {
  return { high: '稳定', medium: '较稳定', emerging: '待观察' }[value] || '待观察';
}

function basisLabel(value) {
  return { chosen: '我主动选择', observed: '经历中形成', mixed: '选择与经历共同形成' }[value] || '经历中形成';
}

function renderLifeOsMarkdown(principles, tensions = []) {
  const active = (Array.isArray(principles) ? principles : []).filter(item => item && item.principle);
  const lines = [
    '# 我的人生 OS',
    '',
    '> 菇卡帮助我在具体时刻做得更好。人生 OS 帮助我决定什么才叫「更好」。',
    '',
    `当前生效 ${active.length} 条原则。它们是我此刻认可、仍可继续修订的判断标准。`
  ];
  let index = 0;
  for (const area of AREAS) {
    const items = active.filter(item => item.area === area);
    if (!items.length) continue;
    lines.push('', `## ${area}`);
    for (const item of items) {
      index += 1;
      lines.push('', `### ${String(index).padStart(2, '0')} · ${clean(item.principle, 600)}`);
      if (item.boundary) lines.push('', `- 适用边界：${clean(item.boundary, 600)}`);
      if (item.reviewQuestion) lines.push(`- 复盘问题：${clean(item.reviewQuestion, 600)}`);
      lines.push(`- 形成方式：${basisLabel(item.basis)}`);
      lines.push(`- 当前状态：${confidenceLabel(item.confidence)}`);
    }
  }
  const observedTensions = (Array.isArray(tensions) ? tensions : []).map(item => clean(item, 600)).filter(Boolean);
  if (observedTensions.length) {
    lines.push('', '## 仍在观察', '');
    for (const tension of observedTensions) lines.push(`- ${tension}`);
  }
  return lines.join('\n').trim();
}

module.exports = {
  BASIS_TYPES,
  CHANGE_TYPES,
  CONFIDENCE_TYPES,
  LIFE_OS_REVIEW_PROMPT,
  MAX_ACTIVE_CLAUSES,
  normalizeReviewPlan,
  renderLifeOsMarkdown,
  uniqueRefs
};
