import test from 'node:test'
import assert from 'node:assert/strict'
import {
  THEME_COLORS,
  getNextThemePreference,
  getThemeToggleLabel,
  isDarkThemeSelected,
  normalizeResolvedTheme,
  normalizeThemePreference,
} from '@/lib/theme'

test('normalizeThemePreference falls back to system for unknown values', () => {
  assert.equal(normalizeThemePreference(undefined), 'system')
  assert.equal(normalizeThemePreference('sepia'), 'system')
  assert.equal(normalizeThemePreference('dark'), 'dark')
})

test('normalizeResolvedTheme falls back to light for unknown values', () => {
  assert.equal(normalizeResolvedTheme(undefined), 'light')
  assert.equal(normalizeResolvedTheme('system'), 'light')
  assert.equal(normalizeResolvedTheme('dark'), 'dark')
})

test('getNextThemePreference cycles system, light and dark in order', () => {
  assert.equal(getNextThemePreference('system'), 'light')
  assert.equal(getNextThemePreference('light'), 'dark')
  assert.equal(getNextThemePreference('dark'), 'system')
})

test('getThemeToggleLabel reflects the effective mode shown to the user', () => {
  assert.equal(getThemeToggleLabel('system', 'dark'), 'Automático')
  assert.equal(getThemeToggleLabel('light', 'light'), 'Claro')
  assert.equal(getThemeToggleLabel('dark', 'dark'), 'Oscuro')
})

test('isDarkThemeSelected understands explicit and system dark mode', () => {
  assert.equal(isDarkThemeSelected('dark', 'light'), true)
  assert.equal(isDarkThemeSelected('system', 'dark'), true)
  assert.equal(isDarkThemeSelected('system', 'light'), false)
})

test('THEME_COLORS exposes valid light and dark metadata colors', () => {
  assert.match(THEME_COLORS.light, /^#/)
  assert.match(THEME_COLORS.dark, /^#/)
  assert.notEqual(THEME_COLORS.light, THEME_COLORS.dark)
})
