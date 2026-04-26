import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import IosInstallHint from '@/components/pwa/IosInstallHint'
import { getCategories } from '@/domains/catalog/queries'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategories()
  const availableCategorySlugs = categories
    .filter(c => c._count.products > 0)
    .map(c => c.slug)
  return (
    <>
      <Header availableCategorySlugs={availableCategorySlugs} />
      <main className="flex-1">{children}</main>
      <Footer />
      <IosInstallHint />
    </>
  )
}
