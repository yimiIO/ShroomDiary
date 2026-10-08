'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { displayedObservations, observerSettingsChanged } = require('../../src/utils/observer-analysis');
const root = path.resolve(__dirname, '../..');
const seat = (id, extra = {}) => ({ id, name: id, shortName: id, description: '', renderType: 'custom', instructions: '从原文观察', enabled: true, ...extra });
const saved = observers => ({ taskId: 'task', status: 'done', observers, observations: observers.map(observer => ({ observer, result: { summary: `${observer.id} 的原结果` } })) });

test('current enabled seats replace the five saved tabs and expose an unanalyzed custom seat', () => {
 const defaults = Array.from({ length: 5 }, (_, i) => seat(`default-${i}`));
 const analysis = saved(defaults);
 const configured = defaults.map((item, i) => ({ ...item, enabled: i === 1 }));
 configured.push(seat('custom'));
 const rows = displayedObservations(configured, analysis, true);
 assert.deepEqual(rows.map(item => item.observer.id), ['default-1', 'custom']);
 assert.equal(rows[0].result.summary, 'default-1 的原结果');
 assert.equal(rows[1].pending, true);
 assert.equal(rows[1].observer.renderType, 'custom');
 assert.equal(observerSettingsChanged(configured, analysis), true);
 assert.deepEqual(displayedObservations(configured, analysis, true, true).map(item => item.observer.id), defaults.map(item => item.id));
 assert.equal(analysis.observations.length, 5);
});

test('a custom-only analysis shows its saved content using its actual render type', () => {
 const custom = seat('mine');
 const analysis = saved([custom]);
 const rows = displayedObservations([seat('default', { enabled: false }), custom], analysis, true);
 assert.equal(rows.length, 1);assert.equal(rows[0].pending, false);assert.equal(rows[0].observer.renderType, 'custom');
 assert.equal(observerSettingsChanged([custom], analysis), false);
});

test('renames, instructions, order, deletion and legacy edits mark settings as changed', () => {
 const a = seat('a'), b = seat('b');
 const analysis = saved([a, b]);
 for (const configured of [[{ ...a, name: '新名字' }, b], [{ ...a, instructions: '新的观察说明' }, b], [b, a], [a]]) assert.equal(observerSettingsChanged(configured, analysis), true);
 const legacy = saved([{ id: 'old', name: 'old', description: '', renderType: 'custom' }]);
 legacy.startedAt = '2026-10-05T00:00:00Z';
 assert.equal(observerSettingsChanged([seat('old', { updatedAt: '2026-10-06T00:00:00Z' })], legacy), true);
});

test('old results remain readable on failed settings refresh and failed regeneration', () => {
 const previous = seat('previous');
 const analysis = { ...saved([previous]), observers: [seat('new')], error: '重新分析失败' };
 assert.deepEqual(displayedObservations([], analysis, false).map(item => item.observer.id), ['previous']);
 assert.equal(displayedObservations([], analysis, false)[0].result.summary, 'previous 的原结果');
});

function loadPage(http) {
 const source = fs.readFileSync(path.join(root, 'src/pages/shroom/ai-analysis.vue'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\s*$/gm, '').replace('export default', 'module.exports =');
 const sandbox = { module: { exports: {} }, observerAnalysis: require('../../src/utils/observer-analysis'), AiResultContinue: {}, HealthConsentSheet: {}, aiObservers: 'observers', aiAnalyze: 'analyze', aiStatus: 'status', aiAnalysis: 'analysis', aiTask: 'tasks', uni: { navigateTo() {}, showToast() {} }, console, setTimeout, clearTimeout };
 vm.runInNewContext(source, sandbox);
 const page = sandbox.module.exports;
 const context = { ...page.data(), ...page.methods, $http: http };
 for (const [key, getter] of Object.entries(page.computed)) Object.defineProperty(context, key, { get: () => getter.call(context) });
 return { page, context };
}

test('returning from settings refreshes seats, selects a valid tab and never calls AI', async () => {
 const calls = [];
 const { page, context } = loadPage({ get: async url => { calls.push(url); return { data: [seat('new')] }; }, post: async () => { throw new Error('must not call AI'); } });
 context.diaryId = 'diary';context.analysisEnabled = true;context.observersLoaded = true;
 context.configuredObservers = [seat('old')];context.acceptAnalysis(saved([seat('old')]));
 context.openObservers();page.onShow.call(context);
 await new Promise(resolve => setImmediate(resolve));
 assert.deepEqual(calls, ['observers']);assert.equal(context.activeView, 'new');assert.equal(context.currentObservation.pending, true);assert.equal(context.observerSettingsChanged, true);
});

test('explicit regeneration refreshes settings and submits regenerate true', async () => {
 const calls = [];
 const { context } = loadPage({ get: async () => ({ data: [seat('custom')] }), post: async (url, body) => { calls.push({ url, body }); return { data: saved([seat('custom')]) }; } });
 context.diaryId = 'diary';context.analysisEnabled = true;
 await context.startAnalysis({ regenerate: true });
 assert.equal(calls.length, 1);assert.equal(calls[0].url, 'analyze');assert.equal(calls[0].body.regenerate, true);
 assert.equal(context.activeView, 'custom');assert.equal(context.viewType, 'custom');assert.equal(context.currentView.summary, 'custom 的原结果');
});

test('server snapshots only enabled seats and freezes their custom instructions', async () => {
 const presets = require('../src/observer-presets');
 const rows = [
  { id: 'off', preset_key: 'first_principles', name: '第一性原理', enabled: false, is_system: true },
  { id: 'on', preset_key: 'entropy', name: '熵', enabled: true, is_system: true },
  { id: 'custom', name: '未来的我', prompt: '从长期选择观察', enabled: true, updated_at: '2026-10-08T00:00:00Z' }
 ];
 const db = { query: async (sql, args) => { assert.equal(args.includes('user'), true); return { rows: sql.startsWith('SELECT') ? rows : [] }; } };
 const module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.join(root, 'server/src/observer-store.js'), 'utf8'), { module, require: id => id === './db' ? db : id === './observer-presets' ? presets : require(id) });
 const snapshot = await module.exports.activeObserverSnapshot('user');
 assert.deepEqual(Array.from(snapshot, item => item.id), ['on', 'custom']);
 assert.equal(snapshot[1].renderType, 'custom');assert.match(snapshot[1].prompt, /从长期选择观察/);
 assert.equal(snapshot[1].instructions, '从长期选择观察');assert.equal(snapshot[1].updatedAt, rows[2].updated_at);
 rows[2].prompt = '后来修改的说明';assert.equal(snapshot[1].instructions, '从长期选择观察');
});
