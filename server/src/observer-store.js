'use strict';

const crypto = require('node:crypto');
const db = require('./db');
const { DEFAULT_OBSERVERS, publicObserver, resolvedObserver } = require('./observer-presets');

async function ensureDefaultObservers(userId, client = db) {
  for (const item of DEFAULT_OBSERVERS) {
    await client.query(
      `INSERT INTO ai_observers
        (id, user_id, preset_key, name, description, render_type, is_system, enabled, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, true, true, $7)
       ON CONFLICT (user_id, preset_key) WHERE preset_key IS NOT NULL DO NOTHING`,
      [crypto.randomUUID(), userId, item.presetKey, item.name, item.description, item.renderType, item.sortOrder]
    );
  }
}

async function listObservers(userId, options = {}) {
  await ensureDefaultObservers(userId, options.client || db);
  const executor = options.client || db;
  const result = await executor.query(
    `SELECT * FROM ai_observers WHERE user_id = $1
      ORDER BY sort_order, created_at, id`,
    [userId]
  );
  const observers = result.rows.map(resolvedObserver);
  return options.publicOnly === false ? observers : observers.map(publicObserver);
}

async function activeObserverSnapshot(userId) {
  const observers = await listObservers(userId, { publicOnly: false });
  return observers.filter(item => item.enabled).map(item => ({
    id: item.id,
    presetKey: item.presetKey,
    name: item.name,
    shortName: item.shortName,
    description: item.description,
    prompt: item.prompt,
    renderType: item.renderType,
    requiresLifeOs: item.requiresLifeOs,
    isSystem: item.isSystem,
    sortOrder: item.sortOrder
  }));
}

module.exports = { activeObserverSnapshot, ensureDefaultObservers, listObservers };
