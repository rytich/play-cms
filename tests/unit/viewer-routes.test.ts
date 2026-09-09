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
  })

  it('does not broaden unknown, nested, or query-bearing URLs', () => {
    for (const [pathname, search] of [
      ['/register/', ''],
      ['/admin/login', ''],
      ['/library/item', ''],
      ['/login', '?returnTo=%2Flibrary'],
    ]) {
      expect(parseViewerRoute(pathname!, search!)).toEqual({
        kind: 'not-found',
      })
    }
  })
})
