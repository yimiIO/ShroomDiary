'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const envPath = process.argv[2];
const baseUrl = process.argv[3];
const model = process.argv[4];

if (!envPath || !baseUrl || !model) {
  process.stderr.write('Usage: node configure_ai.js <env-path> <base-url> <model>\n');
  process.exit(1);
}

function replaceEnv(source, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(source) ? source.replace(pattern, line) : `${source.trimEnd()}\n${line}\n`;
}

const reader = readline.createInterface({ input: process.stdin, terminal: false });
reader.once('line', apiKey => {
  reader.close();
  if (!apiKey.trim()) {
    process.stderr.write('AI API key must not be empty\n');
    process.exitCode = 1;
    return;
  }
  let source = fs.readFileSync(envPath, 'utf8');
  source = replaceEnv(source, 'AI_API_BASE_URL', baseUrl.replace(/\/$/, ''));
  source = replaceEnv(source, 'AI_API_KEY', apiKey.trim());
  source = replaceEnv(source, 'AI_MODEL', model);
  const temporaryPath = path.join(path.dirname(envPath), `.${path.basename(envPath)}.${process.pid}.tmp`);
  fs.writeFileSync(temporaryPath, source, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporaryPath, envPath);
  fs.chmodSync(envPath, 0o600);
  process.stdout.write(JSON.stringify({ ok: true, baseUrl: baseUrl.replace(/\/$/, ''), model }) + '\n');
});
