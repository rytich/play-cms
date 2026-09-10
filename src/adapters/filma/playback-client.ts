type FilmaFetch = (input: string, init: RequestInit) => Promise<Response>

type PlaybackInput = {
  apiKey: string
  filmaFileId: string
  notAfter: string
  allowedOrigin: string
  request?: FilmaFetch
}

export type FilmaPlaybackErrorCode =
  | 'FILE_NOT_FOUND'
  | 'INVALID_API_KEY'
  | 'DOMAIN_NOT_ALLOWED'
  | 'FILMA_UNAVAILABLE'
  | 'INVALID_RESPONSE_SCHEMA'

export class FilmaPlaybackError extends Error {
  constructor(readonly code: FilmaPlaybackErrorCode) {
    super(code)
    this.name = 'FilmaPlaybackError'
  }
}

export type FilmaPlaybackLiveConfig = {
  apiKey: string
  fileId: string
  notFoundFileId: string
  invalidApiKey: string
  allowedOrigin: string
  deniedOrigin: string
}

export type FilmaPlaybackLiveClassification =
  'all-conditions-passed' | 'contract-denied' | 'test-infrastructure-error'

export type FilmaPlaybackLiveEvidence = {
  storageStatus: number | null
  notFoundStatus: number | null
  invalidCredentialStatus: number | null
  deniedStorageOriginStatus: number | null
  allowedPlaybackStatus: number | null
  deniedPlaybackOriginStatus: number | null
  expiredPlaybackStatus: number | null
  expiredRefreshStatus: number | null
  tokenExpiryWithinLimit: boolean | null
  tokenMatchesMedia: boolean | null
}

export function classifyFilmaPlaybackLiveEvidence(
  evidence: FilmaPlaybackLiveEvidence,
): FilmaPlaybackLiveClassification {
  if (
    evidence.storageStatus !== 200 ||
    evidence.notFoundStatus !== 404 ||
    evidence.invalidCredentialStatus !== 401 ||
    evidence.deniedStorageOriginStatus !== 403 ||
    evidence.allowedPlaybackStatus === null ||
    evidence.allowedPlaybackStatus < 200 ||
    evidence.allowedPlaybackStatus >= 300 ||
    evidence.deniedPlaybackOriginStatus === null ||
    evidence.expiredPlaybackStatus === null ||
    evidence.expiredRefreshStatus === null ||
    evidence.tokenExpiryWithinLimit === null ||
    evidence.tokenMatchesMedia === null
  ) {
    return 'test-infrastructure-error'
  }
  if (
    evidence.deniedPlaybackOriginStatus >= 500 ||
    evidence.expiredPlaybackStatus >= 500 ||
    evidence.expiredRefreshStatus >= 500
  ) {
    return 'test-infrastructure-error'
  }
  if (
    evidence.deniedPlaybackOriginStatus >= 200 &&
    evidence.deniedPlaybackOriginStatus < 300
  ) {
    return 'contract-denied'
  }
  if (evidence.deniedPlaybackOriginStatus !== 403) {
    return 'test-infrastructure-error'
  }
  if (
    !evidence.tokenExpiryWithinLimit ||
    !evidence.tokenMatchesMedia ||
    (evidence.expiredPlaybackStatus >= 200 &&
      evidence.expiredPlaybackStatus < 300) ||
    (evidence.expiredRefreshStatus >= 200 &&
      evidence.expiredRefreshStatus < 300)
  ) {
    return 'contract-denied'
  }
  return 'all-conditions-passed'
}

export function readFilmaPlaybackLiveConfig(
  environment: Record<string, string | undefined>,
): FilmaPlaybackLiveConfig {
  const names = [
    'FILMA_LIVE_API_KEY',
    'FILMA_LIVE_FILE_ID',
    'FILMA_LIVE_NOT_FOUND_FILE_ID',
    'FILMA_LIVE_INVALID_API_KEY',
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
    notFoundFileId: environment.FILMA_LIVE_NOT_FOUND_FILE_ID!,
    invalidApiKey: environment.FILMA_LIVE_INVALID_API_KEY!,
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

function playbackJwtClaims(url: string) {
  const token = new URL(url).searchParams.get('jwt')
  const parts = token?.split('.')
  if (!token || parts?.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1]!)) {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  const base64 = parts[1]!.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  let payload: unknown
  try {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    )
    payload = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    )
  } catch {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  const { exp, mediafile_id: mediafileId } = payload as Record<string, unknown>
  if (!Number.isSafeInteger(exp) || !Number.isSafeInteger(mediafileId)) {
    throw new FilmaPlaybackError('INVALID_RESPONSE_SCHEMA')
  }
  return { expiresAt: Number(exp) * 1_000, mediafileId: Number(mediafileId) }
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new FilmaPlaybackError('FILMA_UNAVAILABLE')
  let rejectAborted!: (reason: FilmaPlaybackError) => void
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = reject
  })
  const onAbort = () =>
    rejectAborted(new FilmaPlaybackError('FILMA_UNAVAILABLE'))
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([reader.read(), aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
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
      const result = await readWithAbort(reader, signal)
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
    if (signal.aborted) await reader.cancel().catch(() => undefined)
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
  try {
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
    }
    if (response.status === 404) throw new FilmaPlaybackError('FILE_NOT_FOUND')
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined)
      throw new FilmaPlaybackError('INVALID_API_KEY')
    }
    if (response.status === 403) {
      await response.body?.cancel().catch(() => undefined)
      throw new FilmaPlaybackError('DOMAIN_NOT_ALLOWED')
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined)
      throw new FilmaPlaybackError('FILMA_UNAVAILABLE')
    }
    return {
      payload: await readBoundedJson(response, controller.signal),
      notAfter,
    }
  } finally {
    clearTimeout(timeout)
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
  const claims = requireExpiry ? playbackJwtClaims(record.url) : null
  const expiresAt = claims?.expiresAt ?? NaN
  if (
    requireExpiry &&
    (!Number.isFinite(expiresAt) ||
      claims?.mediafileId !== record.mediafile_id ||
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
