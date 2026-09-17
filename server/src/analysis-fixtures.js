'use strict';

const CATEGORY_PATTERNS = [
  ['relationship', /朋友|家人|父母|伴侣|前任|女朋友|男朋友|关系|见面|误会|吵架|同事|孩子/u],
  ['work', /工作|项目|代码|部署|测试|客户|公司|创业|产品|会议|交付|Codex|EvoX|SURFPLUS/ui],
  ['health', /睡眠|睡了|失眠|头痛|疼|身体|生病|医院|运动|跑步|焦虑|压力|情绪|出汗|饮食/u],
  ['finance', /基金|股票|投入|余额|收益|亏损|定投|资金|财务|支付宝|本金|现金/u],
  ['positive', /开心|高兴|轻松|天气很好|散步|喜欢|满足|幸福|惊喜|舒服/u]
];

function classifyDiary(content) {
  const text = String(content || '');
  const matches = CATEGORY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  return matches.length > 1 ? 'multi_topic' : (matches[0] || 'ordinary');
}

function selectDiverseFixtures(rows, count = 24) {
  const limit = Math.max(1, Math.min(60, Number(count) || 24));
  const buckets = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const category = classifyDiary(row?.content);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(row);
  }
  for (const values of buckets.values()) {
    values.sort((left, right) => Number(Boolean(right.has_user_adoption)) - Number(Boolean(left.has_user_adoption))
      || String(right.occurred_at || '').localeCompare(String(left.occurred_at || '')));
  }
  const categoryOrder = ['relationship', 'work', 'health', 'finance', 'positive', 'ordinary', 'multi_topic']
    .filter(category => buckets.has(category));
  const selected = [];
  while (selected.length < limit) {
    let added = false;
    for (const category of categoryOrder) {
      const next = buckets.get(category).shift();
      if (!next) continue;
      selected.push(next);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }
  return selected;
}

module.exports = { CATEGORY_PATTERNS, classifyDiary, selectDiverseFixtures };
