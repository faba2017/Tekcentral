CREATE TABLE IF NOT EXISTS canonical_taxonomy_nodes (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  parent_id text REFERENCES canonical_taxonomy_nodes(id) ON DELETE RESTRICT,
  level text NOT NULL CHECK (level IN ('CATEGORY','SUBCATEGORY','PRODUCT_TYPE')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DEPRECATED','ARCHIVED')),
  sort_order integer NOT NULL DEFAULT 0,
  storefront_visible boolean NOT NULL DEFAULT false,
  seo_title text,
  seo_description text,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS canonical_taxonomy_root_slug_idx
  ON canonical_taxonomy_nodes(slug) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS canonical_taxonomy_sibling_slug_idx
  ON canonical_taxonomy_nodes(parent_id, slug) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS canonical_taxonomy_parent_idx ON canonical_taxonomy_nodes(parent_id, sort_order, name);
CREATE INDEX IF NOT EXISTS canonical_taxonomy_status_idx ON canonical_taxonomy_nodes(status, storefront_visible);

