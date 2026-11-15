ALTER TABLE contact_conversations ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE TABLE IF NOT EXISTS contact_enquiries (
  id text PRIMARY KEY, reference text NOT NULL UNIQUE, request_fingerprint text NOT NULL,
  status text NOT NULL, customer_id text REFERENCES customers(id), payload jsonb NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS contact_enquiry_fingerprint_idx ON contact_enquiries(request_fingerprint,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS contact_message_idempotency_idx ON contact_messages(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS operational_alert_active_fingerprint_idx ON operational_alerts(fingerprint) WHERE status <> 'RESOLVED';

ALTER TABLE admin_audit ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE admin_audit ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS admin_audit_idempotency_idx ON admin_audit(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE internal_notifications ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE internal_notifications ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS operational_state (
  namespace text NOT NULL, key text NOT NULL, version bigint NOT NULL DEFAULT 1,
  payload jsonb NOT NULL, updated_at timestamptz NOT NULL, PRIMARY KEY(namespace,key)
);
CREATE TABLE IF NOT EXISTS zeus_usage_events (
  id text PRIMARY KEY, identity_hash text NOT NULL, ip_hash text NOT NULL,
  outcome text NOT NULL, charged boolean NOT NULL, created_at timestamptz NOT NULL,
  completed_at timestamptz, payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS zeus_usage_identity_idx ON zeus_usage_events(identity_hash,created_at);
CREATE INDEX IF NOT EXISTS zeus_usage_created_idx ON zeus_usage_events(created_at);

CREATE TABLE IF NOT EXISTS operations_import_runs (
  fingerprint text PRIMARY KEY, source_summary jsonb NOT NULL, completed_at timestamptz NOT NULL
);
