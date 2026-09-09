import { validLoginPassword, validNewPassword } from '../core/admin'

export function newPasswordValidationError(password: string) {
  return validNewPassword(password)
    ? null
    : 'パスワードは12文字以上かつUTF-8で128バイト以下にしてください。'
}

export function loginPasswordValidationError(password: string) {
  return validLoginPassword(password)
    ? null
    : 'パスワードはUTF-8で12〜128バイトにしてください。'
}

export class ViewerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message)
    this.name = 'ViewerRequestError'
  }
}

function messageForStatus(status: number) {
  if (status === 400) return '入力内容を確認してください。'
  if (status === 401)
    return 'メールアドレスまたはパスワードを確認してください。'
  if (status === 403) return 'この操作は許可されていません。'
  if (status === 409) return 'この内容では登録できません。'
  if (status === 429) return '時間をおいてからもう一度お試しください。'
  return '現在処理できません。時間をおいてもう一度お試しください。'
}

export async function viewerRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
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
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ViewerRequestError(
      '現在処理できません。時間をおいてもう一度お試しください。',
      null,
    )
  }
  if (!response.ok) {
    throw new ViewerRequestError(
      messageForStatus(response.status),
      response.status,
    )
  }
  try {
    return await response.json<T>()
  } catch {
    throw new ViewerRequestError(
      '現在処理できません。時間をおいてもう一度お試しください。',
      null,
    )
  }
}
