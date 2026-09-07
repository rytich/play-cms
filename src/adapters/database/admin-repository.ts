import type { Video, VideoInput } from '../../core/admin'

type AccountRow = { id: string; email: string; password_hash: string }
type SessionAdmin = { account_id: string }

type VideoRow = {
  id: string
  public_id: string
  filma_file_id: string
  title: string
  description: string
  status: 'draft'
  starts_at: string
  ends_at: string
}

function mapVideo(row: VideoRow): Video {
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

export async function bootstrapConsumed(db: D1Database) {
  const row = await db
    .prepare('SELECT bootstrap_consumed_at FROM app_settings WHERE id = 1')
    .first<{ bootstrap_consumed_at: number | null }>()
  if (!row) throw new Error('missing app settings')
  return row.bootstrap_consumed_at !== null
}

export async function createOnlyAdmin(
  db: D1Database,
  input: { id: string; email: string; passwordHash: string; now: number },
) {
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO accounts (id, role, email, password_hash, created_at)
         SELECT ?, 'admin', ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE role = 'admin')
           AND EXISTS (
             SELECT 1 FROM app_settings
             WHERE id = 1 AND bootstrap_consumed_at IS NULL
           )`,
      )
      .bind(input.id, input.email, input.passwordHash, input.now),
    db
      .prepare(
        `UPDATE app_settings
         SET bootstrap_consumed_at = ?
         WHERE id = 1 AND bootstrap_consumed_at IS NULL
           AND EXISTS (SELECT 1 FROM accounts WHERE id = ?)`,
      )
      .bind(input.now, input.id),
  ])
  return results[0]!.meta.changes === 1 && results[1]!.meta.changes === 1
}

export function findAdminByEmail(db: D1Database, email: string) {
  return db
    .prepare(
      `SELECT id, email, password_hash FROM accounts
       WHERE role = 'admin' AND email = ?`,
    )
    .bind(email)
    .first<AccountRow>()
}

export async function createSession(
  db: D1Database,
  input: {
    id: string
    tokenHash: string
    accountId: string
    expiresAt: number
    now: number
  },
) {
  await db.batch([
    db
      .prepare(
        `DELETE FROM sessions WHERE id IN (
         SELECT id FROM sessions WHERE expires_at <= ? LIMIT 100
       )`,
      )
      .bind(input.now),
    db
      .prepare(
        `INSERT INTO sessions
           (id, token_hash, account_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.tokenHash,
        input.accountId,
        input.expiresAt,
        input.now,
      ),
  ])
}

export function findAdminSession(
  db: D1Database,
  tokenHash: string,
  now: number,
) {
  return db
    .prepare(
      `SELECT sessions.account_id
       FROM sessions
       JOIN accounts ON accounts.id = sessions.account_id
       WHERE sessions.token_hash = ?
         AND sessions.expires_at > ?
         AND accounts.role = 'admin'`,
    )
    .bind(tokenHash, now)
    .first<SessionAdmin>()
}

export function deleteSession(db: D1Database, tokenHash: string) {
  return db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .run()
}

export async function listVideos(db: D1Database, offset: number) {
  const rows = await db
    .prepare(
      `SELECT id, public_id, filma_file_id, title, description, status,
              starts_at, ends_at
       FROM videos
       ORDER BY created_at DESC, id DESC
       LIMIT 100 OFFSET ?`,
    )
    .bind(offset)
    .all<VideoRow>()
  return rows.results.map(mapVideo)
}

export async function insertVideo(
  db: D1Database,
  ids: { id: string; publicId: string },
  input: VideoInput,
  now: number,
) {
  await db
    .prepare(
      `INSERT INTO videos
       (id, public_id, filma_file_id, title, description, status,
        starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    )
    .bind(
      ids.id,
      ids.publicId,
      input.filmaFileId,
      input.title,
      input.description,
      input.startsAt,
      input.endsAt,
      now,
      now,
    )
    .run()
  return findVideo(db, ids.id)
}

export function findVideo(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT id, public_id, filma_file_id, title, description, status,
              starts_at, ends_at
       FROM videos WHERE id = ?`,
    )
    .bind(id)
    .first<VideoRow>()
    .then((row) => (row ? mapVideo(row) : null))
}

export async function updateVideo(
  db: D1Database,
  id: string,
  input: VideoInput,
  now: number,
) {
  const result = await db
    .prepare(
      `UPDATE videos
       SET filma_file_id = ?, title = ?, description = ?, starts_at = ?,
           ends_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.filmaFileId,
      input.title,
      input.description,
      input.startsAt,
      input.endsAt,
      now,
      id,
    )
    .run()
  return result.meta.changes === 1 ? findVideo(db, id) : null
}

export async function insertAccessCode(
  db: D1Database,
  input: { id: string; videoId: string; codeHash: string; now: number },
) {
  const result = await db
    .prepare(
      `INSERT INTO access_codes (id, video_id, code_hash, created_at, revoked_at)
       SELECT ?, ?, ?, ?, NULL
       WHERE EXISTS (SELECT 1 FROM videos WHERE id = ?)`,
    )
    .bind(input.id, input.videoId, input.codeHash, input.now, input.videoId)
    .run()
  return result.meta.changes === 1
}

export async function listAccessCodes(
  db: D1Database,
  videoId: string,
  offset: number,
) {
  const video = await findVideo(db, videoId)
  if (!video) return null
  const rows = await db
    .prepare(
      `SELECT id, created_at, revoked_at FROM access_codes
       WHERE video_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100 OFFSET ?`,
    )
    .bind(videoId, offset)
    .all<{ id: string; created_at: number; revoked_at: number | null }>()
  return rows.results
}

export async function revokeAccessCode(
  db: D1Database,
  videoId: string,
  codeId: string,
  now: number,
) {
  const result = await db
    .prepare(
      `UPDATE access_codes SET revoked_at = COALESCE(revoked_at, ?)
       WHERE id = ? AND video_id = ?`,
    )
    .bind(now, codeId, videoId)
    .run()
  return result.meta.changes === 1
}

export async function incrementRateLimits(
  db: D1Database,
  now: number,
  limits: readonly {
    endpoint: string
    bucket: string
    windowSeconds: number
    maximum: number
  }[],
) {
  const statements = [
    db
      .prepare(
        `DELETE FROM rate_limits WHERE rowid IN (
           SELECT rowid FROM rate_limits WHERE expires_at <= ? LIMIT 100
         )`,
      )
      .bind(now),
    ...limits.map((limit) => {
      const windowStartedAt =
        Math.floor(now / limit.windowSeconds) * limit.windowSeconds
      return db
        .prepare(
          `INSERT INTO rate_limits
             (endpoint, bucket, window_started_at, attempts, expires_at)
           VALUES (?, ?, ?, 1, ?)
           ON CONFLICT(endpoint, bucket, window_started_at)
           DO UPDATE SET attempts = attempts + 1
           RETURNING attempts`,
        )
        .bind(
          limit.endpoint,
          limit.bucket,
          windowStartedAt,
          windowStartedAt + limit.windowSeconds + 86_400,
        )
    }),
  ]
  const results = await db.batch(statements)
  for (let index = 0; index < limits.length; index += 1) {
    const attempts = (results[index + 1]!.results[0] as { attempts: number })
      .attempts
    const limit = limits[index]!
    if (attempts > limit.maximum) {
      const windowStartedAt =
        Math.floor(now / limit.windowSeconds) * limit.windowSeconds
      return Math.max(1, windowStartedAt + limit.windowSeconds - now)
    }
  }
  return null
}
