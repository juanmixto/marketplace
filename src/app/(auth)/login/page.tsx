import { LoginForm } from '@/components/auth/LoginForm'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { resolvePostLoginDestination } from '@/lib/portals'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const session = await auth()

  if (session?.user) {
    redirect(resolvePostLoginDestination(session.user.role, params.callbackUrl))
  }

  return <LoginForm callbackUrl={params.callbackUrl ?? '/'} />
}
