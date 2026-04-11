import { getHomeSnapshot } from '@/domains/catalog/queries'
import { buildHomeStats } from '@/domains/catalog/home'
import { getPublicMarketplaceConfig } from '@/lib/config'
import { HomePageClient } from './HomePageClient'

export const revalidate = 3600

export default async function HomePage() {
  const { featured, categories, vendors, stats } = await getHomeSnapshot()
  const heroStats = buildHomeStats(stats)
  const publicConfig = await getPublicMarketplaceConfig()

  return (
    <HomePageClient
      featured={featured}
      categories={categories}
      vendors={vendors}
      heroStats={heroStats}
      publicConfig={publicConfig}
    />
  )
}
