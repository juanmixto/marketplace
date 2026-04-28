import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type IconVariant = 'any' | 'maskable'

let cachedLogoSrc: string | null = null
async function getLogoSrc() {
  if (cachedLogoSrc) return cachedLogoSrc
  const buf = await readFile(path.join(process.cwd(), 'public/brand/logo.png'))
  cachedLogoSrc = `data:image/png;base64,${buf.toString('base64')}`
  return cachedLogoSrc
}

/**
 * Renders the PWA brand mark at a given pixel size. `maskable` variants get a
 * ~18% safe-area padding so the icon survives OS shape masking. When `glyph`
 * is passed it renders that emoji (used for PWA shortcuts: 🔍 / 🛒 / 📦);
 * otherwise it renders the brand logo PNG.
 */
export async function renderBrandIcon(
  size: number,
  variant: IconVariant = 'any',
  glyph?: string
) {
  const padding = variant === 'maskable' ? size * 0.18 : size * 0.1
  const inner = size - padding * 2
  const radius = variant === 'maskable' ? 0 : size * 0.22

  const useLogo = !glyph
  const logoSrc = useLogo ? await getLogoSrc() : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            variant === 'maskable'
              ? '#f7f4ee'
              : 'linear-gradient(135deg, #0f766e 0%, #65a30d 100%)',
          borderRadius: radius,
        }}
      >
        {useLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc!}
            alt=""
            width={inner}
            height={inner}
            style={{ background: '#f7f4ee', borderRadius: variant === 'maskable' ? 0 : inner * 0.18 }}
          />
        ) : (
          <div
            style={{
              width: inner,
              height: inner,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: inner * 0.78,
              lineHeight: 1,
            }}
          >
            {glyph}
          </div>
        )}
      </div>
    ),
    { width: size, height: size }
  )
}
