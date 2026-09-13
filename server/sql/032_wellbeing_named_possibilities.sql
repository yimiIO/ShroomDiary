ALTER TABLE wellbeing_hypotheses
  ADD COLUMN IF NOT EXISTS named_possibilities jsonb NOT NULL DEFAULT '[]'::jsonb;
