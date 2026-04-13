import { auth } from '@/lib/auth'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <>
      <Header user={session?.user} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  )
}
