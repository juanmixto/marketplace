import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import IosInstallHint from '@/components/pwa/IosInstallHint'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <IosInstallHint />
    </>
  )
}
