CREATE TABLE IF NOT EXISTS product_manual_logistics_evidence (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES catalogue_products(id) ON DELETE RESTRICT,
  supplier_code text NOT NULL,
  supplier_identity text,
  revision integer NOT NULL CHECK (revision > 0),
  classification text NOT NULL CHECK (classification IN ('PRODUCT', 'PACKAGE', 'SHIPPING')),
  source_type text NOT NULL CHECK (source_type = 'STAFF_MANUAL'),
  source_reference text,
  weight_grams numeric(18,4) CHECK (weight_grams > 0),
  length_mm numeric(18,4) CHECK (length_mm > 0),
  width_mm numeric(18,4) CHECK (width_mm > 0),
  height_mm numeric(18,4) CHECK (height_mm > 0),
  confidence text NOT NULL CHECK (confidence IN ('VERIFIED', 'REVIEWED')),
  evidence_fingerprint text NOT NULL,
  observed_at timestamptz NOT NULL,
  actor_staff_id text NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
  actor_label text NOT NULL,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, revision),
  UNIQUE(product_id, evidence_fingerprint)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_manual_logistics_active_idx
  ON product_manual_logistics_evidence(product_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS product_manual_logistics_history_idx
  ON product_manual_logistics_evidence(product_id, revision DESC);
