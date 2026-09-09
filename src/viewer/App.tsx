import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import type { ViewerLibraryItem } from '../core/viewer'
import { brand } from '../ui/brand'
import { Brand } from '../ui/components/Brand'
import {
  ViewerRequestError,
  loginPasswordValidationError,
  newPasswordValidationError,
  viewerRequest,
} from './client'
import { parseViewerRoute, viewerRouteUrl } from './routes'
import './styles.css'

function ViewerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="viewer-shell" data-surface="viewer">
      <a className="skip-link" href="#viewer-main">
        本文へ移動
      </a>
      <header className="viewer-header">
        <Brand siteName={brand.siteName} logoPath={brand.logoPath} />
        <span className="prototype-badge">ローカル試作</span>
      </header>
      <main id="viewer-main" className="viewer-main">
        <aside className="notice" role="note">
          <strong>再生は未実装</strong>
          <span>現在の視聴権だけを確認できます。</span>
        </aside>
        {children}
      </main>
    </div>
  )
}

export function ViewerAuthForm({
  mode,
  busy,
  error,
  onSubmit,
}: {
  mode: 'register' | 'login'
  busy: boolean
  error: string
  onSubmit: (credentials: { email: string; password: string }) => void
}) {
  const registering = mode === 'register'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = data.get('email')
    const password = data.get('password')
    if (typeof email !== 'string' || typeof password !== 'string') return
    onSubmit({ email, password })
  }

  return (
    <section className="card viewer-auth-card" aria-labelledby="auth-heading">
      <h1 id="auth-heading">{registering ? '視聴者登録' : '視聴者ログイン'}</h1>
      <p className="subtle">
        メールアドレスはログイン識別子です。本人確認は行いません。
      </p>
      <form onSubmit={submit}>
        <label>
          メールアドレス
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          パスワード
          <input
            name="password"
            type="password"
            autoComplete={registering ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? '処理中…' : registering ? '登録してライブラリへ' : 'ログイン'}
        </button>
      </form>
      <p className="subtle viewer-auth-link">
        {registering ? (
          <a href={viewerRouteUrl('login')}>登録済みの方はログイン</a>
        ) : (
          <a href={viewerRouteUrl('register')}>初めての方は視聴者登録</a>
        )}
      </p>
    </section>
  )
}

export function ViewerLibrary({
  videos,
  logoutState = 'idle',
  onLogout,
}: {
  videos: readonly ViewerLibraryItem[]
  logoutState?: ViewerLogoutState
  onLogout: () => void
}) {
  return (
    <section aria-labelledby="library-heading">
      <div className="viewer-page-heading">
        <div>
          <h1 id="library-heading">視聴可能な動画</h1>
          <p className="subtle">
            日時は{Intl.DateTimeFormat().resolvedOptions().timeZone}
            で表示します。
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={logoutState === 'pending'}
          onClick={onLogout}
        >
          {logoutState === 'pending'
            ? 'ログアウト中…'
            : logoutState === 'failed'
              ? 'ログアウトを再試行'
              : 'ログアウト'}
        </button>
      </div>
      <div className="card">
        {videos.length === 0 ? (
          <p className="viewer-empty">現在視聴できる動画はありません</p>
        ) : (
          <ul className="viewer-library-list">
            {videos.map((video) => (
              <li key={video.publicId}>
                <strong>{video.title}</strong>
                <span>
                  視聴期限: {new Date(video.endsAt).toLocaleString('ja-JP')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function visibleError(error: unknown) {
  return error instanceof ViewerRequestError
    ? error.message
    : '現在処理できません。時間をおいてもう一度お試しください。'
}

export type ViewerLogoutState = 'idle' | 'pending' | 'failed'

export async function performViewerLogout(input: {
  request: () => Promise<unknown>
  onStart: () => void
  onSuccess: () => void
  onFailure: (message: string) => void
}) {
  input.onStart()
  try {
    await input.request()
  } catch {
    input.onFailure('ログアウトできませんでした。もう一度お試しください。')
    return
  }
  input.onSuccess()
}

export function ViewerApp() {
  const [route, setRoute] = useState(() =>
    parseViewerRoute(window.location.pathname, window.location.search),
  )
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [videos, setVideos] = useState<ViewerLibraryItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [logoutState, setLogoutState] = useState<ViewerLogoutState>('idle')
  const [explicitAuthentication, setExplicitAuthentication] = useState(false)

  const navigate = useCallback((path: string, replace = false) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
    setRoute(parseViewerRoute(window.location.pathname, window.location.search))
  }, [])

  useEffect(() => {
    const restoreRoute = () => {
      const restoredRoute = parseViewerRoute(
        window.location.pathname,
        window.location.search,
      )
      if (
        logoutState === 'failed' &&
        (restoredRoute.kind === 'register' || restoredRoute.kind === 'login')
      ) {
        setLogoutState('idle')
        setVideos([])
        setAuthenticated(false)
        setExplicitAuthentication(true)
      } else if (
        restoredRoute.kind !== 'register' &&
        restoredRoute.kind !== 'login'
      ) {
        setExplicitAuthentication(false)
      }
      setRoute(restoredRoute)
      setError('')
    }
    window.addEventListener('popstate', restoreRoute)
    return () => window.removeEventListener('popstate', restoreRoute)
  }, [logoutState])

  useEffect(() => {
    if (logoutState === 'pending' || explicitAuthentication) return
    let active = true
    if (logoutState !== 'failed') setAuthenticated(null)
    void viewerRequest<{ authenticated: true }>('/api/viewer/session')
      .then(() => {
        if (active) setAuthenticated(true)
      })
      .catch((caught) => {
        if (!active) return
        if (
          caught instanceof ViewerRequestError &&
          (caught.status === 401 || caught.status === 403)
        ) {
          setAuthenticated(false)
        } else {
          setAuthenticated(false)
          setError(visibleError(caught))
        }
      })
    return () => {
      active = false
    }
  }, [explicitAuthentication, logoutState, route])

  useEffect(() => {
    if (logoutState === 'pending' || explicitAuthentication) return
    if (authenticated === false && route.kind === 'library') {
      setVideos([])
      navigate(viewerRouteUrl('login'), true)
      return
    }
    if (
      authenticated === true &&
      (route.kind === 'register' || route.kind === 'login')
    ) {
      navigate(viewerRouteUrl('library'), true)
    }
  }, [authenticated, explicitAuthentication, logoutState, navigate, route.kind])

  useEffect(() => {
    if (
      logoutState === 'pending' ||
      explicitAuthentication ||
      authenticated !== true ||
      route.kind !== 'library'
    )
      return
    let active = true
    if (logoutState !== 'failed') setError('')
    void viewerRequest<{ videos: ViewerLibraryItem[] }>('/api/viewer/library')
      .then((result) => {
        if (active) setVideos(result.videos)
      })
      .catch((caught) => {
        if (!active) return
        setVideos([])
        if (
          caught instanceof ViewerRequestError &&
          (caught.status === 401 || caught.status === 403)
        ) {
          setAuthenticated(false)
          navigate(viewerRouteUrl('login'), true)
        } else {
          setError(visibleError(caught))
        }
      })
    return () => {
      active = false
    }
  }, [authenticated, explicitAuthentication, logoutState, navigate, route.kind])

  async function authenticate(
    mode: 'register' | 'login',
    credentials: { email: string; password: string },
  ) {
    if (busy) return
    const validationError =
      mode === 'register'
        ? newPasswordValidationError(credentials.password)
        : loginPasswordValidationError(credentials.password)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    setVideos([])
    setLogoutState('idle')
    setExplicitAuthentication(true)
    setError('')
    try {
      await viewerRequest(
        mode === 'register' ? '/api/viewer/register' : '/api/viewer/login',
        'POST',
        credentials,
      )
      setAuthenticated(true)
      navigate(viewerRouteUrl('library'))
      setExplicitAuthentication(false)
    } catch (caught) {
      setError(visibleError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    if (logoutState === 'pending') return
    await performViewerLogout({
      request: () => viewerRequest('/api/auth/logout', 'POST', {}),
      onStart: () => {
        setLogoutState('pending')
        setError('')
      },
      onSuccess: () => {
        setVideos([])
        setAuthenticated(false)
        navigate(viewerRouteUrl('login'), true)
        setLogoutState('idle')
      },
      onFailure: (message) => {
        setLogoutState('failed')
        setError(message)
      },
    })
  }

  if (route.kind === 'not-found') {
    return (
      <ViewerLayout>
        <section className="card viewer-empty">
          <h1>ページが見つかりません</h1>
          <a href={viewerRouteUrl('login')}>視聴者ログインへ</a>
        </section>
      </ViewerLayout>
    )
  }
  if (authenticated === null) {
    return (
      <ViewerLayout>
        <p className="viewer-loading" role="status">
          セッションを確認しています…
        </p>
      </ViewerLayout>
    )
  }
  if (route.kind === 'register' || route.kind === 'login') {
    return (
      <ViewerLayout>
        <ViewerAuthForm
          mode={route.kind}
          busy={busy}
          error={error}
          onSubmit={(credentials) => void authenticate(route.kind, credentials)}
        />
      </ViewerLayout>
    )
  }
  if (!authenticated) return null
  return (
    <ViewerLayout>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ViewerLibrary
        videos={videos}
        logoutState={logoutState}
        onLogout={() => void logout()}
      />
    </ViewerLayout>
  )
}
