export type FilmaLiveConfig = {
  apiKey: string
}

export type FilmaContractSummary = {
  status: 200
  fields: ['organization_id', 'api_type']
  apiType: 'readonly' | 'fullaccess'
}

type FilmaFetch = (input: string, init: RequestInit) => Promise<Response>

export type FilmaContractErrorCode =
  | 'INVALID_API_KEY'
  | 'DOMAIN_NOT_ALLOWED'
  | 'FILMA_UNAVAILABLE'
  | 'INVALID_RESPONSE_SCHEMA'
  | 'MISSING_CONFIGURATION'

export class FilmaContractError extends Error {
  constructor(
    readonly code: FilmaContractErrorCode,
    readonly field?: string,
  ) {
    super(field === undefined ? code : `${code}:${field}`)
    this.name = 'FilmaContractError'
  }
}

const filmaTokenEndpoint = 'https://filma.biz/filmaapi/token'
const filmaRequestTimeoutMs = 5_000
const filmaResponseLimitBytes = 64 * 1024

class FilmaResponseTooLargeError extends Error {}
class FilmaResponseReadError extends Error {}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  if (body === null) {
    return
  }

  try {
    void body.cancel().catch(() => undefined)
  } catch {
    return
  }
}

async function readBoundedBody(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > filmaResponseLimitBytes
  ) {
    cancelBody(response.body)
    throw new FilmaResponseTooLargeError()
  }

  if (response.body === null) {
    return ''
  }

  const reader = response.body.getReader()
  const cancelOnAbort = () => {
    void reader.cancel().catch(() => undefined)
  }
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  signal.addEventListener('abort', cancelOnAbort, { once: true })
  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch {
        throw new FilmaResponseReadError()
      }

      if (signal.aborted) {
        throw new FilmaResponseReadError()
      }
      if (result.done) {
        break
      }

      totalBytes += result.value.byteLength
      if (totalBytes > filmaResponseLimitBytes) {
        void reader.cancel().catch(() => undefined)
        throw new FilmaResponseTooLargeError()
      }
      chunks.push(result.value)
    }
  } finally {
    signal.removeEventListener('abort', cancelOnAbort)
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(body)
}

export function readFilmaLiveConfig(
  env: Record<string, string | undefined>,
): FilmaLiveConfig {
  const apiKey = env.FILMA_LIVE_API_KEY

  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new FilmaContractError('MISSING_CONFIGURATION', 'FILMA_LIVE_API_KEY')
  }

  return { apiKey }
}

export async function verifyFilmaTokenContract(
  config: FilmaLiveConfig,
  request: FilmaFetch = fetch,
): Promise<FilmaContractSummary> {
  const controller = new AbortController()
  let response: Response | undefined
  const timeout = setTimeout(() => {
    controller.abort()
  }, filmaRequestTimeoutMs)

  try {
    try {
      response = await request(filmaTokenEndpoint, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.apiKey,
        },
        body: '{}',
      })
    } catch {
      throw new FilmaContractError('FILMA_UNAVAILABLE')
    }

    if (response.status === 401) {
      throw new FilmaContractError('INVALID_API_KEY')
    }
    if (response.status === 403) {
      throw new FilmaContractError('DOMAIN_NOT_ALLOWED')
    }
    if (response.status !== 200) {
      throw new FilmaContractError('FILMA_UNAVAILABLE')
    }

    let payload: unknown
    let responseBody: string
    try {
      responseBody = await readBoundedBody(response, controller.signal)
    } catch (error) {
      if (
        error instanceof FilmaResponseTooLargeError ||
        error instanceof FilmaResponseReadError ||
        controller.signal.aborted
      ) {
        throw new FilmaContractError('FILMA_UNAVAILABLE')
      }
      throw new FilmaContractError('FILMA_UNAVAILABLE')
    }

    try {
      payload = JSON.parse(responseBody) as unknown
    } catch {
      throw new FilmaContractError('INVALID_RESPONSE_SCHEMA')
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new FilmaContractError('INVALID_RESPONSE_SCHEMA')
    }

    const record = payload as Record<string, unknown>

    if (
      !Number.isInteger(record.organization_id) ||
      (record.api_type !== 'readonly' && record.api_type !== 'fullaccess')
    ) {
      throw new FilmaContractError('INVALID_RESPONSE_SCHEMA')
    }

    return {
      status: 200,
      fields: ['organization_id', 'api_type'],
      apiType: record.api_type,
    }
  } finally {
    clearTimeout(timeout)
    controller.abort()
    if (response !== undefined && !response.bodyUsed) {
      cancelBody(response.body)
    }
  }
}
