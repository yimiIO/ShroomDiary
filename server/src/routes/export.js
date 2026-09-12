'use strict';

const express = require('express');
const db = require('../db');
const { asyncRoute, ok, requireUser } = require('../http');

const router = express.Router();
router.use(requireUser);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactValue(value, replacements) {
  if (typeof value === 'string') {
    return replacements.reduce((result, item) => result.replace(new RegExp(escapeRegExp(item.from), 'gu'), item.to), value);
  }
  if (Array.isArray(value)) return value.map(item => redactValue(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, replacements)]));
  }
  return value;
}

router.get('/all', asyncRoute(async (req, res) => {
  const redacted = ['1', 'true', 'yes'].includes(String(req.query.redacted || '').toLowerCase());
  const [diaries, todos, cards, practices, friends, interactions, scoreHistory, friendTodos, milestones,
    lifeOs, lifeOsVersions, lifeOsClauses, lifeOsProposals, reviews, analyses, friendSettings,
    compoundSettings, compoundCheckins, observers, inquiries, inquiryEvidence, inquirySyntheses, aiUsage,
    lifeOsItems, lifeOsWeekFocus, lifeOsItemLinks, lifeOsItemRefs, lifeOsItemHistory, lifeOsWeeklyReviews] = await Promise.all([
    db.query('SELECT id, content, mood, tags, images, voice, entry_type, linked_cards, visibility, occurred_at, created_at, updated_at FROM diaries WHERE user_id = $1 ORDER BY occurred_at', [req.user.id]),
    db.query('SELECT id, content, deadline, tags, status, completed_at, created_at, updated_at FROM todos WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, seed_sentence, my_understanding, usage_items, tags, visibility, copied_from_id, collection_slug, editorial_source, source_diary_id, source_analysis_id, last_reviewed_at, created_at, updated_at FROM cards WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, card_id, context, action, feeling, result, reflection, created_at FROM card_practices WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, source_id, name, category, relationship, description, tags, contact, relation_score, trust_score, value_score, energy_score, first_contact, last_interaction, source_created_at, source_updated_at, created_at, updated_at FROM friends WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, friend_id, interaction_date, interaction_type, topic, sentiment, notes, follow_up, diary_id, created_at FROM interactions WHERE user_id = $1 ORDER BY interaction_date', [req.user.id]),
    db.query('SELECT id, friend_id, score_date, change, reason, rule_code, diary_id, created_at FROM score_histories WHERE user_id = $1 ORDER BY score_date', [req.user.id]),
    db.query('SELECT id, friend_id, task, due_date, status, priority, completed_at, completion_note, source_created_date, global_todo_id, created_at, updated_at FROM friend_todos WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query(`SELECT id, friend_id, COALESCE(to_char(milestone_date, 'YYYY-MM-DD'), raw_date) AS milestone_date,
      event, context, created_at FROM friend_milestones WHERE user_id = $1 ORDER BY milestone_date NULLS LAST`, [req.user.id]),
    db.query('SELECT content_md, version, updated_at FROM life_os WHERE user_id = $1', [req.user.id]),
    db.query('SELECT version, content_md, origin, source_refs, generation_meta, created_at FROM life_os_versions WHERE user_id = $1 ORDER BY version', [req.user.id]),
    db.query(`SELECT id, snapshot_version, area, statement, boundary, review_question, basis,
      confidence, status, position, supersedes, source_refs, counter_source_refs,
      created_at, retired_at FROM life_os_clauses WHERE user_id = $1 ORDER BY snapshot_version, position`, [req.user.id]),
    db.query(`SELECT id, base_version, trigger_type, status, summary, payload, source_refs,
      result, created_at, resolved_at FROM life_os_review_proposals WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query('SELECT period, payload, created_at, updated_at FROM monthly_relationship_reviews WHERE user_id = $1 ORDER BY period', [req.user.id]),
    db.query('SELECT diary_id, engine_version, five_views, observer_snapshot, observations, todo_candidates, card_suggestion, friend_changes, cost_summary, status, created_at, updated_at FROM diary_analysis WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT source_version, source_created_at, settings, updated_at FROM friend_asset_settings WHERE user_id = $1', [req.user.id]),
    db.query('SELECT morning_prayer, financial_plan, created_at, updated_at FROM compound_settings WHERE user_id = $1', [req.user.id]),
    db.query('SELECT ritual_key, period_key, checkin_date, mode, duration_minutes, note, created_at, updated_at FROM compound_checkins WHERE user_id = $1 ORDER BY checkin_date, ritual_key', [req.user.id]),
    db.query('SELECT id, preset_key, name, description, prompt, render_type, is_system, enabled, sort_order, created_at, updated_at FROM ai_observers WHERE user_id = $1 ORDER BY sort_order, created_at', [req.user.id]),
    db.query('SELECT id, question, context, inquiry_type, observation_started_on, personal_baseline, health_consent_at, status, current_synthesis, synthesis_version, evidence_revision, last_reviewed_at, created_at, updated_at FROM inquiries WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, inquiry_id, diary_id, source_type, source_label, excerpt, note, relation, health_observation, created_at, updated_at FROM inquiry_evidence WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT inquiry_id, version, result, evidence_refs, invalidated_at, invalidated_reason, created_at FROM inquiry_syntheses WHERE user_id = $1 ORDER BY inquiry_id, version', [req.user.id]),
    db.query(`SELECT feature, diary_id, analysis_id, conversation_id, task_id, observer_id, inquiry_id,
      request_label, provider, model, prompt_tokens, cache_hit_tokens, cache_miss_tokens,
      completion_tokens, total_tokens, cost_usd, cost_cny, price_snapshot, created_at
      FROM ai_usage_events WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query('SELECT id, stable_key, original_number, section, name, description, minimum_action, current_next_step, priority, status, template_version, created_at, updated_at FROM life_os_items WHERE user_id = $1 ORDER BY priority, original_number', [req.user.id]),
    db.query('SELECT week_start, item_id, position, created_at FROM life_os_week_focus WHERE user_id = $1 ORDER BY week_start, position', [req.user.id]),
    db.query('SELECT id, item_id, diary_id, analysis_id, record_type, evidence_excerpt, summary, suggested_next_step, origin, user_confirmed, status, source_version, source_valid, created_at, updated_at FROM life_os_item_links WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, item_id, ref_type, ref_id, label, external_url, created_at, updated_at FROM life_os_item_refs WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, item_id, change_type, snapshot, created_at FROM life_os_item_history WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, week_start, status, result, source_refs, model_version, cost_summary, confirmed_at, created_at, updated_at FROM life_os_weekly_reviews WHERE user_id = $1 ORDER BY week_start, created_at', [req.user.id])
  ]);
  const replacements = friends.rows.map((item, index) => ({ from: item.name, to: `人物${index + 1}` }))
    .filter(item => item.from).concat([
      { from: req.user.mobile || '', to: '[手机号]' },
      { from: req.user.nickname || '', to: '[昵称]' }
    ]).filter(item => item.from);
  const payload = {
    format: 'shroom-export-v1',
    exportedAt: new Date().toISOString(),
    redacted,
    account: redacted ? {} : { mobile: req.user.mobile, nickname: req.user.nickname },
    diaries: diaries.rows,
    todos: todos.rows,
    cards: cards.rows,
    cardPractices: practices.rows,
    friends: friends.rows,
    interactions: interactions.rows,
    scoreHistory: scoreHistory.rows,
    friendTodos: friendTodos.rows,
    milestones: milestones.rows,
    friendAssetSettings: friendSettings.rows[0] || null,
    lifeOs: lifeOs.rows[0] || null,
    lifeOsVersions: lifeOsVersions.rows,
    lifeOsClauses: lifeOsClauses.rows,
    lifeOsReviewProposals: lifeOsProposals.rows,
    lifeOsItems: lifeOsItems.rows,
    lifeOsWeekFocus: lifeOsWeekFocus.rows,
    lifeOsItemLinks: lifeOsItemLinks.rows,
    lifeOsItemRefs: lifeOsItemRefs.rows,
    lifeOsItemHistory: lifeOsItemHistory.rows,
    lifeOsWeeklyReviews: lifeOsWeeklyReviews.rows,
    monthlyRelationshipReviews: reviews.rows,
    diaryAnalysis: analyses.rows,
    observers: observers.rows,
    inquiries: inquiries.rows,
    inquiryEvidence: inquiryEvidence.rows,
    inquirySyntheses: inquirySyntheses.rows,
    aiUsage: aiUsage.rows,
    compoundSettings: compoundSettings.rows[0] || null,
    compoundCheckins: compoundCheckins.rows
  };
  if (!redacted) return ok(res, payload);
  const clean = redactValue(payload, replacements);
  clean.diaries = clean.diaries.map(item => ({ ...item, images: [], voice: null }));
  clean.friends = clean.friends.map(item => ({ ...item, contact: {} }));
  return ok(res, clean);
}));

module.exports = router;
