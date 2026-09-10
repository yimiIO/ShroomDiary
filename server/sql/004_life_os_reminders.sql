BEGIN;

CREATE TABLE IF NOT EXISTS life_os (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    content_md text NOT NULL DEFAULT '',
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT life_os_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS life_os_versions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    life_os_id uuid NOT NULL REFERENCES life_os(id) ON DELETE CASCADE,
    version integer NOT NULL,
    content_md text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, version)
);
CREATE INDEX IF NOT EXISTS life_os_versions_user_idx
    ON life_os_versions(user_id, version DESC);

CREATE TABLE IF NOT EXISTS reminder_rules (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type varchar(48) NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, type)
);
CREATE INDEX IF NOT EXISTS reminder_rules_user_idx ON reminder_rules(user_id, type);

CREATE TABLE IF NOT EXISTS reminders (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type varchar(48) NOT NULL,
    friend_id varchar(96),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    scheduled_at timestamptz NOT NULL,
    sent_at timestamptz,
    status varchar(16) NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id, friend_id) REFERENCES friends(user_id, id) ON DELETE CASCADE,
    CONSTRAINT reminders_status_check CHECK (status IN ('pending', 'sent', 'failed', 'read'))
);
CREATE INDEX IF NOT EXISTS reminders_user_schedule_idx
    ON reminders(user_id, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS monthly_relationship_reviews (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period char(7) NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, period)
);

COMMIT;
