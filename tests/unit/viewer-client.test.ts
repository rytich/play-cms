import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  ViewerRequestError,
  loginPasswordValidationError,
  newPasswordValidationError,
  viewerRequest,
} from '../../src/viewer/client'
import {
  availableLibraryItems,
  parseViewerLogin,
  parseViewerRegistration,
} from '../../src/core/viewer'
import { ViewerAuthForm, ViewerLibrary } from '../../src/viewer/App'

afterEach(() => vi.unstubAllGlobals())

describe('viewer client', () => {
  it('renders distinct viewer auth forms without persistent credential fields', () => {
    const register = renderToStaticMarkup(
      createElement(ViewerAuthForm, {
        mode: 'register',
        busy: false,
        error: '',
        onSubmit: () => {},
      }),
    )
    const login = renderToStaticMarkup(
      createElement(ViewerAuthForm, {
        mode: 'login',
        busy: false,
        error: '',
        onSubmit: () => {},
      }),
    )
    expect(register).toContain('視聴者登録')
    expect(register).toContain('href="/login"')
    expect(login).toContain('視聴者ログイン')
    expect(login).toContain('href="/register"')
    expect(register).not.toContain('localStorage')
  })

  it('shows only title and deadline in the library and has an exact empty state', () => {
    const item = {
      publicId: 'public-a',
      title: 'Synthetic title',
      description: 'Hidden secondary metadata',
      endsAt: '2100-01-01T00:00:00.000Z',
    }
    const list = renderToStaticMarkup(
      createElement(ViewerLibrary, { videos: [item], onLogout: () => {} }),
    )
    const empty = renderToStaticMarkup(
      createElement(ViewerLibrary, { videos: [], onLogout: () => {} }),
    )
    expect(list).toContain('Synthetic title')
    expect(list).toContain('2100')
    expect(list).not.toContain(item.description)
    expect(empty).toContain('現在視聴できる動画はありません')
  })

  it('normalizes exact viewer credentials and keeps registration stronger than login', () => {
    expect(
      parseViewerRegistration({
        email: ' Viewer@Example.test ',
        password: 'あいうえおかきくけこさし',
      }),
    ).toEqual({
      email: 'viewer@example.test',
      password: 'あいうえおかきくけこさし',
    })
    expect(
      parseViewerLogin({ email: 'viewer@example.test', password: 'あいうえ' }),
    ).toEqual({ email: 'viewer@example.test', password: 'あいうえ' })
    expect(
      parseViewerRegistration({
        email: 'viewer@example.test',
        password: 'あいうえ',
      }),
    ).toBeNull()
    expect(
      parseViewerRegistration({
        email: 'viewer@example.test',
        password: 'valid viewer password',
        role: 'admin',
      }),
    ).toBeNull()
  })

  it('rechecks availability and maps only the public library fields', () => {
    const base = {
      publicId: 'public-a',
      title: 'Available',
      description: 'Description',
      startsAt: '2026-09-09T00:00:00.000Z',
      endsAt: '2026-09-10T00:00:00.000Z',
    }
    expect(
      availableLibraryItems(
        [
          { ...base, status: 'published' },
          { ...base, publicId: 'draft', status: 'draft' },
          {
            ...base,
            publicId: 'future',
            status: 'published',
            startsAt: '2026-09-09T12:00:00.001Z',
          },
          {
            ...base,
            publicId: 'expired',
            status: 'published',
            endsAt: '2026-09-09T12:00:00.000Z',
          },
        ],
        Date.parse('2026-09-09T12:00:00.000Z'),
      ),
    ).toEqual([
      {
        publicId: 'public-a',
        title: 'Available',
        description: 'Description',
        endsAt: '2026-09-10T00:00:00.000Z',
      },
    ])
  })

  it('uses the strong registration policy without locking out legacy logins', () => {
    expect(newPasswordValidationError('🔐'.repeat(3))).not.toBeNull()
    expect(newPasswordValidationError('あいうえおかきくけこさし')).toBeNull()
    expect(loginPasswordValidationError('🔐'.repeat(3))).toBeNull()
    expect(loginPasswordValidationError('a'.repeat(11))).not.toBeNull()
    expect(loginPasswordValidationError('a'.repeat(129))).not.toBeNull()
  })

  it('posts same-origin JSON without caching or browser persistence', async () => {
    let actual: RequestInit | undefined
    vi.stubGlobal('fetch', (_path: string, init: RequestInit) => {
      actual = init
      return Promise.resolve(Response.json({ authenticated: true }))
    })

    await expect(
      viewerRequest('/api/viewer/login', 'POST', {
        email: 'viewer@example.test',
        password: 'synthetic password',
      }),
    ).resolves.toEqual({ authenticated: true })
    expect(actual).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    })
    expect(new Headers(actual?.headers).get('Content-Type')).toBe(
      'application/json',
    )
  })

  it('classifies auth and network failures without returning response bodies', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response('private upstream detail', { status: 403 })),
    )
    await expect(viewerRequest('/api/viewer/library')).rejects.toMatchObject({
      name: 'ViewerRequestError',
      status: 403,
      message: 'この操作は許可されていません。',
    } satisfies Partial<ViewerRequestError>)

    vi.stubGlobal('fetch', () => Promise.reject(new Error('private failure')))
    await expect(viewerRequest('/api/viewer/library')).rejects.toMatchObject({
      status: null,
      message: '現在処理できません。時間をおいてもう一度お試しください。',
    } satisfies Partial<ViewerRequestError>)
  })
})
