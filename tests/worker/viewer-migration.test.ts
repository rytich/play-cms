import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const migration = (prefix: string) =>
  env.TEST_MIGRATIONS.find((item) => item.name.startsWith(prefix))!

async function prepareBulkSchema(db: D1Database) {
  await applyD1Migrations(db, [migration('0001_'), migration('0002_')])
  await db.batch([
    db.prepare(
      `INSERT INTO accounts (id, role, email, password_hash, created_at)
       VALUES ('admin-a', 'admin', 'admin@example.test', 'hash-a', 1)`,
    ),
    db.prepare(
      `INSERT INTO sessions (id, token_hash, account_id, expires_at, created_at)
       VALUES ('session-a', 'token-a', 'admin-a', 100, 2)`,
    ),
    db.prepare(
      `INSERT INTO videos
       (id, public_id, filma_file_id, title, description, status,
        starts_at, ends_at, created_at, updated_at)
       VALUES ('video-a', 'public-a', '1', 'A', '', 'published',
               '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z', 3, 3)`,
    ),
    db.prepare(
      `INSERT INTO access_codes
       (id, video_id, code_hash, created_at, revoked_at, is_enabled)
       VALUES ('code-a', 'video-a', 'code-hash-a', 4, NULL, 1)`,
    ),
  ])
}

describe('viewer accounts and entitlements migration', () => {
  it('preserves the admin and session while adding viewer roles and unique entitlements', async () => {
    await prepareBulkSchema(env.OLD_DATABASE)
    const viewerMigration = migration('0003_')
    expect(viewerMigration).toBeDefined()
    await applyD1Migrations(env.OLD_DATABASE, [viewerMigration])

    expect(
      await env.OLD_DATABASE.prepare(
        `SELECT accounts.id, accounts.role, accounts.email,
                sessions.id AS session_id, sessions.expires_at
         FROM accounts JOIN sessions ON sessions.account_id = accounts.id`,
      ).first(),
    ).toEqual({
      id: 'admin-a',
      role: 'admin',
      email: 'admin@example.test',
      session_id: 'session-a',
      expires_at: 100,
    })

    await env.OLD_DATABASE.prepare(
      `INSERT INTO accounts (id, role, email, password_hash, created_at)
       VALUES ('viewer-a', 'viewer', 'viewer@example.test', 'hash-v', 5)`,
    ).run()
    await env.OLD_DATABASE.prepare(
      `INSERT INTO entitlements
       (account_id, video_id, source_code_id, granted_at)
       VALUES ('viewer-a', 'video-a', 'code-a', 6)`,
    ).run()
    expect(
      await env.OLD_DATABASE.prepare(
        `SELECT account_id, video_id, source_code_id, granted_at
         FROM entitlements`,
      ).all(),
    ).toMatchObject({
      results: [
        {
          account_id: 'viewer-a',
          video_id: 'video-a',
          source_code_id: 'code-a',
          granted_at: 6,
        },
      ],
    })

    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO entitlements
         (account_id, video_id, source_code_id, granted_at)
         VALUES ('viewer-a', 'video-a', 'code-a', 7)`,
      ).run(),
    ).rejects.toThrow()

    await env.OLD_DATABASE.batch([
      env.OLD_DATABASE.prepare(
        `INSERT INTO videos
         (id, public_id, filma_file_id, title, description, status,
          starts_at, ends_at, created_at, updated_at)
         VALUES ('video-b', 'public-b', '2', 'B', '', 'published',
                 '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z', 8, 8)`,
      ),
      env.OLD_DATABASE.prepare(
        `INSERT INTO access_codes
         (id, video_id, code_hash, created_at, revoked_at, is_enabled)
         VALUES ('code-b', 'video-b', 'code-hash-b', 8, NULL, 1)`,
      ),
      env.OLD_DATABASE.prepare(
        `INSERT INTO accounts (id, role, email, password_hash, created_at)
         VALUES ('viewer-b', 'viewer', 'viewer-b@example.test', 'hash-v-b', 9)`,
      ),
    ])
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO entitlements
         (account_id, video_id, source_code_id, granted_at)
         VALUES ('viewer-b', 'video-a', 'code-b', 9)`,
      ).run(),
    ).rejects.toThrow()
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO entitlements
         (account_id, video_id, source_code_id, granted_at)
         VALUES ('viewer-b', 'video-b', 'code-b', 10)`,
      ).run(),
    ).resolves.toMatchObject({ success: true })
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO accounts (id, role, email, password_hash, created_at)
         VALUES ('admin-b', 'admin', 'other-admin@example.test', 'hash', 8)`,
      ).run(),
    ).rejects.toThrow()
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO accounts (id, role, email, password_hash, created_at)
         VALUES ('viewer-b', 'viewer', 'viewer@example.test', 'hash', 8)`,
      ).run(),
    ).rejects.toThrow()
  })

  it('rolls back a failed viewer migration with the old rows and schema intact', async () => {
    await prepareBulkSchema(env.ROLLBACK_DATABASE)
    const viewerMigration = migration('0003_')
    expect(viewerMigration).toBeDefined()
    await expect(
      applyD1Migrations(env.ROLLBACK_DATABASE, [
        {
          name: '0003_deliberately_failing.sql',
          queries: [
            ...viewerMigration.queries,
            'INSERT INTO missing_table VALUES (1)',
          ],
        },
      ]),
    ).rejects.toThrow()

    expect(
      await env.ROLLBACK_DATABASE.prepare(
        'SELECT id, role, email FROM accounts',
      ).all(),
    ).toMatchObject({
      results: [{ id: 'admin-a', role: 'admin', email: 'admin@example.test' }],
    })
    expect(
      await env.ROLLBACK_DATABASE.prepare(
        'SELECT id, account_id FROM sessions',
      ).all(),
    ).toMatchObject({
      results: [{ id: 'session-a', account_id: 'admin-a' }],
    })
    await expect(
      env.ROLLBACK_DATABASE.prepare(
        `INSERT INTO accounts (id, role, email, password_hash, created_at)
         VALUES ('viewer-a', 'viewer', 'viewer@example.test', 'hash', 5)`,
      ).run(),
    ).rejects.toThrow()
    const entitlementTable = await env.ROLLBACK_DATABASE.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entitlements'`,
    ).first()
    expect(entitlementTable).toBeNull()
  })
})
