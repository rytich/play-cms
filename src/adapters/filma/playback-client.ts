type FilmaFetch = (input: string, init: RequestInit) => Promise<Response>

type PlaybackInput = {
  apiKey: string
  filmaFileId: string
  notAfter: string
  allowedOrigin: string
  request?: FilmaFetch
}

export type FilmaPlaybackErrorCode =
  'FILE_NOT_FOUND' | 'FILMA_UNAVAILABLE' | 'INVALID_RESPONSE_SCHEMA'

export class FilmaPlaybackError extends Error {
  constructor(readonly code: FilmaPlaybackErrorCode) {
    super(code)
    this.name = 'FilmaPlaybackError'
  }
}

export type FilmaPlaybackLiveConfig = {
  apiKey: string
  fileId: string
  allowedOrigin: string
  deniedOrigin: string
}

export function readFilmaPlaybackLiveConfig(
  environment: Record<string, string | undefined>,
): FilmaPlaybackLiveConfig {
  const names = [
    'FILMA_LIVE_API_KEY',
    'FILMA_LIVE_FILE_ID',
    'FILMA_LIVE_ALLOWED_ORIGIN',
    'FILMA_LIVE_DENIED_ORIGIN',
  ] as const
  const missing = names.filter((name) => !environment[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`FILMA_LIVE_CONFIG_MISSING:${missing.join(',')}`)
  }
  return {
    apiKey: environment.FILMA_LIVE_API_KEY!,
    fileId: environment.FILMA_LIVE_FILE_ID!,
    allowedOrigin: environment.FILMA_LIVE_ALLOWED_ORIGIN!,
    deniedOrigin: environment.FILMA_LIVE_DENIED_ORIGIN!,
  }
}

const filmaOrigin = 'https://filma.biz'
const responseLimit = 64 * 1024
const timeoutMs = 5_000

function safeFilmaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === filmaOrigin
  } catch {
    return false
  }
}

async function readBoundedJson(response: Response, signal: AbortSignal) {
  const contentLength = response.headers.get('Content-Length')
  if (contentLength !== null && Number(contentLength) > responseLimit) {
    await response.body?.cancel().catch(() => undefined)
    throw new FilmaPlaybackError('FILMA_UNAVAILABLE')
  }
  if (!response.body) throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const result = await reader.read()
      if (signal.aborted) throw new FilmaPlaybackError('FILMA_UNAVAILABLE')
      if (result.done) break
      length += result.value.byteLength
      if (length > responseLimit) {
        await reader.cancel().catch(() => undefined)
        throw new FilmaPlaybackError('FILMA_UNAVAILABLE')
      }
      chunks.push(result.value)
    }
  } catch (error) {
    if (error instanceof FilmaPlaybackError) throw error
    throw new FilmaPlaybackError('FILMA_UNAVAILABLE')
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown
  } catch {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
}

async function requestPlayback(input: PlaybackInput) {
  if (!/^[1-9]\d{0,19}$/.test(input.filmaFileId)) {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  const notAfter = Date.parse(input.notAfter)
  if (!Number.isFinite(notAfter)) {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  const url = new URL(
    `/filmaapi/storage/${encodeURIComponent(input.filmaFileId)}`,
    filmaOrigin,
  )
  url.searchParams.set('jwt_expires_at', input.notAfter)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await (input.request ?? fetch)(url.toString(), {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Api-Key': input.apiKey,
        Origin: input.allowedOrigin,
      },
    })
  } catch {
    throw new FilmaPlaybackError('FILMA_UNAVAILABLE')
  } finally {
    clearTimeout(timeout)
  }
  if (response.status === 404) throw new FilmaPlaybackError('FILE_NOT_FOUND')
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined)
    throw new FilmaPlaybackError('FILMA_UNAVAILABLE')
  }
  return {
    payload: await readBoundedJson(response, controller.signal),
    notAfter,
  }
}

function validatedPlayback(
  payload: unknown,
  notAfter: number,
  requireExpiry: boolean,
) {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  const record = payload as Record<string, unknown>
  if (
    !safeFilmaUrl(record.url) ||
    !Number.isSafeInteger(record.mediafile_id) ||
    Number(record.mediafile_id) <= 0
  ) {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  const expiresAt =
    typeof record.expires_at === 'string' ? Date.parse(record.expires_at) : NaN
  if (
    requireExpiry &&
    (!Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      expiresAt > notAfter)
  ) {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  return {
    url: record.url,
    mediafileId: record.mediafile_id as number,
    expiresAt: Number.isFinite(expiresAt)
      ? new Date(expiresAt).toISOString()
      : null,
  }
}

export async function verifyFilmaFile(input: PlaybackInput) {
  const result = await requestPlayback(input)
  return validatedPlayback(result.payload, result.notAfter, false)
}

export async function issuePlaybackGrant(input: PlaybackInput) {
  const result = await requestPlayback(input)
  const grant = validatedPlayback(result.payload, result.notAfter, true)
  return { url: grant.url, expiresAt: grant.expiresAt! }
}
