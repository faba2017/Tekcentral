CREATE TABLE IF NOT EXISTS commerce_orders (
  id text PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  customer_id text REFERENCES customers(id),
  status text NOT NULL,
  payment_status text NOT NULL,
  currency text NOT NULL,
  total numeric(18,2) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS commerce_orders_payment_idx ON commerce_orders(payment_status, updated_at);
CREATE TABLE IF NOT EXISTS commerce_order_lines (
  order_id text NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  line_id text NOT NULL,
  product_id text,
  sku text,
  quantity integer NOT NULL CHECK(quantity > 0),
  unit_price numeric(18,2) NOT NULL,
  cost_basis jsonb,
  payload jsonb NOT NULL,
  PRIMARY KEY(order_id, line_id)
);
CREATE TABLE IF NOT EXISTS commerce_payment_records (
  order_id text PRIMARY KEY REFERENCES commerce_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  provider text NOT NULL,
  provider_reference text,
  amount numeric(18,2),
  currency text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_payment_events (
  id text PRIMARY KEY,
  order_number text,
  provider_reference text,
  idempotency_key text UNIQUE,
  accepted boolean NOT NULL,
  reason text,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_supplier_orders (
  id text PRIMARY KEY,
  order_number text NOT NULL,
  supplier_code text NOT NULL,
  status text NOT NULL,
  external_reference text,
  request_fingerprint text UNIQUE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_supplier_order_lines (
  supplier_order_id text NOT NULL REFERENCES commerce_supplier_orders(id) ON DELETE CASCADE,
  line_id text NOT NULL,
  product_id text,
  supplier_sku text,
  quantity integer NOT NULL CHECK(quantity > 0),
  payload jsonb NOT NULL,
  PRIMARY KEY(supplier_order_id, line_id)
);
CREATE INDEX IF NOT EXISTS commerce_supplier_orders_order_idx ON commerce_supplier_orders(order_number);
CREATE TABLE IF NOT EXISTS commerce_shipping_quotes (
  id text PRIMARY KEY,
  cart_fingerprint text NOT NULL,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_returns (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_refunds (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  amount numeric(18,2),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_shipments (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_guest_credentials (
  token_hash text PRIMARY KEY,
  order_number text NOT NULL,
  payload jsonb NOT NULL,
  issued_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_guest_active_order_idx ON commerce_guest_credentials(order_number) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS commerce_order_claims (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES customers(id),
  order_number text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_order_claim_audit (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  order_number text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_carts (
  owner_hash text PRIMARY KEY,
  payload jsonb NOT NULL,
  touched_at timestamptz
);
CREATE TABLE IF NOT EXISTS commerce_cart_actions (
  id text PRIMARY KEY,
  owner_hash text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_cart_state (
  key text PRIMARY KEY,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_inventory_balances (
  offer_id text PRIMARY KEY,
  product_id text,
  supplier_sku text NOT NULL,
  on_hand integer NOT NULL CHECK(on_hand >= 0),
  reserved integer NOT NULL CHECK(reserved >= 0 AND reserved <= on_hand),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_inventory_reservations (
  id text PRIMARY KEY,
  offer_id text NOT NULL REFERENCES commerce_inventory_balances(offer_id),
  supplier_order_id text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0),
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(offer_id, supplier_order_id)
);
CREATE TABLE IF NOT EXISTS commerce_inventory_ledger (
  id text PRIMARY KEY,
  offer_id text NOT NULL,
  quantity_delta integer NOT NULL,
  reason text NOT NULL,
  reference text,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_return_reconciliations (
  id text PRIMARY KEY,
  order_number text NOT NULL,
  offer_id text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0),
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_replenishments (
  id text PRIMARY KEY,
  offer_id text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_manual_state (
  key text PRIMARY KEY,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_import_runs (
  fingerprint text PRIMARY KEY,
  source_summary jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);
