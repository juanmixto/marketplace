'use client'

import { useState } from 'react'

/**
 * Floating pill in the bottom-left corner that shows the running build
 * identity (commit SHA + build time + branch). Click to expand for the
 * full timestamp and branch name. Click again to collapse.
 *
 * Visibility rules:
 *  - Hidden by default in production (it's noise for buyers who would
 *    wonder what `56592652` means and erodes trust on the storefront).
 *  - Visible in dev / staging / unset APP_ENV (useful for agents +
 *    on-call to verify what's running).
 *  - NEXT_PUBLIC_HIDE_BUILD_BADGE=true forces hide everywhere (e.g. for
 *    a clean screenshot in dev).
 *  - NEXT_PUBLIC_SHOW_BUILD_BADGE=true forces show in production (e.g.
 *    to debug "what version is serving this request?" during an incident).
 */
export function BuildBadge() {
  const [expanded, setExpanded] = useState(false)

  if (process.env.NEXT_PUBLIC_HIDE_BUILD_BADGE === 'true') return null
  if (
    process.env.NEXT_PUBLIC_APP_ENV === 'production' &&
    process.env.NEXT_PUBLIC_SHOW_BUILD_BADGE !== 'true'
  ) {
    return null
  }

  const sha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev'
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? null
  const branch = process.env.NEXT_PUBLIC_GIT_BRANCH ?? null

  const shortTime = buildTime
    ? new Date(buildTime).toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      aria-label={`Versión ${sha}${branch ? ` en ${branch}` : ''}`}
      className="fixed bottom-12 left-2 z-50 select-none rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-mono leading-none text-white/75 shadow-sm backdrop-blur-sm transition hover:bg-black/75 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
    >
      {expanded ? (
        <span className="flex flex-col items-end gap-0.5 text-right">
          <span>{sha}</span>
          {branch && <span className="opacity-70">{branch}</span>}
          {buildTime && (
            <span className="opacity-70">
              {new Date(buildTime).toLocaleString('es-ES', {
                timeZone: 'Europe/Madrid',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </span>
      ) : (
        <span>
          {sha}
          {shortTime && <span className="opacity-60"> · {shortTime}</span>}
        </span>
      )}
    </button>
  )
}
