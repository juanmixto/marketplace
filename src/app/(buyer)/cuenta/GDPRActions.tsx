'use client'

/**
 * GDPR Actions Client Component
 * Export and delete data functionality
 */

import { useState } from 'react'
import { ArrowDownTrayIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import { useT } from '@/i18n'

export function GDPRActions() {
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const router = useRouter()
  const t = useT()

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/account/export')
      if (!res.ok) throw new Error('Error en descarga')

      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mis-datos-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Error al exportar datos')
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    if (deleteInput !== t('account.confirmWord')) {
      alert(t('account.typeToConfirm'))
      return
    }

    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string }
        if (res.status === 401 && data.code === 'invalid_password') {
          setDeleteError(t('account.deleteInvalidPassword'))
        } else if (res.status === 400 && data.code === 'password_required') {
          setDeleteError(t('account.deletePasswordRequired'))
        } else {
          setDeleteError(t('account.deleteError'))
        }
        setDeleting(false)
        return
      }

      await res.json()
      setTimeout(() => router.push('/login?deleted=1'), 1000)
    } catch {
      setDeleteError(t('account.deleteError'))
      setDeleting(false)
    }
  }

  if (showDeleteConfirm) {
    return (
      <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
        <div>
          <h3 className="font-semibold text-red-900 dark:text-red-100">{t('account.deleteConfirmTitle')}</h3>
          <p className="text-sm text-red-800 dark:text-red-200 mt-2">
            {t('account.deleteIrreversible')}
          </p>
          <p className="text-sm text-red-800 dark:text-red-200 mt-2">
            {t('account.typeToConfirm')}
          </p>
        </div>

        <input
          type="text"
          placeholder={t('account.confirmWordPlaceholder')}
          value={deleteInput}
          onChange={(e) => setDeleteInput(e.target.value.toUpperCase())}
          className="w-full rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm dark:border-red-700 dark:bg-red-900/30 dark:text-white"
        />

        <input
          type="password"
          autoComplete="current-password"
          placeholder={t('account.deletePasswordPlaceholder')}
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          className="w-full rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm dark:border-red-700 dark:bg-red-900/30 dark:text-white"
        />

        {deleteError && (
          <p role="alert" className="text-sm text-red-900 dark:text-red-200">
            {deleteError}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowDeleteConfirm(false)
              setDeleteInput('')
              setDeletePassword('')
              setDeleteError(null)
            }}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || deleteInput !== t('account.confirmWord') || !deletePassword}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
          >
            {deleting ? t('account.deleting') : t('account.confirmDeleteBtn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm font-medium text-green-900 hover:bg-green-100 disabled:opacity-50 dark:border-green-800 dark:bg-green-950/20 dark:text-green-200 dark:hover:bg-green-950/30"
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
        {exporting ? t('account.downloading') : t('account.exportData')}
      </button>

      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200 dark:hover:bg-red-950/30"
      >
        <TrashIcon className="h-4 w-4" />
        {t('account.deleteAccount')}
      </button>

      <Link
        href="/privacidad"
        className="block text-center text-xs text-gray-600 hover:text-gray-900 underline dark:text-gray-400 dark:hover:text-gray-200"
      >
        {t('account.privacyPolicy')}
      </Link>
    </div>
  )
}

import Link from 'next/link'
