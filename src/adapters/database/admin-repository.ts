import type { Video, VideoInput } from '../../core/admin'
import type {
  CodeFilters,
  VideoFilters,
  VideoStatus,
} from '../../core/admin-management'

type AccountRow = { id: string; email: string; password_hash: string }
type SessionAdmin = { account_id: string }

type VideoRow = {
  id: string
  public_id: string
  filma_file_id: string
  title: string
  description: string
  status: VideoStatus
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

export async function listVideos(db: D1Database, filters: VideoFilters) {
  const where: string[] = []
  const bindings: (string | number)[] = []
  if (filters.q) {
    where.push('(instr(title, ?) > 0 OR filma_file_id = ?)')
    bindings.push(filters.q, filters.q)
  }
  if (filters.status) {
    where.push('status = ?')
    bindings.push(filters.status)
  }
  if (filters.from) {
    where.push('ends_at > ?')
    bindings.push(filters.from)
  }
  if (filters.to) {
    where.push('starts_at < ?')
    bindings.push(filters.to)
  }
  const rows = await db
    .prepare(
      `SELECT id, public_id, filma_file_id, title, description, status,
              starts_at, ends_at
       FROM videos
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC, id DESC
       LIMIT 101 OFFSET ?`,
    )
    .bind(...bindings, filters.offset)
    .all<VideoRow>()
  return {
    videos: rows.results.slice(0, 100).map(mapVideo),
    hasMore: rows.results.length > 100,
  }
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
  filters: CodeFilters,
) {
  const video = await findVideo(db, videoId)
  if (!video) return null
  const where = ['video_id = ?']
  const bindings: (string | number)[] = [videoId]
  if (filters.codeId) {
    where.push('id = ?')
    bindings.push(filters.codeId)
  }
  if (filters.setting) {
    where.push('is_enabled = ?')
    bindings.push(filters.setting === 'enabled' ? 1 : 0)
  }
  if (filters.lifecycle === 'unused') where.push('revoked_at IS NULL')
  if (filters.lifecycle === 'revoked') where.push('revoked_at IS NOT NULL')
  if (filters.lifecycle === 'used') where.push('0 = 1')
  if (filters.issuedFrom) {
    where.push('created_at >= ?')
    bindings.push(Math.ceil(Date.parse(filters.issuedFrom) / 1_000))
  }
  if (filters.issuedTo) {
    where.push('created_at < ?')
    bindings.push(Math.ceil(Date.parse(filters.issuedTo) / 1_000))
  }
  const rows = await db
    .prepare(
      `SELECT id, created_at, revoked_at, is_enabled FROM access_codes
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT 101 OFFSET ?`,
    )
    .bind(...bindings, filters.offset)
    .all<{
      id: string
      created_at: number
      revoked_at: number | null
      is_enabled: number
    }>()
  return {
    codes: rows.results.slice(0, 100),
    hasMore: rows.results.length > 100,
  }
}

export async function bulkUpdateVideos(
  db: D1Database,
  ids: readonly string[],
  status: VideoStatus,
) {
  const json = JSON.stringify(ids)
  const results = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS found_count,
                COALESCE(SUM(status = ?), 0) AS unchanged_count
         FROM videos WHERE id IN (SELECT value FROM json_each(?))`,
      )
      .bind(status, json),
    db
      .prepare(
        `UPDATE videos SET status = ?, updated_at = ?
         WHERE id IN (SELECT value FROM json_each(?)) AND status <> ?
           AND (SELECT COUNT(*) FROM videos
                WHERE id IN (SELECT value FROM json_each(?))) = ?`,
      )
      .bind(
        status,
        Math.floor(Date.now() / 1_000),
        json,
        status,
        json,
        ids.length,
      ),
  ])
  const row = results[0]!.results[0] as {
    found_count: number
    unchanged_count: number
  }
  if (row.found_count !== ids.length) return { kind: 'not-found' as const }
  const changedCount = results[1]!.meta.changes
  if (changedCount + row.unchanged_count !== ids.length) {
    throw new Error('bulk video outcome unavailable')
  }
  return {
    kind: 'ok' as const,
    changedCount,
    unchangedCount: row.unchanged_count,
  }
}

export async function bulkUpdateAccessCodes(
  db: D1Database,
  videoId: string,
  ids: readonly string[],
  enabled: boolean,
  now: number,
) {
  const json = JSON.stringify(ids)
  const target = enabled ? 1 : 0
  const nowIso = new Date(now * 1_000).toISOString()
  const results = await db.batch([
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM videos WHERE id = ?) AS video_count,
           COUNT(*) AS found_count,
           COALESCE(SUM(revoked_at IS NOT NULL), 0) AS conflict_count,
           COALESCE(SUM(is_enabled = ?), 0) AS unchanged_count,
           (SELECT COUNT(*) FROM videos WHERE id = ? AND ends_at > ?) AS active_count
         FROM access_codes
         WHERE video_id = ? AND id IN (SELECT value FROM json_each(?))`,
      )
      .bind(videoId, target, videoId, nowIso, videoId, json),
    db
      .prepare(
        `UPDATE access_codes SET is_enabled = ?
         WHERE video_id = ?
           AND id IN (SELECT value FROM json_each(?))
           AND revoked_at IS NULL AND is_enabled <> ?
           AND (? = 0 OR EXISTS (
             SELECT 1 FROM videos WHERE id = ? AND ends_at > ?
           ))
           AND (SELECT COUNT(*) FROM access_codes
                WHERE video_id = ? AND id IN (SELECT value FROM json_each(?))) = ?
           AND (SELECT COUNT(*) FROM access_codes
                WHERE video_id = ? AND id IN (SELECT value FROM json_each(?))
                  AND revoked_at IS NULL) = ?`,
      )
      .bind(
        target,
        videoId,
        json,
        target,
        target,
        videoId,
        nowIso,
        videoId,
        json,
        ids.length,
        videoId,
        json,
        ids.length,
      ),
  ])
  const row = results[0]!.results[0] as {
    video_count: number
    found_count: number
    conflict_count: number
    unchanged_count: number
    active_count: number
  }
  if (row.video_count !== 1 || row.found_count !== ids.length) {
    return { kind: 'not-found' as const }
  }
  if (row.conflict_count > 0 || (enabled && row.active_count !== 1)) {
    return { kind: 'conflict' as const }
  }
  const changedCount = results[1]!.meta.changes
  if (changedCount + row.unchanged_count !== ids.length) {
    throw new Error('bulk code outcome unavailable')
  }
  return {
    kind: 'ok' as const,
    changedCount,
    unchangedCount: row.unchanged_count,
  }
}

export async function revokeAccessCode(
  db: D1Database,
  videoId: string,
  codeId: string,
  now: number,
) {
  const result = await db
    .prepare(
      `UPDATE access_codes SET revoked_at = ?
       WHERE id = ? AND video_id = ? AND revoked_at IS NULL`,
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
