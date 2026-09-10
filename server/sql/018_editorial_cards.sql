BEGIN;

ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS collection_slug varchar(120),
    ADD COLUMN IF NOT EXISTS editorial_source jsonb;

ALTER TABLE cards
    DROP CONSTRAINT IF EXISTS cards_editorial_source_object_check;

ALTER TABLE cards
    ADD CONSTRAINT cards_editorial_source_object_check
    CHECK (editorial_source IS NULL OR jsonb_typeof(editorial_source) = 'object');

CREATE INDEX IF NOT EXISTS cards_public_collection_idx
    ON cards(collection_slug, created_at DESC)
    WHERE visibility <> 'PRIVATE' AND collection_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS cards_editorial_person_idx
    ON cards((editorial_source ->> 'personSlug'), created_at DESC)
    WHERE editorial_source IS NOT NULL;

COMMENT ON COLUMN cards.collection_slug IS
		'Optional public collection membership. NULL when a card is not grouped into a collection.';
COMMENT ON COLUMN cards.editorial_source IS
    'Public provenance for a curated card. Never used for private diary provenance.';

COMMIT;
