'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
      themes={['light', 'dark', 'system']}
      storageKey="marketplace-theme"
    >
      {children}
    </NextThemesProvider>
  )
}
