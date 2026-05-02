import { RegisterForm } from '@/components/auth/RegisterForm'
import { SocialButtons } from '@/components/auth/SocialButtons'

export default function RegisterPage() {
  return <RegisterForm topSlot={<SocialButtons callbackUrl="/" mode="register" />} />
}
