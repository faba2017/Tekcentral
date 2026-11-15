CREATE TABLE admin_ai_automations (
  id text PRIMARY KEY,
  owner_staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
  created_by_staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  enabled boolean NOT NULL DEFAULT false,
  trigger_type text NOT NULL CHECK (trigger_type IN ('SCHEDULE','EVENT')),
  trigger_configuration jsonb NOT NULL CHECK (jsonb_typeof(trigger_configuration) = 'object' AND pg_column_size(trigger_configuration) <= 8192),
  tool_id varchar(64) NOT NULL CHECK (tool_id ~ '^[a-z][a-z0-9_]{2,63}$'),
  target_type varchar(64) NOT NULL CHECK (target_type ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  target_id varchar(240) NOT NULL CHECK (char_length(btrim(target_id)) BETWEEN 1 AND 240),
  context_definition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_definition) = 'object' AND pg_column_size(context_definition) <= 8192),
  requested_autonomy text NOT NULL CHECK (requested_autonomy IN ('OFF','OBSERVE','SUGGEST','PREPARE','AUTO')),
  timezone varchar(100) NOT NULL CHECK (char_length(btrim(timezone)) BETWEEN 1 AND 100),
  next_run_at timestamptz,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX admin_ai_automations_enabled_due_idx
  ON admin_ai_automations(next_run_at, id) WHERE enabled = true AND trigger_type = 'SCHEDULE';
CREATE INDEX admin_ai_automations_owner_idx
  ON admin_ai_automations(owner_staff_id, updated_at DESC, id);
CREATE INDEX admin_ai_automations_trigger_idx
  ON admin_ai_automations(trigger_type, enabled, id);
CREATE INDEX admin_ai_automations_tool_idx
  ON admin_ai_automations(tool_id, enabled, id);

CREATE TABLE admin_ai_automation_events (
  id text PRIMARY KEY,
  event_key varchar(240) NOT NULL UNIQUE CHECK (char_length(btrim(event_key)) BETWEEN 8 AND 240),
  event_type varchar(100) NOT NULL CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,99}$'),
  entity_type varchar(64) NOT NULL CHECK (entity_type ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  entity_id varchar(240) NOT NULL CHECK (char_length(btrim(entity_id)) BETWEEN 1 AND 240),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_metadata) = 'object' AND pg_column_size(safe_metadata) <= 8192),
  origin_automation_id text,
  origin_run_id text,
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL,
  CONSTRAINT admin_ai_automation_events_origin_pair CHECK (origin_run_id IS NULL OR origin_automation_id IS NOT NULL)
);

CREATE INDEX admin_ai_automation_events_type_occurred_idx
  ON admin_ai_automation_events(event_type, occurred_at, id);
CREATE INDEX admin_ai_automation_events_unprocessed_idx
  ON admin_ai_automation_events(occurred_at, id) WHERE processed_at IS NULL;
CREATE INDEX admin_ai_automation_events_origin_idx
  ON admin_ai_automation_events(origin_automation_id, origin_run_id) WHERE origin_automation_id IS NOT NULL;

CREATE TABLE admin_ai_automation_runs (
  id text PRIMARY KEY,
  automation_id text NOT NULL REFERENCES admin_ai_automations(id) ON DELETE RESTRICT,
  occurrence_key varchar(240) NOT NULL CHECK (char_length(btrim(occurrence_key)) BETWEEN 8 AND 240),
  trigger_type text NOT NULL CHECK (trigger_type IN ('SCHEDULE','EVENT')),
  occurred_at timestamptz NOT NULL,
  event_id text REFERENCES admin_ai_automation_events(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('PENDING','RUNNING','SUCCEEDED','FAILED','SKIPPED','ESCALATED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  retry_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  lease_owner varchar(160),
  lease_expires_at timestamptz,
  policy_decision jsonb CHECK (policy_decision IS NULL OR (jsonb_typeof(policy_decision) = 'object' AND pg_column_size(policy_decision) <= 8192)),
  provider_request_id varchar(160),
  prepared_action_id text,
  safe_result jsonb CHECK (safe_result IS NULL OR (jsonb_typeof(safe_result) = 'object' AND pg_column_size(safe_result) <= 16384)),
  provider_name varchar(80),
  model_name varchar(160),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  reasoning_tokens integer CHECK (reasoning_tokens IS NULL OR reasoning_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  failure_code varchar(100) CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{2,99}$'),
  escalation_state text NOT NULL DEFAULT 'NONE' CHECK (escalation_state IN ('NONE','REVIEW_REQUIRED','ATTENTION_REQUIRED')),
  initiator_staff_id text REFERENCES staff_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT admin_ai_automation_runs_occurrence_unique UNIQUE (automation_id, occurrence_key),
  CONSTRAINT admin_ai_automation_runs_event_shape CHECK (
    (trigger_type = 'EVENT' AND event_id IS NOT NULL)
    OR (trigger_type = 'SCHEDULE' AND event_id IS NULL)
  ),
  CONSTRAINT admin_ai_automation_runs_lease_shape CHECK (
    (state = 'RUNNING' AND started_at IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state <> 'RUNNING' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT admin_ai_automation_runs_finished_shape CHECK (
    (state IN ('SUCCEEDED','FAILED','SKIPPED','ESCALATED') AND finished_at IS NOT NULL)
    OR (state IN ('PENDING','RUNNING') AND finished_at IS NULL)
  ),
  CONSTRAINT admin_ai_automation_runs_failure_shape CHECK (
    (state = 'FAILED' AND failure_code IS NOT NULL)
    OR (state <> 'FAILED' AND failure_code IS NULL)
  )
);

CREATE INDEX admin_ai_automation_runs_state_retry_idx
  ON admin_ai_automation_runs(state, retry_at, id);
CREATE INDEX admin_ai_automation_runs_active_lease_idx
  ON admin_ai_automation_runs(lease_expires_at, id) WHERE state = 'RUNNING';
CREATE INDEX admin_ai_automation_runs_history_idx
  ON admin_ai_automation_runs(automation_id, occurred_at DESC, id DESC);
CREATE INDEX admin_ai_automation_runs_escalation_idx
  ON admin_ai_automation_runs(escalation_state, updated_at DESC, id) WHERE escalation_state <> 'NONE';

ALTER TABLE admin_ai_automation_events
  ADD CONSTRAINT admin_ai_automation_events_origin_automation_fk
    FOREIGN KEY (origin_automation_id) REFERENCES admin_ai_automations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT admin_ai_automation_events_origin_run_fk
    FOREIGN KEY (origin_run_id) REFERENCES admin_ai_automation_runs(id) ON DELETE RESTRICT;

ALTER TABLE admin_ai_actions
  ADD COLUMN origin_type text NOT NULL DEFAULT 'CHAT',
  ADD COLUMN automation_run_id text REFERENCES admin_ai_automation_runs(id) ON DELETE RESTRICT;

ALTER TABLE admin_ai_actions
  ALTER COLUMN conversation_id DROP NOT NULL,
  ALTER COLUMN turn_id DROP NOT NULL,
  DROP CONSTRAINT admin_ai_actions_conversation_id_turn_id_key,
  ADD CONSTRAINT admin_ai_actions_origin_type CHECK (origin_type IN ('CHAT','AUTOMATION')),
  ADD CONSTRAINT admin_ai_actions_exact_origin CHECK (
    (origin_type = 'CHAT' AND conversation_id IS NOT NULL AND turn_id IS NOT NULL AND automation_run_id IS NULL)
    OR
    (origin_type = 'AUTOMATION' AND conversation_id IS NULL AND turn_id IS NULL AND automation_run_id IS NOT NULL)
  );

CREATE UNIQUE INDEX admin_ai_actions_chat_turn_unique_idx
  ON admin_ai_actions(conversation_id, turn_id) WHERE origin_type = 'CHAT';
CREATE UNIQUE INDEX admin_ai_actions_automation_run_unique_idx
  ON admin_ai_actions(automation_run_id) WHERE origin_type = 'AUTOMATION';

ALTER TABLE admin_ai_automation_runs
  ADD CONSTRAINT admin_ai_automation_runs_prepared_action_fk
    FOREIGN KEY (prepared_action_id) REFERENCES admin_ai_actions(id) ON DELETE RESTRICT;

ALTER TABLE admin_ai_actions ALTER COLUMN origin_type DROP DEFAULT;
