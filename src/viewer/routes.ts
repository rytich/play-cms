export type ViewerRoute =
  | { kind: 'register' }
  | { kind: 'login' }
  | { kind: 'library' }
  | { kind: 'not-found' }

export function viewerRouteUrl(
  kind: Exclude<ViewerRoute['kind'], 'not-found'>,
) {
  return `/${kind}`
}

export function parseViewerRoute(
  pathname: string,
  search: string,
): ViewerRoute {
  if (search !== '') return { kind: 'not-found' }
  if (pathname === '/register') return { kind: 'register' }
  if (pathname === '/login') return { kind: 'login' }
  if (pathname === '/library') return { kind: 'library' }
  return { kind: 'not-found' }
}
