export function canLeaveEditor(
  dirty: boolean,
  confirmedDiscard: boolean,
): boolean {
  return !dirty || confirmedDiscard
}

export function shouldWarnBeforeUnload(
  dirty: boolean,
  confirmedDiscard: boolean,
): boolean {
  return dirty && !confirmedDiscard
}

export function videoDateRangeError(
  startsAt: string,
  endsAt: string,
): string | null {
  if (!startsAt || !endsAt) return null
  const starts = Date.parse(startsAt)
  const ends = Date.parse(endsAt)
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) return null
  return starts >= ends ? '終了日時は開始日時より後にしてください。' : null
}

export function revokeCodeConfirmation(codeId: string): string {
  return `未使用の閲覧用キー（ID: ${codeId}）を取り消しますか？`
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
  return `${first}件目〜${last}件目（${count}件）`
}

export function selectionAfterContextChange(
  selectedIds: readonly string[],
  currentContext: string,
  nextContext: string,
): string[] {
  return currentContext === nextContext ? [...selectedIds] : []
}

export function canSubmitBulk(selectedIds: readonly string[], busy: boolean) {
  return selectedIds.length > 0 && !busy
}

export const unknownOutcomeAdvice =
  '処理結果が不明な場合は自動再送せず、状態を再取得して確認してください。'
