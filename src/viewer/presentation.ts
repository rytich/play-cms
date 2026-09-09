const namedTimeZone = /^(?:UTC|GMT|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/

export function viewerTimeZoneLabel(resolvedTimeZone: string | undefined) {
  return resolvedTimeZone && namedTimeZone.test(resolvedTimeZone)
    ? resolvedTimeZone
    : '端末設定のタイムゾーン'
}
