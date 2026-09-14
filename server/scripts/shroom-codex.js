#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const configPath = process.env.SHROOM_CODEX_CONFIG ||
  path.join(os.homedir(), '.config', 'shroom', 'codex-source.json');
const launchAgentLabel = 'com.shroom.codex-sync';

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function launchAgentSource(options = {}) {
  const nodePath = options.nodePath || process.execPath;
  const scriptPath = options.scriptPath || __filename;
  const logDir = options.logDir || path.join(os.homedir(), 'Library', 'Logs', 'Shroom');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${launchAgentLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(nodePath)}</string>
    <string>${xml(scriptPath)}</string>
    <string>sync</string>
    <string>--force</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>19</integer><key>Minute</key><integer>0</integer></dict>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(path.join(logDir, 'codex-sync.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(logDir, 'codex-sync-error.log'))}</string>
</dict>
</plist>
`;
}

function installLaunchAgent() {
  if (process.platform !== 'darwin') {
    process.stdout.write('菇日记 · 当前系统不是 macOS，请自行每天 19:00 运行 shroom-codex sync --force。\n');
    return { installed: false, reason: 'unsupported_platform' };
  }
  const userId = typeof process.getuid === 'function' ? process.getuid() : null;
  if (!Number.isInteger(userId)) throw new Error('无法确定当前 macOS 用户');
  const agentDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'Shroom');
  const plistPath = path.join(agentDir, `${launchAgentLabel}.plist`);
  fs.mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(plistPath, launchAgentSource({ logDir }), { mode: 0o600 });
  fs.chmodSync(plistPath, 0o600);

  const domain = `gui/${userId}`;
  spawnSync('launchctl', ['bootout', domain, plistPath], { stdio: 'ignore' });
  const loaded = spawnSync('launchctl', ['bootstrap', domain, plistPath], { encoding: 'utf8' });
  if (loaded.status !== 0) {
    throw new Error(`19:00 后台同步安装失败：${String(loaded.stderr || loaded.stdout || 'launchctl bootstrap failed').trim()}`);
  }
  process.stdout.write('菇日记 · 已设置每天 19:00 同步；关机或休眠错过后，会在本机当天恢复运行时补拉。\n');
  return { installed: true, plistPath };
}

function parseArgs(argv) {
  const result = { command: argv[2] || 'sync' };
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    result[key.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return result;
}

function cleanOrigin(value) {
  const origin = String(value || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(origin)) throw new Error('--server 必须是 http(s) 地址');
  return origin;
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function writeConfig(value) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(configPath, 0o600);
}

async function api(origin, endpoint, options = {}) {
  const response = await fetch(`${origin}/api/data-sources/v1${endpoint}`, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.code !== 200) {
    throw new Error(body?.message || `菇日记请求失败（${response.status}）`);
  }
  return body.data;
}

function codexBinary() {
  const candidates = [
    process.env.CODEX_BINARY,
    '/Applications/ChatGPT.app/Contents/Resources/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    'codex'
  ].filter(Boolean);
  return candidates.find(candidate => candidate === 'codex' || fs.existsSync(candidate)) || 'codex';
}

class AppServer {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.process = spawn(codexBinary(), ['app-server'], { stdio: ['pipe', 'pipe', 'inherit'] });
    const lines = readline.createInterface({ input: this.process.stdout });
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch (error) { return; }
      if (message.id === undefined) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message || 'Codex app-server 请求失败'));
      else entry.resolve(message.result);
    });
    this.process.on('exit', code => {
      for (const entry of this.pending.values()) entry.reject(new Error(`Codex app-server 已退出（${code}）`));
      this.pending.clear();
    });
    this.process.on('error', error => {
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    });
  }

  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method, params = {}) {
    this.process.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async start() {
    await this.request('initialize', {
      clientInfo: { name: 'shroom-codex', title: '菇日记 · Codex 数据源', version: '1.0.0' }
    });
    this.notify('initialized');
  }

  close() {
    this.process.stdin.end();
  }
}

function sourceKind(thread) {
  const value = thread.threadSource || thread.source;
  if (typeof value === 'string') return value;
  return value?.type || value?.kind || '';
}

function taskTitle(thread, index) {
  const title = String(thread.name || thread.preview || 'Codex 任务').replace(/\s+/g, ' ').trim();
  return index ? `${title} · 后续 ${index + 1}` : title;
}

function mapTurn(thread, turn, index) {
  if (!['completed', 'interrupted', 'failed'].includes(turn.status)) return null;
  const completedAt = turn.completedAt || thread.updatedAt;
  if (!completedAt) return null;
  const startedAt = turn.startedAt || null;
  const durationMs = turn.durationMs ?? (startedAt ? Math.max(0, (completedAt - startedAt) * 1000) : null);
  return {
    externalId: `${thread.id}:${turn.id}`,
    title: taskTitle(thread, index),
    projectLabel: thread.cwd ? path.basename(thread.cwd) : '',
    sourceKind: sourceKind(thread),
    startedAt: startedAt ? new Date(startedAt * 1000).toISOString() : null,
    completedAt: new Date(completedAt * 1000).toISOString(),
    taskRuntimeSeconds: durationMs === null ? null : Math.round(durationMs / 1000),
    activeSecondsEstimate: null,
    outcomeStatus: { completed: 'COMPLETED', interrupted: 'INTERRUPTED', failed: 'FAILED' }[turn.status],
    metadata: { category: 'codex_task', reusable: false, automated: false }
  };
}

async function listChangedThreads(client, sinceSeconds, firstSyncDays) {
  const byId = new Map();
  for (const archived of [false, true]) {
    let cursor;
    let done = false;
    while (!done) {
      const response = await client.request('thread/list', {
        archived, cursor, limit: 100, sortKey: 'updated_at', sortDirection: 'desc'
      });
      for (const thread of response.data || []) {
        const updatedAt = Number(thread.updatedAt || 0);
        const cutoff = sinceSeconds ? sinceSeconds - 2 : Math.floor(Date.now() / 1000) - firstSyncDays * 86400;
        if (updatedAt <= cutoff) { done = true; break; }
        if (!thread.parentThreadId && !String(thread.name || '').includes('菇日记 · Codex 数据源同步')) {
          byId.set(thread.id, thread);
        }
      }
      cursor = response.nextCursor;
      if (!cursor) done = true;
    }
  }
  return [...byId.values()];
}

async function sync(options = {}) {
  const stored = readConfig();
  const sourceConfig = await api(stored.server, '/codex/config', {
    headers: { 'x-shroom-source-token': stored.token }
  });
  if (!options.force && sourceConfig.lastSyncAt) {
    const elapsedHours = (Date.now() - new Date(sourceConfig.lastSyncAt).getTime()) / 3600000;
    if (elapsedHours < sourceConfig.syncIntervalHours - (10 / 60)) {
      process.stdout.write(`菇日记 · Codex 数据源尚未到同步时间（频率 ${sourceConfig.syncIntervalHours} 小时）\n`);
      return;
    }
  }
  const client = new AppServer();
  try {
    await client.start();
    const since = Number(stored.lastThreadUpdatedAt || 0);
    const firstSyncDays = Math.max(1, Number(options.days) || 90);
    const eventCutoff = since ? since - 2 : Math.floor(Date.now() / 1000) - firstSyncDays * 86400;
    const threads = await listChangedThreads(client, since, firstSyncDays);
    const events = [];
    let newest = since;
    for (const summary of threads) {
      const response = await client.request('thread/read', { threadId: summary.id, includeTurns: true });
      const thread = response.thread || response;
      newest = Math.max(newest, Number(thread.updatedAt || 0));
      (thread.turns || []).forEach((turn, index) => {
        const event = mapTurn(thread, turn, index);
        if (event && (new Date(event.completedAt).getTime() / 1000) > eventCutoff) events.push(event);
      });
    }
    for (let index = 0; index < events.length; index += 200) {
      await api(stored.server, '/codex/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shroom-source-token': stored.token },
        body: JSON.stringify({ events: events.slice(index, index + 200), cursor: String(newest) })
      });
    }
    if (!events.length) {
      await api(stored.server, '/codex/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shroom-source-token': stored.token },
        body: JSON.stringify({ events: [], cursor: String(newest) })
      });
    }
    writeConfig({ ...stored, lastThreadUpdatedAt: newest, lastSyncAt: new Date().toISOString() });
    process.stdout.write(`菇日记 · Codex 数据源同步完成：${events.length} 条任务记录\n`);
  } finally {
    client.close();
  }
}

async function connect(options) {
  const server = cleanOrigin(options.server);
  const code = String(options.code || '').trim();
  if (!code) throw new Error('缺少 --code');
  const paired = await api(server, '/codex/pair', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, deviceName: os.hostname() })
  });
  writeConfig({ server, token: paired.token, connectionId: paired.connectionId, lastThreadUpdatedAt: 0 });
  process.stdout.write('菇日记已连接 Codex，开始首次同步。\n');
  await sync(options);
  installLaunchAgent();
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.command === 'connect') return connect(options);
  if (options.command === 'sync') return sync(options);
  if (options.command === 'schedule') return installLaunchAgent();
  throw new Error('用法：shroom-codex connect --server <菇日记地址> --code <配对码> [--days 90]\n      shroom-codex sync [--force]\n      shroom-codex schedule');
}

main().catch(error => {
  process.stderr.write(`菇日记 · Codex 数据源同步失败：${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { installLaunchAgent, launchAgentSource };
