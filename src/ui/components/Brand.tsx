import { useState } from 'react'

import { isBrandAssetPath } from '../brand'

type BrandProps = {
  siteName: string
  logoPath: string | null
}

export function Brand({ siteName, logoPath }: BrandProps) {
  const [failed, setFailed] = useState(false)
  const showLogo =
    !failed && logoPath !== null && isBrandAssetPath(logoPath, 'logo')

  return (
    <span className="brand">
      {showLogo ? (
        <img
          className="brand-logo"
          src={logoPath}
          alt={siteName}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="brand-name">{siteName}</span>
      )}
    </span>
  )
}
