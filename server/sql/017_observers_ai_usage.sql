BEGIN;

CREATE TABLE IF NOT EXISTS ai_observers (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preset_key varchar(48),
    name varchar(80) NOT NULL,
    description text NOT NULL DEFAULT '',
    prompt text NOT NULL DEFAULT '',
    render_type varchar(48) NOT NULL DEFAULT 'custom',
    is_system boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_observers_user_preset_unique
  ON ai_observers(user_id, preset_key) WHERE preset_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_observers_user_order_idx
  ON ai_observers(user_id, sort_order, created_at);

INSERT INTO ai_observers
  (id, user_id, preset_key, name, description, render_type, is_system, enabled, sort_order)
SELECT (md5(u.id::text || ':' || p.preset_key))::uuid, u.id, p.preset_key,
       p.name, p.description, p.render_type, true, true, p.sort_order
FROM users u
CROSS JOIN (VALUES
  ('first_principles', '第一性原理', '拆开假设，回到真正依赖的前提', 'first_principles', 10),
  ('entropy', '熵增 / 熵减', '观察秩序、能量与系统走向', 'entropy', 20),
  ('compound', '人生复利', '辨认正在积累与正在消耗的部分', 'compound', 30),
  ('life_os', '人生 OS 对照', '用自己确认的原则检查这次经历', 'life_os', 40),
  ('biological', '生物驱动', '识别奖励结构，而不是评价意志', 'biological', 50)
) AS p(preset_key, name, description, render_type, sort_order)
ON CONFLICT DO NOTHING;

ALTER TABLE diary_analysis
  ADD COLUMN IF NOT EXISTS observer_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cost_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS ai_usage_events (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature varchar(64) NOT NULL,
    diary_id uuid REFERENCES diaries(id) ON DELETE SET NULL,
    analysis_id uuid,
    conversation_id uuid REFERENCES reflection_conversations(id) ON DELETE CASCADE,
    task_id uuid,
    observer_id uuid REFERENCES ai_observers(id) ON DELETE SET NULL,
    request_label varchar(160) NOT NULL DEFAULT '',
    provider varchar(48) NOT NULL,
    model varchar(160) NOT NULL,
    provider_request_id varchar(160),
    prompt_tokens integer NOT NULL DEFAULT 0,
    cache_hit_tokens integer NOT NULL DEFAULT 0,
    cache_miss_tokens integer NOT NULL DEFAULT 0,
    completion_tokens integer NOT NULL DEFAULT 0,
    total_tokens integer NOT NULL DEFAULT 0,
    cost_usd numeric(20, 10),
    cost_cny numeric(20, 10),
    price_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx
  ON ai_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_analysis_idx
  ON ai_usage_events(user_id, analysis_id) WHERE analysis_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_events_conversation_idx
  ON ai_usage_events(user_id, conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_events_task_idx
  ON ai_usage_events(user_id, task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_events_diary_idx
  ON ai_usage_events(user_id, diary_id) WHERE diary_id IS NOT NULL;

COMMIT;
