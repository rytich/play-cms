import { validPassword } from '../core/admin'

export type IssuedCode = {
  id: string
  code: string
  createdAt: string
}

export function passwordValidationError(password: string) {
  return validPassword(password)
    ? null
    : 'パスワードは12文字以上かつUTF-8で128バイト以下にしてください。'
}

export function acceptIssuedCodeForSelection(
  selectedVideoId: string | null,
  requestedVideoId: string,
  issued: IssuedCode,
) {
  if (selectedVideoId !== requestedVideoId) return null
  return {
    issuedCode: issued.code,
    metadata: {
      id: issued.id,
      createdAt: issued.createdAt,
      revokedAt: null,
      status: 'unused' as const,
    },
  }
}

export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message)
    this.name = 'AdminRequestError'
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function toIsoDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('日時を入力してください。')
  const parts = match.slice(1).map(Number)
  const [year, month, day, hour, minute] = parts as [
    number,
    number,
    number,
    number,
    number,
  ]
  const date = new Date(year, month - 1, day, hour, minute)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    throw new Error('正しい日時を入力してください。')
  }
  return date.toISOString()
}

export function localDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()))
    throw new Error('日時を表示できません。')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function messageForStatus(status: number) {
  if (status === 400) return '入力内容を確認してください。'
  if (status === 401) return 'ログインが必要です。'
  if (status === 403) return 'この操作は許可されていません。'
  if (status === 404) return '対象が見つかりません。'
  if (status === 429) return '時間をおいてからもう一度お試しください。'
  return '現在処理できません。'
}

export async function adminRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  extraHeaders?: HeadersInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...Object.fromEntries(new Headers(extraHeaders)),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AdminRequestError(
      '処理結果を確認できません。画面を再読み込みして状態を確認してください。',
      null,
    )
  }
  if (!response.ok) {
    throw new AdminRequestError(
      messageForStatus(response.status),
      response.status,
    )
  }
  try {
    return await response.json<T>()
  } catch {
    throw new AdminRequestError(
      '処理結果を確認できません。画面を再読み込みして状態を確認してください。',
      null,
    )
  }
}
