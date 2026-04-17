'use client'

import { useEffect } from 'react'
import { trackPwaEvent } from '@/lib/pwa/track'

/**
 * Registers the service worker, captures the `beforeinstallprompt` event
 * so UI elsewhere can trigger the install prompt later, and wires the
 * update-available flow that powers `<UpdateToast />`.
 *
 * Keep this component tiny and side-effect-only: it must not render any DOM
 * and must never break SSR — all browser APIs are touched inside useEffect.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    // One-shot: if this session launched in standalone display mode, emit a
    // funnel event so analytics can count installed launches separately
    // from web sessions. iOS Safari exposes the flag on navigator instead
    // of matchMedia.
    const iosNav = navigator as Navigator & { standalone?: boolean }
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      iosNav.standalone === true
    if (isStandalone) {
      trackPwaEvent('pwa_launched_standalone')
    }

    // Track whether a controllerchange reload has already fired so we
    // never reload twice in a row from a single SKIP_WAITING round-trip.
    let reloadedForUpdate = false
    let pendingWaiting: ServiceWorker | null = null

    // Routes where an auto-reload would destroy in-flight user work.
    // Keep in sync with the SW's PROTECTED_PREFIXES denylist.
    const PROTECTED_PREFIXES = ['/checkout', '/vendor', '/admin', '/auth']

    const isProtectedPath = () =>
      PROTECTED_PREFIXES.some((p) => window.location.pathname.startsWith(p))

    const hasDirtyForm = () => {
      const forms = document.querySelectorAll('form')
      for (const form of forms) {
        const fields = form.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >('input, textarea, select')
        for (const field of fields) {
          if (field instanceof HTMLSelectElement) {
            for (const option of field.options) {
              if (option.selected !== option.defaultSelected) return true
            }
            continue
          }
          if (field.type === 'hidden' || field.type === 'submit' || field.type === 'button') continue
          if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
            if (field.checked !== field.defaultChecked) return true
            continue
          }
          if (field.value !== field.defaultValue) return true
        }
      }
      return false
    }

    const applyUpdate = (waiting: ServiceWorker) => {
      waiting.postMessage('SKIP_WAITING')
    }

    const scheduleUpdate = (waiting: ServiceWorker) => {
      if (isProtectedPath() || hasDirtyForm()) {
        // Defer: apply when the tab is hidden or the user navigates.
        pendingWaiting = waiting
        return
      }
      applyUpdate(waiting)
    }

    const watchRegistration = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        scheduleUpdate(registration.waiting)
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller &&
            registration.waiting
          ) {
            scheduleUpdate(registration.waiting)
          }
        })
      })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingWaiting) {
        const waiting = pendingWaiting
        pendingWaiting = null
        applyUpdate(waiting)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const requestPeriodicSync = async (registration: ServiceWorkerRegistration) => {
      try {
        // periodicSync is Chrome-only; feature-detect before touching it.
        const mgr = (registration as unknown as { periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } }).periodicSync
        if (!mgr) return
        const status = await navigator.permissions.query({
          name: 'periodic-background-sync' as PermissionName,
        })
        if (status.state !== 'granted') return
        await mgr.register('mp-catalog-prefetch', {
          minInterval: 12 * 60 * 60 * 1000, // 12 hours
        })
      } catch {
        // Not supported or permission denied — ignore.
      }
    }

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          watchRegistration(registration)
          requestPeriodicSync(registration)
        })
        .catch((err) => {
          // Swallow — SW registration failure must never break the app.
          // Lighthouse will still flag it, which is what we want.
          console.warn('[pwa] service worker registration failed', err)
        })
    }

    // Defer until after load so we don't compete with hydration / critical
    // requests on the first paint.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    const onControllerChange = () => {
      if (reloadedForUpdate) return
      reloadedForUpdate = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const onBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome's mini-infobar so we can decide when to prompt.
      e.preventDefault()
      // Stash the event on window so an install button elsewhere can call
      // `event.prompt()` later. Typed as `unknown` to avoid leaking a
      // non-standard global type into the app.
      ;(window as unknown as { __pwaInstallPrompt?: Event }).__pwaInstallPrompt = e
      window.dispatchEvent(new CustomEvent('pwa:installable'))
      trackPwaEvent('pwa_installable')
    }

    const onAppInstalled = () => {
      ;(window as unknown as { __pwaInstallPrompt?: Event }).__pwaInstallPrompt = undefined
      window.dispatchEvent(new CustomEvent('pwa:installed'))
      trackPwaEvent('pwa_installed')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange
      )
    }
  }, [])

  return null
}
