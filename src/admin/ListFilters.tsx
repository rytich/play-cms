import type { CodeFilters, VideoFilters } from '../core/admin-management'
import { localDateTime } from './client'
import { toIsoDateTime } from './client'
import type { FormEvent } from 'react'

function localValue(value: string | null) {
  return value ? localDateTime(value) : ''
}

function submitFilters(
  event: FormEvent<HTMLFormElement>,
  action: string,
  dateFields: readonly string[],
) {
  event.preventDefault()
  const params = new URLSearchParams()
  const data = new FormData(event.currentTarget)
  for (const [name, raw] of data) {
    if (typeof raw !== 'string' || raw === '') continue
    params.set(name, dateFields.includes(name) ? toIsoDateTime(raw) : raw)
  }
  const query = params.toString()
  window.location.assign(query ? `${action}?${query}` : action)
}

function VideoFilterFields({ filters }: { filters: VideoFilters }) {
  return (
    <>
      <label>
        タイトルまたはFilmaファイルID
        <input name="q" maxLength={100} defaultValue={filters.q} />
      </label>
      <label>
        公開設定
        <select name="status" defaultValue={filters.status ?? ''}>
          <option value="">すべて</option>
          <option value="draft">非公開</option>
          <option value="published">公開設定済み</option>
        </select>
      </label>
      <label>
        期間の開始
        <input
          name="from"
          type="datetime-local"
          defaultValue={localValue(filters.from)}
        />
      </label>
      <label>
        期間の終了
        <input
          name="to"
          type="datetime-local"
          defaultValue={localValue(filters.to)}
        />
      </label>
    </>
  )
}

export function VideoListFilters({
  action,
  filters,
}: {
  action: string
  filters: VideoFilters
}) {
  return (
    <form
      className="list-filters"
      method="get"
      action={action}
      onSubmit={(event) => submitFilters(event, action, ['from', 'to'])}
    >
      <VideoFilterFields filters={filters} />
      <div className="filter-actions">
        <button type="submit">検索</button>
        <a href={action}>条件をリセット</a>
      </div>
    </form>
  )
}

export function CodeListFilters({
  action,
  resetHref,
  videoFilters,
  filters,
}: {
  action: string
  resetHref: string
  videoFilters: VideoFilters
  filters: CodeFilters
}) {
  const returnParams = [
    ['q', videoFilters.q],
    ['status', videoFilters.status],
    ['from', videoFilters.from],
    ['to', videoFilters.to],
    ['offset', videoFilters.offset ? String(videoFilters.offset) : null],
  ] as const
  return (
    <form
      className="list-filters"
      method="get"
      action={action}
      onSubmit={(event) =>
        submitFilters(event, action, ['issuedFrom', 'issuedTo'])
      }
    >
      {returnParams.map(([name, value]) =>
        value ? (
          <input key={name} type="hidden" name={name} value={value} />
        ) : null,
      )}
      <label>
        管理用キーID
        <input name="codeId" defaultValue={filters.codeId} />
      </label>
      <label>
        有効設定
        <select name="setting" defaultValue={filters.setting ?? ''}>
          <option value="">すべて</option>
          <option value="enabled">有効</option>
          <option value="disabled">無効</option>
        </select>
      </label>
      <label>
        利用状態
        <select name="lifecycle" defaultValue={filters.lifecycle ?? ''}>
          <option value="">すべて</option>
          <option value="unused">未使用</option>
          <option value="used">使用済み（現在は対象なし）</option>
          <option value="revoked">取消済み</option>
        </select>
      </label>
      <label>
        発行日時の開始
        <input
          name="issuedFrom"
          type="datetime-local"
          defaultValue={localValue(filters.issuedFrom)}
        />
      </label>
      <label>
        発行日時の終了
        <input
          name="issuedTo"
          type="datetime-local"
          defaultValue={localValue(filters.issuedTo)}
        />
      </label>
      <div className="filter-actions">
        <button type="submit">検索</button>
        <a href={resetHref}>キー条件をリセット</a>
      </div>
    </form>
  )
}
