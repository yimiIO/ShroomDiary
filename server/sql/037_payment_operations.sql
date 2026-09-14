BEGIN;

ALTER TABLE wallet_accounts
  ADD COLUMN IF NOT EXISTS lifetime_refunded_cents bigint NOT NULL DEFAULT 0
    CHECK (lifetime_refunded_cents >= 0);

ALTER TABLE billing_payment_orders
  ADD COLUMN IF NOT EXISTS icp_qualification varchar(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS app_filing_number varchar(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS refunded_point_cents integer NOT NULL DEFAULT 0
    CHECK (refunded_point_cents >= 0),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  ADD COLUMN IF NOT EXISTS last_provider_sync_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_payment_orders_refund_totals_check'
  ) THEN
    ALTER TABLE billing_payment_orders
      ADD CONSTRAINT billing_payment_orders_refund_totals_check
      CHECK (refundable_point_cents + refunded_point_cents <= point_cents);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_orders_provider_tx_idx
  ON billing_payment_orders(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL AND provider_transaction_id <> '';

ALTER TABLE billing_refund_requests
  ADD COLUMN IF NOT EXISTS decision_actor varchar(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE billing_refund_requests
  DROP CONSTRAINT IF EXISTS billing_refund_requests_status_check;
ALTER TABLE billing_refund_requests
  ADD CONSTRAINT billing_refund_requests_status_check
  CHECK (status IN ('REQUESTED', 'PROCESSING', 'PARTIAL', 'SUCCEEDED', 'REJECTED', 'FAILED'));

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

-- Registration consent and the later, explicit paid-service consent are
-- separate audit events even when they point at the same document version.
ALTER TABLE legal_acceptances
  DROP CONSTRAINT IF EXISTS legal_acceptances_user_id_document_key_document_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_user_document_source_idx
  ON legal_acceptances(user_id, document_key, document_version, acceptance_source);

COMMIT;
