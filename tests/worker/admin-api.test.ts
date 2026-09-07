import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { app } from '../../src/server/app'

const bootstrapToken = 'a'.repeat(64)
const jsonHeaders = {
  'Content-Type': 'application/json',
  Origin: 'http://localhost',
}
const validAdmin = {
  email: 'admin@example.test',
  password: 'correct horse battery staple',
}
const validVideo = {
  filmaFileId: '12345678901234567890',
  title: 'A private draft',
  description: 'Not available to viewers.',
  startsAt: '2026-09-07T00:00:00.000Z',
  endsAt: '2026-09-08T00:00:00.000Z',
}

async function resetDatabase() {
  await env.DATABASE.batch([
    env.DATABASE.prepare('DELETE FROM rate_limits'),
    env.DATABASE.prepare('DELETE FROM access_codes'),
    env.DATABASE.prepare('DELETE FROM videos'),
    env.DATABASE.prepare('DELETE FROM sessions'),
    env.DATABASE.prepare('DELETE FROM accounts'),
    env.DATABASE.prepare(
      'UPDATE app_settings SET bootstrap_consumed_at = NULL WHERE id = 1',
    ),
  ])
}

async function api(path: string, init?: RequestInit) {
  return exports.default.fetch(`http://localhost${path}`, init)
}

async function setupAdmin(overrides: Record<string, unknown> = {}) {
  return api('/api/admin/setup', {
    method: 'POST',
    headers: {
      ...jsonHeaders,
      'X-Play-Bootstrap-Token': bootstrapToken,
    },
    body: JSON.stringify({ ...validAdmin, ...overrides }),
  })
}

async function login(overrides: Record<string, unknown> = {}) {
  return api('/api/auth/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ ...validAdmin, ...overrides }),
  })
}

async function authenticatedCookie() {
  expect((await setupAdmin()).status).toBe(201)
  const response = await login()
  expect(response.status).toBe(200)
  const cookie = response.headers.get('Set-Cookie')
  expect(cookie).not.toBeNull()
  return cookie!.split(';', 1)[0]!
}

async function createVideo(cookie: string, overrides = {}) {
  return api('/api/admin/videos', {
    method: 'POST',
    headers: { ...jsonHeaders, Cookie: cookie },
    body: JSON.stringify({ ...validVideo, ...overrides }),
  })
}

async function requestWithBindings(
  path: string,
  init: RequestInit | undefined,
  overrides: Record<string, unknown>,
) {
  const bindings = { ...env, ...overrides }
  return app.fetch(new Request(`http://localhost${path}`, init), bindings)
}

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
}

describe('admin API', () => {
  beforeEach(resetDatabase)

  it('creates the only administrator without returning or storing secrets', async () => {
    const response = await setupAdmin({ email: ' Admin@Example.test ' })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ configured: true })
    expectSecurityHeaders(response)

    const account = await env.DATABASE.prepare(
      'SELECT email, password_hash FROM accounts',
    ).first<{ email: string; password_hash: string }>()
    expect(account?.email).toBe('admin@example.test')
    expect(account?.password_hash).toMatch(/^pbkdf2-sha256\$600000\$/)
    expect(account?.password_hash).not.toContain(validAdmin.password)
  })

  it('allows only one concurrent bootstrap and hides all closed-setup reasons', async () => {
    const [first, second] = await Promise.all([
      setupAdmin(),
      setupAdmin({ email: 'second@example.test' }),
    ])
    expect([first.status, second.status].sort()).toEqual([201, 404])
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM accounts',
      ).first<{
        count: number
      }>(),
    ).toEqual({ count: 1 })

    const repeated = await setupAdmin({ email: 'third@example.test' })
    const missing = await api('/api/admin/setup', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(validAdmin),
    })
    expect(repeated.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await repeated.json()).toEqual(await missing.json())
  })

  it('returns the same not-found response for missing and incorrect bootstrap tokens', async () => {
    const missing = await api('/api/admin/setup', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(validAdmin),
    })
    const wrong = await api('/api/admin/setup', {
      method: 'POST',
      headers: { ...jsonHeaders, 'X-Play-Bootstrap-Token': 'c'.repeat(64) },
      body: JSON.stringify(validAdmin),
    })

    expect(missing.status).toBe(404)
    expect(wrong.status).toBe(404)
    expect(await missing.json()).toEqual(await wrong.json())
  })

  it('fails closed when an unused bootstrap secret or rate-limit key is missing', async () => {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        ...jsonHeaders,
        'X-Play-Bootstrap-Token': bootstrapToken,
      },
      body: JSON.stringify(validAdmin),
    }
    const noBootstrap = await requestWithBindings('/api/admin/setup', init, {
      PLAY_BOOTSTRAP_TOKEN: undefined,
    })
    const noRateKey = await requestWithBindings('/api/admin/setup', init, {
      PLAY_RATE_LIMIT_KEY: undefined,
    })

    expect(noBootstrap.status).toBe(503)
    expect(noRateKey.status).toBe(503)
    expect(await noBootstrap.json()).toEqual({ error: 'unavailable' })
    expect(await noRateKey.json()).toEqual({ error: 'unavailable' })
  })

  it('rate limits setup before password work or mutation and stores opaque buckets', async () => {
    const statuses: number[] = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await api('/api/admin/setup', {
        method: 'POST',
        headers: {
          ...jsonHeaders,
          'X-Play-Bootstrap-Token': 'c'.repeat(64),
        },
        body: JSON.stringify(validAdmin),
      })
      statuses.push(response.status)
      if (attempt === 5)
        expect(response.headers.get('Retry-After')).toMatch(/^\d+$/)
    }

    expect(statuses).toEqual([404, 404, 404, 404, 404, 429])
    const row = await env.DATABASE.prepare(
      'SELECT bucket FROM rate_limits WHERE endpoint = ?',
    )
      .bind('setup')
      .first<{ bucket: string }>()
    expect(row?.bucket).not.toContain('localhost')
    expect(row?.bucket).toMatch(/^[0-9a-f]{64}$/)
  })

  it('validates setup fields and rejects unknown input', async () => {
    for (const input of [
      { email: 'not-an-email' },
      { password: 'short' },
      { password: 'é'.repeat(65) },
      { unexpected: true },
    ]) {
      const response = await setupAdmin(input)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'invalid_request' })
    }
  })

  it('logs in with secure cookie flags and stores only the session hash', async () => {
    expect((await setupAdmin()).status).toBe(201)
    const response = await login({ email: ' ADMIN@example.test ' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authenticated: true })
    expect(response.headers.get('Set-Cookie')).toMatch(
      /^play_session=[0-9a-f]{64}; Max-Age=28800; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    )
    const session = await env.DATABASE.prepare(
      'SELECT token_hash FROM sessions',
    ).first<{ token_hash: string }>()
    const rawToken = response.headers
      .get('Set-Cookie')!
      .match(/^play_session=([0-9a-f]{64})/)![1]!
    expect(session?.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(session?.token_hash).not.toBe(rawToken)
  })

  it('uses the same credential error for a wrong password and an unknown account', async () => {
    expect((await setupAdmin()).status).toBe(201)
    const wrong = await login({ password: 'incorrect password value' })
    const unknown = await login({ email: 'unknown@example.test' })

    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
  })

  it('rate limits login by normalized account', async () => {
    expect((await setupAdmin()).status).toBe(201)
    const statuses: number[] = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await login({
        email: attempt % 2 ? ' ADMIN@example.test ' : validAdmin.email,
        password: 'incorrect password value',
      })
      statuses.push(response.status)
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429])
  })

  it('validates session expiry on every request', async () => {
    const cookie = await authenticatedCookie()
    expect(
      (await api('/api/admin/session', { headers: { Cookie: cookie } })).status,
    ).toBe(200)

    await env.DATABASE.prepare('UPDATE sessions SET expires_at = 0').run()
    const expired = await api('/api/admin/session', {
      headers: { Cookie: cookie },
    })
    expect(expired.status).toBe(401)
    expect(await expired.json()).toEqual({ error: 'unauthorized' })
  })

  it('logs out by revoking the stored session and expiring the cookie', async () => {
    const cookie = await authenticatedCookie()
    const response = await api('/api/auth/logout', {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: cookie },
      body: '{}',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authenticated: false })
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(
      (await api('/api/admin/session', { headers: { Cookie: cookie } })).status,
    ).toBe(401)
  })

  it('requires local-only configuration and a localhost URL', async () => {
    const disabled = await requestWithBindings(
      '/api/admin/session',
      { method: 'GET' },
      { PLAY_LOCAL_ONLY: 'false' },
    )
    const remote = await exports.default.fetch(
      'https://example.test/api/admin/session',
    )

    expect(disabled.status).toBe(503)
    expect(remote.status).toBe(503)
    expect(await disabled.json()).toEqual({ error: 'unavailable' })
    expect(await remote.json()).toEqual({ error: 'unavailable' })
  })

  it('rejects cross-origin, non-JSON, oversized streamed, and extra-field writes', async () => {
    const cookie = await authenticatedCookie()
    const crossOrigin = await api('/api/admin/videos', {
      method: 'POST',
      headers: {
        ...jsonHeaders,
        Cookie: cookie,
        Origin: 'http://127.0.0.1',
      },
      body: JSON.stringify(validVideo),
    })
    const nonJson = await api('/api/admin/videos', {
      method: 'POST',
      headers: { Origin: 'http://localhost', Cookie: cookie },
      body: JSON.stringify(validVideo),
    })
    const oversized = await api('/api/admin/videos', {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: cookie },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"title":"'))
          controller.enqueue(new Uint8Array(16_385).fill(97))
          controller.close()
        },
      }),
    })
    const extra = await createVideo(cookie, { status: 'draft' })

    expect(crossOrigin.status).toBe(403)
    expect(nonJson.status).toBe(400)
    expect(oversized.status).toBe(400)
    expect(extra.status).toBe(400)
  })

  it('authenticates admin routes before accepting their bodies', async () => {
    const response = await api('/api/admin/videos', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(validVideo),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM videos',
      ).first(),
    ).toEqual({ count: 0 })
  })

  it('creates, updates, and lists persistent draft videos', async () => {
    const cookie = await authenticatedCookie()
    const created = await createVideo(cookie)
    expect(created.status).toBe(201)
    const createdBody = await created.json<{
      video: { id: string; publicId: string; status: string; title: string }
    }>()
    expect(createdBody.video).toMatchObject({
      status: 'draft',
      title: validVideo.title,
    })
    expect(createdBody.video.id).not.toBe(createdBody.video.publicId)

    const updated = await api(`/api/admin/videos/${createdBody.video.id}`, {
      method: 'PUT',
      headers: { ...jsonHeaders, Cookie: cookie },
      body: JSON.stringify({ ...validVideo, title: 'Updated title' }),
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({
      video: {
        id: createdBody.video.id,
        title: 'Updated title',
        status: 'draft',
      },
    })

    const listed = await api('/api/admin/videos?offset=0', {
      headers: { Cookie: cookie },
    })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({
      videos: [
        { id: createdBody.video.id, title: 'Updated title', status: 'draft' },
      ],
    })
  })

  it('rejects invalid video fields, offsets, and missing updates', async () => {
    const cookie = await authenticatedCookie()
    for (const override of [
      { filmaFileId: '0' },
      { filmaFileId: '12.3' },
      { filmaFileId: '1'.repeat(21) },
      { title: '   ' },
      { title: 'x'.repeat(201) },
      { description: 'x'.repeat(2001) },
      { startsAt: 'not-a-date' },
      { endsAt: validVideo.startsAt },
    ]) {
      expect((await createVideo(cookie, override)).status).toBe(400)
    }
    expect(
      (
        await api('/api/admin/videos?offset=-1', {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await api('/api/admin/videos/does-not-exist', {
          method: 'PUT',
          headers: { ...jsonHeaders, Cookie: cookie },
          body: JSON.stringify(validVideo),
        })
      ).status,
    ).toBe(404)
  })

  it('issues distinct one-time-visible Crockford codes while storing only hashes', async () => {
    const cookie = await authenticatedCookie()
    const created = await createVideo(cookie)
    const { video } = await created.json<{ video: { id: string } }>()

    const first = await api(`/api/admin/videos/${video.id}/codes`, {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: cookie },
      body: '{}',
    })
    const second = await api(`/api/admin/videos/${video.id}/codes`, {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: cookie },
      body: '{}',
    })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    const firstBody = await first.json<{
      id: string
      code: string
      createdAt: string
    }>()
    const secondBody = await second.json<{ id: string; code: string }>()
    expect(firstBody.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/,
    )
    expect(secondBody.code).not.toBe(firstBody.code)
    expect(new Date(firstBody.createdAt).toISOString()).toBe(
      firstBody.createdAt,
    )

    const stored = await env.DATABASE.prepare(
      'SELECT code_hash FROM access_codes ORDER BY created_at',
    ).all<{ code_hash: string }>()
    expect(stored.results).toHaveLength(2)
    expect(stored.results.map((row) => row.code_hash)).not.toContain(
      firstBody.code,
    )
    expect(stored.results.map((row) => row.code_hash)).not.toContain(
      firstBody.code.replaceAll('-', ''),
    )
  })

  it('lists only redacted code metadata and revokes only codes belonging to the video', async () => {
    const cookie = await authenticatedCookie()
    const firstVideo = await (
      await createVideo(cookie)
    ).json<{ video: { id: string } }>()
    const secondVideo = await (
      await createVideo(cookie, { title: 'Second draft', filmaFileId: '7' })
    ).json<{ video: { id: string } }>()
    const issued = await api(`/api/admin/videos/${firstVideo.video.id}/codes`, {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: cookie },
      body: '{}',
    })
    const issuedBody = await issued.json<{ id: string; code: string }>()

    const wrongVideo = await api(
      `/api/admin/videos/${secondVideo.video.id}/codes/${issuedBody.id}/revoke`,
      {
        method: 'POST',
        headers: { ...jsonHeaders, Cookie: cookie },
        body: '{}',
      },
    )
    expect(wrongVideo.status).toBe(404)

    const revoked = await api(
      `/api/admin/videos/${firstVideo.video.id}/codes/${issuedBody.id}/revoke`,
      {
        method: 'POST',
        headers: { ...jsonHeaders, Cookie: cookie },
        body: '{}',
      },
    )
    expect(revoked.status).toBe(200)
    expect(await revoked.json()).toEqual({ revoked: true })

    const list = await api(`/api/admin/videos/${firstVideo.video.id}/codes`, {
      headers: { Cookie: cookie },
    })
    expect(list.status).toBe(200)
    const text = await list.text()
    expect(JSON.parse(text)).toMatchObject({
      codes: [{ id: issuedBody.id, status: 'revoked' }],
    })
    expect(text).not.toContain(issuedBody.code)
    expect(text).not.toContain('code_hash')
  })

  it('does not expose viewer, redemption, publication, or unknown API routes', async () => {
    const paths = [
      '/v/public-id',
      '/api/public/videos/public-id/redeem',
      '/api/viewer/videos/public-id/playback',
      '/api/admin/videos/id/publish',
      '/api/not-defined',
    ]
    for (const path of paths) {
      const isWrite = path.includes('redeem') || path.includes('publish')
      const response = await api(path, {
        method: isWrite ? 'POST' : 'GET',
        headers: path.startsWith('/api/') ? jsonHeaders : undefined,
        body: isWrite ? '{}' : undefined,
      })
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('public-id')
      expectSecurityHeaders(response)
    }
  })

  it('turns database failures into a generic 503 without raw errors', async () => {
    const brokenDatabase = {
      prepare() {
        throw new Error('sensitive database details')
      },
    } as unknown as D1Database
    const response = await requestWithBindings(
      '/api/admin/session',
      { method: 'GET', headers: { Cookie: `play_session=${'d'.repeat(64)}` } },
      { DATABASE: brokenDatabase },
    )

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('{"error":"unavailable"}')
    expectSecurityHeaders(response)
  })
})
