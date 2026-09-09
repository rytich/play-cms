import { describe, expect, it } from 'vitest'

import {
  FilmaPlaybackError,
  issuePlaybackGrant,
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

describe('Filma playback client', () => {
  it('uses one fixed-host request without show_all and accepts separate mediafile_id', async () => {
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
          url: 'https://filma.biz/player/synthetic',
          mediafile_id: 987,
          expires_at: '2100-09-09T00:04:59.000Z',
        }),
      )
    }
    await expect(issuePlaybackGrant({ ...input, request })).resolves.toEqual({
      url: 'https://filma.biz/player/synthetic',
      expiresAt: '2100-09-09T00:04:59.000Z',
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
            url: 'https://filma.biz/player',
            mediafile_id: 1,
            expires_at: '2100-09-09T00:05:00.001Z',
          }),
        ),
      () =>
        Promise.resolve(
          response({
            url: 'https://filma.biz/player',
            mediafile_id: 1,
            expires_at: '2020-01-01T00:00:00.000Z',
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

  it('classifies file verification statuses without exposing response bodies', async () => {
    await expect(
      verifyFilmaFile({
        ...input,
        request: () => Promise.resolve(new Response('', { status: 404 })),
      }),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
    for (const status of [401, 403, 500]) {
      await expect(
        verifyFilmaFile({
          ...input,
          request: () => Promise.resolve(new Response('private', { status })),
        }),
      ).rejects.toMatchObject({ code: 'FILMA_UNAVAILABLE' })
    }
  })
})
