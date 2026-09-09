import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'
import { env, cwd } from 'node:process'
import { URL } from 'node:url'
import { log } from 'node:console'

const require = createRequire(import.meta.url)
const playwrightPath = env.PLAYWRIGHT_MODULE_PATH
const chromePath = env.PLAYWRIGHT_CHROME_PATH

if (!playwrightPath || !chromePath) {
  throw new Error(
    'PLAYWRIGHT_MODULE_PATH and PLAYWRIGHT_CHROME_PATH are required',
  )
}

const { chromium } = require(playwrightPath)
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

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
})
const context = await browser.newContext()
const page = await context.newPage()
let viewer = null
let logoutAttempts = 0
let viewerBLibraryLoads = 0
let markPostFailureSessionStarted
let releasePostFailureSession
const postFailureSessionStarted = new Promise((resolve) => {
  markPostFailureSessionStarted = resolve
})
const postFailureSessionHold = new Promise((resolve) => {
  releasePostFailureSession = resolve
})

function json(route, status, body) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

await context.route(`${base}/api/**`, async (route) => {
  const request = route.request()
  const pathname = new URL(request.url()).pathname
  if (pathname === '/api/viewer/session') {
    if (logoutAttempts === 1 && viewer === 'A') {
      markPostFailureSessionStarted()
      await postFailureSessionHold
    }
    await json(
      route,
      viewer ? 200 : 401,
      viewer ? { authenticated: true } : { error: 'unauthorized' },
    )
    return
  }
  if (pathname === '/api/viewer/login') {
    const input = request.postDataJSON()
    viewer = input.email === 'viewer-b@example.test' ? 'B' : 'A'
    await json(route, 200, { authenticated: true })
    return
  }
  if (pathname === '/api/viewer/library') {
    if (viewer === 'B') viewerBLibraryLoads += 1
    await json(route, 200, {
      videos: [
        {
          publicId: `viewer-${viewer?.toLowerCase()}`,
          title: `Viewer ${viewer} library title`,
          description: `Viewer ${viewer} description`,
          endsAt: '2100-01-01T00:00:00.000Z',
        },
      ],
    })
    return
  }
  if (pathname === '/api/auth/logout') {
    logoutAttempts += 1
    await json(route, 503, { error: 'unavailable' })
    return
  }
  await json(route, 404, { error: 'not_found' })
})

try {
  await page.goto(`${base}/login`)
  await page.getByRole('heading', { name: '視聴者ログイン' }).waitFor()
  await page.getByLabel('メールアドレス').fill('viewer-a@example.test')
  await page.getByLabel('パスワード').fill('synthetic viewer password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(`${base}/library`)
  await page.getByText('Viewer A library title').waitFor()

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await postFailureSessionStarted
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.requestAnimationFrame(() =>
          globalThis.requestAnimationFrame(resolve),
        ),
      ),
  )
  if (
    !(await page
      .getByText('ログアウトできませんでした。もう一度お試しください。')
      .isVisible())
  ) {
    throw new Error('logout failure disappeared during session revalidation')
  }
  releasePostFailureSession()
  await page
    .getByText('ログアウトできませんでした。もう一度お試しください。')
    .waitFor()
  await page.getByRole('button', { name: 'ログアウトを再試行' }).waitFor()

  await page.goBack()
  await page.waitForURL(`${base}/login`)
  await page.getByRole('heading', { name: '視聴者ログイン' }).waitFor()
  await page.getByLabel('メールアドレス').fill('viewer-b@example.test')
  await page.getByLabel('パスワード').fill('synthetic viewer password')
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(`${base}/library`)
  await page.getByText('Viewer B library title').waitFor({ timeout: 2_000 })

  const pageText = await page.locator('body').innerText()
  if (pageText.includes('Viewer A library title')) {
    throw new Error('viewer A cached library remained after viewer B login')
  }
  if (viewerBLibraryLoads < 1) {
    throw new Error(`viewer B library loads: ${viewerBLibraryLoads}`)
  }
  if (logoutAttempts !== 1) {
    throw new Error(`logout attempts: ${logoutAttempts}`)
  }
  log('viewer logout account switch: pass')
} finally {
  await context.close()
  await browser.close()
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
