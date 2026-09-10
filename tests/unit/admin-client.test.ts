import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  acceptIssuedCodeForSelection,
  adminRequest,
  loginPasswordValidationError,
  localDateTime,
  loadFilmaConnection,
  newPasswordValidationError,
  saveFilmaConnection,
  optionalIsoDateTime,
  toIsoDateTime,
} from '../../src/admin/client'

afterEach(() => vi.unstubAllGlobals())

describe('admin client', () => {
  it('uses the stronger new-password policy for multilingual setup', () => {
    expect(newPasswordValidationError('🔐🔐🔐')).not.toBeNull()
    expect(newPasswordValidationError('あいうえ')).not.toBeNull()
    expect(newPasswordValidationError('あいうえおかきくけこさし')).toBeNull()
    expect(newPasswordValidationError('🔐'.repeat(33))).not.toBeNull()
  })

  it('allows legacy byte-valid passwords only at login', () => {
    for (const password of ['🔐'.repeat(6), '🔐'.repeat(3), 'あいうえ']) {
      expect(loginPasswordValidationError(password)).toBeNull()
      expect(newPasswordValidationError(password)).not.toBeNull()
    }
    expect(loginPasswordValidationError('a'.repeat(11))).not.toBeNull()
    expect(loginPasswordValidationError('a'.repeat(128))).toBeNull()
    expect(loginPasswordValidationError('a'.repeat(129))).not.toBeNull()
  })

  it('does not accept a delayed key for a newly selected video', async () => {
    let resolveIssued!: (value: {
      id: string
      code: string
      createdAt: string
    }) => void
    const response = new Promise<{
      id: string
      code: string
      createdAt: string
    }>((resolve) => {
      resolveIssued = resolve
    })
    let selectedVideoId = 'video-a'
    const pending = response.then((issued) =>
      acceptIssuedCodeForSelection(selectedVideoId, 'video-a', issued),
    )

    selectedVideoId = 'video-b'
    resolveIssued({
      id: 'code-a',
      code: 'AAAA-BBBB-CCCC-DDDD',
      createdAt: '2026-09-08T00:00:00.000Z',
    })

    expect(await pending).toBeNull()
  })

  it('returns only the one-time key and leaves filtered list metadata to the server', () => {
    expect(
      acceptIssuedCodeForSelection('video-a', 'video-a', {
        id: 'code-a',
        code: 'AAAA-BBBB-CCCC-DDDD',
        createdAt: '2026-09-08T00:00:00.000Z',
      }),
    ).toEqual({ issuedCode: 'AAAA-BBBB-CCCC-DDDD' })
  })

  it('rejects impossible or missing form dates before sending a video', () => {
    expect(() => toIsoDateTime('')).toThrow()
    expect(() => toIsoDateTime('not-a-date')).toThrow()
    expect(() => toIsoDateTime('2026-02-30T12:00')).toThrow()
    expect(toIsoDateTime('2026-09-07T12:00')).toBe(
      new Date(2026, 8, 7, 12, 0).toISOString(),
    )
  })

  it('retains the local calendar value when editing a saved timestamp', () => {
    expect(localDateTime(new Date(2026, 8, 7, 12, 35).toISOString())).toBe(
      '2026-09-07T12:35',
    )
    expect(localDateTime(null)).toBe('')
    expect(optionalIsoDateTime('')).toBeNull()
    expect(optionalIsoDateTime('2026-09-07T12:35')).toBe(
      new Date(2026, 8, 7, 12, 35).toISOString(),
    )
  })

  it('never puts an upstream error body into a user-visible error', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response('upstream-sensitive-value', { status: 503 }),
      ),
    )
    await expect(adminRequest('/api/admin/videos')).rejects.toThrow(
      '現在処理できません',
    )
  })

  it('reports a rate limit without encouraging blind resubmission', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response('', { status: 429 })),
    )
    await expect(adminRequest('/api/admin/videos')).rejects.toThrow(
      '時間をおいて',
    )
  })

  it('uses a generic network error because issuance may have succeeded', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new Error('secret network detail')),
    )
    await expect(adminRequest('/api/admin/videos')).rejects.toThrow(
      '処理結果を確認できません',
    )
  })

  it('uses same-origin credentials and JSON without caching the response', async () => {
    let actual: RequestInit | undefined
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      actual = init
      return Promise.resolve(Response.json({ saved: true }))
    })
    await expect(
      adminRequest('/api/admin/videos', 'POST', { title: 'test' }),
    ).resolves.toEqual({ saved: true })
    expect(actual).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
      method: 'POST',
      body: '{"title":"test"}',
    })
    expect(new Headers(actual?.headers).get('Content-Type')).toBe(
      'application/json',
    )
  })

  it('uses the typed Filma connection boundary without returning a saved key', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      requests.push({ url, init })
      return Promise.resolve(
        Response.json({
          configured: true,
          verifiedAt: '2026-09-09T00:00:00.000Z',
        }),
      )
    })
    await expect(loadFilmaConnection()).resolves.toEqual({
      configured: true,
      verifiedAt: '2026-09-09T00:00:00.000Z',
    })
    await expect(saveFilmaConnection('synthetic-key')).resolves.toEqual({
      configured: true,
      verifiedAt: '2026-09-09T00:00:00.000Z',
    })
    expect(
      requests.map(({ url, init }) => [url, init.method, init.body]),
    ).toEqual([
      ['/api/admin/filma', 'GET', undefined],
      ['/api/admin/filma', 'PUT', '{"apiKey":"synthetic-key"}'],
    ])
  })
})
