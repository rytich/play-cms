import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { app } from '../../src/server/app'
import {
  encryptSecret,
  hashPassword,
  sha256Hex,
} from '../../src/adapters/secrets/web-crypto'

const origin = 'http://localhost'
const jsonHeaders = { 'Content-Type': 'application/json', Origin: origin }
const encryptionKey = '12'.repeat(32)
const code = '0123-4567-89AB-CDEF'
const normalizedCode = '0123456789ABCDEF'
const codeId = '00000000-0000-4000-8000-000000000009'

async function resetDatabase() {
  await env.DATABASE.batch([
    env.DATABASE.prepare('DELETE FROM redemptions'),
    env.DATABASE.prepare('DELETE FROM anonymous_play_sessions'),
    env.DATABASE.prepare('DELETE FROM entitlements'),
    env.DATABASE.prepare('DELETE FROM rate_limits'),
    env.DATABASE.prepare('DELETE FROM access_codes'),
    env.DATABASE.prepare('DELETE FROM videos'),
    env.DATABASE.prepare('DELETE FROM sessions'),
    env.DATABASE.prepare('DELETE FROM accounts'),
    env.DATABASE.prepare(
      `UPDATE app_settings
       SET filma_api_key_ciphertext = NULL, filma_api_key_nonce = NULL,
           filma_verified_at = NULL WHERE id = 1`,
    ),
  ])
  vi.unstubAllGlobals()
}

async function seedAvailableVideo(codeValue = normalizedCode) {
  const encrypted = await encryptSecret(encryptionKey, 'synthetic-filma-key')
  await env.DATABASE.batch([
    env.DATABASE.prepare(
      `UPDATE app_settings
       SET filma_api_key_ciphertext = ?, filma_api_key_nonce = ?,
           filma_verified_at = 1 WHERE id = 1`,
    ).bind(encrypted.ciphertext, encrypted.nonce),
    env.DATABASE.prepare(
      `INSERT INTO videos
       (id, public_id, filma_file_id, title, description, status,
        starts_at, ends_at, created_at, updated_at)
       VALUES ('video-a', 'public-a', '123', 'Visible title', 'Visible description',
               'published', '2020-01-01T00:00:00.000Z',
               '2100-01-01T00:00:00.000Z', 1, 1)`,
    ),
    env.DATABASE.prepare(
      `INSERT INTO access_codes
       (id, video_id, code_hash, created_at, revoked_at, is_enabled)
       VALUES (?, 'video-a', ?, 1, NULL, 1)`,
    ).bind(codeId, await sha256Hex(codeValue)),
  ])
}

async function seedSession(role: 'admin' | 'viewer', id: string) {
  const token = `${role === 'admin' ? 'c' : 'd'}`.repeat(64)
  await env.DATABASE.batch([
    env.DATABASE.prepare(
      `INSERT INTO accounts (id, role, email, password_hash, created_at)
       VALUES (?, ?, ?, 'unused', 1)`,
    ).bind(id, role, `${id}@example.test`),
    env.DATABASE.prepare(
      `INSERT INTO sessions (id, account_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, 4102444800, 1)`,
    ).bind(`session-${id}`, id, await sha256Hex(token)),
  ])
  return `play_session=${token}`
}

function grantResponse() {
  const expiresAt = new Date(Date.now() + 60_000).toISOString()
  const payload = btoa(
    JSON.stringify({
      exp: Math.floor(Date.parse(expiresAt) / 1_000),
      mediafile_id: 42,
    }),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return Response.json({
    url: `https://filma.biz/player/synthetic?jwt=e30.${payload}.signature`,
    mediafile_id: 42,
  })
}

function grantFetch() {
  return vi.fn(() => Promise.resolve(grantResponse()))
}

function request(
  path: string,
  init?: RequestInit,
  overrides: Record<string, unknown> = {},
) {
  return app.fetch(new Request(`${origin}${path}`, init), {
    ...env,
    PLAY_ENCRYPTION_KEY: encryptionKey,
    PLAY_CMS_P0_INVITE_PLAYBACK: 'true',
    PLAY_CMS_P0_FILMA_FILE_ID: '123',
    ...overrides,
  })
}

async function redeem(cookie?: string) {
  return request('/api/public/videos/public-a/redeem', {
    method: 'POST',
    headers: { ...jsonHeaders, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ code }),
  })
}

function responseCookie(response: Response, name: string) {
  const value = response.headers.get('Set-Cookie')
  expect(value).toContain(`${name}=`)
  return value!.split(';', 1)[0]!
}

describe('one-time viewing flow', () => {
  beforeEach(resetDatabase)

  it('stores a verified Filma key encrypted and returns only connection status', async () => {
    const token = 'c'.repeat(64)
    await env.DATABASE.batch([
      env.DATABASE.prepare(
        `INSERT INTO accounts (id, role, email, password_hash, created_at)
         VALUES ('admin-a', 'admin', 'admin@example.test', 'unused', 1)`,
      ),
      env.DATABASE.prepare(
        `INSERT INTO sessions (id, account_id, token_hash, expires_at, created_at)
         VALUES ('session-a', 'admin-a', ?, 4102444800, 1)`,
      ).bind(await sha256Hex(token)),
    ])
    const headers = { Cookie: `play_session=${token}`, Origin: origin }
    const empty = await request('/api/admin/filma', { headers })
    expect(await empty.json()).toEqual({ configured: false, verifiedAt: null })

    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({
          organization_id: 42,
          api_type: 'readonly',
          token: 'synthetic-jwt',
        }),
      ),
    )
    const saved = await request('/api/admin/filma', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'synthetic-filma-key' }),
    })
    expect(saved.status).toBe(200)
    const responseBody = await saved.text()
    expect(JSON.parse(responseBody)).toMatchObject({ configured: true })
    expect(responseBody).not.toContain('synthetic-filma-key')
    const stored = await env.DATABASE.prepare(
      `SELECT filma_api_key_ciphertext, filma_api_key_nonce, filma_verified_at
       FROM app_settings WHERE id = 1`,
    ).first<Record<string, unknown>>()
    expect(stored?.filma_api_key_ciphertext).not.toBe('synthetic-filma-key')
    expect(stored?.filma_api_key_nonce).toEqual(expect.any(String))
    expect(stored?.filma_verified_at).toEqual(expect.any(Number))
  })

  it('fails closed when the stored Filma key cannot be decrypted', async () => {
    const cookie = await seedSession('admin', 'admin-filma-status')
    const encrypted = await encryptSecret(encryptionKey, 'synthetic-filma-key')
    await env.DATABASE.prepare(
      `UPDATE app_settings
       SET filma_api_key_ciphertext = ?, filma_api_key_nonce = ?,
           filma_verified_at = 1 WHERE id = 1`,
    )
      .bind(encrypted.ciphertext, encrypted.nonce)
      .run()
    const headers = { Cookie: cookie, Origin: origin }
    const external = vi.fn()
    vi.stubGlobal('fetch', external)

    const valid = await request('/api/admin/filma', { headers })
    expect(valid.status).toBe(200)
    expect(await valid.text()).toBe(
      '{"configured":true,"verifiedAt":"1970-01-01T00:00:01.000Z"}',
    )

    const corruptedCiphertext = `${encrypted.ciphertext.slice(0, -2)}${
      encrypted.ciphertext.endsWith('00') ? '01' : '00'
    }`
    await env.DATABASE.prepare(
      `UPDATE app_settings SET filma_api_key_ciphertext = ? WHERE id = 1`,
    )
      .bind(corruptedCiphertext)
      .run()
    const corrupted = await request('/api/admin/filma', { headers })
    expect(corrupted.status).toBe(200)
    const corruptedBody = await corrupted.text()
    expect(corruptedBody).toBe('{"configured":false,"verifiedAt":null}')
    expect(corruptedBody).not.toMatch(
      /ciphertext|nonce|plaintext|error|synthetic/i,
    )

    await env.DATABASE.prepare(
      `UPDATE app_settings SET filma_api_key_ciphertext = ? WHERE id = 1`,
    )
      .bind(encrypted.ciphertext)
      .run()
    const rotated = await request(
      '/api/admin/filma',
      { headers },
      { PLAY_ENCRYPTION_KEY: '34'.repeat(32) },
    )
    expect(rotated.status).toBe(200)
    const rotatedBody = await rotated.text()
    expect(rotatedBody).toBe('{"configured":false,"verifiedAt":null}')
    expect(rotatedBody).not.toMatch(
      /ciphertext|nonce|plaintext|error|synthetic/i,
    )
    expect(external).not.toHaveBeenCalled()
  })

  it('does not call Filma or consume a code while invite playback is disabled or mismatched', async () => {
    await seedAvailableVideo()
    const external = grantFetch()
    vi.stubGlobal('fetch', external)
    for (const overrides of [
      { PLAY_CMS_P0_INVITE_PLAYBACK: undefined },
      { PLAY_CMS_P0_INVITE_PLAYBACK: 'false' },
      { PLAY_CMS_P0_FILMA_FILE_ID: '999' },
    ]) {
      const response = await request(
        '/api/public/videos/public-a/redeem',
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ code }),
        },
        overrides,
      )
      expect(response.status).toBe(503)
    }
    expect(external).not.toHaveBeenCalled()
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM redemptions',
      ).first(),
    ).toEqual({ count: 0 })
  })

  it('consumes one code once for an anonymous browser and permits only its session', async () => {
    await seedAvailableVideo()
    vi.stubGlobal('fetch', grantFetch())
    const first = await redeem()
    expect(first.status).toBe(200)
    const firstBody = await first.json<{
      anonymous: boolean
      video: { publicId: string; title: string }
      playback: { url: string }
    }>()
    expect(firstBody).toMatchObject({
      anonymous: true,
      video: { publicId: 'public-a', title: 'Visible title' },
    })
    expect(firstBody.playback.url).toMatch(
      /^https:\/\/filma\.biz\/player\/synthetic\?jwt=/,
    )
    expect(first.headers.get('Set-Cookie')).toMatch(
      /^play_anonymous=[0-9a-f]{64}; Max-Age=1800; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    )
    const anonymousCookie = responseCookie(first, 'play_anonymous')

    const playback = await request('/api/public/videos/public-a/playback', {
      headers: { Cookie: anonymousCookie },
    })
    expect(playback.status).toBe(200)
    expect(await playback.json()).toMatchObject({ anonymous: true })
    expect((await request('/api/public/videos/public-a/playback')).status).toBe(
      401,
    )
    expect((await redeem()).status).toBe(404)
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM redemptions',
      ).first(),
    ).toEqual({ count: 1 })
  })

  it('allows only one of two concurrent redemptions and leaves no orphan session', async () => {
    await seedAvailableVideo()
    vi.stubGlobal('fetch', grantFetch())
    const responses = await Promise.all([redeem(), redeem()])
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 404,
    ])
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM redemptions',
      ).first(),
    ).toEqual({ count: 1 })
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM anonymous_play_sessions',
      ).first(),
    ).toEqual({ count: 1 })
  })

  it('keeps the code unused when the Filma grant fails', async () => {
    await seedAvailableVideo()
    vi.stubGlobal('fetch', () => Promise.reject(new Error('synthetic failure')))
    expect((await redeem()).status).toBe(503)
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM redemptions',
      ).first(),
    ).toEqual({ count: 0 })
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM anonymous_play_sessions',
      ).first(),
    ).toEqual({ count: 0 })
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM entitlements',
      ).first(),
    ).toEqual({ count: 0 })
    expect(
      await env.DATABASE.prepare(
        `SELECT revoked_at, is_enabled,
                EXISTS(SELECT 1 FROM redemptions WHERE code_id = access_codes.id) AS used
         FROM access_codes WHERE id = ?`,
      )
        .bind(codeId)
        .first(),
    ).toEqual({ revoked_at: null, is_enabled: 1, used: 0 })
  })

  it('does not consume when the Filma file binding changes during grant issuance', async () => {
    for (const role of ['anonymous', 'viewer'] as const) {
      await resetDatabase()
      await seedAvailableVideo()
      const viewerCookie =
        role === 'viewer'
          ? await seedSession('viewer', 'viewer-filma-race')
          : undefined
      const external = vi.fn(async () => {
        await env.DATABASE.prepare(
          `UPDATE videos SET filma_file_id = '999' WHERE id = 'video-a'`,
        ).run()
        return grantResponse()
      })
      vi.stubGlobal('fetch', external)

      const response = await redeem(viewerCookie)
      expect(response.status).toBe(503)
      expect(external).toHaveBeenCalledTimes(1)
      expect(
        await env.DATABASE.prepare(
          'SELECT COUNT(*) AS count FROM redemptions',
        ).first(),
      ).toEqual({ count: 0 })
      expect(
        await env.DATABASE.prepare(
          'SELECT COUNT(*) AS count FROM entitlements',
        ).first(),
      ).toEqual({ count: 0 })
      expect(
        await env.DATABASE.prepare(
          'SELECT COUNT(*) AS count FROM anonymous_play_sessions',
        ).first(),
      ).toEqual({ count: 0 })
      expect(
        await env.DATABASE.prepare(
          `SELECT revoked_at, is_enabled,
                  EXISTS(SELECT 1 FROM redemptions WHERE code_id = access_codes.id) AS used
           FROM access_codes WHERE id = ?`,
        )
          .bind(codeId)
          .first(),
      ).toEqual({ revoked_at: null, is_enabled: 1, used: 0 })
    }
  })

  it('transfers an anonymous redemption during registration and supports library playback', async () => {
    await seedAvailableVideo()
    vi.stubGlobal('fetch', grantFetch())
    const redeemed = await redeem()
    const anonymousCookie = responseCookie(redeemed, 'play_anonymous')
    const registered = await request('/api/viewer/register', {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: anonymousCookie },
      body: JSON.stringify({
        email: 'viewer@example.test',
        password: 'viewer password long enough',
      }),
    })
    expect(registered.status).toBe(201)
    expect(registered.headers.get('Set-Cookie')).toContain(
      'play_anonymous=; Max-Age=0',
    )
    const viewerCookie = responseCookie(registered, 'play_session')
    const transferred = await env.DATABASE.prepare(
      `SELECT redemptions.anonymous_session_id, redemptions.account_id,
                entitlements.video_id
         FROM redemptions
         JOIN entitlements ON entitlements.account_id = redemptions.account_id`,
    ).first<{
      anonymous_session_id: string | null
      account_id: string
      video_id: string
    }>()
    expect(transferred?.anonymous_session_id).toBeNull()
    expect(typeof transferred?.account_id).toBe('string')
    expect(transferred?.video_id).toBe('video-a')
    expect(
      (
        await request('/api/viewer/library', {
          headers: { Cookie: viewerCookie },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await request('/api/viewer/videos/public-a/playback', {
          headers: { Cookie: viewerCookie },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await request('/api/public/videos/public-a/playback', {
          headers: { Cookie: anonymousCookie },
        })
      ).status,
    ).toBe(401)
  })

  it('returns 409 and preserves an anonymous right when registration email already exists', async () => {
    await seedAvailableVideo()
    await env.DATABASE.prepare(
      `INSERT INTO accounts (id, role, email, password_hash, created_at)
       VALUES ('existing-viewer', 'viewer', 'existing@example.test', 'unused', 1)`,
    ).run()
    vi.stubGlobal('fetch', grantFetch())
    const redeemed = await redeem()
    const anonymousCookie = responseCookie(redeemed, 'play_anonymous')
    const registered = await request('/api/viewer/register', {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: anonymousCookie },
      body: JSON.stringify({
        email: 'existing@example.test',
        password: 'viewer password long enough',
      }),
    })

    expect(registered.status).toBe(409)
    expect(
      await env.DATABASE.prepare(
        `SELECT redemptions.account_id, anonymous_play_sessions.expires_at > ? AS active
         FROM redemptions
         JOIN anonymous_play_sessions
           ON anonymous_play_sessions.id = redemptions.anonymous_session_id`,
      )
        .bind(Math.floor(Date.now() / 1_000))
        .first(),
    ).toEqual({ account_id: null, active: 1 })
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM entitlements',
      ).first(),
    ).toEqual({ count: 0 })
  })

  it('redeems directly into an authenticated viewer entitlement', async () => {
    await seedAvailableVideo()
    const viewerCookie = await seedSession('viewer', 'viewer-direct')
    vi.stubGlobal('fetch', grantFetch())
    const redeemed = await redeem(viewerCookie)
    expect(redeemed.status).toBe(200)
    expect(await redeemed.json()).toMatchObject({ anonymous: false })
    expect(redeemed.headers.get('Set-Cookie')).toBeNull()
    expect(
      await env.DATABASE.prepare(
        `SELECT redemptions.account_id, entitlements.account_id
         FROM redemptions
         JOIN entitlements ON entitlements.source_code_id = redemptions.code_id`,
      ).first(),
    ).toEqual({ account_id: 'viewer-direct' })
  })

  it('transfers an anonymous redemption during login without duplicating entitlement', async () => {
    await seedAvailableVideo()
    const password = 'viewer password long enough'
    const passwordHash = await hashPassword(password)
    await env.DATABASE.prepare(
      `INSERT INTO accounts (id, role, email, password_hash, created_at)
       VALUES ('viewer-a', 'viewer', 'viewer@example.test', ?, 1)`,
    )
      .bind(passwordHash)
      .run()
    vi.stubGlobal('fetch', grantFetch())
    const redeemed = await redeem()
    const anonymousCookie = responseCookie(redeemed, 'play_anonymous')
    const login = await request('/api/viewer/login', {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: anonymousCookie },
      body: JSON.stringify({ email: 'viewer@example.test', password }),
    })
    expect(login.status).toBe(200)
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM entitlements',
      ).first(),
    ).toEqual({ count: 1 })
    expect(
      await env.DATABASE.prepare(
        `SELECT account_id, anonymous_session_id FROM redemptions WHERE code_id = ?`,
      )
        .bind(codeId)
        .first(),
    ).toEqual({ account_id: 'viewer-a', anonymous_session_id: null })
    expect(
      await env.DATABASE.prepare(
        `SELECT expires_at <= ? AS expired
         FROM anonymous_play_sessions WHERE token_hash = ?`,
      )
        .bind(
          Math.floor(Date.now() / 1_000),
          await sha256Hex(anonymousCookie.split('=')[1]!),
        )
        .first(),
    ).toEqual({ expired: 1 })

    const repeated = await request('/api/viewer/login', {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: anonymousCookie },
      body: JSON.stringify({ email: 'viewer@example.test', password }),
    })
    expect(repeated.status).toBe(200)
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM entitlements',
      ).first(),
    ).toEqual({ count: 1 })
  })

  it('does not transfer a redemption after its anonymous session expires', async () => {
    await seedAvailableVideo()
    vi.stubGlobal('fetch', grantFetch())
    const redeemed = await redeem()
    const anonymousCookie = responseCookie(redeemed, 'play_anonymous')
    await env.DATABASE.prepare(
      'UPDATE anonymous_play_sessions SET expires_at = 1',
    ).run()
    const registered = await request('/api/viewer/register', {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: anonymousCookie },
      body: JSON.stringify({
        email: 'expired@example.test',
        password: 'viewer password long enough',
      }),
    })
    expect(registered.status).toBe(201)
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM entitlements',
      ).first(),
    ).toEqual({ count: 0 })
    const retained = await env.DATABASE.prepare(
      `SELECT anonymous_session_id, account_id FROM redemptions`,
    ).first<{ anonymous_session_id: string; account_id: string | null }>()
    expect(typeof retained?.anonymous_session_id).toBe('string')
    expect(retained?.account_id).toBeNull()
  })

  it('returns 404 without metadata at every unavailable boundary', async () => {
    const viewerCookie = await seedSession('viewer', 'viewer-boundary')
    const anonymousToken = 'e'.repeat(64)
    const anonymousCookie = `play_anonymous=${anonymousToken}`
    const now = Math.floor(Date.now() / 1_000)
    await env.DATABASE.prepare(
      `INSERT INTO anonymous_play_sessions
         (id, token_hash, expires_at, created_at)
       VALUES ('anonymous-boundary', ?, ?, ?)`,
    )
      .bind(await sha256Hex(anonymousToken), now + 3_600, now)
      .run()
    for (const [suffix, status, startsAt, endsAt, codeValue] of [
      [
        'draft',
        'draft',
        '2020-01-01T00:00:00.000Z',
        '2100-01-01T00:00:00.000Z',
        '0000000000000001',
      ],
      [
        'future',
        'published',
        '2099-01-01T00:00:00.000Z',
        '2100-01-01T00:00:00.000Z',
        '0000000000000002',
      ],
      [
        'expired',
        'published',
        '2020-01-01T00:00:00.000Z',
        '2021-01-01T00:00:00.000Z',
        '0000000000000003',
      ],
      [
        'exact-end',
        'published',
        '2020-01-01T00:00:00.000Z',
        new Date(now * 1_000).toISOString(),
        '0000000000000004',
      ],
    ] as const) {
      await env.DATABASE.batch([
        env.DATABASE.prepare(
          `INSERT INTO videos
           (id, public_id, filma_file_id, title, description, status,
            starts_at, ends_at, created_at, updated_at)
           VALUES (?, ?, '123', ?, ?, ?, ?, ?, 1, 1)`,
        ).bind(
          `video-${suffix}`,
          `public-${suffix}`,
          `secret-${suffix}`,
          'private',
          status,
          startsAt,
          endsAt,
        ),
        env.DATABASE.prepare(
          `INSERT INTO access_codes
           (id, video_id, code_hash, created_at, revoked_at, is_enabled)
           VALUES (?, ?, ?, 1, NULL, 1)`,
        ).bind(`code-${suffix}`, `video-${suffix}`, await sha256Hex(codeValue)),
        env.DATABASE.prepare(
          `INSERT INTO redemptions
             (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
           VALUES (?, ?, 'anonymous-boundary', NULL, ?)`,
        ).bind(`code-${suffix}`, `video-${suffix}`, now),
        env.DATABASE.prepare(
          `INSERT INTO entitlements
             (account_id, video_id, source_code_id, granted_at)
           VALUES ('viewer-boundary', ?, ?, ?)`,
        ).bind(`video-${suffix}`, `code-${suffix}`, now),
      ])
      const publicPage = await request(`/v/public-${suffix}`, undefined, {
        ASSETS: {
          fetch: () =>
            Promise.resolve(
              new Response('<!doctype html><title>viewer</title>', {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              }),
            ),
        },
      })
      expect(publicPage.status).toBe(200)
      expect(await publicPage.text()).not.toContain(`secret-${suffix}`)
      const response = await request(
        `/api/public/videos/public-${suffix}/redeem`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ code: codeValue }),
        },
      )
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('{"error":"not_found"}')
      const anonymousPlayback = await request(
        `/api/public/videos/public-${suffix}/playback`,
        { headers: { Cookie: anonymousCookie } },
      )
      expect(anonymousPlayback.status).toBe(404)
      expect(await anonymousPlayback.text()).toBe('{"error":"not_found"}')
      const viewerPlayback = await request(
        `/api/viewer/videos/public-${suffix}/playback`,
        { headers: { Cookie: viewerCookie } },
      )
      expect(viewerPlayback.status).toBe(404)
      expect(await viewerPlayback.text()).toBe('{"error":"not_found"}')
    }
    const library = await request('/api/viewer/library', {
      headers: { Cookie: viewerCookie },
    })
    expect(await library.json()).toEqual({ videos: [] })
    expect((await request('/api/public/videos/unknown/playback')).status).toBe(
      401,
    )
    expect(
      (
        await request('/api/public/videos/unknown/playback', {
          headers: { Cookie: anonymousCookie },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await request('/api/viewer/videos/unknown/playback', {
          headers: { Cookie: viewerCookie },
        })
      ).status,
    ).toBe(404)
  })

  it('keeps an unknown public ID generic and rejects redemption without writes or Filma', async () => {
    await seedAvailableVideo()
    const external = grantFetch()
    vi.stubGlobal('fetch', external)
    const genericShell = '<!doctype html><title>viewer</title>'
    const publicPage = await request('/v/unknown', undefined, {
      ASSETS: {
        fetch: () =>
          Promise.resolve(
            new Response(genericShell, {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }),
          ),
      },
    })
    expect(publicPage.status).toBe(200)
    expect(await publicPage.text()).toBe(genericShell)

    const redeemed = await request('/api/public/videos/unknown/redeem', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ code }),
    })
    expect(redeemed.status).toBe(404)
    expect(await redeemed.text()).toBe('{"error":"not_found"}')
    expect(external).not.toHaveBeenCalled()
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM redemptions',
      ).first(),
    ).toEqual({ count: 0 })
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM entitlements',
      ).first(),
    ).toEqual({ count: 0 })
    expect(
      await env.DATABASE.prepare(
        `SELECT revoked_at, is_enabled,
                EXISTS(SELECT 1 FROM redemptions WHERE code_id = access_codes.id) AS used
         FROM access_codes WHERE id = ?`,
      )
        .bind(codeId)
        .first(),
    ).toEqual({ revoked_at: null, is_enabled: 1, used: 0 })
  })

  it('allows only one winner when redemption races admin bulk and revoke', async () => {
    for (const mutation of ['bulk', 'revoke'] as const) {
      await resetDatabase()
      await seedAvailableVideo()
      const adminCookie = await seedSession('admin', `admin-${mutation}`)
      vi.stubGlobal('fetch', grantFetch())
      const adminInit: RequestInit = {
        method: 'POST',
        headers: { ...jsonHeaders, Cookie: adminCookie },
        body:
          mutation === 'bulk'
            ? JSON.stringify({ ids: [codeId], enabled: false })
            : '{}',
      }
      const adminPath =
        mutation === 'bulk'
          ? '/api/admin/videos/video-a/codes/bulk-status'
          : `/api/admin/videos/video-a/codes/${codeId}/revoke`
      const [redeemResponse, adminResponse] = await Promise.all([
        redeem(),
        request(adminPath, adminInit),
      ])
      expect([
        [200, 409],
        [404, 200],
      ]).toContainEqual([redeemResponse.status, adminResponse.status])
      const redeemed = await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM redemptions',
      ).first<{ count: number }>()
      const changed = await env.DATABASE.prepare(
        'SELECT revoked_at, is_enabled FROM access_codes WHERE id = ?',
      )
        .bind(codeId)
        .first<{ revoked_at: number | null; is_enabled: number }>()
      expect(
        redeemed?.count === 1
          ? changed?.revoked_at === null && changed.is_enabled === 1
          : mutation === 'bulk'
            ? changed?.is_enabled === 0
            : changed?.revoked_at !== null,
      ).toBe(true)
    }
  })
})
