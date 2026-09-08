import { describe, expect, it } from 'vitest'

import { brand, isBrandAssetPath } from '../../src/ui/brand'

describe('brand', () => {
  it('provides a nonempty name and only approved local assets', () => {
    expect(brand.siteName.trim().length).toBeGreaterThan(0)
    if (brand.logoPath !== null) {
      expect(isBrandAssetPath(brand.logoPath, 'logo')).toBe(true)
    }
    if (brand.faviconPath !== null) {
      expect(isBrandAssetPath(brand.faviconPath, 'favicon')).toBe(true)
    }
  })

  it('rejects external, traversing, annotated, and unsupported assets', () => {
    expect(isBrandAssetPath('/brand/logo-v1.png', 'logo')).toBe(true)
    expect(isBrandAssetPath('/brand/logo_v1.webp', 'logo')).toBe(true)
    expect(isBrandAssetPath('/brand/site.ico', 'favicon')).toBe(true)

    for (const value of [
      'https://example.invalid/logo.png',
      '//example.invalid/a.png',
      '/brand/../x.png',
      '/brand/a.svg',
      '/brand/a.png?token=x',
      '/brand/a.png#fragment',
      '/other/a.png',
    ]) {
      expect(isBrandAssetPath(value, 'logo')).toBe(false)
    }
    expect(isBrandAssetPath('/brand/site.png', 'favicon')).toBe(false)
  })
})
