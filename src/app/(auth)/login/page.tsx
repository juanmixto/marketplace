import { LoginForm } from '@/components/auth/LoginForm'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams

  return <LoginForm callbackUrl={params.callbackUrl ?? '/'} />
}
