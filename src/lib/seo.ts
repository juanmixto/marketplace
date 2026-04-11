import type { Metadata } from 'next'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/constants'

export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
export const SITE_METADATA_BASE = new URL(SITE_URL)

export interface PageMetadataInput {
  title: string
  description: string
  path: string
  noindex?: boolean
  imagePath?: string
  type?: 'website' | 'article'
}

export function absoluteUrl(path: string) {
  return new URL(path, SITE_METADATA_BASE).toString()
}

export function buildPageMetadata({
  title,
  description,
  path,
  noindex = false,
  imagePath = '/opengraph-image',
  type = 'website',
}: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    robots: noindex
      ? { index: false, follow: false, nocache: true }
      : undefined,
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type,
      images: [
        {
          url: imagePath,
          width: 1200,
          height: 630,
          alt: `${title} | ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imagePath],
    },
  }
}

export const defaultSiteMetadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  metadataBase: SITE_METADATA_BASE,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    type: 'website' as const,
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ['/twitter-image'],
  },
}
