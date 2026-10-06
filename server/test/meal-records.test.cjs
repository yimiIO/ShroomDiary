const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function mount(api = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/pages/snapshot/meal.vue'), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*;$/gm, '').replace('export default', 'module.exports =');
  const context = { module: { exports: {} }, wechatPrivacy: {},
    uni: { getSystemInfoSync: () => ({}), showToast() {}, previewImage() {}, hideTabBar() {} },
    setTimeout, clearTimeout, ...api };
  vm.runInNewContext(script, context);
  const component = context.module.exports;
  const page = component.data();
  page.$http = { get: async (url, query) => api.getTodaySnapshot ? api.getTodaySnapshot(query.date) : ({data:{meals:[]}}) };
  for (const [key, method] of Object.entries(component.methods)) page[key] = method.bind(page);
  return { page, component };
}

test('opening the meal entry fetches saved photos and does not show an empty editor', async () => {
  const { page, component } = mount({ getTodaySnapshot: async date => {
    assert.equal(date, '2026-10-04');
    return { data: { meals: [{ id: 'meal-1', name: '午饭', media: [{ id: 'photo-1', url: '/signed-photo' }] }] } };
  } });
  component.onLoad.call(page, { date: '2026-10-04' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.editing, false);
  assert.equal(page.records[0].media[0].id, 'photo-1');
});

test('a photo-only meal saves with its date and remains visible after opening again', async () => {
  let stored;
  const api = {
    addMeal: async (payload, date) => { stored = { ...payload, id: 'meal-2', media: [{ id: payload.media_ids[0], url: '/fresh-photo' }] }; assert.equal(date, '2026-10-03'); return { data: { meal: stored } }; },
    getTodaySnapshot: async () => ({ data: { meals: stored ? [stored] : [] } }),
  };
  const { page } = mount(api);
  page.date = '2026-10-03'; page.startMeal(); page.media = [{ id: 'photo-2', url: '/upload-photo' }];
  await page.save();
  assert.equal(page.editing, false);
  assert.equal(page.records[0].media[0].id, 'photo-2');
  const reopened = mount(api).page;
  reopened.date = '2026-10-03'; await reopened.loadRecords();
  assert.equal(reopened.records[0].id, 'meal-2');
  assert.equal(reopened.records[0].media[0].url, '/fresh-photo');
});

test('failed saves preserve the input and uploaded photo for retry', async () => {
  const { page } = mount({ addMeal: async () => { throw new Error('offline'); } });
  page.startMeal(); page.dishInput = '米饭'; page.media = [{ id: 'photo-3' }];
  await page.save();
  assert.equal(page.editing, true);
  assert.equal(page.media[0].id, 'photo-3');
  assert.equal(page.dishes[0], '米饭');
  assert.equal(page.saving, false);
});

test('rapid date switching cannot display a late response from the wrong day', async () => {
  let resolveOld;
  const { page } = mount({ getTodaySnapshot: date => date === '2026-10-03'
    ? new Promise(resolve => { resolveOld = resolve; })
    : Promise.resolve({ data: { meals: [{ id: 'current-day' }] } }) });
  page.date = '2026-10-03'; const old = page.loadRecords();
  page.date = '2026-10-04'; await page.loadRecords();
  resolveOld({ data: { meals: [{ id: 'old-day' }] } }); await old;
  assert.equal(page.records[0].id, 'current-day');
  assert.equal(page.loading, false);
});

test('editing is isolated from the saved record until the server confirms', async () => {
  let persisted;
  const { page } = mount({ updateMeal: async (id, payload) => { persisted={ ...payload,id,media:[] };return { data: { meal: persisted } }; }, getTodaySnapshot:async()=>({data:{meals:[persisted]}}) });
  const record = { id: 'meal-4', name: '面条', tags: ['在家'], media: [{ id: 'photo-4' }] };
  page.records = [record]; page.editRecord(record); page.tags.push('满足'); page.removePhoto(page.media[0]);
  assert.equal(record.tags.length, 1); assert.equal(record.media.length, 1);
  await page.save(); assert.equal(page.records.length, 1); assert.equal(page.records[0].media.length, 0);
});

test('interrupted photo uploads keep only failed photos for retry without duplicating successes', async () => {
  const notices=[];
  const {page}=mount({uploadImage:'/media/v1/image/upload',
    mealImageUpload:{prepareMealImage:async filePath=>({filePath,release(){}})},
    wechatPrivacy:{requireWechatPrivacyAuthorization:async()=>{},isWechatPrivacyDenied:()=>false},
    uni:{chooseImage:options=>options.success({tempFilePaths:['blob:ok','blob:retry']}),showToast:options=>notices.push(options.title)}});
  page.$http.upload=async(url,{filePath})=>{if(filePath==='blob:retry')throw {errMsg:'uploadFile:fail timeout'};return {data:{id:'saved-photo',url:'/saved'}}};
  await page.addPhoto();
  assert.equal(page.media.length,1);
  assert.deepEqual(Array.from(page.pendingPhotos),['blob:retry']);
  assert.match(page.uploadError,/超时|中断/);
  let retryCount=0;
  page.$http.upload=async(url,{filePath})=>{retryCount++;assert.equal(filePath,'blob:retry');return {data:{id:'retried-photo',url:'/retried'}}};
  await page.retryPhotos();
  assert.equal(retryCount,1);assert.equal(page.media.length,2);assert.equal(page.pendingPhotos.length,0);
});
