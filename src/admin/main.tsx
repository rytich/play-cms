import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { FormEvent, MouseEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import type { Video } from '../core/admin'
import { brand, isBrandAssetPath } from '../ui/brand'
import { AdminLayout } from '../ui/layouts/AdminLayout'
import { AuthLayout } from '../ui/layouts/AuthLayout'
import '../ui/base.css'
import {
  AdminRequestError,
  acceptIssuedCodeForSelection,
  adminRequest,
  loginPasswordValidationError,
  localDateTime,
  newPasswordValidationError,
  toIsoDateTime,
} from './client'
import {
  adminLoginUrl,
  adminVideoCodesUrl,
  adminVideoEditUrl,
  adminVideosUrl,
  parseAdminRoute,
} from './routes'
import type { AdminRoute } from './routes'
import {
  canLeaveEditor,
  isVideoFormDirty,
  videoListRangeLabel,
  type VideoFormValues,
} from './ui-state'
import './styles.css'

type CodeMetadata = {
  id: string
  createdAt: string
  revokedAt: string | null
  status: 'unused' | 'revoked'
}

type ProtectedPageProps = {
  onLogout: () => void
  onUnauthorized: () => void
}

const emptyVideoForm: VideoFormValues = {
  filmaFileId: '',
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
}

const displayTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || '端末設定'

function formFromVideo(video: Video): VideoFormValues {
  return {
    filmaFileId: video.filmaFileId,
    title: video.title,
    description: video.description,
    startsAt: localDateTime(video.startsAt),
    endsAt: localDateTime(video.endsAt),
  }
}

function visibleError(caught: unknown) {
  return caught instanceof Error ? caught.message : '現在処理できません。'
}

function usePageHeading(pageName: string) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    document.title = `${brand.siteName} 管理画面 — ${pageName}`
    heading.current?.focus()
  }, [pageName])
  return heading
}

function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

function useBrandFavicon() {
  useEffect(() => {
    document.querySelector('link[data-play-brand-icon]')?.remove()
    if (
      brand.faviconPath === null ||
      !isBrandAssetPath(brand.faviconPath, 'favicon')
    ) {
      return
    }
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = brand.faviconPath
    link.dataset.playBrandIcon = 'true'
    document.head.appendChild(link)
    return () => {
      link.remove()
    }
  }, [])
}

function LoginForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = usePageHeading('ログイン')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validationError = loginPasswordValidationError(password)
    if (validationError) {
      setError(validationError)
      setPassword('')
      return
    }
    setBusy(true)
    setError('')
    try {
      await adminRequest('/api/auth/login', 'POST', { email, password })
      window.location.replace(returnTo)
    } catch (caught) {
      setError(visibleError(caught))
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <section className="card narrow" aria-labelledby="login-heading">
      <h1 ref={heading} id="login-heading" tabIndex={-1}>
        管理者ログイン
      </h1>
      <p className="subtle">管理者専用のローカル画面です。</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          メールアドレス
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          パスワード
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? '確認中…' : 'ログイン'}
        </button>
      </form>
      <p className="subtle auth-link">
        <a href="/admin/setup">初回設定を開く</a>
      </p>
    </section>
  )
}

function SetupForm() {
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = usePageHeading('初回設定')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validationError = newPasswordValidationError(password)
    if (validationError) {
      setError(validationError)
      setPassword('')
      return
    }
    setBusy(true)
    setError('')
    try {
      await adminRequest(
        '/api/admin/setup',
        'POST',
        { email, password },
        { 'X-Play-Bootstrap-Token': bootstrapToken },
      )
      window.location.replace('/admin/login')
    } catch (caught) {
      setError(visibleError(caught))
    } finally {
      setBootstrapToken('')
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <section className="card narrow" aria-labelledby="setup-heading">
      <h1 ref={heading} id="setup-heading" tabIndex={-1}>
        初回管理者設定
      </h1>
      <p className="subtle">
        管理者は一人だけ登録できます。設定後は改めてログインしてください。
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          初回セットアップ用トークン
          <input
            type="password"
            autoComplete="off"
            required
            minLength={64}
            value={bootstrapToken}
            onChange={(event) => setBootstrapToken(event.target.value)}
          />
          <small>
            ローカル設定に用意した値を入力します。画面には保存しません。
          </small>
        </label>
        <label>
          メールアドレス
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          パスワード（12文字以上）
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? '設定中…' : '管理者を設定'}
        </button>
      </form>
      <p className="subtle auth-link">
        <a href="/admin/login">ログインへ戻る</a>
      </p>
    </section>
  )
}

function ProtectedLayout({
  returnTo = '/admin/videos',
  onVideos,
  onLogout,
  children,
}: ProtectedPageProps & {
  returnTo?: string
  onVideos?: () => boolean | void
  children: ReactNode
}) {
  return (
    <AdminLayout
      siteName={brand.siteName}
      logoPath={brand.logoPath}
      videosHref={returnTo}
      onVideos={onVideos ?? (() => true)}
      onLogout={onLogout}
    >
      {children}
    </AdminLayout>
  )
}

function VideosPage({
  onLogout,
  onUnauthorized,
  offset,
}: ProtectedPageProps & { offset: number }) {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const heading = usePageHeading('動画一覧')

  useEffect(() => {
    let active = true
    setLoading(true)
    adminRequest<{ videos: Video[] }>(`/api/admin/videos?offset=${offset}`)
      .then((result) => {
        if (active) setVideos(result.videos)
      })
      .catch((caught) => {
        if (!active) return
        if (caught instanceof AdminRequestError && caught.status === 401) {
          setVideos([])
          onUnauthorized()
          return
        }
        setError(visibleError(caught))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [offset, onUnauthorized])

  return (
    <ProtectedLayout onLogout={onLogout} onUnauthorized={onUnauthorized}>
      <section aria-labelledby="videos-heading">
        <div className="page-heading">
          <div>
            <h1 ref={heading} id="videos-heading" tabIndex={-1}>
              動画
            </h1>
            <p className="subtle">
              {loading
                ? '100件ずつ読み込みます。'
                : `${videoListRangeLabel(offset, videos.length)}。`}{' '}
              日時は{displayTimeZone}で表示します。すべて未検証の下書きです。
            </p>
          </div>
          <a
            className="button-link"
            href={`/admin/videos/new${offset === 0 ? '' : `?offset=${offset}`}`}
          >
            動画を登録
          </a>
        </div>
        <div className="card">
          {loading ? (
            <p className="loading" role="status">
              動画を読み込んでいます…
            </p>
          ) : error ? (
            <div className="error-state" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => window.location.reload()}>
                再読み込み
              </button>
            </div>
          ) : videos.length === 0 ? (
            <div className="empty-state">
              <h2>登録済みの動画はありません</h2>
              <p>「動画を登録」から未検証の下書きを追加できます。</p>
            </div>
          ) : (
            <ul className="video-list">
              {videos.map((video) => (
                <li key={video.id}>
                  <div className="video-summary">
                    <div>
                      <strong>{video.title}</strong>
                      <span className="status-badge">未検証の下書き</span>
                    </div>
                    <dl>
                      <div>
                        <dt>公開期間</dt>
                        <dd>
                          {new Date(video.startsAt).toLocaleString('ja-JP')}〜
                          {new Date(video.endsAt).toLocaleString('ja-JP')}
                        </dd>
                      </div>
                    </dl>
                    <a href={adminVideoEditUrl(video.id, offset)}>編集</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && !error && (
            <nav className="pager" aria-label="動画一覧のページ送り">
              {offset === 0 ? (
                <span className="pager-disabled" aria-disabled="true">
                  前へ
                </span>
              ) : (
                <a href={adminVideosUrl(Math.max(0, offset - 100))}>前へ</a>
              )}
              <span>
                {offset + 1}件目から{videos.length}件
              </span>
              {videos.length < 100 ? (
                <span className="pager-disabled" aria-disabled="true">
                  次へ
                </span>
              ) : (
                <a href={adminVideosUrl(offset + 100)}>次へ</a>
              )}
            </nav>
          )}
        </div>
      </section>
    </ProtectedLayout>
  )
}

function VideoTabs({
  videoId,
  offset,
  current,
}: {
  videoId: string
  offset: number
  current: 'edit' | 'codes'
}) {
  return (
    <nav className="video-tabs" aria-label="動画の設定">
      <a
        href={adminVideoEditUrl(videoId, offset)}
        aria-current={current === 'edit' ? 'page' : undefined}
      >
        基本情報
      </a>
      <a
        href={adminVideoCodesUrl(videoId, offset)}
        aria-current={current === 'codes' ? 'page' : undefined}
      >
        閲覧用キー
      </a>
    </nav>
  )
}

function VideoEditorPage({
  onLogout,
  onUnauthorized,
  route,
}: ProtectedPageProps & {
  route: Extract<AdminRoute, { kind: 'new-video' | 'edit-video' }>
}) {
  const isNew = route.kind === 'new-video'
  const offset = Number(
    new URL(route.returnTo, window.location.origin).searchParams.get(
      'offset',
    ) ?? 0,
  )
  const [video, setVideo] = useState<Video | null>(null)
  const [form, setForm] = useState<VideoFormValues>(emptyVideoForm)
  const [savedForm, setSavedForm] = useState<VideoFormValues>(emptyVideoForm)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const heading = usePageHeading(isNew ? '動画を登録' : '動画を編集')
  const errorSummary = useRef<HTMLParagraphElement>(null)
  const dirty = isVideoFormDirty(form, savedForm)
  useBeforeUnload(dirty)

  useEffect(() => {
    if (route.kind !== 'edit-video') return
    let active = true
    adminRequest<{ video: Video }>(
      `/api/admin/videos/${encodeURIComponent(route.videoId)}`,
    )
      .then((result) => {
        if (!active) return
        const nextForm = formFromVideo(result.video)
        setVideo(result.video)
        setForm(nextForm)
        setSavedForm(nextForm)
      })
      .catch((caught) => {
        if (!active) return
        if (caught instanceof AdminRequestError && caught.status === 401) {
          setVideo(null)
          setForm(emptyVideoForm)
          onUnauthorized()
          return
        }
        setError(visibleError(caught))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [onUnauthorized, route])

  useEffect(() => {
    if (error) errorSummary.current?.focus()
  }, [error])

  function confirmNavigation() {
    if (!dirty) return true
    return canLeaveEditor(
      true,
      window.confirm('保存していない変更を破棄して移動しますか？'),
    )
  }

  function followLink(event: MouseEvent<HTMLAnchorElement>) {
    if (!confirmNavigation()) event.preventDefault()
  }

  async function saveVideo(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const payload = {
        ...form,
        startsAt: toIsoDateTime(form.startsAt),
        endsAt: toIsoDateTime(form.endsAt),
      }
      const path =
        route.kind === 'edit-video'
          ? `/api/admin/videos/${encodeURIComponent(route.videoId)}`
          : '/api/admin/videos'
      const result = await adminRequest<{ video: Video }>(
        path,
        isNew ? 'POST' : 'PUT',
        payload,
      )
      const nextForm = formFromVideo(result.video)
      setVideo(result.video)
      setForm(nextForm)
      setSavedForm(nextForm)
      if (isNew) {
        window.location.replace(adminVideoEditUrl(result.video.id, offset))
      } else {
        setSaved(true)
      }
    } catch (caught) {
      if (caught instanceof AdminRequestError && caught.status === 401) {
        setVideo(null)
        setForm(emptyVideoForm)
        onUnauthorized()
      } else {
        setError(visibleError(caught))
      }
    } finally {
      setBusy(false)
    }
  }

  const page = loading ? (
    <p className="loading" role="status">
      動画を読み込んでいます…
    </p>
  ) : error && !isNew && video === null ? (
    <section className="card error-state" aria-labelledby="editor-load-error">
      <h1 ref={heading} id="editor-load-error" tabIndex={-1}>
        動画を表示できません
      </h1>
      <p ref={errorSummary} className="error" role="alert" tabIndex={-1}>
        {error}
      </p>
      <a href={route.returnTo}>動画一覧へ戻る</a>
    </section>
  ) : (
    <section aria-labelledby="editor-heading">
      <div className="page-heading">
        <div>
          <h1 ref={heading} id="editor-heading" tabIndex={-1}>
            {isNew ? '動画を登録' : '動画を編集'}
          </h1>
          <p className="subtle">
            公開せず、Filmaの存在確認を行わない下書きです。
          </p>
        </div>
        <a href={route.returnTo} onClick={followLink}>
          動画一覧へ戻る
        </a>
      </div>
      {!isNew && video && (
        <VideoTabs videoId={video.id} offset={offset} current="edit" />
      )}
      <div className="card editor-card">
        <form onSubmit={(event) => void saveVideo(event)}>
          <label>
            FilmaファイルID
            <input
              inputMode="numeric"
              required
              maxLength={20}
              pattern="[1-9][0-9]{0,19}"
              value={form.filmaFileId}
              onChange={(event) =>
                setForm({ ...form, filmaFileId: event.target.value })
              }
            />
          </label>
          <label>
            タイトル
            <input
              required
              maxLength={200}
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </label>
          <label>
            説明
            <textarea
              maxLength={2000}
              rows={5}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <div className="date-grid">
            <label>
              開始日時
              <input
                type="datetime-local"
                required
                value={form.startsAt}
                onChange={(event) =>
                  setForm({ ...form, startsAt: event.target.value })
                }
              />
            </label>
            <label>
              終了日時
              <input
                type="datetime-local"
                required
                value={form.endsAt}
                onChange={(event) =>
                  setForm({ ...form, endsAt: event.target.value })
                }
              />
            </label>
          </div>
          {error && (
            <p ref={errorSummary} className="error" role="alert" tabIndex={-1}>
              {error}
            </p>
          )}
          {saved && (
            <p className="success" role="status">
              保存しました。
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
            <a href={route.returnTo} onClick={followLink}>
              一覧へ戻る
            </a>
          </div>
        </form>
      </div>
    </section>
  )

  return (
    <ProtectedLayout
      returnTo={route.returnTo}
      onVideos={confirmNavigation}
      onLogout={onLogout}
      onUnauthorized={onUnauthorized}
    >
      {page}
    </ProtectedLayout>
  )
}

function VideoCodesPage({
  onLogout,
  onUnauthorized,
  route,
}: ProtectedPageProps & {
  route: Extract<AdminRoute, { kind: 'video-codes' }>
}) {
  const offset = Number(
    new URL(route.returnTo, window.location.origin).searchParams.get(
      'offset',
    ) ?? 0,
  )
  const [video, setVideo] = useState<Video | null>(null)
  const [codes, setCodes] = useState<CodeMetadata[]>([])
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = usePageHeading('閲覧用キー')
  const selectedVideoId = useRef(route.videoId)

  const clearProtectedState = useCallback(() => {
    setVideo(null)
    setCodes([])
    setIssuedCode(null)
    setCopyStatus('')
  }, [])

  const handleError = useCallback(
    (caught: unknown) => {
      if (caught instanceof AdminRequestError && caught.status === 401) {
        clearProtectedState()
        onUnauthorized()
        return
      }
      setError(visibleError(caught))
    },
    [clearProtectedState, onUnauthorized],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [videoResult, codeResult] = await Promise.all([
        adminRequest<{ video: Video }>(
          `/api/admin/videos/${encodeURIComponent(route.videoId)}`,
        ),
        adminRequest<{ codes: CodeMetadata[] }>(
          `/api/admin/videos/${encodeURIComponent(route.videoId)}/codes`,
        ),
      ])
      setVideo(videoResult.video)
      setCodes(codeResult.codes)
    } catch (caught) {
      handleError(caught)
    } finally {
      setLoading(false)
    }
  }, [handleError, route.videoId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const discard = () => {
      setIssuedCode(null)
      setCopyStatus('')
    }
    window.addEventListener('pagehide', discard)
    window.addEventListener('pageshow', discard)
    return () => {
      window.removeEventListener('pagehide', discard)
      window.removeEventListener('pageshow', discard)
    }
  }, [])

  async function issueCode() {
    const requestedVideoId = route.videoId
    setIssuedCode(null)
    setCopyStatus('')
    setBusy(true)
    setError('')
    try {
      const result = await adminRequest<{
        id: string
        code: string
        createdAt: string
      }>(
        `/api/admin/videos/${encodeURIComponent(requestedVideoId)}/codes`,
        'POST',
        {},
      )
      const accepted = acceptIssuedCodeForSelection(
        selectedVideoId.current,
        requestedVideoId,
        result,
      )
      if (!accepted) return
      setIssuedCode(accepted.issuedCode)
      setCodes((current) => [accepted.metadata, ...current])
    } catch (caught) {
      handleError(caught)
    } finally {
      setBusy(false)
    }
  }

  async function copyIssuedCode() {
    if (!issuedCode) return
    try {
      await navigator.clipboard.writeText(issuedCode)
      setCopyStatus('コピーしました。')
    } catch {
      setCopyStatus(
        'コピーできませんでした。表示中のキーを手動でコピーしてください。',
      )
    }
  }

  async function revokeCode(codeId: string) {
    if (!window.confirm('この未使用の閲覧用キーを取り消しますか？')) return
    setIssuedCode(null)
    setCopyStatus('')
    setBusy(true)
    setError('')
    try {
      await adminRequest(
        `/api/admin/videos/${encodeURIComponent(
          route.videoId,
        )}/codes/${encodeURIComponent(codeId)}/revoke`,
        'POST',
        {},
      )
      await load()
    } catch (caught) {
      handleError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProtectedLayout
      returnTo={route.returnTo}
      onLogout={onLogout}
      onUnauthorized={onUnauthorized}
    >
      {loading ? (
        <p className="loading" role="status">
          閲覧用キーを読み込んでいます…
        </p>
      ) : error && video === null ? (
        <section className="card error-state">
          <h1 ref={heading} tabIndex={-1}>
            閲覧用キーを表示できません
          </h1>
          <p className="error" role="alert">
            {error}
          </p>
          <a href={route.returnTo}>動画一覧へ戻る</a>
        </section>
      ) : video ? (
        <section aria-labelledby="codes-heading">
          <div className="page-heading">
            <div>
              <h1 ref={heading} id="codes-heading" tabIndex={-1}>
                閲覧用キー
              </h1>
              <p className="subtle">{video.title}</p>
            </div>
            <a href={route.returnTo}>動画一覧へ戻る</a>
          </div>
          <VideoTabs videoId={video.id} offset={offset} current="codes" />
          <div className="card">
            <div className="section-heading">
              <div>
                <h2>発行履歴</h2>
                <p className="subtle">
                  生のキーは発行直後に一度だけ表示します。
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void issueCode()}
              >
                {busy ? '処理中…' : 'キーを1件発行'}
              </button>
            </div>
            {issuedCode && (
              <div className="issued-key" role="status">
                <strong>このキーは再表示できません</strong>
                <p className="key-value">{issuedCode}</p>
                <div className="issued-actions">
                  <button type="button" onClick={() => void copyIssuedCode()}>
                    コピー
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setIssuedCode(null)
                      setCopyStatus('')
                    }}
                  >
                    確認して閉じる
                  </button>
                </div>
                {copyStatus && (
                  <p className="subtle" role="status">
                    {copyStatus}
                  </p>
                )}
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                <p>{error}</p>
                <p>
                  自動で再発行しません。履歴を再取得して状態を確認してください。
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void load()}
                >
                  状態を再取得
                </button>
              </div>
            )}
            {codes.length === 0 ? (
              <p className="empty">発行履歴はありません。</p>
            ) : (
              <ul className="code-list">
                {codes.map((code) => (
                  <li key={code.id}>
                    <div>
                      <strong>
                        {code.status === 'unused' ? '未使用' : '取消済み'}
                      </strong>
                      <span>
                        {new Date(code.createdAt).toLocaleString('ja-JP')}
                      </span>
                      <small>ID: {code.id}</small>
                    </div>
                    {code.status === 'unused' && (
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void revokeCode(code.id)}
                      >
                        取り消す
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </ProtectedLayout>
  )
}

function UnknownPage({
  authenticated,
  onLogout,
}: {
  authenticated: boolean
  onLogout: () => void
}) {
  const heading = usePageHeading('ページが見つかりません')
  const content = (
    <section className="card error-state">
      <h1 ref={heading} tabIndex={-1}>
        ページが見つかりません
      </h1>
      <p>URLをご確認ください。</p>
      <a href={authenticated ? '/admin/videos' : '/admin/login'}>
        {authenticated ? '動画一覧へ' : '管理者ログインへ'}
      </a>
    </section>
  )
  return authenticated ? (
    <ProtectedLayout onLogout={onLogout} onUnauthorized={() => {}}>
      {content}
    </ProtectedLayout>
  ) : (
    <AuthLayout siteName={brand.siteName} logoPath={brand.logoPath}>
      {content}
    </AuthLayout>
  )
}

function LoadingPage() {
  return (
    <AuthLayout siteName={brand.siteName} logoPath={brand.logoPath}>
      <p className="loading" role="status">
        セッションを確認しています…
      </p>
    </AuthLayout>
  )
}

function App() {
  const route = useMemo(
    () => parseAdminRoute(window.location.pathname, window.location.search),
    [],
  )
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  useBrandFavicon()

  const verifySession = useCallback(() => {
    let active = true
    adminRequest('/api/admin/session')
      .then(() => {
        if (active) setAuthenticated(true)
      })
      .catch(() => {
        if (active) setAuthenticated(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => verifySession(), [verifySession])

  useEffect(() => {
    const revalidate = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      setAuthenticated(null)
      verifySession()
    }
    window.addEventListener('pageshow', revalidate)
    return () => window.removeEventListener('pageshow', revalidate)
  }, [verifySession])

  const logout = useCallback(async () => {
    setAuthenticated(false)
    try {
      await adminRequest('/api/auth/logout', 'POST', {})
    } catch {
      // Protected state is already removed. Do not retry an uncertain mutation.
    }
    window.location.replace('/admin/login')
  }, [])

  const onUnauthorized = useCallback(() => setAuthenticated(false), [])

  useEffect(() => {
    const protectedRoute = [
      'videos',
      'new-video',
      'edit-video',
      'video-codes',
    ].includes(route.kind)
    if (authenticated === false && protectedRoute) {
      window.location.replace(
        adminLoginUrl(`${window.location.pathname}${window.location.search}`),
      )
    }
    if (authenticated === true && route.kind === 'login') {
      window.location.replace(route.returnTo)
    }
    if (authenticated === true && route.kind === 'setup') {
      window.location.replace('/admin/videos')
    }
  }, [authenticated, route])

  if (
    window.location.pathname === '/' ||
    window.location.pathname === '/admin'
  ) {
    window.location.replace('/admin/videos')
    return <LoadingPage />
  }
  if (authenticated === null) return <LoadingPage />
  if (route.kind === 'not-found') {
    return (
      <UnknownPage
        authenticated={authenticated}
        onLogout={() => void logout()}
      />
    )
  }
  if (route.kind === 'setup') {
    return authenticated ? (
      <LoadingPage />
    ) : (
      <AuthLayout siteName={brand.siteName} logoPath={brand.logoPath}>
        <SetupForm />
      </AuthLayout>
    )
  }
  if (route.kind === 'login') {
    return authenticated ? (
      <LoadingPage />
    ) : (
      <AuthLayout siteName={brand.siteName} logoPath={brand.logoPath}>
        <LoginForm returnTo={route.returnTo} />
      </AuthLayout>
    )
  }
  if (!authenticated) return <LoadingPage />

  const common = { onLogout: () => void logout(), onUnauthorized }
  if (route.kind === 'videos') {
    return <VideosPage {...common} offset={route.offset} />
  }
  if (route.kind === 'new-video' || route.kind === 'edit-video') {
    return <VideoEditorPage {...common} route={route} />
  }
  return <VideoCodesPage {...common} route={route} />
}

const root = document.querySelector('#root')
if (!(root instanceof HTMLElement)) {
  throw new Error('Admin root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
