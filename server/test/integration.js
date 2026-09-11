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
    assert.equal(exported.inquiries.length, 1);
    assert.equal(exported.inquiryEvidence.length, 2);
    assert.equal(exported.inquirySyntheses.length, 0);
    const redactedExport = expectCode(await api('/api/export/v1/all?redacted=true', { token: tokenA }));
    assert.deepEqual(redactedExport.account, {});
    assert.ok(redactedExport.friends.every(item => Object.keys(item.contact).length === 0));

    console.log(JSON.stringify({
      ok: true,
      checks: ['auth', 'refresh', 'refresh-retry-header-precedence', 'refresh-multi-tab-grace', 'scoped-agent-token', 'private-media', 'private-voice', 'voice-only-diary', 'transcription-disabled-safe', 'diary-isolation', 'diary-calendar', 'diary-dates', 'search', 'inquiry-validation', 'inquiry-isolation', 'inquiry-diary-link', 'inquiry-evidence', 'inquiry-status', 'inquiry-cost-ledger', 'friend-header-compatibility', 'friend-rules', 'friend-isolation', 'friend-import-idempotency', 'legacy-score-preservation', 'friend-write-operations', 'life-os-versioning', 'ai-status-and-isolation', ...(process.env.TEST_SKIP_PAID_AI === '1' ? [] : ['ai-five-view-flow']), 'reminder-rules', 'relationship-review', 'todo', 'cards', 'public-card-detail', 'discovery', 'resonance-toggle', 'favorite-toggle', 'card-copy-idempotency', 'data-export', 'redacted-export']
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
