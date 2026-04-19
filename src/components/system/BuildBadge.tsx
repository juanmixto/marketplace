'use client'

import { useState } from 'react'

/**
 * Floating pill in the bottom-right corner that shows the running build
 * identity (commit SHA + build time + branch). Click to expand for the
 * full timestamp and branch name. Click again to collapse.
 *
 * Visible to everyone — same surface area as /api/version, no secrets.
 * Hide with NEXT_PUBLIC_HIDE_BUILD_BADGE=true if you want it off in prod.
 */
export function BuildBadge() {
  const [expanded, setExpanded] = useState(false)

  if (process.env.NEXT_PUBLIC_HIDE_BUILD_BADGE === 'true') return null

  const sha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev'
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? null
  const branch = process.env.NEXT_PUBLIC_GIT_BRANCH ?? null

  const shortTime = buildTime
    ? new Date(buildTime).toLocaleString(undefined, {
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
      className="fixed bottom-2 right-2 z-50 select-none rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-mono leading-none text-white/75 shadow-sm backdrop-blur-sm transition hover:bg-black/75 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
    >
      {expanded ? (
        <span className="flex flex-col items-end gap-0.5 text-right">
          <span>{sha}</span>
          {branch && <span className="opacity-70">{branch}</span>}
          {buildTime && <span className="opacity-70">{new Date(buildTime).toISOString().slice(0, 16).replace('T', ' ')}</span>}
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
