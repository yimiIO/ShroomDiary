'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { Client } = require('pg');

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`Missing ${name}`);
  return value;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedContent(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function stringArray(value) {
  return array(value).map(item => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') return String(item.id || item.name || item.title || '').trim();
    return '';
  }).filter(Boolean);
}

function visibility(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['PUBLIC_ANON', 'PUBLIC_NAMED'].includes(normalized) ? normalized : 'PRIVATE';
}

function fingerprint(item) {
  return crypto.createHash('sha256').update(JSON.stringify([
    String(item.date || ''),
    integerOrNull(item.hour),
    integerOrNull(item.minute),
    normalizedContent(item.content)
  ])).digest('hex');
}

async function fetchSource(config) {
  const baseUrl = required(config.baseUrl, 'source baseUrl').replace(/\/$/, '');
  const accessToken = required(config.accessToken, 'source accessToken');
  const headers = {
    ...config.defaultHeaders,
    'x-rfdiary-token': accessToken,
    accept: 'application/json'
  };
  delete headers.host;
  delete headers['content-length'];

  const source = [];
  const pageSize = 100;
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(`${baseUrl}/rf-diary/v1/diary/index?page=${page}&pageSize=${pageSize}`, {
      headers,
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Source diary API returned HTTP ${response.status}`);
    const body = await response.json();
    if (Number(body.code) !== 200 || !Array.isArray(body.data)) {
      throw new Error(`Source diary API returned an invalid response (${body.code || 'unknown'})`);
    }
    source.push(...body.data);
    if (body.data.length < pageSize) break;
  }
  return source;
}

function rowItem(row) {
  return {
    date: row.local_date,
    hour: row.hour,
    minute: row.minute,
    content: row.content,
    mood: row.mood,
    tags: row.tags,
    images: row.images,
    voice: row.voice,
    type: row.entry_type,
    linkedCards: row.linked_cards,
    visibility: row.visibility
  };
}

function fieldShape(item) {
  return {
    mood: String(item.mood || ''),
    tags: stringArray(item.tags).sort(),
    imageCount: array(item.images).length,
    hasVoice: Boolean(item.voice),
    type: String(item.type || 'default'),
    linkedCards: stringArray(item.linkedCards).sort(),
    visibility: visibility(item.visibility)
  };
}

async function run() {
  const configPath = required(process.argv[2], 'source config path');
  const expectedMobile = required(process.argv[3], 'expected mobile');
  const databaseUrl = required(process.env.DATABASE_URL, 'DATABASE_URL');
  const source = await fetchSource(JSON.parse(fs.readFileSync(configPath, 'utf8')));

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT d.content, d.mood, d.tags, d.images, d.voice, d.hour, d.minute,
        d.entry_type, d.linked_cards, d.visibility,
        to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS local_date
       FROM diaries d
       JOIN users u ON u.id = d.user_id
       WHERE u.mobile = $1
       ORDER BY d.occurred_at`,
      [expectedMobile]
    );
    const target = result.rows.map(rowItem);
    const byFingerprint = new Map();
    for (const item of target) {
      const key = fingerprint(item);
      const bucket = byFingerprint.get(key) || [];
      bucket.push(item);
      byFingerprint.set(key, bucket);
    }

    let exact = 0;
    let metadataMismatch = 0;
    const metadataMismatchFields = {};
    const metadataMismatchDates = {};
    const missingDates = {};
    for (const item of source) {
      const key = fingerprint(item);
      const bucket = byFingerprint.get(key) || [];
      const sourceShape = fieldShape(item);
      const exactIndex = bucket.findIndex(candidate => (
        JSON.stringify(fieldShape(candidate)) === JSON.stringify(sourceShape)
      ));
      const matched = exactIndex >= 0 ? bucket.splice(exactIndex, 1)[0] : bucket.shift();
      if (!matched) {
        const date = String(item.date || 'unknown');
        missingDates[date] = (missingDates[date] || 0) + 1;
        continue;
      }
      const targetShape = fieldShape(matched);
      if (JSON.stringify(sourceShape) === JSON.stringify(targetShape)) {
        exact++;
      } else {
        metadataMismatch++;
        const date = String(item.date || 'unknown');
        metadataMismatchDates[date] = (metadataMismatchDates[date] || 0) + 1;
        for (const field of Object.keys(sourceShape)) {
          if (JSON.stringify(sourceShape[field]) !== JSON.stringify(targetShape[field])) {
            metadataMismatchFields[field] = (metadataMismatchFields[field] || 0) + 1;
          }
        }
      }
    }

    const missing = Object.values(missingDates).reduce((sum, count) => sum + count, 0);
    const sourceDates = source.map(item => String(item.date || '')).filter(Boolean).sort();
    const targetDates = target.map(item => String(item.date || '')).filter(Boolean).sort();
    process.stdout.write(JSON.stringify({
      ok: missing === 0,
      sourceCount: source.length,
      targetCount: target.length,
      sourceRange: sourceDates.length ? [sourceDates[0], sourceDates[sourceDates.length - 1]] : [],
      targetRange: targetDates.length ? [targetDates[0], targetDates[targetDates.length - 1]] : [],
      contentDateTimeMatches: source.length - missing,
      exactFieldMatches: exact,
      metadataMismatch,
      metadataMismatchFields,
      metadataMismatchDates,
      missing,
      missingDates
    }, null, 2) + '\n');
    if (missing) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

run().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
