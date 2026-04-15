import { ImageResponse } from 'next/og'

type IconVariant = 'any' | 'maskable'

/**
 * Renders the PWA brand mark at a given pixel size. `maskable` variants get a
 * ~18% safe-area padding so the icon survives OS shape masking.
 */
export function renderBrandIcon(size: number, variant: IconVariant = 'any') {
  const padding = variant === 'maskable' ? size * 0.18 : size * 0.1
  const inner = size - padding * 2
  const radius = variant === 'maskable' ? 0 : size * 0.22

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
              ? '#0f766e'
              : 'linear-gradient(135deg, #0f766e 0%, #65a30d 100%)',
          borderRadius: radius,
        }}
      >
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
          🌿
        </div>
      </div>
    ),
    { width: size, height: size }
  )
}
