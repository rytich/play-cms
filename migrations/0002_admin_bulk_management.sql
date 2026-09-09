PRAGMA defer_foreign_keys = ON;

CREATE TABLE access_codes_migration_backup (
  id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

INSERT INTO access_codes_migration_backup
  (id, video_id, code_hash, created_at, revoked_at)
SELECT id, video_id, code_hash, created_at, revoked_at
FROM access_codes;

DROP TABLE access_codes;

CREATE TABLE videos_migration_new (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  filma_file_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO videos_migration_new
  (id, public_id, filma_file_id, title, description, status,
   starts_at, ends_at, created_at, updated_at)
SELECT id, public_id, filma_file_id, title, description, status,
       starts_at, ends_at, created_at, updated_at
FROM videos;

DROP TABLE videos;
ALTER TABLE videos_migration_new RENAME TO videos;
CREATE INDEX videos_created ON videos(created_at DESC);

CREATE TABLE access_codes (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1))
);

INSERT INTO access_codes
  (id, video_id, code_hash, created_at, revoked_at, is_enabled)
SELECT id, video_id, code_hash, created_at, revoked_at, 1
FROM access_codes_migration_backup;

CREATE INDEX access_codes_video_created
  ON access_codes(video_id, created_at DESC);

DROP TABLE access_codes_migration_backup;
