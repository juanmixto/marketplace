'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'

interface SignOutButtonProps {
  compact?: boolean
}

export function SignOutButton({ compact = false }: SignOutButtonProps) {
  return (
    <Button
      variant="ghost"
      size={compact ? 'sm' : 'md'}
      className="text-red-600 hover:bg-red-50 hover:text-red-700 w-full justify-start"
      onClick={() => signOut({ callbackUrl: '/' })}
    >
      Cerrar sesion
    </Button>
  )
}
