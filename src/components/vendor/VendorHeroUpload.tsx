'use client'

import { useRef, useState } from 'react'
import {
  CameraIcon,
  PhotoIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import { isAllowedImageUrl } from '@/lib/image-validation'
import {
  formatBytes,
  IMAGE_INPUT_ACCEPT,
  ImageCompressionError,
  isSupportedImageInputType,
  prepareImageForUpload,
} from '@/lib/image-compress'
import { useT } from '@/i18n'
import { useMobileUploadDevice } from '@/components/vendor/useMobileUploadDevice'

const MAX_BYTES = 5 * 1024 * 1024

type Slot = 'cover' | 'logo'

interface Props {
  coverLabel: string
  logoLabel: string
  coverValue: string
  logoValue: string
  onCoverChange: (url: string) => void
  onLogoChange: (url: string) => void
}

export function VendorHeroUpload({
  coverLabel,
  logoLabel,
  coverValue,
  logoValue,
  onCoverChange,
  onLogoChange,
}: Props) {
  const t = useT()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const coverCameraInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const logoCameraInputRef = useRef<HTMLInputElement>(null)
  const [coverUploading, setCoverUploading] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadHint, setUploadHint] = useState<string | null>(null)
  const [showUrls, setShowUrls] = useState(false)
  const [coverUrlDraft, setCoverUrlDraft] = useState(coverValue)
  const [logoUrlDraft, setLogoUrlDraft] = useState(logoValue)
  const isMobileUploadDevice = useMobileUploadDevice()

  const hasCover = coverValue !== '' && isAllowedImageUrl(coverValue)
  const hasLogo = logoValue !== '' && isAllowedImageUrl(logoValue)

  async function upload(rawFile: File, slot: Slot) {
    setError(null)
    setUploadHint(null)
    if (!isSupportedImageInputType(rawFile.type)) {
      setError(t('vendor.heroUpload.unsupported'))
      return
    }
    const setUploading = slot === 'cover' ? setCoverUploading : setLogoUploading
    setUploading(true)
    try {
      const prepared = await prepareImageForUpload(rawFile, slot === 'cover' ? 'cover' : 'avatar')
      const file = prepared.file
      if (prepared.compressedSize > MAX_BYTES) {
        setError(t('vendor.heroUpload.tooLarge'))
        return
      }
      setUploadHint(
        t('vendor.heroUpload.optimizedSummary')
          .replace('{from}', formatBytes(prepared.originalSize))
          .replace('{to}', formatBytes(prepared.compressedSize))
      )
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? t('vendor.heroUpload.uploadError'))
      }
      const data = (await res.json()) as { url: string }
      if (slot === 'cover') {
        onCoverChange(data.url)
        setCoverUrlDraft(data.url)
      } else {
        onLogoChange(data.url)
        setLogoUrlDraft(data.url)
      }
    } catch (err) {
      if (err instanceof ImageCompressionError) {
        const translationKey =
          err.code === 'heic-not-supported'
            ? 'vendor.heroUpload.heicUnsupported'
            : err.code === 'file-too-large'
              ? 'vendor.heroUpload.tooLarge'
              : 'vendor.heroUpload.unsupported'
        setError(t(translationKey))
      } else {
        setError(err instanceof Error ? err.message : t('vendor.heroUpload.uploadError'))
      }
    } finally {
      setUploading(false)
    }
  }

  function commitUrl(slot: Slot) {
    const draft = slot === 'cover' ? coverUrlDraft : logoUrlDraft
    const current = slot === 'cover' ? coverValue : logoValue
    const apply = slot === 'cover' ? onCoverChange : onLogoChange
    const trimmed = draft.trim()
    if (trimmed === current) return
    if (trimmed === '') {
      apply('')
      return
    }
    if (!isAllowedImageUrl(trimmed)) {
      setError(t('vendor.heroUpload.urlNotAllowed'))
      return
    }
    setError(null)
    apply(trimmed)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--foreground)]">
          {coverLabel} · {logoLabel}
        </span>
        <button
          type="button"
          onClick={() => setShowUrls(v => !v)}
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          <LinkIcon className="h-3.5 w-3.5" />
          {showUrls ? t('vendor.heroUpload.toggleUrlsHide') : t('vendor.heroUpload.toggleUrls')}
        </button>
      </div>

      <div className="relative aspect-[16/5] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]">
        {/* Cover fills the frame */}
        <button
          type="button"
          onClick={() => !coverUploading && coverInputRef.current?.click()}
          aria-label={hasCover ? t('vendor.heroUpload.changeCover') : t('vendor.heroUpload.uploadCover')}
          className="group absolute inset-0 block cursor-pointer"
        >
          {hasCover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverValue} alt="" className="h-full w-full object-cover" />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100 group-focus-visible:bg-black/40 group-focus-visible:opacity-100">
                <span className="inline-flex items-center gap-1.5">
                  <CameraIcon className="h-4 w-4" />
                  {t('vendor.heroUpload.changeCover')}
                </span>
              </span>
            </>
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--muted)]">
              <PhotoIcon className="h-6 w-6" />
              <span className="text-xs font-medium">{t('vendor.heroUpload.uploadCover')}</span>
            </span>
          )}
          {coverUploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </span>
          )}
        </button>

        {/* Remove cover (floating) */}
        {hasCover && !coverUploading && (
          <button
            type="button"
            onClick={() => {
              onCoverChange('')
              setCoverUrlDraft('')
            }}
            aria-label={t('vendor.heroUpload.removeCover')}
            className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition hover:bg-black/75 group-hover:opacity-100 focus:opacity-100"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}

        {/* Avatar overlay, sibling of cover (not nested) */}
        <div className="absolute bottom-3 left-4 z-10">
          <button
            type="button"
            onClick={() => !logoUploading && logoInputRef.current?.click()}
            aria-label={hasLogo ? t('vendor.heroUpload.changeLogo') : t('vendor.heroUpload.uploadLogo')}
            className="group relative block h-16 w-16 overflow-hidden rounded-full border-2 border-[var(--surface)] bg-[var(--surface)] shadow-lg ring-1 ring-black/10 sm:h-20 sm:w-20"
          >
            {hasLogo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoValue} alt="" className="h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100">
                  <CameraIcon className="h-5 w-5 text-white" />
                </span>
              </>
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[var(--surface-raised)] text-[var(--muted)]">
                <CameraIcon className="h-6 w-6" />
              </span>
            )}
            {logoUploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </span>
            )}
          </button>
          {hasLogo && !logoUploading && (
            <button
              type="button"
              onClick={() => {
                onLogoChange('')
                setLogoUrlDraft('')
              }}
              aria-label={t('vendor.heroUpload.removeLogo')}
              className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <input
        ref={coverInputRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void upload(f, 'cover')
          e.target.value = ''
        }}
      />
      <input
        ref={logoInputRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) void upload(f, 'logo')
          e.target.value = ''
        }}
      />
      {isMobileUploadDevice && (
        <>
          <input
            ref={coverCameraInputRef}
            type="file"
            accept={IMAGE_INPUT_ACCEPT}
            capture="environment"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void upload(f, 'cover')
              e.target.value = ''
            }}
          />
          <input
            ref={logoCameraInputRef}
            type="file"
            accept={IMAGE_INPUT_ACCEPT}
            capture="environment"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void upload(f, 'logo')
              e.target.value = ''
            }}
          />
        </>
      )}

      {isMobileUploadDevice && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {coverLabel}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] transition hover:border-emerald-300 dark:hover:border-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                {t('vendor.heroUpload.choosePhoto')}
              </button>
              <button
                type="button"
                onClick={() => coverCameraInputRef.current?.click()}
                disabled={coverUploading}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CameraIcon className="h-4 w-4" />
                {t('vendor.heroUpload.takePhoto')}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {logoLabel}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] transition hover:border-emerald-300 dark:hover:border-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                {t('vendor.heroUpload.choosePhoto')}
              </button>
              <button
                type="button"
                onClick={() => logoCameraInputRef.current?.click()}
                disabled={logoUploading}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CameraIcon className="h-4 w-4" />
                {t('vendor.heroUpload.takePhoto')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUrls && (
        <div className="space-y-2 pt-1">
          <input
            type="text"
            value={coverUrlDraft}
            onChange={e => setCoverUrlDraft(e.target.value)}
            onBlur={() => commitUrl('cover')}
            placeholder={`${coverLabel} — https://res.cloudinary.com/...`}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
          />
          <input
            type="text"
            value={logoUrlDraft}
            onChange={e => setLogoUrlDraft(e.target.value)}
            onBlur={() => commitUrl('logo')}
            placeholder={`${logoLabel} — https://res.cloudinary.com/...`}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
          />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {uploadHint && !error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {uploadHint}
        </div>
      )}
    </div>
  )
}
