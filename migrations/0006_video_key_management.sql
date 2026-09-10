PRAGMA defer_foreign_keys = ON;

CREATE TABLE videos_key_management_backup AS
SELECT id, public_id, filma_file_id, title, description, status,
       starts_at, ends_at, created_at, updated_at
FROM videos;

CREATE TABLE access_codes_key_management_backup AS
SELECT id, video_id, code_hash, created_at, revoked_at, is_enabled
FROM access_codes;

CREATE TABLE redemptions_key_management_backup AS
SELECT code_id, video_id, anonymous_session_id, account_id, redeemed_at
FROM redemptions;

CREATE TABLE entitlements_key_management_backup AS
SELECT account_id, video_id, source_code_id, granted_at
FROM entitlements;

DROP TABLE entitlements;
DROP TABLE redemptions;
DROP TABLE access_codes;
DROP TABLE videos;

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  filma_file_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  starts_at TEXT,
  ends_at TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO videos
  (id, public_id, filma_file_id, title, description, status,
   starts_at, ends_at, created_at, updated_at)
SELECT id, public_id, filma_file_id, title, description, status,
       starts_at, ends_at, created_at, updated_at
FROM videos_key_management_backup;

CREATE INDEX videos_created ON videos(created_at DESC);

CREATE TABLE access_codes (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  code_ciphertext TEXT,
  code_nonce TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  replaced_by_code_id TEXT REFERENCES access_codes(id),
  CHECK (
    (code_ciphertext IS NULL AND code_nonce IS NULL) OR
    (code_ciphertext IS NOT NULL AND code_nonce IS NOT NULL)
  )
);

INSERT INTO access_codes
  (id, video_id, code_hash, code_ciphertext, code_nonce,
   created_at, revoked_at, is_enabled, replaced_by_code_id)
SELECT id, video_id, code_hash, NULL, NULL,
       created_at, revoked_at, is_enabled, NULL
FROM access_codes_key_management_backup;

CREATE INDEX access_codes_video_created
  ON access_codes(video_id, created_at DESC);
CREATE UNIQUE INDEX access_codes_id_video ON access_codes(id, video_id);

CREATE TABLE redemptions (
  code_id TEXT NOT NULL UNIQUE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  anonymous_session_id TEXT REFERENCES anonymous_play_sessions(id),
  account_id TEXT REFERENCES accounts(id),
  redeemed_at INTEGER NOT NULL,
  CHECK ((anonymous_session_id IS NULL) <> (account_id IS NULL)),
  FOREIGN KEY (code_id, video_id)
    REFERENCES access_codes(id, video_id) ON DELETE CASCADE
);

INSERT INTO redemptions
  (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
SELECT code_id, video_id, anonymous_session_id, account_id, redeemed_at
FROM redemptions_key_management_backup;

CREATE INDEX redemptions_anonymous_session
  ON redemptions(anonymous_session_id);
CREATE INDEX redemptions_account ON redemptions(account_id);

CREATE TABLE entitlements (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  source_code_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, video_id),
  FOREIGN KEY (source_code_id, video_id)
    REFERENCES access_codes(id, video_id) ON DELETE CASCADE
);

INSERT INTO entitlements (account_id, video_id, source_code_id, granted_at)
SELECT account_id, video_id, source_code_id, granted_at
FROM entitlements_key_management_backup;

CREATE INDEX entitlements_video ON entitlements(video_id);

DROP TABLE entitlements_key_management_backup;
DROP TABLE redemptions_key_management_backup;
DROP TABLE access_codes_key_management_backup;
DROP TABLE videos_key_management_backup;

PRAGMA foreign_keys = ON;
