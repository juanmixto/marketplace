import type { MetadataRoute } from 'next'
import { getServerEnv } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  const env = getServerEnv()
  const siteUrl = new URL(env.appUrl)
  const sitemapUrl = new URL('/sitemap.xml', siteUrl).toString()

  // Staging deploys must never appear in search results — duplicate
  // content with production would split SEO authority and leak unfinished
  // copy. Block everything; the sitemap link is omitted so crawlers have
  // nothing to follow.
  if (env.appEnv === 'staging') {
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
