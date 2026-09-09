import type { Context } from 'hono'

import { hmacHex, sha256Hex } from '../adapters/secrets/web-crypto'
import { incrementRateLimits } from '../adapters/database/admin-repository'

export const errorBody = {
  invalid: { error: 'invalid_request' },
  forbidden: { error: 'forbidden' },
  unauthorized: { error: 'unauthorized' },
  notFound: { error: 'not_found' },
  rateLimited: { error: 'rate_limited' },
  conflict: { error: 'conflict' },
  unavailable: { error: 'unavailable' },
} as const

export function applySecurityHeaders(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function readBoundedJson(c: Context<{ Bindings: Env }>) {
  const request = c.req.raw
  if (new URL(request.url).origin !== request.headers.get('Origin')) {
    return { error: 'forbidden' as const }
  }
  const contentType = request.headers
    .get('Content-Type')
    ?.split(';', 1)[0]
    ?.trim()
  if (contentType?.toLowerCase() !== 'application/json') {
    return { error: 'invalid' as const }
  }
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > 16_384) {
    return { error: 'invalid' as const }
  }
  const reader = request.body?.getReader()
  if (!reader) return { error: 'invalid' as const }
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 16_384) {
      await reader.cancel()
      return { error: 'invalid' as const }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return {
      value: JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      ) as unknown,
    }
  } catch {
    return { error: 'invalid' as const }
  }
}

export function sessionToken(request: Request) {
  const cookie = request.headers.get('Cookie') ?? ''
  for (const item of cookie.split(';')) {
    const [name, ...value] = item.trim().split('=')
    if (name === 'play_session') {
      const token = value.join('=')
      return /^[0-9a-f]{64}$/.test(token) ? token : null
    }
  }
  return null
}

export async function sessionHash(request: Request) {
  const token = sessionToken(request)
  return token ? sha256Hex(token) : null
}

export function anonymousToken(request: Request) {
  const cookie = request.headers.get('Cookie') ?? ''
  for (const item of cookie.split(';')) {
    const [name, ...value] = item.trim().split('=')
    if (name === 'play_anonymous') {
      const token = value.join('=')
      return /^[0-9a-f]{64}$/.test(token) ? token : null
    }
  }
  return null
}

export async function anonymousHash(request: Request) {
  const token = anonymousToken(request)
  return token ? sha256Hex(token) : null
}

export async function applyRateLimit(
  bindings: Env,
  descriptors: readonly {
    endpoint: string
    rawBucket: string
    windowSeconds: number
    maximum: number
  }[],
) {
  const key = bindings.PLAY_RATE_LIMIT_KEY
  if (!key) throw new Error('missing rate configuration')
  const limits = await Promise.all(
    descriptors.map(async (descriptor) => ({
      endpoint: descriptor.endpoint,
      bucket: await hmacHex(key, descriptor.rawBucket),
      windowSeconds: descriptor.windowSeconds,
      maximum: descriptor.maximum,
    })),
  )
  return incrementRateLimits(
    bindings.DATABASE,
    Math.floor(Date.now() / 1_000),
    limits,
  )
}
