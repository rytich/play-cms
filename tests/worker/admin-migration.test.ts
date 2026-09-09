import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const oldMigration = () =>
  env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0001_'))!
const bulkMigration = () =>
  env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0002_'))

async function prepareOldDatabase(db: D1Database) {
  await applyD1Migrations(db, [oldMigration()])
  await db.batch([
    db.prepare(
      `INSERT INTO videos
       (id, public_id, filma_file_id, title, description, status,
        starts_at, ends_at, created_at, updated_at)
       VALUES ('video-a', 'public-a', '1', 'A', 'description', 'draft',
               '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z', 10, 11)`,
    ),
    db.prepare(
      `INSERT INTO access_codes (id, video_id, code_hash, created_at, revoked_at)
       VALUES ('code-a', 'video-a', 'hash-a', 12, NULL),
              ('code-b', 'video-a', 'hash-b', 13, 14)`,
    ),
  ])
}

describe('admin bulk migration', () => {
  it('preserves old rows and constraints while adding published and enabled state', async () => {
    await prepareOldDatabase(env.OLD_DATABASE)
    const migration = bulkMigration()
    expect(migration).toBeDefined()
    await applyD1Migrations(env.OLD_DATABASE, [migration!])

    expect(
      await env.OLD_DATABASE.prepare(
        `SELECT id, public_id, filma_file_id, title, description, status,
                starts_at, ends_at, created_at, updated_at FROM videos`,
      ).all(),
    ).toMatchObject({
      results: [
        {
          id: 'video-a',
          public_id: 'public-a',
          filma_file_id: '1',
          title: 'A',
          description: 'description',
          status: 'draft',
          created_at: 10,
          updated_at: 11,
        },
      ],
    })
    expect(
      await env.OLD_DATABASE.prepare(
        'SELECT id, video_id, code_hash, created_at, revoked_at, is_enabled FROM access_codes ORDER BY id',
      ).all(),
    ).toMatchObject({
      results: [
        {
          id: 'code-a',
          video_id: 'video-a',
          code_hash: 'hash-a',
          created_at: 12,
          revoked_at: null,
          is_enabled: 1,
        },
        {
          id: 'code-b',
          video_id: 'video-a',
          code_hash: 'hash-b',
          created_at: 13,
          revoked_at: 14,
          is_enabled: 1,
        },
      ],
    })

    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO videos
         (id, public_id, filma_file_id, title, description, status, starts_at, ends_at, created_at, updated_at)
         VALUES ('video-b','public-b','2','B','','published','2026-09-09T00:00:00.000Z','2026-09-10T00:00:00.000Z',20,20)`,
      ).run(),
    ).resolves.toBeDefined()
    await expect(
      env.OLD_DATABASE.prepare(
        'UPDATE access_codes SET is_enabled = 2 WHERE id = ?',
      )
        .bind('code-a')
        .run(),
    ).rejects.toThrow()
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO access_codes (id, video_id, code_hash, created_at) VALUES ('code-c','missing','hash-c',1)`,
      ).run(),
    ).rejects.toThrow()
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO access_codes (id, video_id, code_hash, created_at) VALUES ('code-c','video-a','hash-a',1)`,
      ).run(),
    ).rejects.toThrow()

    const indexes = await env.OLD_DATABASE.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name IN
       ('videos_created','access_codes_video_created') ORDER BY name`,
    ).all<{ name: string }>()
    expect(indexes.results.map((row) => row.name)).toEqual([
      'access_codes_video_created',
      'videos_created',
    ])
  })

  it('rolls back a deliberately failing migration and retains the old schema and data', async () => {
    await prepareOldDatabase(env.ROLLBACK_DATABASE)
    const migration = bulkMigration()
    expect(migration).toBeDefined()
    await expect(
      applyD1Migrations(env.ROLLBACK_DATABASE, [
        {
          name: '0002_deliberately_failing.sql',
          queries: [
            ...migration!.queries,
            'INSERT INTO missing_table VALUES (1)',
          ],
        },
      ]),
    ).rejects.toThrow()

    expect(
      await env.ROLLBACK_DATABASE.prepare(
        'SELECT id, status FROM videos',
      ).all(),
    ).toMatchObject({ results: [{ id: 'video-a', status: 'draft' }] })
    const columns = await env.ROLLBACK_DATABASE.prepare(
      `SELECT name FROM pragma_table_info('access_codes') ORDER BY cid`,
    ).all<{ name: string }>()
    expect(columns.results.map((row) => row.name)).toEqual([
      'id',
      'video_id',
      'code_hash',
      'created_at',
      'revoked_at',
    ])
  })
})
