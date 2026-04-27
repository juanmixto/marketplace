import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SITE_NAME } from '@/lib/constants'

export const alt = `${SITE_NAME} en X`
export const size = {
  width: 1200,
  height: 675,
}
export const contentType = 'image/png'

export default async function TwitterImage() {
  const logoBuf = await readFile(path.join(process.cwd(), 'public/brand/logo.png'))
  const logoSrc = `data:image/png;base64,${logoBuf.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          padding: '64px',
          background: 'linear-gradient(135deg, #111827 0%, #065f46 55%, #0f766e 100%)',
          color: '#ffffff',
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
            width={64}
            height={64}
            style={{ borderRadius: '16px', background: 'rgba(255,255,255,0.92)' }}
          />
          <div style={{ fontSize: '32px', fontWeight: 700 }}>{SITE_NAME}</div>
        </div>

        <div style={{ maxWidth: '820px', fontSize: '58px', fontWeight: 800, lineHeight: 1.05 }}>
          Del campo a tu hogar, sin intermediarios.
        </div>
      </div>
    ),
    size
  )
}
