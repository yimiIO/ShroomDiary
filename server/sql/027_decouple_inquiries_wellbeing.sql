BEGIN;

-- Keep track of inquiries whose prior synthesis may have read wellbeing state.
CREATE TEMP TABLE decoupled_inquiry_ids ON COMMIT DROP AS
SELECT DISTINCT inquiry_id
  FROM inquiry_evidence
 WHERE wellbeing_record_id IS NOT NULL OR source_type = 'WELLBEING';

-- If a direct diary link already exists, keep that canonical evidence row.
DELETE FROM inquiry_evidence legacy
USING wellbeing_records w, inquiry_evidence direct
 WHERE legacy.wellbeing_record_id = w.id
   AND w.diary_id IS NOT NULL
   AND direct.inquiry_id = legacy.inquiry_id
   AND direct.diary_id = w.diary_id
   AND direct.id <> legacy.id;

-- Preserve old linked records as direct diary evidence. The evidence no longer
-- depends on the wellbeing record's confirmation, AI permission, or contents.
UPDATE inquiry_evidence e
   SET diary_id = w.diary_id,
       source_type = 'DIARY',
       source_label = to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') || ' 的日记',
       excerpt = COALESCE(NULLIF(d.content, ''), NULLIF(e.excerpt, ''), w.source_excerpt, ''),
       updated_at = now()
  FROM wellbeing_records w
  JOIN diaries d ON d.id = w.diary_id AND d.user_id = w.user_id AND d.deleted_at IS NULL
 WHERE e.wellbeing_record_id = w.id
   AND e.user_id = w.user_id;

-- A manually-created wellbeing record has no diary to point to. Preserve its
-- text as an ordinary note inside this inquiry, then sever the cross-module id.
UPDATE inquiry_evidence e
   SET source_type = 'NOTE',
       source_label = COALESCE(NULLIF(e.source_label, ''), NULLIF(w.source_label, ''), '历史手动线索'),
       excerpt = COALESCE(NULLIF(e.excerpt, ''), NULLIF(w.source_excerpt, ''), ''),
       updated_at = now()
 FROM wellbeing_records w
 WHERE e.wellbeing_record_id = w.id
   AND e.user_id = w.user_id
   AND (w.diary_id IS NULL OR NOT EXISTS (
     SELECT 1 FROM diaries d
      WHERE d.id = w.diary_id AND d.user_id = w.user_id AND d.deleted_at IS NULL
   ));

-- Also handle old orphaned links whose wellbeing record was previously deleted.
UPDATE inquiry_evidence
   SET source_type = CASE WHEN diary_id IS NOT NULL THEN 'DIARY' ELSE 'NOTE' END,
       source_label = COALESCE(NULLIF(source_label, ''), '历史线索'),
       updated_at = now()
 WHERE source_type = 'WELLBEING';

UPDATE inquiry_syntheses
   SET invalidated_at = COALESCE(invalidated_at, now()),
       invalidated_reason = COALESCE(invalidated_reason, 'wellbeing_decoupled')
 WHERE inquiry_id IN (SELECT inquiry_id FROM decoupled_inquiry_ids);

UPDATE inquiries
   SET current_synthesis = '{}'::jsonb,
       last_reviewed_at = NULL,
       evidence_revision = evidence_revision + 1,
       updated_at = now()
 WHERE id IN (SELECT inquiry_id FROM decoupled_inquiry_ids);

DROP INDEX IF EXISTS inquiry_evidence_wellbeing_unique;

ALTER TABLE inquiry_evidence DROP CONSTRAINT IF EXISTS inquiry_evidence_source_type_check;
ALTER TABLE inquiry_evidence ADD CONSTRAINT inquiry_evidence_source_type_check
  CHECK (source_type IN ('DIARY', 'NOTE', 'LINK', 'ACTION', 'REFLECTION'));

ALTER TABLE inquiry_evidence DROP COLUMN IF EXISTS wellbeing_record_id;
ALTER TABLE inquiry_evidence DROP COLUMN IF EXISTS health_observation;
ALTER TABLE inquiry_candidates DROP COLUMN IF EXISTS health_observation;

-- Old AI output may still contain a suggested cross-module link. It is not part
-- of a wellbeing fact and must not leak back into clients after decoupling.
UPDATE wellbeing_records
   SET extraction = extraction - 'healthInquiryLinks' - 'health_inquiry_links',
       updated_at = now()
 WHERE extraction ? 'healthInquiryLinks' OR extraction ? 'health_inquiry_links';

COMMIT;
