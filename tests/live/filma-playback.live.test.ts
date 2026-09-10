import { Buffer } from 'node:buffer'
import { setTimeout as wait } from 'node:timers/promises'
import { expect, test } from 'vitest'

import {
  classifyFilmaPlaybackLiveEvidence,
  FilmaPlaybackError,
  issuePlaybackGrant,
  readFilmaPlaybackLiveConfig,
  verifyFilmaFile,
  type FilmaPlaybackErrorCode,
  type FilmaPlaybackLiveEvidence,
} from '../../src/adapters/filma/playback-client.js'

const emptyEvidence = (): FilmaPlaybackLiveEvidence => ({
  storageStatus: null,
  notFoundStatus: null,
  invalidCredentialStatus: null,
  deniedStorageOriginStatus: null,
  allowedPlaybackStatus: null,
  deniedPlaybackOriginStatus: null,
  expiredPlaybackStatus: null,
  expiredRefreshStatus: null,
  tokenExpiryWithinLimit: null,
  tokenMatchesMedia: null,
})

async function rejectedStorageStatus(
  input: Parameters<typeof verifyFilmaFile>[0],
  expected: FilmaPlaybackErrorCode,
  status: number,
) {
  try {
    await verifyFilmaFile(input)
  } catch (error) {
    if (error instanceof FilmaPlaybackError && error.code === expected) {
      return status
    }
  }
  throw new Error('FILMA_LIVE_UNEXPECTED_STORAGE_RESULT')
}

async function fetchStatus(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    })
    await response.body?.cancel().catch(() => undefined)
    return response.status
  } finally {
    clearTimeout(timeout)
  }
}

function playbackTokenClaims(url: string) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.origin !== 'https://filma.biz') {
    throw new Error('FILMA_LIVE_UNEXPECTED_PLAYBACK_URL')
  }
  const token = parsed.searchParams.get('jwt')
  const parts = token?.split('.')
  if (!token || parts?.length !== 3) {
    throw new Error('FILMA_LIVE_PLAYBACK_TOKEN_MISSING')
  }
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
  } catch {
    throw new Error('FILMA_LIVE_PLAYBACK_TOKEN_INVALID')
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('FILMA_LIVE_PLAYBACK_TOKEN_INVALID')
  }
  const { exp, mediafile_id: mediafileId } = payload as Record<string, unknown>
  if (!Number.isSafeInteger(exp) || !Number.isSafeInteger(mediafileId)) {
    throw new Error('FILMA_LIVE_PLAYBACK_TOKEN_INVALID')
  }
  return { token, expiresAtMs: Number(exp) * 1_000, mediafileId }
}

test('Filma playback live gate classifies the real status, token, origin, and refresh contract', async () => {
  const evidence = emptyEvidence()
  let config: ReturnType<typeof readFilmaPlaybackLiveConfig>
  try {
    config = readFilmaPlaybackLiveConfig(process.env)
  } catch (error) {
    console.info(
      JSON.stringify({ classification: 'test-infrastructure-error' }),
    )
    throw error
  }

  try {
    const notAfter = new Date(Date.now() + 10_000).toISOString()
    const common = {
      apiKey: config.apiKey,
      notAfter,
      allowedOrigin: config.allowedOrigin,
    }
    const verified = await verifyFilmaFile({
      ...common,
      filmaFileId: config.fileId,
    })
    evidence.storageStatus = 200
    evidence.notFoundStatus = await rejectedStorageStatus(
      { ...common, filmaFileId: config.notFoundFileId },
      'FILE_NOT_FOUND',
      404,
    )
    evidence.invalidCredentialStatus = await rejectedStorageStatus(
      {
        ...common,
        apiKey: config.invalidApiKey,
        filmaFileId: config.fileId,
      },
      'INVALID_API_KEY',
      401,
    )
    evidence.deniedStorageOriginStatus = await rejectedStorageStatus(
      {
        ...common,
        filmaFileId: config.fileId,
        allowedOrigin: config.deniedOrigin,
      },
      'DOMAIN_NOT_ALLOWED',
      403,
    )

    const grant = await issuePlaybackGrant({
      ...common,
      filmaFileId: config.fileId,
    })
    const claims = playbackTokenClaims(grant.url)
    evidence.tokenExpiryWithinLimit =
      claims.expiresAtMs > Date.now() &&
      claims.expiresAtMs <= Date.parse(notAfter)
    evidence.tokenMatchesMedia = claims.mediafileId === verified.mediafileId
    evidence.allowedPlaybackStatus = await fetchStatus(grant.url, {
      method: 'GET',
      headers: { Origin: config.allowedOrigin },
    })
    evidence.deniedPlaybackOriginStatus = await fetchStatus(grant.url, {
      method: 'GET',
      headers: { Origin: config.deniedOrigin },
    })

    await wait(Math.max(0, Date.parse(notAfter) - Date.now() + 1_000))
    evidence.expiredPlaybackStatus = await fetchStatus(grant.url, {
      method: 'GET',
      headers: { Origin: config.allowedOrigin },
    })
    evidence.expiredRefreshStatus = await fetchStatus(
      'https://filma.biz/filmaapi/token/refresh',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${claims.token}`,
          'Content-Type': 'application/json',
          Origin: config.allowedOrigin,
        },
        body: '{}',
      },
    )
  } catch {
    console.info(
      JSON.stringify({
        classification: 'test-infrastructure-error',
        ...evidence,
      }),
    )
    throw new Error('FILMA_PLAYBACK_LIVE:test-infrastructure-error')
  }

  const classification = classifyFilmaPlaybackLiveEvidence(evidence)
  console.info(JSON.stringify({ classification, ...evidence }))
  expect(classification).toBe('all-conditions-passed')
})
