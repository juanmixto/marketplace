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
      className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
      onClick={() => signOut({ callbackUrl: '/' })}
    >
      Cerrar sesion
    </Button>
  )
}
