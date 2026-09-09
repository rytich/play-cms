import { Hono } from 'hono'
import type { Context } from 'hono'

import {
  bootstrapConsumed,
  bulkUpdateAccessCodes,
  bulkUpdateVideos,
  createOnlyAdmin,
  createSession,
  deleteSession,
  findAdminByEmail,
  findVideo,
  insertAccessCode,
  insertVideo,
  listAccessCodes,
  listVideos,
  revokeAccessCode,
  updateVideo,
} from '../adapters/database/admin-repository'
import {
  createViewerWithSession,
  createViewerSessionWithTransfer,
  findSessionAccount,
  findViewerByEmail,
  listViewerLibraryRows,
} from '../adapters/database/viewer-repository'
import {
  anonymousSessionActive,
  findAnonymousPlayback,
  findFilmaSetting,
  findRedeemCandidate,
  findViewerPlayback,
  redeemForAnonymous,
  redeemForViewer,
  saveFilmaSetting,
  type ViewingVideo,
} from '../adapters/database/viewing-repository'
import { issuePlaybackGrant } from '../adapters/filma/playback-client'
import { verifyFilmaTokenContract } from '../adapters/filma/live-contract'
import {
  constantTimeSecretEqual,
  decryptSecret,
  encryptSecret,
  generateAccessCode,
  hashPassword,
  isStrongHexSecret,
  randomHex,
  sha256Hex,
  verifyPassword,
} from '../adapters/secrets/web-crypto'
import {
  hasOnlyFields,
  isPlainRecord,
  normalizeEmail,
  parseVideoInput,
  validLoginPassword,
  validNewPassword,
} from '../core/admin'
import {
  availableLibraryItems,
  parseViewerLogin,
  parseViewerRegistration,
} from '../core/viewer'
import {
  parseBulkCodeInput,
  parseBulkVideoInput,
  parseCodeFilters,
  parseVideoFilters,
} from '../core/admin-management'
import {
  isViewerAvailable,
  parseViewingCode,
  playbackNotAfter,
} from '../core/viewing'
import {
  anonymousHash,
  applyRateLimit,
  applySecurityHeaders,
  errorBody,
  readBoundedJson,
  sessionHash,
} from './security'

type AppContext = Context<{ Bindings: Env }>

export const app = new Hono<{ Bindings: Env }>()

async function secureResponse(c: AppContext, next: () => Promise<void>) {
  await next()
  c.res = applySecurityHeaders(c.res)
}

app.use('/api/*', secureResponse)
app.use('/v/*', secureResponse)

async function serveAdmin(c: AppContext) {
  return applySecurityHeaders(await c.env.ASSETS.fetch(c.req.raw))
}

app.get('/', serveAdmin)
app.get('/admin', serveAdmin)
app.get('/admin/*', serveAdmin)
app.get('/v/*', serveAdmin)

app.use('/api/*', async (c, next) => {
  const hostname = new URL(c.req.url).hostname
  if (
    c.env.PLAY_LOCAL_ONLY !== 'true' ||
    (hostname !== 'localhost' && hostname !== '127.0.0.1')
  ) {
    return c.json(errorBody.unavailable, 503)
  }
  await next()
})

async function writeBody(c: AppContext) {
  const result = await readBoundedJson(c)
  if ('error' in result) {
    return {
      response: c.json(
        result.error === 'forbidden' ? errorBody.forbidden : errorBody.invalid,
        result.error === 'forbidden' ? 403 : 400,
      ),
    }
  }
  return { value: result.value }
}

async function rateLimited(
  c: AppContext,
  descriptors: readonly {
    endpoint: string
    rawBucket: string
    windowSeconds: number
    maximum: number
  }[],
) {
  const retryAfter = await applyRateLimit(c.env, descriptors)
  if (retryAfter === null) return null
  c.header('Retry-After', String(retryAfter))
  return c.json(errorBody.rateLimited, 429)
}

async function accountSession(c: AppContext) {
  const hash = await sessionHash(c.req.raw)
  if (!hash) return null
  return findSessionAccount(
    c.env.DATABASE,
    hash,
    Math.floor(Date.now() / 1_000),
  )
}

async function requireRole(c: AppContext, role: 'admin' | 'viewer') {
  const session = await accountSession(c)
  if (!session) return { response: c.json(errorBody.unauthorized, 401) }
  return session.role === role
    ? { accountId: session.account_id }
    : { response: c.json(errorBody.forbidden, 403) }
}

function requireAdmin(c: AppContext) {
  return requireRole(c, 'admin')
}

function requireViewer(c: AppContext) {
  return requireRole(c, 'viewer')
}

async function limitAdminWrite(c: AppContext, accountId: string) {
  return rateLimited(c, [
    {
      endpoint: 'admin-write',
      rawBucket: `admin:${accountId}`,
      windowSeconds: 60,
      maximum: 60,
    },
  ])
}

async function limitAdminBulk(c: AppContext, accountId: string) {
  return rateLimited(c, [
    {
      endpoint: 'admin-bulk',
      rawBucket: `admin:${accountId}`,
      windowSeconds: 60,
      maximum: 6,
    },
    {
      endpoint: 'admin-write',
      rawBucket: `admin:${accountId}`,
      windowSeconds: 60,
      maximum: 60,
    },
  ])
}

app.post('/api/admin/setup', async (c) => {
  const body = await writeBody(c)
  if ('response' in body) return body.response
  if (
    !isPlainRecord(body.value) ||
    !hasOnlyFields(body.value, ['email', 'password'])
  ) {
    return c.json(errorBody.invalid, 400)
  }
  const email = normalizeEmail(body.value.email)
  if (!email || !validNewPassword(body.value.password)) {
    return c.json(errorBody.invalid, 400)
  }

  const limited = await rateLimited(c, [
    {
      endpoint: 'setup',
      rawBucket: 'client:local',
      windowSeconds: 900,
      maximum: 5,
    },
  ])
  if (limited) return limited

  if (await bootstrapConsumed(c.env.DATABASE)) {
    return c.json(errorBody.notFound, 404)
  }
  const configuredToken = c.env.PLAY_BOOTSTRAP_TOKEN
  if (!isStrongHexSecret(configuredToken)) {
    return c.json(errorBody.unavailable, 503)
  }
  if (
    !constantTimeSecretEqual(
      configuredToken,
      c.req.header('X-Play-Bootstrap-Token') ?? null,
    )
  ) {
    return c.json(errorBody.notFound, 404)
  }

  const now = Math.floor(Date.now() / 1_000)
  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(body.value.password)
  try {
    const created = await createOnlyAdmin(c.env.DATABASE, {
      id,
      email,
      passwordHash,
      now,
    })
    return created
      ? c.json({ configured: true }, 201)
      : c.json(errorBody.notFound, 404)
  } catch {
    if (await bootstrapConsumed(c.env.DATABASE)) {
      return c.json(errorBody.notFound, 404)
    }
    throw new Error('admin setup unavailable')
  }
})

app.post('/api/viewer/register', async (c) => {
  const body = await writeBody(c)
  if ('response' in body) return body.response
  const input = parseViewerRegistration(body.value)
  if (!input) return c.json(errorBody.invalid, 400)

  const limited = await rateLimited(c, [
    {
      endpoint: 'viewer-register',
      rawBucket: 'client:local',
      windowSeconds: 3_600,
      maximum: 3,
    },
  ])
  if (limited) return limited

  const token = randomHex(32)
  const now = Math.floor(Date.now() / 1_000)
  const anonymousTokenHash = await anonymousHash(c.req.raw)
  const created = await createViewerWithSession(c.env.DATABASE, {
    accountId: crypto.randomUUID(),
    email: input.email,
    passwordHash: await hashPassword(input.password),
    sessionId: crypto.randomUUID(),
    tokenHash: await sha256Hex(token),
    expiresAt: now + 28_800,
    now,
    anonymousTokenHash,
  })
  if (!created) return c.json(errorBody.conflict, 409)
  c.header(
    'Set-Cookie',
    `play_session=${token}; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Lax`,
  )
  if (anonymousTokenHash) {
    c.header(
      'Set-Cookie',
      'play_anonymous=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
      { append: true },
    )
  }
  return c.json({ authenticated: true }, 201)
})

app.post('/api/viewer/login', async (c) => {
  const body = await writeBody(c)
  if ('response' in body) return body.response
  const input = parseViewerLogin(body.value)
  if (!input) return c.json(errorBody.invalid, 400)

  const limited = await rateLimited(c, [
    {
      endpoint: 'login-client',
      rawBucket: 'client:local',
      windowSeconds: 900,
      maximum: 10,
    },
    {
      endpoint: 'login-account',
      rawBucket: `account:${input.email}`,
      windowSeconds: 900,
      maximum: 5,
    },
  ])
  if (limited) return limited

  const account = await findViewerByEmail(c.env.DATABASE, input.email)
  const valid = await verifyPassword(input.password, account?.password_hash)
  if (!account || !valid) {
    return c.json({ error: 'invalid_credentials' } as const, 401)
  }

  const token = randomHex(32)
  const now = Math.floor(Date.now() / 1_000)
  const anonymousTokenHash = await anonymousHash(c.req.raw)
  await createViewerSessionWithTransfer(c.env.DATABASE, {
    id: crypto.randomUUID(),
    tokenHash: await sha256Hex(token),
    accountId: account.id,
    expiresAt: now + 28_800,
    now,
    anonymousTokenHash,
  })
  c.header(
    'Set-Cookie',
    `play_session=${token}; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Lax`,
  )
  if (anonymousTokenHash) {
    c.header(
      'Set-Cookie',
      'play_anonymous=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
      { append: true },
    )
  }
  return c.json({ authenticated: true })
})

app.post('/api/auth/login', async (c) => {
  const body = await writeBody(c)
  if ('response' in body) return body.response
  if (
    !isPlainRecord(body.value) ||
    !hasOnlyFields(body.value, ['email', 'password'])
  ) {
    return c.json(errorBody.invalid, 400)
  }
  const email = normalizeEmail(body.value.email)
  if (!email || !validLoginPassword(body.value.password)) {
    return c.json(errorBody.invalid, 400)
  }

  const limited = await rateLimited(c, [
    {
      endpoint: 'login-client',
      rawBucket: 'client:local',
      windowSeconds: 900,
      maximum: 10,
    },
    {
      endpoint: 'login-account',
      rawBucket: `account:${email}`,
      windowSeconds: 900,
      maximum: 5,
    },
  ])
  if (limited) return limited

  const account = await findAdminByEmail(c.env.DATABASE, email)
  const valid = await verifyPassword(
    body.value.password,
    account?.password_hash,
  )
  if (!account || !valid) {
    return c.json({ error: 'invalid_credentials' } as const, 401)
  }

  const token = randomHex(32)
  const now = Math.floor(Date.now() / 1_000)
  await createSession(c.env.DATABASE, {
    id: crypto.randomUUID(),
    tokenHash: await sha256Hex(token),
    accountId: account.id,
    expiresAt: now + 28_800,
    now,
  })
  c.header(
    'Set-Cookie',
    `play_session=${token}; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Lax`,
  )
  return c.json({ authenticated: true })
})

app.get('/api/admin/session', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  return c.json({ authenticated: true })
})

app.get('/api/viewer/session', async (c) => {
  const auth = await requireViewer(c)
  if ('response' in auth) return auth.response
  return c.json({ authenticated: true })
})

app.get('/api/viewer/library', async (c) => {
  const auth = await requireViewer(c)
  if ('response' in auth) return auth.response
  const now = Date.now()
  const rows = await listViewerLibraryRows(
    c.env.DATABASE,
    auth.accountId,
    new Date(now).toISOString(),
  )
  return c.json({ videos: availableLibraryItems(rows, now) })
})

function invitePlaybackEnabled(env: Env, video: ViewingVideo) {
  return (
    env.PLAY_CMS_P0_INVITE_PLAYBACK === 'true' &&
    typeof env.PLAY_CMS_P0_FILMA_FILE_ID === 'string' &&
    env.PLAY_CMS_P0_FILMA_FILE_ID === video.filmaFileId
  )
}

async function configuredFilmaApiKey(env: Env) {
  if (!env.PLAY_ENCRYPTION_KEY) return null
  const setting = await findFilmaSetting(env.DATABASE)
  if (
    !setting?.filma_api_key_ciphertext ||
    !setting.filma_api_key_nonce ||
    setting.filma_verified_at === null
  ) {
    return null
  }
  try {
    return await decryptSecret(env.PLAY_ENCRYPTION_KEY, {
      ciphertext: setting.filma_api_key_ciphertext,
      nonce: setting.filma_api_key_nonce,
    })
  } catch {
    return null
  }
}

async function playbackGrant(c: AppContext, video: ViewingVideo, now: number) {
  if (!invitePlaybackEnabled(c.env, video)) return null
  const apiKey = await configuredFilmaApiKey(c.env)
  const notAfter = playbackNotAfter(now * 1_000, video.endsAt)
  if (!apiKey || !notAfter || !isViewerAvailable(video, now * 1_000)) {
    return null
  }
  try {
    return await issuePlaybackGrant({
      apiKey,
      filmaFileId: video.filmaFileId,
      notAfter,
      allowedOrigin: new URL(c.req.url).origin,
    })
  } catch {
    return null
  }
}

function viewingResponse(
  video: ViewingVideo,
  grant: { url: string; expiresAt: string },
) {
  return {
    video: {
      publicId: video.publicId,
      title: video.title,
      description: video.description,
      endsAt: video.endsAt,
    },
    playback: grant,
  }
}

app.get('/api/admin/filma', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const setting = await findFilmaSetting(c.env.DATABASE)
  if (
    !setting?.filma_api_key_ciphertext ||
    !setting.filma_api_key_nonce ||
    setting.filma_verified_at === null ||
    !c.env.PLAY_ENCRYPTION_KEY
  ) {
    return c.json({ configured: false, verifiedAt: null })
  }
  try {
    await decryptSecret(c.env.PLAY_ENCRYPTION_KEY, {
      ciphertext: setting.filma_api_key_ciphertext,
      nonce: setting.filma_api_key_nonce,
    })
  } catch {
    return c.json({ configured: false, verifiedAt: null })
  }
  return c.json({
    configured: true,
    verifiedAt: new Date(setting.filma_verified_at * 1_000).toISOString(),
  })
})

app.put('/api/admin/filma', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const limited = await rateLimited(c, [
    {
      endpoint: 'filma-verify',
      rawBucket: `admin:${auth.accountId}`,
      windowSeconds: 600,
      maximum: 5,
    },
  ])
  if (limited) return limited
  const body = await writeBody(c)
  if (
    'response' in body ||
    !isPlainRecord(body.value) ||
    !hasOnlyFields(body.value, ['apiKey']) ||
    typeof body.value.apiKey !== 'string' ||
    body.value.apiKey.length < 1 ||
    new TextEncoder().encode(body.value.apiKey).byteLength > 4096 ||
    !c.env.PLAY_ENCRYPTION_KEY
  ) {
    return 'response' in body ? body.response : c.json(errorBody.invalid, 400)
  }
  try {
    await verifyFilmaTokenContract({ apiKey: body.value.apiKey })
    const encrypted = await encryptSecret(
      c.env.PLAY_ENCRYPTION_KEY,
      body.value.apiKey,
    )
    const now = Math.floor(Date.now() / 1_000)
    if (
      !(await saveFilmaSetting(c.env.DATABASE, {
        ...encrypted,
        verifiedAt: now,
      }))
    ) {
      throw new Error('setting unavailable')
    }
    return c.json({
      configured: true,
      verifiedAt: new Date(now * 1_000).toISOString(),
    })
  } catch {
    return c.json(errorBody.unavailable, 503)
  }
})

app.post('/api/public/videos/:publicId/redeem', async (c) => {
  const body = await writeBody(c)
  if ('response' in body) return body.response
  if (!isPlainRecord(body.value) || !hasOnlyFields(body.value, ['code'])) {
    return c.json(errorBody.invalid, 400)
  }
  const code = parseViewingCode(body.value.code)
  if (!code) return c.json(errorBody.invalid, 400)
  const publicId = c.req.param('publicId')
  const limited = await rateLimited(c, [
    {
      endpoint: 'redeem-client',
      rawBucket: 'client:local',
      windowSeconds: 600,
      maximum: 10,
    },
    {
      endpoint: 'redeem-video',
      rawBucket: `video:${publicId}`,
      windowSeconds: 600,
      maximum: 5,
    },
  ])
  if (limited) return limited
  const session = await accountSession(c)
  if (session?.role === 'admin') return c.json(errorBody.forbidden, 403)
  const now = Math.floor(Date.now() / 1_000)
  const codeHash = await sha256Hex(code)
  const video = await findRedeemCandidate(
    c.env.DATABASE,
    publicId,
    codeHash,
    new Date(now * 1_000).toISOString(),
  )
  if (!video) return c.json(errorBody.notFound, 404)
  if (!invitePlaybackEnabled(c.env, video)) {
    return c.json(errorBody.unavailable, 503)
  }
  const grant = await playbackGrant(c, video, now)
  if (!grant) return c.json(errorBody.unavailable, 503)

  if (session?.role === 'viewer') {
    const redeemed = await redeemForViewer(c.env.DATABASE, {
      publicId,
      codeHash,
      accountId: session.account_id,
      now,
      expectedFilmaFileId: video.filmaFileId,
    })
    if (redeemed) {
      return c.json({ ...viewingResponse(video, grant), anonymous: false })
    }
    const current = await findRedeemCandidate(
      c.env.DATABASE,
      publicId,
      codeHash,
      new Date(now * 1_000).toISOString(),
    )
    return current && current.filmaFileId !== video.filmaFileId
      ? c.json(errorBody.unavailable, 503)
      : c.json(errorBody.notFound, 404)
  }

  const token = randomHex(32)
  const redeemed = await redeemForAnonymous(c.env.DATABASE, {
    publicId,
    codeHash,
    sessionId: crypto.randomUUID(),
    tokenHash: await sha256Hex(token),
    now,
    expiresAt: now + 1_800,
    expectedFilmaFileId: video.filmaFileId,
  })
  if (!redeemed) {
    const current = await findRedeemCandidate(
      c.env.DATABASE,
      publicId,
      codeHash,
      new Date(now * 1_000).toISOString(),
    )
    return current && current.filmaFileId !== video.filmaFileId
      ? c.json(errorBody.unavailable, 503)
      : c.json(errorBody.notFound, 404)
  }
  c.header(
    'Set-Cookie',
    `play_anonymous=${token}; Max-Age=1800; Path=/; HttpOnly; Secure; SameSite=Lax`,
  )
  return c.json({ ...viewingResponse(video, grant), anonymous: true })
})

app.get('/api/public/videos/:publicId/playback', async (c) => {
  const tokenHash = await anonymousHash(c.req.raw)
  if (!tokenHash) return c.json(errorBody.unauthorized, 401)
  const publicId = c.req.param('publicId')
  const limited = await rateLimited(c, [
    {
      endpoint: 'anonymous-playback',
      rawBucket: `anonymous:${tokenHash}:video:${publicId}`,
      windowSeconds: 60,
      maximum: 60,
    },
  ])
  if (limited) return limited
  const now = Math.floor(Date.now() / 1_000)
  if (!(await anonymousSessionActive(c.env.DATABASE, tokenHash, now))) {
    return c.json(errorBody.unauthorized, 401)
  }
  const video = await findAnonymousPlayback(
    c.env.DATABASE,
    tokenHash,
    publicId,
    now,
  )
  if (!video) return c.json(errorBody.notFound, 404)
  const grant = await playbackGrant(c, video, now)
  return grant
    ? c.json({ ...viewingResponse(video, grant), anonymous: true })
    : c.json(errorBody.unavailable, 503)
})

app.get('/api/viewer/videos/:publicId/playback', async (c) => {
  const auth = await requireViewer(c)
  if ('response' in auth) return auth.response
  const publicId = c.req.param('publicId')
  const limited = await rateLimited(c, [
    {
      endpoint: 'viewer-playback',
      rawBucket: `viewer:${auth.accountId}:video:${publicId}`,
      windowSeconds: 60,
      maximum: 60,
    },
  ])
  if (limited) return limited
  const now = Math.floor(Date.now() / 1_000)
  const video = await findViewerPlayback(
    c.env.DATABASE,
    auth.accountId,
    publicId,
    now,
  )
  if (!video) return c.json(errorBody.notFound, 404)
  const grant = await playbackGrant(c, video, now)
  return grant
    ? c.json(viewingResponse(video, grant))
    : c.json(errorBody.unavailable, 503)
})

app.post('/api/auth/logout', async (c) => {
  const body = await writeBody(c)
  if ('response' in body) return body.response
  if (!isPlainRecord(body.value) || !hasOnlyFields(body.value, [])) {
    return c.json(errorBody.invalid, 400)
  }
  const hash = await sessionHash(c.req.raw)
  if (hash) await deleteSession(c.env.DATABASE, hash)
  c.header(
    'Set-Cookie',
    'play_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
  )
  return c.json({ authenticated: false })
})

app.get('/api/admin/videos', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const filters = parseVideoFilters(new URL(c.req.url).searchParams)
  if (!filters) return c.json(errorBody.invalid, 400)
  return c.json(await listVideos(c.env.DATABASE, filters))
})

app.post('/api/admin/videos/bulk-status', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const limited = await limitAdminBulk(c, auth.accountId)
  if (limited) return limited
  const body = await writeBody(c)
  if ('response' in body) return body.response
  const input = parseBulkVideoInput(body.value)
  if (!input) return c.json(errorBody.invalid, 400)
  const result = await bulkUpdateVideos(c.env.DATABASE, input.ids, input.status)
  return result.kind === 'not-found'
    ? c.json(errorBody.notFound, 404)
    : c.json({
        changedCount: result.changedCount,
        unchangedCount: result.unchangedCount,
      })
})

app.post('/api/admin/videos', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const limited = await limitAdminWrite(c, auth.accountId)
  if (limited) return limited
  const body = await writeBody(c)
  if ('response' in body) return body.response
  const input = parseVideoInput(body.value)
  if (!input) return c.json(errorBody.invalid, 400)
  const video = await insertVideo(
    c.env.DATABASE,
    { id: crypto.randomUUID(), publicId: crypto.randomUUID() },
    input,
    Math.floor(Date.now() / 1_000),
  )
  if (!video) throw new Error('video creation unavailable')
  return c.json({ video }, 201)
})

app.get('/api/admin/videos/:id', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const video = await findVideo(c.env.DATABASE, c.req.param('id'))
  return video ? c.json({ video }) : c.json(errorBody.notFound, 404)
})

app.put('/api/admin/videos/:id', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const limited = await limitAdminWrite(c, auth.accountId)
  if (limited) return limited
  const body = await writeBody(c)
  if ('response' in body) return body.response
  const input = parseVideoInput(body.value)
  if (!input) return c.json(errorBody.invalid, 400)
  const video = await updateVideo(
    c.env.DATABASE,
    c.req.param('id'),
    input,
    Math.floor(Date.now() / 1_000),
  )
  return video ? c.json({ video }) : c.json(errorBody.notFound, 404)
})

app.post('/api/admin/videos/:id/codes', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const limited = await limitAdminWrite(c, auth.accountId)
  if (limited) return limited
  const body = await writeBody(c)
  if (
    'response' in body ||
    !isPlainRecord(body.value) ||
    !hasOnlyFields(body.value, [])
  ) {
    return 'response' in body ? body.response : c.json(errorBody.invalid, 400)
  }
  const videoId = c.req.param('id')
  if (!(await findVideo(c.env.DATABASE, videoId))) {
    return c.json(errorBody.notFound, 404)
  }
  const code = generateAccessCode()
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1_000)
  if (
    await insertAccessCode(c.env.DATABASE, {
      id,
      videoId,
      codeHash: await sha256Hex(code.normalized),
      now,
    })
  ) {
    return c.json(
      {
        id,
        code: code.rendered,
        createdAt: new Date(now * 1_000).toISOString(),
      },
      201,
    )
  }
  return c.json(errorBody.notFound, 404)
})

app.get('/api/admin/videos/:id/codes', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const filters = parseCodeFilters(new URL(c.req.url).searchParams)
  if (!filters) return c.json(errorBody.invalid, 400)
  const result = await listAccessCodes(
    c.env.DATABASE,
    c.req.param('id'),
    filters,
  )
  if (!result) return c.json(errorBody.notFound, 404)
  return c.json({
    codes: result.codes.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at * 1_000).toISOString(),
      revokedAt:
        row.revoked_at === null
          ? null
          : new Date(row.revoked_at * 1_000).toISOString(),
      status:
        row.redeemed_at !== null
          ? ('used' as const)
          : row.revoked_at === null
            ? ('unused' as const)
            : ('revoked' as const),
      enabled: row.is_enabled === 1,
    })),
    hasMore: result.hasMore,
  })
})

app.post('/api/admin/videos/:id/codes/bulk-status', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const limited = await limitAdminBulk(c, auth.accountId)
  if (limited) return limited
  const body = await writeBody(c)
  if ('response' in body) return body.response
  const input = parseBulkCodeInput(body.value)
  if (!input) return c.json(errorBody.invalid, 400)
  const result = await bulkUpdateAccessCodes(
    c.env.DATABASE,
    c.req.param('id'),
    input.ids,
    input.enabled,
    Math.floor(Date.now() / 1_000),
  )
  if (result.kind === 'not-found') return c.json(errorBody.notFound, 404)
  if (result.kind === 'conflict') return c.json(errorBody.conflict, 409)
  return c.json({
    changedCount: result.changedCount,
    unchangedCount: result.unchangedCount,
  })
})

app.post('/api/admin/videos/:id/codes/:codeId/revoke', async (c) => {
  const auth = await requireAdmin(c)
  if ('response' in auth) return auth.response
  const limited = await limitAdminWrite(c, auth.accountId)
  if (limited) return limited
  const body = await writeBody(c)
  if (
    'response' in body ||
    !isPlainRecord(body.value) ||
    !hasOnlyFields(body.value, [])
  ) {
    return 'response' in body ? body.response : c.json(errorBody.invalid, 400)
  }
  const revoked = await revokeAccessCode(
    c.env.DATABASE,
    c.req.param('id'),
    c.req.param('codeId'),
    Math.floor(Date.now() / 1_000),
  )
  if (revoked.kind === 'conflict') return c.json(errorBody.conflict, 409)
  return revoked.kind === 'ok'
    ? c.json({ revoked: true })
    : c.json(errorBody.notFound, 404)
})

app.all('/v/*', (c) => c.json(errorBody.notFound, 404))

app.notFound((c) => {
  const pathname = new URL(c.req.url).pathname
  if (pathname.startsWith('/api/') || pathname.startsWith('/v/')) {
    return c.json(errorBody.notFound, 404)
  }
  return c.notFound()
})

app.onError((_error, c) => c.json(errorBody.unavailable, 503))
