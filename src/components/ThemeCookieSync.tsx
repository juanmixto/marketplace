'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { THEME_COOKIE_NAME } from '@/lib/theme'

/**
 * Mirrors next-themes' `resolvedTheme` into a server-readable cookie.
 *
 * Without this, the SSR pass has no way to know whether the user is on
 * light or dark, because next-themes stores the preference in
 * localStorage. The result was a white flash on dark users (or a black
 * flash on light users) every time the browser had to re-render the
 * shell — refreshes and full-page navigations like the mobile search
 * submit. Once the cookie is set, the next paint after a reload starts
 * with the correct background colour.
 *
 * SameSite=Lax + 1-year max-age — safe defaults that survive top-level
 * navigation but don't leak cross-site.
 */
export function ThemeCookieSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return
    document.cookie =
      `${THEME_COOKIE_NAME}=${resolvedTheme}; path=/; max-age=31536000; SameSite=Lax`
  }, [resolvedTheme])

  return null
}
