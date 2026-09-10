'use strict';

const AREAS = [
  '核心取向',
  '决策与取舍',
  '能量与节律',
  '关系与边界',
  '工作与创造',
  '成长与复盘'
];

const LIFE_OS_DRAFT_PROMPT = `你是 Shroom 的「人生 OS 提炼器」。你要从用户多篇日记和多张菇卡中，找出跨时间、跨情境重复出现的上层选择逻辑。

它不是日记摘要，也不是菇卡合集：
- 日记记录「发生了什么」；
- 菇卡记录「一个具体情境中，什么理解和做法可以复用」；
- 人生 OS 只保留「跨情境如何判断、取舍、保护边界和复盘」的少量上层原则。

规则：
1. 每条原则至少引用 2 个输入中真实存在的 source key；不得创造 key。
2. 一次性情绪、单次事件、待办、口号、对他人的评价都不应进入人生 OS。
3. 如果证据冲突，写入 tensions，不要强行归纳。
4. 原则要是上层判断标准，boundary 说明不适用或例外的情况，reviewQuestion 用来未来复盘。
5. area 只能是：核心取向、决策与取舍、能量与节律、关系与边界、工作与创造、成长与复盘。
6. confidence 只能是 high、medium 或 emerging。
7. 保守输出 3–8 条真正稳定的原则；证据不足宁可少写。

只返回 JSON：
{"summary":"对当前上层模式的简短说明","principles":[{"area":"能量与节律","principle":"上层判断原则","boundary":"适用边界或例外","reviewQuestion":"未来复盘时问自己的问题","evidence":["D1","D2"],"confidence":"medium"}],"tensions":["仍需观察的冲突"]}`;

function clean(value, max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeLifeOsDraft(payload, sources) {
  const sourceMap = new Map((Array.isArray(sources) ? sources : []).map(source => [source.key, source]));
  const principles = (Array.isArray(payload?.principles) ? payload.principles : [])
    .slice(0, 12)
    .map(item => {
      const evidence = [...new Set((Array.isArray(item?.evidence) ? item.evidence : [])
        .map(value => clean(value, 20)).filter(key => sourceMap.has(key)))];
      if (evidence.length < 2) return null;
      const principle = clean(item?.principle, 500);
      if (!principle) return null;
      const area = AREAS.includes(clean(item?.area, 40)) ? clean(item.area, 40) : '核心取向';
      const confidence = ['high', 'medium', 'emerging'].includes(item?.confidence) ? item.confidence : 'emerging';
      return {
        area,
        principle,
        boundary: clean(item?.boundary, 500),
        reviewQuestion: clean(item?.reviewQuestion, 500),
        evidence,
        evidenceLabels: evidence.map(key => clean(sourceMap.get(key).label, 160) || key),
        confidence
      };
    })
    .filter(Boolean);

  const usedKeys = [...new Set(principles.flatMap(item => item.evidence))];
  const sourceRefs = usedKeys.map(key => sourceMap.get(key)).filter(Boolean).map(source => ({
    type: source.type,
    id: String(source.id)
  }));

  return {
    summary: clean(payload?.summary, 1200),
    principles,
    tensions: (Array.isArray(payload?.tensions) ? payload.tensions : []).map(value => clean(value, 500)).filter(Boolean).slice(0, 8),
    sourceRefs
  };
}

function confidenceLabel(value) {
  return { high: '稳定', medium: '较稳定', emerging: '待观察' }[value] || '待观察';
}

function buildLifeOsMarkdown(draft) {
  const lines = [
    '# 我的人生 OS',
    '',
    '> 这是我的跨情境的选择系统：用来判断、取舍、保护边界和复盘，不是日记摘要或菇卡合集。',
    '',
    '## 当前摘要',
    '',
    draft.summary || '尚未形成足够稳定的上层模式。'
  ];
  let index = 0;
  for (const area of AREAS) {
    const items = draft.principles.filter(item => item.area === area);
    if (!items.length) continue;
    lines.push('', `## ${area}`);
    for (const item of items) {
      index += 1;
      lines.push('', `### ${String(index).padStart(2, '0')} · ${item.principle}`);
      if (item.boundary) lines.push('', `- 适用边界：${item.boundary}`);
      if (item.reviewQuestion) lines.push(`- 复盘问题：${item.reviewQuestion}`);
      lines.push(`- 稳定度：${confidenceLabel(item.confidence)}`);
      lines.push(`- 证据：${item.evidenceLabels.join('、')}`);
    }
  }
  if (draft.tensions.length) {
    lines.push('', '## 仍在观察', '');
    for (const tension of draft.tensions) lines.push(`- ${tension}`);
  }
  return lines.join('\n').trim();
}

module.exports = {
  AREAS,
  LIFE_OS_DRAFT_PROMPT,
  buildLifeOsMarkdown,
  normalizeLifeOsDraft
};
