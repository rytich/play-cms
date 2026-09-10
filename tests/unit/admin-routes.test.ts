import { describe, expect, it } from 'vitest'

import {
  adminFilmaUrl,
  adminLoginUrl,
  adminVideoCodesUrl,
  adminVideoEditUrl,
  parseAdminRoute,
  safeAdminReturnTo,
} from '../../src/admin/routes'

describe('admin routes', () => {
  it('derives each screen and valid list offset from the URL', () => {
    expect(adminFilmaUrl()).toBe('/admin/filma')
    expect(parseAdminRoute('/admin/filma', '')).toEqual({ kind: 'filma' })
    expect(parseAdminRoute('/admin/videos', '')).toEqual({
      kind: 'videos',
      offset: 0,
      filters: { q: '', status: null, from: null, to: null, offset: 0 },
    })
    expect(parseAdminRoute('/admin/videos', '?offset=100')).toEqual({
      kind: 'videos',
      offset: 100,
      filters: { q: '', status: null, from: null, to: null, offset: 100 },
    })
    expect(parseAdminRoute('/admin/videos/new', '?offset=100')).toEqual({
      kind: 'new-video',
      returnTo: '/admin/videos?offset=100',
    })
    expect(
      parseAdminRoute('/admin/videos/video%20one/edit', '?offset=100'),
    ).toEqual({
      kind: 'edit-video',
      videoId: 'video one',
      returnTo: '/admin/videos?offset=100',
    })
    expect(parseAdminRoute('/admin/videos/video-2/codes', '')).toEqual({
      kind: 'video-codes',
      videoId: 'video-2',
      returnTo: '/admin/videos',
      codeFilters: {
        codeId: '',
        setting: null,
        lifecycle: null,
        issuedFrom: null,
        issuedTo: null,
        offset: 0,
      },
    })
  })

  it('rejects invalid offsets, malformed IDs, and unknown pages', () => {
    const invalidRoutes: Array<[string, string]> = [
      ['/admin/videos', '?offset=-1'],
      ['/admin/videos', '?offset=100001'],
      ['/admin/videos', '?offset=1.5'],
      ['/admin/videos/video%2Fone/edit', ''],
      ['/admin/videos//codes', ''],
      ['/admin/unknown', ''],
      ['/admin/filma', '?secret=not-allowed'],
    ]
    for (const [pathname, search] of invalidRoutes) {
      expect(parseAdminRoute(pathname, search)).toEqual({ kind: 'not-found' })
    }
  })

  it('builds encoded video links while preserving only a valid offset', () => {
    expect(adminVideoEditUrl('video one', 100)).toBe(
      '/admin/videos/video%20one/edit?offset=100',
    )
    expect(adminVideoCodesUrl('video/one', 0)).toBe(
      '/admin/videos/video%2Fone/codes',
    )
  })

  it('allows login returns only to recognized same-site protected pages', () => {
    expect(safeAdminReturnTo('/admin/videos?offset=100')).toBe(
      '/admin/videos?offset=100',
    )
    expect(safeAdminReturnTo('/admin/videos/video-1/edit?offset=100')).toBe(
      '/admin/videos/video-1/edit?offset=100',
    )
    expect(safeAdminReturnTo('/admin/filma')).toBe('/admin/filma')
    for (const value of [
      null,
      '',
      'https://example.invalid/admin/videos',
      '//example.invalid/admin/videos',
      '/admin/login?returnTo=/admin/videos',
      '/admin/setup',
      '/admin/videos?offset=-1',
      '/v/public-id',
    ]) {
      expect(safeAdminReturnTo(value)).toBe('/admin/videos')
    }
  })

  it('encodes only a validated protected return path for login', () => {
    expect(adminLoginUrl('/admin/videos/video-1/codes?offset=100')).toBe(
      '/admin/login?returnTo=%2Fadmin%2Fvideos%2Fvideo-1%2Fcodes%3Foffset%3D100',
    )
    expect(adminLoginUrl('https://example.invalid/admin/videos')).toBe(
      '/admin/login?returnTo=%2Fadmin%2Fvideos',
    )
  })

  it('round-trips independent video and code filters and resets only the submitted list', () => {
    const search =
      '?q=Title_%25&status=published&from=2026-09-09T00%3A00%3A00.000Z&offset=100' +
      '&codeId=00000000-0000-4000-8000-000000000001&setting=disabled&lifecycle=unused' +
      '&issuedFrom=2026-09-09T00%3A00%3A00.000Z&codesOffset=200'
    const route = parseAdminRoute('/admin/videos/video-1/codes', search)
    expect(route).toMatchObject({
      kind: 'video-codes',
      videoId: 'video-1',
      returnTo:
        '/admin/videos?q=Title_%25&status=published&from=2026-09-09T00%3A00%3A00.000Z&offset=100',
      codeFilters: {
        codeId: '00000000-0000-4000-8000-000000000001',
        setting: 'disabled',
        lifecycle: 'unused',
        issuedFrom: '2026-09-09T00:00:00.000Z',
        issuedTo: null,
        offset: 200,
      },
    })
  })

  it('rejects duplicate, unknown, and invalid known filters', () => {
    for (const search of [
      '?q=a&q=b',
      '?other=x',
      '?status=public',
      '?from=2026-09-10T00%3A00%3A00Z&to=2026-09-10T00%3A00%3A00Z',
    ]) {
      expect(parseAdminRoute('/admin/videos', search)).toEqual({
        kind: 'not-found',
      })
    }
  })
})
