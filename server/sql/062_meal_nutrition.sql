BEGIN;

CREATE TABLE IF NOT EXISTS nutrition_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile jsonb NOT NULL,
  consent_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meal_nutrition (
  meal_id uuid PRIMARY KEY REFERENCES snapshot_meals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_hash text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  result jsonb,
  confirmed_fraction numeric,
  error text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  generation uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meal_nutrition_user_idx ON meal_nutrition(user_id);

CREATE TABLE IF NOT EXISTS nutrition_consents (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vision_consent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nutrition_day_checks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE OR REPLACE FUNCTION reset_nutrition_day_check() RETURNS trigger AS $$
BEGIN
  UPDATE nutrition_day_checks c SET complete=false, updated_at=now()
  FROM snapshots s WHERE s.id=CASE WHEN TG_OP='DELETE' THEN OLD.snapshot_id ELSE NEW.snapshot_id END
  AND c.user_id=s.user_id AND c.day=s.day;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meal_resets_day_check ON snapshot_meals;
CREATE TRIGGER meal_resets_day_check AFTER INSERT OR UPDATE OR DELETE ON snapshot_meals
  FOR EACH ROW EXECUTE FUNCTION reset_nutrition_day_check();

COMMIT;
