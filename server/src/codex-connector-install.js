'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const connectorPath = path.join(__dirname, '..', 'scripts', 'shroom-codex.js');

function cleanOrigin(value) {
  const input = String(value || '').trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(input); } catch (error) { throw new Error('Codex 连接地址无效'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.origin !== input) {
    throw new Error('Codex 连接地址无效');
  }
  return input;
}

function cleanPairingCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(code)) throw new Error('Codex 配对码无效');
  return code;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, '\'"\'"\'')}'`;
}

function shellParameter(name, fallback = '') {
  return '$' + `{${name}${fallback ? `:-${fallback}` : ''}}`;
}

function connectorSource() {
  return fs.readFileSync(connectorPath, 'utf8');
}

function buildCodexConnectCommand(origin, pairingCode) {
  const server = cleanOrigin(origin);
  const code = cleanPairingCode(pairingCode);
  const installerUrl = `${server}/api/data-sources/v1/codex/install`;
  return `curl -fsSL ${shellQuote(installerUrl)} | sh -s -- connect --server ${shellQuote(server)} --code ${shellQuote(code)}`;
}

function installerScript(origin) {
  const server = cleanOrigin(origin);
  const source = connectorSource();
  const sourceUrl = `${server}/api/data-sources/v1/codex/connector`;
  const checksum = crypto.createHash('sha256').update(source).digest('hex');
  return [
    '#!/bin/sh',
    'set -eu',
    '',
    'if ! command -v curl >/dev/null 2>&1; then',
    '  printf \'%s\\n\' \'安装失败：需要 curl。\' >&2',
    '  exit 1',
    'fi',
    'if ! command -v node >/dev/null 2>&1; then',
    '  printf \'%s\\n\' \'安装失败：需要 Node.js 20 或更高版本。\' >&2',
    '  exit 1',
    'fi',
    'node_major="$(node -p "Number(process.versions.node.split(\'.\')[0])")"',
    'if [ "$node_major" -lt 20 ]; then',
    '  printf \'%s\\n\' \'安装失败：需要 Node.js 20 或更高版本。\' >&2',
    '  exit 1',
    'fi',
    '',
    `connector_url=${shellQuote(sourceUrl)}`,
    `connector_sha256=${shellQuote(checksum)}`,
    `user_home="${shellParameter('HOME')}"`,
    'if [ -z "$user_home" ]; then',
    '  printf \'%s\\n\' \'安装失败：无法确定用户目录。\' >&2',
    '  exit 1',
    'fi',
    `install_root="${shellParameter('SHROOM_CODEX_INSTALL_ROOT', '$user_home/.local/share/shroom-codex')}"`,
    `bin_root="${shellParameter('SHROOM_CODEX_BIN_DIR', '$user_home/.local/bin')}"`,
    `temp_root="$(mktemp -d "${shellParameter('TMPDIR', '/tmp')}/shroom-codex.XXXXXX")"`,
    'trap \'rm -rf "$temp_root"\' EXIT HUP INT TERM',
    'download_path="$temp_root/shroom-codex.js"',
    'curl -fsSL "$connector_url" -o "$download_path"',
    'actual_sha256="$(node -e "const fs=require(\'node:fs\'),crypto=require(\'node:crypto\');process.stdout.write(crypto.createHash(\'sha256\').update(fs.readFileSync(process.argv[1])).digest(\'hex\'))" "$download_path")"',
    'if [ "$actual_sha256" != "$connector_sha256" ]; then',
    '  printf \'%s\\n\' \'安装失败：连接器校验未通过。\' >&2',
    '  exit 1',
    'fi',
    '',
    'mkdir -p "$install_root" "$bin_root"',
    'connector_path="$install_root/shroom-codex.js"',
    'launcher_path="$bin_root/shroom-codex"',
    'node_path="$(command -v node)"',
    'cp "$download_path" "$connector_path"',
    'chmod 700 "$connector_path"',
    '{',
    '  printf \'%s\\n\' \'#!/bin/sh\'',
    '  printf \'exec "%s" "%s" "$@"\\n\' "$node_path" "$connector_path"',
    '} > "$launcher_path"',
    'chmod 700 "$launcher_path"',
    'rm -rf "$temp_root"',
    'trap - EXIT HUP INT TERM',
    'exec "$launcher_path" "$@"',
    ''
  ].join('\n');
}

module.exports = {
  buildCodexConnectCommand,
  connectorSource,
  installerScript
};
