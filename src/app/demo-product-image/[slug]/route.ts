import { getDemoProductVisual } from '@/lib/demo-product-images'

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> | { slug: string } }
) {
  const { slug } = await Promise.resolve(context.params)
  const visual = getDemoProductVisual(slug)

  const title = escapeXml(visual?.title ?? 'Producto local')
  const subtitle = escapeXml(visual?.subtitle ?? 'Imagen ilustrativa para la demo')
  const emoji = visual?.emoji ?? '🧺'
  const gradientFrom = visual?.gradientFrom ?? '#14532d'
  const gradientTo = visual?.gradientTo ?? '#10b981'
  const accent = visual?.accent ?? '#d1fae5'

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${gradientFrom}" />
          <stop offset="100%" stop-color="${gradientTo}" />
        </linearGradient>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="40" />
        </filter>
      </defs>

      <rect width="1200" height="1200" rx="56" fill="url(#bg)" />
      <circle cx="960" cy="180" r="160" fill="${accent}" opacity="0.25" filter="url(#blur)" />
      <circle cx="220" cy="980" r="220" fill="#ffffff" opacity="0.12" filter="url(#blur)" />

      <rect x="72" y="72" width="240" height="48" rx="24" fill="rgba(255,255,255,0.18)" />
      <text x="192" y="103" text-anchor="middle" font-size="24" font-family="Arial, Helvetica, sans-serif" fill="#ffffff" font-weight="700">
        Demo visual
      </text>

      <text x="92" y="510" font-size="260">${emoji}</text>

      <text x="92" y="700" font-size="86" font-family="Arial, Helvetica, sans-serif" fill="#ffffff" font-weight="700">
        ${title}
      </text>
      <text x="92" y="768" font-size="38" font-family="Arial, Helvetica, sans-serif" fill="rgba(255,255,255,0.9)">
        ${subtitle}
      </text>

      <rect x="92" y="840" width="1016" height="170" rx="28" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.22)" />
      <text x="130" y="910" font-size="34" font-family="Arial, Helvetica, sans-serif" fill="#ffffff" font-weight="700">
        Mercado Productor
      </text>
      <text x="130" y="962" font-size="28" font-family="Arial, Helvetica, sans-serif" fill="rgba(255,255,255,0.92)">
        Imagen ilustrativa ajustada para que la demo sea coherente con el producto mostrado.
      </text>
    </svg>
  `.trim()

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
