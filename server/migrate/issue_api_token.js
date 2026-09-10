'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { hashToken } = require('../src/security');

const AGENT_SCOPES = [
  'diaries:read', 'diaries:write',
  'friends:read', 'friends:write',
  'todos:read', 'todos:write',
  'life-os:read', 'life-os:write',
  'reminders:read', 'reminders:write',
  'ai:read', 'ai:write'
];

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`Missing ${name}`);
  return value;
}

async function run() {
  const mobile = required(process.argv[2], 'mobile');
  const name = required(process.argv[3], 'token name').slice(0, 80);
  const configPath = required(process.argv[4], 'config path');
  const baseUrl = required(process.argv[5], 'base URL').replace(/\/$/, '');
  const publicOrigin = new URL(baseUrl).origin;
  const databaseUrl = required(process.env.DATABASE_URL, 'DATABASE_URL');
  const token = `shroom_pat_${crypto.randomBytes(32).toString('base64url')}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, scopes)
       SELECT $1, id, $3, $4, $5::jsonb FROM users WHERE mobile = $2
       ON CONFLICT (user_id, name) DO UPDATE SET
         id = EXCLUDED.id, token_hash = EXCLUDED.token_hash, scopes = EXCLUDED.scopes,
         revoked_at = NULL, expires_at = NULL, last_used_at = NULL, created_at = now()
       RETURNING id`,
      [crypto.randomUUID(), mobile, name, hashToken(token), JSON.stringify(AGENT_SCOPES)]
    );
    if (result.rowCount !== 1) throw new Error('Expected exactly one target user');

    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const next = {
      ...current,
      baseUrl,
      accessToken: token,
      tokenType: 'x-rfdiary-token',
      defaultHeaders: {
        ...(current.defaultHeaders || {}),
        origin: publicOrigin,
        referer: `${publicOrigin}/`
      }
    };
    delete next.userId;
    const temporaryPath = path.join(path.dirname(configPath), `.${path.basename(configPath)}.${process.pid}.tmp`);
    fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporaryPath, configPath);
    fs.chmodSync(configPath, 0o600);
    process.stdout.write(JSON.stringify({
      ok: true,
      tokenId: result.rows[0].id,
      name,
      scopes: AGENT_SCOPES,
      configUpdated: true
    }) + '\n');
  } finally {
    await client.end();
  }
}

run().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
