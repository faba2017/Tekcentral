CREATE TABLE commerce_invoices (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  invoice_number varchar(32) NOT NULL,
  status text NOT NULL CHECK (status = 'ISSUED'),
  issued_at timestamptz NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(18,2) NOT NULL CHECK (subtotal >= 0),
  delivery_amount numeric(18,2) NOT NULL CHECK (delivery_amount >= 0),
  tax_amount numeric(18,2) NOT NULL CHECK (tax_amount >= 0),
  total numeric(18,2) NOT NULL CHECK (total >= 0),
  payment_reference varchar(160),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND pg_column_size(snapshot) <= 262144),
  snapshot_hash char(64) NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  snapshot_schema_version integer NOT NULL CHECK (snapshot_schema_version > 0),
  created_at timestamptz NOT NULL,
  CONSTRAINT commerce_invoices_order_unique UNIQUE (order_id),
  CONSTRAINT commerce_invoices_number_unique UNIQUE (invoice_number)
);

CREATE INDEX commerce_invoices_status_issued_idx
  ON commerce_invoices(status, issued_at DESC, id);

CREATE OR REPLACE FUNCTION reject_immutable_commerce_record()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;

CREATE TRIGGER commerce_invoices_immutable
  BEFORE UPDATE OR DELETE ON commerce_invoices
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_commerce_record();

CREATE TABLE commerce_invoice_documents (
  id text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES commerce_invoices(id) ON DELETE RESTRICT,
  media_object_id text NOT NULL REFERENCES media_objects(id) ON DELETE RESTRICT,
  renderer_version varchar(80) NOT NULL CHECK (char_length(btrim(renderer_version)) BETWEEN 1 AND 80),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  CONSTRAINT commerce_invoice_documents_invoice_unique UNIQUE (invoice_id),
  CONSTRAINT commerce_invoice_documents_media_unique UNIQUE (media_object_id)
);

CREATE OR REPLACE FUNCTION validate_private_invoice_media_object()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE media_scope text; media_hash text; media_type text;
BEGIN
  SELECT object_scope, content_hash, content_type
    INTO media_scope, media_hash, media_type
    FROM media_objects WHERE id = NEW.media_object_id;
  IF media_scope IS DISTINCT FROM 'PRIVATE_INVOICE' THEN
    RAISE EXCEPTION 'Invoice documents require PRIVATE_INVOICE media.' USING ERRCODE = '23514';
  END IF;
  IF media_type IS DISTINCT FROM 'application/pdf' THEN
    RAISE EXCEPTION 'Invoice documents require application/pdf media.' USING ERRCODE = '23514';
  END IF;
  IF media_hash IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'Invoice document hash does not match media metadata.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER commerce_invoice_documents_private_media
  BEFORE INSERT ON commerce_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION validate_private_invoice_media_object();

CREATE TRIGGER commerce_invoice_documents_immutable
  BEFORE UPDATE OR DELETE ON commerce_invoice_documents
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_commerce_record();

CREATE TABLE commerce_customer_deliveries (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  invoice_id text REFERENCES commerce_invoices(id) ON DELETE RESTRICT,
  delivery_type text NOT NULL CHECK (delivery_type IN ('ORDER_CONFIRMATION','INVOICE_DELIVERY')),
  recipient varchar(320) NOT NULL CHECK (char_length(btrim(recipient)) BETWEEN 3 AND 320),
  status text NOT NULL CHECK (status IN ('PENDING','SENDING','SENT','FAILED')),
  idempotency_key varchar(240) NOT NULL UNIQUE CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 240),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  safe_failure_code varchar(100) CHECK (safe_failure_code IS NULL OR safe_failure_code ~ '^[A-Z][A-Z0-9_]{2,99}$'),
  provider_reference varchar(160),
  origin_type text NOT NULL CHECK (origin_type IN ('SYSTEM','STAFF_USER')),
  actor_id text,
  actor_label varchar(160),
  actor_role varchar(80),
  lease_owner varchar(160),
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT commerce_customer_deliveries_document_shape CHECK (
    (delivery_type = 'ORDER_CONFIRMATION' AND invoice_id IS NULL)
    OR (delivery_type = 'INVOICE_DELIVERY' AND invoice_id IS NOT NULL)
  ),
  CONSTRAINT commerce_customer_deliveries_actor_shape CHECK (
    (origin_type = 'SYSTEM' AND actor_id IS NULL)
    OR (origin_type = 'STAFF_USER' AND actor_id IS NOT NULL AND actor_label IS NOT NULL)
  ),
  CONSTRAINT commerce_customer_deliveries_lease_shape CHECK (
    (status = 'SENDING' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'SENDING' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT commerce_customer_deliveries_sent_shape CHECK (
    (status = 'SENT' AND sent_at IS NOT NULL AND safe_failure_code IS NULL AND next_attempt_at IS NULL)
    OR (status <> 'SENT' AND sent_at IS NULL)
  ),
  CONSTRAINT commerce_customer_deliveries_failure_shape CHECK (
    (status = 'FAILED' AND safe_failure_code IS NOT NULL)
    OR (status <> 'FAILED' AND safe_failure_code IS NULL)
  )
);

CREATE INDEX commerce_customer_deliveries_order_idx
  ON commerce_customer_deliveries(order_id, created_at DESC, id);
CREATE INDEX commerce_customer_deliveries_invoice_idx
  ON commerce_customer_deliveries(invoice_id, created_at DESC, id)
  WHERE invoice_id IS NOT NULL;
CREATE INDEX commerce_customer_deliveries_due_idx
  ON commerce_customer_deliveries(status, next_attempt_at, lease_expires_at, id)
  WHERE status IN ('PENDING','FAILED','SENDING');

CREATE OR REPLACE FUNCTION validate_customer_delivery_invoice_order()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE related_order_id text;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT order_id INTO related_order_id FROM commerce_invoices WHERE id = NEW.invoice_id;
    IF related_order_id IS DISTINCT FROM NEW.order_id THEN
      RAISE EXCEPTION 'Invoice delivery order does not match invoice order.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER commerce_customer_deliveries_invoice_order
  BEFORE INSERT OR UPDATE OF order_id, invoice_id ON commerce_customer_deliveries
  FOR EACH ROW EXECUTE FUNCTION validate_customer_delivery_invoice_order();

CREATE TABLE commerce_customer_delivery_attempts (
  id text PRIMARY KEY,
  delivery_id text NOT NULL REFERENCES commerce_customer_deliveries(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL CHECK (completed_at >= started_at),
  outcome text NOT NULL CHECK (outcome IN ('SENT','FAILED')),
  provider_reference varchar(160),
  safe_failure_code varchar(100) CHECK (safe_failure_code IS NULL OR safe_failure_code ~ '^[A-Z][A-Z0-9_]{2,99}$'),
  created_at timestamptz NOT NULL,
  CONSTRAINT commerce_customer_delivery_attempts_number_unique UNIQUE (delivery_id, attempt_number),
  CONSTRAINT commerce_customer_delivery_attempts_outcome_shape CHECK (
    (outcome = 'SENT' AND safe_failure_code IS NULL)
    OR (outcome = 'FAILED' AND safe_failure_code IS NOT NULL)
  )
);

CREATE INDEX commerce_customer_delivery_attempts_history_idx
  ON commerce_customer_delivery_attempts(delivery_id, started_at DESC, attempt_number DESC);

CREATE TRIGGER commerce_customer_delivery_attempts_immutable
  BEFORE UPDATE OR DELETE ON commerce_customer_delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_commerce_record();
