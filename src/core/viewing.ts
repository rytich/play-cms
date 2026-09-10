export type AvailabilityInput = Readonly<{
  status: 'draft' | 'published'
  startsAt: string | null
  endsAt: string | null
}>

const crockfordCode = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/

export function parseViewingCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null
  let compact = ''
  for (const character of value) {
    const codePoint = character.codePointAt(0)!
    if (
      character === '-' ||
      codePoint === 32 ||
      (codePoint >= 9 && codePoint <= 13)
    ) {
      continue
    }
    compact += character
  }
  const normalized = compact.toUpperCase()
  return crockfordCode.test(normalized) ? normalized : null
}

export function isViewerAvailable(video: AvailabilityInput, nowMs: number) {
  const startsAt = video.startsAt === null ? null : Date.parse(video.startsAt)
  const endsAt = video.endsAt === null ? null : Date.parse(video.endsAt)
  return (
    video.status === 'published' &&
    Number.isFinite(nowMs) &&
    (startsAt === null || (Number.isFinite(startsAt) && startsAt <= nowMs)) &&
    (endsAt === null || (Number.isFinite(endsAt) && nowMs < endsAt))
  )
}

export function playbackNotAfter(nowMs: number, videoEndsAt: string | null) {
  if (!Number.isFinite(nowMs)) return null
  if (videoEndsAt === null) return new Date(nowMs + 5 * 60_000).toISOString()
  const endsAt = Date.parse(videoEndsAt)
  if (!Number.isFinite(endsAt) || endsAt <= nowMs) {
    return null
  }
  return new Date(Math.min(nowMs + 5 * 60_000, endsAt)).toISOString()
}
