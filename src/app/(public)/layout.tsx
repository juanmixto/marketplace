import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import IosInstallHint from '@/components/pwa/IosInstallHint'
import { getVisibleCategorySlugs } from '@/domains/catalog/queries'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const availableCategorySlugs = await getVisibleCategorySlugs()
  return (
    <>
      <Header availableCategorySlugs={availableCategorySlugs} />
      <main className="flex-1">{children}</main>
      <Footer />
      <IosInstallHint />
    </>
  )
}
