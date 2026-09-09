export function BulkActions({
  kind,
  selectedCount,
  busy,
  enableDisabled = false,
  onTarget,
}: {
  kind: 'videos' | 'codes'
  selectedCount: number
  busy: boolean
  enableDisabled?: boolean
  onTarget: (target: boolean) => void
}) {
  return (
    <div className="bulk-actions" aria-busy={busy}>
      <p role="status" aria-live="polite">
        {selectedCount}件を選択中
      </p>
      <div>
        <button
          type="button"
          disabled={selectedCount === 0 || busy || enableDisabled}
          onClick={() => onTarget(true)}
        >
          {kind === 'videos' ? '公開にする' : '有効にする'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={selectedCount === 0 || busy}
          onClick={() => onTarget(false)}
        >
          {kind === 'videos' ? '非公開にする' : '無効にする'}
        </button>
      </div>
      <small>
        {kind === 'videos'
          ? '公開設定だけを変更します。実配信は停止中です。'
          : '設定だけを変更し、付与済みの視聴権は消しません。'}
      </small>
    </div>
  )
}
