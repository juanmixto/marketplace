import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants'

type Orientation = 'narrow' | 'wide'

const DIMENSIONS: Record<Orientation, { width: number; height: number }> = {
  narrow: { width: 1080, height: 1920 },
  wide: { width: 1920, height: 1080 },
}

/**
 * Renders a deterministic marketing-style screenshot of the app for the
 * `screenshots` array in `manifest.ts`. Keeps contents synthetic so the
 * output doesn't depend on seed data or database state.
 */
export async function renderBrandScreenshot(orientation: Orientation) {
  const { width, height } = DIMENSIONS[orientation]
  const isWide = orientation === 'wide'

  const logoBuf = await readFile(path.join(process.cwd(), 'public/brand/logo.png'))
  const logoSrc = `data:image/png;base64,${logoBuf.toString('base64')}`

  const cards = [
    { emoji: '🥬', label: 'Verduras' },
    { emoji: '🍎', label: 'Frutas' },
    { emoji: '🧀', label: 'Lácteos' },
    { emoji: '🍯', label: 'Miel' },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(160deg, #052e16 0%, #065f46 50%, #0f766e 100%)',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          padding: isWide ? 96 : 72,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt=""
            width={96}
            height={96}
            style={{ borderRadius: 20, background: 'rgba(255,255,255,0.92)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05 }}>{SITE_NAME}</div>
            <div style={{ fontSize: 24, opacity: 0.85 }}>{SITE_DESCRIPTION}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: isWide ? 72 : 96,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            maxWidth: isWide ? 1200 : 900,
          }}
        >
          <div style={{ fontSize: isWide ? 96 : 84, fontWeight: 900, lineHeight: 1.0 }}>
            Alimentos locales, productores verificados.
          </div>
          <div style={{ fontSize: isWide ? 36 : 34, lineHeight: 1.3, color: 'rgba(236,253,245,0.88)' }}>
            {SITE_DESCRIPTION}
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            gap: isWide ? 32 : 24,
            flexWrap: 'wrap',
          }}
        >
          {cards.map((c) => (
            <div
              key={c.label}
              style={{
                flex: '1 1 0',
                minWidth: isWide ? 260 : 200,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 28,
                padding: isWide ? 36 : 28,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ fontSize: isWide ? 72 : 64 }}>{c.emoji}</div>
              <div style={{ fontSize: isWide ? 32 : 28, fontWeight: 700 }}>{c.label}</div>
              <div style={{ fontSize: isWide ? 22 : 20, opacity: 0.78 }}>Del campo · Km 0</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { width, height }
  )
}
