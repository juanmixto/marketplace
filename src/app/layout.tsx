import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/constants'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  )
}
