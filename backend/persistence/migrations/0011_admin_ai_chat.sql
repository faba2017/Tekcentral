CREATE TABLE IF NOT EXISTS admin_ai_conversations (
  id text PRIMARY KEY,
  owner_staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  title varchar(160) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_ai_conversations_owner_updated_idx
  ON admin_ai_conversations(owner_staff_id, status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS admin_ai_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES admin_ai_conversations(id) ON DELETE CASCADE,
  turn_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  role text NOT NULL CHECK (role IN ('USER', 'ASSISTANT')),
  content text,
  generation_status text NOT NULL CHECK (generation_status IN ('PENDING', 'COMPLETED', 'FAILED')),
  idempotency_key varchar(128),
  requested_model_role text CHECK (requested_model_role IS NULL OR requested_model_role IN ('PRIMARY', 'ROUTINE')),
  resolved_provider varchar(80),
  resolved_model varchar(160),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  reasoning_tokens integer CHECK (reasoning_tokens IS NULL OR reasoning_tokens >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  fallback_used boolean,
  internal_request_id varchar(160),
  provider_request_id varchar(160),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT admin_ai_message_content_state CHECK (
    (role = 'USER' AND generation_status = 'COMPLETED' AND content IS NOT NULL AND char_length(btrim(content)) > 0)
    OR
    (role = 'ASSISTANT' AND generation_status = 'COMPLETED' AND content IS NOT NULL AND char_length(btrim(content)) > 0)
    OR
    (role = 'ASSISTANT' AND generation_status IN ('PENDING', 'FAILED') AND content IS NULL)
  ),
  UNIQUE(conversation_id, sequence),
  UNIQUE(conversation_id, turn_id, role)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_ai_messages_idempotency_idx
  ON admin_ai_messages(conversation_id, idempotency_key)
  WHERE role = 'USER' AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_ai_messages_conversation_sequence_idx
  ON admin_ai_messages(conversation_id, sequence);

CREATE TABLE IF NOT EXISTS admin_ai_context_attachments (
  conversation_id text NOT NULL REFERENCES admin_ai_conversations(id) ON DELETE CASCADE,
  context_type text NOT NULL CHECK (context_type IN ('PRODUCT', 'SUPPLIER', 'PRICING_PROPOSAL')),
  resource_id text NOT NULL CHECK (char_length(btrim(resource_id)) BETWEEN 1 AND 240),
  attached_at timestamptz NOT NULL,
  PRIMARY KEY(conversation_id, context_type, resource_id)
);

CREATE INDEX IF NOT EXISTS admin_ai_context_attachments_conversation_idx
  ON admin_ai_context_attachments(conversation_id, attached_at, context_type, resource_id);
