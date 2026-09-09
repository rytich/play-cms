PRAGMA defer_foreign_keys = ON;

CREATE TABLE sessions_viewer_migration_backup (
  id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  account_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO sessions_viewer_migration_backup
  (id, token_hash, account_id, expires_at, created_at)
SELECT id, token_hash, account_id, expires_at, created_at
FROM sessions;

DROP TABLE sessions;

CREATE TABLE accounts_viewer_migration_new (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO accounts_viewer_migration_new
  (id, role, email, password_hash, created_at)
SELECT id, role, email, password_hash, created_at
FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_viewer_migration_new RENAME TO accounts;
CREATE UNIQUE INDEX one_admin ON accounts(role) WHERE role = 'admin';

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO sessions (id, token_hash, account_id, expires_at, created_at)
SELECT id, token_hash, account_id, expires_at, created_at
FROM sessions_viewer_migration_backup;

CREATE INDEX sessions_expiry ON sessions(expires_at);
DROP TABLE sessions_viewer_migration_backup;

CREATE UNIQUE INDEX access_codes_id_video ON access_codes(id, video_id);

CREATE TABLE entitlements (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  source_code_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, video_id),
  FOREIGN KEY (source_code_id, video_id)
    REFERENCES access_codes(id, video_id) ON DELETE CASCADE
);

CREATE INDEX entitlements_video ON entitlements(video_id);
