-- Todo batching: user-confirmed grouping of existing todos into bounded time blocks.
BEGIN;

CREATE TABLE IF NOT EXISTS bags (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(300) NOT NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 90),
  status varchar(20) NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'adopted', 'completed', 'scattered')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  adopted_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS bags_user_scheduled_idx ON bags(user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS bags_user_status_idx ON bags(user_id, status);

CREATE TABLE IF NOT EXISTS correction_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL
    CHECK (event_type IN ('drag_reclassify', 'scatter', 'reject_suggestion')),
  original_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS correction_events_user_idx
  ON correction_events(user_id, created_at DESC);

ALTER TABLE todos ADD COLUMN IF NOT EXISTS bag_id uuid REFERENCES bags(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS estimated_minutes integer
  CHECK (estimated_minutes IS NULL OR estimated_minutes > 0);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS grouping_reason varchar(500) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS todos_bag_id_idx ON todos(bag_id) WHERE bag_id IS NOT NULL;

COMMIT;
