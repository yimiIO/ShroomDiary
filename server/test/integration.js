'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { deletePrivateObject } = require('../src/media-storage');

const baseUrl = process.env.TEST_BASE_URL || 'https://shroom.surfplus.xyz';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = String(Date.now()).slice(-8);
const mobileA = `139${suffix}`;
const mobileB = `138${suffix}`;
const password = crypto.randomBytes(18).toString('base64url');
const createdMobiles = [mobileA, mobileB];

async function api(route, { method = 'GET', token, legacyToken, body, form } = {}) {
  const headers = {};
  if (token) headers['x-api-key'] = token;
  if (legacyToken) headers['x-rfdiary-token'] = legacyToken;
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined)
  });
  assert.equal(response.status, 200);
  return response.json();
}

function expectCode(result, code = 200) {
  assert.equal(result.code, code, result.message);
  return result.data;
}

async function cleanup() {
  const media = await pool.query(
    `SELECT storage_name, storage_provider FROM media_assets
      WHERE user_id IN (SELECT id FROM users WHERE mobile = ANY($1::varchar[]))`,
    [createdMobiles]
  );
  await pool.query('DELETE FROM users WHERE mobile = ANY($1::varchar[])', [createdMobiles]);
  for (const item of media.rows) {
    if (item.storage_provider === 'cos') await deletePrivateObject(item.storage_name);
    else fs.rmSync(path.join(process.env.UPLOAD_DIR, item.storage_name), { force: true });
  }
}

async function run() {
  await cleanup();
  try {
    expectCode(await api('/api/auth/v1/register', {
      method: 'POST',
      body: { mobile: mobileA, password, nickname: 'Integration A' }
    }));
    expectCode(await api('/api/auth/v1/register', {
      method: 'POST',
      body: { mobile: mobileB, password, nickname: 'Integration B' }
    }));

    const sessionA = expectCode(await api('/api/auth/v1/login', {
      method: 'POST', body: { mobile: mobileA, password }
    }));
    const sessionB = expectCode(await api('/api/auth/v1/login', {
      method: 'POST', body: { mobile: mobileB, password }
    }));
    assert.ok(sessionA.access_token);
    assert.ok(sessionA.refresh_token);
    const agentToken = `shroom_pat_${crypto.randomBytes(32).toString('base64url')}`;
    const agentTokenHash = crypto.createHash('sha256').update(agentToken).digest('hex');
    await pool.query(
      `INSERT INTO api_tokens (id, user_id, name, token_hash, scopes)
       SELECT $1, id, 'integration-agent', $3, $4::jsonb FROM users WHERE mobile = $2`,
      [crypto.randomUUID(), mobileA, agentTokenHash, JSON.stringify(['diaries:read'])]
    );
    expectCode(await api('/api/diaries/v1/dates', { legacyToken: agentToken }));
    expectCode(await api('/api/export/v1/all', { legacyToken: agentToken }), 403);
    expectCode(await api('/api/auth/v1/verify', {
      method: 'POST', body: { token: sessionA.access_token }
    }));
    const refreshed = expectCode(await api('/api/auth/v1/refresh', {
      method: 'POST', body: { refresh_token: sessionA.refresh_token }
    }));
    const tokenA = refreshed.access_token;
    expectCode(await api('/api/auth/v1/verify', {
      method: 'POST', token: tokenA, body: { token: `${sessionA.access_token}stale` }
    }));
    const tabSession = expectCode(await api('/api/auth/v1/login', {
      method: 'POST', body: { mobile: mobileA, password }
    }));
    const firstTabRefresh = expectCode(await api('/api/auth/v1/refresh', {
      method: 'POST', body: { refresh_token: tabSession.refresh_token }
    }));
    const secondTabRefresh = expectCode(await api('/api/auth/v1/refresh', {
      method: 'POST', body: { refresh_token: tabSession.refresh_token }
    }));
    assert.ok(firstTabRefresh.access_token);
    assert.ok(secondTabRefresh.access_token);

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
    const media = expectCode(await api('/api/media/v1/image/upload', {
      method: 'POST', token: tokenA, form
    }));
    const mediaResponse = await fetch(media.url);
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get('content-type'), 'image/webp');
    const tampered = new URL(media.url);
    tampered.searchParams.set('signature', `${tampered.searchParams.get('signature')}x`);
    expectCode(await api(tampered.pathname + tampered.search), 401);

    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
      0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x80, 0x3e, 0x00, 0x00, 0x00, 0x7d, 0x00, 0x00,
      0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61,
      0x00, 0x00, 0x00, 0x00
    ]);
    const voiceForm = new FormData();
    voiceForm.append('file', new Blob([wav], { type: 'audio/wav' }), 'journal.wav');
    const voiceMedia = expectCode(await api('/api/media/v1/voice/upload', {
      method: 'POST', token: tokenA, form: voiceForm
    }));
    const voiceResponse = await fetch(voiceMedia.url);
    assert.equal(voiceResponse.status, 200);
    assert.equal(voiceResponse.headers.get('content-type'), 'audio/wav');

    expectCode(await api('/api/diaries/v1/create', {
      method: 'POST',
      token: sessionB.access_token,
      body: { content: '', voice: { mediaId: voiceMedia.id, duration: 4 } }
    }), 400);

    const diary = expectCode(await api('/api/diaries/v1/create', {
      method: 'POST',
      token: tokenA,
      body: {
        content: 'integration diary',
        tags: ['成长'],
        images: [media.url],
        voice: { mediaId: voiceMedia.id, duration: 4 },
        visibility: 'PRIVATE',
        createdAt: '2026-09-04 10:15:00'
      }
    }));
    assert.equal(diary.date, '2026-09-04');
    assert.equal(diary.images.length, 1);
    assert.equal(diary.voice.mediaId, voiceMedia.id);
    assert.match(diary.voice.url, /\/api\/media\/v1\//);

    const audioOnlyDiary = expectCode(await api('/api/diaries/v1/create', {
      method: 'POST',
      token: tokenA,
      body: {
        content: '',
        voice: { mediaId: voiceMedia.id, duration: 4 },
        visibility: 'PRIVATE',
        createdAt: '2026-09-05 11:20:00'
      }
    }));
    assert.equal(audioOnlyDiary.content, '');
    assert.equal(audioOnlyDiary.voice.duration, 4);

    const transcriptionConfigured = Boolean(
      process.env.VOLC_ASR_API_KEY
      || (process.env.VOLC_ASR_APP_KEY && process.env.VOLC_ASR_ACCESS_KEY)
      || process.env.ASR_API_KEY
    );
    if (!transcriptionConfigured) {
      expectCode(await api(`/api/media/v1/voice/${voiceMedia.id}/transcribe`, {
        method: 'POST', token: tokenA, body: {}
      }), 503);
    }
    const diaryList = expectCode(await api('/api/diaries/v1/index?page=1&pageSize=20', { token: tokenA }));
    assert.equal(diaryList.total, 2);
    const diaryDay = expectCode(await api('/api/diaries/v1/index?date=2026-09-04', { token: tokenA }));
    assert.equal(diaryDay.total, 1);
    const calendar = expectCode(await api('/api/diaries/v1/calendar?month=2026-09', { token: tokenA }));
    assert.deepEqual(calendar.list, [
      { date: '2026-09-04', count: 1 },
      { date: '2026-09-05', count: 1 }
    ]);
    const diaryDates = expectCode(await api('/api/diaries/v1/dates', { token: tokenA }));
    assert.deepEqual(diaryDates, ['2026-09-05', '2026-09-04']);
    const diaryStats = expectCode(await api('/api/diaries/v1/stats', { token: tokenA }));
    const shanghaiYear = Number(new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Shanghai', year: 'numeric'
    }).format(new Date()));
    assert.equal(diaryStats.year, shanghaiYear);
    assert.equal(diaryStats.yearEntries, shanghaiYear === 2026 ? 2 : 0);
    assert.equal(diaryStats.yearDays, shanghaiYear === 2026 ? 2 : 0);
    assert.equal(diaryStats.totalEntries, 2);
    assert.equal(diaryStats.totalDays, 2);
    const otherCalendar = expectCode(await api('/api/diaries/v1/calendar?month=2026-09', {
      token: sessionB.access_token
    }));
    assert.deepEqual(otherCalendar.list, []);
    expectCode(await api('/api/diaries/v1/calendar?month=2026-13', { token: tokenA }), 400);
    expectCode(await api(`/api/diaries/v1/view?id=${diary.id}`, { token: sessionB.access_token }), 404);
    const search = expectCode(await api('/api/diaries/v1/search?keyword=integration', { token: tokenA }));
    assert.equal(search.total, 1);

    const candidateId = crypto.randomUUID();
    const candidateOwner = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobileA]);
    await pool.query(
      `INSERT INTO inquiry_candidates
        (id, user_id, question, context, source, confidence, fingerprint, model_version)
       VALUES ($1, $2, $3, $4, 'DIARY_ANALYSIS', 0.82, $5, 'integration')`,
      [candidateId, candidateOwner.rows[0].id, '我为什么在临近完成时转向别的事情？',
        '需要未来行为结果才能逐步理解。', crypto.randomBytes(32).toString('hex')]
    );
    await pool.query(
      'INSERT INTO inquiry_candidate_diaries (candidate_id, diary_id, user_id) VALUES ($1, $2, $3)',
      [candidateId, diary.id, candidateOwner.rows[0].id]
    );
    const pendingCandidates = expectCode(await api('/api/inquiries/v1/candidates', { token: tokenA }));
    assert.equal(pendingCandidates.total, 1);
    assert.equal(pendingCandidates.list[0].evidenceCount, 1);
    expectCode(await api(`/api/inquiries/v1/candidates/${candidateId}/accept`, {
      method: 'POST', token: sessionB.access_token, body: {}
    }), 404);
    const acceptedCandidate = expectCode(await api(`/api/inquiries/v1/candidates/${candidateId}/accept`, {
      method: 'POST', token: tokenA, body: {}
    }));
    assert.equal(acceptedCandidate.created, true);
    const acceptedInquiry = expectCode(await api(`/api/inquiries/v1/${acceptedCandidate.inquiryId}`, { token: tokenA }));
    assert.equal(acceptedInquiry.evidenceCount, 1);
    assert.equal(acceptedInquiry.evidence[0].diaryId, diary.id);
    await pool.query('DELETE FROM inquiries WHERE id = $1 AND user_id = $2', [acceptedCandidate.inquiryId, candidateOwner.rows[0].id]);
    await pool.query('DELETE FROM inquiry_candidates WHERE id = $1 AND user_id = $2', [candidateId, candidateOwner.rows[0].id]);

    const healthCandidateId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO inquiry_candidates
        (id, user_id, question, context, source, confidence, fingerprint, model_version, inquiry_type)
       VALUES ($1, $2, $3, $4, 'DIARY_ANALYSIS', 0.86, $5, 'integration', 'PHYSICAL_HEALTH')`,
      [healthCandidateId, candidateOwner.rows[0].id, '为什么我最近手心出汗变多？',
        '这只是身体变化候选，需要本人确认。', crypto.randomBytes(32).toString('hex')]
    );
    await pool.query(
      'INSERT INTO inquiry_candidate_diaries (candidate_id, diary_id, user_id) VALUES ($1, $2, $3)',
      [healthCandidateId, diary.id, candidateOwner.rows[0].id]
    );
    expectCode(await api(`/api/inquiries/v1/candidates/${healthCandidateId}/accept`, {
      method: 'POST', token: tokenA, body: {}
    }), 400);
    const acceptedHealthCandidate = expectCode(await api(`/api/inquiries/v1/candidates/${healthCandidateId}/accept`, {
      method: 'POST', token: tokenA, body: { healthConsent: true }
    }));
    const acceptedHealthInquiry = expectCode(await api(`/api/inquiries/v1/${acceptedHealthCandidate.inquiryId}`, { token: tokenA }));
    assert.equal(acceptedHealthInquiry.inquiryType, 'PHYSICAL_HEALTH');
    assert.equal(acceptedHealthInquiry.evidence[0].diaryId, diary.id);
    assert.equal(Object.hasOwn(acceptedHealthInquiry.evidence[0], 'healthObservation'), false);
    await pool.query('DELETE FROM inquiries WHERE id = $1 AND user_id = $2', [acceptedHealthCandidate.inquiryId, candidateOwner.rows[0].id]);
    await pool.query('DELETE FROM inquiry_candidates WHERE id = $1 AND user_id = $2', [healthCandidateId, candidateOwner.rows[0].id]);

    const emptyInquirySummary = expectCode(await api('/api/inquiries/v1/summary', {
      token: sessionB.access_token
    }));
    assert.equal(emptyInquirySummary.openCount, 0);
    expectCode(await api('/api/inquiries/v1', {
      method: 'POST', token: tokenA, body: { question: '短问' }
    }), 400);
    const inquiry = expectCode(await api('/api/inquiries/v1', {
      method: 'POST', token: tokenA,
      body: {
        question: '我为什么在重要选择前会反复否定自己？',
        context: '这是一个需要长期观察、而不是立即得出答案的集成测试问题。'
      }
    }));
    assert.equal(inquiry.status, 'OPEN');
    assert.equal(inquiry.evidenceCount, 0);
    expectCode(await api(`/api/inquiries/v1/${inquiry.id}`, {
      token: sessionB.access_token
    }), 404);
    expectCode(await api(`/api/inquiries/v1/diary-links/${diary.id}`, {
      method: 'PUT', token: sessionB.access_token, body: { inquiryIds: [inquiry.id] }
    }), 404);
    const linkedInquiryIds = expectCode(await api(`/api/inquiries/v1/diary-links/${diary.id}`, {
      method: 'PUT', token: tokenA, body: { inquiryIds: [inquiry.id] }
    }));
    assert.deepEqual(linkedInquiryIds.inquiryIds, [inquiry.id]);
    const diaryInquiryLinks = expectCode(await api(`/api/inquiries/v1/diary-links/${diary.id}`, {
      token: tokenA
    }));
    assert.equal(diaryInquiryLinks.length, 1);
    assert.equal(diaryInquiryLinks[0].id, inquiry.id);
    const manualEvidence = expectCode(await api(`/api/inquiries/v1/${inquiry.id}/evidence`, {
      method: 'POST', token: tokenA,
      body: {
        sourceType: 'ACTION',
        sourceLabel: '一次真实选择',
        excerpt: '这次我在信息不完整时先做了一个可逆的小决定。',
        relation: 'CHALLENGE'
      }
    }));
    assert.equal(manualEvidence.sourceType, 'ACTION');
    let inquiryDetail = expectCode(await api(`/api/inquiries/v1/${inquiry.id}`, { token: tokenA }));
    assert.equal(inquiryDetail.evidenceCount, 2);
    assert.equal(inquiryDetail.usableEvidenceCount, 2);
    assert.equal(inquiryDetail.reviewDue, true);
    assert.equal(inquiryDetail.costSummary.calls, 0);
    assert.ok(inquiryDetail.evidence.some(item => item.diaryId === diary.id));
    assert.ok(inquiryDetail.evidence.some(item => item.id === manualEvidence.id));
    const pausedInquiry = expectCode(await api(`/api/inquiries/v1/${inquiry.id}`, {
      method: 'PATCH', token: tokenA, body: { status: 'PAUSED' }
    }));
    assert.equal(pausedInquiry.status, 'PAUSED');
    const pausedList = expectCode(await api('/api/inquiries/v1?status=PAUSED&page=1&pageSize=20', {
      token: tokenA
    }));
    assert.equal(pausedList.total, 1);
    assert.equal(pausedList.list[0].id, inquiry.id);
    expectCode(await api(`/api/inquiries/v1/${inquiry.id}`, {
      method: 'PATCH', token: tokenA, body: { status: 'OPEN' }
    }));
    inquiryDetail = expectCode(await api(`/api/inquiries/v1/${inquiry.id}`, { token: tokenA }));
    assert.equal(inquiryDetail.status, 'OPEN');

    expectCode(await api('/api/inquiries/v1', {
      method: 'POST', token: tokenA,
      body: { question: '为什么我最近总是手心出汗？', inquiryType: 'PHYSICAL_HEALTH' }
    }), 400);
    const healthInquiry = expectCode(await api('/api/inquiries/v1', {
      method: 'POST', token: tokenA,
      body: {
        question: '为什么我最近总是手心出汗？',
        context: '先观察何时变重或减轻，不做疾病判断。',
        inquiryType: 'PHYSICAL_HEALTH',
        observationStartedOn: '2026-08-20',
        personalBaseline: '以前只在运动后明显。',
        healthConsent: true
      }
    }));
    assert.equal(healthInquiry.inquiryType, 'PHYSICAL_HEALTH');
    assert.equal(healthInquiry.healthConsent, true);
    assert.match(healthInquiry.medicalDisclaimer, /不是医学诊断/);
    expectCode(await api(`/api/inquiries/v1/${healthInquiry.id}`, {
      token: sessionB.access_token
    }), 404);
    const wellbeingRecord = expectCode(await api('/api/wellbeing/v1', {
      method: 'POST', token: tokenA,
      body: {
        recordedOn: '2026-09-04',
        note: '开会前手心出汗明显，睡眠不足。',
        observation: {
          physicalSymptoms: ['手心出汗'], bodyAreas: ['手'], severity: 99,
          duration: '约 20 分钟', sleep: { hours: 5.5, quality: 2 }
        }
      }
    }));
    assert.equal(wellbeingRecord.observation.severity, 10);
    assert.equal(wellbeingRecord.observation.sleep.hours, 5.5);
    const archivedWellbeing = expectCode(await api(`/api/wellbeing/v1/${wellbeingRecord.id}/status`, {
      method: 'POST', token: tokenA, body: { action: 'archive' }
    }));
    assert.equal(archivedWellbeing.status, 'ARCHIVED');
    const restoredWellbeing = expectCode(await api(`/api/wellbeing/v1/${wellbeingRecord.id}/status`, {
      method: 'POST', token: tokenA, body: { action: 'restore' }
    }));
    assert.equal(restoredWellbeing.status, 'CONFIRMED');
    const healthEvidence = expectCode(await api(`/api/inquiries/v1/${healthInquiry.id}/evidence`, {
      method: 'POST', token: tokenA,
      body: {
        excerpt: '开会前手心出汗明显，睡眠不足。',
        relation: 'CONTEXT'
      }
    }));
    assert.equal(healthEvidence.sourceType, 'NOTE');
    assert.equal(Object.hasOwn(healthEvidence, 'wellbeingRecordId'), false);
    const physicalList = expectCode(await api('/api/inquiries/v1?status=OPEN&type=PHYSICAL_HEALTH&page=1&pageSize=20', {
      token: tokenA
    }));
    assert.equal(physicalList.total, 1);
    assert.equal(physicalList.list[0].id, healthInquiry.id);
    const healthSummary = expectCode(await api(`/api/inquiries/v1/${healthInquiry.id}/health-summary`, { token: tokenA }));
    assert.match(healthSummary.content, /健康时间线/);
    assert.match(healthSummary.content, /不是医学诊断/);
    expectCode(await api(`/api/inquiries/v1/${healthInquiry.id}/health-summary`, {
      token: sessionB.access_token
    }), 404);
    expectCode(await api(`/api/inquiries/v1/${inquiry.id}/health-summary`, { token: tokenA }), 404);

    const friend = expectCode(await api('/api/friends/v1/upsert', {
      method: 'POST',
      legacyToken: tokenA,
      body: {
        id: 'friend_integration',
        name: 'Integration Friend',
        category: '朋友',
        relationship: 'integration relationship',
        tags: ['#IntegrationFriend'],
        relationScore: 4
      }
    }));
    assert.equal(friend.id, 'friend_integration');
    assert.equal(friend.relationScore, 4);
    const scoredFriend = expectCode(await api(`/api/friends/v1/${friend.id}/score`, {
      method: 'POST', token: tokenA,
      body: { ruleCode: 'R_PLUS_HELP', change: -3, reason: 'provided useful help', diaryId: diary.id }
    }));
    assert.equal(scoredFriend.relationScore, 6);
    assert.equal(scoredFriend.history.change, 2);
    expectCode(await api(`/api/friends/v1/${friend.id}/interactions`, {
      method: 'POST', token: tokenA,
      body: { date: '2026-09-04', type: '合作', topic: 'integration topic', sentiment: 'positive', diaryId: diary.id }
    }));
    expectCode(await api(`/api/friends/v1/${friend.id}/todos`, {
      method: 'POST', token: tokenA,
      body: { task: 'send integration material', dueDate: '2026-09-10' }
    }));
    const friendView = expectCode(await api(`/api/friends/v1/${friend.id}`, { token: tokenA }));
    assert.equal(friendView.interactions.length, 1);
    assert.equal(friendView.scoreHistory.length, 1);
    assert.equal(friendView.todos.length, 1);
    expectCode(await api(`/api/friends/v1/${friend.id}`, { token: sessionB.access_token }), 404);

    const importPayload = {
      friends: [{
        id: 'friend_legacy',
        name: 'Legacy Friend',
        category: '同学',
        relationship: 'migrated relationship',
        tags: ['#LegacyFriend'],
        relationScore: 8,
        lastInteraction: '2026-06-01',
        interactions: [{ date: '2026-06-01', type: '聚餐', topic: 'legacy dinner', sentiment: 'neutral', diaryId: diary.id }],
        scoreHistory: [{ date: '2026-06-01', change: 1, reason: 'legacy score', diaryId: diary.id }],
        todos: [{ task: 'legacy promise', dueDate: '2026-09-20', status: 'pending' }],
        milestones: [{ date: '2026-06-01', event: '首次记录', context: 'legacy context' }]
      }, {
        id: 'friend_legacy_zero',
        name: 'Legacy Zero Friend',
        category: '旧数据',
        relationScore: 0,
        scoreHistory: [{ date: '2026-05-01', change: 0, reason: 'legacy neutral scoring event' }]
      }]
    };
    expectCode(await api('/api/friends/v1/import', { method: 'POST', token: tokenA, body: importPayload }));
    expectCode(await api('/api/friends/v1/import', { method: 'POST', token: tokenA, body: importPayload }));
    const legacyFriend = expectCode(await api('/api/friends/v1/friend_legacy', { token: tokenA }));
    assert.equal(legacyFriend.interactions.length, 1);
    assert.equal(legacyFriend.scoreHistory.length, 1);
    assert.equal(legacyFriend.todos.length, 1);
    assert.equal(legacyFriend.milestones.length, 1);
    const legacyZeroFriend = expectCode(await api('/api/friends/v1/friend_legacy_zero', { token: tokenA }));
    assert.equal(legacyZeroFriend.relationScore, 0);
    assert.equal(legacyZeroFriend.scoreHistory[0].change, 0);
    const friendListResult = expectCode(await api('/api/friends/v1/list?page=1&pageSize=1', { token: tokenA }));
    assert.equal(friendListResult.list.length, 1);
    assert.equal(friendListResult.total, 3);
    const updatedFriend = expectCode(await api(`/api/friends/v1/${friend.id}`, {
      method: 'PUT', token: tokenA,
      body: { name: 'Integration Friend Updated', category: '伙伴', relationship: 'updated safely', tags: ['#Updated'], relationScore: 6 }
    }));
    assert.equal(updatedFriend.name, 'Integration Friend Updated');
    const completedFriendTodo = expectCode(await api(`/api/friends/v1/${friend.id}/todos/${friendView.todos[0].id}`, {
      method: 'PUT', token: tokenA, body: { status: 'done' }
    }));
    assert.equal(completedFriendTodo.status, 'done');

    const emptyLifeOs = expectCode(await api('/api/life-os/v1/config', { token: tokenA }));
    assert.equal(emptyLifeOs.version, 0);
    const lifeOsDraftStatus = expectCode(await api('/api/life-os/v1/draft/status', { token: tokenA }));
    assert.equal(lifeOsDraftStatus.diaryCount, 1);
    assert.equal(lifeOsDraftStatus.ready, false);
    expectCode(await api('/api/life-os/v1/draft', {
      method: 'POST', token: tokenA, body: {}
    }), 400);
    const lifeOs = expectCode(await api('/api/life-os/v1/config', {
      method: 'PUT', token: tokenA, body: {
        contentMd: '# Integration OS\n\nR1: verify ownership.',
        version: 0,
        origin: 'ai_assisted',
        sourceRefs: [{ type: 'diary', id: diary.id }],
        generationMeta: { principleCount: 1, diaryCount: 1, generatedAt: '2026-09-09T00:00:00.000Z' }
      }
    }));
    assert.equal(lifeOs.version, 1);
    assert.equal(lifeOs.origin, 'ai_assisted');
    assert.deepEqual(lifeOs.sourceRefs, [{ type: 'diary', id: diary.id }]);
    expectCode(await api('/api/life-os/v1/config', {
      method: 'PUT', token: tokenA, body: { contentMd: 'stale overwrite', version: 0 }
    }), 409);
    const otherLifeOs = expectCode(await api('/api/life-os/v1/config', { token: sessionB.access_token }));
    assert.equal(otherLifeOs.configured, false);
    const lifeOsHistory = expectCode(await api('/api/life-os/v1/config/history', { token: tokenA }));
    assert.equal(lifeOsHistory.total, 1);
    assert.equal(lifeOsHistory.list[0].origin, 'ai_assisted');

    const lifeOsPlan = expectCode(await api('/api/life-os/v1/plan/home', { token: tokenA }));
    assert.equal(lifeOsPlan.counts.total, 20);
    assert.equal(lifeOsPlan.sections.length, 5);
    const lifeOsPlanAgain = expectCode(await api('/api/life-os/v1/plan/home', { token: tokenA }));
    assert.deepEqual(lifeOsPlanAgain.sections.flatMap(section => section.items.map(item => item.id)), lifeOsPlan.sections.flatMap(section => section.items.map(item => item.id)));
    const otherLifeOsPlan = expectCode(await api('/api/life-os/v1/plan/home', { token: sessionB.access_token }));
    assert.equal(otherLifeOsPlan.counts.total, 20);
    assert.notEqual(otherLifeOsPlan.sections[0].items[0].id, lifeOsPlan.sections[0].items[0].id);
    const focus = expectCode(await api('/api/life-os/v1/plan/focus', {
      method: 'PUT', token: tokenA, body: { itemKeys: ['01', '03'] }
    }));
    assert.deepEqual(focus.map(item => item.stableKey).sort(), ['01', '03']);
    const editedLifeOsItem = expectCode(await api('/api/life-os/v1/plan/items/01', {
      method: 'PATCH', token: tokenA, body: { currentNextStep: '完成一次可核对的小行动' }
    }));
    assert.equal(editedLifeOsItem.currentNextStep, '完成一次可核对的小行动');
    const lifeOsItem = expectCode(await api('/api/life-os/v1/plan/items/01', { token: tokenA }));
    assert.equal(lifeOsItem.item.currentNextStep, '完成一次可核对的小行动');
    const otherLifeOsItem = expectCode(await api('/api/life-os/v1/plan/items/01', { token: sessionB.access_token }));
    assert.equal(otherLifeOsItem.item.currentNextStep, '');
    const portableLifeOs = expectCode(await api('/api/life-os/v1/plan/export', { token: tokenA }));
    assert.equal(portableLifeOs.json.format, 'shroom-life-os-v1');
    assert.equal(portableLifeOs.json.sections.flatMap(section => section.items).length, 20);
    assert.match(portableLifeOs.markdown, /# Shroom 复利系统 · 长期方向/);

    const compoundBefore = expectCode(await api('/api/compound/v2/home', { token: tokenA }));
    assert.equal(compoundBefore.needsOnboarding, true);
    assert.equal(compoundBefore.directionCount, 20);
    const compoundThread = expectCode(await api('/api/compound/v2/threads', {
      method: 'POST', token: tokenA, body: {
        itemKey: '05',
        desiredOutcome: '做出一份可核对的真实交付案例',
        currentStep: '先列出现有的前后证据',
        contextReason: '由集成测试用户确认'
      }
    }));
    assert.equal(compoundThread.itemKey, '05');
    assert.equal(compoundThread.progressMode, 'OUTCOME');
    const compoundResumed = expectCode(await api('/api/compound/v2/home', { token: tokenA }));
    assert.equal(compoundResumed.needsOnboarding, false);
    assert.equal(compoundResumed.current.currentStep, '先列出现有的前后证据');
    expectCode(await api(`/api/compound/v2/threads/${compoundThread.id}`, { token: sessionB.access_token }), 404);
    expectCode(await api(`/api/compound/v2/threads/${compoundThread.id}/blocker`, {
      method: 'POST', token: tokenA, body: { blocker: '' }
    }), 400);

    const owner = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobileA]);
    expectCode(await api('/api/compound/v2/quiet-day', { method: 'POST', token: tokenA, body: {} }));
    assert.equal(expectCode(await api('/api/compound/v2/home', { token: tokenA })).quietToday, true);
    assert.equal(expectCode(await api('/api/compound/v2/home', { token: sessionB.access_token })).quietToday, false);
    expectCode(await api('/api/compound/v2/quiet-day', { method: 'DELETE', token: tokenA }));
    assert.equal(expectCode(await api('/api/compound/v2/home', { token: tokenA })).quietToday, false);

    const suggestionEventId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, summary, payload)
       VALUES ($1, $2, $3, 'CONTINUE', 'CONFIRMED', 'AI', '建议缩小行动', $4::jsonb)`,
      [suggestionEventId, owner.rows[0].id, compoundThread.id, JSON.stringify({
        currentStep: '只核对第一条证据', assistance: '先缩小范围，不自动改变用户确认的行动。', intent: 'EASIER',
        easyVersions: [{ label: '最小版本', timebox: '5 分钟', step: '只核对第一条证据' }]
      })]
    );
    assert.equal(expectCode(await api('/api/compound/v2/home', { token: tokenA })).current.currentStep, '先列出现有的前后证据');
    expectCode(await api(`/api/compound/v2/threads/${compoundThread.id}/suggestions/${suggestionEventId}/adopt`, {
      method: 'POST', token: sessionB.access_token, body: { currentStep: '只核对第一条证据' }
    }), 404);
    expectCode(await api(`/api/compound/v2/threads/${compoundThread.id}/suggestions/${suggestionEventId}/adopt`, {
      method: 'POST', token: tokenA, body: { currentStep: '只核对第一条证据' }
    }));
    assert.equal(expectCode(await api('/api/compound/v2/home', { token: tokenA })).current.currentStep, '只核对第一条证据');

    const compoundItem = await pool.query(
      `SELECT id FROM life_os_items WHERE user_id = $1 AND stable_key = '05'`,
      [owner.rows[0].id]
    );
    const compoundLinkId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO life_os_item_links
        (id, user_id, item_id, diary_id, record_type, evidence_excerpt, summary, origin, status)
       VALUES ($1, $2, $3, $4, 'ACTION', 'integration diary', '真实日记关联', 'AI', 'ACTIVE')`,
      [compoundLinkId, owner.rows[0].id, compoundItem.rows[0].id, diary.id]
    );
    const compoundWithDiary = expectCode(await api('/api/compound/v2/home', { token: tokenA }));
    assert.equal(compoundWithDiary.diarySuggestions[0].diaryId, diary.id);
    expectCode(await api(`/api/compound/v2/threads/${compoundThread.id}/diary-links/${compoundLinkId}/dismiss`, {
      method: 'POST', token: tokenA, body: {}
    }));
    const compoundWithoutDiary = expectCode(await api('/api/compound/v2/home', { token: tokenA }));
    assert.equal(compoundWithoutDiary.diarySuggestions.length, 0);

    const resultEventId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, input_text, summary, payload)
       VALUES ($1, $2, $3, 'RESULT', 'DRAFT', 'AI', '已经完成证据清单', '完成证据清单', $4::jsonb)`,
      [resultEventId, owner.rows[0].id, compoundThread.id, JSON.stringify({
        state: 'DONE', accumulationType: 'PRINCIPAL', accumulationName: '三条证据清单',
        summary: '完成证据清单', actualResult: '一份包含三条证据的清单',
        progressSummary: '已完成第一步', nextStep: '找出缺少的结果证据', uncertainty: '', rawInput: '已经完成证据清单'
      })]
    );
    const confirmedCompoundResult = expectCode(await api(`/api/compound/v2/threads/${compoundThread.id}/results/${resultEventId}/confirm`, {
      method: 'POST', token: tokenA, body: { closeMode: 'CONTINUE' }
    }));
    assert.equal(confirmedCompoundResult.event.payload.state, 'DONE');
    assert.equal(confirmedCompoundResult.event.payload.accumulationType, 'PRINCIPAL');
    const compoundAfterResult = expectCode(await api('/api/compound/v2/home', { token: tokenA }));
    assert.equal(compoundAfterResult.current.lastCompleted, '一份包含三条证据的清单');
    assert.equal(compoundAfterResult.current.currentStep, '找出缺少的结果证据');

    const reuseEventId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO compound_events
        (id, user_id, thread_id, kind, status, actor, input_text, summary, payload)
       VALUES ($1, $2, $3, 'RESULT', 'DRAFT', 'AI', '复用了证据清单', '复用了证据清单', $4::jsonb)`,
      [reuseEventId, owner.rows[0].id, compoundThread.id, JSON.stringify({
        state: 'DONE', accumulationType: 'REUSE', principalEventId: resultEventId,
        summary: '复用了证据清单', actualResult: '清单用于第二次检查', progressSummary: '已经发生一次复用',
        nextStep: '观察它是否减少遗漏', uncertainty: '', rawInput: '复用了证据清单'
      })]
    );
    expectCode(await api(`/api/compound/v2/threads/${compoundThread.id}/results/${reuseEventId}/confirm`, {
      method: 'POST', token: tokenA, body: { closeMode: 'CONTINUE' }
    }));
    const compoundWithEvidence = expectCode(await api('/api/compound/v2/home', { token: tokenA }));
    assert.equal(compoundWithEvidence.compoundEvidence[0].id, resultEventId);
    assert.equal(compoundWithEvidence.compoundEvidence[0].useCount, 1);
    const bodyPractice = expectCode(await api('/api/compound/v2/body-practice', { token: tokenA }));
    assert.ok(bodyPractice.practice.segments.length >= 5);
    assert.ok(bodyPractice.practice.segments.every(segment => segment.endSeconds - segment.startSeconds <= 120));
    assert.equal(bodyPractice.completed, false);
    const firstYogaIds = [bodyPractice.practice.segments[0].id, bodyPractice.practice.segments[1].id];
    const savedBodyPractice = expectCode(await api('/api/compound/v2/body-practice/check-in', {
      method: 'POST', token: tokenA, body: { segmentIds: [...firstYogaIds, firstYogaIds[0], 'unknown-segment'] }
    }));
    assert.deepEqual(savedBodyPractice.completedSegmentIds, firstYogaIds);
    assert.equal(savedBodyPractice.completed, true);
    const isolatedBodyPractice = expectCode(await api('/api/compound/v2/body-practice', { token: sessionB.access_token }));
    assert.equal(isolatedBodyPractice.completed, false);
    const loadedBodyPractice = expectCode(await api('/api/compound/v2/body-practice', { token: tokenA }));
    assert.deepEqual(loadedBodyPractice.completedSegmentIds, firstYogaIds);
    const clearedBodyPractice = expectCode(await api('/api/compound/v2/body-practice/check-in', {
      method: 'DELETE', token: tokenA
    }));
    assert.equal(clearedBodyPractice.completed, false);
    const portableCompound = expectCode(await api('/api/compound/v2/export', { token: tokenA }));
    assert.equal(portableCompound.json.format, 'shroom-compound-v1');
    assert.equal(portableCompound.json.threads.length, 1);
    assert.match(portableCompound.markdown, /Shroom 复利系统/);

    const aiStatus = expectCode(await api('/api/ai/v1/status', { token: tokenA }));
    if (!aiStatus.enabled) {
      expectCode(await api('/api/ai/v1/analyze', {
        method: 'POST', token: tokenA, body: { diaryId: diary.id, sync: false }
      }), 503);
    } else if (process.env.TEST_SKIP_PAID_AI !== '1') {
      const analysis = expectCode(await api('/api/ai/v1/analyze', {
        method: 'POST', token: tokenA, body: { diaryId: diary.id, sync: true }
      }));
      assert.equal(analysis.status, 'done');
      assert.deepEqual(Object.keys(analysis.views).sort(), ['v1', 'v2', 'v3', 'v4', 'v5']);
    }
    expectCode(await api('/api/ai/v1/analysis?diaryId=' + diary.id, { token: sessionB.access_token }));

    const rules = expectCode(await api('/api/reminders/v1/rules', { token: tokenA }));
    assert.equal(rules.length, 4);
    const disabledRule = expectCode(await api(`/api/reminders/v1/rules/${rules[0].id}`, {
      method: 'PUT', token: tokenA, body: { enabled: false }
    }));
    assert.equal(disabledRule.enabled, false);
    expectCode(await api(`/api/reminders/v1/rules/${rules[0].id}`, {
      method: 'PUT', token: tokenA, body: { enabled: true }
    }));
    const reminderView = expectCode(await api('/api/reminders/v1/overview', { token: tokenA }));
    assert.ok(reminderView.contactDue.some(item => item.friendId === 'friend_legacy'));
    const monthlyReview = expectCode(await api('/api/reminders/v1/run/monthly-review', {
      method: 'POST', token: tokenA, body: { period: '2026-09' }
    }));
    assert.equal(monthlyReview.period, '2026-09');

    const todo = expectCode(await api('/api/todos/v1/create', {
      method: 'POST', token: tokenA, body: { content: 'integration todo', tags: ['行动'] }
    }));
    const completed = expectCode(await api(`/api/todos/v1/complete?id=${todo.id}`, {
      method: 'POST', token: tokenA, body: {}
    }));
    assert.equal(completed.status, 'completed');

    const titleOnlyRequest = `integration-title-only-${suffix}`;
    const titleOnly = expectCode(await api('/api/todos/v1/create', {
      method: 'POST', token: tokenA,
      body: { title: 'title only task', clientRequestId: titleOnlyRequest, timeZone: 'Asia/Shanghai' }
    }));
    assert.equal(titleOnly.scheduledDate, null);
    assert.equal(titleOnly.projectId, null);
    const repeatedCreate = expectCode(await api('/api/todos/v1/create', {
      method: 'POST', token: tokenA,
      body: { title: 'title only task', clientRequestId: titleOnlyRequest, timeZone: 'Asia/Shanghai' }
    }));
    assert.equal(repeatedCreate.id, titleOnly.id);
    const unscheduled = expectCode(await api('/api/todos/v1/home?view=unscheduled&timeZone=Asia%2FShanghai', { token: tokenA }));
    assert.ok(unscheduled.groups[0].items.some(item => item.id === titleOnly.id));
    expectCode(await api(`/api/todos/v1/view?id=${titleOnly.id}`, { token: sessionB.access_token }), 404);

    const startedTask = expectCode(await api('/api/todos/v1/status', {
      method: 'PATCH', token: tokenA,
      body: { id: titleOnly.id, action: 'START', version: titleOnly.version, operationId: `start-${suffix}`, timeZone: 'Asia/Shanghai' }
    }));
    assert.equal(startedTask.status, 'in_progress');
    assert.equal(startedTask.scheduledDate, null);
    const currentTasks = expectCode(await api('/api/todos/v1/home?view=current&timeZone=Asia%2FShanghai', { token: tokenA }));
    assert.equal(currentTasks.groups[0].key, 'progressing');
    assert.ok(currentTasks.groups[0].items.some(item => item.id === titleOnly.id));

    const project = expectCode(await api('/api/todos/v1/projects', {
      method: 'POST', token: tokenA,
      body: { name: 'Integration project', goal: 'verify one shared task identity' }
    }));
    const projectTask = expectCode(await api('/api/todos/v1/create', {
      method: 'POST', token: tokenA,
      body: { title: 'project task', projectId: project.id, scheduledDate: currentTasks.today, clientRequestId: `project-task-${suffix}`, timeZone: 'Asia/Shanghai' }
    }));
    const projectView = expectCode(await api(`/api/todos/v1/projects/${project.id}?timeZone=Asia%2FShanghai`, { token: tokenA }));
    assert.ok(projectView.groups.some(group => group.items.some(item => item.id === projectTask.id)));
    const currentWithProject = expectCode(await api('/api/todos/v1/home?view=current&timeZone=Asia%2FShanghai', { token: tokenA }));
    assert.ok(currentWithProject.groups.some(group => group.items.some(item => item.id === projectTask.id)));

    const repeatTask = expectCode(await api('/api/todos/v1/create', {
      method: 'POST', token: tokenA,
      body: {
        title: 'daily repeat task', timeZone: 'Asia/Shanghai', clientRequestId: `repeat-${suffix}`,
        recurrence: { frequency: 'DAILY', startsOn: currentTasks.today, timeZone: 'Asia/Shanghai' }
      }
    }));
    assert.ok(repeatTask.recurrenceRuleId);
    await api('/api/todos/v1/home?view=current&timeZone=Asia%2FShanghai', { token: tokenA });
    await api('/api/todos/v1/home?view=current&timeZone=Asia%2FShanghai', { token: tokenA });
    const occurrenceCount = await pool.query(
      'SELECT count(*)::int AS count, count(DISTINCT occurrence_date)::int AS dates FROM todos WHERE recurrence_rule_id=$1',
      [repeatTask.recurrenceRuleId]
    );
    assert.equal(occurrenceCount.rows[0].count, occurrenceCount.rows[0].dates);
    const updatedRepeat = expectCode(await api(`/api/todos/v1/recurrences/${repeatTask.recurrenceRuleId}`, {
      method: 'PUT', token: tokenA,
      body: {
        title: 'weekly repeat task', description: 'changed from this occurrence forward',
        currentTaskId: repeatTask.id, effectiveOn: repeatTask.occurrenceDate,
        version: repeatTask.recurrence.version, operationId: `repeat-update-${suffix}`,
        timeZone: 'Asia/Shanghai',
        recurrence: { frequency: 'WEEKLY', startsOn: repeatTask.occurrenceDate, weekDays: [1, 3], timeZone: 'Asia/Shanghai' }
      }
    }));
    assert.equal(updatedRepeat.frequency, 'WEEKLY');
    const repeatInstanceAfterUpdate = expectCode(await api(`/api/todos/v1/view?id=${repeatTask.id}`, { token: tokenA }));
    assert.equal(repeatInstanceAfterUpdate.title, 'weekly repeat task');
    assert.equal(repeatInstanceAfterUpdate.recurrence.frequency, 'WEEKLY');
    const duplicateRepeatUpdate = expectCode(await api(`/api/todos/v1/recurrences/${repeatTask.recurrenceRuleId}`, {
      method: 'PUT', token: tokenA,
      body: {
        title: 'weekly repeat task', currentTaskId: repeatTask.id, effectiveOn: repeatTask.occurrenceDate,
        version: repeatTask.recurrence.version, operationId: `repeat-update-${suffix}`,
        timeZone: 'Asia/Shanghai',
        recurrence: { frequency: 'WEEKLY', startsOn: repeatTask.occurrenceDate, weekDays: [1, 3], timeZone: 'Asia/Shanghai' }
      }
    }));
    assert.equal(duplicateRepeatUpdate.id, repeatTask.recurrenceRuleId);

    const completedWithResult = expectCode(await api('/api/todos/v1/status', {
      method: 'PATCH', token: tokenA,
      body: { id: startedTask.id, action: 'COMPLETE', version: startedTask.version, result: 'produced an integration result', resultMediaIds: [media.id], operationId: `complete-${suffix}`, timeZone: 'Asia/Shanghai' }
    }));
    assert.equal(completedWithResult.status, 'completed');
    assert.equal(completedWithResult.result, 'produced an integration result');
    assert.deepEqual(completedWithResult.resultMediaIds, [media.id]);
    const completedDetail = expectCode(await api(`/api/todos/v1/view?id=${startedTask.id}`, { token: tokenA }));
    assert.equal(completedDetail.resultMedia[0].id, media.id);
    const taskMediaResponse = await fetch(completedDetail.resultMedia[0].url);
    assert.equal(taskMediaResponse.status, 200);
    const duplicateComplete = expectCode(await api('/api/todos/v1/status', {
      method: 'PATCH', token: tokenA,
      body: { id: startedTask.id, action: 'COMPLETE', version: startedTask.version, result: 'duplicate', operationId: `complete-${suffix}`, timeZone: 'Asia/Shanghai' }
    }));
    assert.equal(duplicateComplete.id, completedWithResult.id);
    const updatedResult = expectCode(await api('/api/todos/v1/result', {
      method: 'PATCH', token: tokenA,
      body: { id: startedTask.id, version: completedWithResult.version, result: 'result supplemented later', resultMediaIds: [media.id], operationId: `result-${suffix}`, timeZone: 'Asia/Shanghai' }
    }));
    assert.equal(updatedResult.result, 'result supplemented later');
    assert.deepEqual(updatedResult.resultMediaIds, [media.id]);
    const duplicateResult = expectCode(await api('/api/todos/v1/result', {
      method: 'PATCH', token: tokenA,
      body: { id: startedTask.id, version: completedWithResult.version, result: 'must not overwrite', resultMediaIds: [], operationId: `result-${suffix}`, timeZone: 'Asia/Shanghai' }
    }));
    assert.equal(duplicateResult.result, 'result supplemented later');
    const actionRecords = expectCode(await api(`/api/todos/v1/actions?date=${currentTasks.today}&timeZone=Asia%2FShanghai`, { token: tokenA }));
    assert.equal(actionRecords.list.filter(item => item.taskId === startedTask.id).length, 1);
    assert.equal(actionRecords.list.find(item => item.taskId === startedTask.id).result, 'result supplemented later');
    const restoredTask = expectCode(await api('/api/todos/v1/status', {
      method: 'PATCH', token: tokenA,
      body: { id: startedTask.id, action: 'RESTORE', version: updatedResult.version, operationId: `restore-${suffix}`, timeZone: 'Asia/Shanghai' }
    }));
    assert.equal(restoredTask.status, 'pending');
    const restoredActions = expectCode(await api(`/api/todos/v1/actions?date=${currentTasks.today}&timeZone=Asia%2FShanghai`, { token: tokenA }));
    assert.equal(restoredActions.list.some(item => item.taskId === startedTask.id), false);

    const incompleteArchive = await api(`/api/todos/v1/projects/${project.id}/archive`, {
      method: 'POST', token: tokenA, body: {}
    });
    expectCode(incompleteArchive, 409);

    const card = expectCode(await api('/api/cards/v1/create', {
      method: 'POST',
      token: tokenA,
      body: {
        seedSentence: 'integration awareness',
        myUnderstanding: 'integration understanding',
        usageItems: ['practice once'],
        tags: ['成长'],
        visibility: 'PUBLIC_NAMED'
      }
    }));
    expectCode(await api(`/api/cards/v1/practices?id=${card.id}`, {
      method: 'POST',
      token: tokenA,
      body: { context: 'test context', action: 'test action', feeling: 'calm', result: 'clear', reflection: 'keep going' }
    }));
    const detail = expectCode(await api(`/api/cards/v1/view?id=${card.id}`, { token: tokenA }));
    assert.equal(detail.isOwner, true);
    assert.equal(detail.practiceCases.length, 1);
    const publicDetail = expectCode(await api(`/api/cards/v1/view?id=${card.id}`));
    assert.equal(publicDetail.id, card.id);
    assert.equal(publicDetail.isOwner, false);
    assert.equal(publicDetail.practiceCases.length, 0);
    assert.equal(publicDetail.stats.practiceCount, 0);
    assert.equal(publicDetail.sourceDiaryId, undefined);
    assert.deepEqual(publicDetail.viewerState, {
      resonated: false,
      favorited: false,
      copiedCardId: null
    });
    const discover = expectCode(await api('/api/cards/v1/discover?tags=成长&sort=latest'));
    assert.ok(discover.list.some(item => item.id === card.id));
    expectCode(await api('/api/cards/v1/resonate', {
      method: 'POST', token: sessionB.access_token, body: { id: card.id }
    }));
    expectCode(await api('/api/cards/v1/favorite', {
      method: 'POST', token: sessionB.access_token, body: { id: card.id }
    }));
    const copiedCard = expectCode(await api('/api/cards/v1/copy', {
      method: 'POST', token: sessionB.access_token, body: { id: card.id }
    }));
    assert.equal(copiedCard.isOwner, true);
    assert.equal(copiedCard.copiedFromId, card.id);
    const repeatedCopy = expectCode(await api('/api/cards/v1/copy', {
      method: 'POST', token: sessionB.access_token, body: { id: card.id }
    }));
    assert.equal(repeatedCopy.id, copiedCard.id);
    const viewerDetail = expectCode(await api(`/api/cards/v1/view?id=${card.id}`, { token: sessionB.access_token }));
    assert.equal(viewerDetail.viewerState.resonated, true);
    assert.equal(viewerDetail.viewerState.favorited, true);
    assert.equal(viewerDetail.viewerState.copiedCardId, copiedCard.id);
    expectCode(await api('/api/cards/v1/unresonate', {
      method: 'POST', token: sessionB.access_token, body: { id: card.id }
    }));
    expectCode(await api('/api/cards/v1/unfavorite', {
      method: 'POST', token: sessionB.access_token, body: { id: card.id }
    }));
    const clearedViewerDetail = expectCode(await api(`/api/cards/v1/view?id=${card.id}`, { token: sessionB.access_token }));
    assert.equal(clearedViewerDetail.viewerState.resonated, false);
    assert.equal(clearedViewerDetail.viewerState.favorited, false);

    const exported = expectCode(await api('/api/export/v1/all', { token: tokenA }));
    assert.equal(exported.format, 'shroom-export-v1');
    assert.equal(exported.diaries.length, 2);
    assert.equal(exported.friends.length, 3);
    assert.equal(exported.lifeOs.version, 1);
    assert.equal(exported.lifeOsItems.length, 20);
    assert.equal(exported.lifeOsWeekFocus.length, 2);
    assert.equal(exported.compoundThreads.length, 1);
    assert.ok(exported.compoundEvents.some(item => item.kind === 'RESULT'));
    assert.equal(exported.inquiries.length, 2);
    assert.equal(exported.inquiryEvidence.length, 3);
    assert.ok(exported.inquiries.some(item => item.inquiry_type === 'PHYSICAL_HEALTH'));
    assert.ok(exported.inquiryEvidence.every(item => item.source_type !== 'WELLBEING'));
    assert.ok(exported.wellbeingRecords.some(item => item.observation.severity === 10));
    assert.equal(exported.inquirySyntheses.length, 0);
    assert.ok(exported.todoProjects.some(item => item.id === project.id));
    assert.ok(exported.todoRecurrenceRules.some(item => item.id === repeatTask.recurrenceRuleId));
    assert.ok(exported.todoEvents.some(item => item.todo_id === startedTask.id));
    const redactedExport = expectCode(await api('/api/export/v1/all?redacted=true', { token: tokenA }));
    assert.deepEqual(redactedExport.account, {});
    assert.ok(redactedExport.friends.every(item => Object.keys(item.contact).length === 0));

    console.log(JSON.stringify({
      ok: true,
      checks: ['auth', 'refresh', 'refresh-retry-header-precedence', 'refresh-multi-tab-grace', 'scoped-agent-token', 'private-media', 'private-voice', 'voice-only-diary', 'transcription-disabled-safe', 'diary-isolation', 'diary-calendar', 'diary-dates', 'search', 'inquiry-candidate-confirmation', 'inquiry-validation', 'inquiry-isolation', 'inquiry-diary-link', 'inquiry-evidence', 'inquiry-status', 'inquiry-cost-ledger', 'health-inquiry-consent', 'health-inquiry-isolation', 'health-observation', 'wellbeing-status', 'health-summary-export', 'friend-header-compatibility', 'friend-rules', 'friend-isolation', 'friend-import-idempotency', 'legacy-score-preservation', 'friend-write-operations', 'life-os-versioning', 'life-os-long-term', 'life-os-long-term-isolation', 'life-os-long-term-export', 'compound-onboarding', 'compound-cross-session', 'compound-isolation', 'compound-diary-dismiss', 'compound-result-confirmation', 'compound-body-practice', 'compound-export', 'ai-status-and-isolation', ...(process.env.TEST_SKIP_PAID_AI === '1' ? [] : ['ai-five-view-flow']), 'reminder-rules', 'relationship-review', 'todo-title-only-idempotency', 'todo-undated-start', 'todo-project-identity', 'todo-recurrence-idempotency', 'todo-recurrence-scope', 'todo-result-media-and-supplement', 'todo-action-record-undo', 'todo-project-archive-safety', 'cards', 'public-card-detail', 'discovery', 'resonance-toggle', 'favorite-toggle', 'card-copy-idempotency', 'data-export', 'redacted-export']
    }));
  } finally {
    await cleanup();
    await pool.end();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
