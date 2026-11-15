CREATE TABLE IF NOT EXISTS supplier_sources (
  id text PRIMARY KEY,
  supplier_code text NOT NULL,
  label text NOT NULL,
  purpose text NOT NULL,
  transport text NOT NULL,
  format text NOT NULL,
  source_url text,
  file_reference text,
  state text NOT NULL DEFAULT 'DISABLED',
  priority integer NOT NULL DEFAULT 100,
  is_primary boolean NOT NULL DEFAULT false,
  expected_mime_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_host text,
  hints jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_enabled boolean NOT NULL DEFAULT false,
  sync_interval_minutes integer,
  next_check_at timestamptz,
  last_checked_at timestamptz,
  last_retrieved_at timestamptz,
  last_imported_at timestamptz,
  last_failed_at timestamptz,
  last_error_summary text,
  etag text,
  last_modified text,
  content_length bigint,
  fingerprint text,
  revision_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier_code, source_url)
);
CREATE INDEX IF NOT EXISTS supplier_sources_lookup_idx ON supplier_sources(supplier_code, purpose, state, priority);

CREATE TABLE IF NOT EXISTS supplier_source_versions (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES supplier_sources(id) ON DELETE RESTRICT,
  fingerprint text NOT NULL,
  object_key text,
  content_type text,
  byte_size bigint,
  etag text,
  last_modified text,
  workbook_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  retrieved_at timestamptz NOT NULL,
  UNIQUE(source_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS supplier_source_runs (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES supplier_sources(id) ON DELETE RESTRICT,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  fingerprint text,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  error_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS supplier_source_runs_source_idx ON supplier_source_runs(source_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_source_runs_active_idx ON supplier_source_runs(source_id) WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS supplier_source_evidence (
  id text PRIMARY KEY,
  supplier_code text NOT NULL,
  source_id text NOT NULL REFERENCES supplier_sources(id) ON DELETE RESTRICT,
  source_version_id text NOT NULL REFERENCES supplier_source_versions(id) ON DELETE RESTRICT,
  supplier_sku text NOT NULL,
  source_description text,
  source_brand text,
  workbook_name text,
  worksheet_name text,
  source_row integer,
  dealer_cost numeric(18,4),
  currency char(3),
  tax_basis text,
  stock_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_url text,
  observed_at timestamptz NOT NULL,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(source_id, source_version_id, worksheet_name, source_row, supplier_sku)
);
CREATE INDEX IF NOT EXISTS supplier_source_evidence_sku_idx ON supplier_source_evidence(supplier_code, supplier_sku);
