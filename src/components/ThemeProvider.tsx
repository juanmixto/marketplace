'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode
  nonce?: string
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
      themes={['light', 'dark', 'system']}
      storageKey="marketplace-theme"
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}
