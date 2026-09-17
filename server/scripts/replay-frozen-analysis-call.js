#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createExperimentCaller } = require('../src/analysis-experiment');

function options(argv) {
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

async function replayFrozenCalls({ cases, repetitions, caller }) {
  const runs = [];
  for (const item of cases) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const start = caller.calls.length;
      try {
        const output = await caller.callJson(
          String(item.system || ''),
          item.input,
          `frozen final call · ${item.id}`,
          { model: String(item.model || ''), temperature: Number(item.temperature ?? 0.1) }
        );
        runs.push({
          id: String(item.id || ''),
          repetition,
          status: 'SUCCEEDED',
          output,
          calls: caller.calls.slice(start)
        });
      } catch (error) {
        runs.push({
          id: String(item.id || ''),
          repetition,
          status: 'FAILED',
          errorCode: String(error?.code || ''),
          error: String(error?.message || error),
          calls: caller.calls.slice(start)
        });
      }
    }
  }
  return { generatedAt: new Date().toISOString(), repetitions, runs };
}

async function main() {
  const args = options(process.argv.slice(2));
  if (!args.input || !args.output) {
    throw new Error('Usage: --input <private-json> --output <private-json> [--repetitions 3]');
  }
  const apiBaseUrl = process.env.AI_API_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  if (!apiBaseUrl || !apiKey) throw new Error('AI_API_BASE_URL and AI_API_KEY are required');
  const payload = JSON.parse(fs.readFileSync(path.resolve(args.input), 'utf8'));
  const cases = Array.isArray(payload.cases) ? payload.cases : [];
  if (!cases.length) throw new Error('frozen replay input requires cases');
  const repetitions = Math.max(1, Math.min(10, Number(args.repetitions || 1)));
  const caller = createExperimentCaller({ apiBaseUrl, apiKey });
  const result = await replayFrozenCalls({ cases, repetitions, caller });
  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), { mode: 0o600 });
  process.stdout.write(`${outputPath}\n`);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { replayFrozenCalls };
