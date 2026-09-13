'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

test('wellbeing confirmation uses an explicit cross-platform POST status endpoint', () => {
  const api = source('src/api/wellbeing.js');
  const wellbeingPage = source('src/pages/shroom/wellbeing.vue');
  const analysisPage = source('src/pages/shroom/ai-analysis.vue');
  const routes = source('server/src/routes/wellbeing.js');

  assert.match(api, /wellbeingStatus\s*=\s*id\s*=>\s*`\/wellbeing\/v1\/\$\{id\}\/status`/u);
  assert.match(wellbeingPage, /\$http\.post\(wellbeingStatus\(item\.id\),\s*reason \? \{ action, reason \} : \{ action \}\)/u);
  assert.match(analysisPage, /\$http\.post\(wellbeingStatus\(this\.wellbeingRecord\.id\),\s*\{ action \}\)/u);
  assert.match(routes, /router\.post\('\/:id\/status'/u);
  assert.match(routes, /router\.patch\('\/:id'/u);
});
