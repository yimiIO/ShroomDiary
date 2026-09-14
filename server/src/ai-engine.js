'use strict';

const config = require('./config');
const { parseJsonContent } = require('./ai-json');
const { safeRecordAiUsage } = require('./ai-usage');

function isAiConfigured() {
  return Boolean(config.aiApiBaseUrl && config.aiApiKey && config.aiModel);
}

function contentFromResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => item.text || item.content || '').join('');
  return '';
}

function endpoint() {
  const base = config.aiApiBaseUrl.replace(/\/$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

async function callJson(system, input, label, options = {}) {
  if (!isAiConfigured()) throw Object.assign(new Error('AI 分析尚未配置'), { code: 'SHROOM_AI_UNAVAILABLE' });
  const model = String(options.model || config.aiModel || '').trim();
  if (!model) throw Object.assign(new Error('AI 分析模型尚未配置'), { code: 'SHROOM_AI_UNAVAILABLE' });
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    try {
      const response = await fetch(endpoint(), {
        method: 'POST',
        headers: { authorization: `Bearer ${config.aiApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: Number.isFinite(options.temperature) ? options.temperature : 0.35,
          max_tokens: Math.max(500, Math.min(8000, Number(options.maxTokens || 3000))),
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) }
          ]
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.error?.message || `${label} 请求失败 (${response.status})`;
        const error = Object.assign(new Error(message), { status: response.status });
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
      } else {
        await safeRecordAiUsage({ ...(options.usageContext || {}), label }, payload);
        return parseJsonContent(contentFromResponse(payload));
      }
    } catch (error) {
      if (error.code === 'SHROOM_AI_UNAVAILABLE') throw error;
      lastError = error;
      if (error.status && error.status < 500 && error.status !== 429) break;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw Object.assign(new Error(`${label} 暂时没有完成，请稍后重试`), { code: 'SHROOM_AI_FAILED', cause: lastError });
}

module.exports = { callJson, isAiConfigured, parseJsonContent };
