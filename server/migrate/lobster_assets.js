'use strict';

const fs = require('node:fs');
const db = require('../src/db');
const { createAccessToken } = require('../src/security');

const [mobile, friendsPath, lifeOsPath] = process.argv.slice(2);
const baseUrl = String(process.env.SHROOM_INTERNAL_URL || 'http://127.0.0.1:3102').replace(/\/$/, '');

if (!mobile || !friendsPath || !lifeOsPath) {
  console.error('Usage: node migrate/lobster_assets.js <mobile> <friends-asset.json> <life-os.md>');
  process.exit(1);
}

async function api(route, token, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || 'GET',
    headers: { 'x-api-key': token, ...(options.body ? { 'content-type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json();
  if (!response.ok || result.code !== 200) throw new Error(result.message || `Request failed: ${route}`);
  return result.data;
}

async function run() {
  const user = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (!user.rowCount) throw new Error('Target account does not exist');
  const userId = user.rows[0].id;
  const token = createAccessToken(userId, 600);
  const source = JSON.parse(fs.readFileSync(friendsPath, 'utf8'));
  const friends = Array.isArray(source) ? source : source.friends;
  if (!Array.isArray(friends)) throw new Error('Invalid friends asset');
  const lifeContent = fs.readFileSync(lifeOsPath, 'utf8').trim();

  const imported = await api('/api/friends/v1/import', token, { method: 'POST', body: { friends } });
  await db.query(
    `INSERT INTO friend_asset_settings (user_id, source_version, source_created_at, settings)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET source_version = EXCLUDED.source_version,
       source_created_at = EXCLUDED.source_created_at, settings = EXCLUDED.settings, updated_at = now()`,
    [userId, String(source.version || ''), String(source.createdAt || ''), JSON.stringify(source.settings || {})]
  );
  const currentLifeOs = await api('/api/life-os/v1/config', token);
  let lifeOs = currentLifeOs;
  if (currentLifeOs.contentMd.trim() !== lifeContent) {
    lifeOs = await api('/api/life-os/v1/config', token, {
      method: 'PUT', body: { contentMd: lifeContent, version: currentLifeOs.version }
    });
  }

  const counts = await db.query(
    `SELECT
       (SELECT count(*)::int FROM friends WHERE user_id = $1 AND deleted_at IS NULL) AS friends,
       (SELECT count(*)::int FROM interactions WHERE user_id = $1) AS interactions,
       (SELECT count(*)::int FROM score_histories WHERE user_id = $1) AS score_history,
       (SELECT count(*)::int FROM friend_todos WHERE user_id = $1) AS todos,
       (SELECT count(*)::int FROM friend_milestones WHERE user_id = $1) AS milestones`,
    [userId]
  );
  console.log(JSON.stringify({ ok: true, sourceFriends: friends.length, imported, stored: counts.rows[0], lifeOsVersion: lifeOs.version }));
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
