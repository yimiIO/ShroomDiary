BEGIN;

ALTER TABLE snapshots
  ADD COLUMN IF NOT EXISTS challenge_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS challenge_title varchar(500) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS challenge_todo_id uuid REFERENCES todos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daily_question varchar(500) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS daily_answer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS question_saved boolean NOT NULL DEFAULT false;

ALTER TABLE snapshot_meals
  ADD COLUMN IF NOT EXISTS dining_way varchar(32) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS snapshot_places (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label varchar(80) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, label)
);
CREATE INDEX IF NOT EXISTS snapshot_places_user_idx
  ON snapshot_places(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS snapshot_finance_entries (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL,
    entry_type varchar(12) NOT NULL,
    amount numeric(10,2) NOT NULL,
    category varchar(24) NOT NULL DEFAULT '',
    note varchar(240) NOT NULL DEFAULT '',
    occurred_at time,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT snapshot_finance_entry_type_check CHECK (entry_type IN ('EXPENSE', 'INCOME')),
    CONSTRAINT snapshot_finance_amount_check CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS snapshot_finance_user_day_idx
  ON snapshot_finance_entries(user_id, day DESC, created_at DESC);

INSERT INTO snapshot_finance_entries (id, user_id, day, entry_type, amount, category, note)
SELECT gen_random_uuid(), user_id, day, 'EXPENSE', expense_amount, expense_category, '旧版今日快照迁移'
  FROM snapshots
 WHERE expense_amount > 0
   AND NOT EXISTS (
     SELECT 1 FROM snapshot_finance_entries f
      WHERE f.user_id = snapshots.user_id AND f.day = snapshots.day AND f.entry_type = 'EXPENSE'
   );

INSERT INTO snapshot_finance_entries (id, user_id, day, entry_type, amount, category, note)
SELECT gen_random_uuid(), user_id, day, 'INCOME', income_amount, income_category, '旧版今日快照迁移'
  FROM snapshots
 WHERE income_amount > 0
   AND NOT EXISTS (
     SELECT 1 FROM snapshot_finance_entries f
      WHERE f.user_id = snapshots.user_id AND f.day = snapshots.day AND f.entry_type = 'INCOME'
   );

COMMIT;
