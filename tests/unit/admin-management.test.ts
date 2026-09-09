import { describe, expect, it } from 'vitest'

import {
  codeMatchesIssuedRange,
  isCodeEligibleForBulk,
  parseBulkCodeInput,
  parseBulkVideoInput,
  parseCodeFilters,
  parseVideoFilters,
  videoMatchesRange,
} from '../../src/core/admin-management'

const ids = Array.from(
  { length: 101 },
  (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
)

describe('admin management input', () => {
  it('accepts only one to 100 distinct UUIDs and exact bulk fields', () => {
    expect(parseBulkVideoInput({ ids: [ids[0]], status: 'published' })).toEqual(
      {
        ids: [ids[0]],
        status: 'published',
      },
    )
    expect(
      parseBulkCodeInput({ ids: ids.slice(0, 100), enabled: false }),
    ).toEqual({ ids: ids.slice(0, 100), enabled: false })

    for (const input of [
      { ids: [], status: 'draft' },
      { ids, status: 'draft' },
      { ids: [ids[0], ids[0]], status: 'draft' },
      { ids: [1], status: 'draft' },
      { ids: [ids[0]], status: 'other' },
      { ids: [ids[0]], status: 'draft', extra: true },
    ]) {
      expect(parseBulkVideoInput(input)).toBeNull()
    }
    expect(parseBulkCodeInput({ ids: [ids[0]], enabled: 'false' })).toBeNull()
  })

  it('validates and normalizes video filters without broadening bad input', () => {
    expect(
      parseVideoFilters(
        new URLSearchParams({
          q: '日本語_%'.repeat(20),
          status: 'published',
          from: '2026-09-09T09:00:00+09:00',
          to: '2026-09-10T00:00:00Z',
          offset: '100',
        }),
      ),
    ).toEqual({
      q: '日本語_%'.repeat(20),
      status: 'published',
      from: '2026-09-09T00:00:00.000Z',
      to: '2026-09-10T00:00:00.000Z',
      offset: 100,
    })
    expect(
      parseVideoFilters(new URLSearchParams({ q: 'あ'.repeat(101) })),
    ).toBeNull()
    expect(
      parseVideoFilters(new URLSearchParams({ from: '2026-02-31T12:00:00Z' })),
    ).toBeNull()
    expect(
      parseVideoFilters(
        new URLSearchParams({ from: '2028-02-29T12:34:56.123Z' }),
      )?.from,
    ).toBe('2028-02-29T12:34:56.123Z')
    expect(
      parseVideoFilters(
        new URLSearchParams({ from: '2028-02-29T21:34:56.123+09:00' }),
      )?.from,
    ).toBe('2028-02-29T12:34:56.123Z')
    expect(parseVideoFilters(new URLSearchParams('q=a&q=b'))).toBeNull()
    expect(parseVideoFilters(new URLSearchParams({ unknown: 'x' }))).toBeNull()
    expect(
      parseVideoFilters(
        new URLSearchParams({
          from: '2026-09-10T00:00:00Z',
          to: '2026-09-10T00:00:00Z',
        }),
      ),
    ).toBeNull()
  })

  it('keeps code filters and their offset distinct from video filters', () => {
    expect(
      parseCodeFilters(
        new URLSearchParams({
          codeId: ids[0]!,
          setting: 'disabled',
          lifecycle: 'unused',
          issuedFrom: '2026-09-09T00:00:00Z',
          issuedTo: '2026-09-10T00:00:00Z',
          codesOffset: '100',
        }),
        'codesOffset',
      ),
    ).toEqual({
      codeId: ids[0],
      setting: 'disabled',
      lifecycle: 'unused',
      issuedFrom: '2026-09-09T00:00:00.000Z',
      issuedTo: '2026-09-10T00:00:00.000Z',
      offset: 100,
    })
    expect(
      parseCodeFilters(new URLSearchParams({ lifecycle: 'used' })),
    ).not.toBeNull()
    expect(
      parseCodeFilters(new URLSearchParams({ setting: 'other' })),
    ).toBeNull()
  })

  it('uses half-open ranges for videos and code issue times', () => {
    const video = {
      startsAt: '2026-09-09T00:00:00.000Z',
      endsAt: '2026-09-10T00:00:00.000Z',
    }
    expect(videoMatchesRange(video, null, '2026-09-09T00:00:00.000Z')).toBe(
      false,
    )
    expect(videoMatchesRange(video, null, '2026-09-09T00:00:00.001Z')).toBe(
      true,
    )
    expect(videoMatchesRange(video, '2026-09-10T00:00:00.000Z', null)).toBe(
      false,
    )
    expect(codeMatchesIssuedRange(100, 100, null)).toBe(true)
    expect(codeMatchesIssuedRange(100, null, 100)).toBe(false)
  })

  it('allows only unused, unrevoked keys and rejects expired re-enablement', () => {
    const current = {
      lifecycle: 'unused' as const,
      revoked: false,
      endsAt: 200,
    }
    expect(isCodeEligibleForBulk(current, false, 200)).toBe(true)
    expect(isCodeEligibleForBulk(current, true, 199)).toBe(true)
    expect(isCodeEligibleForBulk(current, true, 200)).toBe(false)
    expect(
      isCodeEligibleForBulk({ ...current, lifecycle: 'used' }, false, 100),
    ).toBe(false)
    expect(
      isCodeEligibleForBulk({ ...current, revoked: true }, false, 100),
    ).toBe(false)
  })
})
