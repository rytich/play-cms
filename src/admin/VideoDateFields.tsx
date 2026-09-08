import type { Ref } from 'react'

type VideoDateFieldsProps = {
  startsAt: string
  endsAt: string
  dateRangeError: string | null
  errorRef?: Ref<HTMLParagraphElement>
  onStartsAtChange: (value: string) => void
  onEndsAtChange: (value: string) => void
}

const dateErrorId = 'video-editor-date-error'

export function VideoDateFields({
  startsAt,
  endsAt,
  dateRangeError,
  errorRef,
  onStartsAtChange,
  onEndsAtChange,
}: VideoDateFieldsProps) {
  const errorAttributes = dateRangeError
    ? { 'aria-invalid': true, 'aria-describedby': dateErrorId }
    : {}

  return (
    <>
      <div className="date-grid">
        <label>
          開始日時
          <input
            type="datetime-local"
            required
            value={startsAt}
            onChange={(event) => onStartsAtChange(event.target.value)}
            {...errorAttributes}
          />
        </label>
        <label>
          終了日時
          <input
            type="datetime-local"
            required
            value={endsAt}
            onChange={(event) => onEndsAtChange(event.target.value)}
            {...errorAttributes}
          />
        </label>
      </div>
      {dateRangeError && (
        <p
          ref={errorRef}
          id={dateErrorId}
          className="error"
          role="alert"
          tabIndex={-1}
        >
          {dateRangeError}
        </p>
      )}
    </>
  )
}
