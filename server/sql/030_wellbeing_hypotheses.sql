BEGIN;

CREATE TABLE IF NOT EXISTS wellbeing_hypotheses (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hypothesis_key varchar(160) NOT NULL,
  domain varchar(24) NOT NULL CHECK (domain IN ('PSYCHOLOGICAL', 'PHYSICAL')),
  kind varchar(32) NOT NULL CHECK (kind IN ('PSYCHOLOGICAL_CONCEPT', 'SYMPTOM_PATTERN', 'CLINICAL_CONDITION', 'RISK_SIGNAL')),
  name varchar(120) NOT NULL,
  possibility_statement text NOT NULL DEFAULT '',
  why_possible text NOT NULL DEFAULT '',
  evidence_strength varchar(16) NOT NULL DEFAULT 'LIMITED'
    CHECK (evidence_strength IN ('LIMITED', 'MODERATE', 'STRONG')),
  threshold_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  supporting_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  challenging_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_information jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  care_guidance text NOT NULL DEFAULT '',
  red_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'OBSERVING', 'DISMISSED', 'ARCHIVED')),
  feedback_reason varchar(48),
  review_version varchar(120) NOT NULL DEFAULT '',
  model_version varchar(120) NOT NULL DEFAULT '',
  source_updated_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hypothesis_key)
);

CREATE INDEX IF NOT EXISTS wellbeing_hypotheses_user_status_idx
  ON wellbeing_hypotheses(user_id, status, updated_at DESC);

COMMIT;
