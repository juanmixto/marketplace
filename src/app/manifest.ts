import type { MetadataRoute } from 'next'
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants'
import { siteAppearance } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'Mercado',
    description: SITE_DESCRIPTION,
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: siteAppearance.background,
    theme_color: siteAppearance.themeColor,
    categories: ['food', 'shopping', 'lifestyle'],
    lang: 'es',
    dir: 'ltr',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
