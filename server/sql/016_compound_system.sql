BEGIN;

CREATE TABLE IF NOT EXISTS compound_settings (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    morning_prayer text NOT NULL DEFAULT '',
    financial_plan text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compound_checkins (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ritual_key varchar(24) NOT NULL,
    period_key varchar(10) NOT NULL,
    checkin_date date NOT NULL,
    mode varchar(32) NOT NULL DEFAULT '',
    duration_minutes smallint NOT NULL DEFAULT 0,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT compound_checkins_ritual_check CHECK (ritual_key IN ('body', 'prayer', 'financial')),
    CONSTRAINT compound_checkins_duration_check CHECK (duration_minutes BETWEEN 0 AND 1440),
    UNIQUE (user_id, ritual_key, period_key)
);
CREATE INDEX IF NOT EXISTS compound_checkins_user_date_idx
    ON compound_checkins(user_id, checkin_date DESC, ritual_key);

COMMIT;
