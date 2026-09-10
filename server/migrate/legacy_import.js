'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Client } = require('pg');

const allowedMimeTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`Missing ${name}`);
  return value;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value) {
  return array(value).map(item => String(item ?? '').trim()).filter(Boolean);
}

function timestamp(value, fallback = new Date()) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
}

function visibility(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PUBLIC_ANON' || normalized === 'PUBLIC_NAMED') return normalized;
  return 'PRIVATE';
}

function uuidOrNew(value) {
  const candidate = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

function passwordHash(password) {
  if (password.length < 8) throw new Error('Password must contain at least 8 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

async function readPassword() {
  if (process.stdin.isTTY) process.stderr.write('New Shroom password: ');
  const reader = readline.createInterface({ input: process.stdin, terminal: false });
  const iterator = reader[Symbol.asyncIterator]();
  const next = await iterator.next();
  reader.close();
  return String(next.value || '');
}

function imageUrl(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') return String(item.url || '');
  return '';
}

function originalName(url, extension) {
  try {
    const name = path.basename(new URL(url).pathname).slice(0, 240);
    return name || `legacy-image${extension}`;
  } catch {
    return `legacy-image${extension}`;
  }
}

async function downloadImage(url, userId, createdAt, client, uploadDir, createdFiles, ownership) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported legacy image protocol');
  const response = await fetch(parsed, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Legacy image download failed with HTTP ${response.status}`);
  const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const extension = allowedMimeTypes.get(mimeType);
  if (!extension) throw new Error(`Unsupported legacy image MIME type: ${mimeType || 'unknown'}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Legacy image has an invalid size');

  const id = crypto.randomUUID();
  const storageName = `${id}${extension}`;
  const target = path.join(uploadDir, storageName);
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o750 });
  fs.writeFileSync(target, bytes, { mode: 0o640, flag: 'wx' });
  if (ownership.uid !== null && ownership.gid !== null) fs.chownSync(target, ownership.uid, ownership.gid);
  createdFiles.push(target);

  await client.query(
    `INSERT INTO media_assets
      (id, user_id, storage_name, original_name, mime_type, byte_size, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, storageName, originalName(url, extension), mimeType, bytes.length, createdAt]
  );
  return id;
}

async function run() {
  const exportPath = required(process.argv[2], 'export path');
  const uploadDir = required(process.argv[3], 'upload directory');
  const expectedMobile = required(process.argv[4], 'expected mobile');
  const databaseUrl = required(process.env.DATABASE_URL, 'DATABASE_URL');
  const ownership = {
    uid: Number.isInteger(Number(process.env.UPLOAD_UID)) ? Number(process.env.UPLOAD_UID) : null,
    gid: Number.isInteger(Number(process.env.UPLOAD_GID)) ? Number(process.env.UPLOAD_GID) : null
  };
  const payload = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  if (payload.schemaVersion !== 1) throw new Error('Unsupported export schema version');
  if (String(payload.user?.mobile) !== expectedMobile) throw new Error('Export mobile does not match expected mobile');
  const newPassword = await readPassword();
  const encodedPassword = passwordHash(newPassword);
  const userId = crypto.randomUUID();
  const cardIds = new Map(array(payload.cards).map(card => [String(card.legacyId), crypto.randomUUID()]));
  const diaryIds = new Map(array(payload.diaries).map(diary => [String(diary.legacyId), crypto.randomUUID()]));
  const memoryNodeIds = new Map(array(payload.memoryNodes).map(node => [String(node.legacyId), crypto.randomUUID()]));
  const createdFiles = [];
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM users WHERE mobile = $1 FOR UPDATE', [expectedMobile]);
    if (existing.rowCount) throw new Error('Target user already exists; refusing a duplicate import');

    const userCreatedAt = timestamp(payload.user.createdAt);
    const userUpdatedAt = timestamp(payload.user.updatedAt, userCreatedAt);
    await client.query(
      `INSERT INTO users (id, mobile, nickname, password_hash, avatar_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        expectedMobile,
        String(payload.user.nickname || '').trim() || 'Shroom 用户',
        encodedPassword,
        String(payload.user.avatarUrl || '').trim() || null,
        userCreatedAt,
        userUpdatedAt
      ]
    );

    const migratedImages = new Map();
    for (const diary of array(payload.diaries)) {
      const createdAt = timestamp(diary.createdAt);
      const updatedAt = timestamp(diary.updatedAt, createdAt);
      const imageIds = [];
      for (const image of array(diary.images)) {
        const url = imageUrl(image);
        if (!url) continue;
        if (!migratedImages.has(url)) {
          migratedImages.set(url, await downloadImage(
            url, userId, createdAt, client, uploadDir, createdFiles, ownership
          ));
        }
        imageIds.push(migratedImages.get(url));
      }
      await client.query(
        `INSERT INTO diaries
          (id, user_id, content, mood, tags, images, voice, hour, minute, entry_type,
           linked_cards, visibility, occurred_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10,
           $11::jsonb, $12, $13, $14, $15)`,
        [
          diaryIds.get(String(diary.legacyId)), userId, String(diary.content || ''),
          String(diary.mood || '').slice(0, 32) || null,
          JSON.stringify(stringArray(diary.tags)), JSON.stringify(imageIds),
          Object.keys(diary.voice || {}).length ? JSON.stringify(diary.voice) : null,
          Number.isInteger(diary.hour) ? diary.hour : null,
          Number.isInteger(diary.minute) ? diary.minute : null,
          String(diary.type || '').slice(0, 48) || 'default',
          JSON.stringify(stringArray(diary.linkedCards)), visibility(diary.visibility),
          createdAt, createdAt, updatedAt
        ]
      );
    }

    for (const todo of array(payload.todos)) {
      const createdAt = timestamp(todo.createdAt);
      const updatedAt = timestamp(todo.updatedAt, createdAt);
      const todoStatus = String(todo.status) === 'completed' ? 'completed' : 'pending';
      await client.query(
        `INSERT INTO todos
          (id, user_id, content, deadline, tags, status, completed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [
          uuidOrNew(todo.legacyId), userId, String(todo.content || ''), todo.deadline || null,
          JSON.stringify(stringArray(todo.tags)), todoStatus,
          todoStatus === 'completed' ? timestamp(todo.completedAt, updatedAt) : null,
          createdAt, updatedAt
        ]
      );
    }

    let practiceCount = 0;
    for (const card of array(payload.cards)) {
      const cardId = cardIds.get(String(card.legacyId));
      const createdAt = timestamp(card.createdAt);
      const updatedAt = timestamp(card.updatedAt, createdAt);
      await client.query(
        `INSERT INTO cards
          (id, user_id, seed_sentence, my_understanding, usage_items, tags, visibility,
           last_reviewed_at, legacy_resonance_count, legacy_favorite_count,
           legacy_quote_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)`,
        [
          cardId, userId, String(card.seedSentence || ''), String(card.myUnderstanding || ''),
          JSON.stringify(stringArray(card.usageItems)), JSON.stringify(stringArray(card.tags)),
          visibility(card.visibility), card.lastPracticeAt ? timestamp(card.lastPracticeAt) : null,
          Number(card.resonanceCount || 0), Number(card.favoriteCount || 0),
          Number(card.quoteCount || 0), createdAt, updatedAt
        ]
      );

      for (const practice of array(card.practiceCases)) {
        const practiceCreatedAt = timestamp(practice.createdAt, createdAt);
        await client.query(
          `INSERT INTO card_practices
            (id, card_id, user_id, context, action, feeling, result, reflection, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            uuidOrNew(practice.id), cardId, userId, String(practice.context || ''),
            String(practice.action || ''), String(practice.feeling || ''),
            String(practice.result || ''), String(practice.reflection || ''), practiceCreatedAt
          ]
        );
        practiceCount++;
      }
    }

    for (const node of array(payload.memoryNodes)) {
      const sourceType = String(node.sourceType || '').slice(0, 32);
      const legacySourceId = String(node.legacySourceId || '');
      let sourceId = null;
      if (sourceType.includes('diary')) sourceId = diaryIds.get(legacySourceId) || null;
      if (sourceType.includes('card')) sourceId = cardIds.get(legacySourceId) || null;
      const createdAt = timestamp(node.createdAt);
      const updatedAt = timestamp(node.updatedAt, createdAt);
      await client.query(
        `INSERT INTO memory_nodes
          (id, user_id, legacy_id, source_type, source_id, legacy_source_id, summary,
           content, tags, emotion_score, importance_score, last_viewed_at, view_count,
           like_count, skip_count, open_count, source_created_at, source_updated_at,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13,
           $14, $15, $16, $17, $18, $19, $20)`,
        [
          memoryNodeIds.get(String(node.legacyId)), userId, node.legacyId, sourceType,
          sourceId, legacySourceId || null, String(node.summary || '').slice(0, 255),
          node.content === null ? null : String(node.content), JSON.stringify(stringArray(node.tags)),
          Number(node.emotionScore || 0), Number(node.importanceScore || 0),
          node.lastViewedAt ? timestamp(node.lastViewedAt) : null,
          Number(node.viewCount || 0), Number(node.likeCount || 0), Number(node.skipCount || 0),
          Number(node.openCount || 0), node.sourceCreatedAt ? timestamp(node.sourceCreatedAt) : null,
          node.sourceUpdatedAt ? timestamp(node.sourceUpdatedAt) : null, createdAt, updatedAt
        ]
      );
    }

    for (const feedback of array(payload.memoryFeedback)) {
      const nodeId = memoryNodeIds.get(String(feedback.legacyNodeId));
      if (!nodeId) throw new Error('Memory feedback references a missing node');
      const action = String(feedback.action || '');
      if (!['skip', 'like', 'open'].includes(action)) throw new Error(`Invalid memory action: ${action}`);
      const createdAt = timestamp(feedback.createdAt);
      await client.query(
        `INSERT INTO memory_feedback
          (id, user_id, node_id, legacy_id, action, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(), userId, nodeId, feedback.legacyId, action,
          createdAt, timestamp(feedback.updatedAt, createdAt)
        ]
      );
    }

    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({
      imported: true,
      counts: {
        users: 1,
        diaries: array(payload.diaries).length,
        todos: array(payload.todos).length,
        cards: array(payload.cards).length,
        practices: practiceCount,
        mediaAssets: createdFiles.length,
        memoryNodes: array(payload.memoryNodes).length,
        memoryFeedback: array(payload.memoryFeedback).length
      }
    }) + '\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    for (const file of createdFiles) fs.rmSync(file, { force: true });
    throw error;
  } finally {
    await client.end();
  }
}

run().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
