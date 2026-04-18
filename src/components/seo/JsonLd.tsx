import { createHash } from 'node:crypto'
import Script from 'next/script'

export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const id = `jsonld-${createHash('sha1').update(json).digest('hex')}`

  return (
    <Script id={id} type="application/ld+json" strategy="afterInteractive">
      {json}
    </Script>
  )
}
