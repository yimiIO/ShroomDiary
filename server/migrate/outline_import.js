'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { Client } = require('pg');

function array(value) {
  return Array.isArray(value) ? value : [];
}

function strings(value) {
  return array(value).map(item => String(item ?? '').trim()).filter(Boolean);
}

function imageValues(value) {
  return array(value).map(item => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') return String(item.url || '').trim();
    return '';
  }).filter(Boolean);
}

function linkedCardIds(value) {
  return array(value).map(item => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') return String(item.id || '').trim();
    return '';
  }).filter(Boolean).map(item => item.slice(0, 64));
}

function normalizedContent(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function visibility(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['PUBLIC_ANON', 'PUBLIC_NAMED'].includes(normalized) ? normalized : 'PRIVATE';
}

function deterministicUuid(value) {
  const bytes = crypto.createHash('sha256').update(`shroom-outline:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validDate(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid Outline diary date: ${date}`);
  return date;
}

function chinaDateTime(item) {
  const date = validDate(item.date);
  const hour = Number.isInteger(item.hour) && item.hour >= 0 && item.hour <= 23 ? item.hour : null;
  const minute = Number.isInteger(item.minute) && item.minute >= 0 && item.minute <= 59 ? item.minute : null;
  if (hour !== null && minute !== null) {
    return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`);
  }

  const createdAt = String(item.createdAt || '');
  const match = createdAt.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (match && match[1] === date) {
    return new Date(`${date}T${match[2]}:${match[3]}:${match[4]}+08:00`);
  }
  return new Date(`${date}T12:00:00+08:00`);
}

function updatedAt(item, fallback) {
  const value = String(item.updatedAt || '');
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return fallback;
  const parsed = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}+08:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function fingerprint(date, hour, minute, content) {
  return crypto.createHash('sha256').update(JSON.stringify([
    date,
    Number.isInteger(hour) ? hour : null,
    Number.isInteger(minute) ? minute : null,
    normalizedContent(content)
  ])).digest('hex');
}

async function run() {
  const exportPath = process.argv[2];
  const expectedMobile = process.argv[3];
  if (!exportPath || !expectedMobile || !process.env.DATABASE_URL) {
    throw new Error('Usage: DATABASE_URL=... node outline_import.js <export-json> <expected-mobile>');
  }
  const payload = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  if (payload.schemaVersion !== 1 || payload.source !== 'outline') throw new Error('Invalid Outline export');
  const sourceItems = array(payload.diaries);
  if (!sourceItems.length) throw new Error('Outline export contains no diaries');
  const legacyIds = new Set();
  for (const item of sourceItems) {
    if (!item.legacyId || legacyIds.has(item.legacyId)) throw new Error('Duplicate or missing Outline legacy ID');
    legacyIds.add(item.legacyId);
    validDate(item.date);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query('SELECT id FROM users WHERE mobile = $1 FOR UPDATE', [expectedMobile]);
    if (userResult.rowCount !== 1) throw new Error('Expected exactly one target user');
    const userId = userResult.rows[0].id;
    const existing = await client.query(
      `SELECT content, hour, minute,
        to_char(occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS local_date
       FROM diaries WHERE user_id = $1`,
      [userId]
    );
    const existingFingerprints = new Map();
    for (const row of existing.rows) {
      const key = fingerprint(row.local_date, row.hour, row.minute, row.content);
      existingFingerprints.set(key, (existingFingerprints.get(key) || 0) + 1);
    }

    let imported = 0;
    let skippedExisting = 0;
    const importedByMonth = {};
    for (const item of sourceItems) {
      const key = fingerprint(item.date, item.hour, item.minute, item.content);
      const availableMatch = existingFingerprints.get(key) || 0;
      if (availableMatch > 0) {
        existingFingerprints.set(key, availableMatch - 1);
        skippedExisting++;
        continue;
      }

      const occurredAt = chinaDateTime(item);
      await client.query(
        `INSERT INTO diaries
          (id, user_id, content, mood, tags, images, voice, hour, minute, entry_type,
           linked_cards, visibility, occurred_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10,
           $11::jsonb, $12, $13, $13, $14)`,
        [
          deterministicUuid(item.legacyId), userId, normalizedContent(item.content),
          String(item.mood || '').slice(0, 32) || null,
          JSON.stringify(strings(item.tags)), JSON.stringify(imageValues(item.images)),
          item.voice ? JSON.stringify(item.voice) : null,
          Number.isInteger(item.hour) ? item.hour : null,
          Number.isInteger(item.minute) ? item.minute : null,
          String(item.type || '').slice(0, 48) || 'default',
          JSON.stringify(linkedCardIds(item.linkedCards)),
          visibility(item.visibility), occurredAt, updatedAt(item, occurredAt)
        ]
      );
      imported++;
      const month = item.date.slice(0, 7);
      importedByMonth[month] = (importedByMonth[month] || 0) + 1;
    }

    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({
      source: sourceItems.length,
      imported,
      skippedExisting,
      importedByMonth
    }) + '\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

run().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
