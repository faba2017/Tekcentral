CREATE TABLE IF NOT EXISTS catalogue_products (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  sku text NOT NULL UNIQUE,
  publication_status text NOT NULL,
  supplier_code text NOT NULL,
  supplier_offer_id text NOT NULL UNIQUE,
  product_kind text NOT NULL DEFAULT 'INTERNAL' CHECK (product_kind IN ('INTERNAL','CODE_SEEDED')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS catalogue_publications (
  product_id text PRIMARY KEY REFERENCES catalogue_products(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('PUBLISHED','UNPUBLISHED')),
  active_version_id text,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS catalogue_publication_versions (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES catalogue_products(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL CHECK (status = 'PUBLISHED'),
  published_at timestamptz NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  UNIQUE(product_id, version)
);
CREATE TABLE IF NOT EXISTS catalogue_publication_drafts (
  product_id text PRIMARY KEY REFERENCES catalogue_products(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS catalogue_publication_audit (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES catalogue_products(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS catalogue_supplier_offers (
  supplier_code text NOT NULL,
  supplier_identity text NOT NULL,
  product_id text REFERENCES catalogue_products(id),
  supplier_sku text,
  availability text,
  currency text,
  observed_at timestamptz,
  updated_at timestamptz,
  payload jsonb NOT NULL,
  PRIMARY KEY(supplier_code, supplier_identity),
  UNIQUE(supplier_code, supplier_sku)
);
CREATE INDEX IF NOT EXISTS catalogue_supplier_offers_product_idx ON catalogue_supplier_offers(product_id);
CREATE INDEX IF NOT EXISTS catalogue_supplier_offers_availability_idx ON catalogue_supplier_offers(supplier_code, availability);
CREATE TABLE IF NOT EXISTS catalogue_supplier_state (
  supplier_code text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogue_product_mappings (
  id text PRIMARY KEY,
  supplier_code text NOT NULL,
  supplier_identity text NOT NULL,
  product_id text NOT NULL REFERENCES catalogue_products(id) ON DELETE RESTRICT,
  status text NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS catalogue_product_mappings_product_idx ON catalogue_product_mappings(product_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_product_mapping_active_identity_idx
  ON catalogue_product_mappings(supplier_code, supplier_identity)
  WHERE status <> 'SUPERSEDED';

CREATE TABLE IF NOT EXISTS catalogue_category_mappings (
  id text PRIMARY KEY,
  supplier_code text NOT NULL,
  source_category_id text NOT NULL,
  taxonomy_id text,
  status text NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE(supplier_code, source_category_id)
);

CREATE TABLE IF NOT EXISTS catalogue_pricing_proposals (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES catalogue_products(id) ON DELETE RESTRICT,
  supplier_code text NOT NULL,
  supplier_offer_id text,
  status text NOT NULL,
  generated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS catalogue_pricing_product_idx ON catalogue_pricing_proposals(product_id, status);

CREATE TABLE IF NOT EXISTS catalogue_merchandising_sections (
  id text PRIMARY KEY,
  section_key text NOT NULL UNIQUE,
  sort_order integer NOT NULL,
  enabled boolean NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS catalogue_promotions (
  id text PRIMARY KEY,
  enabled boolean NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS catalogue_merchandising_audit (
  id text PRIMARY KEY,
  entity_id text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS catalogue_media_records (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES catalogue_products(id) ON DELETE CASCADE,
  public_url text NOT NULL UNIQUE,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL,
  source_url text,
  captured_at timestamptz NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  UNIQUE(product_id, sort_order)
);
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_media_primary_idx ON catalogue_media_records(product_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS catalogue_import_runs (
  fingerprint text PRIMARY KEY,
  source_summary jsonb NOT NULL,
  completed_at timestamptz NOT NULL
);
