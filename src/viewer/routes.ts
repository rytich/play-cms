export type ViewerRoute =
  | { kind: 'register'; returnTo?: string }
  | { kind: 'login'; returnTo?: string }
  | { kind: 'library' }
  | { kind: 'viewing'; publicId: string }
  | { kind: 'not-found' }

export function viewerRouteUrl(
  kind: Exclude<ViewerRoute['kind'], 'not-found'>,
  publicId?: string,
  returnTo?: string,
) {
  if (kind === 'viewing') {
    return publicId ? `/v/${encodeURIComponent(publicId)}` : '/v'
  }
  if ((kind === 'login' || kind === 'register') && returnTo) {
    return `/${kind}?returnTo=${encodeURIComponent(returnTo)}`
  }
  return `/${kind}`
}

function safeViewingReturnTo(value: string | null) {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value, 'http://play-cms.local')
  } catch {
    return null
  }
  if (url.origin !== 'http://play-cms.local' || url.search !== '') return null
  const route = parseViewerRoute(url.pathname, '')
  return route.kind === 'viewing'
    ? viewerRouteUrl('viewing', route.publicId)
    : null
}

export function parseViewerRoute(
  pathname: string,
  search: string,
): ViewerRoute {
  if (pathname === '/register' || pathname === '/login') {
    if (search === '')
      return { kind: pathname === '/login' ? 'login' : 'register' }
    const params = new URLSearchParams(search)
    if ([...params.keys()].some((key) => key !== 'returnTo')) {
      return { kind: 'not-found' }
    }
    const values = params.getAll('returnTo')
    if (values.length !== 1) return { kind: 'not-found' }
    const returnTo = safeViewingReturnTo(values[0]!)
    if (!returnTo) return { kind: 'not-found' }
    return {
      kind: pathname === '/login' ? 'login' : 'register',
      returnTo,
    }
  }
  if (search !== '') return { kind: 'not-found' }
  if (pathname === '/library') return { kind: 'library' }
  const match = /^\/v\/([^/]+)$/.exec(pathname)
  if (match) {
    try {
      const publicId = decodeURIComponent(match[1]!)
      if (publicId && !publicId.includes('/'))
        return { kind: 'viewing', publicId }
    } catch {
      return { kind: 'not-found' }
    }
  }
  return { kind: 'not-found' }
}
