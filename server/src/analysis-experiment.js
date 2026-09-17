'use strict';

const crypto = require('node:crypto');
const { parseJsonContent } = require('./ai-json');
const { FOLLOWUP_PROMPT } = require('./ai-prompts');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function prepareFixtureForReplay(fixture) {
  const prepared = clone(fixture);
  const cutoff = Date.parse(prepared.analysisAsOf || '');
  const exclusions = { futureItems: 0 };
  if (Number.isFinite(cutoff) && prepared.context && typeof prepared.context === 'object') {
    for (const [key, value] of Object.entries(prepared.context)) {
      if (!Array.isArray(value)) continue;
      prepared.context[key] = value.filter(item => {
        const availableAt = Date.parse(item?.availableAt || item?.createdAt || '');
        if (Number.isFinite(availableAt) && availableAt > cutoff) {
          exclusions.futureItems += 1;
          return false;
        }
        return true;
      });
    }
  }
  return { prepared, exclusions };
}

function createExperimentCaller({ apiBaseUrl, apiKey, fetchImpl = global.fetch, timeoutMs = 120000 }) {
  if (!apiBaseUrl || !apiKey) throw new Error('experiment caller requires API configuration');
  if (typeof fetchImpl !== 'function') throw new Error('experiment caller requires fetch');
  const endpoint = String(apiBaseUrl).replace(/\/$/u, '').endsWith('/chat/completions')
    ? String(apiBaseUrl).replace(/\/$/u, '')
    : `${String(apiBaseUrl).replace(/\/$/u, '')}/chat/completions`;
  const calls = [];
  const callJson = async (system, input, label, options = {}) => {
    const model = String(options.model || '').trim();
    if (!model) throw new Error('experiment call requires a model');
    const started = Date.now();
    const inputText = typeof input === 'string' ? input : JSON.stringify(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 120000));
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: Number.isFinite(options.temperature) ? options.temperature : 0.35,
          max_tokens: Math.max(500, Math.min(8000, Number(options.maxTokens || 3000))),
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          messages: [
            { role: 'system', content: String(system || '') },
            { role: 'user', content: inputText }
          ]
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `${label} failed (${response.status})`);
      const content = payload?.choices?.[0]?.message?.content;
      const parsed = parseJsonContent(Array.isArray(content)
        ? content.map(item => item?.text || item?.content || '').join('')
        : String(content || ''));
      const usage = payload?.usage || {};
      calls.push({
        id: crypto.randomUUID(),
        label: String(label || ''),
        model,
        durationMs: Date.now() - started,
        promptTokens: Number(usage.prompt_tokens || 0),
        completionTokens: Number(usage.completion_tokens || 0),
        totalTokens: Number(usage.total_tokens || 0),
        request: { system: String(system || ''), input: clone(input) },
        output: clone(parsed),
        status: 'SUCCEEDED'
      });
      return parsed;
    } catch (error) {
      calls.push({
        id: crypto.randomUUID(),
        label: String(label || ''),
        model,
        durationMs: Date.now() - started,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        error: String(error?.message || error),
        status: 'FAILED'
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
  return { callJson, calls };
}

async function runLegacyReplay({ fixture, callJson, model }) {
  if (!fixture?.diary?.content) throw new Error('legacy replay requires diary content');
  if (typeof callJson !== 'function') throw new Error('legacy replay requires a model caller');
  const context = fixture.context || {};
  const observers = Array.isArray(fixture.observers) ? fixture.observers : [];
  const usageContext = { billable: false, feature: 'analysis_vnext_experiment' };
  const diary = {
    content: String(fixture.diary.content),
    mood: fixture.diary.mood || null,
    occurredAt: fixture.diary.occurredAt || fixture.diary.occurred_at || null
  };
  const sourceActivities = Array.isArray(context.sourceActivities) ? context.sourceActivities : [];
  const observations = [];
  const fiveViews = {};
  for (let index = 0; index < observers.length; index += 1) {
    const observer = observers[index];
    const input = { diary, sourceActivities };
    if (['compound', 'life_os'].includes(observer.renderType)) input.lifeOs = context.lifeOsMarkdown || '';
    const result = await callJson(
      String(observer.prompt || ''),
      input,
      `legacy replay · ${observer.name || observer.id || index + 1}`,
      { model, usageContext }
    );
    observations.push({ observer: clone(observer), result: clone(result) });
    fiveViews[`v${index + 1}`] = { ...clone(result), view: index + 1 };
  }
  const followup = await callJson(
    FOLLOWUP_PROMPT,
    {
      diary,
      sourceActivities,
      fiveViews,
      observations,
      existingCards: Array.isArray(context.cards) ? context.cards : [],
      existingInquiries: Array.isArray(context.inquiries) ? context.inquiries : [],
      compoundDirections: Array.isArray(context.compoundDirections) ? context.compoundDirections : []
    },
    'legacy replay · 综合',
    { model, usageContext }
  );
  return {
    mode: 'READ_ONLY_LEGACY_REPLAY',
    diary: clone(fixture.diary),
    observations,
    followup: clone(followup)
  };
}

async function runComparison({ fixture, variants = [], repetitions = 1, now = () => new Date() }) {
  if (!fixture || !fixture.diary) throw new Error('comparison requires a fixture with a diary');
  if (!Array.isArray(variants) || !variants.length) throw new Error('comparison requires variants');
  const repeatCount = Math.max(1, Math.min(10, Number(repetitions) || 1));
  const { prepared, exclusions } = prepareFixtureForReplay(fixture);
  const startedAt = now().toISOString();
  const runs = [];
  for (let repetition = 1; repetition <= repeatCount; repetition += 1) {
    for (const variant of variants) {
      if (!variant?.id || typeof variant.execute !== 'function') throw new Error('invalid comparison variant');
      const input = clone(prepared);
      const started = Date.now();
      try {
        const output = await variant.execute(input, { repetition });
        runs.push({
          id: crypto.randomUUID(),
          variantId: String(variant.id),
          repetition,
          status: 'SUCCEEDED',
          durationMs: Date.now() - started,
          output: clone(output)
        });
      } catch (error) {
        runs.push({
          id: crypto.randomUUID(),
          variantId: String(variant.id),
          repetition,
          status: 'FAILED',
          durationMs: Date.now() - started,
          error: String(error?.message || error)
        });
      }
    }
  }
  return {
    experimentVersion: 'analysis-vnext-comparison-v1',
    fixtureId: String(fixture.id || fixture.diary.id || ''),
    contextFidelity: String(fixture.contextFidelity || 'UNSPECIFIED'),
    contextExclusions: exclusions,
    startedAt,
    completedAt: now().toISOString(),
    repetitions: repeatCount,
    runs
  };
}

module.exports = { createExperimentCaller, prepareFixtureForReplay, runComparison, runLegacyReplay };
