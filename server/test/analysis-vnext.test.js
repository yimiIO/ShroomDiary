'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildSourceIndex, runAnalysisVNext } = require('../src/analysis-vnext');
const { buildAddressedSource, runAnalysisB2 } = require('../src/analysis-b2');
const { createExperimentCaller, runComparison, runLegacyReplay } = require('../src/analysis-experiment');
const { classifyDiary, selectDiverseFixtures } = require('../src/analysis-fixtures');

test('analysis B2 sends one complete addressed diary source without a duplicate source index', async () => {
  const calls = [];
  const diary = {
    id: 'diary-b2-source',
    content: '昨晚没有睡好，今天本来想跑步，但最后没去。\n我准备今晚早点休息。',
    diaryDate: '2026-09-18'
  };
  const addressed = buildAddressedSource(diary.content);

  const result = await runAnalysisB2({
    diary,
    observers: [{ id: 'first-principles', presetKey: 'first_principles', name: '第一性原理' }],
    callJson: async (system, input, label, options) => {
      calls.push({ system, input, label, options });
      if (label.includes('综合')) {
        return {
          synthesis: { primaryInsights: [], additionalInsights: [], caveats: [] },
          todoCandidates: [],
          cardSuggestion: { shouldCreate: false, existingMatches: [] },
          healthExtraction: {},
          inquiryCandidates: [],
          compoundLinks: []
        };
      }
      return { observations: [] };
    }
  });

  assert.deepEqual(addressed.index.map(item => item.id), ['D1:P01', 'D1:P02']);
  assert.equal(addressed.index[1].start, diary.content.indexOf('我准备'));
  assert.match(calls[0].input.diarySource.text, /^\[D1:P01\]/u);
  assert.match(calls[0].input.diarySource.text, /\[D1:P02\] 我准备今晚早点休息。/u);
  assert.equal(calls[0].input.diary, undefined);
  assert.equal(calls[0].input.sourceIndex, undefined);
  assert.equal(JSON.stringify(calls[0].input).match(/昨晚没有睡好/gu)?.length, 1);
  assert.equal(result.diary.content, diary.content);
  assert.deepEqual(result.sourceIndex, addressed.index);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.temperature, 0.2);
  assert.equal(calls[1].options.temperature, 0.1);
});

test('analysis B2 gives each observer only the context needed for its judgment', async () => {
  const calls = [];
  const context = {
    cards: [{ id: 'card-1', seedSentence: '不应进入观察席' }],
    inquiries: [{ id: 'question-1', question: '不应进入观察席' }],
    compoundDirections: [{ id: 'plan-1', name: '长期训练计划' }],
    lifeOsClauses: [{ id: 'rule-1', text: '规则高于情绪' }],
    lifeOsMarkdown: '旧版完整人生 OS',
    priorSourceRecords: [{ id: 'prior-1', text: '上周也记录过失眠。', informationType: 'SOURCE_EXPRESSION' }],
    observerContexts: { custom: { relevantNotes: ['用户明确选择的一条相关资料'] } },
    experimentalOutputs: [{ statement: '不能作为证据的模型推断' }]
  };
  await runAnalysisB2({
    diary: { id: 'd-context', content: '今天又没有睡好。', diaryDate: '2026-09-18' },
    context,
    observers: [
      { id: 'first', presetKey: 'first_principles', name: '第一性原理' },
      { id: 'compound', presetKey: 'compound', name: '人生复利' },
      { id: 'os', presetKey: 'life_os', name: '人生 OS' },
      { id: 'bio', presetKey: 'biological', name: '生物驱动' },
      { id: 'custom', name: '自定义' }
    ],
    callJson: async (system, input, label) => {
      calls.push({ system, input, label });
      return label.includes('综合')
        ? { synthesis: {}, todoCandidates: [], inquiryCandidates: [], compoundLinks: [] }
        : { observations: [] };
    }
  });

  const observers = calls.filter(call => !call.label.includes('综合'));
  assert.deepEqual(observers[0].input.context, {});
  assert.deepEqual(observers[1].input.context, { compoundDirections: context.compoundDirections });
  assert.deepEqual(observers[2].input.context, { lifeOsClauses: context.lifeOsClauses });
  assert.deepEqual(observers[3].input.context, { priorSourceRecords: context.priorSourceRecords });
  assert.deepEqual(observers[4].input.context, context.observerContexts.custom);
  assert.ok(observers.every(call => call.input.context.cards === undefined));
  assert.ok(observers.every(call => call.input.context.inquiries === undefined));
  assert.match(observers[3].system, /没有提供[^。]*不能判断/u);
});

test('analysis B2 keeps evidence as the minimum contract and only adds limits when needed', async () => {
  let observerPrompt = '';
  const result = await runAnalysisB2({
    diary: { id: 'd-contract', content: '用户说自己今天很生气。', diaryDate: '2026-09-18' },
    observers: [{ id: 'first', presetKey: 'first_principles', name: '第一性原理' }],
    callJson: async (system, input, label) => {
      if (label.includes('综合')) {
        return { synthesis: {}, todoCandidates: [], inquiryCandidates: [], compoundLinks: [] };
      }
      observerPrompt = system;
      return {
        reason: '不应进入空结果或展示结果',
        observations: [
          {
            statement: '用户直接说自己今天很生气。',
            informationType: 'SOURCE_EXPRESSION',
            evidenceRefs: ['D1:P01'],
            actorScope: '',
            temporalScope: '',
            alternativeExplanations: [],
            missingInformation: []
          },
          {
            statement: '不能仅凭这一次生气推断稳定关系模式。',
            informationType: 'INTERPRETATION',
            evidenceRefs: ['D1:P01', 'D1:P99'],
            actorScope: 'USER',
            temporalScope: '本次记录',
            alternativeExplanations: ['也可能只是一次情境反应'],
            missingInformation: ['缺少跨时间记录']
          }
        ]
      };
    }
  });

  const [plain, inferred] = result.observations[0].observations;
  assert.deepEqual(plain, {
    statement: '用户直接说自己今天很生气。',
    informationType: 'SOURCE_EXPRESSION',
    adoptionStatus: 'UNREVIEWED',
    evidenceRefs: ['D1:P01']
  });
  assert.deepEqual(inferred.evidenceRefs, ['D1:P01']);
  assert.equal(inferred.actorScope, 'USER');
  assert.equal(inferred.temporalScope, '本次记录');
  assert.deepEqual(inferred.alternativeExplanations, ['也可能只是一次情境反应']);
  assert.deepEqual(inferred.missingInformation, ['缺少跨时间记录']);
  assert.equal(Object.hasOwn(result.observations[0], 'reason'), false);
  assert.match(observerPrompt, /最多 2 条/u);
  assert.match(observerPrompt, /删掉这条/u);
  assert.match(observerPrompt, /不适用时[^。]*空数组/u);
  assert.match(observerPrompt, /替代解释最多 1 条/u);
  assert.match(observerPrompt, /缺失信息最多 2 条/u);
});

test('analysis B2 rejects an observer that overfills the guardrail instead of silently truncating it', async () => {
  await assert.rejects(() => runAnalysisB2({
    diary: { id: 'd-overflow', content: '今天发生了一件事。', diaryDate: '2026-09-18' },
    observers: [{ id: 'first', presetKey: 'first_principles', name: '第一性原理' }],
    callJson: async () => ({
      observations: [1, 2, 3].map(number => ({
        statement: `不同观察 ${number}`,
        informationType: 'INTERPRETATION',
        evidenceRefs: ['D1:P01']
      }))
    })
  }), /观察席最多保留 2 条/u);
});

test('analysis B2 uses its sixth call for deduplicated synthesis and the complete candidate contract', async () => {
  let finalCall;
  const result = await runAnalysisB2({
    diary: {
      id: 'd-complete',
      content: '我仍然在意她。\n明天核对余额。\n昨晚只睡了四小时。',
      diaryDate: '2026-09-18'
    },
    context: {
      cards: [{ id: 'card-1', seedSentence: '把感情和资源授权分开' }],
      inquiries: [{ id: 'inquiry-1', question: '我为什么总在关系里失去边界？', inquiryType: 'GENERAL' }],
      compoundDirections: [{ id: 'item-1', stableKey: '01', name: '财务安全' }],
      lifeOsMarkdown: '不需要进入最终候选调用的完整 OS'
    },
    observers: [{ id: 'first', presetKey: 'first_principles', name: '第一性原理' }],
    callJson: async (system, input, label) => {
      if (!label.includes('综合')) {
        return {
          observations: [{
            statement: '在意关系与是否继续授权资源是两个决定。',
            informationType: 'INTERPRETATION',
            evidenceRefs: ['D1:P01']
          }]
        };
      }
      finalCall = { system, input, label };
      return {
        synthesis: {
          primaryInsights: [{
            statement: '在意关系与是否继续授权资源是两个决定。',
            informationType: 'INTERPRETATION',
            evidenceRefs: ['D1:P01']
          }],
          additionalInsights: [{
            statement: '在意关系与是否继续授权资源是两个决定。',
            informationType: 'INTERPRETATION',
            evidenceRefs: ['D1:P01']
          }, {
            statement: '准备核对余额不等于已经完成。',
            informationType: 'SOURCE_EXPRESSION',
            evidenceRefs: ['D1:P02']
          }],
          caveats: []
        },
        todoCandidates: [{ title: '核对余额', projectKey: 'INBOX_PROJECT', tags: [], source: '明天核对余额。' }],
        cardSuggestion: { shouldCreate: false, reason: '已有菇卡可承接', existingMatches: [{ cardId: 'card-1' }] },
        healthExtraction: {
          lifestyleFactors: [{ factor: '睡眠四小时', category: 'SLEEP', evidenceExcerpt: '昨晚只睡了四小时。', certainty: 'EXPLICIT' }]
        },
        inquiryCandidates: [{ question: '我为什么总在关系里失去边界？', confidence: 0.8, existingInquiryId: 'inquiry-1', inquiryType: 'GENERAL' }],
        compoundLinks: [{ itemId: '01', recordType: 'PLAN', evidenceExcerpt: '明天核对余额。', summary: '财务计划' }]
      };
    }
  });

  assert.equal(finalCall.label, 'analysis B2 · 综合与候选');
  assert.match(finalCall.system, /todoCandidates/u);
  assert.match(finalCall.system, /healthExtraction/u);
  assert.match(finalCall.system, /首屏[^。]*候选/u);
  assert.match(finalCall.system, /用户已经分析得很完整[^。]*不能[^。]*空/u);
  assert.match(finalCall.system, /逐段检查[^。]*身体变化/u);
  assert.match(finalCall.system, /只返回一个 JSON 根对象/u);
  assert.doesNotMatch(finalCall.system, /最多 2 条，不适用时/u);
  assert.equal(JSON.stringify(finalCall.input).match(/明天核对余额/gu)?.length, 1);
  assert.deepEqual(finalCall.input.existingCards.map(item => item.id), ['card-1']);
  assert.deepEqual(finalCall.input.existingInquiries.map(item => item.id), ['inquiry-1']);
  assert.deepEqual(finalCall.input.compoundDirections.map(item => item.stableKey), ['01']);
  assert.equal(finalCall.input.lifeOsMarkdown, undefined);
  assert.equal(result.synthesis.primaryInsights.length, 1);
  assert.deepEqual(result.synthesis.additionalInsights.map(item => item.statement), ['准备核对余额不等于已经完成。']);
  assert.equal(result.synthesis.primaryInsights[0].adoptionStatus, 'UNREVIEWED');
  assert.equal(result.followup.todoCandidates.length, 1);
  assert.equal(result.followup.cardSuggestion.existingMatches.length, 1);
  assert.equal(result.followup.healthExtraction.lifestyleFactors.length, 1);
  assert.equal(result.followup.inquiryCandidates.length, 1);
  assert.equal(result.followup.compoundLinks.length, 1);
  assert.equal(result.followup.synthesis, undefined);
});

test('analysis B2 allows zero synthesis but rejects unmerged overflow', async () => {
  const base = {
    diary: { id: 'd-synthesis-limit', content: '今天只是正常吃饭和散步。', diaryDate: '2026-09-18' },
    observers: []
  };
  const empty = await runAnalysisB2({
    ...base,
    callJson: async () => ({
      synthesis: { primaryInsights: [], additionalInsights: [], caveats: [] },
      todoCandidates: [], inquiryCandidates: [], compoundLinks: []
    })
  });
  assert.deepEqual(empty.synthesis.primaryInsights, []);
  assert.deepEqual(empty.synthesis.additionalInsights, []);

  await assert.rejects(() => runAnalysisB2({
    ...base,
    callJson: async () => ({
      synthesis: {
        primaryInsights: [1, 2].map(number => ({
          statement: `主要理解 ${number}`,
          informationType: 'INTERPRETATION',
          evidenceRefs: ['D1:P01']
        })),
        additionalInsights: [1, 2, 3].map(number => ({
          statement: `补充理解 ${number}`,
          informationType: 'INTERPRETATION',
          evidenceRefs: ['D1:P01']
        }))
      }
    })
  }), /必须真正取舍/u);
});

test('analysis B2 applies the same evidence and existing-record guards as the product candidate flow', async () => {
  const result = await runAnalysisB2({
    diary: {
      id: 'd-candidate-guards',
      content: '昨晚只睡了四小时。\n明天核对余额。',
      diaryDate: '2026-09-18'
    },
    observers: [],
    context: {
      cards: [{ id: 'card-real', seedSentence: '先核对事实', tags: ['核对'] }],
      inquiries: [{ id: 'inquiry-real', question: '我的睡眠为何反复波动？', inquiryType: 'PHYSICAL_HEALTH' }],
      compoundDirections: [{ id: 'item-real', stableKey: '17', name: '建立财务纪律与缓冲' }]
    },
    callJson: async () => ({
      synthesis: {},
      todoCandidates: [{ title: '核对余额' }],
      cardSuggestion: {
        shouldCreate: false,
        existingMatches: [{ cardId: 'card-real' }, { cardId: 'hallucinated-card' }]
      },
      healthExtraction: {
        lifestyleFactors: [
          { factor: '睡眠四小时', category: 'SLEEP', evidenceExcerpt: '昨晚只睡了四小时。', certainty: 'EXPLICIT' },
          { factor: '每天喝酒', category: 'ALCOHOL', evidenceExcerpt: '原文没有这句话', certainty: 'EXPLICIT' }
        ]
      },
      inquiryCandidates: [
        { question: '我的睡眠为何反复波动？', confidence: 0.8, inquiryType: 'PHYSICAL_HEALTH', existingInquiryId: 'inquiry-real' },
        { question: '一个低置信问题？', confidence: 0.2, inquiryType: 'GENERAL' }
      ],
      compoundLinks: [
        { itemId: '17', recordType: 'PLAN', evidenceExcerpt: '明天核对余额。', summary: '计划核对' },
        { itemId: '17', recordType: 'ACTION', evidenceExcerpt: '已经完成核对', summary: '虚构完成' }
      ]
    })
  });

  assert.deepEqual(result.followup.cardSuggestion.existingMatches.map(item => item.cardId), ['card-real']);
  assert.deepEqual(result.followup.healthExtraction.lifestyleFactors.map(item => item.factor), ['睡眠四小时']);
  assert.equal(result.followup.inquiryCandidates.length, 1);
  assert.equal(result.followup.inquiryCandidates[0].suggestedInquiryId, 'inquiry-real');
  assert.equal(result.followup.compoundLinks.length, 1);
  assert.equal(result.followup.compoundLinks[0].itemKey, '17');
});

test('analysis B2 longitudinal context excludes superseded model interpretations and keeps corrected source records', async () => {
  let biologicalInput;
  await runAnalysisB2({
    diary: { id: 'd-later', content: '今天的情况和以前不一样。', diaryDate: '2026-09-18' },
    observers: [{ id: 'bio', presetKey: 'biological', name: '生物驱动' }],
    context: {
      priorSourceRecords: [
        { id: 'old-source', text: '旧人物身份错误', informationType: 'SOURCE_EXPRESSION', sourceValid: false },
        { id: 'old-model', text: '用户存在稳定模式', informationType: 'INTERPRETATION' },
        { id: 'corrected-source', text: '用户已纠正人物身份', informationType: 'SOURCE_EXPRESSION', sourceValid: true }
      ]
    },
    callJson: async (system, input, label) => {
      if (label.includes('综合')) return { synthesis: {}, todoCandidates: [], inquiryCandidates: [], compoundLinks: [] };
      biologicalInput = input;
      return { observations: [] };
    }
  });

  assert.deepEqual(biologicalInput.context.priorSourceRecords.map(item => item.id), ['corrected-source']);
});

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
          usage: {
            prompt_tokens: 120,
            completion_tokens: 8,
            total_tokens: 128,
            prompt_cache_hit_tokens: 80,
            prompt_cache_miss_tokens: 40,
            prompt_tokens_details: { cached_tokens: 80 },
            completion_tokens_details: { reasoning_tokens: 3 }
          }
        })
      };
    }
  });

  const output = await caller.callJson('system', { diary: 'text' }, 'test', { model: 'model-a' });

  assert.deepEqual(output, { observations: [] });
  assert.equal(fetchCalls.length, 1);
  assert.equal(caller.calls[0].model, 'model-a');
  assert.equal(caller.calls[0].totalTokens, 128);
  assert.deepEqual(caller.calls[0].usageDetails, {
    promptCacheHitTokens: 80,
    promptCacheMissTokens: 40,
    cachedPromptTokens: 80,
    reasoningTokens: 3
  });
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
      context: {
        cards: [{ id: 'card-real', seedSentence: '保持节奏', tags: [] }],
        inquiries: [], compoundDirections: [], sourceActivities: []
      }
    },
    model: 'model-a',
    callJson: async (system, input, label, options) => {
      labels.push({ system, label, options });
      return label.includes('综合') ? {
        todoCandidates: [],
        cardSuggestion: {
          shouldCreate: false,
          existingMatches: [{ cardId: 'card-real' }, { cardId: 'hallucinated' }]
        }
      } : { observations: [] };
    }
  });

  assert.equal(result.mode, 'READ_ONLY_LEGACY_REPLAY');
  assert.equal(labels.length, 3);
  assert.equal(labels[0].system, '当前提示词一');
  assert.ok(labels.every(item => item.options.usageContext.billable === false));
  assert.deepEqual(result.followup.cardSuggestion.existingMatches.map(item => item.cardId), ['card-real']);
  assert.ok(Array.isArray(result.followup.healthExtraction.physicalObservations));
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
