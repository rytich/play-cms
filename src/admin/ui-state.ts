export function canLeaveEditor(
  dirty: boolean,
  confirmedDiscard: boolean,
): boolean {
  return !dirty || confirmedDiscard
}

export type VideoFormValues = Readonly<{
  filmaFileId: string
  title: string
  description: string
  startsAt: string
  endsAt: string
}>

export function isVideoFormDirty(
  current: VideoFormValues,
  saved: VideoFormValues,
): boolean {
  return (
    current.filmaFileId !== saved.filmaFileId ||
    current.title !== saved.title ||
    current.description !== saved.description ||
    current.startsAt !== saved.startsAt ||
    current.endsAt !== saved.endsAt
  )
}

export function videoListRangeLabel(offset: number, count: number): string {
  if (count === 0) return '0件を表示'
  const first = offset + 1
  const last = offset + count
  return first === last ? `${first}件目を表示` : `${first}〜${last}件目を表示`
}
