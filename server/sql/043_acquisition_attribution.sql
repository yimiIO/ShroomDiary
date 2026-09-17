-- Minimal, privacy-preserving attribution for Shroom's first acquisition experiments.
BEGIN;

CREATE TABLE IF NOT EXISTS acquisition_campaigns (
    content_code varchar(80) PRIMARY KEY,
    name varchar(160) NOT NULL,
    source varchar(64) NOT NULL,
    campaign varchar(120) NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'DRAFT'
      CHECK (status IN ('DRAFT', 'READY', 'LIVE', 'PAUSED', 'ARCHIVED')),
    landing_path text NOT NULL,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acquisition_touchpoints (
    id uuid PRIMARY KEY,
    visitor_id uuid NOT NULL,
    content_code varchar(80) NOT NULL REFERENCES acquisition_campaigns(content_code) ON DELETE RESTRICT,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    visit_count integer NOT NULL DEFAULT 1 CHECK (visit_count > 0),
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    registered_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (visitor_id, content_code)
);
CREATE INDEX IF NOT EXISTS acquisition_touchpoints_content_idx
  ON acquisition_touchpoints(content_code, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS acquisition_touchpoints_user_idx
  ON acquisition_touchpoints(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS acquisition_touchpoints_primary_user_idx
  ON acquisition_touchpoints(user_id) WHERE user_id IS NOT NULL;

INSERT INTO acquisition_campaigns
  (content_code, name, source, campaign, status, landing_path)
VALUES
  ('xhs-past-self-001', '问问过去的自己 · 已撤回首发实验', 'xiaohongshu', 'past-self-launch',
   'PAUSED', '/pages/public/login?type=1&cid=xhs-past-self-001')
ON CONFLICT (content_code) DO UPDATE SET
  name = EXCLUDED.name,
  source = EXCLUDED.source,
  campaign = EXCLUDED.campaign,
  status = EXCLUDED.status,
  landing_path = EXCLUDED.landing_path,
  updated_at = now();

COMMIT;
