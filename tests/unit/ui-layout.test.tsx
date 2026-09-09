import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Brand } from '../../src/ui/components/Brand'
import { AdminLayout } from '../../src/ui/layouts/AdminLayout'
import { AuthLayout } from '../../src/ui/layouts/AuthLayout'

describe('shared UI layouts', () => {
  it('renders only available admin navigation and the prototype boundary', () => {
    const html = renderToStaticMarkup(
      <AdminLayout
        siteName="Test CMS"
        logoPath={null}
        onVideos={() => {}}
        onLogout={() => {}}
      >
        <h1>動画</h1>
      </AdminLayout>,
    )

    for (const text of [
      'Test CMS',
      '管理画面',
      '動画',
      'メニュー',
      'ログアウト',
      '一般公開は無効',
    ]) {
      expect(html).toContain(text)
    }
    expect(html).toContain('data-surface="admin"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('href="/admin/videos"')
    expect(html).toContain('href="#admin-main"')
    expect(html).toContain('Filma連携')
    expect(html).toContain('href="/admin/filma"')
    expect(html).toContain('href="/admin/videos" aria-current="page"')
    expect(html).not.toContain('アップロード')
  })

  it('renders authentication content in the shared one-column frame', () => {
    const html = renderToStaticMarkup(
      <AuthLayout siteName="Test CMS" logoPath={null}>
        <form aria-label="ログイン" />
      </AuthLayout>,
    )

    expect(html).toContain('data-surface="auth"')
    expect(html).toContain('Test CMS')
    expect(html).toContain('ローカル試作')
    expect(html).toContain('aria-label="ログイン"')
    expect(html).not.toContain('ログアウト')
  })

  it('uses only an approved logo path and otherwise shows text', () => {
    const valid = renderToStaticMarkup(
      <Brand siteName="Test CMS" logoPath="/brand/logo.png" />,
    )
    const invalid = renderToStaticMarkup(
      <Brand siteName="Test CMS" logoPath="https://example.invalid/x.png" />,
    )
    const missing = renderToStaticMarkup(
      <Brand siteName="Test CMS" logoPath={null} />,
    )

    expect(valid).toContain('<img')
    expect(valid).toContain('src="/brand/logo.png"')
    expect(invalid).not.toContain('<img')
    expect(invalid).toContain('Test CMS')
    expect(missing).not.toContain('<img')
    expect(missing).toContain('Test CMS')
  })
})
