export type BrandConfig = Readonly<{
  siteName: string
  logoPath: string | null
  faviconPath: string | null
}>

export const brand: BrandConfig = {
  siteName: 'play-cms',
  logoPath: null,
  faviconPath: null,
}

const logoPathPattern = /^\/brand\/[A-Za-z0-9_-]+\.(?:png|webp)$/
const faviconPathPattern = /^\/brand\/[A-Za-z0-9_-]+\.ico$/

export function isBrandAssetPath(
  value: string,
  kind: 'logo' | 'favicon',
): boolean {
  return (kind === 'logo' ? logoPathPattern : faviconPathPattern).test(value)
}
