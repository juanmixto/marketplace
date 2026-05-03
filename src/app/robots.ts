import type { MetadataRoute } from 'next'
import { getServerEnv } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  const env = getServerEnv()
  const siteUrl = new URL(env.appUrl)
  const sitemapUrl = new URL('/sitemap.xml', siteUrl).toString()

  // Non-production deploys are intentionally visitable for demos, but must
  // never appear in search results. Block crawler discovery and omit the
  // sitemap so dev/stg do not split SEO authority with production.
  if (env.appEnv !== 'production') {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    }
  }

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
