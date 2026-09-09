import type { AvailabilityInput } from '../../core/viewing'

export type ViewingVideo = AvailabilityInput & {
  id: string
  publicId: string
  filmaFileId: string
  title: string
  description: string
}

type ViewingVideoRow = {
  id: string
  public_id: string
  filma_file_id: string
  title: string
  description: string
  status: 'draft' | 'published'
  starts_at: string
  ends_at: string
}

function mapVideo(row: ViewingVideoRow): ViewingVideo {
  return {
    id: row.id,
    publicId: row.public_id,
    filmaFileId: row.filma_file_id,
    title: row.title,
    description: row.description,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }
}

const videoColumns = `videos.id, videos.public_id, videos.filma_file_id,
  videos.title, videos.description, videos.status,
  videos.starts_at, videos.ends_at`

export async function findRedeemCandidate(
  db: D1Database,
  publicId: string,
  codeHash: string,
  nowIso: string,
) {
  const row = await db
    .prepare(
      `SELECT ${videoColumns}
       FROM videos
       JOIN access_codes ON access_codes.video_id = videos.id
       LEFT JOIN redemptions ON redemptions.code_id = access_codes.id
       WHERE videos.public_id = ? AND access_codes.code_hash = ?
         AND access_codes.revoked_at IS NULL AND access_codes.is_enabled = 1
         AND redemptions.code_id IS NULL
         AND videos.status = 'published'
         AND videos.starts_at <= ? AND videos.ends_at > ?`,
    )
    .bind(publicId, codeHash, nowIso, nowIso)
    .first<ViewingVideoRow>()
  return row ? mapVideo(row) : null
}

export async function redeemForAnonymous(
  db: D1Database,
  input: {
    publicId: string
    codeHash: string
    sessionId: string
    tokenHash: string
    now: number
    expiresAt: number
  },
) {
  const nowIso = new Date(input.now * 1_000).toISOString()
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO anonymous_play_sessions
           (id, token_hash, expires_at, created_at)
         SELECT ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM access_codes
           JOIN videos ON videos.id = access_codes.video_id
           LEFT JOIN redemptions ON redemptions.code_id = access_codes.id
           WHERE videos.public_id = ? AND access_codes.code_hash = ?
             AND access_codes.revoked_at IS NULL AND access_codes.is_enabled = 1
             AND redemptions.code_id IS NULL
             AND videos.status = 'published'
             AND videos.starts_at <= ? AND videos.ends_at > ?
         )`,
      )
      .bind(
        input.sessionId,
        input.tokenHash,
        input.expiresAt,
        input.now,
        input.publicId,
        input.codeHash,
        nowIso,
        nowIso,
      ),
    db
      .prepare(
        `INSERT INTO redemptions
           (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
         SELECT access_codes.id, videos.id, ?, NULL, ?
         FROM access_codes
         JOIN videos ON videos.id = access_codes.video_id
         LEFT JOIN redemptions ON redemptions.code_id = access_codes.id
         WHERE videos.public_id = ? AND access_codes.code_hash = ?
           AND access_codes.revoked_at IS NULL AND access_codes.is_enabled = 1
           AND redemptions.code_id IS NULL
           AND videos.status = 'published'
           AND videos.starts_at <= ? AND videos.ends_at > ?
           AND EXISTS (SELECT 1 FROM anonymous_play_sessions WHERE id = ?)`,
      )
      .bind(
        input.sessionId,
        input.now,
        input.publicId,
        input.codeHash,
        nowIso,
        nowIso,
        input.sessionId,
      ),
    db
      .prepare(
        `DELETE FROM anonymous_play_sessions
         WHERE id = ? AND NOT EXISTS (
           SELECT 1 FROM redemptions WHERE anonymous_session_id = ?
         )`,
      )
      .bind(input.sessionId, input.sessionId),
  ])
  return results[1]!.meta.changes === 1
}

export async function redeemForViewer(
  db: D1Database,
  input: {
    publicId: string
    codeHash: string
    accountId: string
    now: number
  },
) {
  const nowIso = new Date(input.now * 1_000).toISOString()
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO redemptions
           (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
         SELECT access_codes.id, videos.id, NULL, ?, ?
         FROM access_codes
         JOIN videos ON videos.id = access_codes.video_id
         LEFT JOIN redemptions ON redemptions.code_id = access_codes.id
         WHERE videos.public_id = ? AND access_codes.code_hash = ?
           AND access_codes.revoked_at IS NULL AND access_codes.is_enabled = 1
           AND redemptions.code_id IS NULL
           AND videos.status = 'published'
           AND videos.starts_at <= ? AND videos.ends_at > ?`,
      )
      .bind(
        input.accountId,
        input.now,
        input.publicId,
        input.codeHash,
        nowIso,
        nowIso,
      ),
    db
      .prepare(
        `INSERT INTO entitlements
           (account_id, video_id, source_code_id, granted_at)
         SELECT account_id, video_id, code_id, redeemed_at
         FROM redemptions
         WHERE account_id = ? AND redeemed_at = ?
         ON CONFLICT(account_id, video_id) DO NOTHING`,
      )
      .bind(input.accountId, input.now),
  ])
  return results[0]!.meta.changes === 1
}

export function anonymousTransferStatements(
  db: D1Database,
  input: { tokenHash: string; accountId: string; now: number },
) {
  return [
    db
      .prepare(
        `INSERT INTO entitlements
           (account_id, video_id, source_code_id, granted_at)
         SELECT ?, redemptions.video_id, redemptions.code_id, ?
         FROM redemptions
         JOIN anonymous_play_sessions
           ON anonymous_play_sessions.id = redemptions.anonymous_session_id
         WHERE anonymous_play_sessions.token_hash = ?
           AND anonymous_play_sessions.expires_at > ?
         ON CONFLICT(account_id, video_id) DO NOTHING`,
      )
      .bind(input.accountId, input.now, input.tokenHash, input.now),
    db
      .prepare(
        `UPDATE redemptions
         SET account_id = ?, anonymous_session_id = NULL
         WHERE anonymous_session_id IN (
           SELECT id FROM anonymous_play_sessions
           WHERE token_hash = ? AND expires_at > ?
         )`,
      )
      .bind(input.accountId, input.tokenHash, input.now),
    db
      .prepare(
        `UPDATE anonymous_play_sessions SET expires_at = ?
         WHERE token_hash = ? AND expires_at > ?`,
      )
      .bind(input.now, input.tokenHash, input.now),
  ]
}

export async function findAnonymousPlayback(
  db: D1Database,
  tokenHash: string,
  publicId: string,
  now: number,
) {
  const nowIso = new Date(now * 1_000).toISOString()
  const row = await db
    .prepare(
      `SELECT ${videoColumns}
       FROM anonymous_play_sessions
       JOIN redemptions
         ON redemptions.anonymous_session_id = anonymous_play_sessions.id
       JOIN videos ON videos.id = redemptions.video_id
       WHERE anonymous_play_sessions.token_hash = ?
         AND anonymous_play_sessions.expires_at > ?
         AND videos.public_id = ? AND videos.status = 'published'
         AND videos.starts_at <= ? AND videos.ends_at > ?`,
    )
    .bind(tokenHash, now, publicId, nowIso, nowIso)
    .first<ViewingVideoRow>()
  return row ? mapVideo(row) : null
}

export async function anonymousSessionActive(
  db: D1Database,
  tokenHash: string,
  now: number,
) {
  const row = await db
    .prepare(
      `SELECT 1 AS active FROM anonymous_play_sessions
       WHERE token_hash = ? AND expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first<{ active: number }>()
  return row?.active === 1
}

export async function findViewerPlayback(
  db: D1Database,
  accountId: string,
  publicId: string,
  now: number,
) {
  const nowIso = new Date(now * 1_000).toISOString()
  const row = await db
    .prepare(
      `SELECT ${videoColumns}
       FROM entitlements
       JOIN videos ON videos.id = entitlements.video_id
       WHERE entitlements.account_id = ? AND videos.public_id = ?
         AND videos.status = 'published'
         AND videos.starts_at <= ? AND videos.ends_at > ?`,
    )
    .bind(accountId, publicId, nowIso, nowIso)
    .first<ViewingVideoRow>()
  return row ? mapVideo(row) : null
}

export async function findFilmaSetting(db: D1Database) {
  return db
    .prepare(
      `SELECT filma_api_key_ciphertext, filma_api_key_nonce, filma_verified_at
       FROM app_settings WHERE id = 1`,
    )
    .first<{
      filma_api_key_ciphertext: string | null
      filma_api_key_nonce: string | null
      filma_verified_at: number | null
    }>()
}

export async function saveFilmaSetting(
  db: D1Database,
  input: { ciphertext: string; nonce: string; verifiedAt: number },
) {
  const result = await db
    .prepare(
      `UPDATE app_settings
       SET filma_api_key_ciphertext = ?, filma_api_key_nonce = ?,
           filma_verified_at = ? WHERE id = 1`,
    )
    .bind(input.ciphertext, input.nonce, input.verifiedAt)
    .run()
  return result.meta.changes === 1
}
