'use strict';

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/test';
process.env.TOKEN_SECRET ||= 'daily-review-test-secret';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DAILY_REVIEW_VERSION,
  fallbackDailyReview,
  legacyLifeOsClauses,
  mapInboxReview,
  mapReview,
  normalizeDailyReview,
  sourceFingerprint,
  validReviewDate
} = require('../src/daily-review');
const { dateFromRow, renderReviewHtml, renderReviewText } = require('../src/daily-review-worker');

function context() {
  const value = {
    date: '2026-09-15',
    sources: [
      { key: 'D1', type: 'DIARY', id: 'diary-1', content: '今天确认了方向。' },
      { key: 'C1', type: 'CODEX_TASK', id: 'task-1', title: '整理复用模板' }
    ],
    sourceManifest: [
      { key: 'D1', type: 'DIARY', id: 'diary-1', fingerprint: 'a' },
      { key: 'C1', type: 'CODEX_TASK', id: 'task-1', fingerprint: 'b' }
    ],
    lifeOsClauses: [
      { id: 'os-1', snapshotVersion: 2, area: '取舍', principle: '把时间投向可携带资产', boundary: '紧急安全事项例外' }
    ],
    compoundPlans: [{ id: 'plan-1', updatedAt: '2026-09-15T09:00:00Z' }],
    coverage: { diaryCount: 1, codexTaskCount: 1, completedTodoCount: 0 }
  };
  value.fingerprint = sourceFingerprint(value);
  return value;
}

test('daily review rejects hallucinated evidence and preserves signed Life OS wording', () => {
  const result = normalizeDailyReview({
    criticalReview: {
      issue: '今天做了重复整理', consequence: '挤占关键判断时间',
      recommendation: '下次把整理交给 Codex', sourceRefs: ['C1', 'FAKE']
    },
    headline: '形成了一个可复用模板',
    lifeOsAudit: [{ clauseId: 'os-1', status: 'ALIGNED', reason: '留下模板', sourceRefs: ['C1', 'FAKE'] }],
    ownershipDecisions: [{ task: '重复整理', owner: 'STAFF', reason: '不需要本人判断', sourceRefs: ['FAKE'] }],
    tomorrowAdjustment: { action: '验证一次复用', why: '完成任务还不等于复利', sourceRefs: ['C1'] }
  }, context());

  assert.equal(result.lifeOsAudit[0].principle, '把时间投向可携带资产');
  assert.deepEqual(result.lifeOsAudit[0].sourceRefs, ['C1']);
  assert.deepEqual(result.criticalReview.sourceRefs, ['C1']);
  assert.equal(result.criticalReview.issue, '今天做了重复整理');
  assert.equal(result.ownershipDecisions.length, 0);
  assert.equal(result.tomorrowAdjustment.action, '下次把整理交给 Codex');
});

test('daily review does not invent criticism when the critical evidence reference is invalid', () => {
  const result = normalizeDailyReview({
    criticalReview: {
      issue: '今天做错了关键决定', consequence: '造成损失',
      recommendation: '立刻改方向', sourceRefs: ['FAKE']
    }
  }, context());
  assert.equal(result.criticalReview.issue, '今天没有足够证据指出具体失误');
  assert.deepEqual(result.criticalReview.sourceRefs, []);
  assert.match(result.criticalReview.consequence, /不能为了显得尖锐而编造问题/);
});

test('daily review format version invalidates older generated summaries', () => {
  assert.equal(DAILY_REVIEW_VERSION, 'daily-review-v2-critical-first-r2');
  const original = context();
  const changed = { ...original, sourceManifest: [...original.sourceManifest, { key: 'T1', fingerprint: 'c' }] };
  assert.notEqual(sourceFingerprint(original), sourceFingerprint(changed));
});

test('daily review fills every signed clause with an insufficient-evidence state', () => {
  const result = normalizeDailyReview({}, context());
  assert.equal(result.lifeOsAudit.length, 1);
  assert.equal(result.lifeOsAudit[0].status, 'INSUFFICIENT');
  assert.match(result.factsSummary, /缺少的记录不会被解释为没有行动/);
});

test('legacy signed Life OS keeps original high-priority rules without inventing clauses', () => {
  const clauses = legacyLifeOsClauses(`# 我的人生 OS
## 核心规则
R1【生存优先】任何决策不能进入不可逆风险
R2【长期复利】优先选择可积累资产的事情
* 普通说明
## AI 杠杆
* 任何重复劳动都必须被系统替代
`, 3);
  assert.deepEqual(clauses.map(item => item.principle), [
    'R1【生存优先】任何决策不能进入不可逆风险',
    'R2【长期复利】优先选择可积累资产的事情',
    '任何重复劳动都必须被系统替代'
  ]);
  assert.ok(clauses.every(item => item.snapshotVersion === 3));
  assert.equal(clauses[2].area, 'AI 杠杆');
});

test('fallback review reports coverage without turning Codex completion into real-world success', () => {
  const result = fallbackDailyReview(context());
  assert.match(result.criticalReview.issue, /缺少可验证的现实结果/);
  assert.match(result.factsSummary, /不等于投入时长、现实交付或能力提升/);
  assert.equal(result.lifeOsAudit[0].status, 'INSUFFICIENT');
});

test('review dates are Shanghai dates and cannot point into the future', () => {
  const now = new Date('2026-09-15T12:00:00+08:00');
  assert.equal(validReviewDate('2026-09-15', now), '2026-09-15');
  assert.equal(validReviewDate('2026-09-16', now), null);
  assert.equal(validReviewDate('bad', now), null);
});

test('PostgreSQL date objects keep their Shanghai calendar date', () => {
  const pgDate = new Date('2026-09-13T16:00:00.000Z');
  assert.equal(mapReview({ review_date: pgDate, result: {} }).date, '2026-09-14');
  assert.equal(dateFromRow(pgDate), '2026-09-14');
});

test('ready reviews map to private inbox items without copying their full evidence payload', () => {
  const item = mapInboxReview({
    id: 'review-1',
    review_date: '2026-09-15',
    result: {
      criticalReview: { issue: '重复整理占用了判断时间', recommendation: '下次把整理交给 Codex' },
      headline: '今天留下了一项可复用资产', factsSummary: '完成模板并验证了一次复用。'
    },
    viewed_at: null,
    created_at: '2026-09-15T14:00:00Z',
    updated_at: '2026-09-15T14:01:00Z'
  });
  assert.deepEqual(item, {
    id: 'review-1',
    type: 'DAILY_REVIEW',
    date: '2026-09-15',
    title: '最需要修正：重复整理占用了判断时间',
    preview: '建议：下次把整理交给 Codex',
    unread: true,
    readAt: null,
    availableAt: '2026-09-15T14:01:00Z',
    route: '/pages/shroom/daily-review?date=2026-09-15'
  });
  assert.equal('sources' in item, false);
  assert.equal('result' in item, false);
});

test('email rendering escapes private content and carries the single adjustment', () => {
  const review = {
    date: '2026-09-15', sourceCutoff: '2026-09-15T14:00:00Z',
    result: normalizeDailyReview({
      headline: '<今天>',
      factsSummary: '完成 & 核对',
      criticalReview: {
        issue: '<分散>', consequence: '关键结果没有推进',
        recommendation: '只做一件', sourceRefs: ['D1']
      }
    }, context())
  };
  const html = renderReviewHtml(review);
  const plain = renderReviewText(review);
  assert.doesNotMatch(html, /<今天>/);
  assert.match(html, /&lt;今天&gt;/);
  assert.doesNotMatch(html, /<分散>/);
  assert.match(html, /&lt;分散&gt;/);
  assert.match(plain, /建议｜明天只改这一件\n只做一件/);
  assert.ok(plain.indexOf('今天最需要修正') < plain.indexOf('今日事实（仅作依据）'));
  assert.ok(html.indexOf('今天最需要修正') < html.indexOf('今日事实（仅作依据）'));
  assert.match(plain, /不会自动修改你的人生 OS/);
});
