'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..', '..');
const source = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('wellbeing keeps an always-visible medical boundary and labels generated possibilities', () => {
  const page = source('src/pages/shroom/wellbeing.vue');
  const route = source('server/src/routes/wellbeing.js');

  assert.match(page, /AI 辅助观察 · 仅供参考/);
  assert.match(page, /不要仅凭本页开始、停止或更改药物与治疗/);
  assert.match(page, /AI 基于日记生成，仅供参考/);
  assert.match(route, /medicalDisclaimer: WELLBEING_MEDICAL_DISCLAIMER/);
  assert.match(route, /不构成医学诊断、治疗建议或专业心理意见/);
});

test('AI wellbeing review requires a dedicated cross-platform acknowledgement sheet', () => {
  const page = source('src/pages/shroom/wellbeing.vue');
  const sheet = source('src/components/WellbeingSafetySheet.vue');
  const route = source('server/src/routes/wellbeing.js');

  assert.match(page, /<wellbeing-safety-sheet/);
  assert.match(page, /refreshHypotheses\(\)[\s\S]*?safetyConsentVisible = true/);
  assert.match(page, /confirmHypothesisRefresh\(\)[\s\S]*?healthConsent: true/);
  assert.doesNotMatch(page, /uni\.showModal\(/);
  for (const phrase of [
    '敏感个人信息', '可能不完整、不准确或误解原文', '不是诊断或治疗建议',
    '不要据此开始、停止或更改药物与治疗', '不要因此延误就医', '已了解，允许本次识别'
  ]) assert.match(sheet, new RegExp(phrase));
  assert.match(route, /req\.body\.healthConsent !== true/);
});
