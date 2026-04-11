import type { Metadata } from 'next'
import type { Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants'
import { siteAppearance } from '@/lib/brand'
import { Suspense } from 'react'
import { ThemeProvider } from '@/components/ThemeProvider'
import { AnalyticsProvider } from '@/components/analytics/AnalyticsProvider'
import { THEME_COLORS } from '@/lib/theme'
import { SITE_METADATA_BASE } from '@/lib/seo'
import { SessionProvider } from '@/components/SessionProvider'
import { LanguageProvider } from '@/i18n'
import { getServerLocale } from '@/i18n/server'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  metadataBase: SITE_METADATA_BASE,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ['/twitter-image'],
  },
  icons: {
    icon: siteAppearance.faviconPath,
    shortcut: siteAppearance.faviconPath,
    apple: siteAppearance.faviconPath,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ],
  colorScheme: 'light dark',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale()

  return (
    <html
      lang={locale}
      className={`${geist.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
        <SessionProvider>
          <ThemeProvider>
            <LanguageProvider initialLocale={locale}>
              <Suspense fallback={null}>
                <AnalyticsProvider />
              </Suspense>
              {children}
            </LanguageProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
