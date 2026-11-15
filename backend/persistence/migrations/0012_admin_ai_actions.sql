ALTER TABLE admin_ai_conversations
  ADD CONSTRAINT admin_ai_conversations_id_owner_unique UNIQUE (id, owner_staff_id);

CREATE TABLE IF NOT EXISTS admin_ai_actions (
  id text PRIMARY KEY,
  conversation_id text NOT NULL,
  turn_id text NOT NULL,
  owner_staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  tool_id varchar(64) NOT NULL CHECK (tool_id ~ '^[a-z][a-z0-9_]{2,63}$'),
  state text NOT NULL CHECK (state IN ('AWAITING_CONFIRMATION','EXECUTING','SUCCEEDED','FAILED','CANCELLED','EXPIRED')),
  target_type varchar(64) NOT NULL CHECK (target_type ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  target_id varchar(240) NOT NULL CHECK (char_length(btrim(target_id)) BETWEEN 1 AND 240),
  safe_input jsonb NOT NULL CHECK (jsonb_typeof(safe_input) = 'object' AND pg_column_size(safe_input) <= 16384),
  safe_preview jsonb NOT NULL CHECK (jsonb_typeof(safe_preview) = 'object' AND pg_column_size(safe_preview) <= 16384),
  baseline_fingerprint varchar(128) NOT NULL CHECK (char_length(btrim(baseline_fingerprint)) BETWEEN 8 AND 128),
  required_permission varchar(100) NOT NULL CHECK (required_permission ~ '^[a-z][a-z0-9_.]{2,99}$'),
  risk_level text NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  expires_at timestamptz NOT NULL,
  confirmed_by_staff_id text REFERENCES staff_accounts(id),
  confirmed_at timestamptz,
  executed_at timestamptz,
  safe_result jsonb CHECK (safe_result IS NULL OR (jsonb_typeof(safe_result) = 'object' AND pg_column_size(safe_result) <= 16384)),
  failure_code varchar(100) CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{2,99}$'),
  execution_request_id varchar(160),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT admin_ai_actions_conversation_owner_fk FOREIGN KEY (conversation_id, owner_staff_id)
    REFERENCES admin_ai_conversations(id, owner_staff_id) ON DELETE CASCADE,
  CONSTRAINT admin_ai_actions_confirmation_pair CHECK ((confirmed_by_staff_id IS NULL) = (confirmed_at IS NULL)),
  CONSTRAINT admin_ai_actions_confirmation_state CHECK (
    (state IN ('AWAITING_CONFIRMATION','CANCELLED','EXPIRED') AND confirmed_at IS NULL)
    OR (state IN ('EXECUTING','SUCCEEDED','FAILED') AND confirmed_at IS NOT NULL)
  ),
  CONSTRAINT admin_ai_actions_execution_state CHECK (
    (state IN ('SUCCEEDED','FAILED') AND executed_at IS NOT NULL)
    OR (state NOT IN ('SUCCEEDED','FAILED') AND executed_at IS NULL)
  ),
  CONSTRAINT admin_ai_actions_failure_state CHECK (
    (state = 'FAILED' AND failure_code IS NOT NULL)
    OR (state <> 'FAILED' AND failure_code IS NULL)
  ),
  CONSTRAINT admin_ai_actions_expiry_after_create CHECK (expires_at > created_at),
  UNIQUE (conversation_id, turn_id)
);

CREATE INDEX IF NOT EXISTS admin_ai_actions_conversation_created_idx
  ON admin_ai_actions(conversation_id, created_at, id);
CREATE INDEX IF NOT EXISTS admin_ai_actions_owner_state_idx
  ON admin_ai_actions(owner_staff_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS admin_ai_actions_expiry_idx
  ON admin_ai_actions(expires_at) WHERE state = 'AWAITING_CONFIRMATION';
