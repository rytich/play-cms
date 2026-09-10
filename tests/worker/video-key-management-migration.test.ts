import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const migration = (prefix: string) =>
  env.TEST_MIGRATIONS.find((item) => item.name.startsWith(prefix))!

async function preparePriorSchema(db: D1Database) {
  await applyD1Migrations(db, [
    migration('0001_'),
    migration('0002_'),
    migration('0003_'),
    migration('0004_'),
    migration('0005_'),
  ])
  await db.batch([
    db.prepare(
      `INSERT INTO accounts (id, role, email, password_hash, created_at)
       VALUES ('viewer-a', 'viewer', 'viewer@example.test', 'hash', 1)`,
    ),
    db.prepare(
      `INSERT INTO videos
       (id, public_id, filma_file_id, title, description, status,
        starts_at, ends_at, created_at, updated_at)
       VALUES ('video-a', 'public-a', '1', 'A', 'description', 'published',
               '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z', 2, 2)`,
    ),
    db.prepare(
      `INSERT INTO access_codes
       (id, video_id, code_hash, created_at, revoked_at, is_enabled)
       VALUES ('code-a', 'video-a', 'hash-a', 3, NULL, 1)`,
    ),
    db.prepare(
      `INSERT INTO anonymous_play_sessions
       (id, token_hash, expires_at, created_at)
       VALUES ('anonymous-a', 'token-a', 100, 3)`,
    ),
    db.prepare(
      `INSERT INTO redemptions
       (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
       VALUES ('code-a', 'video-a', 'anonymous-a', NULL, 4)`,
    ),
    db.prepare(
      `INSERT INTO entitlements
       (account_id, video_id, source_code_id, granted_at)
       VALUES ('viewer-a', 'video-a', 'code-a', 5)`,
    ),
  ])
}

describe('video and key management migration', () => {
  it('preserves videos, keys, redemptions, and entitlements while adding optional dates and encrypted key fields', async () => {
    await preparePriorSchema(env.OLD_DATABASE)
    const current = migration('0006_')
    expect(current).toBeDefined()
    await applyD1Migrations(env.OLD_DATABASE, [current])

    expect(
      await env.OLD_DATABASE.prepare(
        `SELECT videos.id, videos.starts_at, videos.ends_at,
                access_codes.id AS code_id,
                access_codes.code_ciphertext,
                access_codes.code_nonce,
                access_codes.replaced_by_code_id,
                redemptions.code_id AS redemption_id,
                entitlements.source_code_id
         FROM videos
         JOIN access_codes ON access_codes.video_id = videos.id
         JOIN redemptions ON redemptions.code_id = access_codes.id
         JOIN entitlements ON entitlements.source_code_id = access_codes.id`,
      ).first(),
    ).toEqual({
      id: 'video-a',
      starts_at: '2026-09-09T00:00:00.000Z',
      ends_at: '2026-09-10T00:00:00.000Z',
      code_id: 'code-a',
      code_ciphertext: null,
      code_nonce: null,
      replaced_by_code_id: null,
      redemption_id: 'code-a',
      source_code_id: 'code-a',
    })

    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO videos
         (id, public_id, filma_file_id, title, description, status,
          starts_at, ends_at, created_at, updated_at)
         VALUES ('video-open', 'public-open', '2', 'Open', '', 'draft',
                 NULL, NULL, 6, 6)`,
      ).run(),
    ).resolves.toMatchObject({ success: true })
    expect(
      await env.OLD_DATABASE.prepare('PRAGMA foreign_key_check').all(),
    ).toMatchObject({ results: [] })
  })

  it('rolls back a failed migration with the prior schema and relationships intact', async () => {
    await preparePriorSchema(env.ROLLBACK_DATABASE)
    const current = migration('0006_')
    expect(current).toBeDefined()
    await expect(
      applyD1Migrations(env.ROLLBACK_DATABASE, [
        {
          name: '0006_deliberately_failing.sql',
          queries: [...current.queries, 'INSERT INTO missing_table VALUES (1)'],
        },
      ]),
    ).rejects.toThrow()

    expect(
      await env.ROLLBACK_DATABASE.prepare(
        `SELECT videos.id, access_codes.id AS code_id,
                redemptions.code_id AS redemption_id,
                entitlements.source_code_id
         FROM videos
         JOIN access_codes ON access_codes.video_id = videos.id
         JOIN redemptions ON redemptions.code_id = access_codes.id
         JOIN entitlements ON entitlements.source_code_id = access_codes.id`,
      ).first(),
    ).toEqual({
      id: 'video-a',
      code_id: 'code-a',
      redemption_id: 'code-a',
      source_code_id: 'code-a',
    })
    const columns = await env.ROLLBACK_DATABASE.prepare(
      `SELECT name FROM pragma_table_info('access_codes') ORDER BY cid`,
    ).all<{ name: string }>()
    expect(columns.results.map((row) => row.name)).not.toContain(
      'code_ciphertext',
    )
  })
})
