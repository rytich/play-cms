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
import { viewerTimeZoneLabel } from './presentation'
import { parseViewerRoute, viewerRouteUrl } from './routes'
import {
  initialViewerSynchronizationState,
  viewerSynchronizationDecision,
} from './synchronization'
import type { ViewerLogoutState } from './synchronization'
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
          <strong>招待試験用</strong>
          <span>再生は専用動画一件だけに制限され、既定で無効です。</span>
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
  returnTo,
  onSubmit,
}: {
  mode: 'register' | 'login'
  busy: boolean
  error: string
  returnTo?: string
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
          <a href={viewerRouteUrl('login', undefined, returnTo)}>
            登録済みの方はログイン
          </a>
        ) : (
          <a href={viewerRouteUrl('register', undefined, returnTo)}>
            初めての方は視聴者登録
          </a>
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
            日時は
            {viewerTimeZoneLabel(
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            )}
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
                <strong>
                  <a href={viewerRouteUrl('viewing', video.publicId)}>
                    {video.title}
                  </a>
                </strong>
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

type ViewingResult = {
  anonymous?: boolean
  video: {
    publicId: string
    title: string
    description: string
    endsAt: string
  }
  playback: { url: string; expiresAt: string }
}

function ViewingPage({
  publicId,
  authenticated,
}: {
  publicId: string
  authenticated: boolean
}) {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<ViewingResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const returnTo = viewerRouteUrl('viewing', publicId)

  const loadPlayback = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const endpoint = authenticated
        ? `/api/viewer/videos/${encodeURIComponent(publicId)}/playback`
        : `/api/public/videos/${encodeURIComponent(publicId)}/playback`
      setResult(await viewerRequest<ViewingResult>(endpoint))
    } catch (caught) {
      if (!(
        caught instanceof ViewerRequestError &&
        (caught.status === 401 || caught.status === 404)
      )) {
        setError(visibleError(caught))
      }
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [authenticated, publicId])

  useEffect(() => {
    void loadPlayback()
  }, [loadPlayback])

  async function redeem(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const redeemed = await viewerRequest<ViewingResult>(
        `/api/public/videos/${encodeURIComponent(publicId)}/redeem`,
        'POST',
        { code },
      )
      setCode('')
      setResult(redeemed)
    } catch (caught) {
      setError(visibleError(caught))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <p className="viewer-loading" role="status">
        視聴権を確認しています…
      </p>
    )
  }

  if (result) {
    return (
      <section className="viewing-page" aria-labelledby="viewing-heading">
        <h1 id="viewing-heading">{result.video.title}</h1>
        {result.video.description && <p>{result.video.description}</p>}
        <video controls src={result.playback.url}>
          このブラウザは動画再生に対応していません。
        </video>
        {result.anonymous && (
          <div className="notice" role="note">
            <strong>この視聴は30分間だけ有効です。</strong>
            <span>
              期限内に登録またはログインしない場合、このコードは再利用できず、動画を再び開けません。
            </span>
            <span className="viewing-auth-actions">
              <a href={viewerRouteUrl('register', undefined, returnTo)}>
                視聴者登録
              </a>
              <a href={viewerRouteUrl('login', undefined, returnTo)}>
                ログイン
              </a>
            </span>
          </div>
        )}
      </section>
    )
  }

  return (
    <section
      className="card viewer-auth-card"
      aria-labelledby="viewing-heading"
    >
      <h1 id="viewing-heading">視聴コードを入力</h1>
      <p className="subtle">案内された一回限りのコードを入力してください。</p>
      <form onSubmit={(event) => void redeem(event)}>
        <label>
          視聴コード
          <input
            autoComplete="one-time-code"
            required
            maxLength={19}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? '確認中…' : '視聴を開始'}
        </button>
      </form>
    </section>
  )
}

function visibleError(error: unknown) {
  return error instanceof ViewerRequestError
    ? error.message
    : '現在処理できません。時間をおいてもう一度お試しください。'
}

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
  const [synchronizationState, setSynchronizationState] = useState(
    initialViewerSynchronizationState,
  )
  const { logoutState } = synchronizationState
  const synchronization = viewerSynchronizationDecision(synchronizationState, {
    type: 'observed',
    routeKind: route.kind,
  })

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
      const decision = viewerSynchronizationDecision(synchronizationState, {
        type: 'history-restored',
        routeKind: restoredRoute.kind,
      })
      setSynchronizationState(decision.state)
      if (decision.discardCachedVideos) {
        setVideos([])
      }
      if (decision.discardAuthentication) {
        setAuthenticated(false)
      }
      setRoute(restoredRoute)
      setError('')
    }
    window.addEventListener('popstate', restoreRoute)
    return () => window.removeEventListener('popstate', restoreRoute)
  }, [synchronizationState])

  useEffect(() => {
    if (!synchronization.synchronize) return
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
  }, [logoutState, route, synchronization.synchronize])

  useEffect(() => {
    if (!synchronization.synchronize) return
    if (authenticated === false && route.kind === 'library') {
      setVideos([])
      navigate(viewerRouteUrl('login'), true)
      return
    }
    if (
      authenticated === true &&
      (route.kind === 'register' || route.kind === 'login')
    ) {
      navigate(route.returnTo ?? viewerRouteUrl('library'), true)
    }
  }, [authenticated, navigate, route.kind, synchronization.synchronize])

  useEffect(() => {
    if (
      !synchronization.synchronize ||
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
  }, [
    authenticated,
    logoutState,
    navigate,
    route.kind,
    synchronization.synchronize,
  ])

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
    const started = viewerSynchronizationDecision(synchronizationState, {
      type: 'authentication-started',
      routeKind: mode,
    })
    if (started.discardCachedVideos) setVideos([])
    setSynchronizationState(started.state)
    setError('')
    try {
      await viewerRequest(
        mode === 'register' ? '/api/viewer/register' : '/api/viewer/login',
        'POST',
        credentials,
      )
      setAuthenticated(true)
      navigate(
        route.kind === mode && route.returnTo
          ? route.returnTo
          : viewerRouteUrl('library'),
      )
      setSynchronizationState(
        viewerSynchronizationDecision(started.state, {
          type: 'authentication-succeeded',
          routeKind: 'library',
        }).state,
      )
    } catch (caught) {
      setError(visibleError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    if (logoutState === 'pending') return
    const started = viewerSynchronizationDecision(synchronizationState, {
      type: 'logout-started',
      routeKind: route.kind,
    })
    await performViewerLogout({
      request: () => viewerRequest('/api/auth/logout', 'POST', {}),
      onStart: () => {
        setSynchronizationState(started.state)
        setError('')
      },
      onSuccess: () => {
        const succeeded = viewerSynchronizationDecision(started.state, {
          type: 'logout-succeeded',
          routeKind: 'login',
        })
        if (succeeded.discardCachedVideos) setVideos([])
        if (succeeded.discardAuthentication) setAuthenticated(false)
        navigate(viewerRouteUrl('login'), true)
        setSynchronizationState(succeeded.state)
      },
      onFailure: (message) => {
        setSynchronizationState(
          viewerSynchronizationDecision(started.state, {
            type: 'logout-failed',
            routeKind: route.kind,
          }).state,
        )
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
          returnTo={route.returnTo}
          onSubmit={(credentials) => void authenticate(route.kind, credentials)}
        />
      </ViewerLayout>
    )
  }
  if (route.kind === 'viewing') {
    return (
      <ViewerLayout>
        <ViewingPage publicId={route.publicId} authenticated={authenticated} />
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
