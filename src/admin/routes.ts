import { parseOffset } from '../core/admin'

export type AdminRoute =
  | { kind: 'setup' }
  | { kind: 'login'; returnTo: string }
  | { kind: 'videos'; offset: number }
  | { kind: 'new-video'; returnTo: string }
  | { kind: 'edit-video'; videoId: string; returnTo: string }
  | { kind: 'video-codes'; videoId: string; returnTo: string }
  | { kind: 'not-found' }

function offsetFromSearch(search: string): number | null {
  const params = new URLSearchParams(search)
  const rawOffset = params.get('offset')
  return parseOffset(rawOffset === null ? undefined : rawOffset)
}

export function adminVideosUrl(offset = 0): string {
  return offset === 0 ? '/admin/videos' : `/admin/videos?offset=${offset}`
}

export function adminVideoEditUrl(videoId: string, offset = 0): string {
  return `/admin/videos/${encodeURIComponent(videoId)}/edit${
    offset === 0 ? '' : `?offset=${offset}`
  }`
}

export function adminVideoCodesUrl(videoId: string, offset = 0): string {
  return `/admin/videos/${encodeURIComponent(videoId)}/codes${
    offset === 0 ? '' : `?offset=${offset}`
  }`
}

export function adminLoginUrl(returnTo: string): string {
  return `/admin/login?returnTo=${encodeURIComponent(
    safeAdminReturnTo(returnTo),
  )}`
}

function videoRoute(pathname: string, search: string): AdminRoute | null {
  const match = /^\/admin\/videos\/([^/]+)\/(edit|codes)$/.exec(pathname)
  if (!match) return null
  let videoId: string
  try {
    videoId = decodeURIComponent(match[1]!)
  } catch {
    return { kind: 'not-found' }
  }
  if (!videoId || videoId.includes('/')) return { kind: 'not-found' }
  const offset = offsetFromSearch(search)
  if (offset === null) return { kind: 'not-found' }
  return match[2] === 'edit'
    ? { kind: 'edit-video', videoId, returnTo: adminVideosUrl(offset) }
    : { kind: 'video-codes', videoId, returnTo: adminVideosUrl(offset) }
}

export function parseAdminRoute(pathname: string, search: string): AdminRoute {
  if (pathname === '/admin/setup') return { kind: 'setup' }
  if (pathname === '/admin/login') {
    const returnTo = new URLSearchParams(search).get('returnTo')
    return { kind: 'login', returnTo: safeAdminReturnTo(returnTo) }
  }
  const offset = offsetFromSearch(search)
  if (pathname === '/admin/videos') {
    return offset === null ? { kind: 'not-found' } : { kind: 'videos', offset }
  }
  if (pathname === '/admin/videos/new') {
    return offset === null
      ? { kind: 'not-found' }
      : { kind: 'new-video', returnTo: adminVideosUrl(offset) }
  }
  return videoRoute(pathname, search) ?? { kind: 'not-found' }
}

export function safeAdminReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return adminVideosUrl()
  }
  let url: URL
  try {
    url = new URL(value, 'http://play-cms.local')
  } catch {
    return adminVideosUrl()
  }
  if (url.origin !== 'http://play-cms.local') return adminVideosUrl()
  if (!url.pathname.startsWith('/admin/videos')) return adminVideosUrl()
  const route = parseAdminRoute(url.pathname, url.search)
  if (route.kind === 'videos') return adminVideosUrl(route.offset)
  if (route.kind === 'new-video') {
    return `/admin/videos/new${
      route.returnTo === '/admin/videos'
        ? ''
        : `?${new URL(route.returnTo, url).searchParams.toString()}`
    }`
  }
  if (route.kind === 'edit-video') {
    const offset = offsetFromSearch(url.search) ?? 0
    return adminVideoEditUrl(route.videoId, offset)
  }
  if (route.kind === 'video-codes') {
    const offset = offsetFromSearch(url.search) ?? 0
    return adminVideoCodesUrl(route.videoId, offset)
  }
  return adminVideosUrl()
}
