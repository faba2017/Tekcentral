DROP INDEX IF EXISTS catalogue_product_mapping_active_identity_idx;
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_product_mapping_active_exact_idx
  ON catalogue_product_mappings(supplier_code, supplier_identity, product_id)
  WHERE status <> 'SUPERSEDED';
