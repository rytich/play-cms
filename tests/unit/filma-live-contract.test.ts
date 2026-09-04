import { describe, expect, it } from 'vitest'

import {
  FilmaContractError,
  readFilmaLiveConfig,
  verifyFilmaTokenContract,
} from '../../src/adapters/filma/live-contract.js'

describe('Filma live token contract', () => {
  it.each([
    [{ FILMA_API_HOST: 'filma.example' }, 'FILMA_LIVE_API_KEY'],
    [{ FILMA_LIVE_API_KEY: 'test-key' }, 'FILMA_API_HOST'],
  ])('rejects missing live configuration without values', (env, variable) => {
    expect(() => readFilmaLiveConfig(env)).toThrowError(
      new FilmaContractError('MISSING_CONFIGURATION', variable),
    )
  })

  it.each([
    'https://filma.example',
    'filma.example/path',
    'user@filma.example',
  ])('rejects unsafe API host %s before sending credentials', (apiHost) => {
    expect(() =>
      readFilmaLiveConfig({
        FILMA_API_HOST: apiHost,
        FILMA_LIVE_API_KEY: 'test-key',
      }),
    ).toThrowError(new FilmaContractError('INVALID_API_HOST'))
  })

  it('posts the API key to the configured HTTPS token endpoint', async () => {
    const requests: Array<{ input: string; init: RequestInit }> = []

    await verifyFilmaTokenContract(
      { apiHost: 'staging.filma.example', apiKey: 'dedicated-test-key' },
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

    expect(requests).toEqual([
      {
        input: 'https://staging.filma.example/filmaapi/token',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': 'dedicated-test-key',
          },
          body: '{}',
        },
      },
    ])
  })

  it('returns only a redacted summary for a valid token response', async () => {
    const apiKey = 'test-api-key-that-must-not-leak'
    const jwt = 'test-jwt-that-must-not-leak'
    const organizationId = 42

    const result = await verifyFilmaTokenContract(
      { apiHost: 'filma.example', apiKey },
      () =>
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
        { apiHost: 'filma.example', apiKey: 'test-key' },
        () => Promise.resolve(response),
      )

      await expect(operation).rejects.toEqual(new FilmaContractError(code))
      expect(bodyRead).toBe(false)
    },
  )

  it('maps network failures without exposing the API key', async () => {
    const apiKey = 'network-secret-that-must-not-leak'

    const operation = verifyFilmaTokenContract(
      { apiHost: 'filma.example', apiKey },
      () => Promise.reject(new Error(`failed with ${apiKey}`)),
    )

    await expect(operation).rejects.toEqual(
      new FilmaContractError('FILMA_UNAVAILABLE'),
    )
    await operation.catch((error: unknown) => {
      expect(String(error)).not.toContain(apiKey)
    })
  })

  it('maps unreadable successful responses without exposing their body', async () => {
    const responseBody = 'response-secret-that-must-not-leak'
    const response = new Response('{}', { status: 200 })
    response.json = () => Promise.reject(new Error(responseBody))

    const operation = verifyFilmaTokenContract(
      { apiHost: 'filma.example', apiKey: 'test-key' },
      () => Promise.resolve(response),
    )

    await expect(operation).rejects.toEqual(
      new FilmaContractError('INVALID_RESPONSE_SCHEMA'),
    )
    await operation.catch((error: unknown) => {
      expect(String(error)).not.toContain(responseBody)
    })
  })

  it('maps a null successful response to a sanitized schema error', async () => {
    const response = new Response('null', { status: 200 })

    await expect(
      verifyFilmaTokenContract(
        { apiHost: 'filma.example', apiKey: 'test-key' },
        () => Promise.resolve(response),
      ),
    ).rejects.toEqual(new FilmaContractError('INVALID_RESPONSE_SCHEMA'))
  })
})
