ALTER TABLE staff_accounts
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_two_factor_secret jsonb;

ALTER TABLE staff_accounts
  ADD CONSTRAINT staff_accounts_status_check CHECK (status IN ('INVITED','ACTIVE','DISABLED')) NOT VALID;

ALTER TABLE staff_pre_auth_challenges
  ADD CONSTRAINT staff_pre_auth_attempts_check CHECK (attempts >= 0 AND attempts <= 6) NOT VALID;

CREATE INDEX IF NOT EXISTS staff_sessions_active_idx ON staff_sessions(staff_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_auth_tokens_active_idx ON staff_auth_tokens(staff_id, kind, expires_at) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_pre_auth_active_idx ON staff_pre_auth_challenges(staff_id, expires_at) WHERE used_at IS NULL AND invalidated_at IS NULL;
