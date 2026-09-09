import { hasOnlyFields, isPlainRecord, parseOffset } from './admin'

export type VideoStatus = 'draft' | 'published'
export type VideoFilters = Readonly<{
  q: string
  status: VideoStatus | null
  from: string | null
  to: string | null
  offset: number
}>
export type CodeSetting = 'enabled' | 'disabled'
export type CodeLifecycle = 'unused' | 'used' | 'revoked'
export type CodeFilters = Readonly<{
  codeId: string
  setting: CodeSetting | null
  lifecycle: CodeLifecycle | null
  issuedFrom: string | null
  issuedTo: string | null
  offset: number
}>
export type BulkVideoInput = Readonly<{
  ids: string[]
  status: VideoStatus
}>
export type BulkCodeInput = Readonly<{ ids: string[]; enabled: boolean }>

export const emptyVideoFilters: VideoFilters = {
  q: '',
  status: null,
  from: null,
  to: null,
  offset: 0,
}
export const emptyCodeFilters: CodeFilters = {
  codeId: '',
  setting: null,
  lifecycle: null,
  issuedFrom: null,
  issuedTo: null,
  offset: 0,
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isAdminId(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    return null
  if (!value.every(isAdminId)) return null
  return new Set(value).size === value.length ? [...value] : null
}

export function parseBulkVideoInput(value: unknown): BulkVideoInput | null {
  if (!isPlainRecord(value) || !hasOnlyFields(value, ['ids', 'status']))
    return null
  const ids = parseIds(value.ids)
  if (!ids || (value.status !== 'draft' && value.status !== 'published'))
    return null
  return { ids, status: value.status }
}

export function parseBulkCodeInput(value: unknown): BulkCodeInput | null {
  if (!isPlainRecord(value) || !hasOnlyFields(value, ['ids', 'enabled']))
    return null
  const ids = parseIds(value.ids)
  if (!ids || typeof value.enabled !== 'boolean') return null
  return { ids, enabled: value.enabled }
}

function canonicalInstant(value: string | null): string | null | undefined {
  if (value === null || value === '') return null
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return undefined
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined
}

function exactParams(params: URLSearchParams, allowed: readonly string[]) {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) return false
  }
  return true
}

function validRange(from: string | null, to: string | null) {
  return from === null || to === null || Date.parse(from) < Date.parse(to)
}

export function parseVideoFilters(
  params: URLSearchParams,
  permitAdditional: readonly string[] = [],
): VideoFilters | null {
  const allowed = ['q', 'status', 'from', 'to', 'offset', ...permitAdditional]
  if (!exactParams(params, allowed)) return null
  const q = params.get('q') ?? ''
  if (Array.from(q).length > 100) return null
  const statusRaw = params.get('status')
  const status = statusRaw === null || statusRaw === '' ? null : statusRaw
  if (status !== null && status !== 'draft' && status !== 'published')
    return null
  const from = canonicalInstant(params.get('from'))
  const to = canonicalInstant(params.get('to'))
  if (from === undefined || to === undefined || !validRange(from, to))
    return null
  const offset = parseOffset(params.get('offset') ?? undefined)
  if (offset === null) return null
  return { q, status, from, to, offset }
}

export function parseCodeFilters(
  params: URLSearchParams,
  offsetName: 'offset' | 'codesOffset' = 'offset',
  permitAdditional: readonly string[] = [],
): CodeFilters | null {
  const allowed = [
    'codeId',
    'setting',
    'lifecycle',
    'issuedFrom',
    'issuedTo',
    offsetName,
    ...permitAdditional,
  ]
  if (!exactParams(params, allowed)) return null
  const codeId = params.get('codeId') ?? ''
  if (codeId !== '' && !isAdminId(codeId)) return null
  const settingRaw = params.get('setting')
  const setting = settingRaw === null || settingRaw === '' ? null : settingRaw
  if (setting !== null && setting !== 'enabled' && setting !== 'disabled')
    return null
  const lifecycleRaw = params.get('lifecycle')
  const lifecycle =
    lifecycleRaw === null || lifecycleRaw === '' ? null : lifecycleRaw
  if (
    lifecycle !== null &&
    lifecycle !== 'unused' &&
    lifecycle !== 'used' &&
    lifecycle !== 'revoked'
  )
    return null
  const issuedFrom = canonicalInstant(params.get('issuedFrom'))
  const issuedTo = canonicalInstant(params.get('issuedTo'))
  if (
    issuedFrom === undefined ||
    issuedTo === undefined ||
    !validRange(issuedFrom, issuedTo)
  )
    return null
  const offset = parseOffset(params.get(offsetName) ?? undefined)
  if (offset === null) return null
  return { codeId, setting, lifecycle, issuedFrom, issuedTo, offset }
}

export function videoMatchesRange(
  video: { startsAt: string; endsAt: string },
  from: string | null,
  to: string | null,
) {
  return (
    (from === null || Date.parse(video.endsAt) > Date.parse(from)) &&
    (to === null || Date.parse(video.startsAt) < Date.parse(to))
  )
}

export function codeMatchesIssuedRange(
  createdAt: number,
  from: number | null,
  to: number | null,
) {
  return (from === null || createdAt >= from) && (to === null || createdAt < to)
}

export function isCodeEligibleForBulk(
  code: { lifecycle: CodeLifecycle; revoked: boolean; endsAt: number },
  targetEnabled: boolean,
  now: number,
) {
  if (code.lifecycle !== 'unused' || code.revoked) return false
  return !targetEnabled || code.endsAt > now
}

export function videoFiltersParams(filters: VideoFilters) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status) params.set('status', filters.status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.offset) params.set('offset', String(filters.offset))
  return params
}

export function codeFiltersParams(
  filters: CodeFilters,
  offsetName = 'codesOffset',
) {
  const params = new URLSearchParams()
  if (filters.codeId) params.set('codeId', filters.codeId)
  if (filters.setting) params.set('setting', filters.setting)
  if (filters.lifecycle) params.set('lifecycle', filters.lifecycle)
  if (filters.issuedFrom) params.set('issuedFrom', filters.issuedFrom)
  if (filters.issuedTo) params.set('issuedTo', filters.issuedTo)
  if (filters.offset) params.set(offsetName, String(filters.offset))
  return params
}
