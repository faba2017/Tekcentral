-- TekCentral production persistence foundation. Expand-only initial migration.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_sequences (
  name text NOT NULL,
  year integer NOT NULL,
  next_value bigint NOT NULL CHECK (next_value > 0),
  PRIMARY KEY (name, year)
);

CREATE OR REPLACE FUNCTION allocate_business_sequence(sequence_name text, sequence_year integer)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE allocated bigint;
BEGIN
  INSERT INTO app_sequences(name, year, next_value) VALUES (sequence_name, sequence_year, 2)
  ON CONFLICT (name, year) DO UPDATE SET next_value = app_sequences.next_value + 1
  RETURNING next_value - 1 INTO allocated;
  RETURN allocated;
END $$;

CREATE TABLE IF NOT EXISTS customers (id text PRIMARY KEY, email text NOT NULL, normalized_email text NOT NULL UNIQUE, display_name text NOT NULL, password_hash text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS customer_addresses (id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE, label text NOT NULL, recipient jsonb NOT NULL, address jsonb NOT NULL, is_default boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS customer_sessions (id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS customer_password_resets (id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, revoked_at timestamptz);

CREATE TABLE IF NOT EXISTS staff_accounts (id text PRIMARY KEY, email text NOT NULL, normalized_email text NOT NULL UNIQUE, display_name text NOT NULL, status text NOT NULL, password_hash text, base_role text NOT NULL, must_change_password boolean NOT NULL DEFAULT false, granted_permissions text[] NOT NULL DEFAULT '{}', revoked_permissions text[] NOT NULL DEFAULT '{}', two_factor_enabled boolean NOT NULL DEFAULT false, two_factor_secret jsonb, two_factor_enabled_at timestamptz, two_factor_reminder_at timestamptz, last_accepted_totp_step bigint, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, disabled_at timestamptz);
CREATE TABLE IF NOT EXISTS staff_recovery_codes (staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE, code_hash text NOT NULL, created_at timestamptz NOT NULL, consumed_at timestamptz, PRIMARY KEY (staff_id, code_hash));
CREATE TABLE IF NOT EXISTS staff_sessions (id text PRIMARY KEY, staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS staff_auth_tokens (id text PRIMARY KEY, staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('INVITATION','PASSWORD_RESET')), token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS staff_pre_auth_challenges (id text PRIMARY KEY, staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, invalidated_at timestamptz);

CREATE TABLE IF NOT EXISTS products (id text PRIMARY KEY, slug text NOT NULL UNIQUE, sku text NOT NULL UNIQUE, name text NOT NULL, brand text, taxonomy_id text, lifecycle_status text NOT NULL, current_price_minor bigint, currency char(3), content jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS product_versions (id text PRIMARY KEY, product_id text NOT NULL REFERENCES products(id), version integer NOT NULL, snapshot jsonb NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL, published_at timestamptz, UNIQUE(product_id, version));
CREATE TABLE IF NOT EXISTS media_objects (id text PRIMARY KEY, object_scope text NOT NULL CHECK (object_scope IN ('PUBLIC_PRODUCT','PRIVATE_DOCUMENT','PRIVATE_INVOICE')), bucket text NOT NULL, object_key text NOT NULL, content_hash text NOT NULL, content_type text NOT NULL, byte_size bigint NOT NULL, created_at timestamptz NOT NULL, deleted_at timestamptz, UNIQUE(bucket, object_key));
CREATE TABLE IF NOT EXISTS product_media (product_id text NOT NULL REFERENCES products(id), media_id text NOT NULL REFERENCES media_objects(id), sort_order integer NOT NULL, is_primary boolean NOT NULL DEFAULT false, alt_text text, PRIMARY KEY(product_id, media_id), UNIQUE(product_id, sort_order));

CREATE TABLE IF NOT EXISTS supplier_offers (id text PRIMARY KEY, supplier_code text NOT NULL, supplier_sku text NOT NULL, product_id text REFERENCES products(id), source_product_id text, source_variant_id text, currency char(3), cost_minor bigint, stock_total integer, availability text, evidence jsonb NOT NULL DEFAULT '{}', observed_at timestamptz, updated_at timestamptz NOT NULL, UNIQUE(supplier_code, supplier_sku));
CREATE TABLE IF NOT EXISTS supplier_mappings (id text PRIMARY KEY, supplier_offer_id text NOT NULL REFERENCES supplier_offers(id), product_id text NOT NULL REFERENCES products(id), status text NOT NULL, verified_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, UNIQUE(supplier_offer_id, product_id));
CREATE TABLE IF NOT EXISTS pricing_proposals (id text PRIMARY KEY, product_id text NOT NULL REFERENCES products(id), supplier_offer_id text REFERENCES supplier_offers(id), status text NOT NULL, cost_snapshot jsonb NOT NULL, proposal jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS promotions (id text PRIMARY KEY, product_id text REFERENCES products(id), status text NOT NULL, rule jsonb NOT NULL, starts_at timestamptz, ends_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS merchandising_placements (id text PRIMARY KEY, section_key text NOT NULL, product_id text REFERENCES products(id), sort_order integer NOT NULL, configuration jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, UNIQUE(section_key, sort_order));

CREATE TABLE IF NOT EXISTS orders (id text PRIMARY KEY, order_number text NOT NULL UNIQUE, customer_id text REFERENCES customers(id), status text NOT NULL, payment_status text NOT NULL, currency char(3) NOT NULL, subtotal_minor bigint NOT NULL, shipping_minor bigint NOT NULL, tax_minor bigint NOT NULL, total_minor bigint NOT NULL, customer_snapshot jsonb NOT NULL, delivery_snapshot jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS order_lines (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id text, sku text NOT NULL, name text NOT NULL, quantity integer NOT NULL CHECK(quantity > 0), unit_price_minor bigint NOT NULL, line_total_minor bigint NOT NULL, immutable_snapshot jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS payment_events (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), provider text NOT NULL, provider_reference text, idempotency_key text NOT NULL UNIQUE, status text NOT NULL, safe_evidence jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS guest_order_credentials (order_id text PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS supplier_orders (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), supplier_code text NOT NULL, status text NOT NULL, external_reference text, request_fingerprint text UNIQUE, immutable_cost_basis jsonb, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS inventory_balances (supplier_offer_id text PRIMARY KEY REFERENCES supplier_offers(id), on_hand integer NOT NULL, reserved integer NOT NULL CHECK(reserved >= 0 AND reserved <= on_hand), updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS inventory_reservations (id text PRIMARY KEY, supplier_offer_id text NOT NULL REFERENCES supplier_offers(id), order_line_id text NOT NULL REFERENCES order_lines(id), quantity integer NOT NULL CHECK(quantity > 0), status text NOT NULL, created_at timestamptz NOT NULL, released_at timestamptz, UNIQUE(supplier_offer_id, order_line_id));
CREATE TABLE IF NOT EXISTS inventory_movements (id text PRIMARY KEY, supplier_offer_id text NOT NULL REFERENCES supplier_offers(id), movement_type text NOT NULL, quantity integer NOT NULL, idempotency_key text NOT NULL UNIQUE, reference_type text NOT NULL, reference_id text NOT NULL, occurred_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS returns (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), status text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS refunds (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), return_id text REFERENCES returns(id), status text NOT NULL, amount_minor bigint NOT NULL, provider_reference text, idempotency_key text UNIQUE, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS shipments (id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), status text NOT NULL, tracking_reference text, carrier text, snapshot jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);

CREATE TABLE IF NOT EXISTS contact_conversations (id text PRIMARY KEY, reference text NOT NULL UNIQUE, customer_id text REFERENCES customers(id), department text NOT NULL, status text NOT NULL, subject text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS contact_messages (id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES contact_conversations(id) ON DELETE CASCADE, direction text NOT NULL, delivery_status text NOT NULL, idempotency_key text UNIQUE, sender_snapshot jsonb NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL, delivered_at timestamptz);
CREATE TABLE IF NOT EXISTS operational_alerts (id text PRIMARY KEY, fingerprint text NOT NULL UNIQUE, type text NOT NULL, severity text NOT NULL, status text NOT NULL, occurrence_count integer NOT NULL, safe_metadata jsonb NOT NULL DEFAULT '{}', first_seen_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, resolved_at timestamptz);
CREATE TABLE IF NOT EXISTS operational_events (id text PRIMARY KEY, alert_id text REFERENCES operational_alerts(id), event_type text NOT NULL, safe_metadata jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS admin_audit (id text PRIMARY KEY, category text NOT NULL, actor_type text NOT NULL, actor_id text, action_type text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, safe_before jsonb, safe_after jsonb, summary text NOT NULL, occurred_at timestamptz NOT NULL);
CREATE OR REPLACE RULE admin_audit_no_update AS ON UPDATE TO admin_audit DO INSTEAD NOTHING;
CREATE OR REPLACE RULE admin_audit_no_delete AS ON DELETE TO admin_audit DO INSTEAD NOTHING;
CREATE TABLE IF NOT EXISTS analytics_daily (day date NOT NULL, metric text NOT NULL, dimension_hash text NOT NULL, value bigint NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(day, metric, dimension_hash));
CREATE TABLE IF NOT EXISTS internal_notifications (id text PRIMARY KEY, type text NOT NULL, recipient text NOT NULL, idempotency_key text NOT NULL UNIQUE, status text NOT NULL, safe_metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL, sent_at timestamptz);
CREATE TABLE IF NOT EXISTS application_settings (namespace text NOT NULL, key text NOT NULL, version bigint NOT NULL, value jsonb NOT NULL, updated_at timestamptz NOT NULL, PRIMARY KEY(namespace, key));
CREATE TABLE IF NOT EXISTS feature_flags (key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, environment text NOT NULL, configuration jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limit_buckets (key_hash text NOT NULL, window_start timestamptz NOT NULL, window_seconds integer NOT NULL, count integer NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(key_hash, window_start, window_seconds));
CREATE INDEX IF NOT EXISTS rate_limit_buckets_expiry_idx ON rate_limit_buckets(expires_at);
CREATE TABLE IF NOT EXISTS distributed_locks (lock_key text PRIMARY KEY, owner_id text NOT NULL, expires_at timestamptz NOT NULL, acquired_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS migration_import_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_fingerprint text NOT NULL, mode text NOT NULL, status text NOT NULL, summary jsonb NOT NULL DEFAULT '{}', started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(source_fingerprint, mode));
