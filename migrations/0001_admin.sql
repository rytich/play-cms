PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role = 'admin'),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX one_admin ON accounts(role) WHERE role = 'admin';

CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bootstrap_consumed_at INTEGER
);

INSERT INTO app_settings (id, bootstrap_consumed_at) VALUES (1, NULL);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  filma_file_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX videos_created ON videos(created_at DESC);

CREATE TABLE access_codes (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX access_codes_video_created
  ON access_codes(video_id, created_at DESC);

CREATE TABLE rate_limits (
  endpoint TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (endpoint, bucket, window_started_at)
);

CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
