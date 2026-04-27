import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/constants'

export const alt = `${SITE_NAME} - ${SITE_DESCRIPTION}`
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const logoBuf = await readFile(path.join(process.cwd(), 'public/brand/logo.png'))
  const logoSrc = `data:image/png;base64,${logoBuf.toString('base64')}`

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt=""
            width={72}
            height={72}
            style={{ borderRadius: '18px', background: 'rgba(255,255,255,0.92)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '34px', fontWeight: 700, lineHeight: 1.1 }}>{SITE_NAME}</div>
            <div style={{ fontSize: '18px', opacity: 0.85 }}>{SITE_DESCRIPTION}</div>
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
