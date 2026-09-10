'use strict';

const fs = require('node:fs');
const db = require('../src/db');

const [mobile, friendsPath, lifeOsPath] = process.argv.slice(2);
if (!mobile || !friendsPath || !lifeOsPath) {
  console.error('Usage: node migrate/verify_lobster_assets.js <mobile> <friends-asset.json> <life-os.md>');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(friendsPath, 'utf8'));
const sourceFriends = Array.isArray(source) ? source : source.friends;

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(value);
    const field = Object.fromEntries(parts.map(item => [item.type, item.value]));
    return `${field.year}-${field.month}-${field.day}`;
  }
  return String(value).slice(0, 10);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function equal(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function sortRows(rows) {
  return rows.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function differingFields(expected, actual) {
  const keys = [...new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})])];
  return keys.filter(key => !equal(expected?.[key], actual?.[key]));
}

function differingRowFields(expectedRows, actualRows) {
  if (expectedRows.length !== actualRows.length) return ['count'];
  const keys = [...new Set(expectedRows.flatMap(item => Object.keys(item)).concat(actualRows.flatMap(item => Object.keys(item))))];
  return keys.filter(key => {
    const expectedValues = expectedRows.map(item => canonical(item[key])).sort();
    const actualValues = actualRows.map(item => canonical(item[key])).sort();
    return !equal(expectedValues, actualValues);
  });
}

function grouped(rows) {
  const result = new Map();
  for (const row of rows) {
    const items = result.get(row.friend_id) || [];
    items.push(row);
    result.set(row.friend_id, items);
  }
  return result;
}

async function run() {
  const user = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (!user.rowCount) throw new Error('Target account does not exist');
  const userId = user.rows[0].id;
  const [friends, interactions, scores, todos, milestones, settings, os] = await Promise.all([
    db.query('SELECT * FROM friends WHERE user_id = $1 AND deleted_at IS NULL', [userId]),
    db.query('SELECT * FROM interactions WHERE user_id = $1', [userId]),
    db.query('SELECT * FROM score_histories WHERE user_id = $1', [userId]),
    db.query('SELECT * FROM friend_todos WHERE user_id = $1', [userId]),
    db.query('SELECT * FROM friend_milestones WHERE user_id = $1', [userId]),
    db.query('SELECT source_version, source_created_at, settings FROM friend_asset_settings WHERE user_id = $1', [userId]),
    db.query('SELECT content_md FROM life_os WHERE user_id = $1', [userId])
  ]);
  const actualFriends = new Map(friends.rows.map(item => [item.id, item]));
  const actualInteractions = grouped(interactions.rows);
  const actualScores = grouped(scores.rows);
  const actualTodos = grouped(todos.rows);
  const actualMilestones = grouped(milestones.rows);
  const mismatches = [];

  for (const expected of sourceFriends) {
    const actual = actualFriends.get(expected.id) || friends.rows.find(item => !expected.id && item.name === expected.name);
    const friendId = expected.id || '[source-id-missing]';
    if (!actual) { mismatches.push({ friendId, section: 'missing' }); continue; }
    const friendExpected = {
      name: expected.name,
      category: expected.category || '朋友',
      relationship: expected.relationship || '',
      description: expected.description || '',
      tags: expected.tags || [],
      contact: expected.contact || {},
      relationScore: Number(expected.relationScore),
      firstContact: expected.firstContact || null,
      lastInteraction: expected.lastInteraction || null,
      sourceId: expected.id || null,
      sourceCreatedAt: expected.createdAt || null,
      sourceUpdatedAt: expected.updatedAt || null
    };
    const friendActual = {
      name: actual.name,
      category: actual.category,
      relationship: actual.relationship,
      description: actual.description,
      tags: actual.tags,
      contact: actual.contact,
      relationScore: actual.relation_score,
      firstContact: dateOnly(actual.first_contact),
      lastInteraction: dateOnly(actual.last_interaction),
      sourceId: actual.source_id,
      sourceCreatedAt: actual.source_created_at,
      sourceUpdatedAt: actual.source_updated_at
    };
    if (!equal(friendExpected, friendActual)) mismatches.push({ friendId, section: 'profile', fields: differingFields(friendExpected, friendActual) });

    const interactionExpected = sortRows((expected.interactions || []).map(item => ({
      date: item.date, type: item.type || '互动', topic: item.topic || '',
      sentiment: item.sentiment || 'neutral', notes: item.notes || '', followUp: item.followUp || '', diaryId: item.diaryId || null
    })));
    const interactionActual = sortRows((actualInteractions.get(actual.id) || []).map(item => ({
      date: dateOnly(item.interaction_date), type: item.interaction_type, topic: item.topic,
      sentiment: item.sentiment, notes: item.notes, followUp: item.follow_up, diaryId: item.diary_id
    })));
    if (!equal(interactionExpected, interactionActual)) mismatches.push({ friendId, section: 'interactions', fields: differingRowFields(interactionExpected, interactionActual) });

    const scoreExpected = sortRows((expected.scoreHistory || []).map(item => ({ date: item.date, change: item.change, reason: item.reason, diaryId: item.diaryId || null })));
    const scoreActual = sortRows((actualScores.get(actual.id) || []).map(item => ({ date: dateOnly(item.score_date), change: item.change, reason: item.reason, diaryId: item.diary_id })));
    if (!equal(scoreExpected, scoreActual)) mismatches.push({ friendId, section: 'scoreHistory', fields: differingRowFields(scoreExpected, scoreActual) });

    const todoExpected = sortRows((expected.todos || []).map(item => ({
      task: item.task, dueDate: item.dueDate || null, status: item.status || 'pending', priority: item.priority || null,
      completedAt: item.completedAt || null, completionNote: item.completionNote || '', sourceCreatedAt: item.createdAt || null
    })));
    const todoActual = sortRows((actualTodos.get(actual.id) || []).map(item => ({
      task: item.task, dueDate: dateOnly(item.due_date), status: item.status, priority: item.priority,
      completedAt: dateOnly(item.completed_at), completionNote: item.completion_note, sourceCreatedAt: dateOnly(item.source_created_date)
    })));
    if (!equal(todoExpected, todoActual)) mismatches.push({ friendId, section: 'todos', fields: differingRowFields(todoExpected, todoActual) });

    const milestoneExpected = sortRows((expected.milestones || []).map(item => ({ date: item.date, event: item.event, context: item.context || '' })));
    const milestoneActual = sortRows((actualMilestones.get(actual.id) || []).map(item => ({ date: item.raw_date || dateOnly(item.milestone_date), event: item.event, context: item.context })));
    if (!equal(milestoneExpected, milestoneActual)) mismatches.push({ friendId, section: 'milestones', fields: differingRowFields(milestoneExpected, milestoneActual) });
  }

  const sourceCounts = {
    friends: sourceFriends.length,
    interactions: sourceFriends.flatMap(item => item.interactions || []).length,
    scoreHistory: sourceFriends.flatMap(item => item.scoreHistory || []).length,
    todos: sourceFriends.flatMap(item => item.todos || []).length,
    milestones: sourceFriends.flatMap(item => item.milestones || []).length
  };
  const storedCounts = {
    friends: friends.rowCount, interactions: interactions.rowCount, scoreHistory: scores.rowCount,
    todos: todos.rowCount, milestones: milestones.rowCount
  };
  const settingsMatch = settings.rowCount === 1 && equal(settings.rows[0].settings, source.settings || {})
    && String(settings.rows[0].source_version || '') === String(source.version || '')
    && String(settings.rows[0].source_created_at || '') === String(source.createdAt || '');
  const lifeOsMatch = os.rowCount === 1 && os.rows[0].content_md.trim() === fs.readFileSync(lifeOsPath, 'utf8').trim();
  const ok = equal(sourceCounts, storedCounts) && settingsMatch && lifeOsMatch && mismatches.length === 0;
  console.log(JSON.stringify({ ok, sourceCounts, storedCounts, settingsMatch, lifeOsMatch, mismatches }));
  if (!ok) process.exitCode = 1;
}

run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());
