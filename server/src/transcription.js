'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const config = require('./config');

const execFileAsync = promisify(execFile);

const JOURNAL_PROMPT = [
  '这是一篇中文个人日记。请忠实转写说话内容，补充自然标点，但不要总结、润色、回答或虚构。',
  '说话中可能出现中英文混合和这些专有名词：Shroom、菇卡、EvoX、进化哲学、ExtremeNomad、极限游民、SURFPLUS、冲浪家。'
].join('');

const JOURNAL_HOTWORDS = [
  'Shroom', '菇卡', 'EvoX', '进化哲学', 'ExtremeNomad', '极限游民', 'SURFPLUS', '冲浪家'
];

function serviceError(code, message) {
  return Object.assign(new Error(message), { code });
}

function cleanProviderDetail(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 240) || null;
}

function volcengineResponseError(response) {
  const providerStatus = cleanProviderDetail(response.headers.get('x-api-status-code'));
  const providerMessage = cleanProviderDetail(response.headers.get('x-api-message'));
  const providerLogId = cleanProviderDetail(response.headers.get('x-tt-logid'));
  const isAuthorizationFailure = response.status === 401 || ['45000010', '45000030'].includes(providerStatus);
  return Object.assign(
    serviceError(
      isAuthorizationFailure ? 'SHROOM_ASR_CONFIG' : 'SHROOM_ASR_FAILED',
      isAuthorizationFailure
        ? '高精度转写服务授权尚未完成，录音已安全保存，请稍后重试'
        : '高精度转写暂时不可用，录音已安全保存'
    ),
    { provider: 'volcengine', providerStatus, providerMessage, providerLogId }
  );
}

function isTranscriptionConfigured() {
  if (config.asrProvider === 'volcengine') {
    return Boolean(config.volcAsrApiKey || (config.volcAsrAppKey && config.volcAsrAccessKey));
  }
  return Boolean(config.asrApiBaseUrl && config.asrApiKey && config.asrModel);
}

async function requestWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.asrTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw serviceError('SHROOM_ASR_TIMEOUT', '转写时间较长，请稍后重试');
    }
    throw serviceError('SHROOM_ASR_FAILED', '暂时无法连接转写服务，录音已安全保存');
  } finally {
    clearTimeout(timeout);
  }
}

async function transcribeOpenAiCompatible({ filePath, mimeType, originalName }) {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  const fileName = path.basename(originalName || filePath || 'journal-audio.webm');
  form.append('file', new Blob([bytes], { type: mimeType || 'application/octet-stream' }), fileName);
  form.append('model', config.asrModel);
  form.append('response_format', 'json');
  if (config.asrLanguage) form.append('language', config.asrLanguage);
  form.append('prompt', JOURNAL_PROMPT);

  const response = await requestWithTimeout(`${config.asrApiBaseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.asrApiKey}` },
    body: form
  });
  if (!response.ok) {
    throw serviceError('SHROOM_ASR_FAILED', '高精度转写暂时不可用，录音已安全保存');
  }
  const result = await response.json();
  return {
    text: String(result.text || '').trim(),
    model: config.asrModel,
    language: config.asrLanguage || null
  };
}

async function prepareVolcAudio(filePath, mimeType) {
  const supported = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/opus']);
  if (supported.has(String(mimeType || '').toLowerCase())) {
    return { bytes: await fs.readFile(filePath), cleanupPath: null };
  }

  const outputPath = path.join(os.tmpdir(), `shroom-asr-${crypto.randomUUID()}.mp3`);
  try {
    await execFileAsync(config.ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', filePath,
      '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', outputPath
    ], { timeout: Math.min(config.asrTimeoutMs, 60000), maxBuffer: 1024 * 1024 });
    return { bytes: await fs.readFile(outputPath), cleanupPath: outputPath };
  } catch (error) {
    await fs.rm(outputPath, { force: true });
    throw serviceError('SHROOM_ASR_FORMAT', '录音格式转换失败，原始录音已安全保存');
  }
}

async function transcribeVolcengine({ filePath, mimeType }) {
  const prepared = await prepareVolcAudio(filePath, mimeType);
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Api-Resource-Id': config.volcAsrResourceId,
      'X-Api-Request-Id': crypto.randomUUID(),
      'X-Api-Sequence': '-1'
    };
    if (config.volcAsrApiKey) {
      headers['X-Api-Key'] = config.volcAsrApiKey;
    } else {
      headers['X-Api-App-Key'] = config.volcAsrAppKey;
      headers['X-Api-Access-Key'] = config.volcAsrAccessKey;
    }

    const context = JSON.stringify({ hotwords: JOURNAL_HOTWORDS.map(word => ({ word })) });
    const response = await requestWithTimeout(config.volcAsrEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user: { uid: config.volcAsrAppKey || 'shroom' },
        audio: { data: prepared.bytes.toString('base64') },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          enable_ddc: true,
          context
        }
      })
    });
    const apiStatus = response.headers.get('x-api-status-code');
    if (!response.ok || (apiStatus && apiStatus !== '20000000')) {
      throw volcengineResponseError(response);
    }
    const result = await response.json();
    return {
      text: String(result && result.result && result.result.text || '').trim(),
      model: config.volcAsrResourceId,
      language: config.asrLanguage || 'zh'
    };
  } finally {
    if (prepared.cleanupPath) await fs.rm(prepared.cleanupPath, { force: true });
  }
}

async function transcribeVoice({ filePath, mimeType, originalName }) {
  if (!isTranscriptionConfigured()) {
    throw serviceError('SHROOM_ASR_UNAVAILABLE', '高精度转写服务尚未配置，录音已安全保存');
  }

  const result = config.asrProvider === 'volcengine'
    ? await transcribeVolcengine({ filePath, mimeType })
    : await transcribeOpenAiCompatible({ filePath, mimeType, originalName });
  const transcript = result.text;
  if (!transcript) {
    throw serviceError('SHROOM_ASR_EMPTY', '没有识别到清晰语音，可以重新录制后再试');
  }
  return {
    text: transcript.slice(0, 5000),
    model: result.model,
    language: result.language
  };
}

module.exports = {
  JOURNAL_PROMPT,
  JOURNAL_HOTWORDS,
  isTranscriptionConfigured,
  transcribeVoice,
  volcengineResponseError
};
