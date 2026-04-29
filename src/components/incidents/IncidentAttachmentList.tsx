import Image from 'next/image'

interface Props {
  attachments: string[]
  /**
   * Used as a fallback alt for screen readers; the index is appended.
   * Defaults to "Attachment" because the buyer pages already render in
   * a translated context so the parent supplies the localized prefix.
   */
  altPrefix?: string
}

/**
 * Read-only grid of attachment thumbnails. The thumbnails link out to
 * the full-size image so a buyer can pinch-zoom on mobile and an admin
 * can open it in a new tab on desktop. Kept deliberately tiny — the
 * write-side picker (IncidentAttachmentPicker) handles upload UX.
 */
export function IncidentAttachmentList({ attachments, altPrefix = 'Attachment' }: Props) {
  if (attachments.length === 0) return null
  return (
    <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
      {attachments.map((url, index) => (
        <li key={url} className="relative aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          >
            <Image
              src={url}
              alt={`${altPrefix} ${index + 1}`}
              fill
              sizes="(max-width: 640px) 33vw, 25vw"
              className="object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  )
}
