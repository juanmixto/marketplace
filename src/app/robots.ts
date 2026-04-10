import type { MetadataRoute } from 'next'
import { getServerEnv } from '@/lib/env'

const siteUrl = new URL(getServerEnv().appUrl)
const sitemapUrl = new URL('/sitemap.xml', siteUrl).toString()

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/_next',
        '/_next/',
        '/api',
        '/api/',
        '/admin',
        '/admin/',
        '/vendor',
        '/vendor/',
        '/cuenta',
        '/cuenta/',
        '/carrito',
        '/checkout',
        '/checkout/',
        '/login',
        '/register',
        '/forgot-password',
        '/recuperar-contrasena',
        '/reset-password',
        '/reset-password/',
        '/buscar',
      ],
    },
    sitemap: sitemapUrl,
  }
}
