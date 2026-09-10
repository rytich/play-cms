PRAGMA foreign_keys = ON;

ALTER TABLE app_settings ADD COLUMN filma_api_key_ciphertext TEXT;
ALTER TABLE app_settings ADD COLUMN filma_api_key_nonce TEXT;
ALTER TABLE app_settings ADD COLUMN filma_verified_at INTEGER;

CREATE TABLE anonymous_play_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX anonymous_play_sessions_expiry
  ON anonymous_play_sessions(expires_at);

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

CREATE INDEX redemptions_anonymous_session
  ON redemptions(anonymous_session_id);
CREATE INDEX redemptions_account ON redemptions(account_id);
