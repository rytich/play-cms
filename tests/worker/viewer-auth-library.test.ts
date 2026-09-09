import { env, exports } from 'cloudflare:workers'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { hashPassword, sha256Hex } from '../../src/adapters/secrets/web-crypto'

const origin = 'http://localhost'
const jsonHeaders = { 'Content-Type': 'application/json', Origin: origin }
const password = 'synthetic viewer password'
const credentials = { email: 'viewer@example.test', password }
let passwordHash = ''

async function api(path: string, init?: RequestInit) {
  return exports.default.fetch(`${origin}${path}`, init)
}

async function resetDatabase() {
  await env.DATABASE.batch([
    env.DATABASE.prepare('DELETE FROM entitlements'),
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

async function seedAccount(
  role: 'admin' | 'viewer',
  email: string,
  tokenCharacter: string,
) {
  const accountId = `${role}-a`
  const token = tokenCharacter.repeat(64)
  const now = Math.floor(Date.now() / 1_000)
  await env.DATABASE.batch([
    env.DATABASE.prepare(
      `INSERT INTO accounts (id, role, email, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(accountId, role, email, passwordHash, now),
    env.DATABASE.prepare(
      `INSERT INTO sessions
       (id, token_hash, account_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      `${role}-session`,
      await sha256Hex(token),
      accountId,
      now + 3_600,
      now,
    ),
  ])
  return { accountId, cookie: `play_session=${token}` }
}

async function register(overrides: Record<string, unknown> = {}) {
  return api('/api/viewer/register', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ ...credentials, ...overrides }),
  })
}

async function viewerLogin(overrides: Record<string, unknown> = {}) {
  return api('/api/viewer/login', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ ...credentials, ...overrides }),
  })
}

function responseCookie(response: Response) {
  const header = response.headers.get('Set-Cookie')
  expect(header).toMatch(
    /^play_session=[0-9a-f]{64}; Max-Age=28800; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
  )
  return header!.split(';', 1)[0]!
}

beforeAll(async () => {
  passwordHash = await hashPassword(password)
})

beforeEach(resetDatabase)

describe('viewer authentication and library API', () => {
  it('registers only a viewer, starts a hashed session, and grants no entitlement', async () => {
    const response = await register({ email: ' Viewer@Example.test ' })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ authenticated: true })
    const cookie = responseCookie(response)
    const account = await env.DATABASE.prepare(
      'SELECT id, role, email, password_hash FROM accounts',
    ).first<{
      id: string
      role: string
      email: string
      password_hash: string
    }>()
    expect(account).toMatchObject({ role: 'viewer', email: credentials.email })
    expect(account?.password_hash).toMatch(/^pbkdf2-sha256\$600000\$/)
    expect(account?.password_hash).not.toContain(password)
    const rawToken = cookie.slice('play_session='.length)
    const session = await env.DATABASE.prepare(
      'SELECT token_hash, account_id FROM sessions',
    ).first<{ token_hash: string; account_id: string }>()
    expect(session?.account_id).toBe(account?.id)
    expect(session?.token_hash).not.toBe(rawToken)
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM entitlements',
      ).first(),
    ).toEqual({ count: 0 })
    expect(
      (await api('/api/viewer/session', { headers: { Cookie: cookie } }))
        .status,
    ).toBe(200)
  })

  it('logs a viewer back in and the shared logout revokes that session', async () => {
    await seedAccount('viewer', credentials.email, 'c')
    const login = await viewerLogin()
    expect(login.status).toBe(200)
    expect(await login.json()).toEqual({ authenticated: true })
    const cookie = responseCookie(login)

    const logout = await api('/api/auth/logout', {
      method: 'POST',
      headers: { ...jsonHeaders, Cookie: cookie },
      body: '{}',
    })
    expect(logout.status).toBe(200)
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(
      (await api('/api/viewer/session', { headers: { Cookie: cookie } }))
        .status,
    ).toBe(401)
  })

  it('keeps administrator login separate from viewer login', async () => {
    await seedAccount('admin', 'admin@example.test', 'd')
    expect((await viewerLogin({ email: 'admin@example.test' })).status).toBe(
      401,
    )
    expect(
      (
        await api('/api/auth/login', {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            email: 'admin@example.test',
            password,
          }),
        })
      ).status,
    ).toBe(200)
  })

  it('returns only entitled videos that are published and currently available', async () => {
    const { accountId, cookie } = await seedAccount(
      'viewer',
      credentials.email,
      'e',
    )
    const fixtures = [
      [
        'available',
        'published',
        '2020-01-01T00:00:00.000Z',
        '2100-01-01T00:00:00.000Z',
      ],
      [
        'draft-secret',
        'draft',
        '2020-01-01T00:00:00.000Z',
        '2100-01-01T00:00:00.000Z',
      ],
      [
        'future-secret',
        'published',
        '2099-01-01T00:00:00.000Z',
        '2100-01-01T00:00:00.000Z',
      ],
      [
        'expired-secret',
        'published',
        '2020-01-01T00:00:00.000Z',
        '2021-01-01T00:00:00.000Z',
      ],
    ] as const
    for (const [index, [id, status, startsAt, endsAt]] of fixtures.entries()) {
      await env.DATABASE.batch([
        env.DATABASE.prepare(
          `INSERT INTO videos
           (id, public_id, filma_file_id, title, description, status,
            starts_at, ends_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        ).bind(
          `video-${id}`,
          `public-${id}`,
          String(index + 1),
          `Title ${id}`,
          `Description ${id}`,
          status,
          startsAt,
          endsAt,
        ),
        env.DATABASE.prepare(
          `INSERT INTO access_codes
           (id, video_id, code_hash, created_at, revoked_at, is_enabled)
           VALUES (?, ?, ?, 1, NULL, 1)`,
        ).bind(`code-${id}`, `video-${id}`, `hash-${id}`),
        env.DATABASE.prepare(
          `INSERT INTO entitlements
           (account_id, video_id, source_code_id, granted_at)
           VALUES (?, ?, ?, 1)`,
        ).bind(accountId, `video-${id}`, `code-${id}`),
      ])
    }

    const response = await api('/api/viewer/library', {
      headers: { Cookie: cookie },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      videos: [
        {
          publicId: 'public-available',
          title: 'Title available',
          description: 'Description available',
          endsAt: '2100-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('returns 401 without a session and 403 across viewer and admin roles', async () => {
    const viewer = await seedAccount('viewer', credentials.email, 'f')
    const admin = await seedAccount('admin', 'admin@example.test', 'a')

    expect((await api('/api/viewer/session')).status).toBe(401)
    expect((await api('/api/viewer/library')).status).toBe(401)
    expect(
      (
        await api('/api/admin/session', {
          headers: { Cookie: viewer.cookie },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await api('/api/admin/videos', {
          headers: { Cookie: viewer.cookie },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await api('/api/viewer/session', {
          headers: { Cookie: admin.cookie },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await api('/api/viewer/library', {
          headers: { Cookie: admin.cookie },
        })
      ).status,
    ).toBe(403)
  })

  it('uses generic failures for duplicate registration and invalid viewer login', async () => {
    expect((await register()).status).toBe(201)
    const duplicate = await register()
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toEqual({ error: 'conflict' })

    await resetDatabase()
    await seedAccount('viewer', credentials.email, '1')
    const wrong = await viewerLogin({ password: 'incorrect password value' })
    const missing = await viewerLogin({ email: 'missing@example.test' })
    expect(wrong.status).toBe(401)
    expect(missing.status).toBe(401)
    expect(await wrong.json()).toEqual(await missing.json())
  })

  it('limits registration to three attempts per client each hour', async () => {
    const statuses: number[] = []
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push(
        (
          await register({
            email: `viewer-${attempt}@example.test`,
          })
        ).status,
      )
    }
    expect(statuses).toEqual([201, 201, 201, 429])
  })

  it('reuses the five-attempt account login limit', async () => {
    await seedAccount('viewer', credentials.email, '2')
    const statuses: number[] = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push(
        (await viewerLogin({ password: 'incorrect password value' })).status,
      )
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429])
  })

  it('rejects cross-origin, non-JSON, oversized, and extra-field registration', async () => {
    const crossOrigin = await api('/api/viewer/register', {
      method: 'POST',
      headers: { ...jsonHeaders, Origin: 'http://127.0.0.1' },
      body: JSON.stringify(credentials),
    })
    const nonJson = await api('/api/viewer/register', {
      method: 'POST',
      headers: { Origin: origin },
      body: JSON.stringify(credentials),
    })
    const oversized = await api('/api/viewer/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"email":"'))
          controller.enqueue(new Uint8Array(16_385).fill(97))
          controller.close()
        },
      }),
    })
    const extra = await register({ role: 'admin' })

    expect(crossOrigin.status).toBe(403)
    expect(nonJson.status).toBe(400)
    expect(oversized.status).toBe(400)
    expect(extra.status).toBe(400)
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM accounts',
      ).first(),
    ).toEqual({ count: 0 })
  })
})
