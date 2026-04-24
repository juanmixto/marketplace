import type { UserRole } from '@/generated/prisma/enums'

declare module 'next-auth' {
  interface User {
    role: UserRole
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      image?: string | null
      role: UserRole
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    has2fa?: boolean
    /** Epoch ms of the last DB role check (see src/lib/auth.ts). */
    roleCheckedAt?: number
  }
}
