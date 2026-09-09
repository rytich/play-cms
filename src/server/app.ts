import { Hono } from 'hono'
import type { Context } from 'hono'

import {
  bootstrapConsumed,
  createOnlyAdmin,
  createSession,
  deleteSession,
  findAdminByEmail,
  findAdminSession,
  findVideo,
  insertAccessCode,
  insertVideo,
  listAccessCodes,
  listVideos,
  revokeAccessCode,
  updateVideo,
} from '../adapters/database/admin-repository'
import {
  constantTimeSecretEqual,
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
  parseOffset,
  parseVideoInput,
  validLoginPassword,
  validNewPassword,
} from '../core/admin'
import {
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

async function adminAccountId(c: AppContext) {
  const hash = await sessionHash(c.req.raw)
  if (!hash) return null
  const session = await findAdminSession(
    c.env.DATABASE,
    hash,
    Math.floor(Date.now() / 1_000),
  )
  return session?.account_id ?? null
}

async function requireAdmin(c: AppContext) {
  const accountId = await adminAccountId(c)
  return accountId
    ? { accountId }
    : { response: c.json(errorBody.unauthorized, 401) }
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
  const offset = parseOffset(c.req.query('offset'))
  if (offset === null) return c.json(errorBody.invalid, 400)
  return c.json({ videos: await listVideos(c.env.DATABASE, offset) })
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
  const offset = parseOffset(c.req.query('offset'))
  if (offset === null) return c.json(errorBody.invalid, 400)
  const rows = await listAccessCodes(c.env.DATABASE, c.req.param('id'), offset)
  if (!rows) return c.json(errorBody.notFound, 404)
  return c.json({
    codes: rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at * 1_000).toISOString(),
      revokedAt:
        row.revoked_at === null
          ? null
          : new Date(row.revoked_at * 1_000).toISOString(),
      status:
        row.revoked_at === null ? ('unused' as const) : ('revoked' as const),
    })),
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
  return revoked ? c.json({ revoked: true }) : c.json(errorBody.notFound, 404)
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
