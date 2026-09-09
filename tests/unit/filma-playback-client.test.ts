import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  classifyFilmaPlaybackLiveEvidence,
  FilmaPlaybackError,
  issuePlaybackGrant,
  readFilmaPlaybackLiveConfig,
  verifyFilmaFile,
} from '../../src/adapters/filma/playback-client'

const input = {
  apiKey: 'synthetic-api-key',
  filmaFileId: '123',
  notAfter: '2100-09-09T00:05:00.000Z',
  allowedOrigin: 'https://invite.example.test',
}

function response(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function playbackUrl(mediafileId: number, expiresAt: string) {
  const payload = btoa(
    JSON.stringify({
      exp: Math.floor(Date.parse(expiresAt) / 1_000),
      mediafile_id: mediafileId,
    }),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return `https://filma.biz/player/synthetic?jwt=e30.${payload}.signature`
}

describe('Filma playback client', () => {
  afterEach(() => vi.useRealTimers())

  it('derives the grant expiry and video binding from the JWT in the returned URL', async () => {
    const expiresAt = '2100-09-09T00:04:59.000Z'
    const url = playbackUrl(987, expiresAt)
    await expect(
      issuePlaybackGrant({
        ...input,
        request: () => Promise.resolve(response({ url, mediafile_id: 987 })),
      }),
    ).resolves.toEqual({ url, expiresAt })
    await expect(
      issuePlaybackGrant({
        ...input,
        request: () => Promise.resolve(response({ url, mediafile_id: 986 })),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE_SCHEMA' })
  })

  it('uses one fixed-host request without show_all and accepts separate mediafile_id', async () => {
    const expiresAt = '2100-09-09T00:04:59.000Z'
    const grantUrl = playbackUrl(987, expiresAt)
    let requestedUrl: string | URL | null = null
    let requestedInit: RequestInit | undefined
    let requestCount = 0
    const request = (url: RequestInfo | URL, init?: RequestInit) => {
      requestCount += 1
      requestedUrl =
        typeof url === 'string' || url instanceof URL ? url : url.url
      requestedInit = init
      return Promise.resolve(
        response({
          url: grantUrl,
          mediafile_id: 987,
        }),
      )
    }
    await expect(issuePlaybackGrant({ ...input, request })).resolves.toEqual({
      url: grantUrl,
      expiresAt,
    })
    expect(requestCount).toBe(1)
    const parsed = new URL(requestedUrl!)
    expect(parsed.origin).toBe('https://filma.biz')
    expect(parsed.pathname).toBe('/filmaapi/storage/123')
    expect(parsed.searchParams.has('show_all')).toBe(false)
    expect(requestedInit).toMatchObject({ method: 'GET', redirect: 'error' })
    expect(new Headers(requestedInit?.headers).get('X-Api-Key')).toBe(
      input.apiKey,
    )
    expect(new Headers(requestedInit?.headers).get('Origin')).toBe(
      input.allowedOrigin,
    )
  })

  it('fails closed for redirects, oversized or malformed bodies, and late grants', async () => {
    const cases: Array<() => Promise<Response>> = [
      () => Promise.resolve(Response.redirect('https://example.invalid')),
      () =>
        Promise.resolve(
          new Response('x', { headers: { 'Content-Length': '65537' } }),
        ),
      () =>
        Promise.resolve(
          response({
            url: 'http://filma.biz/player',
            mediafile_id: 1,
            expires_at: input.notAfter,
          }),
        ),
      () =>
        Promise.resolve(
          response({
            url: 'https://example.invalid/player',
            mediafile_id: 1,
            expires_at: input.notAfter,
          }),
        ),
      () =>
        Promise.resolve(
          response({
            url: 'https://filma.biz/player',
            mediafile_id: 0,
            expires_at: input.notAfter,
          }),
        ),
      () =>
        Promise.resolve(
          response({
            url: playbackUrl(1, '2100-09-09T00:05:01.000Z'),
            mediafile_id: 1,
          }),
        ),
      () =>
        Promise.resolve(
          response({
            url: playbackUrl(1, '2020-01-01T00:00:00.000Z'),
            mediafile_id: 1,
          }),
        ),
      () => Promise.reject(new Error('synthetic timeout')),
    ]
    for (const request of cases) {
      await expect(
        issuePlaybackGrant({ ...input, request }),
      ).rejects.toBeInstanceOf(FilmaPlaybackError)
    }
  })

  it('keeps the five-second deadline active while a response body is stalled', async () => {
    vi.useFakeTimers()
    const observed: { signal?: AbortSignal } = {}
    const request = (_url: string, init: RequestInit) => {
      observed.signal = init.signal as AbortSignal
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start() {},
          }),
          { status: 200 },
        ),
      )
    }
    const pending = issuePlaybackGrant({ ...input, request })
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'FILMA_UNAVAILABLE',
    })
    await vi.advanceTimersByTimeAsync(5_001)
    const abortedAfterDeadline = observed.signal?.aborted
    await rejected
    expect(abortedAfterDeadline).toBe(true)
  })

  it('classifies file verification statuses without exposing response bodies', async () => {
    await expect(
      verifyFilmaFile({
        ...input,
        request: () => Promise.resolve(new Response('', { status: 404 })),
      }),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
    for (const [status, code] of [
      [401, 'INVALID_API_KEY'],
      [403, 'DOMAIN_NOT_ALLOWED'],
      [500, 'FILMA_UNAVAILABLE'],
    ] as const) {
      await expect(
        verifyFilmaFile({
          ...input,
          request: () => Promise.resolve(new Response('private', { status })),
        }),
      ).rejects.toMatchObject({ code })
    }
  })

  it('requires dedicated live fixtures for the real status matrix', () => {
    expect(() => readFilmaPlaybackLiveConfig({})).toThrow(
      'FILMA_LIVE_CONFIG_MISSING:FILMA_LIVE_API_KEY,FILMA_LIVE_FILE_ID,FILMA_LIVE_NOT_FOUND_FILE_ID,FILMA_LIVE_INVALID_API_KEY,FILMA_LIVE_ALLOWED_ORIGIN,FILMA_LIVE_DENIED_ORIGIN',
    )
    expect(
      readFilmaPlaybackLiveConfig({
        FILMA_LIVE_API_KEY: 'valid-test-key',
        FILMA_LIVE_FILE_ID: '123',
        FILMA_LIVE_NOT_FOUND_FILE_ID: '999',
        FILMA_LIVE_INVALID_API_KEY: 'invalid-test-key',
        FILMA_LIVE_ALLOWED_ORIGIN: 'https://allowed.example.test',
        FILMA_LIVE_DENIED_ORIGIN: 'https://denied.example.test',
      }),
    ).toEqual({
      apiKey: 'valid-test-key',
      fileId: '123',
      notFoundFileId: '999',
      invalidApiKey: 'invalid-test-key',
      allowedOrigin: 'https://allowed.example.test',
      deniedOrigin: 'https://denied.example.test',
    })
  })

  it('classifies live evidence without treating contract or infrastructure failures as GO', () => {
    const passed = {
      storageStatus: 200,
      notFoundStatus: 404,
      invalidCredentialStatus: 401,
      deniedStorageOriginStatus: 403,
      allowedPlaybackStatus: 200,
      deniedPlaybackOriginStatus: 403,
      expiredPlaybackStatus: 401,
      expiredRefreshStatus: 401,
      tokenExpiryWithinLimit: true,
      tokenMatchesMedia: true,
    }
    expect(classifyFilmaPlaybackLiveEvidence(passed)).toBe(
      'all-conditions-passed',
    )
    expect(
      classifyFilmaPlaybackLiveEvidence({
        ...passed,
        deniedPlaybackOriginStatus: 200,
      }),
    ).toBe('contract-denied')
    expect(
      classifyFilmaPlaybackLiveEvidence({
        ...passed,
        expiredRefreshStatus: 503,
      }),
    ).toBe('test-infrastructure-error')
    expect(
      classifyFilmaPlaybackLiveEvidence({
        ...passed,
        tokenExpiryWithinLimit: null,
      }),
    ).toBe('test-infrastructure-error')
  })
})
