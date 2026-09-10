BEGIN;

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS storage_provider varchar(16) NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS source_byte_size integer,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_storage_provider_check'
  ) THEN
    ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_storage_provider_check
      CHECK (storage_provider IN ('local', 'cos'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS media_assets_storage_provider_idx
  ON media_assets(storage_provider, created_at DESC);

COMMIT;
