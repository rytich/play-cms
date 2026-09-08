import { useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { Brand } from '../components/Brand'
import { shouldHandleSameDocumentLink } from '../navigation'

type AdminLayoutProps = {
  siteName: string
  logoPath: string | null
  videosHref?: string
  onVideos: () => boolean | void
  onLogout: () => void
  children: ReactNode
}

export function AdminLayout({
  siteName,
  logoPath,
  videosHref = '/admin/videos',
  onVideos,
  onLogout,
  children,
}: AdminLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  function followVideos(event: MouseEvent<HTMLAnchorElement>) {
    if (!shouldHandleSameDocumentLink(event)) return
    if (onVideos() === false) event.preventDefault()
    setMenuOpen(false)
  }

  function toggleMenu() {
    setMenuOpen((open) => !open)
    menuButton.current?.focus()
  }

  return (
    <div className="admin-shell" data-surface="admin">
      <a className="skip-link" href="#admin-main">
        本文へ移動
      </a>
      <header className="admin-mobile-header">
        <div className="admin-mobile-brand">
          <Brand siteName={siteName} logoPath={logoPath} />
          <span>管理画面</span>
        </div>
        <button
          ref={menuButton}
          type="button"
          className="secondary menu-button"
          aria-expanded={menuOpen}
          aria-controls="admin-navigation"
          onClick={toggleMenu}
        >
          メニュー
        </button>
      </header>
      <aside
        id="admin-navigation"
        className="admin-sidebar"
        data-open={menuOpen}
      >
        <div className="admin-brand">
          <Brand siteName={siteName} logoPath={logoPath} />
          <span>管理画面</span>
        </div>
        <nav aria-label="管理画面">
          <a href={videosHref} aria-current="page" onClick={followVideos}>
            動画
          </a>
        </nav>
        <button
          type="button"
          className="secondary logout-button"
          onClick={onLogout}
        >
          ログアウト
        </button>
      </aside>
      <main id="admin-main" className="admin-main" tabIndex={-1}>
        <aside className="notice prototype-notice" role="note">
          <strong>公開と再生は無効</strong>
          <span>下書き登録と閲覧用キー管理だけのローカル試作です。</span>
        </aside>
        {children}
      </main>
    </div>
  )
}
