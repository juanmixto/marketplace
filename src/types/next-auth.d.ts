import type { UserRole } from '@/generated/prisma/enums'

declare module 'next-auth' {
  interface User {
    role: UserRole
    isActive?: boolean
    authVersion?: number
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      image?: string | null
      role: UserRole
      isActive?: boolean
      authVersion?: number
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    has2fa?: boolean
    isActive?: boolean
    authVersion?: number
    /** Epoch ms of the last DB role check (see src/lib/auth.ts). */
    roleCheckedAt?: number
  }
}
