'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  searchMunicipalities,
  type Municipality,
} from '@/domains/shipping/municipalities'

interface Props {
  label: string
  /** Current text in the input (locality name). */
  value: string
  /** Province name or 2-digit prefix. Filters suggestions. */
  province?: string
  /** Fired on every keystroke (free-typed text). */
  onChangeText: (value: string) => void
  /** Fired when the user picks a suggestion (click or Enter). */
  onSelect: (municipality: Municipality) => void
  error?: string
  hint?: string
  placeholder?: string
  required?: boolean
  /** Delay before firing the search, in ms. Default 250. */
  debounceMs?: number
  /** Max suggestions rendered. Default 8. */
  limit?: number
}

const DEFAULT_DEBOUNCE_MS = 250

export function LocationAutocomplete({
  label,
  value,
  province,
  onChangeText,
  onSelect,
  error,
  hint,
  placeholder,
  required,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  limit = 8,
}: Props) {
  const listboxId = useId()
  const inputId = useId()
  const [suggestions, setSuggestions] = useState<Municipality[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const queryRef = useRef(value)

  queryRef.current = value

  // Debounced search whenever value or province changes.
  useEffect(() => {
    if (!open) return
    const query = value.trim()
    // At least 2 chars before we bother — keeps initial focus quiet.
    if (query.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = window.setTimeout(() => {
      let cancelled = false
      searchMunicipalities({ query, province, limit })
        .then(results => {
          if (cancelled) return
          // Only apply if the query hasn't moved on.
          if (queryRef.current.trim() === query) {
            setSuggestions(results)
            setActiveIndex(results.length > 0 ? 0 : -1)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }, debounceMs)
    return () => window.clearTimeout(handle)
  }, [value, province, open, debounceMs, limit])

  // Close on outside click.
  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handlePointer)
    return () => window.removeEventListener('mousedown', handlePointer)
  }, [])

  function commit(index: number) {
    const choice = suggestions[index]
    if (!choice) return
    onSelect(choice)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      setActiveIndex(prev =>
        suggestions.length === 0 ? -1 : (prev + 1) % suggestions.length,
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(prev =>
        suggestions.length === 0
          ? -1
          : (prev - 1 + suggestions.length) % suggestions.length,
      )
    } else if (event.key === 'Enter') {
      if (open && activeIndex >= 0) {
        event.preventDefault()
        commit(activeIndex)
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
    }
  }

  const hasOpen = open && (loading || suggestions.length > 0)
  const showEmpty =
    open && !loading && suggestions.length === 0 && value.trim().length >= 2

  const activeId = useMemo(
    () => (activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined),
    [activeIndex, listboxId],
  )

  return (
    <div className="space-y-1.5 min-w-0" ref={containerRef}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-[var(--foreground-soft)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={hasOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          required={required}
          value={value}
          placeholder={placeholder}
          onChange={e => {
            onChangeText(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm transition-colors',
            'border-[var(--border)] placeholder:text-[var(--muted-light)]',
            'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
            'dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20',
            error &&
              'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-400 dark:focus:border-red-300 dark:focus:ring-red-400/25',
          )}
          aria-invalid={error ? 'true' : undefined}
        />
        {hasOpen && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-lg"
          >
            {loading && (
              <li
                className="px-3 py-2 text-xs text-[var(--muted)]"
                aria-live="polite"
              >
                Buscando…
              </li>
            )}
            {!loading &&
              suggestions.map((m, idx) => (
                <li
                  key={`${m.prefix}-${m.name}`}
                  id={`${listboxId}-opt-${idx}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  onMouseDown={event => {
                    event.preventDefault()
                    commit(idx)
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-[var(--foreground)]',
                    idx === activeIndex && 'bg-emerald-50 dark:bg-emerald-950/40',
                  )}
                >
                  <span className="font-medium">{m.name}</span>
                  {m.postalCodes.length > 0 && (
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      {m.postalCodes.length === 1
                        ? m.postalCodes[0]
                        : `${m.postalCodes[0]}… +${m.postalCodes.length - 1}`}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        )}
        {showEmpty && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)] shadow-lg">
            Sin coincidencias — puedes escribir la localidad a mano.
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-300">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  )
}
