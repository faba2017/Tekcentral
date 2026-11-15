ALTER TABLE catalogue_category_mappings
  ADD COLUMN IF NOT EXISTS normalized_source_path text;

UPDATE catalogue_category_mappings
SET normalized_source_path = lower(regexp_replace(trim(source_category_id), '\s+', ' ', 'g'))
WHERE normalized_source_path IS NULL;

ALTER TABLE catalogue_category_mappings
  ALTER COLUMN normalized_source_path SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS catalogue_category_mapping_source_path_idx
  ON catalogue_category_mappings(supplier_code, normalized_source_path);
