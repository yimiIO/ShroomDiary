'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  contextSources,
  normalizeContinuation,
  requiresExpandedRetrieval
} = require('../src/ai-result-conversation');
const { loadAiResultOrigin } = require('../src/ai-result-origins');

test('ordinary follow-up reuses the saved result context without asking for retrieval', () => {
  assert.equal(requiresExpandedRetrieval('为什么你会这么判断？'), false);
  assert.equal(requiresExpandedRetrieval('我觉得这里不对，其实后来发生了另一件事。'), false);
  assert.equal(requiresExpandedRetrieval('那你结合我以前的经历再看看？'), true);
  assert.equal(requiresExpandedRetrieval('请检查其他日记和更多记录'), true);
});

test('only supplied evidence references survive and AI analysis is not a source', () => {
  const sources = contextSources({
    sources: [{ sourceRef: 'D1', sourceType: 'DIARY', diaryId: 'd1', sourceVersion: 2, content: '日记原文' }]
  });
  const result = normalizeContinuation({
    answer: '这个判断仍然需要保留边界。',
    insights: [
      { headline: '有原文依据', text: '只能确认原文表达。', evidence: ['D1'] },
      { headline: '无依据推断', text: '不应保留。', evidence: ['AI_RESULT'] }
    ]
  }, { sources, origin: { displayTitle: '继续聊聊' }, currentUserMessage: '为什么？' });
  assert.equal(result.observations.length, 1);
  assert.deepEqual(result.observations[0].evidenceRefs, ['D1']);
  assert.equal(result.sources[0].sourceType, 'DIARY');
});

test('stage cognition keeps an exact user quote and never becomes a fact', () => {
  const message = '我最近觉得自己可能不适合创业，但还不确定。';
  const result = normalizeContinuation({
    answer: '可以先把它作为此刻的想法观察。',
    stageCognition: {
      originalExpression: '我最近觉得自己可能不适合创业',
      interpretation: '用户此刻对创业适配性产生了怀疑。',
      confidence: 'emerging',
      status: 'CONFIRMED'
    }
  }, { sources: [], origin: {}, currentUserMessage: message });
  assert.equal(result.stageCognition.originalExpression, '我最近觉得自己可能不适合创业');
  assert.equal(result.stageCognition.status, 'CANDIDATE');
  assert.equal(result.stageCognition.evidenceNature, 'USER_STAGE_EXPRESSION');

  const fabricated = normalizeContinuation({
    answer: '回答',
    stageCognition: { originalExpression: '用户已经确定不创业', interpretation: '错误补写' }
  }, { sources: [], origin: {}, currentUserMessage: message });
  assert.equal(fabricated.stageCognition, null);
});

test('schema and worker keep raw messages while storing only an auxiliary rolling summary', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../sql/061_ai_result_conversations.sql'), 'utf8');
  const worker = fs.readFileSync(path.join(__dirname, '../src/reflection-worker.js'), 'utf8');
  assert.match(sql, /conversation_summary jsonb/);
  assert.match(worker, /INSERT INTO reflection_messages/);
  assert.match(worker, /AI_GENERATED_CONVERSATION_SUMMARY/);
  assert.doesNotMatch(worker, /DELETE FROM reflection_messages/);
});

test('all initial AI result surfaces use the shared continue component', () => {
  const root = path.join(__dirname, '../../src/pages/shroom');
  for (const file of ['ai-analysis.vue', 'daily-review.vue', 'inquiry.vue']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /<ai-result-continue/);
  }
  const component = fs.readFileSync(path.join(__dirname, '../../src/components/AiResultContinue.vue'), 'utf8');
  assert.match(component, /memoryResultConversations/);
  assert.match(component, /继续聊聊/);
});

test('result origins are resolved by the authenticated user instead of client context', async () => {
  const calls = [];
  const queryable = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{
        id: '11111111-1111-4111-8111-111111111111',
        diary_id: '22222222-2222-4222-8222-222222222222',
        content: '只属于这个账号的日记', content_version: 3, occurred_at: '2026-10-04',
        ai_allowed: true, deleted_at: null, status: 'done', observations: [],
        ai_context_snapshot: {}, five_views: {}, todo_candidates: [], observer_snapshot: []
      }] };
    }
  };
  const origin = await loadAiResultOrigin(queryable, 'owner-user-id', {
    resultType: 'DIARY_ANALYSIS',
    resultId: '11111111-1111-4111-8111-111111111111',
    contextSnapshot: { forged: true },
    userId: 'attacker-user-id'
  });
  assert.equal(origin.type, 'DIARY_ANALYSIS');
  assert.equal(calls[0].values[1], 'owner-user-id');
  assert.match(calls[0].sql, /da\.user_id = \$2/);
  assert.equal(origin.contextSnapshot.forged, undefined);
  assert.equal(origin.contextSnapshot.sources[0].sourceVersion, 3);
});
