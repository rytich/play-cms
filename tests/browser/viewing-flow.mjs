import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'
import { cwd, env, stdout } from 'node:process'
import { URL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(env.PLAYWRIGHT_MODULE_PATH ?? 'playwright')
const staticRoot = join(cwd(), 'dist/admin/client')
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  const relativePath = pathname.startsWith('/assets/')
    ? normalize(pathname.slice(1))
    : 'index.html'
  try {
    const body = await readFile(join(staticRoot, relativePath))
    response.writeHead(200, {
      'Content-Type':
        contentTypes[extname(relativePath)] ?? 'application/octet-stream',
      'Content-Security-Policy':
        "frame-src https://filma.biz; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
    })
    response.end(body)
  } catch {
    response.writeHead(404).end()
  }
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
if (!address || typeof address === 'string') throw new Error('missing address')
const base = `http://127.0.0.1:${address.port}`

const playback = {
  video: {
    publicId: 'public-a',
    title: 'Synthetic viewing title',
    description: 'Synthetic viewing description',
    endsAt: '2100-01-01T00:00:00.000Z',
  },
  playback: {
    url: 'https://filma.biz/player/synthetic',
    expiresAt: '2100-01-01T00:00:00.000Z',
  },
}
let codeUsed = false
let filmaConfigured = false
let adminCodeId = '00000000-0000-4000-8000-000000000009'

function json(route, status, body, headers = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  })
}

async function installSyntheticApi(context, state) {
  await context.route('https://filma.biz/**', (route) => route.abort())
  await context.route(`${base}/api/**`, async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname === '/api/viewer/session') {
      return json(
        route,
        state.viewer ? 200 : 401,
        state.viewer ? { authenticated: true } : { error: 'unauthorized' },
      )
    }
    if (pathname === '/api/viewer/register') {
      state.viewer = true
      state.anonymous = false
      return json(route, 201, { authenticated: true })
    }
    if (pathname === '/api/viewer/login') {
      state.viewer = true
      return json(route, 200, { authenticated: true })
    }
    if (pathname === '/api/auth/logout') {
      state.viewer = false
      return json(route, 200, { authenticated: false })
    }
    if (pathname === '/api/viewer/library') {
      return state.viewer
        ? json(route, 200, { videos: [playback.video] })
        : json(route, 401, { error: 'unauthorized' })
    }
    if (pathname === '/api/viewer/videos/public-a/playback') {
      return state.viewer
        ? json(route, 200, playback)
        : json(route, 401, { error: 'unauthorized' })
    }
    if (pathname === '/api/public/videos/public-a/playback') {
      return state.anonymous
        ? json(route, 200, { ...playback, anonymous: true })
        : json(route, 401, { error: 'unauthorized' })
    }
    if (pathname === '/api/public/videos/public-a/redeem') {
      if (codeUsed) return json(route, 404, { error: 'not_found' })
      codeUsed = true
      state.anonymous = true
      return json(route, 200, { ...playback, anonymous: true })
    }
    if (pathname === '/api/admin/session') {
      return json(route, 200, { authenticated: true })
    }
    if (pathname === '/api/admin/filma' && request.method() === 'GET') {
      return json(route, 200, {
        configured: filmaConfigured,
        verifiedAt: filmaConfigured ? '2026-09-09T00:00:00.000Z' : null,
      })
    }
    if (pathname === '/api/admin/filma' && request.method() === 'PUT') {
      filmaConfigured = true
      return json(route, 200, {
        configured: true,
        verifiedAt: '2026-09-09T00:00:00.000Z',
      })
    }
    if (pathname === '/api/admin/videos/video-a') {
      return json(route, 200, {
        video: {
          id: 'video-a',
          publicId: 'public-a',
          filmaFileId: '123',
          title: 'Synthetic viewing title',
          description: '',
          status: 'published',
          startsAt: null,
          endsAt: null,
          createdAt: '2026-09-09T00:00:00.000Z',
          updatedAt: '2026-09-09T00:00:00.000Z',
        },
      })
    }
    if (
      pathname === `/api/admin/videos/video-a/codes/${adminCodeId}/reveal` &&
      request.method() === 'POST'
    ) {
      return json(route, 200, { code: 'ABCD-EFGH-JKLM-NPQR' })
    }
    if (
      pathname === `/api/admin/videos/video-a/codes/${adminCodeId}/reissue` &&
      request.method() === 'POST'
    ) {
      adminCodeId = '00000000-0000-4000-8000-000000000010'
      return json(route, 201, {
        id: adminCodeId,
        code: 'QRST-VWXY-2345-6789',
        createdAt: '2026-09-10T00:00:00.000Z',
      })
    }
    if (
      pathname === '/api/admin/videos/video-a/codes' &&
      request.method() === 'GET'
    ) {
      return json(route, 200, {
        codes: [
          {
            id: adminCodeId,
            createdAt: '2026-09-09T00:00:00.000Z',
            revokedAt: null,
            status: 'used',
            enabled: adminCodeId.endsWith('10'),
            revealable: true,
            reissued: false,
          },
        ],
        hasMore: false,
      })
    }
    return json(route, 404, { error: 'not_found' })
  })
}

const browser = await chromium.launch({
  headless: true,
  ...(env.PLAYWRIGHT_CHROME_PATH
    ? { executablePath: env.PLAYWRIGHT_CHROME_PATH }
    : {}),
})

try {
  const firstContext = await browser.newContext()
  const firstState = { viewer: false, anonymous: false }
  await installSyntheticApi(firstContext, firstState)
  const page = await firstContext.newPage()
  page.setDefaultTimeout(5_000)
  page.setDefaultNavigationTimeout(5_000)

  await page.goto(`${base}/v/public-a`)
  await page.getByRole('heading', { name: '視聴コードを入力' }).waitFor()
  if ((await page.locator('body').innerText()).includes(playback.video.title)) {
    throw new Error('metadata appeared before redemption')
  }
  await page
    .getByRole('textbox', { name: '視聴コード' })
    .fill('0123-4567-89AB-CDEF')
  await page.getByRole('button', { name: '視聴を開始' }).click()
  await page.getByRole('heading', { name: playback.video.title }).waitFor()
  await page.getByText('この視聴は30分間だけ有効です。').waitFor()
  const player = page.getByTitle(`Filmaプレーヤー: ${playback.video.title}`)
  await player.waitFor()
  if ((await player.getAttribute('src')) !== playback.playback.url) {
    throw new Error('Filma player URL did not match the playback grant')
  }
  if ((await player.getAttribute('allow')) !== 'fullscreen') {
    throw new Error('Filma player did not allow fullscreen')
  }
  if ((await player.getAttribute('allowfullscreen')) === null) {
    throw new Error('Filma player omitted the fullscreen attribute')
  }
  if (await page.locator('video').count()) {
    throw new Error('native video element was rendered')
  }
  if (page.url().includes('0123') || page.url().includes('CDEF')) {
    throw new Error('viewing code leaked into the URL')
  }
  const storage = await page.evaluate(() => ({
    local: Object.keys(globalThis.localStorage),
    session: Object.keys(globalThis.sessionStorage),
  }))
  if (storage.local.length || storage.session.length) {
    throw new Error('viewing state was persisted in browser storage')
  }

  await page.reload()
  await page.getByRole('heading', { name: playback.video.title }).waitFor()
  await page.getByRole('link', { name: '視聴者登録' }).click()
  await page.waitForURL(`${base}/register?returnTo=%2Fv%2Fpublic-a`)
  await page.getByLabel('メールアドレス').fill('viewer@example.test')
  await page.getByLabel('パスワード').fill('synthetic viewer password')
  await page.getByRole('button', { name: '登録してライブラリへ' }).click()
  await page.waitForURL(`${base}/v/public-a`)
  await page.getByRole('heading', { name: playback.video.title }).waitFor()
  if (await page.getByText('この視聴は30分間だけ有効です。').isVisible()) {
    throw new Error('anonymous warning remained after registration transfer')
  }

  await page.goto(`${base}/library`)
  await page.getByRole('link', { name: playback.video.title }).click()
  await page.waitForURL(`${base}/v/public-a`)
  await page.goBack()
  await page.waitForURL(`${base}/library`)
  await page.getByText(playback.video.title).waitFor()
  await page.goForward()
  await page.waitForURL(`${base}/v/public-a`)
  await page.getByRole('heading', { name: playback.video.title }).waitFor()

  await page.goto(`${base}/library`)
  await page.getByRole('button', { name: 'ログアウト' }).click()
  await page.waitForURL(`${base}/login`)
  await page.getByLabel('メールアドレス').fill('viewer@example.test')
  await page.getByLabel('パスワード').fill('synthetic viewer password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(`${base}/library`)
  await page.getByRole('link', { name: playback.video.title }).waitFor()

  await page.goto(`${base}/admin/filma`)
  await page.getByRole('heading', { name: 'Filma連携' }).waitFor()
  await page.getByText('接続状態:').waitFor()
  await page.getByLabel('Filma APIキー').fill('synthetic-api-key')
  await page.getByRole('button', { name: '接続を確認して保存' }).click()
  await page.getByText('接続済み', { exact: true }).waitFor()
  if ((await page.getByLabel('Filma APIキー').inputValue()) !== '') {
    throw new Error('Filma API key remained in the form')
  }

  await page.reload()
  await page.getByText('接続済み', { exact: true }).waitFor()
  await page.goto(`${base}/admin/videos/video-a/codes`)
  await page.getByText('使用済み', { exact: true }).waitFor()
  await page.goBack()
  await page.waitForURL(`${base}/admin/filma`)
  await page.getByText('接続済み', { exact: true }).waitFor()
  await page.goForward()
  await page.waitForURL(`${base}/admin/videos/video-a/codes`)
  await page.getByText('使用済み', { exact: true }).waitFor()

  await page.goto(`${base}/admin/videos/video-a/edit`)
  await page.getByRole('heading', { name: '動画を編集' }).waitFor()
  const publicLink = page.getByRole('link', { name: '公開ページ' })
  if ((await publicLink.getAttribute('href')) !== '/v/public-a') {
    throw new Error('same-origin public video link was not rendered')
  }
  if ((await page.getByLabel('公開状態').inputValue()) !== 'published') {
    throw new Error('saved publication status was not loaded')
  }
  if ((await page.getByLabel('開始日時').inputValue()) !== '') {
    throw new Error('unbounded start was not rendered empty')
  }
  if ((await page.getByLabel('終了日時').inputValue()) !== '') {
    throw new Error('unbounded end was not rendered empty')
  }

  await page.goto(`${base}/admin/videos/video-a/codes`)
  await page.getByRole('button', { name: 'キーを表示' }).click()
  await page.getByText('ABCD-EFGH-JKLM-NPQR', { exact: true }).waitFor()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '再発行' }).click()
  await page.getByText('QRST-VWXY-2345-6789', { exact: true }).waitFor()

  await page.getByText('使用済み', { exact: true }).waitFor()
  const usedCheckbox = page.getByLabel(`閲覧用キーID ${adminCodeId} を選択`)
  if (!(await usedCheckbox.isDisabled()))
    throw new Error('used code was selectable')
  if (await page.getByRole('button', { name: '取り消す' }).count()) {
    throw new Error('used code offered revoke')
  }

  const secondContext = await browser.newContext()
  const secondState = { viewer: false, anonymous: false }
  await installSyntheticApi(secondContext, secondState)
  const secondPage = await secondContext.newPage()
  secondPage.setDefaultTimeout(5_000)
  secondPage.setDefaultNavigationTimeout(5_000)
  await secondPage.goto(`${base}/v/public-a`)
  await secondPage.getByRole('heading', { name: '視聴コードを入力' }).waitFor()
  await secondPage
    .getByRole('textbox', { name: '視聴コード' })
    .fill('0123-4567-89AB-CDEF')
  await secondPage.getByRole('button', { name: '視聴を開始' }).click()
  await secondPage.getByRole('alert').waitFor()
  if (
    (await secondPage.locator('body').innerText()).includes(
      playback.video.title,
    )
  ) {
    throw new Error('used code exposed video to another browser')
  }
  await secondContext.close()
  await firstContext.close()
  stdout.write('viewing flow browser acceptance: pass\n')
} finally {
  await browser.close()
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
