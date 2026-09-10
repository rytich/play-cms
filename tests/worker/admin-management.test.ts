import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { sha256Hex } from '../../src/adapters/secrets/web-crypto'

const token = 'c'.repeat(64)
const headers = {
  'Content-Type': 'application/json',
  Origin: 'http://localhost',
  Cookie: `play_session=${token}`,
}
const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

async function api(path: string, init?: RequestInit) {
  return exports.default.fetch(`http://localhost${path}`, init)
}

async function resetDatabase() {
  await env.DATABASE.batch([
    env.DATABASE.prepare('DELETE FROM rate_limits'),
    env.DATABASE.prepare('DELETE FROM access_codes'),
    env.DATABASE.prepare('DELETE FROM videos'),
    env.DATABASE.prepare('DELETE FROM sessions'),
    env.DATABASE.prepare('DELETE FROM accounts'),
    env.DATABASE.prepare(
      `INSERT INTO accounts (id, role, email, password_hash, created_at)
       VALUES ('admin-a', 'admin', 'bulk@example.test', 'unused', 1)`,
    ),
    env.DATABASE.prepare(
      `INSERT INTO sessions (id, token_hash, account_id, expires_at, created_at)
       VALUES ('session-a', ?, 'admin-a', ?, 1)`,
    ).bind(await sha256Hex(token), Math.floor(Date.now() / 1000) + 3600),
  ])
}

async function seedVideos(count = 1001) {
  await env.DATABASE.prepare(
    `WITH RECURSIVE seq(n) AS (
       SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?
     )
     INSERT INTO videos
       (id, public_id, filma_file_id, title, description, status,
        starts_at, ends_at, created_at, updated_at)
     SELECT printf('00000000-0000-4000-8000-%012d', n),
            printf('public-%04d', n), printf('%d', n),
            CASE WHEN n = 1001 THEN 'Exact_% Title' ELSE printf('Video %04d', n) END,
            '', CASE WHEN n % 2 = 0 THEN 'published' ELSE 'draft' END,
            '2026-09-09T00:00:00.000Z', '2026-09-11T00:00:00.000Z',
            CASE WHEN n >= 1000 THEN 2000 ELSE n END, n
     FROM seq`,
  )
    .bind(count)
    .run()
}

async function seedCodes(videoId: string, count = 1001) {
  await env.DATABASE.prepare(
    `WITH RECURSIVE seq(n) AS (
       SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?
     )
     INSERT INTO access_codes
       (id, video_id, code_hash, created_at, revoked_at, is_enabled)
     SELECT printf('10000000-0000-4000-8000-%012d', n), ?,
            printf('hash-%04d', n), n,
            CASE WHEN n = 1001 THEN 2000 ELSE NULL END,
            CASE WHEN n % 2 = 0 THEN 0 ELSE 1 END
     FROM seq`,
  )
    .bind(count, videoId)
    .run()
}

describe('admin management API', () => {
  beforeEach(resetDatabase)

  it('filters 1001 videos with literal search, AND ranges, stable order, and hasMore', async () => {
    await seedVideos()
    const first = await api('/api/admin/videos?offset=0', { headers })
    expect(first.status).toBe(200)
    const firstBody = await first.json<{
      videos: { id: string }[]
      hasMore: boolean
    }>()
    expect(firstBody.videos).toHaveLength(100)
    expect(firstBody.hasMore).toBe(true)
    expect(firstBody.videos.slice(0, 2).map((video) => video.id)).toEqual([
      uuid(1001),
      uuid(1000),
    ])

    const last = await api('/api/admin/videos?offset=1000', { headers })
    const lastBody = await last.json<{
      videos: { id: string }[]
      hasMore: boolean
    }>()
    expect(lastBody).toEqual({
      videos: [expect.objectContaining({ id: uuid(1) })],
      hasMore: false,
    })

    await resetDatabase()
    await seedVideos(100)
    expect(
      await (await api('/api/admin/videos', { headers })).json(),
    ).toMatchObject({
      hasMore: false,
    })
  })

  it('uses literal case-sensitive title search or exact Filma ID and AND filters', async () => {
    await seedVideos()
    for (const [query, expected] of [
      ['q=Exact_%25+Title', 1],
      ['q=exact_%25+Title', 0],
      ['q=1001', 1],
      ['q=1001&status=published', 0],
      [
        'status=draft&from=2026-09-10T00%3A00%3A00Z&to=2026-09-10T12%3A00%3A00Z',
        100,
      ],
    ] as const) {
      const response = await api(`/api/admin/videos?${query}`, { headers })
      expect(response.status).toBe(200)
      const body = await response.json<{ videos: unknown[] }>()
      expect(body.videos).toHaveLength(expected)
    }
  })

  it('returns the final one of 1001 codes and filters settings and lifecycle', async () => {
    await seedVideos(1)
    await seedCodes(uuid(1))
    const first = await api(`/api/admin/videos/${uuid(1)}/codes`, { headers })
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ hasMore: true })
    const last = await api(`/api/admin/videos/${uuid(1)}/codes?offset=1000`, {
      headers,
    })
    const lastBody = await last.json<{
      codes: { id: string; enabled: boolean }[]
      hasMore: boolean
    }>()
    expect(lastBody).toEqual({
      codes: [
        expect.objectContaining({
          id: '10000000-0000-4000-8000-000000000001',
          enabled: true,
        }),
      ],
      hasMore: false,
    })
    const filtered = await api(
      `/api/admin/videos/${uuid(1)}/codes?setting=disabled&lifecycle=unused&issuedFrom=1970-01-01T00%3A00%3A02Z&issuedTo=1970-01-01T00%3A00%3A05Z`,
      { headers },
    )
    expect(
      (await filtered.json<{ codes: { id: string }[] }>()).codes.map(
        (item) => item.id,
      ),
    ).toEqual([
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000002',
    ])
    const subsecond = await api(
      `/api/admin/videos/${uuid(1)}/codes?issuedFrom=1970-01-01T00%3A00%3A02.001Z&issuedTo=1970-01-01T00%3A00%3A03.001Z`,
      { headers },
    )
    expect(
      (await subsecond.json<{ codes: { id: string }[] }>()).codes.map(
        (item) => item.id,
      ),
    ).toEqual(['10000000-0000-4000-8000-000000000003'])
    const used = await api(
      `/api/admin/videos/${uuid(1)}/codes?lifecycle=used`,
      { headers },
    )
    expect(await used.json()).toMatchObject({ codes: [], hasMore: false })
  })

  it('shows used keys and refuses their bulk or revoke mutations without deleting rights', async () => {
    await seedVideos(2)
    await seedCodes(uuid(1), 2)
    await env.DATABASE.batch([
      env.DATABASE.prepare(
        `INSERT INTO accounts (id, role, email, password_hash, created_at)
         VALUES ('viewer-used', 'viewer', 'used@example.test', 'hash', 1)`,
      ),
      env.DATABASE.prepare(
        `INSERT INTO redemptions
         (code_id, video_id, anonymous_session_id, account_id, redeemed_at)
         VALUES ('10000000-0000-4000-8000-000000000001', ?, NULL,
                 'viewer-used', 2)`,
      ).bind(uuid(1)),
      env.DATABASE.prepare(
        `INSERT INTO entitlements
         (account_id, video_id, source_code_id, granted_at)
         VALUES ('viewer-used', ?,
                 '10000000-0000-4000-8000-000000000001', 2)`,
      ).bind(uuid(1)),
    ])

    const used = await api(
      `/api/admin/videos/${uuid(1)}/codes?lifecycle=used`,
      { headers },
    )
    expect(await used.json()).toMatchObject({
      codes: [
        expect.objectContaining({
          id: '10000000-0000-4000-8000-000000000001',
          status: 'used',
        }),
      ],
    })

    const bulk = await api(`/api/admin/videos/${uuid(1)}/codes/bulk-status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ids: ['10000000-0000-4000-8000-000000000001'],
        enabled: false,
      }),
    })
    expect(bulk.status).toBe(409)
    const revoke = await api(
      `/api/admin/videos/${uuid(1)}/codes/10000000-0000-4000-8000-000000000001/revoke`,
      { method: 'POST', headers, body: '{}' },
    )
    expect(revoke.status).toBe(409)
    const wrongVideo = await api(
      `/api/admin/videos/${uuid(2)}/codes/10000000-0000-4000-8000-000000000001/revoke`,
      { method: 'POST', headers, body: '{}' },
    )
    expect(wrongVideo.status).toBe(404)
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM redemptions',
      ).first(),
    ).toEqual({ count: 1 })
    expect(
      await env.DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM entitlements',
      ).first(),
    ).toEqual({ count: 1 })
  })

  it('atomically changes 100 videos and reports idempotent repeats', async () => {
    await seedVideos(100)
    const ids = Array.from({ length: 100 }, (_, index) => uuid(index + 1))
    const first = await api('/api/admin/videos/bulk-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, status: 'published' }),
    })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ changedCount: 50, unchangedCount: 50 })
    const repeated = await api('/api/admin/videos/bulk-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, status: 'published' }),
    })
    expect(await repeated.json()).toEqual({
      changedCount: 0,
      unchangedCount: 100,
    })

    const edited = await api(`/api/admin/videos/${uuid(1)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        filmaFileId: '1',
        title: 'Edited without status',
        description: '',
        startsAt: '2026-09-09T00:00:00.000Z',
        endsAt: '2026-09-11T00:00:00.000Z',
      }),
    })
    expect(await edited.json()).toMatchObject({
      video: { status: 'published' },
    })
  })

  it('atomically changes 100 eligible keys and reports idempotent repeats', async () => {
    await seedVideos(1)
    await seedCodes(uuid(1), 100)
    const ids = Array.from(
      { length: 100 },
      (_, index) =>
        `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    )
    const path = `/api/admin/videos/${uuid(1)}/codes/bulk-status`
    const first = await api(path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, enabled: false }),
    })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ changedCount: 50, unchangedCount: 50 })
    const repeated = await api(path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, enabled: false }),
    })
    expect(await repeated.json()).toEqual({
      changedCount: 0,
      unchangedCount: 100,
    })
  })

  it('returns 404 or 409 with every requested row unchanged', async () => {
    await seedVideos(2)
    await seedCodes(uuid(1), 3)
    const before = await env.DATABASE.prepare(
      'SELECT id, status FROM videos ORDER BY id',
    ).all()
    const missing = await api('/api/admin/videos/bulk-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: [uuid(1), uuid(9999)], status: 'published' }),
    })
    expect(missing.status).toBe(404)
    expect(
      (
        await env.DATABASE.prepare(
          'SELECT id, status FROM videos ORDER BY id',
        ).all()
      ).results,
    ).toEqual(before.results)

    await env.DATABASE.prepare(
      'UPDATE access_codes SET revoked_at = 1 WHERE id = ?',
    )
      .bind('10000000-0000-4000-8000-000000000002')
      .run()
    const conflict = await api(
      `/api/admin/videos/${uuid(1)}/codes/bulk-status`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ids: [
            '10000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002',
          ],
          enabled: false,
        }),
      },
    )
    expect(conflict.status).toBe(409)
    expect(
      await env.DATABASE.prepare(
        'SELECT is_enabled FROM access_codes WHERE id = ?',
      )
        .bind('10000000-0000-4000-8000-000000000001')
        .first(),
    ).toEqual({ is_enabled: 1 })
  })

  it('prioritizes wrong ownership as 404 and rejects expired re-enablement', async () => {
    await seedVideos(2)
    await seedCodes(uuid(1), 3)
    const code1 = '10000000-0000-4000-8000-000000000001'
    const code2 = '10000000-0000-4000-8000-000000000002'
    await env.DATABASE.prepare(
      'UPDATE access_codes SET video_id = ? WHERE id = ?',
    )
      .bind(uuid(2), code2)
      .run()
    await env.DATABASE.prepare(
      'UPDATE access_codes SET revoked_at = 1 WHERE id = ?',
    )
      .bind(code1)
      .run()
    const wrongOwner = await api(
      `/api/admin/videos/${uuid(1)}/codes/bulk-status`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: [code1, code2], enabled: false }),
      },
    )
    expect(wrongOwner.status).toBe(404)

    await env.DATABASE.prepare(
      `UPDATE videos SET ends_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`,
    )
      .bind(uuid(1))
      .run()
    await env.DATABASE.prepare(
      'UPDATE access_codes SET revoked_at = NULL, is_enabled = 0 WHERE id = ?',
    )
      .bind(code1)
      .run()
    const expired = await api(
      `/api/admin/videos/${uuid(1)}/codes/bulk-status`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: [code1], enabled: true }),
      },
    )
    expect(expired.status).toBe(409)
    expect(
      await env.DATABASE.prepare(
        'SELECT is_enabled FROM access_codes WHERE id = ?',
      )
        .bind(code1)
        .first(),
    ).toEqual({ is_enabled: 0 })
  })

  it('never revives a code when single revoke races with bulk enable', async () => {
    await seedVideos(1)
    await seedCodes(uuid(1), 1)
    const codeId = '10000000-0000-4000-8000-000000000001'
    await env.DATABASE.prepare(
      'UPDATE access_codes SET is_enabled = 0 WHERE id = ?',
    )
      .bind(codeId)
      .run()
    const [bulk, revoke] = await Promise.all([
      api(`/api/admin/videos/${uuid(1)}/codes/bulk-status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: [codeId], enabled: true }),
      }),
      api(`/api/admin/videos/${uuid(1)}/codes/${codeId}/revoke`, {
        method: 'POST',
        headers,
        body: '{}',
      }),
    ])
    expect([200, 409]).toContain(bulk.status)
    expect(revoke.status).toBe(200)
    const finalCode = await env.DATABASE.prepare(
      'SELECT revoked_at FROM access_codes WHERE id = ?',
    )
      .bind(codeId)
      .first<{ revoked_at: number | null }>()
    expect(typeof finalCode?.revoked_at).toBe('number')
  })

  it('rejects unknown, duplicate, and invalid list parameters', async () => {
    for (const path of [
      '/api/admin/videos?unknown=x',
      '/api/admin/videos?q=a&q=b',
      '/api/admin/videos?status=public',
      `/api/admin/videos/${uuid(1)}/codes?setting=other`,
    ]) {
      expect((await api(path, { headers })).status).toBe(400)
    }
  })

  it('enforces input, auth, Origin, 16 KiB, and six bulk writes per minute', async () => {
    await seedVideos(1)
    const valid = { ids: [uuid(1)], status: 'draft' }
    expect(
      (
        await api('/api/admin/videos/bulk-status', {
          method: 'POST',
          headers: { ...headers, Cookie: '' },
          body: JSON.stringify(valid),
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await api('/api/admin/videos/bulk-status', {
          method: 'POST',
          headers: { ...headers, Origin: 'https://example.invalid' },
          body: JSON.stringify(valid),
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await api('/api/admin/videos/bulk-status', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...valid, extra: true }),
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await api('/api/admin/videos/bulk-status', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...valid, padding: 'x'.repeat(17_000) }),
        })
      ).status,
    ).toBe(400)
    await env.DATABASE.prepare('DELETE FROM rate_limits').run()
    const statuses: number[] = []
    for (let attempt = 0; attempt < 7; attempt += 1) {
      statuses.push(
        (
          await api('/api/admin/videos/bulk-status', {
            method: 'POST',
            headers,
            body: JSON.stringify(valid),
          })
        ).status,
      )
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429])
  })
})
