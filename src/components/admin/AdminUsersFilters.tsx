'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ADMIN_USERS_EMAIL_VERIFICATION_LABELS,
  ADMIN_USERS_EMAIL_VERIFICATION_OPTIONS,
  ADMIN_USERS_ROLE_LABELS,
  ADMIN_USERS_ROLE_OPTIONS,
  ADMIN_USERS_STATE_LABELS,
  ADMIN_USERS_STATE_OPTIONS,
  ADMIN_USERS_VENDOR_LABELS,
  ADMIN_USERS_VENDOR_OPTIONS,
} from '@/domains/admin/users/navigation'
import type {
  AdminUsersEmailVerificationFilter,
  AdminUsersListStateFilter,
  AdminUsersRoleFilter,
  AdminUsersVendorFilter,
} from '@/domains/admin/users/navigation'
import { buildAdminUsersListHref } from '@/domains/admin/users/navigation'

interface Props {
  q?: string
  role: AdminUsersRoleFilter
  state: AdminUsersListStateFilter
  vendor: AdminUsersVendorFilter
  emailVerification: AdminUsersEmailVerificationFilter
}

const DEBOUNCE_MS = 300

export function AdminUsersFilters({ q, role, state, vendor, emailVerification }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState(q ?? '')
  const [roleValue, setRoleValue] = useState<AdminUsersRoleFilter>(role)
  const [stateValue, setStateValue] = useState<AdminUsersListStateFilter>(state)
  const [vendorValue, setVendorValue] = useState<AdminUsersVendorFilter>(vendor)
  const [emailVerificationValue, setEmailVerificationValue] =
    useState<AdminUsersEmailVerificationFilter>(emailVerification)

  useEffect(() => {
    setQuery(q ?? '')
    setRoleValue(role)
    setStateValue(state)
    setVendorValue(vendor)
    setEmailVerificationValue(emailVerification)
  }, [emailVerification, q, role, state, vendor])

  const href = useMemo(
    () =>
      buildAdminUsersListHref(
        {
          q: query || undefined,
          role: roleValue,
          state: stateValue,
          vendor: vendorValue,
          emailVerification: emailVerificationValue,
        },
        1
      ),
    [emailVerificationValue, query, roleValue, stateValue, vendorValue]
  )

  useEffect(() => {
    if (
      query === (q ?? '') &&
      roleValue === role &&
      stateValue === state &&
      vendorValue === vendor &&
      emailVerificationValue === emailVerification
    ) {
      return
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(href, { scroll: false })
      })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [
    emailVerification,
    emailVerificationValue,
    href,
    q,
    query,
    role,
    roleValue,
    router,
    state,
    stateValue,
    startTransition,
    vendor,
    vendorValue,
  ])

  const clearFilters = () => {
    setQuery('')
    setRoleValue('all')
    setStateValue('all')
    setVendorValue('all')
    setEmailVerificationValue('all')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.85fr))_auto] lg:items-end">
        <Input
          name="q"
          label="Search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Email, name, producer, or ID"
        />
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Role</span>
          <select
            name="role"
            value={roleValue}
            onChange={e => setRoleValue(e.target.value as AdminUsersRoleFilter)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {ADMIN_USERS_ROLE_OPTIONS.map(option => (
              <option key={option} value={option}>
                {ADMIN_USERS_ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Status</span>
          <select
            name="state"
            value={stateValue}
            onChange={e => setStateValue(e.target.value as AdminUsersListStateFilter)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {ADMIN_USERS_STATE_OPTIONS.map(option => (
              <option key={option} value={option}>
                {ADMIN_USERS_STATE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Producer</span>
          <select
            name="vendor"
            value={vendorValue}
            onChange={e => setVendorValue(e.target.value as AdminUsersVendorFilter)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {ADMIN_USERS_VENDOR_OPTIONS.map(option => (
              <option key={option} value={option}>
                {ADMIN_USERS_VENDOR_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--foreground-soft)]">Email verification</span>
          <select
            name="emailVerification"
            value={emailVerificationValue}
            onChange={e => setEmailVerificationValue(e.target.value as AdminUsersEmailVerificationFilter)}
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            {ADMIN_USERS_EMAIL_VERIFICATION_OPTIONS.map(option => (
              <option key={option} value={option}>
                {ADMIN_USERS_EMAIL_VERIFICATION_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" size="md" onClick={clearFilters} disabled={isPending}>
          <ArrowPathIcon className="h-4 w-4" />
          Clear
        </Button>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Filters apply automatically as you type or change options. The result updates without reloading the whole page.
      </p>
    </div>
  )
}
