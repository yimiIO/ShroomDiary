BEGIN;

CREATE TABLE IF NOT EXISTS wellbeing_records (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL,
    source_type varchar(24) NOT NULL DEFAULT 'DIARY_ANALYSIS'
      CHECK (source_type IN ('DIARY_ANALYSIS', 'MANUAL', 'MIGRATED')),
    status varchar(16) NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING', 'CONFIRMED', 'DISMISSED', 'ARCHIVED')),
    recorded_on date NOT NULL,
    source_label varchar(240) NOT NULL DEFAULT '',
    source_excerpt text NOT NULL DEFAULT '',
    observation jsonb NOT NULL DEFAULT '{}'::jsonb,
    ai_allowed boolean NOT NULL DEFAULT false,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wellbeing_records_user_diary_unique
  ON wellbeing_records(user_id, diary_id) WHERE diary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wellbeing_records_user_status_date_idx
  ON wellbeing_records(user_id, status, recorded_on DESC, created_at DESC);

ALTER TABLE inquiry_evidence
  ADD COLUMN IF NOT EXISTS wellbeing_record_id uuid REFERENCES wellbeing_records(id) ON DELETE SET NULL;

ALTER TABLE inquiry_evidence DROP CONSTRAINT IF EXISTS inquiry_evidence_source_type_check;
ALTER TABLE inquiry_evidence ADD CONSTRAINT inquiry_evidence_source_type_check
  CHECK (source_type IN ('DIARY', 'NOTE', 'LINK', 'ACTION', 'REFLECTION', 'WELLBEING'));

CREATE UNIQUE INDEX IF NOT EXISTS inquiry_evidence_wellbeing_unique
  ON inquiry_evidence(inquiry_id, wellbeing_record_id) WHERE wellbeing_record_id IS NOT NULL;

-- 已经由用户确认并进入问题证据的健康观察，迁移为独立且已确认的身心记录。
INSERT INTO wellbeing_records
  (id, user_id, diary_id, source_type, status, recorded_on, source_label,
   source_excerpt, observation, ai_allowed, confirmed_at, created_at, updated_at)
SELECT DISTINCT ON (e.user_id, e.diary_id)
       e.id, e.user_id, e.diary_id, 'MIGRATED', 'CONFIRMED',
       (d.occurred_at AT TIME ZONE 'Asia/Shanghai')::date,
       e.source_label,
       COALESCE(NULLIF(d.content, ''), e.excerpt),
       e.health_observation,
       d.ai_allowed,
       e.created_at,
       e.created_at,
       e.updated_at
  FROM inquiry_evidence e
  JOIN diaries d ON d.id = e.diary_id AND d.user_id = e.user_id
 WHERE e.diary_id IS NOT NULL
   AND e.health_observation IS NOT NULL
   AND e.health_observation <> '{}'::jsonb
 ORDER BY e.user_id, e.diary_id, e.updated_at DESC
ON CONFLICT (user_id, diary_id) WHERE diary_id IS NOT NULL DO UPDATE SET
  observation = wellbeing_records.observation || EXCLUDED.observation,
  status = 'CONFIRMED',
  ai_allowed = wellbeing_records.ai_allowed OR EXCLUDED.ai_allowed,
  confirmed_at = COALESCE(wellbeing_records.confirmed_at, EXCLUDED.confirmed_at),
  updated_at = GREATEST(wellbeing_records.updated_at, EXCLUDED.updated_at);

-- 尚未成为问题的历史健康候选，也先进入独立事实层等待用户确认。
INSERT INTO wellbeing_records
  (id, user_id, diary_id, source_type, status, recorded_on, source_label,
   source_excerpt, observation, ai_allowed, confirmed_at, created_at, updated_at)
SELECT (substr(md5(c.id::text || ':' || d.id::text), 1, 8) || '-' ||
        substr(md5(c.id::text || ':' || d.id::text), 9, 4) || '-' ||
        substr(md5(c.id::text || ':' || d.id::text), 13, 4) || '-' ||
        substr(md5(c.id::text || ':' || d.id::text), 17, 4) || '-' ||
        substr(md5(c.id::text || ':' || d.id::text), 21, 12))::uuid,
       c.user_id,
       d.id,
       'MIGRATED',
       CASE WHEN c.status = 'ACCEPTED' THEN 'CONFIRMED' ELSE 'PENDING' END,
       (d.occurred_at AT TIME ZONE 'Asia/Shanghai')::date,
       to_char(d.occurred_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') || ' 的日记',
       d.content,
       c.health_observation,
       CASE WHEN c.status = 'ACCEPTED' THEN d.ai_allowed ELSE false END,
       CASE WHEN c.status = 'ACCEPTED' THEN c.updated_at ELSE NULL END,
       c.created_at,
       c.updated_at
  FROM inquiry_candidates c
  JOIN inquiry_candidate_diaries cd ON cd.candidate_id = c.id AND cd.user_id = c.user_id
  JOIN diaries d ON d.id = cd.diary_id AND d.user_id = c.user_id AND d.deleted_at IS NULL
 WHERE c.status IN ('PENDING', 'ACCEPTED')
   AND c.health_observation IS NOT NULL
   AND c.health_observation <> '{}'::jsonb
ON CONFLICT (user_id, diary_id) WHERE diary_id IS NOT NULL DO UPDATE SET
  observation = wellbeing_records.observation || EXCLUDED.observation,
  status = CASE
    WHEN wellbeing_records.status = 'CONFIRMED' OR EXCLUDED.status = 'CONFIRMED' THEN 'CONFIRMED'
    ELSE wellbeing_records.status
  END,
  ai_allowed = wellbeing_records.ai_allowed OR EXCLUDED.ai_allowed,
  confirmed_at = COALESCE(wellbeing_records.confirmed_at, EXCLUDED.confirmed_at),
  updated_at = GREATEST(wellbeing_records.updated_at, EXCLUDED.updated_at);

-- 旧问题证据改为引用事实记录。之后问题的生命周期不会影响原始身心记录。
UPDATE inquiry_evidence e
   SET wellbeing_record_id = w.id,
       source_type = 'WELLBEING',
       diary_id = NULL,
       health_observation = '{}'::jsonb,
       updated_at = now()
  FROM wellbeing_records w
 WHERE e.user_id = w.user_id
   AND e.diary_id = w.diary_id
   AND e.health_observation IS NOT NULL
   AND e.health_observation <> '{}'::jsonb;

COMMIT;
