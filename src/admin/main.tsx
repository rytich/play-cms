import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'

import {
  AdminRequestError,
  acceptIssuedCodeForSelection,
  adminRequest,
  loginPasswordValidationError,
  localDateTime,
  newPasswordValidationError,
  toIsoDateTime,
} from './client'
import './styles.css'

type Video = {
  id: string
  publicId: string
  filmaFileId: string
  title: string
  description: string
  status: 'draft'
  startsAt: string
  endsAt: string
}

type CodeMetadata = {
  id: string
  createdAt: string
  revokedAt: string | null
  status: 'unused' | 'revoked'
}

type VideoForm = {
  filmaFileId: string
  title: string
  description: string
  startsAt: string
  endsAt: string
}

const emptyVideoForm: VideoForm = {
  filmaFileId: '',
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
}

function LoginForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
      onAuthenticated()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '現在処理できません。',
      )
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <section className="card narrow" aria-labelledby="login-heading">
      <h2 id="login-heading">管理者ログイン</h2>
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
      <p className="subtle">
        <a href="/admin/setup">初回設定を開く</a>
      </p>
    </section>
  )
}

function SetupForm({ onComplete }: { onComplete: () => void }) {
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
      onComplete()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '現在処理できません。',
      )
    } finally {
      setBootstrapToken('')
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <section className="card narrow" aria-labelledby="setup-heading">
      <h2 id="setup-heading">初回管理者設定</h2>
      <p className="subtle">
        管理者は一人だけ登録できます。設定後は改めてログインしてください。
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Bootstrap token
          <input
            type="password"
            autoComplete="off"
            required
            minLength={64}
            value={bootstrapToken}
            onChange={(event) => setBootstrapToken(event.target.value)}
          />
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
      <p className="subtle">
        <a href="/admin/login">ログインへ戻る</a>
      </p>
    </section>
  )
}

function AdminVideos({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [videos, setVideos] = useState<Video[]>([])
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Video | null>(null)
  const [form, setForm] = useState<VideoForm>(emptyVideoForm)
  const [codes, setCodes] = useState<CodeMetadata[]>([])
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const selectedVideoId = useRef<string | null>(null)

  const clearProtectedState = useCallback(() => {
    setVideos([])
    setSelected(null)
    setCodes([])
    setIssuedCode(null)
    setForm(emptyVideoForm)
    selectedVideoId.current = null
  }, [])

  const handleError = useCallback(
    (caught: unknown) => {
      if (caught instanceof AdminRequestError && caught.status === 401) {
        clearProtectedState()
        onUnauthorized()
        return
      }
      setError(
        caught instanceof Error ? caught.message : '現在処理できません。',
      )
    },
    [clearProtectedState, onUnauthorized],
  )

  const loadVideos = useCallback(
    async (nextOffset: number) => {
      setIssuedCode(null)
      setError('')
      try {
        const result = await adminRequest<{ videos: Video[] }>(
          `/api/admin/videos?offset=${nextOffset}`,
        )
        setVideos(result.videos)
        setOffset(nextOffset)
      } catch (caught) {
        handleError(caught)
      }
    },
    [handleError],
  )

  useEffect(() => {
    void loadVideos(0)
  }, [loadVideos])

  async function selectVideo(video: Video) {
    selectedVideoId.current = video.id
    setIssuedCode(null)
    setSelected(video)
    setForm({
      filmaFileId: video.filmaFileId,
      title: video.title,
      description: video.description,
      startsAt: localDateTime(video.startsAt),
      endsAt: localDateTime(video.endsAt),
    })
    setCodes([])
    setError('')
    try {
      const result = await adminRequest<{ codes: CodeMetadata[] }>(
        `/api/admin/videos/${video.id}/codes`,
      )
      if (selectedVideoId.current === video.id) setCodes(result.codes)
    } catch (caught) {
      handleError(caught)
    }
  }

  function newVideo() {
    selectedVideoId.current = null
    setIssuedCode(null)
    setSelected(null)
    setCodes([])
    setForm(emptyVideoForm)
    setError('')
  }

  async function saveVideo(event: FormEvent) {
    event.preventDefault()
    setIssuedCode(null)
    setBusy(true)
    setError('')
    try {
      const payload = {
        ...form,
        startsAt: toIsoDateTime(form.startsAt),
        endsAt: toIsoDateTime(form.endsAt),
      }
      const result = await adminRequest<{ video: Video }>(
        selected ? `/api/admin/videos/${selected.id}` : '/api/admin/videos',
        selected ? 'PUT' : 'POST',
        payload,
      )
      selectedVideoId.current = result.video.id
      setSelected(result.video)
      setForm({
        filmaFileId: result.video.filmaFileId,
        title: result.video.title,
        description: result.video.description,
        startsAt: localDateTime(result.video.startsAt),
        endsAt: localDateTime(result.video.endsAt),
      })
      await loadVideos(offset)
    } catch (caught) {
      handleError(caught)
    } finally {
      setBusy(false)
    }
  }

  async function issueCode() {
    if (!selected) return
    const requestedVideoId = selected.id
    setIssuedCode(null)
    setBusy(true)
    setError('')
    try {
      const result = await adminRequest<{
        id: string
        code: string
        createdAt: string
      }>(`/api/admin/videos/${requestedVideoId}/codes`, 'POST', {})
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

  async function revokeCode(codeId: string) {
    if (!selected) return
    const requestedVideoId = selected.id
    setIssuedCode(null)
    setBusy(true)
    setError('')
    try {
      await adminRequest(
        `/api/admin/videos/${requestedVideoId}/codes/${codeId}/revoke`,
        'POST',
        {},
      )
      const result = await adminRequest<{ codes: CodeMetadata[] }>(
        `/api/admin/videos/${requestedVideoId}/codes`,
      )
      if (selectedVideoId.current === requestedVideoId) setCodes(result.codes)
    } catch (caught) {
      handleError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-grid">
      <section className="card" aria-labelledby="videos-heading">
        <div className="section-heading">
          <div>
            <h2 id="videos-heading">動画</h2>
            <p className="subtle">最新100件。すべて下書き・Filma未確認です。</p>
          </div>
          <button type="button" className="secondary" onClick={newVideo}>
            新規登録
          </button>
        </div>
        {videos.length === 0 ? (
          <p className="empty">登録済みの動画はありません。</p>
        ) : (
          <ul className="video-list">
            {videos.map((video) => (
              <li key={video.id}>
                <button
                  type="button"
                  className={
                    selected?.id === video.id ? 'selected-row' : 'row-button'
                  }
                  onClick={() => void selectVideo(video)}
                >
                  <strong>{video.title}</strong>
                  <span>
                    下書き · {new Date(video.startsAt).toLocaleString('ja-JP')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pager">
          <button
            type="button"
            className="secondary"
            disabled={offset === 0}
            onClick={() => void loadVideos(Math.max(0, offset - 100))}
          >
            前へ
          </button>
          <span>{offset + 1}件目から</span>
          <button
            type="button"
            className="secondary"
            disabled={videos.length < 100}
            onClick={() => void loadVideos(offset + 100)}
          >
            次へ
          </button>
        </div>
      </section>

      <div className="stack">
        <section className="card" aria-labelledby="editor-heading">
          <h2 id="editor-heading">
            {selected ? '下書きを編集' : '動画を登録'}
          </h2>
          <p className="draft-note">
            公開機能はありません。Filma上の存在確認も行いません。
          </p>
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
                rows={4}
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
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy}>
              {busy ? '保存中…' : selected ? '変更を保存' : '下書きを登録'}
            </button>
          </form>
        </section>

        {selected && (
          <section className="card" aria-labelledby="codes-heading">
            <div className="section-heading">
              <div>
                <h2 id="codes-heading">閲覧用キー</h2>
                <p className="subtle">{selected.title}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void issueCode()}
              >
                {busy ? '処理中…' : '新しい閲覧用キーを発行'}
              </button>
            </div>
            {issuedCode && (
              <div className="issued-key" role="status">
                <p className="key-value">{issuedCode}</p>
                <p>
                  再表示できません。この試作では視聴に使えません。次の操作や再読み込みで消えます。
                </p>
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
          </section>
        )}
      </div>
    </div>
  )
}

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [setupPage, setSetupPage] = useState(
    window.location.pathname === '/admin/setup',
  )

  const logout = useCallback(async () => {
    setAuthenticated(false)
    try {
      await adminRequest('/api/auth/logout', 'POST', {})
    } catch {
      // Protected state is already removed. Do not retry an uncertain mutation.
    }
  }, [])

  useEffect(() => {
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

  function showLogin() {
    window.history.replaceState(null, '', '/admin/login')
    setSetupPage(false)
    setAuthenticated(false)
  }

  return (
    <>
      <header className="site-header">
        <div>
          <h1>play-cms</h1>
          <span className="badge">ローカル試作</span>
        </div>
        {authenticated && (
          <button
            type="button"
            className="secondary"
            onClick={() => void logout()}
          >
            ログアウト
          </button>
        )}
      </header>
      <main>
        <aside className="notice" role="note">
          <strong>実動画の公開・再生は停止中</strong>
          <span>この画面では下書き登録と閲覧用キーの管理だけを試せます。</span>
        </aside>
        {authenticated === null ? (
          <p className="loading">セッションを確認しています…</p>
        ) : setupPage && !authenticated ? (
          <SetupForm onComplete={showLogin} />
        ) : authenticated ? (
          <AdminVideos onUnauthorized={() => setAuthenticated(false)} />
        ) : (
          <LoginForm onAuthenticated={() => setAuthenticated(true)} />
        )}
      </main>
    </>
  )
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
