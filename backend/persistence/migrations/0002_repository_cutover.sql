ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

ALTER TABLE customer_sessions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS customer_security_events (
  id text PRIMARY KEY,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_security_events_customer_idx
  ON customer_security_events(customer_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS customer_sessions_customer_active_idx
  ON customer_sessions(customer_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS customer_password_resets_customer_active_idx
  ON customer_password_resets(customer_id, expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;
