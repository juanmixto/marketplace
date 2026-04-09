export const THEME_COLORS = {
  light: '#f5f2ec',
  dark: '#0d1117',
} as const

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedThemeMode = 'light' | 'dark'

export function normalizeThemePreference(theme?: string | null): ThemePreference {
  return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system'
}

export function normalizeResolvedTheme(theme?: string | null): ResolvedThemeMode {
  return theme === 'dark' ? 'dark' : 'light'
}

export function getNextThemePreference(theme?: string | null): ThemePreference {
  const currentTheme = normalizeThemePreference(theme)

  if (currentTheme === 'system') return 'light'
  if (currentTheme === 'light') return 'dark'
  return 'system'
}

export function getThemeToggleLabel(theme?: string | null, resolvedTheme?: string | null) {
  const currentTheme = normalizeThemePreference(theme)
  const currentResolvedTheme = normalizeResolvedTheme(resolvedTheme)

  if (currentTheme === 'system') return 'Automático'
  return currentResolvedTheme === 'dark' ? 'Oscuro' : 'Claro'
}

export function isDarkThemeSelected(theme?: string | null, resolvedTheme?: string | null) {
  const currentTheme = normalizeThemePreference(theme)
  const currentResolvedTheme = normalizeResolvedTheme(resolvedTheme)

  return currentTheme === 'dark' || (currentTheme === 'system' && currentResolvedTheme === 'dark')
}
