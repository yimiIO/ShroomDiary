'use strict';

function uniqueIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))];
}

async function resetInquirySyntheses(client, userId, inquiryIds) {
  const ids = uniqueIds(inquiryIds);
  if (!ids.length) return;
  await client.query(
    `UPDATE inquiry_syntheses SET invalidated_at = now(), invalidated_reason = 'source_changed'
      WHERE user_id = $1 AND inquiry_id = ANY($2::uuid[]) AND invalidated_at IS NULL`,
    [userId, ids]
  );
  await client.query(
    `UPDATE inquiries SET current_synthesis = '{}'::jsonb, last_reviewed_at = NULL,
       evidence_revision = evidence_revision + 1, updated_at = now()
     WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, ids]
  );
}

async function invalidateDiaryInquiryEvidence(client, userId, diaryId, options = {}) {
  const linked = await client.query(
    'SELECT DISTINCT inquiry_id FROM inquiry_evidence WHERE user_id = $1 AND diary_id = $2',
    [userId, diaryId]
  );
  const ids = linked.rows.map(row => row.inquiry_id);
  if (!ids.length) return;
  await resetInquirySyntheses(client, userId, ids);
  if (options.remove) {
    await client.query(
      'DELETE FROM inquiry_evidence WHERE user_id = $1 AND diary_id = $2',
      [userId, diaryId]
    );
    return;
  }
  if (options.content !== undefined) {
    await client.query(
      'UPDATE inquiry_evidence SET excerpt = $3, updated_at = now() WHERE user_id = $1 AND diary_id = $2',
      [userId, diaryId, options.content]
    );
  }
}

module.exports = { invalidateDiaryInquiryEvidence, resetInquirySyntheses };
