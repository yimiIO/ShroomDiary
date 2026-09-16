'use strict';

const express = require('express');
const db = require('../db');
const { decryptFinancialPayload } = require('../financial-data-crypto');
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

function financialRows(rows) {
  return rows.map(row => {
    const { private_payload: privatePayload, ...metadata } = row;
    return { ...metadata, data: decryptFinancialPayload(privatePayload) };
  });
}

router.get('/all', asyncRoute(async (req, res) => {
  const redacted = ['1', 'true', 'yes'].includes(String(req.query.redacted || '').toLowerCase());
  const [diaries, todos, cards, practices, friends, interactions, scoreHistory, friendTodos, milestones,
    lifeOs, lifeOsVersions, lifeOsClauses, lifeOsProposals, reviews, analyses, friendSettings,
    compoundSettings, compoundCheckins, observers, inquiries, inquiryEvidence, inquirySyntheses, wellbeingRecords, aiUsage,
    lifeOsItems, lifeOsWeekFocus, lifeOsItemLinks, lifeOsItemRefs, lifeOsItemHistory, lifeOsWeeklyReviews,
    compoundThreads, compoundEvents, compoundReviews, todoProjects, todoRecurrenceRules, todoEvents,
    dataSourceConnections, externalActivities, financialProfiles, financialRecords,
    financialSnapshots, financialHoldings, financialAliases, financialRules,
    financialNotes, financialReviews, financialImportDrafts,
    dailyReviews, dailyReviewPreferences,
    walletAccount, walletLedger, featureEntitlements,
    campaignRewards, paymentOrders, refundRequests, refundItems, legalAcceptances] = await Promise.all([
    db.query('SELECT id, content, mood, tags, images, voice, entry_type, linked_cards, visibility, occurred_at, created_at, updated_at FROM diaries WHERE user_id = $1 ORDER BY occurred_at', [req.user.id]),
    db.query(`SELECT id, content, description, project_id, scheduled_date, deadline, tags, status,
      recurrence_rule_id, occurrence_date, compound_item_id, source_type, source_ref_id,
      source_diary_id, source_compound_thread_id, started_at, completed_at, cancelled_at,
      result_text, result_media_ids, position, version, created_at, updated_at
      FROM todos WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [req.user.id]),
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
    db.query('SELECT diary_id, engine_version, five_views, observer_snapshot, observations, source_activities, todo_candidates, card_suggestion, friend_changes, cost_summary, status, created_at, updated_at FROM diary_analysis WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT source_version, source_created_at, settings, updated_at FROM friend_asset_settings WHERE user_id = $1', [req.user.id]),
    db.query('SELECT morning_prayer, financial_plan, created_at, updated_at FROM compound_settings WHERE user_id = $1', [req.user.id]),
    db.query('SELECT ritual_key, period_key, checkin_date, mode, duration_minutes, note, created_at, updated_at FROM compound_checkins WHERE user_id = $1 ORDER BY checkin_date, ritual_key', [req.user.id]),
    db.query('SELECT id, preset_key, name, description, prompt, render_type, is_system, enabled, sort_order, created_at, updated_at FROM ai_observers WHERE user_id = $1 ORDER BY sort_order, created_at', [req.user.id]),
    db.query('SELECT id, question, context, inquiry_type, observation_started_on, personal_baseline, health_consent_at, status, current_synthesis, synthesis_version, evidence_revision, last_reviewed_at, created_at, updated_at FROM inquiries WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, inquiry_id, diary_id, source_type, source_label, excerpt, note, relation, created_at, updated_at FROM inquiry_evidence WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT inquiry_id, version, result, evidence_refs, invalidated_at, invalidated_reason, created_at FROM inquiry_syntheses WHERE user_id = $1 ORDER BY inquiry_id, version', [req.user.id]),
    db.query(`SELECT id, diary_id, source_type, status, recorded_on, source_label, source_excerpt,
      observation, extraction, extraction_version, model_version, health_value_types, why_useful,
      confidence, review_version, feedback_reason, source_fingerprint, ai_allowed, confirmed_at, created_at, updated_at
      FROM wellbeing_records WHERE user_id = $1 ORDER BY recorded_on, created_at`, [req.user.id]),
    db.query(`SELECT feature, diary_id, analysis_id, conversation_id, task_id, observer_id, inquiry_id,
      request_label, provider, model, prompt_tokens, cache_hit_tokens, cache_miss_tokens,
      completion_tokens, total_tokens, cost_usd, cost_cny, price_snapshot, charge_status,
      charged_point_cents, charge_multiplier, wallet_ledger_id, created_at
      FROM ai_usage_events WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query('SELECT id, stable_key, original_number, section, name, description, minimum_action, current_next_step, priority, status, template_version, created_at, updated_at FROM life_os_items WHERE user_id = $1 ORDER BY priority, original_number', [req.user.id]),
    db.query('SELECT week_start, item_id, position, created_at FROM life_os_week_focus WHERE user_id = $1 ORDER BY week_start, position', [req.user.id]),
    db.query('SELECT id, item_id, diary_id, analysis_id, record_type, evidence_excerpt, summary, suggested_next_step, origin, user_confirmed, status, source_version, source_valid, created_at, updated_at FROM life_os_item_links WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, item_id, ref_type, ref_id, label, external_url, created_at, updated_at FROM life_os_item_refs WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, item_id, change_type, snapshot, created_at FROM life_os_item_history WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, week_start, status, result, source_refs, model_version, cost_summary, confirmed_at, created_at, updated_at FROM life_os_weekly_reviews WHERE user_id = $1 ORDER BY week_start, created_at', [req.user.id]),
    db.query('SELECT id, item_id, progress_mode, desired_outcome, context_summary, last_completed, current_step, blocker_summary, status, is_primary, started_at, last_activity_at, paused_at, ended_at, created_at, updated_at FROM compound_threads WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, thread_id, kind, status, actor, input_text, summary, payload, media_ids, source_diary_id, source_link_id, source_valid, created_at, updated_at FROM compound_events WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT id, scope_start, scope_end, status, result, source_refs, model_version, cost_summary, confirmed_at, created_at, updated_at FROM compound_reviews WHERE user_id = $1 ORDER BY scope_end, created_at', [req.user.id]),
    db.query('SELECT id, name, goal, status, position, version, completed_at, archived_at, created_at, updated_at FROM todo_projects WHERE user_id = $1 ORDER BY position, created_at', [req.user.id]),
    db.query(`SELECT id, title, description, project_id, compound_item_id, frequency, starts_on,
      ends_on, week_days, month_day, time_zone, status, last_generated_through, version,
      created_at, updated_at FROM todo_recurrence_rules WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query(`SELECT id, todo_id, event_type, payload, event_date, source_diary_id,
      source_compound_thread_id, visible_in_diary, valid, created_at, invalidated_at
      FROM todo_events WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query(`SELECT id, provider, display_name, device_name, connection_mode, status,
      sync_interval_hours, include_in_diary, ai_allowed, scopes, last_cursor, last_sync_at,
      last_error, connected_at, paused_at, disconnected_at, created_at, updated_at
      FROM data_source_connections WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query(`SELECT id, connection_id, provider, external_id, activity_type, title,
      project_label, source_kind, started_at, completed_at, task_runtime_seconds,
      active_seconds_estimate, outcome_status, metadata, created_at, updated_at
      FROM external_activity_events WHERE user_id = $1 ORDER BY completed_at`, [req.user.id]),
    db.query('SELECT * FROM financial_plan_profiles WHERE user_id = $1 ORDER BY updated_at', [req.user.id]),
    db.query('SELECT * FROM financial_records WHERE user_id = $1 ORDER BY occurred_on, created_at', [req.user.id]),
    db.query('SELECT * FROM financial_snapshots WHERE user_id = $1 ORDER BY valued_on, created_at', [req.user.id]),
    db.query('SELECT * FROM financial_holdings WHERE user_id = $1 ORDER BY valued_on, created_at', [req.user.id]),
    db.query('SELECT * FROM financial_aliases WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query('SELECT * FROM financial_rule_versions WHERE user_id = $1 ORDER BY thread_id, version', [req.user.id]),
    db.query('SELECT * FROM financial_decision_notes WHERE user_id = $1 ORDER BY decided_on, created_at', [req.user.id]),
    db.query('SELECT * FROM financial_reviews WHERE user_id = $1 ORDER BY scope_end, created_at', [req.user.id]),
    db.query('SELECT * FROM financial_import_drafts WHERE user_id = $1 ORDER BY created_at', [req.user.id]),
    db.query(`SELECT id, review_date, status, result, source_refs, source_cutoff,
      generated_by, model_version, viewed_at, email_status, emailed_at, created_at, updated_at
      FROM daily_reviews WHERE user_id = $1 ORDER BY review_date`, [req.user.id]),
    db.query(`SELECT email_address, email_verified_at, email_enabled, created_at, updated_at
      FROM daily_review_preferences WHERE user_id = $1`, [req.user.id]),
    db.query(`SELECT paid_balance_cents, reward_balance_cents,
      lifetime_paid_cents, lifetime_reward_cents, lifetime_spent_cents, lifetime_refunded_cents,
      created_at, updated_at
      FROM wallet_accounts WHERE user_id = $1`, [req.user.id]),
    db.query(`SELECT id, event_type, paid_delta_cents, reward_delta_cents,
      paid_balance_cents, reward_balance_cents, reference_type, reference_id,
      description, metadata, created_at FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query(`SELECT id, feature_key, status, price_point_cents, ledger_id, purchased_at,
      refunded_at, updated_at FROM billing_feature_entitlements WHERE user_id = $1 ORDER BY purchased_at`, [req.user.id]),
    db.query(`SELECT id, campaign_key, reward_point_cents, ledger_id, qualification, awarded_at
      FROM billing_campaign_rewards WHERE user_id = $1 ORDER BY awarded_at`, [req.user.id]),
    db.query(`SELECT id, out_trade_no, provider, merchant_label, merchant_legal_name,
      invoice_legal_name, merchant_tax_id, icp_qualification, app_filing_number,
      amount_cents, point_cents, refundable_point_cents, refunded_point_cents,
      status, client_platform, provider_transaction_id, agreement_version, paid_at,
      expires_at, last_provider_sync_at, created_at, updated_at
      FROM billing_payment_orders WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query(`SELECT id, payment_order_id, requested_point_cents, status, reason,
      provider_refund_id, response_note, decision_actor, decided_at, completed_at, created_at, updated_at
      FROM billing_refund_requests WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query(`SELECT id, refund_request_id, payment_order_id, out_refund_no, amount_cents,
      status, provider_refund_id, response_note, created_at, updated_at, completed_at
      FROM billing_refund_items WHERE user_id = $1 ORDER BY created_at`, [req.user.id]),
    db.query(`SELECT id, document_key, document_version, acceptance_source, accepted_at
      FROM legal_acceptances WHERE user_id = $1 ORDER BY accepted_at`, [req.user.id])
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
    wellbeingRecords: wellbeingRecords.rows,
    aiUsage: aiUsage.rows,
    compoundSettings: compoundSettings.rows[0] || null,
    compoundCheckins: compoundCheckins.rows,
    compoundThreads: compoundThreads.rows,
    compoundEvents: compoundEvents.rows,
    compoundReviews: compoundReviews.rows,
    todoProjects: todoProjects.rows,
    todoRecurrenceRules: todoRecurrenceRules.rows,
    todoEvents: todoEvents.rows,
    dataSourceConnections: dataSourceConnections.rows,
    externalActivities: externalActivities.rows,
    financialLedger: req.authKind === 'session' && !redacted ? {
      profiles: financialRows(financialProfiles.rows),
      records: financialRows(financialRecords.rows),
      snapshots: financialRows(financialSnapshots.rows),
      holdings: financialRows(financialHoldings.rows),
      aliases: financialRows(financialAliases.rows),
      rules: financialRows(financialRules.rows),
      notes: financialRows(financialNotes.rows),
      reviews: financialRows(financialReviews.rows),
      importDrafts: financialRows(financialImportDrafts.rows)
    } : { redacted: true, reason: req.authKind === 'session' ? '脱敏导出不包含私人财务金额、持有和规则。' : 'API Token 无权导出私人财务台账。' },
    dailyReviews: dailyReviews.rows,
    dailyReviewPreferences: dailyReviewPreferences.rows[0] || null,
    walletAccount: walletAccount.rows[0] || null,
    walletLedger: walletLedger.rows,
    billingFeatureEntitlements: featureEntitlements.rows,
    billingCampaignRewards: campaignRewards.rows,
    billingPaymentOrders: paymentOrders.rows,
    billingRefundRequests: refundRequests.rows,
    billingRefundItems: refundItems.rows,
    legalAcceptances: legalAcceptances.rows
  };
  if (!redacted) return ok(res, payload);
  const clean = redactValue(payload, replacements);
  clean.diaries = clean.diaries.map(item => ({ ...item, images: [], voice: null }));
  clean.friends = clean.friends.map(item => ({ ...item, contact: {} }));
  clean.dataSourceConnections = clean.dataSourceConnections.map(item => ({ ...item, device_name: '' }));
  clean.externalActivities = clean.externalActivities.map((item, index) => ({
    ...item,
    external_id: `codex-task-${index + 1}`,
    title: `Codex 任务 ${index + 1}`,
    project_label: ''
  }));
  if (clean.dailyReviewPreferences) clean.dailyReviewPreferences.email_address = '[邮箱]';
  return ok(res, clean);
}));

module.exports = router;
