import { describe, expect, it } from 'vitest'

import { parseViewerRoute, viewerRouteUrl } from '../../src/viewer/routes'

describe('viewer routes', () => {
  it('round-trips each public viewer screen to one exact URL', () => {
    expect(viewerRouteUrl('register')).toBe('/register')
    expect(viewerRouteUrl('login')).toBe('/login')
    expect(viewerRouteUrl('library')).toBe('/library')
    expect(parseViewerRoute('/register', '')).toEqual({ kind: 'register' })
    expect(parseViewerRoute('/login', '')).toEqual({ kind: 'login' })
    expect(parseViewerRoute('/library', '')).toEqual({ kind: 'library' })
    expect(viewerRouteUrl('viewing', 'public one')).toBe('/v/public%20one')
    expect(parseViewerRoute('/v/public%20one', '')).toEqual({
      kind: 'viewing',
      publicId: 'public one',
    })
    expect(viewerRouteUrl('login', undefined, '/v/public%20one')).toBe(
      '/login?returnTo=%2Fv%2Fpublic%2520one',
    )
    expect(
      parseViewerRoute('/login', '?returnTo=%2Fv%2Fpublic%2520one'),
    ).toEqual({ kind: 'login', returnTo: '/v/public%20one' })
  })

  it('does not broaden unknown, nested, or query-bearing URLs', () => {
    for (const [pathname, search] of [
      ['/register/', ''],
      ['/admin/login', ''],
      ['/library/item', ''],
      ['/login', '?returnTo=%2Flibrary'],
      ['/login', '?returnTo=https%3A%2F%2Fexample.invalid'],
      ['/v/public%2Fone', ''],
    ]) {
      expect(parseViewerRoute(pathname!, search!)).toEqual({
        kind: 'not-found',
      })
    }
  })
})
