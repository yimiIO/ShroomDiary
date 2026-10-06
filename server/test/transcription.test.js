'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused:unused@127.0.0.1/unused';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || 'test-secret-that-is-not-used-in-production';
process.env.ASR_API_BASE_URL = 'https://asr.example.test/v1';
process.env.ASR_API_KEY = 'test-key';
process.env.ASR_MODEL = 'test-high-accuracy-model';
process.env.ASR_LANGUAGE = 'zh';
process.env.ASR_PROVIDER = 'compatible';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JOURNAL_PROMPT, formatJournalTranscript, transcribeVoice } = require('../src/transcription');

test('transcription uploads only the selected audio with journal-specific recognition hints', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shroom-asr-'));
  const filePath = path.join(directory, 'journal.wav');
  fs.writeFileSync(filePath, Buffer.from('test-audio'));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  global.fetch = async (url, options) => {
    assert.equal(url, 'https://asr.example.test/v1/audio/transcriptions');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.body.get('model'), 'test-high-accuracy-model');
    assert.equal(options.body.get('language'), 'zh');
    assert.equal(options.body.get('prompt'), JOURNAL_PROMPT);
    assert.equal(options.body.get('file').name, 'journal.wav');
    return new Response(JSON.stringify({ text: '今天我认真地写了一篇日记。' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const result = await transcribeVoice({
    filePath,
    mimeType: 'audio/wav',
    originalName: 'journal.wav'
  });
  assert.deepEqual(result, {
    text: '今天我认真地写了一篇日记。',
    model: 'test-high-accuracy-model',
    language: 'zh'
  });
});

test('journal transcript formatting keeps short speech intact and groups long speech without rewriting it', () => {
  const short = '今天有一点累，但总体还好。';
  assert.equal(formatJournalTranscript(short), short);

  const long = [
    '今天我处理了几个一直拖着的问题，也终于把最重要的事情写了下来。',
    '做完以后我没有想象中那么兴奋，反而有一点空。',
    '不过这可能不是坏事，因为我终于不用一直惦记着它。',
    '后来我出去走了走，发现自己更想要的是稳定地前进，而不是每天都证明自己。',
    '所以接下来我准备少安排一点，把真正重要的两件事做好。'
  ].join('');
  const formatted = formatJournalTranscript(long);
  assert.match(formatted, /\n\n/);
  assert.equal(formatted.replace(/\n/g, ''), long);
});
