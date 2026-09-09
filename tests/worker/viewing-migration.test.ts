import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const migration = (prefix: string) =>
  env.TEST_MIGRATIONS.find((item) => item.name.startsWith(prefix))!

describe('viewing flow migration', () => {
  it('preserves prior data and enforces one owner and matching code/video', async () => {
    await applyD1Migrations(env.OLD_DATABASE, [
      migration('0001_'),
      migration('0002_'),
      migration('0003_'),
    ])
    await env.OLD_DATABASE.batch([
      env.OLD_DATABASE.prepare(
        `INSERT INTO accounts (id, role, email, password_hash, created_at)
         VALUES ('admin-a', 'admin', 'admin@example.test', 'hash', 1),
                ('viewer-a', 'viewer', 'viewer@example.test', 'hash', 1)`,
      ),
      env.OLD_DATABASE.prepare(
        `INSERT INTO sessions (id, token_hash, account_id, expires_at, created_at)
         VALUES ('session-a', 'token-a', 'admin-a', 100, 1)`,
      ),
      env.OLD_DATABASE.prepare(
        `INSERT INTO videos
         (id, public_id, filma_file_id, title, description, status,
          starts_at, ends_at, created_at, updated_at)
         VALUES ('video-a', 'public-a', '123', 'A', '', 'published',
                 '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z', 1, 1),
                ('video-b', 'public-b', '456', 'B', '', 'published',
                 '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z', 1, 1)`,
      ),
      env.OLD_DATABASE.prepare(
        `INSERT INTO access_codes
         (id, video_id, code_hash, created_at, revoked_at, is_enabled)
         VALUES ('code-a', 'video-a', 'hash-a', 1, NULL, 1),
                ('code-b', 'video-b', 'hash-b', 1, NULL, 1)`,
      ),
      env.OLD_DATABASE.prepare(
        `INSERT INTO entitlements (account_id, video_id, source_code_id, granted_at)
         VALUES ('viewer-a', 'video-a', 'code-a', 1)`,
      ),
    ])

    await applyD1Migrations(env.OLD_DATABASE, [migration('0004_')])
    expect(
      await env.OLD_DATABASE.prepare(
        `SELECT accounts.role, sessions.id AS session_id, videos.public_id,
                access_codes.id AS code_id, entitlements.source_code_id
         FROM accounts
         JOIN sessions ON sessions.account_id = accounts.id
         JOIN videos ON videos.id = 'video-a'
         JOIN access_codes ON access_codes.video_id = videos.id
         JOIN entitlements ON entitlements.video_id = videos.id
         WHERE accounts.id = 'admin-a'`,
      ).first(),
    ).toMatchObject({
      role: 'admin',
      session_id: 'session-a',
      public_id: 'public-a',
      code_id: 'code-a',
      source_code_id: 'code-a',
    })

    await env.OLD_DATABASE.prepare(
      `INSERT INTO anonymous_play_sessions
       (id, token_hash, expires_at, created_at)
       VALUES ('anonymous-a', 'anonymous-hash-a', 200, 2)`,
    ).run()
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO redemptions
         (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
         VALUES ('code-b', 'video-a', 'anonymous-a', NULL, 2)`,
      ).run(),
    ).rejects.toThrow()
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO redemptions
         (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
         VALUES ('code-a', 'video-a', 'anonymous-a', 'viewer-a', 2)`,
      ).run(),
    ).rejects.toThrow()
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO redemptions
         (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
         VALUES ('code-a', 'video-a', 'anonymous-a', NULL, 2)`,
      ).run(),
    ).resolves.toMatchObject({ success: true })
    await expect(
      env.OLD_DATABASE.prepare(
        `INSERT INTO redemptions
         (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
         VALUES ('code-a', 'video-a', NULL, 'viewer-a', 3)`,
      ).run(),
    ).rejects.toThrow()

    expect(
      await env.OLD_DATABASE.prepare(
        `SELECT filma_api_key_ciphertext, filma_api_key_nonce, filma_verified_at
         FROM app_settings WHERE id = 1`,
      ).first(),
    ).toEqual({
      filma_api_key_ciphertext: null,
      filma_api_key_nonce: null,
      filma_verified_at: null,
    })
  })
})
