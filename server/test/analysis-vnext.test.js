'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildSourceIndex, runAnalysisVNext } = require('../src/analysis-vnext');
const { createExperimentCaller, runComparison, runLegacyReplay } = require('../src/analysis-experiment');
const { classifyDiary, selectDiverseFixtures } = require('../src/analysis-fixtures');

test('analysis vNext is read-only and accepts a useful zero-insight result', async () => {
  const calls = [];
  const result = await runAnalysisVNext({
    diary: {
      id: 'diary-1',
      content: '今天沿着海边走了一会儿。',
      diaryDate: '2026-09-17'
    },
    observers: [{ id: 'first-principles', name: '第一性原理', prompt: '观察这篇日记' }],
    callJson: async (system, input, label, options) => {
      calls.push({ system, input, label, options });
      if (label.includes('综合')) {
        return { primaryInsights: [], additionalInsights: [], caveats: [] };
      }
      return { applicable: false, observations: [], reason: '这篇记录不需要额外解释。' };
    }
  });

  assert.equal(result.mode, 'READ_ONLY_EXPERIMENT');
  assert.equal(result.diary.content, '今天沿着海边走了一会儿。');
  assert.deepEqual(result.synthesis.primaryInsights, []);
  assert.deepEqual(result.observations[0].observations, []);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options?.usageContext?.billable === false));
  assert.ok(calls.every(call => call.options?.usageContext?.feature === 'analysis_vnext_experiment'));
});

test('analysis vNext keeps raw source location and never turns adoption into fact', async () => {
  const diary = {
    id: 'diary-2',
    content: '她说最近不想见面。\n我准备周末再问一次。',
    diaryDate: '2026-09-17'
  };
  const sourceIndex = buildSourceIndex(diary.content);
  const result = await runAnalysisVNext({
    diary,
    observers: [{ id: 'relationship', name: '关系视角', prompt: '区分事实和解释' }],
    callJson: async (system, input, label) => {
      if (label.includes('综合')) return { primaryInsights: [], additionalInsights: [], caveats: [] };
      return {
        applicable: true,
        observations: [{
          statement: '用户可能把一次拒绝理解为关系整体恶化。',
          informationType: 'INTERPRETATION',
          adoptionStatus: 'ADOPTED',
          actorScope: 'USER',
          evidenceRefs: ['S1', 'S99']
        }]
      };
    }
  });

  assert.deepEqual(sourceIndex.map(item => item.id), ['S1', 'S2']);
  assert.equal(sourceIndex[0].text, '她说最近不想见面。');
  assert.equal(sourceIndex[1].start, diary.content.indexOf('我准备'));
  assert.deepEqual(result.sourceIndex, sourceIndex);
  assert.deepEqual(result.observations[0].observations[0].evidenceRefs, ['S1']);
  assert.equal(result.observations[0].observations[0].informationType, 'INTERPRETATION');
  assert.equal(result.observations[0].observations[0].adoptionStatus, 'UNREVIEWED');
  assert.equal(Object.hasOwn(result.observations[0].observations[0], 'eventId'), false);
});

test('analysis vNext limits the first screen without dropping additional valid insights', async () => {
  const result = await runAnalysisVNext({
    diary: {
      id: 'diary-3',
      content: '我仍然在意她。钱的约定没有说清。我准备明天核对余额。',
      diaryDate: '2026-09-17'
    },
    observers: [],
    callJson: async () => ({
      primaryInsights: [
        { statement: '感情和资源授权可以分开决定。', evidenceRefs: ['S1', 'S2'], informationType: 'INTERPRETATION' },
        { statement: '准备核对不等于已经完成。', evidenceRefs: ['S3'], informationType: 'SOURCE_EXPRESSION' },
        { statement: '资金约定仍有信息缺口。', evidenceRefs: ['S2'], informationType: 'INTERPRETATION' }
      ],
      additionalInsights: [
        { statement: '感情和资源授权可以分开决定。', evidenceRefs: ['S1'], adoptionStatus: 'ADOPTED' }
      ],
      caveats: []
    })
  });

  assert.equal(result.synthesis.primaryInsights.length, 2);
  assert.equal(result.synthesis.additionalInsights.length, 1);
  assert.equal(result.synthesis.additionalInsights[0].statement, '资金约定仍有信息缺口。');
  assert.equal(result.synthesis.primaryInsights[0].adoptionStatus, 'UNREVIEWED');
  assert.deepEqual(result.synthesis.primaryInsights[0].evidenceRefs, ['S1', 'S2']);
});

test('comparison runs keep every variant and repetition isolated', async () => {
  const fixture = {
    id: 'fixture-1',
    diary: { id: 'd1', content: '今天完成了一次训练。', diaryDate: '2026-09-17' },
    context: { cards: [{ id: 'c1', title: '保持节奏' }] }
  };
  const seenCardCounts = [];
  const variants = [
    {
      id: 'A',
      execute: async input => {
        seenCardCounts.push(input.context.cards.length);
        input.context.cards.push({ id: 'pollution' });
        return { ok: true };
      }
    },
    {
      id: 'B',
      execute: async input => {
        seenCardCounts.push(input.context.cards.length);
        return { ok: true };
      }
    }
  ];

  const comparison = await runComparison({ fixture, variants, repetitions: 2 });

  assert.deepEqual(seenCardCounts, [1, 1, 1, 1]);
  assert.equal(comparison.runs.length, 4);
  assert.deepEqual(fixture.context.cards, [{ id: 'c1', title: '保持节奏' }]);
  assert.ok(comparison.runs.every(run => run.status === 'SUCCEEDED'));
});

test('reconstructed replay excludes context created after the diary analysis time', async () => {
  let received;
  const comparison = await runComparison({
    fixture: {
      id: 'fixture-time',
      contextFidelity: 'RECONSTRUCTED',
      analysisAsOf: '2026-09-10T23:00:00+08:00',
      diary: { id: 'd-time', content: '那天我有点犹豫。', diaryDate: '2026-09-10' },
      context: {
        cards: [
          { id: 'old', availableAt: '2026-09-01T10:00:00+08:00' },
          { id: 'future', availableAt: '2026-09-12T10:00:00+08:00' }
        ]
      }
    },
    variants: [{ id: 'A', execute: async input => { received = input; return { ok: true }; } }]
  });

  assert.deepEqual(received.context.cards.map(item => item.id), ['old']);
  assert.equal(comparison.contextFidelity, 'RECONSTRUCTED');
  assert.equal(comparison.contextExclusions.futureItems, 1);
});

test('experiment model caller records usage without using the production billing ledger', async () => {
  const fetchCalls = [];
  const caller = createExperimentCaller({
    apiBaseUrl: 'https://model.example/v1',
    apiKey: 'private-key',
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"observations":[]}' } }],
          usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 }
        })
      };
    }
  });

  const output = await caller.callJson('system', { diary: 'text' }, 'test', { model: 'model-a' });

  assert.deepEqual(output, { observations: [] });
  assert.equal(fetchCalls.length, 1);
  assert.equal(caller.calls[0].model, 'model-a');
  assert.equal(caller.calls[0].totalTokens, 128);
  assert.equal(Object.hasOwn(caller.calls[0], 'apiKey'), false);
  assert.equal(Object.hasOwn(caller.calls[0], 'authorization'), false);
});

test('legacy comparison replay uses current prompts without production writes', async () => {
  const labels = [];
  const result = await runLegacyReplay({
    fixture: {
      diary: { id: 'legacy-diary', content: '今天完成训练。', mood: '平静', occurredAt: '2026-09-17T10:00:00+08:00' },
      observers: [
        { id: 'o1', name: '观察一', prompt: '当前提示词一', renderType: 'custom' },
        { id: 'o2', name: '观察二', prompt: '当前提示词二', renderType: 'custom' }
      ],
      context: { cards: [], inquiries: [], compoundDirections: [], sourceActivities: [] }
    },
    model: 'model-a',
    callJson: async (system, input, label, options) => {
      labels.push({ system, label, options });
      return label.includes('综合') ? { todoCandidates: [] } : { observations: [] };
    }
  });

  assert.equal(result.mode, 'READ_ONLY_LEGACY_REPLAY');
  assert.equal(labels.length, 3);
  assert.equal(labels[0].system, '当前提示词一');
  assert.ok(labels.every(item => item.options.usageContext.billable === false));
});

test('later vNext replays cannot use earlier experimental interpretations as evidence', async () => {
  const inputs = [];
  await runAnalysisVNext({
    diary: { id: 'day-2', content: '今天发生了与昨天判断相反的事情。', diaryDate: '2026-09-18' },
    observers: [{ id: 'o1', name: '观察', prompt: '观察变化' }],
    context: {
      priorSourceRecords: [{ id: 'day-1', text: '昨天我很担心。', informationType: 'SOURCE_EXPRESSION' }],
      experimentalOutputs: [{ statement: '用户存在稳定的回避模式。', informationType: 'INTERPRETATION' }],
      previousModelOutputs: [{ statement: '这是另一个模型推断。' }]
    },
    callJson: async (system, input, label) => {
      inputs.push(input);
      return label.includes('综合')
        ? { primaryInsights: [], additionalInsights: [], caveats: [] }
        : { applicable: false, observations: [] };
    }
  });

  assert.equal(inputs[0].context.experimentalOutputs, undefined);
  assert.equal(inputs[0].context.previousModelOutputs, undefined);
  assert.equal(inputs[0].context.priorSourceRecords.length, 1);
});

test('private fixture sampling covers different diary situations instead of only recent relationship entries', () => {
  const rows = [
    { id: 'r1', content: '今天和朋友谈了很久，我们把误会说开了。', occurred_at: '2026-09-17' },
    { id: 'w1', content: '今天完成了项目部署和测试。', occurred_at: '2026-09-16', has_user_adoption: true },
    { id: 'h1', content: '昨晚只睡四小时，今天头痛。', occurred_at: '2026-09-15' },
    { id: 'f1', content: '今天核对基金投入和余额。', occurred_at: '2026-09-14' },
    { id: 'p1', content: '天气很好，散步时很开心。', occurred_at: '2026-09-13' },
    { id: 'o1', content: '买菜，回家，整理房间。', occurred_at: '2026-09-12' }
  ];
  const selected = selectDiverseFixtures(rows, 6);

  assert.equal(classifyDiary(rows[0].content), 'relationship');
  assert.equal(selected.length, 6);
  assert.deepEqual(new Set(selected.map(item => classifyDiary(item.content))).size, 6);
  assert.ok(selected.some(item => item.has_user_adoption));
});
