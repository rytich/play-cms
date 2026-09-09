import type { ViewerRoute } from './routes'

export type ViewerLogoutState = 'idle' | 'pending' | 'failed'

export type ViewerSynchronizationState = {
  logoutState: ViewerLogoutState
  explicitAuthentication: boolean
}

type ViewerSynchronizationEvent = {
  type:
    | 'observed'
    | 'logout-started'
    | 'logout-failed'
    | 'logout-succeeded'
    | 'history-restored'
    | 'authentication-started'
    | 'authentication-succeeded'
  routeKind: ViewerRoute['kind']
}

export const initialViewerSynchronizationState: ViewerSynchronizationState = {
  logoutState: 'idle',
  explicitAuthentication: false,
}

function isAuthenticationRoute(routeKind: ViewerRoute['kind']) {
  return routeKind === 'register' || routeKind === 'login'
}

export function viewerSynchronizationDecision(
  current: ViewerSynchronizationState,
  event: ViewerSynchronizationEvent,
) {
  let state = current
  let discardCachedVideos = false
  let discardAuthentication = false

  switch (event.type) {
    case 'logout-started':
      state = { logoutState: 'pending', explicitAuthentication: false }
      break
    case 'logout-failed':
      state = { logoutState: 'failed', explicitAuthentication: false }
      break
    case 'logout-succeeded':
      state = initialViewerSynchronizationState
      discardCachedVideos = true
      discardAuthentication = true
      break
    case 'authentication-started':
      state = { logoutState: 'idle', explicitAuthentication: true }
      discardCachedVideos = true
      break
    case 'authentication-succeeded':
      state = initialViewerSynchronizationState
      break
    case 'history-restored':
      if (
        current.logoutState === 'failed' &&
        isAuthenticationRoute(event.routeKind)
      ) {
        state = { logoutState: 'idle', explicitAuthentication: true }
        discardCachedVideos = true
        discardAuthentication = true
      } else if (!isAuthenticationRoute(event.routeKind)) {
        state = { ...current, explicitAuthentication: false }
      }
      break
    case 'observed':
      break
  }

  return {
    state,
    synchronize:
      state.logoutState !== 'pending' &&
      !(state.explicitAuthentication && isAuthenticationRoute(event.routeKind)),
    discardCachedVideos,
    discardAuthentication,
  }
}
