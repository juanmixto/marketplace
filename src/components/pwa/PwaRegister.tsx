'use client'

import { useEffect } from 'react'

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

    // Track whether a controllerchange reload has already fired so we
    // never reload twice in a row from a single SKIP_WAITING round-trip.
    let reloadedForUpdate = false

    const notifyUpdate = (registration: ServiceWorkerRegistration) => {
      ;(
        window as unknown as { __pwaWaitingRegistration?: ServiceWorkerRegistration }
      ).__pwaWaitingRegistration = registration
      window.dispatchEvent(new CustomEvent('pwa:updateready'))
    }

    const watchRegistration = (registration: ServiceWorkerRegistration) => {
      // If a new SW is already waiting by the time we register, surface it.
      if (registration.waiting && navigator.serviceWorker.controller) {
        notifyUpdate(registration)
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // An existing controller means this is an upgrade, not a
            // first install — time to offer the update to the user.
            notifyUpdate(registration)
          }
        })
      })
    }

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          watchRegistration(registration)
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
    }

    const onAppInstalled = () => {
      ;(window as unknown as { __pwaInstallPrompt?: Event }).__pwaInstallPrompt = undefined
      window.dispatchEvent(new CustomEvent('pwa:installed'))
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange
      )
    }
  }, [])

  return null
}
