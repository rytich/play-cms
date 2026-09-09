import { describe, expect, it } from 'vitest'

import {
  canLeaveEditor,
  isVideoFormDirty,
  shouldWarnBeforeUnload,
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
})
