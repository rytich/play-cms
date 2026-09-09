import {
  codeFiltersParams,
  emptyCodeFilters,
  emptyVideoFilters,
  parseCodeFilters,
  parseVideoFilters,
  videoFiltersParams,
  type CodeFilters,
  type VideoFilters,
} from '../core/admin-management'

export type AdminRoute =
  | { kind: 'setup' }
  | { kind: 'login'; returnTo: string }
  | { kind: 'videos'; offset: number; filters: VideoFilters }
  | { kind: 'new-video'; returnTo: string }
  | { kind: 'edit-video'; videoId: string; returnTo: string }
  | {
      kind: 'video-codes'
      videoId: string
      returnTo: string
      codeFilters: CodeFilters
    }
  | { kind: 'not-found' }

const videoKeys = ['q', 'status', 'from', 'to', 'offset'] as const
const codeKeys = [
  'codeId',
  'setting',
  'lifecycle',
  'issuedFrom',
  'issuedTo',
  'codesOffset',
] as const

function normalizedVideoFilters(value: number | VideoFilters): VideoFilters {
  return typeof value === 'number'
    ? { ...emptyVideoFilters, offset: value }
    : value
}

function withSearch(path: string, params: URLSearchParams) {
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

export function adminVideosUrl(value: number | VideoFilters = 0): string {
  return withSearch(
    '/admin/videos',
    videoFiltersParams(normalizedVideoFilters(value)),
  )
}

export function adminVideoEditUrl(
  videoId: string,
  value: number | VideoFilters = 0,
): string {
  return withSearch(
    `/admin/videos/${encodeURIComponent(videoId)}/edit`,
    videoFiltersParams(normalizedVideoFilters(value)),
  )
}

export function adminVideoCodesUrl(
  videoId: string,
  value: number | VideoFilters = 0,
  codeFilters: CodeFilters = emptyCodeFilters,
): string {
  const params = videoFiltersParams(normalizedVideoFilters(value))
  for (const [key, item] of codeFiltersParams(codeFilters))
    params.set(key, item)
  return withSearch(
    `/admin/videos/${encodeURIComponent(videoId)}/codes`,
    params,
  )
}

export function adminLoginUrl(returnTo: string): string {
  return `/admin/login?returnTo=${encodeURIComponent(safeAdminReturnTo(returnTo))}`
}

function decodeVideoId(pathname: string) {
  const match = /^\/admin\/videos\/([^/]+)\/(edit|codes)$/.exec(pathname)
  if (!match) return null
  try {
    const videoId = decodeURIComponent(match[1]!)
    return !videoId || videoId.includes('/')
      ? null
      : { videoId, page: match[2] as 'edit' | 'codes' }
  } catch {
    return null
  }
}

function videoRoute(pathname: string, search: string): AdminRoute | null {
  const match = decodeVideoId(pathname)
  if (!match) return null
  const params = new URLSearchParams(search)
  const videoFilters = parseVideoFilters(
    params,
    match.page === 'codes' ? codeKeys : [],
  )
  if (!videoFilters) return { kind: 'not-found' }
  const returnTo = adminVideosUrl(videoFilters)
  if (match.page === 'edit') {
    return { kind: 'edit-video', videoId: match.videoId, returnTo }
  }
  const codeFilters = parseCodeFilters(params, 'codesOffset', videoKeys)
  return codeFilters
    ? { kind: 'video-codes', videoId: match.videoId, returnTo, codeFilters }
    : { kind: 'not-found' }
}

export function parseAdminRoute(pathname: string, search: string): AdminRoute {
  if (pathname === '/admin/setup') return { kind: 'setup' }
  if (pathname === '/admin/login') {
    const returnTo = new URLSearchParams(search).get('returnTo')
    return { kind: 'login', returnTo: safeAdminReturnTo(returnTo) }
  }
  if (pathname === '/admin/videos' || pathname === '/admin/videos/new') {
    const filters = parseVideoFilters(new URLSearchParams(search))
    if (!filters) return { kind: 'not-found' }
    return pathname === '/admin/videos'
      ? { kind: 'videos', offset: filters.offset, filters }
      : { kind: 'new-video', returnTo: adminVideosUrl(filters) }
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
  const route = parseAdminRoute(url.pathname, url.search)
  if (route.kind === 'videos') return adminVideosUrl(route.filters)
  if (route.kind === 'new-video') {
    return withSearch(
      '/admin/videos/new',
      new URL(route.returnTo, url).searchParams,
    )
  }
  if (route.kind === 'edit-video') {
    const filters = parseVideoFilters(new URLSearchParams(url.search))
    return filters
      ? adminVideoEditUrl(route.videoId, filters)
      : adminVideosUrl()
  }
  if (route.kind === 'video-codes') {
    const filters = parseVideoFilters(new URLSearchParams(url.search), codeKeys)
    return filters
      ? adminVideoCodesUrl(route.videoId, filters, route.codeFilters)
      : adminVideosUrl()
  }
  return adminVideosUrl()
}
