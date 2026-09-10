import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { VideoDateFields } from '../../src/admin/VideoDateFields'
import {
  revokeCodeConfirmation,
  videoDateRangeError,
} from '../../src/admin/ui-state'
import { shouldHandleSameDocumentLink } from '../../src/ui/navigation'

describe('admin UI review fixes', () => {
  it('leaves modified, secondary, and already-handled link clicks to the browser', () => {
    const primary = {
      button: 0,
      defaultPrevented: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }
    expect(shouldHandleSameDocumentLink(primary)).toBe(true)
    for (const changed of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { defaultPrevented: true },
    ]) {
      expect(shouldHandleSameDocumentLink({ ...primary, ...changed })).toBe(
        false,
      )
    }
  })

  it('associates an invalid date range with both date inputs', () => {
    const error = videoDateRangeError('2026-09-09T12:00', '2026-09-09T11:00')
    expect(error).toBe('終了日時は開始日時より後にしてください。')

    const html = renderToStaticMarkup(
      <VideoDateFields
        startsAt="2026-09-09T12:00"
        endsAt="2026-09-09T11:00"
        dateRangeError={error}
        onStartsAtChange={() => {}}
        onEndsAtChange={() => {}}
      />,
    )
    expect(html).toContain('id="video-editor-date-error"')
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2)
    expect(
      html.match(/aria-describedby="video-editor-date-error"/g),
    ).toHaveLength(2)
  })

  it('does not mark date inputs invalid for a general save failure', () => {
    expect(
      videoDateRangeError('2026-09-09T11:00', '2026-09-09T12:00'),
    ).toBeNull()
    const html = renderToStaticMarkup(
      <VideoDateFields
        startsAt="2026-09-09T11:00"
        endsAt="2026-09-09T12:00"
        dateRangeError={null}
        onStartsAtChange={() => {}}
        onEndsAtChange={() => {}}
      />,
    )
    expect(html).not.toContain('aria-invalid')
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain('required=""')
    expect(html).toContain('未設定なら制限なし')
    expect(html).toContain('未設定なら無期限')
  })

  it('identifies the metadata record in revoke confirmation without a raw key', () => {
    const message = revokeCodeConfirmation('code-metadata-id')
    expect(message).toContain('ID: code-metadata-id')
    expect(message).not.toContain('raw-secret-key')
  })
})
