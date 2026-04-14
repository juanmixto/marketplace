/**
 * Contract: admin and vendor panels expose a collapsible sidebar that
 *
 *   1. shares state through `SidebarProvider` / `useSidebar`,
 *   2. persists the desktop collapsed state in localStorage under a
 *      stable key, and
 *   3. exposes a mobile drawer via a hamburger toggle in the panel header.
 *
 * These invariants are easy to regress the next time somebody edits the
 * layout — the test keeps them locked in statically.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import es from '@/i18n/locales/es'
import en from '@/i18n/locales/en'

const PROVIDER_PATH = new URL('../../src/components/layout/SidebarProvider.tsx', import.meta.url).pathname
const ADMIN_LAYOUT = new URL('../../src/app/(admin)/layout.tsx', import.meta.url).pathname
const VENDOR_LAYOUT = new URL('../../src/app/(vendor)/layout.tsx', import.meta.url).pathname
const ADMIN_SIDEBAR = new URL('../../src/components/admin/AdminSidebar.tsx', import.meta.url).pathname
const VENDOR_SIDEBAR = new URL('../../src/components/vendor/VendorSidebar.tsx', import.meta.url).pathname
const ADMIN_HEADER = new URL('../../src/components/admin/AdminHeader.tsx', import.meta.url).pathname
const VENDOR_HEADER = new URL('../../src/components/vendor/VendorHeader.tsx', import.meta.url).pathname

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

test('SidebarProvider exposes the expected API and persists state', () => {
  const source = read(PROVIDER_PATH)
  assert.match(source, /^'use client'/, 'SidebarProvider must be a client component')
  assert.match(source, /export function SidebarProvider/)
  assert.match(source, /export function useSidebar/)
  assert.match(source, /export const SIDEBAR_STORAGE_KEY = 'marketplace-sidebar-collapsed'/)
  // Persists across sessions via localStorage.
  assert.match(source, /localStorage\.setItem\(SIDEBAR_STORAGE_KEY/)
  assert.match(source, /localStorage\.getItem\(SIDEBAR_STORAGE_KEY/)
  // Mobile drawer closes on navigation.
  assert.match(source, /usePathname/)
  assert.match(source, /setMobileOpen\(false\)/)
})

test('admin and vendor layouts wrap their shell in SidebarProvider', () => {
  for (const layoutPath of [ADMIN_LAYOUT, VENDOR_LAYOUT]) {
    const source = read(layoutPath)
    assert.match(
      source,
      /from '@\/components\/layout\/SidebarProvider'/,
      `${layoutPath} must import SidebarProvider`,
    )
    assert.match(source, /<SidebarProvider>/, `${layoutPath} must render <SidebarProvider>`)
    assert.match(source, /<\/SidebarProvider>/)
  }
})

test('both sidebars consume useSidebar and render a mobile backdrop', () => {
  for (const sidebarPath of [ADMIN_SIDEBAR, VENDOR_SIDEBAR]) {
    const source = read(sidebarPath)
    assert.match(source, /useSidebar\(\)/, `${sidebarPath} must call useSidebar`)
    assert.match(source, /collapsed/, `${sidebarPath} must branch on collapsed state`)
    assert.match(source, /mobileOpen/, `${sidebarPath} must branch on mobileOpen state`)
    // Backdrop + off-canvas transform for mobile.
    assert.match(source, /-translate-x-full/, `${sidebarPath} must slide off-canvas on mobile`)
    assert.match(source, /md:translate-x-0/, `${sidebarPath} must stay in flow on desktop`)
    // Collapsed icon-only rail uses md:w-16.
    assert.match(source, /md:w-16/, `${sidebarPath} must collapse to an icon-only rail on desktop`)
  }
})

test('both headers expose a mobile hamburger that opens the drawer', () => {
  for (const headerPath of [ADMIN_HEADER, VENDOR_HEADER]) {
    const source = read(headerPath)
    assert.match(source, /useSidebar\(\)/, `${headerPath} must call useSidebar`)
    assert.match(source, /openMobile/, `${headerPath} must call openMobile`)
    assert.match(source, /Bars3Icon/, `${headerPath} must render the hamburger icon`)
    assert.match(source, /md:hidden/, `${headerPath} hamburger must be hidden on desktop`)
  }
})

test('i18n keys for sidebar toggles exist in both locales', () => {
  const esMap = es as unknown as Record<string, string>
  const enMap = en as unknown as Record<string, string>
  const required = [
    'vendor.sidebar.collapse',
    'vendor.sidebar.expand',
    'vendor.sidebar.openMenu',
    'vendor.sidebar.closeMenu',
  ]
  for (const key of required) {
    assert.ok(esMap[key], `missing es.${key}`)
    assert.ok(enMap[key], `missing en.${key}`)
    assert.notEqual(esMap[key], enMap[key], `${key} appears identical in es/en — likely untranslated`)
  }
})

test('vendor sidebar toggle labels flow through useT (no hardcoded literals)', () => {
  const source = read(VENDOR_SIDEBAR)
  // The scan below catches the most common regression: an aria-label literal
  // dropped directly into the JSX instead of being routed through t(...).
  const hardcodedAria = source.match(/aria-label="[^"]*[A-Za-záéíóúñ]{3,}[^"]*"/g) ?? []
  assert.deepEqual(
    hardcodedAria,
    [],
    `VendorSidebar must translate aria-labels via t(): found ${hardcodedAria.join(', ')}`,
  )
})
