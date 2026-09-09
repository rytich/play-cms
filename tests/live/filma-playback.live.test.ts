import { setTimeout as wait } from 'node:timers/promises'
import { expect, test } from 'vitest'

import {
  issuePlaybackGrant,
  readFilmaPlaybackLiveConfig,
} from '../../src/adapters/filma/playback-client.js'

test('Filma playback grant satisfies the invite and public contract checks', async () => {
  const config = readFilmaPlaybackLiveConfig(process.env)
  const notAfter = new Date(Date.now() + 10_000).toISOString()
  const grant = await issuePlaybackGrant({
    apiKey: config.apiKey,
    filmaFileId: config.fileId,
    notAfter,
    allowedOrigin: config.allowedOrigin,
  })
  expect(Date.parse(grant.expiresAt)).toBeLessThanOrEqual(Date.parse(notAfter))

  const allowed = await fetch(grant.url, {
    redirect: 'error',
    headers: { Origin: config.allowedOrigin },
  })
  const denied = await fetch(grant.url, {
    redirect: 'error',
    headers: { Origin: config.deniedOrigin },
  })
  expect(allowed.ok).toBe(true)
  expect(denied.status).toBe(403)
  await allowed.body?.cancel()
  await denied.body?.cancel()

  await wait(11_000)
  const expiredGrant = await fetch(grant.url, {
    redirect: 'error',
    headers: { Origin: config.allowedOrigin },
  })
  expect(expiredGrant.ok).toBe(false)
  await expiredGrant.body?.cancel()
  await expect(
    issuePlaybackGrant({
      apiKey: config.apiKey,
      filmaFileId: config.fileId,
      notAfter,
      allowedOrigin: config.allowedOrigin,
    }),
  ).rejects.toBeDefined()

  console.info(
    JSON.stringify({
      classification: 'all-conditions-passed',
      grantStatus: allowed.status,
      deniedOriginStatus: denied.status,
      expiredGrantStatus: expiredGrant.status,
      expiresWithinRequestedLimit: true,
    }),
  )
})
