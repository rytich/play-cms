import type { ViewerLibraryRow } from '../../core/viewer'
import { anonymousTransferStatements } from './viewing-repository'

type ViewerAccountRow = {
  id: string
  email: string
  password_hash: string
}

export function findViewerByEmail(db: D1Database, email: string) {
  return db
    .prepare(
      `SELECT id, email, password_hash FROM accounts
       WHERE role = 'viewer' AND email = ?`,
    )
    .bind(email)
    .first<ViewerAccountRow>()
}

export async function createViewerWithSession(
  db: D1Database,
  input: {
    accountId: string
    email: string
    passwordHash: string
    sessionId: string
    tokenHash: string
    expiresAt: number
    now: number
    anonymousTokenHash?: string | null
  },
) {
  const results = await db.batch([
    db
      .prepare(
        `DELETE FROM sessions WHERE id IN (
         SELECT id FROM sessions WHERE expires_at <= ? LIMIT 100
       )`,
      )
      .bind(input.now),
    db
      .prepare(
        `INSERT OR IGNORE INTO accounts
         (id, role, email, password_hash, created_at)
         VALUES (?, 'viewer', ?, ?, ?)`,
      )
      .bind(input.accountId, input.email, input.passwordHash, input.now),
    db
      .prepare(
        `INSERT INTO sessions
         (id, token_hash, account_id, expires_at, created_at)
         SELECT ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM accounts WHERE id = ? AND role = 'viewer'
         )`,
      )
      .bind(
        input.sessionId,
        input.tokenHash,
        input.accountId,
        input.expiresAt,
        input.now,
        input.accountId,
      ),
    ...(input.anonymousTokenHash
      ? anonymousTransferStatements(db, {
          tokenHash: input.anonymousTokenHash,
          accountId: input.accountId,
          now: input.now,
        })
      : []),
  ])
  return results[1]!.meta.changes === 1 && results[2]!.meta.changes === 1
}

export async function createViewerSessionWithTransfer(
  db: D1Database,
  input: {
    id: string
    tokenHash: string
    accountId: string
    expiresAt: number
    now: number
    anonymousTokenHash?: string | null
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
    ...(input.anonymousTokenHash
      ? anonymousTransferStatements(db, {
          tokenHash: input.anonymousTokenHash,
          accountId: input.accountId,
          now: input.now,
        })
      : []),
  ])
}

export function findSessionAccount(
  db: D1Database,
  tokenHash: string,
  now: number,
) {
  return db
    .prepare(
      `SELECT sessions.account_id, accounts.role
       FROM sessions
       JOIN accounts ON accounts.id = sessions.account_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first<{ account_id: string; role: 'admin' | 'viewer' }>()
}

export async function listViewerLibraryRows(
  db: D1Database,
  accountId: string,
  nowIso: string,
): Promise<ViewerLibraryRow[]> {
  // Filter here to minimize disclosure and recheck at the response boundary so
  // a future query change cannot accidentally weaken the availability contract.
  const rows = await db
    .prepare(
      `SELECT videos.public_id, videos.title, videos.description,
              videos.status, videos.starts_at, videos.ends_at
       FROM entitlements
       JOIN videos ON videos.id = entitlements.video_id
       WHERE entitlements.account_id = ?
         AND videos.status = 'published'
         AND videos.starts_at <= ?
         AND videos.ends_at > ?
       ORDER BY entitlements.granted_at DESC, videos.id DESC`,
    )
    .bind(accountId, nowIso, nowIso)
    .all<{
      public_id: string
      title: string
      description: string
      status: 'draft' | 'published'
      starts_at: string
      ends_at: string
    }>()
  return rows.results.map((row) => ({
    publicId: row.public_id,
    title: row.title,
    description: row.description,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }))
}
