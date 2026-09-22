BEGIN;

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS scheduled_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS scheduled_end_time time without time zone;

ALTER TABLE todo_recurrence_rules
  ADD COLUMN IF NOT EXISTS scheduled_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS scheduled_end_time time without time zone;

ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_schedule_time_order_check;
ALTER TABLE todos ADD CONSTRAINT todos_schedule_time_order_check CHECK (
  scheduled_end_time IS NULL OR (
    scheduled_start_time IS NOT NULL AND scheduled_end_time > scheduled_start_time
  )
);

ALTER TABLE todo_recurrence_rules DROP CONSTRAINT IF EXISTS todo_recurrence_schedule_time_order_check;
ALTER TABLE todo_recurrence_rules ADD CONSTRAINT todo_recurrence_schedule_time_order_check CHECK (
  scheduled_end_time IS NULL OR (
    scheduled_start_time IS NOT NULL AND scheduled_end_time > scheduled_start_time
  )
);

COMMIT;
