import { describe, expect, it } from 'vitest'

import {
  canLeaveEditor,
  isVideoFormDirty,
  selectionAfterContextChange,
  canSubmitBulk,
  shouldWarnBeforeUnload,
  unknownOutcomeAdvice,
  videoListRangeLabel,
} from '../../src/admin/ui-state'

describe('admin UI state', () => {
  it('keeps unsaved input unless discard is confirmed', () => {
    expect(canLeaveEditor(true, false)).toBe(false)
    expect(canLeaveEditor(true, true)).toBe(true)
    expect(canLeaveEditor(false, false)).toBe(true)
  })

  it('does not show a second unload warning after discard was confirmed', () => {
    expect(shouldWarnBeforeUnload(true, false)).toBe(true)
    expect(shouldWarnBeforeUnload(true, true)).toBe(false)
    expect(shouldWarnBeforeUnload(false, false)).toBe(false)
  })

  it('detects a change from the last saved editor values', () => {
    const saved = {
      filmaFileId: '123',
      title: 'Saved title',
      description: '',
      startsAt: '2026-09-08T10:00',
      endsAt: '2026-09-08T11:00',
    }

    expect(isVideoFormDirty(saved, saved)).toBe(false)
    expect(isVideoFormDirty({ ...saved, title: 'Changed title' }, saved)).toBe(
      true,
    )
  })

  it('describes the actual visible range on each list page', () => {
    expect(videoListRangeLabel(0, 100)).toBe('1件目〜100件目（100件）')
    expect(videoListRangeLabel(100, 1)).toBe('101件目〜101件目（1件）')
    expect(videoListRangeLabel(0, 0)).toBe('0件を表示')
  })

  it('clears selection on page, filter, video, or logout context changes', () => {
    expect(
      selectionAfterContextChange(['a'], 'videos:q=a', 'videos:q=a'),
    ).toEqual(['a'])
    expect(
      selectionAfterContextChange(['a'], 'videos:q=a', 'videos:q=b'),
    ).toEqual([])
    expect(
      selectionAfterContextChange(['a'], 'codes:video-a', 'codes:video-b'),
    ).toEqual([])
    expect(selectionAfterContextChange(['a'], 'videos:q=a', 'logout')).toEqual(
      [],
    )
  })

  it('does not submit an empty or already-running bulk operation', () => {
    expect(canSubmitBulk([], false)).toBe(false)
    expect(canSubmitBulk(['a'], true)).toBe(false)
    expect(canSubmitBulk(['a'], false)).toBe(true)
  })

  it('does not describe an unknown bulk outcome as rolled back or safe to retry', () => {
    expect(unknownOutcomeAdvice).toContain('自動再送せず')
    expect(unknownOutcomeAdvice).toContain('状態を再取得')
    expect(unknownOutcomeAdvice).not.toContain('変更されていません')
  })
})
