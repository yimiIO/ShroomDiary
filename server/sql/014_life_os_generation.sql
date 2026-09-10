BEGIN;

ALTER TABLE life_os_versions
    ADD COLUMN IF NOT EXISTS origin varchar(24) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS generation_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE life_os_versions DROP CONSTRAINT IF EXISTS life_os_versions_origin_check;
ALTER TABLE life_os_versions ADD CONSTRAINT life_os_versions_origin_check
    CHECK (origin IN ('manual', 'ai_assisted', 'migration'));

COMMIT;
