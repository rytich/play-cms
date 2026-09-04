import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  FilmaContractError,
  readFilmaLiveConfig,
  verifyFilmaTokenContract,
} from '../../src/adapters/filma/live-contract.js'

describe('Filma live token contract', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a missing live API key', () => {
    expect(() => readFilmaLiveConfig({})).toThrowError(
      new FilmaContractError('MISSING_CONFIGURATION', 'FILMA_LIVE_API_KEY'),
    )
  })

  it('does not accept a live API host from the environment', () => {
    expect(
      readFilmaLiveConfig({
        FILMA_API_HOST: 'attacker.example',
        FILMA_LIVE_API_KEY: 'test-key',
      }),
    ).toEqual({ apiKey: 'test-key' })
  })

  it('posts the API key only to the fixed Filma HTTPS token endpoint', async () => {
    const requests: Array<{ input: string; init: RequestInit }> = []

    await verifyFilmaTokenContract(
      { apiKey: 'dedicated-test-key' },
      (input, init) => {
        requests.push({ input, init })
        return Promise.resolve(
          new Response(
            JSON.stringify({ organization_id: 42, api_type: 'readonly' }),
            { status: 200 },
          ),
        )
      },
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]?.input).toBe('https://filma.biz/filmaapi/token')
    expect(requests[0]?.init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'dedicated-test-key',
      },
      body: '{}',
    })
    expect(requests[0]?.init.signal).toBeInstanceOf(AbortSignal)
  })

  it('returns only a redacted summary for a valid token response', async () => {
    const apiKey = 'test-api-key-that-must-not-leak'
    const jwt = 'test-jwt-that-must-not-leak'
    const organizationId = 42

    const result = await verifyFilmaTokenContract({ apiKey }, () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            organization_id: organizationId,
            api_type: 'readonly',
            token: jwt,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    )

    expect(result).toEqual({
      status: 200,
      fields: ['organization_id', 'api_type'],
      apiType: 'readonly',
    })
    expect(JSON.stringify(result)).not.toContain(apiKey)
    expect(JSON.stringify(result)).not.toContain(jwt)
    expect(JSON.stringify(result)).not.toContain(String(organizationId))
  })

  it.each([
    [401, 'INVALID_API_KEY'],
    [403, 'DOMAIN_NOT_ALLOWED'],
    [429, 'FILMA_UNAVAILABLE'],
    [500, 'FILMA_UNAVAILABLE'],
  ] as const)(
    'maps HTTP %i to %s without reading its body',
    async (status, code) => {
      const secretBody = 'response-body-that-must-not-leak'
      let bodyRead = false
      let requestSignal: AbortSignal | null | undefined
      const response = new Response(secretBody, { status })
      const originalText = response.text.bind(response)
      response.text = () => {
        bodyRead = true
        return originalText()
      }
      response.json = () => {
        bodyRead = true
        return Promise.resolve({ token: secretBody })
      }

      const operation = verifyFilmaTokenContract(
        { apiKey: 'test-key' },
        (_input, init) => {
          requestSignal = init.signal
          return Promise.resolve(response)
        },
      )

      await expect(operation).rejects.toEqual(new FilmaContractError(code))
      expect(bodyRead).toBe(false)
      expect(requestSignal?.aborted).toBe(true)
    },
  )

  it('maps network failures without retrying or exposing the API key', async () => {
    const apiKey = 'network-secret-that-must-not-leak'
    let attempts = 0

    const operation = verifyFilmaTokenContract({ apiKey }, () => {
      attempts += 1
      return Promise.reject(new Error(`failed with ${apiKey}`))
    })

    await expect(operation).rejects.toEqual(
      new FilmaContractError('FILMA_UNAVAILABLE'),
    )
    await operation.catch((error: unknown) => {
      expect(String(error)).not.toContain(apiKey)
    })
    expect(attempts).toBe(1)
  })

  it('maps unreadable successful responses without exposing their body', async () => {
    const responseBody = 'response-secret-that-must-not-leak'
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error(responseBody))
        },
      }),
      { status: 200 },
    )

    const operation = verifyFilmaTokenContract({ apiKey: 'test-key' }, () =>
      Promise.resolve(response),
    )

    await expect(operation).rejects.toEqual(
      new FilmaContractError('FILMA_UNAVAILABLE'),
    )
    await operation.catch((error: unknown) => {
      expect(String(error)).not.toContain(responseBody)
    })
  })

  it('aborts an unavailable request after five seconds without retrying', async () => {
    vi.useFakeTimers()
    let attempts = 0

    const operation = verifyFilmaTokenContract(
      { apiKey: 'test-key' },
      (_input, init) => {
        attempts += 1
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('request aborted', 'AbortError'))
          })
        })
      },
    )
    const rejection = expect(operation).rejects.toEqual(
      new FilmaContractError('FILMA_UNAVAILABLE'),
    )

    await vi.advanceTimersByTimeAsync(4_999)
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    await rejection
    expect(attempts).toBe(1)
  })

  it('rejects a chunked response larger than 64 KiB without retrying', async () => {
    let attempts = 0
    const firstChunk = new Uint8Array(32 * 1024)
    const secondChunk = new Uint8Array(32 * 1024 + 1)

    const operation = verifyFilmaTokenContract({ apiKey: 'test-key' }, () => {
      attempts += 1
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(firstChunk)
              controller.enqueue(secondChunk)
              controller.close()
            },
          }),
          { status: 200 },
        ),
      )
    })

    await expect(operation).rejects.toEqual(
      new FilmaContractError('FILMA_UNAVAILABLE'),
    )
    expect(attempts).toBe(1)
  })

  it('cancels a response whose declared length exceeds 64 KiB', async () => {
    let canceled = false
    let requestSignal: AbortSignal | null | undefined
    const response = new Response(
      new ReadableStream({
        cancel() {
          canceled = true
        },
      }),
      {
        status: 200,
        headers: { 'content-length': String(64 * 1024 + 1) },
      },
    )

    const operation = verifyFilmaTokenContract(
      { apiKey: 'test-key' },
      (_input, init) => {
        requestSignal = init.signal
        return Promise.resolve(response)
      },
    )

    await expect(operation).rejects.toEqual(
      new FilmaContractError('FILMA_UNAVAILABLE'),
    )
    expect(canceled).toBe(true)
    expect(requestSignal?.aborted).toBe(true)
  })

  it('aborts a stalled response body after five seconds without retrying', async () => {
    vi.useFakeTimers()
    let attempts = 0
    let canceled = false

    const operation = verifyFilmaTokenContract({ apiKey: 'test-key' }, () => {
      attempts += 1
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{'))
            },
            cancel() {
              canceled = true
            },
          }),
          { status: 200 },
        ),
      )
    })
    const rejection = expect(operation).rejects.toEqual(
      new FilmaContractError('FILMA_UNAVAILABLE'),
    )

    await vi.advanceTimersByTimeAsync(5_000)
    await rejection
    expect(attempts).toBe(1)
    expect(canceled).toBe(true)
  })

  it('maps a null successful response to a sanitized schema error', async () => {
    const response = new Response('null', { status: 200 })

    await expect(
      verifyFilmaTokenContract({ apiKey: 'test-key' }, () =>
        Promise.resolve(response),
      ),
    ).rejects.toEqual(new FilmaContractError('INVALID_RESPONSE_SCHEMA'))
  })
})
