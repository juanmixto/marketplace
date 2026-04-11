import { ImageResponse } from 'next/og'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/constants'

export const alt = `${SITE_NAME} - ${SITE_DESCRIPTION}`
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          padding: '72px',
          background: 'linear-gradient(135deg, #052e16 0%, #065f46 50%, #0f766e 100%)',
          color: '#f8fafc',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '18px',
              background: 'rgba(255,255,255,0.14)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
            }}
          >
            🌿
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '34px', fontWeight: 700, lineHeight: 1.1 }}>{SITE_NAME}</div>
            <div style={{ fontSize: '18px', opacity: 0.85 }}>Compra directo al productor</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '820px' }}>
          <div style={{ fontSize: '62px', fontWeight: 800, lineHeight: 1.02 }}>
            Alimentos locales, productores verificados y compra sin intermediarios.
          </div>
          <div style={{ fontSize: '26px', lineHeight: 1.35, color: 'rgba(236,253,245,0.88)' }}>
            {SITE_DESCRIPTION}
          </div>
        </div>
      </div>
    ),
    size
  )
}
