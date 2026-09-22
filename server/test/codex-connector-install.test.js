'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildCodexConnectCommand,
  connectorSource,
  installerScript
} = require('../src/codex-connector-install');

test('copied Codex command bootstraps the connector before pairing', () => {
  const command = buildCodexConnectCommand('https://shroom.example.com/', 'ABCDE12345');

  assert.equal(
    command,
    'curl -fsSL \'https://shroom.example.com/api/data-sources/v1/codex/install\' | sh -s -- connect --server \'https://shroom.example.com\' --code \'ABCDE12345\''
  );
  assert.doesNotMatch(command, /^shroom-codex /);
});

test('installer verifies prerequisites and installs the official connector', () => {
  const connector = connectorSource();
  const installer = installerScript('https://shroom.example.com');

  assert.match(connector, /async function connect\(options\)/);
  assert.match(connector, /StartCalendarInterval/);
  assert.match(connector, /<integer>19<\/integer>/);
  assert.match(connector, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(connector, /sync<\/string>[\s\S]*--force<\/string>/);
  assert.match(installer, /command -v node/);
  assert.match(installer, /Node\.js 20/);
  assert.match(installer, /codex\/connector/);
  assert.match(installer, /createHash\('sha256'\)/);
  assert.match(installer, /shroom-codex/);
  assert.match(installer, /exec "\$launcher_path" "\$@"/);
});

test('connect command rejects unsafe origins and codes', () => {
  assert.throws(() => buildCodexConnectCommand('javascript:alert(1)', 'ABCDE12345'));
  assert.throws(() => buildCodexConnectCommand('https://shroom.example.com', 'ABC; rm -rf'));
});

test('installer downloads, verifies and launches the connector without a prior install', async t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-codex-install-test-'));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const server = http.createServer((req, res) => {
    if (req.url === '/api/data-sources/v1/codex/connector') return res.end(connectorSource());
    res.statusCode = 404;
    return res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const installRoot = path.join(temporaryRoot, 'install');
  const binRoot = path.join(temporaryRoot, 'bin');
  const child = spawn('/bin/sh', ['-s', '--', 'unsupported'], {
    env: {
      ...process.env,
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      SHROOM_CODEX_BIN_DIR: binRoot,
      SHROOM_CODEX_INSTALL_ROOT: installRoot
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(installerScript(origin));
  const exitCode = await new Promise(resolve => child.on('close', resolve));

  assert.equal(exitCode, 1);
  assert.match(stderr, /用法：shroom-codex connect/);
  assert.ok(fs.existsSync(path.join(installRoot, 'shroom-codex.js')));
  assert.ok(fs.existsSync(path.join(binRoot, 'shroom-codex')));
});

test('installer and connector endpoints stay public so a fresh Codex can bootstrap', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'data-sources.js'), 'utf8');
  const authBoundary = route.indexOf('router.use(requireUser)');

  assert.ok(route.indexOf('router.get(\'/codex/install\'') < authBoundary);
  assert.ok(route.indexOf('router.get(\'/codex/connector\'') < authBoundary);
  assert.doesNotMatch(route, /pairingCode:\s*code/);
});
