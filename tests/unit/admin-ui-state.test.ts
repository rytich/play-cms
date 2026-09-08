import { describe, expect, it } from 'vitest'

import {
  canLeaveEditor,
  isVideoFormDirty,
  videoListRangeLabel,
} from '../../src/admin/ui-state'

describe('admin UI state', () => {
  it('keeps unsaved input unless discard is confirmed', () => {
    expect(canLeaveEditor(true, false)).toBe(false)
    expect(canLeaveEditor(true, true)).toBe(true)
    expect(canLeaveEditor(false, false)).toBe(true)
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
    expect(videoListRangeLabel(0, 100)).toBe('1〜100件目を表示')
    expect(videoListRangeLabel(100, 1)).toBe('101件目を表示')
    expect(videoListRangeLabel(0, 0)).toBe('0件を表示')
  })
})
