import { describe, expect, it } from 'vitest'

import {
  initialViewerSynchronizationState,
  viewerSynchronizationDecision,
} from '../../src/viewer/synchronization'
import { viewerTimeZoneLabel } from '../../src/viewer/presentation'

describe('viewer synchronization decisions', () => {
  it('suppresses synchronization only while logout is pending', () => {
    const pending = viewerSynchronizationDecision(
      initialViewerSynchronizationState,
      { type: 'logout-started', routeKind: 'library' },
    )
    expect(pending).toMatchObject({
      state: { logoutState: 'pending', explicitAuthentication: false },
      synchronize: false,
      discardCachedVideos: false,
    })

    const failed = viewerSynchronizationDecision(pending.state, {
      type: 'logout-failed',
      routeKind: 'library',
    })
    expect(failed).toMatchObject({
      state: { logoutState: 'failed', explicitAuthentication: false },
      synchronize: true,
      discardCachedVideos: false,
    })
  })

  it('restores synchronization after failed logout Back then Forward', () => {
    const failed = {
      logoutState: 'failed',
      explicitAuthentication: false,
    } as const
    const back = viewerSynchronizationDecision(failed, {
      type: 'history-restored',
      routeKind: 'login',
    })
    expect(back).toMatchObject({
      state: { logoutState: 'idle', explicitAuthentication: true },
      synchronize: false,
      discardCachedVideos: true,
      discardAuthentication: true,
    })

    const forward = viewerSynchronizationDecision(back.state, {
      type: 'history-restored',
      routeKind: 'library',
    })
    expect(forward).toMatchObject({
      state: { logoutState: 'idle', explicitAuthentication: false },
      synchronize: true,
      discardCachedVideos: false,
      discardAuthentication: false,
    })
  })

  it('discards viewer A cache when viewer B authentication starts', () => {
    const failed = {
      logoutState: 'failed',
      explicitAuthentication: false,
    } as const
    const authentication = viewerSynchronizationDecision(failed, {
      type: 'authentication-started',
      routeKind: 'login',
    })
    expect(authentication).toMatchObject({
      state: { logoutState: 'idle', explicitAuthentication: true },
      synchronize: false,
      discardCachedVideos: true,
    })

    const authenticated = viewerSynchronizationDecision(authentication.state, {
      type: 'authentication-succeeded',
      routeKind: 'library',
    })
    expect(authenticated).toMatchObject({
      state: { logoutState: 'idle', explicitAuthentication: false },
      synchronize: true,
      discardCachedVideos: false,
    })
  })
})

describe('viewer presentation', () => {
  it('uses a stable Japanese time-zone fallback for empty or unusual values', () => {
    expect(viewerTimeZoneLabel('Asia/Tokyo')).toBe('Asia/Tokyo')
    expect(viewerTimeZoneLabel('')).toBe('端末設定のタイムゾーン')
    expect(viewerTimeZoneLabel('Local Time')).toBe('端末設定のタイムゾーン')
  })
})
