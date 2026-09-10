import { describe, expect, it } from 'vitest'

import {
  isViewerAvailable,
  parseViewingCode,
  playbackNotAfter,
} from '../../src/core/viewing'
import {
  decryptSecret,
  encryptSecret,
} from '../../src/adapters/secrets/web-crypto'

describe('viewing core', () => {
  it('normalizes a displayed Crockford code without accepting ambiguous symbols', () => {
    expect(parseViewingCode('0123-4567-89ab-cdef')).toBe('0123456789ABCDEF')
    expect(parseViewingCode(' 0123 4567\t89AB\nCDEF ')).toBe('0123456789ABCDEF')
    for (const invalid of [
      '0123456789ABCDE',
      '0123456789ABCDEFG',
      '0123456789ABCDEI',
      '0123456789ABCDEO',
      '0123456789ABCDEU',
      '0123_4567_89AB_CDEF',
      123,
    ]) {
      expect(parseViewingCode(invalid)).toBeNull()
    }
  })

  it('uses the single published and half-open availability rule', () => {
    const video = {
      status: 'published' as const,
      startsAt: '2026-09-09T00:00:00.000Z',
      endsAt: '2026-09-09T00:05:00.000Z',
    }
    expect(isViewerAvailable(video, Date.parse(video.startsAt))).toBe(true)
    expect(isViewerAvailable(video, Date.parse(video.endsAt) - 1)).toBe(true)
    expect(isViewerAvailable(video, Date.parse(video.endsAt))).toBe(false)
    expect(
      isViewerAvailable(
        { ...video, status: 'draft' },
        Date.parse(video.startsAt),
      ),
    ).toBe(false)
    expect(isViewerAvailable({ ...video, startsAt: 'invalid' }, 0)).toBe(false)
  })

  it('caps grants at five minutes and the video end', () => {
    const now = Date.parse('2026-09-09T00:00:00.000Z')
    expect(playbackNotAfter(now, '2026-09-09T01:00:00.000Z')).toBe(
      '2026-09-09T00:05:00.000Z',
    )
    expect(playbackNotAfter(now, '2026-09-09T00:03:00.000Z')).toBe(
      '2026-09-09T00:03:00.000Z',
    )
    expect(playbackNotAfter(now, 'invalid')).toBeNull()
  })

  it('round-trips encrypted settings without retaining plaintext fields', async () => {
    const key = '11'.repeat(32)
    const encrypted = await encryptSecret(key, 'synthetic-api-key')
    expect(encrypted.ciphertext).toMatch(/^[0-9a-f]+$/)
    expect(encrypted.nonce).toMatch(/^[0-9a-f]{24}$/)
    expect(JSON.stringify(encrypted)).not.toContain('synthetic-api-key')
    await expect(decryptSecret(key, encrypted)).resolves.toBe(
      'synthetic-api-key',
    )
    await expect(decryptSecret('22'.repeat(32), encrypted)).rejects.toThrow()
  })
})
