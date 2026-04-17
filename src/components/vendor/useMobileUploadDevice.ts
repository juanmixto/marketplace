'use client'

import { useEffect, useState } from 'react'

const MOBILE_UPLOAD_UA =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i

interface MobileUploadDetectionInput {
  userAgent: string
  hasCoarsePointer: boolean
  viewportWidth: number
}

export function detectMobileUploadDevice({
  userAgent,
  hasCoarsePointer,
  viewportWidth,
}: MobileUploadDetectionInput) {
  const matchesHandheldUserAgent = MOBILE_UPLOAD_UA.test(userAgent)
  const isTabletOrPhoneWidth = viewportWidth <= 1024

  return matchesHandheldUserAgent || (hasCoarsePointer && isTabletOrPhoneWidth)
}

function readMobileUploadDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  return detectMobileUploadDevice({
    userAgent: navigator.userAgent,
    hasCoarsePointer: window.matchMedia('(pointer: coarse)').matches,
    viewportWidth: window.innerWidth,
  })
}

export function useMobileUploadDevice() {
  const [isMobileUploadDevice, setIsMobileUploadDevice] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse), (max-width: 1024px)')
    const update = () => setIsMobileUploadDevice(readMobileUploadDevice())

    update()
    mediaQuery.addEventListener('change', update)

    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  return isMobileUploadDevice
}
