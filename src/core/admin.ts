export type Video = Readonly<{
  id: string
  publicId: string
  filmaFileId: string
  title: string
  description: string
  status: 'draft'
  startsAt: string
  endsAt: string
}>

export type VideoInput = Readonly<{
  filmaFileId: string
  title: string
  description: string
  startsAt: string
  endsAt: string
}>

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function hasOnlyFields(
  value: Record<string, unknown>,
  fields: readonly string[],
) {
  const keys = Object.keys(value)
  return (
    keys.length === fields.length && keys.every((key) => fields.includes(key))
  )
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (new TextEncoder().encode(email).byteLength > 254) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function validPassword(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const bytes = new TextEncoder().encode(value).byteLength
  return Array.from(value).length >= 12 && bytes <= 128
}

function canonicalIso(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return null
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  const iso = new Date(timestamp).toISOString()
  return iso === value || iso.replace('.000Z', 'Z') === value ? iso : null
}

export function parseVideoInput(value: unknown): VideoInput | null {
  if (!isPlainRecord(value)) return null
  const fields = [
    'filmaFileId',
    'title',
    'description',
    'startsAt',
    'endsAt',
  ] as const
  if (!hasOnlyFields(value, fields)) return null
  if (
    typeof value.filmaFileId !== 'string' ||
    !/^[1-9]\d{0,19}$/.test(value.filmaFileId)
  ) {
    return null
  }
  if (typeof value.title !== 'string') return null
  const title = value.title.trim()
  if (title.length < 1 || title.length > 200) return null
  if (
    typeof value.description !== 'string' ||
    value.description.length > 2_000
  ) {
    return null
  }
  const startsAt = canonicalIso(value.startsAt)
  const endsAt = canonicalIso(value.endsAt)
  if (!startsAt || !endsAt || Date.parse(startsAt) >= Date.parse(endsAt))
    return null
  return {
    filmaFileId: value.filmaFileId,
    title,
    description: value.description,
    startsAt,
    endsAt,
  }
}

export function parseOffset(value: string | undefined): number | null {
  if (value === undefined) return 0
  if (!/^\d+$/.test(value)) return null
  const offset = Number(value)
  return Number.isSafeInteger(offset) && offset <= 100_000 ? offset : null
}
