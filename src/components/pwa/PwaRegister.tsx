'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker and captures the `beforeinstallprompt` event
 * so UI elsewhere can trigger the install prompt later.
 *
 * Keep this component tiny and side-effect-only: it must not render any DOM
 * and must never break SSR — all browser APIs are touched inside useEffect.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
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
    }
  }, [])

  return null
}
