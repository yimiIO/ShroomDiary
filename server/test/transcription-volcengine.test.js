'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret-that-is-not-used-in-production';
process.env.ASR_PROVIDER = 'volcengine';
process.env.VOLC_ASR_APP_KEY = 'test-app-key';
process.env.VOLC_ASR_ACCESS_KEY = 'test-access-key';
process.env.VOLC_ASR_RESOURCE_ID = 'volc.bigasr.auc_turbo';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { transcribeVoice, volcengineResponseError } = require('../src/transcription');

test('Volcengine transcription sends only the selected audio and recognition options', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-volc-asr-'));
  const filePath = path.join(directory, 'journal.wav');
  const audio = Buffer.from('test-audio');
  fs.writeFileSync(filePath, audio);
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  global.fetch = async (url, options) => {
    assert.equal(url, 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-Api-App-Key'], 'test-app-key');
    assert.equal(options.headers['X-Api-Access-Key'], 'test-access-key');
    assert.equal(options.headers['X-Api-Resource-Id'], 'volc.bigasr.auc_turbo');
    assert.equal(options.headers['X-Api-Sequence'], '-1');
    assert.ok(options.headers['X-Api-Request-Id']);

    const body = JSON.parse(options.body);
    assert.equal(body.user.uid, 'test-app-key');
    assert.equal(body.audio.data, audio.toString('base64'));
    assert.equal(body.request.model_name, 'bigmodel');
    assert.equal(body.request.enable_itn, true);
    assert.equal(body.request.enable_punc, true);
    assert.equal(body.request.enable_ddc, true);
    assert.match(body.request.context, /Shroom/);
    return new Response(JSON.stringify({ result: { text: '今天我认真地写了一篇日记。' } }), {
      status: 200,
      headers: { 'X-Api-Status-Code': '20000000' }
    });
  };

  const result = await transcribeVoice({
    filePath,
    mimeType: 'audio/wav',
    originalName: 'journal.wav'
  });
  assert.deepEqual(result, {
    text: '今天我认真地写了一篇日记。',
    model: 'volc.bigasr.auc_turbo',
    language: 'zh'
  });
});

test('Volcengine grant failures become an actionable safe configuration error', () => {
  const response = new Response('{}', {
    status: 403,
    headers: {
      'X-Api-Status-Code': '45000030',
      'X-Api-Message': 'requested resource not granted',
      'X-Tt-Logid': 'safe-provider-log-id'
    }
  });
  const error = volcengineResponseError(response);
  assert.equal(error.code, 'SHROOM_ASR_CONFIG');
  assert.match(error.message, /授权尚未完成/);
  assert.equal(error.providerStatus, '45000030');
  assert.equal(error.providerLogId, 'safe-provider-log-id');
  assert.doesNotMatch(error.message, /grant|SaaS/);
});
