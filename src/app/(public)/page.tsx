import type { Metadata } from 'next'
import { getHomeSnapshot } from '@/domains/catalog/queries'
import { buildHomeStats } from '@/domains/catalog/home'
import { getPublicMarketplaceConfig } from '@/lib/config'
import { HomePageClient } from './HomePageClient'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/constants'
import { SITE_METADATA_BASE, absoluteUrl } from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'

export const revalidate = 3600

export const metadata: Metadata = {
  title: { absolute: SITE_NAME },
  description: SITE_DESCRIPTION,
  metadataBase: SITE_METADATA_BASE,
  alternates: { canonical: '/' },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ['/twitter-image'],
  },
}

export default async function HomePage() {
  const { featured, categories, vendors, stats } = await getHomeSnapshot()
  const heroStats = buildHomeStats(stats)
  const publicConfig = await getPublicMarketplaceConfig()
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      description: SITE_DESCRIPTION,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      potentialAction: {
        '@type': 'SearchAction',
        target: `${absoluteUrl('/buscar')}?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ]

  return (
    <>
      <JsonLd data={structuredData} />
      <HomePageClient
        featured={featured}
        categories={categories}
        vendors={vendors}
        heroStats={heroStats}
        publicConfig={publicConfig}
      />
    </>
  )
}
  )
}
