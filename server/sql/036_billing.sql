BEGIN;

CREATE TABLE IF NOT EXISTS wallet_accounts (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    paid_balance_cents integer NOT NULL DEFAULT 0 CHECK (paid_balance_cents >= 0),
    reward_balance_cents integer NOT NULL DEFAULT 0 CHECK (reward_balance_cents >= 0),
    lifetime_paid_cents bigint NOT NULL DEFAULT 0 CHECK (lifetime_paid_cents >= 0),
    lifetime_reward_cents bigint NOT NULL DEFAULT 0 CHECK (lifetime_reward_cents >= 0),
    lifetime_spent_cents bigint NOT NULL DEFAULT 0 CHECK (lifetime_spent_cents >= 0),
    lifetime_refunded_cents bigint NOT NULL DEFAULT 0 CHECK (lifetime_refunded_cents >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO wallet_accounts (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS wallet_ledger (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type varchar(40) NOT NULL,
    paid_delta_cents integer NOT NULL DEFAULT 0,
    reward_delta_cents integer NOT NULL DEFAULT 0,
    paid_balance_cents integer NOT NULL CHECK (paid_balance_cents >= 0),
    reward_balance_cents integer NOT NULL CHECK (reward_balance_cents >= 0),
    reference_type varchar(40) NOT NULL DEFAULT '',
    reference_id varchar(160) NOT NULL DEFAULT '',
    idempotency_key varchar(200) NOT NULL,
    description varchar(240) NOT NULL DEFAULT '',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx
  ON wallet_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_feature_entitlements (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_key varchar(40) NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE', 'REFUNDED', 'REVOKED')),
    price_point_cents integer NOT NULL CHECK (price_point_cents > 0),
    ledger_id uuid REFERENCES wallet_ledger(id) ON DELETE SET NULL,
    purchased_at timestamptz NOT NULL DEFAULT now(),
    refunded_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_feature_entitlements_active_idx
  ON billing_feature_entitlements(user_id, feature_key) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS billing_feature_entitlements_user_idx
  ON billing_feature_entitlements(user_id, purchased_at DESC);

CREATE TABLE IF NOT EXISTS billing_campaign_rewards (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_key varchar(64) NOT NULL,
    reward_point_cents integer NOT NULL CHECK (reward_point_cents > 0),
    ledger_id uuid NOT NULL REFERENCES wallet_ledger(id) ON DELETE RESTRICT,
    qualification jsonb NOT NULL DEFAULT '{}'::jsonb,
    awarded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, campaign_key)
);

CREATE TABLE IF NOT EXISTS billing_payment_orders (
    id uuid PRIMARY KEY,
    out_trade_no char(32) NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider varchar(24) NOT NULL DEFAULT 'WECHAT_PAY',
    merchant_label varchar(80) NOT NULL,
    merchant_legal_name varchar(160) NOT NULL,
    invoice_legal_name varchar(160) NOT NULL,
    merchant_tax_id varchar(40) NOT NULL,
    icp_qualification varchar(120) NOT NULL,
    app_filing_number varchar(120) NOT NULL,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    point_cents integer NOT NULL CHECK (point_cents > 0),
    refundable_point_cents integer NOT NULL DEFAULT 0 CHECK (refundable_point_cents >= 0),
    refunded_point_cents integer NOT NULL DEFAULT 0 CHECK (refunded_point_cents >= 0),
    status varchar(20) NOT NULL DEFAULT 'CREATED'
      CHECK (status IN ('CREATED', 'PREPAY', 'PAID', 'CLOSED', 'PARTIAL_REFUND', 'REFUNDED', 'FAILED')),
    client_platform varchar(24) NOT NULL DEFAULT 'H5',
    provider_transaction_id varchar(80),
    payer_openid_hash char(64),
    payment_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    agreement_version varchar(40) NOT NULL,
    idempotency_key varchar(160) NOT NULL,
    paid_at timestamptz,
    expires_at timestamptz NOT NULL,
    last_provider_sync_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (merchant_legal_name = invoice_legal_name),
    CHECK (refundable_point_cents + refunded_point_cents <= point_cents),
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS billing_payment_orders_user_created_idx
  ON billing_payment_orders(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_orders_provider_tx_idx
  ON billing_payment_orders(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL AND provider_transaction_id <> '';

CREATE TABLE IF NOT EXISTS billing_refund_requests (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_order_id uuid REFERENCES billing_payment_orders(id) ON DELETE SET NULL,
    requested_point_cents integer NOT NULL CHECK (requested_point_cents > 0),
    status varchar(24) NOT NULL DEFAULT 'REQUESTED'
      CHECK (status IN ('REQUESTED', 'PROCESSING', 'PARTIAL', 'SUCCEEDED', 'REJECTED', 'FAILED')),
    reason varchar(400) NOT NULL DEFAULT '',
    provider_refund_id varchar(80),
    response_note varchar(500) NOT NULL DEFAULT '',
    decision_actor varchar(120) NOT NULL DEFAULT '',
    decided_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_refund_requests_user_created_idx
  ON billing_refund_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_refund_items (
    id uuid PRIMARY KEY,
    refund_request_id uuid NOT NULL REFERENCES billing_refund_requests(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_order_id uuid NOT NULL REFERENCES billing_payment_orders(id) ON DELETE RESTRICT,
    out_refund_no varchar(64) NOT NULL UNIQUE,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    status varchar(24) NOT NULL DEFAULT 'CREATED'
      CHECK (status IN ('CREATED', 'PROCESSING', 'SUCCEEDED', 'CLOSED', 'ABNORMAL', 'FAILED')),
    provider_refund_id varchar(80),
    response_note varchar(500) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (refund_request_id, payment_order_id)
);
CREATE INDEX IF NOT EXISTS billing_refund_items_request_idx
  ON billing_refund_items(refund_request_id, created_at);
CREATE INDEX IF NOT EXISTS billing_refund_items_status_idx
  ON billing_refund_items(status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS billing_refund_items_provider_idx
  ON billing_refund_items(provider_refund_id)
  WHERE provider_refund_id IS NOT NULL AND provider_refund_id <> '';

CREATE TABLE IF NOT EXISTS legal_acceptances (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_key varchar(40) NOT NULL,
    document_version varchar(40) NOT NULL,
    acceptance_source varchar(32) NOT NULL DEFAULT 'ACCOUNT',
    accepted_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, document_key, document_version, acceptance_source)
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx
  ON legal_acceptances(user_id, accepted_at DESC);

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS charge_status varchar(24) NOT NULL DEFAULT 'NOT_BILLABLE',
  ADD COLUMN IF NOT EXISTS charged_point_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_multiplier numeric(8, 4),
  ADD COLUMN IF NOT EXISTS wallet_ledger_id uuid REFERENCES wallet_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_usage_events_charge_idx
  ON ai_usage_events(user_id, charge_status, created_at DESC);

COMMIT;
