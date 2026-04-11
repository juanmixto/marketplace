'use client'

import { getImageValidationError } from '@/lib/image-validation'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ImageValidationErrorsProps {
  invalidUrls: string[]
}

export function ImageValidationErrors({ invalidUrls }: ImageValidationErrorsProps) {
  if (invalidUrls.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            {invalidUrls.length} URL{invalidUrls.length !== 1 ? 's' : ''} con problema{invalidUrls.length !== 1 ? 's' : ''}
          </p>
          <ul className="mt-2.5 space-y-2 text-sm">
            {invalidUrls.slice(0, 5).map((url, idx) => (
              <li key={idx} className="flex flex-col gap-1">
                <code className="break-all rounded bg-amber-100/50 px-2 py-1 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-mono">
                  {url.length > 60 ? url.substring(0, 57) + '...' : url}
                </code>
                <span className="text-xs text-amber-700 dark:text-amber-300/80 flex items-center gap-1">
                  <span>→</span>
                  {getImageValidationError(url)}
                </span>
              </li>
            ))}
            {invalidUrls.length > 5 && (
              <li className="text-xs text-amber-600 dark:text-amber-400/70 pt-1 border-t border-amber-200 dark:border-amber-900/40">
                +{invalidUrls.length - 5} más...
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
