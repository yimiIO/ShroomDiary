BEGIN;

-- 今日快照主表：一个用户一天一条
CREATE TABLE IF NOT EXISTS snapshots (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL,
    mood varchar(24) NOT NULL DEFAULT '',
    weather_code varchar(24) NOT NULL DEFAULT '',
    weather_temp int,
    steps int NOT NULL DEFAULT 0,
    bedtime varchar(8) NOT NULL DEFAULT '',
    wake_time varchar(8) NOT NULL DEFAULT '',
    scene varchar(48) NOT NULL DEFAULT '',
    expense_amount numeric(10,2) NOT NULL DEFAULT 0,
    expense_category varchar(24) NOT NULL DEFAULT '',
    income_amount numeric(10,2) NOT NULL DEFAULT 0,
    income_category varchar(24) NOT NULL DEFAULT '',
    morning_intent text NOT NULL DEFAULT '',
    evening_reflection text NOT NULL DEFAULT '',
    challenge_completed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS snapshots_user_day_unique
  ON snapshots(user_id, day);
CREATE INDEX IF NOT EXISTS snapshots_user_day_idx
  ON snapshots(user_id, day DESC);

-- 一餐一条
CREATE TABLE IF NOT EXISTS snapshot_meals (
    id uuid PRIMARY KEY,
    snapshot_id uuid NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    meal_type varchar(16) NOT NULL DEFAULT 'BRUNCH',
    name varchar(240) NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    meal_time time,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snapshot_meals_snapshot_idx
  ON snapshot_meals(snapshot_id, created_at);

-- 冥想记录
CREATE TABLE IF NOT EXISTS snapshot_meditations (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL,
    duration_min int NOT NULL DEFAULT 3,
    affirmation text NOT NULL DEFAULT '',
    completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snapshot_meditations_user_day_idx
  ON snapshot_meditations(user_id, day DESC, completed_at DESC);

COMMIT;
