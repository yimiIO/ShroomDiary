'use strict';

function evidenceKey(id) {
  return `E-${String(id || '').replace(/-/gu, '').slice(0, 12)}`;
}

function cursorAfter(row, cursor) {
  if (!cursor?.updatedAt) return true;
  const rowTime = new Date(row.updated_at || row.updatedAt || 0).getTime();
  const cursorTime = new Date(cursor.updatedAt).getTime();
  if (rowTime !== cursorTime) return rowTime > cursorTime;
  return String(row.id) > String(cursor.id || '');
}

function chronological(rows) {
  return rows.slice().sort((left, right) => {
    const time = new Date(left.updated_at || left.updatedAt || 0).getTime()
      - new Date(right.updated_at || right.updatedAt || 0).getTime();
    return time || String(left.id).localeCompare(String(right.id));
  });
}

function analysisCursor(synthesis) {
  const state = synthesis && typeof synthesis === 'object' ? synthesis.analysisState : null;
  const updatedAt = String(state?.lastEvidenceUpdatedAt || '');
  const id = String(state?.lastEvidenceId || '');
  if (!updatedAt || Number.isNaN(new Date(updatedAt).getTime())) return null;
  return { updatedAt, id };
}

function buildHealthAnalysisState({
  mode, nextCursor, analyzedNewEvidenceCount, inputEvidenceCount,
  remainingNewEvidenceCount, now = new Date().toISOString()
}) {
  return {
    stateVersion: 'health-inquiry-state-v1',
    analysisMode: mode === 'FULL' ? 'FULL' : 'INCREMENTAL',
    lastAnalyzedAt: now,
    lastEvidenceUpdatedAt: nextCursor?.updatedAt || null,
    lastEvidenceId: nextCursor?.id || null,
    analyzedNewEvidenceCount: Math.max(0, Number(analyzedNewEvidenceCount || 0)),
    inputEvidenceCount: Math.max(0, Number(inputEvidenceCount || 0)),
    remainingNewEvidenceCount: Math.max(0, Number(remainingNewEvidenceCount || 0))
  };
}

function mergeEvidenceRefs(previousRefs = [], currentRefs = [], limit = 240) {
  const merged = new Map();
  for (const item of [...previousRefs, ...currentRefs]) {
    const evidenceId = String(item?.evidenceId || item?.evidence_id || '');
    if (!evidenceId) continue;
    merged.set(evidenceId, { ...item, evidenceId });
  }
  return [...merged.values()].slice(-limit);
}

function selectInquiryReviewEvidence({
  rows = [], mode = 'INCREMENTAL', cursor = null, previousRefs = [],
  incrementalLimit = 24, referenceLimit = 8, fullLimit = 200
} = {}) {
  const ordered = chronological(rows);
  const full = mode === 'FULL';
  const newRows = full ? ordered : ordered.filter(item => cursorAfter(item, cursor));
  const selectedNew = newRows.slice(0, full ? fullLimit : incrementalLimit);
  const selectedNewIds = new Set(selectedNew.map(item => String(item.id)));
  const byId = new Map(ordered.map(item => [String(item.id), item]));
  const priorRows = full ? [] : previousRefs
    .map(item => byId.get(String(item?.evidenceId || item?.evidence_id || '')))
    .filter(item => item && !selectedNewIds.has(String(item.id)));
  const references = chronological(priorRows).slice(-referenceLimit);
  const selected = chronological([...references, ...selectedNew]);
  const latestNew = selectedNew[selectedNew.length - 1];
  const nextCursor = latestNew ? {
    updatedAt: latestNew.updated_at || latestNew.updatedAt,
    id: latestNew.id
  } : cursor;
  return {
    mode: full ? 'FULL' : 'INCREMENTAL',
    selectedIds: selected.map(item => String(item.id)),
    newEvidenceIds: selectedNew.map(item => String(item.id)),
    referenceEvidenceIds: references.map(item => String(item.id)),
    nextCursor,
    remainingNewEvidenceCount: Math.max(0, newRows.length - selectedNew.length),
    totalEvidenceCount: ordered.length
  };
}

module.exports = {
  analysisCursor,
  buildHealthAnalysisState,
  evidenceKey,
  mergeEvidenceRefs,
  selectInquiryReviewEvidence
};
