'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analysisCursor,
  buildHealthAnalysisState,
  evidenceKey,
  mergeEvidenceRefs,
  selectInquiryReviewEvidence
} = require('../src/inquiry-review-context');

function row(number, day) {
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    updated_at: `2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`
  };
}

test('incremental health review sends new evidence plus a small prior reference set', () => {
  const rows = [row(1, 1), row(2, 2), row(3, 3), row(4, 4), row(5, 5)];
  const result = selectInquiryReviewEvidence({
    rows,
    mode: 'INCREMENTAL',
    cursor: { updatedAt: rows[2].updated_at, id: rows[2].id },
    previousRefs: [
      { evidenceId: rows[0].id }, { evidenceId: rows[1].id }, { evidenceId: rows[2].id }
    ],
    incrementalLimit: 10,
    referenceLimit: 2
  });

  assert.deepEqual(result.newEvidenceIds, [rows[3].id, rows[4].id]);
  assert.deepEqual(result.referenceEvidenceIds, [rows[1].id, rows[2].id]);
  assert.deepEqual(result.selectedIds, [rows[1].id, rows[2].id, rows[3].id, rows[4].id]);
  assert.equal(result.remainingNewEvidenceCount, 0);
  assert.deepEqual(result.nextCursor, { updatedAt: rows[4].updated_at, id: rows[4].id });
});

test('incremental review leaves a cursor and backlog instead of pretending all evidence was analyzed', () => {
  const rows = [row(1, 1), row(2, 2), row(3, 3), row(4, 4)];
  const result = selectInquiryReviewEvidence({ rows, mode: 'INCREMENTAL', incrementalLimit: 2 });
  assert.deepEqual(result.newEvidenceIds, [rows[0].id, rows[1].id]);
  assert.equal(result.remainingNewEvidenceCount, 2);
  assert.deepEqual(result.nextCursor, { updatedAt: rows[1].updated_at, id: rows[1].id });
});

test('full review is explicit, bounded, and uses stable evidence keys', () => {
  const rows = [row(1, 1), row(2, 2), row(3, 3)];
  const result = selectInquiryReviewEvidence({ rows, mode: 'FULL', fullLimit: 3 });
  assert.deepEqual(result.selectedIds, rows.map(item => item.id));
  assert.equal(result.remainingNewEvidenceCount, 0);
  assert.equal(evidenceKey(rows[0].id), 'E-000000000000');
});

test('health state owns the analysis cursor and keeps the remaining backlog visible', () => {
  const nextCursor = { updatedAt: '2026-09-05T00:00:00.000Z', id: row(5, 5).id };
  const state = buildHealthAnalysisState({
    mode: 'INCREMENTAL', nextCursor, analyzedNewEvidenceCount: 4,
    inputEvidenceCount: 7, remainingNewEvidenceCount: 3,
    now: '2026-09-13T10:00:00.000Z'
  });
  assert.deepEqual(analysisCursor({ analysisState: state }), nextCursor);
  assert.equal(state.remainingNewEvidenceCount, 3);
  assert.equal(state.lastAnalyzedAt, '2026-09-13T10:00:00.000Z');
});

test('evidence reference metadata is carried forward without duplicate ids', () => {
  assert.deepEqual(mergeEvidenceRefs(
    [{ key: 'E-old', evidenceId: row(1, 1).id }],
    [{ key: 'E-new', evidenceId: row(1, 1).id }, { key: 'E-two', evidenceId: row(2, 2).id }]
  ), [
    { key: 'E-new', evidenceId: row(1, 1).id },
    { key: 'E-two', evidenceId: row(2, 2).id }
  ]);
});
