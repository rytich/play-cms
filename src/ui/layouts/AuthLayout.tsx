import type { ReactNode } from 'react'

import { Brand } from '../components/Brand'

type AuthLayoutProps = {
  siteName: string
  logoPath: string | null
  children: ReactNode
}

export function AuthLayout({ siteName, logoPath, children }: AuthLayoutProps) {
  return (
    <div className="auth-shell" data-surface="auth">
      <header className="auth-header">
        <Brand siteName={siteName} logoPath={logoPath} />
        <span className="prototype-badge">ローカル試作</span>
      </header>
      <main className="auth-main">
        <aside className="notice" role="note">
          <strong>公開と再生は無効</strong>
          <span>管理機能だけを安全に確認する画面です。</span>
        </aside>
        {children}
      </main>
    </div>
  )
}
