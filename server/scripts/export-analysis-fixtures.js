#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const serverRoot = process.env.SHROOM_SERVER_ROOT || path.join(__dirname, '..');
const experimentRoot = process.env.SHROOM_EXPERIMENT_ROOT || serverRoot;
const db = require(path.join(serverRoot, 'src', 'db'));
const { classifyDiary, selectDiverseFixtures } = require(path.join(experimentRoot, 'src', 'analysis-fixtures'));

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    result[key] = next && !next.startsWith('--') ? argv[++index] : true;
  }
  return result;
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

async function contextAsOf(userId, cutoff, sourceActivities) {
  const [cards, inquiries, directions, clauses, lifeOsVersion] = await Promise.all([
    db.query(
      `SELECT id, seed_sentence AS "seedSentence", my_understanding AS "myUnderstanding", tags,
              created_at AS "createdAt", created_at AS "availableAt"
         FROM cards
        WHERE user_id = $1 AND created_at <= $2 AND updated_at <= $2
        ORDER BY updated_at DESC LIMIT 80`,
      [userId, cutoff]
    ),
    db.query(
      `SELECT id, question, context, status, inquiry_type AS "inquiryType",
              created_at AS "createdAt", created_at AS "availableAt"
         FROM inquiries
        WHERE user_id = $1 AND created_at <= $2 AND updated_at <= $2
          AND status IN ('OPEN', 'PAUSED')
        ORDER BY updated_at DESC LIMIT 50`,
      [userId, cutoff]
    ),
    db.query(
      `SELECT id, stable_key AS "stableKey", section, name, minimum_action AS "minimumAction",
              current_next_step AS "currentNextStep", status,
              created_at AS "createdAt", created_at AS "availableAt"
         FROM life_os_items
        WHERE user_id = $1 AND created_at <= $2 AND updated_at <= $2
        ORDER BY priority, original_number`,
      [userId, cutoff]
    ),
    db.query(
      `SELECT id, snapshot_version AS "snapshotVersion", area, statement, boundary,
              review_question AS "reviewQuestion", confidence,
              created_at AS "createdAt", created_at AS "availableAt"
         FROM life_os_clauses
        WHERE user_id = $1 AND created_at <= $2 AND (retired_at IS NULL OR retired_at > $2)
        ORDER BY snapshot_version, created_at`,
      [userId, cutoff]
    ),
    db.query(
      `SELECT content_md AS "contentMd", version, created_at AS "availableAt"
         FROM life_os_versions
        WHERE user_id = $1 AND created_at <= $2
        ORDER BY version DESC LIMIT 1`,
      [userId, cutoff]
    )
  ]);
  return {
    cards: cards.rows,
    inquiries: inquiries.rows,
    compoundDirections: directions.rows,
    lifeOsClauses: clauses.rows,
    lifeOsMarkdown: lifeOsVersion.rows[0]?.contentMd || '',
    lifeOsVersion: lifeOsVersion.rows[0] || null,
    sourceActivities: Array.isArray(sourceActivities) ? sourceActivities : []
  };
}

async function main() {
  const options = args(process.argv.slice(2));
  const mobile = String(options.mobile || '');
  const output = path.resolve(String(options.output || 'analysis-fixtures.private.json'));
  const count = Math.max(20, Math.min(30, Number(options.count || 24)));
  if (!mobile) throw new Error('Usage: --mobile <account> --output <private-json> [--count 24]');
  const userResult = await db.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (!userResult.rowCount) throw new Error('account not found');
  const userId = userResult.rows[0].id;
  const diaryResult = await db.query(
    `SELECT d.id, d.content, d.mood, d.occurred_at, d.created_at, d.updated_at,
            a.id AS analysis_id, a.engine_version, a.status AS analysis_status,
            a.observer_snapshot, a.observations, a.five_views, a.todo_candidates,
            a.card_suggestion, a.friend_changes, a.source_activities, a.cost_summary,
            a.created_at AS analysis_created_at, a.finished_at, a.updated_at AS analysis_updated_at,
            (
              COALESCE(a.todo_candidates::text LIKE '%createdTodoId%', false)
              OR COALESCE(a.card_suggestion::text LIKE '%createdCardId%', false)
              OR EXISTS (SELECT 1 FROM inquiry_candidates ic
                          JOIN inquiry_candidate_diaries icd
                            ON icd.candidate_id = ic.id AND icd.user_id = ic.user_id
                          WHERE ic.user_id = d.user_id AND icd.diary_id = d.id AND ic.status = 'ACCEPTED')
              OR EXISTS (SELECT 1 FROM wellbeing_records wr
                          WHERE wr.user_id = d.user_id AND wr.diary_id = d.id AND wr.status = 'CONFIRMED')
              OR EXISTS (SELECT 1 FROM life_os_item_links ll
                          WHERE ll.user_id = d.user_id AND ll.diary_id = d.id AND ll.user_confirmed)
            ) AS has_user_adoption
       FROM diaries d
       LEFT JOIN diary_analysis a ON a.user_id = d.user_id AND a.diary_id = d.id
      WHERE d.user_id = $1 AND d.deleted_at IS NULL AND length(trim(d.content)) > 0
      ORDER BY d.occurred_at DESC
      LIMIT 100`,
    [userId]
  );
  const selected = selectDiverseFixtures(diaryResult.rows, count);
  const fixtures = [];
  for (const row of selected) {
    const cutoff = row.finished_at || row.analysis_updated_at || row.created_at;
    const context = await contextAsOf(userId, cutoff, row.source_activities);
    fixtures.push({
      id: `private-${row.id}`,
      privacy: 'PRIVATE_REAL_USER_DATA_DO_NOT_COMMIT',
      category: classifyDiary(row.content),
      contextFidelity: 'RECONSTRUCTED_WITH_STORED_ANALYSIS',
      contextNotes: [
        '日记原文、当时保存的观察席快照和生产分析结果来自持久化记录。',
        '菇卡、未解之问、人生 OS 与复利上下文按 created_at/updated_at 截止时间重建，不等同于完整历史快照。',
        '任何创建或修改时间晚于 analysisAsOf 的上下文均不进入本夹具。'
      ],
      analysisAsOf: iso(cutoff),
      diary: {
        id: row.id,
        content: row.content,
        mood: row.mood,
        occurredAt: iso(row.occurred_at),
        diaryDate: iso(row.occurred_at).slice(0, 10)
      },
      observers: Array.isArray(row.observer_snapshot) ? row.observer_snapshot : [],
      context,
      productionAnalysis: row.analysis_id ? {
        id: row.analysis_id,
        engineVersion: row.engine_version,
        status: row.analysis_status,
        observations: row.observations,
        fiveViews: row.five_views,
        todoCandidates: row.todo_candidates,
        cardSuggestion: row.card_suggestion,
        friendChanges: row.friend_changes,
        costSummary: row.cost_summary,
        finishedAt: iso(row.finished_at),
        hasUserAdoption: Boolean(row.has_user_adoption)
      } : null
    });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, JSON.stringify({
    generatedAt: new Date().toISOString(),
    privacy: 'PRIVATE_REAL_USER_DATA_DO_NOT_COMMIT',
    requestedCount: count,
    actualCount: fixtures.length,
    fixtures
  }, null, 2), { mode: 0o600 });
  process.stdout.write(JSON.stringify({ output, count: fixtures.length, categories: fixtures.map(item => item.category) }) + '\n');
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}).finally(() => db.close());
