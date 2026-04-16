import type { MetadataRoute } from 'next'
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants'
import { siteAppearance } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
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
    shortcuts: [
      {
        name: 'Buscar productos',
        short_name: 'Buscar',
        description: 'Explora el catálogo del marketplace',
        url: '/buscar?source=pwa-shortcut',
        icons: [{ src: '/icons/shortcut-search.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Mi carrito',
        short_name: 'Carrito',
        description: 'Revisa los productos en tu carrito',
        url: '/carrito?source=pwa-shortcut',
        icons: [{ src: '/icons/shortcut-cart.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Mis pedidos',
        short_name: 'Pedidos',
        description: 'Consulta el estado de tus pedidos',
        url: '/cuenta/pedidos?source=pwa-shortcut',
        icons: [{ src: '/icons/shortcut-orders.png', sizes: '96x96', type: 'image/png' }],
      },
    ],
    share_target: {
      action: '/share-target',
      method: 'GET',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
      },
    },
    screenshots: [
      {
        src: '/screenshots/home-narrow.png',
        sizes: '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Catálogo en móvil',
      },
      {
        src: '/screenshots/home-wide.png',
        sizes: '1920x1080',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Catálogo en escritorio',
      },
    ],
  }
}
