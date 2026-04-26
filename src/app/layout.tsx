import type { Metadata } from 'next'
import type { Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants'
import { siteAppearance } from '@/lib/brand'
import { Suspense } from 'react'
import { ThemeProvider } from '@/components/ThemeProvider'
import { AnalyticsProvider } from '@/components/analytics/AnalyticsProvider'
import { PostHogProvider } from '@/components/analytics/PostHogProvider'
import { WebVitalsReporter } from '@/components/analytics/WebVitalsReporter'
import { cookies } from 'next/headers'
import { THEME_COLORS, THEME_COOKIE_NAME } from '@/lib/theme'
import { ThemeCookieSync } from '@/components/ThemeCookieSync'
import { SITE_METADATA_BASE } from '@/lib/seo'
import { SessionProvider } from '@/components/SessionProvider'
import { LanguageProvider } from '@/i18n'
import { CartHydrationProvider } from '@/components/buyer/CartHydrationProvider'
import { getServerLocale } from '@/i18n/server'
import PwaRegister from '@/components/pwa/PwaRegister'
import OfflineIndicator from '@/components/pwa/OfflineIndicator'
import { SwAnalyticsBridge } from '@/components/pwa/SwAnalyticsBridge'
import { ConnectionStatus } from '@/components/pwa/ConnectionStatus'
import { BuildBadge } from '@/components/system/BuildBadge'
import { UpdateAvailableBanner } from '@/components/system/UpdateAvailableBanner'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
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
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ],
  colorScheme: 'light dark',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale()
  // Read the resolved-theme cookie that ThemeCookieSync mirrors from
  // next-themes. If absent (first visit) we default to dark; the
  // bootstrap script in <head> will demote to light immediately if the
  // user prefers light, but having ANY value here means frame 0 is
  // never the browser's default white.
  const themeCookie = (await cookies()).get(THEME_COOKIE_NAME)?.value
  const initialTheme: 'light' | 'dark' = themeCookie === 'light' ? 'light' : 'dark'
  const initialBg = THEME_COLORS[initialTheme]
  const initialClass = initialTheme === 'dark' ? 'dark' : ''

  return (
    <html
      lang={locale}
      className={`${geist.variable} h-full antialiased ${initialClass}`.trim()}
      // Inline background-color comes from the THEME_COOKIE_NAME cookie
      // mirrored by ThemeCookieSync. This means frame 0 (the very first
      // paint, before any CSS or JS runs) already matches the user's
      // theme — no white flash for dark users on refresh, no black flash
      // for light users either. First-time visitors fall back to dark
      // and the bootstrap script in <head> corrects the moment it can.
      style={{ backgroundColor: initialBg, colorScheme: initialTheme }}
      suppressHydrationWarning
    >
      <head>
        {/*
          Tells the browser this document supports both schemes; when a
          full-page navigation lands and the browser is showing the
          intermediate "blank" document before our CSS or script run, this
          hints it to honour the system preference instead of defaulting
          to white. Combined with the inline-style fallback below, this
          eliminates the white flash on navigations like the mobile
          search submit.
        */}
        <meta name="color-scheme" content="dark light" />
        {/*
          Anti-FOUC theme bootstrap. Must run BEFORE the first paint, which
          means it lives in <head> ahead of any stylesheet — running it from
          <body> caused a brief white flash on full-page navigations
          (e.g. mobile search submit) because the browser already painted
          the default white html background before this executed.

          Sets:
            - .dark on <html> for the design tokens
            - colorScheme so form controls match
            - inline backgroundColor on <html> so the very first paint
              uses our background colour, even before the CSS bundle has
              parsed.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('marketplace-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=s==='dark'||((!s||s==='system')&&m);var h=document.documentElement;if(d){h.classList.add('dark');}else{h.classList.remove('dark');}h.style.colorScheme=d?'dark':'light';h.style.backgroundColor=d?'#0d1117':'#f5f2ec';}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
        <SessionProvider>
          <ThemeProvider>
            <ThemeCookieSync />
            <LanguageProvider initialLocale={locale}>
              <Suspense fallback={null}>
                <AnalyticsProvider />
              </Suspense>
              <PostHogProvider />
              <WebVitalsReporter />
              <PwaRegister />
              <OfflineIndicator />
              <SwAnalyticsBridge />
              <ConnectionStatus />
              <CartHydrationProvider />
              <UpdateAvailableBanner />
              {children}
              <BuildBadge />
            </LanguageProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
