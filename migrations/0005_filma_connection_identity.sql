PRAGMA foreign_keys = ON;

ALTER TABLE app_settings ADD COLUMN filma_organization_id INTEGER
  CHECK (
    filma_organization_id IS NULL OR
    typeof(filma_organization_id) = 'integer'
  );
ALTER TABLE app_settings ADD COLUMN filma_api_type TEXT
  CHECK (
    filma_api_type IS NULL OR
    filma_api_type IN ('readonly', 'fullaccess')
  );
