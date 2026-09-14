BEGIN;

CREATE TABLE IF NOT EXISTS reflection_message_external_sources (
    message_id uuid NOT NULL REFERENCES reflection_messages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES data_source_connections(id) ON DELETE CASCADE,
    external_task_id varchar(200) NOT NULL,
    source_fingerprint char(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, connection_id, external_task_id)
);
CREATE INDEX IF NOT EXISTS reflection_message_external_sources_connection_idx
  ON reflection_message_external_sources(user_id, connection_id, external_task_id);

CREATE OR REPLACE FUNCTION bump_external_activity_corpus_from_new()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('shroom.external_revision_bumped', true) = '1' THEN RETURN NULL; END IF;
  PERFORM set_config('shroom.external_revision_bumped', '1', true);
  UPDATE users u
     SET corpus_revision = corpus_revision + 1, updated_at = now()
   WHERE u.id IN (SELECT DISTINCT user_id FROM source_rows);
  UPDATE reflection_analysis_cache c
     SET valid = false
   WHERE c.valid AND c.user_id IN (SELECT DISTINCT user_id FROM source_rows);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION bump_external_activity_corpus_from_old()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('shroom.external_revision_bumped', true) = '1' THEN RETURN NULL; END IF;
  PERFORM set_config('shroom.external_revision_bumped', '1', true);
  UPDATE users u
     SET corpus_revision = corpus_revision + 1, updated_at = now()
   WHERE u.id IN (SELECT DISTINCT user_id FROM source_rows);
  UPDATE reflection_analysis_cache c
     SET valid = false
   WHERE c.valid AND c.user_id IN (SELECT DISTINCT user_id FROM source_rows);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS external_activity_corpus_insert ON external_activity_events;
CREATE TRIGGER external_activity_corpus_insert
AFTER INSERT ON external_activity_events
REFERENCING NEW TABLE AS source_rows
FOR EACH STATEMENT EXECUTE FUNCTION bump_external_activity_corpus_from_new();

DROP TRIGGER IF EXISTS external_activity_corpus_update ON external_activity_events;
CREATE TRIGGER external_activity_corpus_update
AFTER UPDATE ON external_activity_events
REFERENCING NEW TABLE AS source_rows
FOR EACH STATEMENT EXECUTE FUNCTION bump_external_activity_corpus_from_new();

DROP TRIGGER IF EXISTS external_activity_corpus_delete ON external_activity_events;
CREATE TRIGGER external_activity_corpus_delete
AFTER DELETE ON external_activity_events
REFERENCING OLD TABLE AS source_rows
FOR EACH STATEMENT EXECUTE FUNCTION bump_external_activity_corpus_from_old();

CREATE OR REPLACE FUNCTION handle_external_source_access_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_user_id uuid;
  target_connection_id uuid;
  access_removed boolean;
  access_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_user_id := OLD.user_id;
    target_connection_id := OLD.id;
    access_removed := true;
    access_changed := true;
  ELSE
    target_user_id := NEW.user_id;
    target_connection_id := NEW.id;
    access_removed := OLD.ai_allowed AND NOT NEW.ai_allowed;
    access_changed := OLD.ai_allowed IS DISTINCT FROM NEW.ai_allowed;
  END IF;

  IF access_changed THEN
    UPDATE users
       SET corpus_revision = corpus_revision + 1, updated_at = now()
     WHERE id = target_user_id;
    UPDATE reflection_analysis_cache
       SET valid = false
     WHERE user_id = target_user_id AND valid;
  END IF;

  IF access_removed THEN
    UPDATE reflection_messages m
       SET content = '这条回答引用的外部数据源已删除或不再允许 AI 读取，原回答已失效。',
           structured_result = '{}'::jsonb,
           citations = '[]'::jsonb,
           invalidated_at = now()
     WHERE m.user_id = target_user_id AND m.invalidated_at IS NULL
       AND EXISTS (
         SELECT 1 FROM reflection_message_external_sources s
          WHERE s.message_id = m.id
            AND s.user_id = target_user_id
            AND s.connection_id = target_connection_id
       );

    UPDATE reflection_conversations c
       SET invalidated_at = now(), updated_at = now()
     WHERE c.user_id = target_user_id
       AND EXISTS (
         SELECT 1 FROM reflection_messages m
         JOIN reflection_message_external_sources s ON s.message_id = m.id
          WHERE m.conversation_id = c.id
            AND s.user_id = target_user_id
            AND s.connection_id = target_connection_id
       );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS external_source_access_update ON data_source_connections;
CREATE TRIGGER external_source_access_update
AFTER UPDATE OF ai_allowed ON data_source_connections
FOR EACH ROW EXECUTE FUNCTION handle_external_source_access_change();

DROP TRIGGER IF EXISTS external_source_access_delete ON data_source_connections;
CREATE TRIGGER external_source_access_delete
BEFORE DELETE ON data_source_connections
FOR EACH ROW EXECUTE FUNCTION handle_external_source_access_change();

COMMIT;
