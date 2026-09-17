#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DEFAULT_OBSERVERS } = require('../src/observer-presets');
const { runAnalysisVNext, VNEXT_OBSERVER_TASKS, VERSION } = require('../src/analysis-vnext');
const {
  createExperimentCaller,
  runComparison,
  runLegacyReplay
} = require('../src/analysis-experiment');
const { estimateAiCost } = require('../src/ai-pricing');

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    result[key] = next && !next.startsWith('--') ? argv[++index] : true;
  }
  return result;
}

function observersFor(fixture, vNext = false) {
  const observers = Array.isArray(fixture.observers) && fixture.observers.length
    ? fixture.observers : DEFAULT_OBSERVERS;
  if (!vNext) return observers;
  return observers.map(observer => ({
    ...observer,
    vNextPrompt: VNEXT_OBSERVER_TASKS[observer.presetKey]
      || `从用户指定的「${observer.name || '自定义'}」角度观察：${observer.description || observer.instructions || ''}`
  }));
}

function summarizeCalls(calls, at = new Date()) {
  const totals = calls.reduce((sum, call) => ({
    promptTokens: sum.promptTokens + Number(call.promptTokens || 0),
    completionTokens: sum.completionTokens + Number(call.completionTokens || 0),
    totalTokens: sum.totalTokens + Number(call.totalTokens || 0),
    durationMs: sum.durationMs + Number(call.durationMs || 0)
  }), { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 });
  const model = calls[0]?.model || '';
  const estimate = estimateAiCost({
    provider: 'deepseek',
    model,
    usage: {
      prompt_tokens: totals.promptTokens,
      completion_tokens: totals.completionTokens,
      total_tokens: totals.totalTokens
    },
    at
  });
  return { ...totals, model, estimatedCostCny: estimate.costCny, priced: estimate.priced };
}

function variant({ id, promptVersion, model, fixtureTransform, execute, caller }) {
  return {
    id,
    execute: async fixture => {
      const start = caller.calls.length;
      const prepared = fixtureTransform(fixture);
      const analysis = await execute(prepared, model, caller.callJson);
      const calls = caller.calls.slice(start);
      return {
        promptVersion,
        model,
        analysis,
        calls,
        usage: summarizeCalls(calls)
      };
    }
  };
}

function blindReview(comparisons) {
  const entries = [];
  const key = [];
  for (const comparison of comparisons) {
    const shuffled = [...comparison.runs].sort(() => crypto.randomInt(0, 3) - 1);
    for (const run of shuffled) {
      const blindId = crypto.randomBytes(4).toString('hex');
      entries.push({
        blindId,
        fixtureId: comparison.fixtureId,
        repetition: run.repetition,
        output: run.output?.analysis || null,
        scoring: {
          fidelity: null,
          understandingValue: null,
          usefulInformationRetention: null,
          readingExperience: null,
          importantError: null,
          notes: ''
        }
      });
      key.push({ blindId, variantId: run.variantId, runId: run.id });
    }
  }
  return { entries, key };
}

async function main() {
  const options = args(process.argv.slice(2));
  if (!options.fixture) throw new Error('Usage: --fixture <private-json> [--output <private-dir>]');
  const apiBaseUrl = process.env.AI_API_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const currentModel = String(options['current-model'] || process.env.AI_MODEL || 'deepseek-v4-flash');
  const candidateModel = String(options['candidate-model'] || 'deepseek-v4-pro');
  const repetitions = Math.max(1, Math.min(10, Number(options.repetitions || 1)));
  const payload = JSON.parse(fs.readFileSync(path.resolve(options.fixture), 'utf8'));
  const allFixtures = Array.isArray(payload) ? payload : (Array.isArray(payload.fixtures) ? payload.fixtures : [payload]);
  const requestedLimit = Number(options.limit || allFixtures.length);
  const fixtures = allFixtures.slice(0, Math.max(1, Math.min(allFixtures.length, requestedLimit)));
  const outputDir = path.resolve(options.output || path.join(
    __dirname,
    '..',
    '.local',
    'analysis-vnext',
    new Date().toISOString().replace(/[:.]/gu, '-')
  ));
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const caller = createExperimentCaller({ apiBaseUrl, apiKey });
  const comparisons = [];
  for (const fixture of fixtures) {
    const variants = [
      variant({
        id: 'A_CURRENT_MODEL_CURRENT_PROMPT', promptVersion: 'production-current', model: currentModel, caller,
        fixtureTransform: value => ({ ...value, observers: observersFor(value, false) }),
        execute: (value, selectedModel, callJson) => runLegacyReplay({ fixture: value, model: selectedModel, callJson })
      }),
      variant({
        id: 'B_CURRENT_MODEL_VNEXT_PROMPT', promptVersion: VERSION, model: currentModel, caller,
        fixtureTransform: value => ({ ...value, observers: observersFor(value, true) }),
        execute: (value, selectedModel, callJson) => runAnalysisVNext({
          diary: value.diary,
          observers: value.observers,
          sourceActivities: value.context?.sourceActivities || [],
          context: value.context || {},
          model: selectedModel,
          callJson
        })
      }),
      variant({
        id: 'C_CANDIDATE_MODEL_CURRENT_PROMPT', promptVersion: 'production-current', model: candidateModel, caller,
        fixtureTransform: value => ({ ...value, observers: observersFor(value, false) }),
        execute: (value, selectedModel, callJson) => runLegacyReplay({ fixture: value, model: selectedModel, callJson })
      }),
      variant({
        id: 'D_CANDIDATE_MODEL_VNEXT_PROMPT', promptVersion: VERSION, model: candidateModel, caller,
        fixtureTransform: value => ({ ...value, observers: observersFor(value, true) }),
        execute: (value, selectedModel, callJson) => runAnalysisVNext({
          diary: value.diary,
          observers: value.observers,
          sourceActivities: value.context?.sourceActivities || [],
          context: value.context || {},
          model: selectedModel,
          callJson
        })
      })
    ];
    comparisons.push(await runComparison({ fixture, variants, repetitions }));
  }
  const review = blindReview(comparisons);
  fs.writeFileSync(path.join(outputDir, 'comparison.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    currentModel,
    candidateModel,
    repetitions,
    comparisons
  }, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(outputDir, 'blind-review.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    dimensions: ['fidelity', 'understandingValue', 'usefulInformationRetention', 'readingExperience'],
    entries: review.entries
  }, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(outputDir, 'blind-key.json'), JSON.stringify(review.key, null, 2), { mode: 0o600 });
  process.stdout.write(`${outputDir}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
