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
import {
  codeFiltersParams,
  parseVideoFilters,
  videoFiltersParams,
  type VideoFilters,
} from '../core/admin-management'
import { brand, isBrandAssetPath } from '../ui/brand'
import { AdminLayout } from '../ui/layouts/AdminLayout'
import { AuthLayout } from '../ui/layouts/AuthLayout'
import { shouldHandleSameDocumentLink } from '../ui/navigation'
import { ViewerApp } from '../viewer/App'
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
  bulkListResult,
  canLeaveEditor,
  isVideoFormDirty,
  revokeCodeConfirmation,
  shouldWarnBeforeUnload,
  unknownOutcomeAdvice,
  videoDateRangeError,
  videoListRangeLabel,
  type VideoFormValues,
} from './ui-state'
import { VideoDateFields } from './VideoDateFields'
import { BulkActions } from './BulkActions'
import { CodeListFilters, VideoListFilters } from './ListFilters'
import './styles.css'

type CodeMetadata = {
  id: string
  createdAt: string
  revokedAt: string | null
  status: 'unused' | 'used' | 'revoked'
  enabled: boolean
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

function useBeforeUnload(
  dirty: boolean,
  confirmedNavigation: { readonly current: boolean },
) {
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      if (!shouldWarnBeforeUnload(dirty, confirmedNavigation.current)) return
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
  currentPage,
  children,
}: ProtectedPageProps & {
  returnTo?: string
  onVideos?: () => boolean | void
  currentPage?: 'videos' | 'filma'
  children: ReactNode
}) {
  return (
    <AdminLayout
      siteName={brand.siteName}
      logoPath={brand.logoPath}
      videosHref={returnTo}
      onVideos={onVideos ?? (() => true)}
      currentPage={currentPage}
      onLogout={onLogout}
    >
      {children}
    </AdminLayout>
  )
}

function FilmaSettingsPage({ onLogout, onUnauthorized }: ProtectedPageProps) {
  const [apiKey, setApiKey] = useState('')
  const [state, setState] = useState<
    '未設定' | '確認中' | '接続済み' | '接続失敗'
  >('確認中')
  const [busy, setBusy] = useState(false)
  const heading = usePageHeading('Filma連携')

  const load = useCallback(async () => {
    setState('確認中')
    try {
      const result = await adminRequest<{ configured: boolean }>(
        '/api/admin/filma',
      )
      setState(result.configured ? '接続済み' : '未設定')
    } catch (caught) {
      if (caught instanceof AdminRequestError && caught.status === 401) {
        onUnauthorized()
      } else {
        setState('接続失敗')
      }
    }
  }, [onUnauthorized])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !apiKey) return
    setBusy(true)
    setState('確認中')
    try {
      await adminRequest('/api/admin/filma', 'PUT', { apiKey })
      setState('接続済み')
    } catch (caught) {
      if (caught instanceof AdminRequestError && caught.status === 401) {
        onUnauthorized()
      }
      setState('接続失敗')
    } finally {
      setApiKey('')
      setBusy(false)
    }
  }

  return (
    <ProtectedLayout
      currentPage="filma"
      onLogout={onLogout}
      onUnauthorized={onUnauthorized}
    >
      <section aria-labelledby="filma-heading">
        <div className="page-heading">
          <div>
            <h1 ref={heading} id="filma-heading" tabIndex={-1}>
              Filma連携
            </h1>
            <p className="subtle">
              APIキーは接続確認後に暗号化して保存し、再表示しません。
            </p>
          </div>
        </div>
        <div className="card narrow">
          <p role="status">
            接続状態: <strong>{state}</strong>
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <label>
              Filma APIキー
              <input
                type="password"
                autoComplete="off"
                required
                maxLength={4096}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || !apiKey}>
              {busy ? '確認中…' : '接続を確認して保存'}
            </button>
          </form>
        </div>
      </section>
    </ProtectedLayout>
  )
}

function VideosPage({
  onLogout,
  onUnauthorized,
  filters,
}: ProtectedPageProps & { filters: VideoFilters }) {
  const [activeFilters, setActiveFilters] = useState(filters)
  const { offset } = activeFilters
  const [videos, setVideos] = useState<Video[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resultMessage, setResultMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = usePageHeading('動画一覧')

  const load = useCallback(
    async (requestedFilters: VideoFilters) => {
      setLoading(true)
      setError('')
      try {
        const params = videoFiltersParams(requestedFilters)
        const result = await adminRequest<{
          videos: Video[]
          hasMore: boolean
        }>(`/api/admin/videos?${params.toString()}`)
        setVideos(result.videos)
        setHasMore(result.hasMore)
        return result.videos
      } catch (caught) {
        if (caught instanceof AdminRequestError && caught.status === 401) {
          setVideos([])
          setSelected(new Set())
          onUnauthorized()
        } else {
          setError(visibleError(caught))
        }
        return null
      } finally {
        setLoading(false)
      }
    },
    [onUnauthorized],
  )

  useEffect(() => {
    setActiveFilters(filters)
    setSelected(new Set())
    void load(filters)
  }, [filters, load])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkStatus(published: boolean) {
    if (selected.size === 0 || busy) return
    const label = published ? '公開設定' : '非公開'
    if (
      !window.confirm(
        `${selected.size}件の動画を${label}にします。タイトルや期間は変更しません。`,
      )
    )
      return
    setBusy(true)
    setError('')
    setResultMessage('')
    try {
      const result = await adminRequest<{
        changedCount: number
        unchangedCount: number
      }>('/api/admin/videos/bulk-status', 'POST', {
        ids: [...selected],
        status: published ? 'published' : 'draft',
      })
      setSelected(new Set())
      const refreshed = await load(activeFilters)
      if (!refreshed) return
      const outcome = bulkListResult(
        result.changedCount,
        result.unchangedCount,
        offset,
        refreshed.length,
      )
      if (outcome.returnedToFirst) {
        const firstPageFilters = { ...activeFilters, offset: outcome.offset }
        setActiveFilters(firstPageFilters)
        window.history.replaceState(null, '', adminVideosUrl(firstPageFilters))
        await load(firstPageFilters)
      }
      setResultMessage(outcome.message)
    } catch (caught) {
      if (caught instanceof AdminRequestError && caught.status === 401) {
        setVideos([])
        setSelected(new Set())
        onUnauthorized()
      } else {
        setError(visibleError(caught))
      }
    } finally {
      setBusy(false)
    }
  }

  const allSelected =
    videos.length > 0 && videos.every((video) => selected.has(video.id))
  const partlySelected = selected.size > 0 && !allSelected

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
              日時は{displayTimeZone}
              で表示します。公開設定済みでも実配信は停止中です。
            </p>
          </div>
          <a
            className="button-link"
            href={adminVideosUrl(activeFilters).replace(
              '/admin/videos',
              '/admin/videos/new',
            )}
          >
            動画を登録
          </a>
        </div>
        <div className="card filter-card">
          <VideoListFilters action="/admin/videos" filters={activeFilters} />
        </div>
        <div className="card">
          {resultMessage && (
            <p className="success" role="status">
              {resultMessage}
            </p>
          )}
          {loading ? (
            <p className="loading" role="status">
              動画を読み込んでいます…
            </p>
          ) : error ? (
            <div className="error-state" role="alert">
              <p>{error}</p>
              <p>{unknownOutcomeAdvice}</p>
              <button type="button" onClick={() => window.location.reload()}>
                再読み込み
              </button>
            </div>
          ) : videos.length === 0 ? (
            <div className="empty-state">
              <h2>条件に一致する動画はありません</h2>
              <p>検索条件を変更するか、動画を登録してください。</p>
            </div>
          ) : (
            <>
              <div className="select-page">
                <label>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = partlySelected
                    }}
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? new Set()
                          : new Set(videos.map((video) => video.id)),
                      )
                    }
                  />
                  現ページの{videos.length}件を選択
                </label>
              </div>
              <BulkActions
                kind="videos"
                selectedCount={selected.size}
                busy={busy}
                onTarget={(target) => void bulkStatus(target)}
              />
              {error && (
                <div className="error" role="alert">
                  <p>{error}</p>
                  <p>{unknownOutcomeAdvice}</p>
                </div>
              )}
              <ul className="video-list selectable-list">
                {videos.map((video) => (
                  <li key={video.id}>
                    <input
                      type="checkbox"
                      aria-label={`動画「${video.title}」を選択`}
                      checked={selected.has(video.id)}
                      disabled={busy}
                      onChange={() => toggle(video.id)}
                    />
                    <div className="video-summary">
                      <div>
                        <strong>{video.title}</strong>
                        <span className="status-badge">
                          {video.status === 'published'
                            ? '公開設定済み'
                            : '非公開'}
                        </span>
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
                      <div className="row-actions">
                        <a href={adminVideoEditUrl(video.id, activeFilters)}>
                          編集
                        </a>
                        <a href={adminVideoCodesUrl(video.id, activeFilters)}>
                          閲覧用キー
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!loading && !error && (
            <nav className="pager" aria-label="動画一覧のページ送り">
              {offset === 0 ? (
                <span className="pager-disabled" aria-disabled="true">
                  前へ
                </span>
              ) : (
                <a
                  href={adminVideosUrl({
                    ...activeFilters,
                    offset: Math.max(0, offset - 100),
                  })}
                >
                  前へ
                </a>
              )}
              <span>{videoListRangeLabel(offset, videos.length)}</span>
              {!hasMore ? (
                <span className="pager-disabled" aria-disabled="true">
                  次へ
                </span>
              ) : (
                <a
                  href={adminVideosUrl({
                    ...activeFilters,
                    offset: offset + 100,
                  })}
                >
                  次へ
                </a>
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
  filters,
  current,
}: {
  videoId: string
  filters: VideoFilters
  current: 'edit' | 'codes'
}) {
  return (
    <nav className="video-tabs" aria-label="動画の設定">
      <a
        href={adminVideoEditUrl(videoId, filters)}
        aria-current={current === 'edit' ? 'page' : undefined}
      >
        基本情報
      </a>
      <a
        href={adminVideoCodesUrl(videoId, filters)}
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
  const returnFilters = parseVideoFilters(
    new URL(route.returnTo, window.location.origin).searchParams,
  ) ?? { q: '', status: null, from: null, to: null, offset: 0 }
  const offset = returnFilters.offset
  const [video, setVideo] = useState<Video | null>(null)
  const [form, setForm] = useState<VideoFormValues>(emptyVideoForm)
  const [savedForm, setSavedForm] = useState<VideoFormValues>(emptyVideoForm)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dateRangeError, setDateRangeError] = useState<string | null>(null)
  const heading = usePageHeading(isNew ? '動画を登録' : '動画を編集')
  const errorSummary = useRef<HTMLParagraphElement>(null)
  const confirmedNavigation = useRef(false)
  const dirty = isVideoFormDirty(form, savedForm)
  useBeforeUnload(dirty, confirmedNavigation)

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
    const canLeave = canLeaveEditor(
      true,
      window.confirm('保存していない変更を破棄して移動しますか？'),
    )
    if (canLeave) {
      confirmedNavigation.current = true
      window.setTimeout(() => {
        confirmedNavigation.current = false
      }, 0)
    }
    return canLeave
  }

  function followLink(event: MouseEvent<HTMLAnchorElement>) {
    if (!shouldHandleSameDocumentLink(event)) return
    if (!confirmNavigation()) event.preventDefault()
  }

  async function saveVideo(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSaved(false)
    const nextDateRangeError = videoDateRangeError(form.startsAt, form.endsAt)
    setDateRangeError(nextDateRangeError)
    if (nextDateRangeError) {
      setError(nextDateRangeError)
      return
    }
    setBusy(true)
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
      setDateRangeError(null)
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
        setDateRangeError(null)
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
        <VideoTabs videoId={video.id} filters={returnFilters} current="edit" />
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
          <VideoDateFields
            startsAt={form.startsAt}
            endsAt={form.endsAt}
            dateRangeError={dateRangeError}
            errorRef={errorSummary}
            onStartsAtChange={(startsAt) => {
              setForm({ ...form, startsAt })
              setDateRangeError(null)
              setError('')
            }}
            onEndsAtChange={(endsAt) => {
              setForm({ ...form, endsAt })
              setDateRangeError(null)
              setError('')
            }}
          />
          {error && !dateRangeError && (
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
  const videoFilters = parseVideoFilters(
    new URL(route.returnTo, window.location.origin).searchParams,
  ) ?? { q: '', status: null, from: null, to: null, offset: 0 }
  const { codeFilters } = route
  const [activeCodeFilters, setActiveCodeFilters] = useState(codeFilters)
  const [video, setVideo] = useState<Video | null>(null)
  const [codes, setCodes] = useState<CodeMetadata[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resultMessage, setResultMessage] = useState('')
  const heading = usePageHeading('閲覧用キー')
  const selectedVideoId = useRef(route.videoId)

  const clearProtectedState = useCallback(() => {
    setVideo(null)
    setCodes([])
    setIssuedCode(null)
    setCopyStatus('')
    setSelected(new Set())
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

  const load = useCallback(
    async (requestedFilters: typeof codeFilters) => {
      setLoading(true)
      setError('')
      try {
        const [videoResult, codeResult] = await Promise.all([
          adminRequest<{ video: Video }>(
            `/api/admin/videos/${encodeURIComponent(route.videoId)}`,
          ),
          adminRequest<{ codes: CodeMetadata[]; hasMore: boolean }>(
            `/api/admin/videos/${encodeURIComponent(route.videoId)}/codes?${codeFiltersParams(
              requestedFilters,
              'offset',
            ).toString()}`,
          ),
        ])
        setVideo(videoResult.video)
        setCodes(codeResult.codes)
        setHasMore(codeResult.hasMore)
        return codeResult.codes
      } catch (caught) {
        handleError(caught)
        return null
      } finally {
        setLoading(false)
      }
    },
    [handleError, route.videoId],
  )

  useEffect(() => {
    setActiveCodeFilters(codeFilters)
    setSelected(new Set())
    void load(codeFilters)
  }, [codeFilters, load])

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
      await load(activeCodeFilters)
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
    if (!window.confirm(revokeCodeConfirmation(codeId))) return
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
      await load(activeCodeFilters)
    } catch (caught) {
      handleError(caught)
    } finally {
      setBusy(false)
    }
  }

  async function bulkCodeStatus(enabled: boolean) {
    if (selected.size === 0 || busy) return
    const action = enabled ? '有効' : '無効'
    const impact = enabled
      ? '未使用キーの引換設定を再開します。'
      : '付与済みの視聴権は消しません。'
    if (
      !window.confirm(`${selected.size}件のキーを${action}にします。${impact}`)
    )
      return
    setBusy(true)
    setError('')
    setResultMessage('')
    setIssuedCode(null)
    try {
      const result = await adminRequest<{
        changedCount: number
        unchangedCount: number
      }>(
        `/api/admin/videos/${encodeURIComponent(route.videoId)}/codes/bulk-status`,
        'POST',
        { ids: [...selected], enabled },
      )
      setSelected(new Set())
      const refreshed = await load(activeCodeFilters)
      if (!refreshed) return
      const outcome = bulkListResult(
        result.changedCount,
        result.unchangedCount,
        activeCodeFilters.offset,
        refreshed.length,
      )
      if (outcome.returnedToFirst) {
        const firstPageFilters = {
          ...activeCodeFilters,
          offset: outcome.offset,
        }
        setActiveCodeFilters(firstPageFilters)
        window.history.replaceState(
          null,
          '',
          adminVideoCodesUrl(
            video?.id ?? route.videoId,
            videoFilters,
            firstPageFilters,
          ),
        )
        await load(firstPageFilters)
      }
      setResultMessage(outcome.message)
    } catch (caught) {
      handleError(caught)
    } finally {
      setBusy(false)
    }
  }

  const eligibleCodes = codes.filter((code) => code.status === 'unused')
  const allSelected =
    eligibleCodes.length > 0 &&
    eligibleCodes.every((code) => selected.has(code.id))
  const partlySelected = selected.size > 0 && !allSelected

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
          <VideoTabs
            videoId={video.id}
            filters={videoFilters}
            current="codes"
          />
          <div className="card filter-card">
            <CodeListFilters
              action={`/admin/videos/${encodeURIComponent(video.id)}/codes`}
              resetHref={adminVideoCodesUrl(video.id, videoFilters)}
              videoFilters={videoFilters}
              filters={activeCodeFilters}
            />
          </div>
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
                <p>{unknownOutcomeAdvice}</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void load(activeCodeFilters)}
                >
                  状態を再取得
                </button>
              </div>
            )}
            <div className="select-page">
              <label>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = partlySelected
                  }}
                  disabled={eligibleCodes.length === 0 || busy}
                  onChange={() =>
                    setSelected(
                      allSelected
                        ? new Set()
                        : new Set(eligibleCodes.map((code) => code.id)),
                    )
                  }
                />
                現ページの変更可能な{eligibleCodes.length}件を選択
              </label>
            </div>
            <BulkActions
              kind="codes"
              selectedCount={selected.size}
              busy={busy}
              enableDisabled={Date.parse(video.endsAt) <= Date.now()}
              onTarget={(target) => void bulkCodeStatus(target)}
            />
            {Date.parse(video.endsAt) <= Date.now() && (
              <p className="subtle">
                期間終了済みのためキーを再有効化できません。
              </p>
            )}
            {resultMessage && (
              <p className="success" role="status">
                {resultMessage}
              </p>
            )}
            {codes.length === 0 ? (
              <p className="empty">発行履歴はありません。</p>
            ) : (
              <ul className="code-list selectable-list">
                {codes.map((code) => (
                  <li key={code.id}>
                    <input
                      type="checkbox"
                      aria-label={`閲覧用キーID ${code.id} を選択`}
                      checked={selected.has(code.id)}
                      disabled={code.status !== 'unused' || busy}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (next.has(code.id)) next.delete(code.id)
                          else next.add(code.id)
                          return next
                        })
                      }
                    />
                    <div>
                      <strong>
                        {code.status === 'unused'
                          ? '未使用'
                          : code.status === 'used'
                            ? '使用済み'
                            : '取消済み'}
                      </strong>
                      <span>{code.enabled ? '設定: 有効' : '設定: 無効'}</span>
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
            <nav className="pager" aria-label="閲覧用キー一覧のページ送り">
              {activeCodeFilters.offset === 0 ? (
                <span className="pager-disabled" aria-disabled="true">
                  前へ
                </span>
              ) : (
                <a
                  href={adminVideoCodesUrl(video.id, videoFilters, {
                    ...activeCodeFilters,
                    offset: Math.max(0, activeCodeFilters.offset - 100),
                  })}
                >
                  前へ
                </a>
              )}
              <span>
                {videoListRangeLabel(activeCodeFilters.offset, codes.length)}
              </span>
              {hasMore ? (
                <a
                  href={adminVideoCodesUrl(video.id, videoFilters, {
                    ...activeCodeFilters,
                    offset: activeCodeFilters.offset + 100,
                  })}
                >
                  次へ
                </a>
              ) : (
                <span className="pager-disabled" aria-disabled="true">
                  次へ
                </span>
              )}
            </nav>
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
      'filma',
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
    return <VideosPage {...common} filters={route.filters} />
  }
  if (route.kind === 'new-video' || route.kind === 'edit-video') {
    return <VideoEditorPage {...common} route={route} />
  }
  if (route.kind === 'video-codes') {
    return <VideoCodesPage {...common} route={route} />
  }
  return <FilmaSettingsPage {...common} />
}

const root = document.querySelector('#root')
if (!(root instanceof HTMLElement)) {
  throw new Error('Admin root element was not found')
}

const viewerEntry =
  ['/register', '/login', '/library'].includes(window.location.pathname) ||
  window.location.pathname.startsWith('/v/')

createRoot(root).render(
  <StrictMode>{viewerEntry ? <ViewerApp /> : <App />}</StrictMode>,
)
