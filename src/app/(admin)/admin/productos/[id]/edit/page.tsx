import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireCatalogAdmin } from '@/lib/auth-guard'
import { getCategories } from '@/domains/catalog/queries'
import { AdminProductEditForm } from '@/components/admin/AdminProductEditForm'
import { ProductIngestionOriginCard } from '@/components/admin/ProductIngestionOriginCard'

export const metadata: Metadata = { title: 'Editar producto | Admin' }
export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function AdminProductEditPage({ params }: Props) {
  await requireCatalogAdmin()
  const { id } = await params

  const [product, categories] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            id: true,
            displayName: true,
            status: true,
            stripeOnboarded: true,
            claimCode: true,
            claimCodeExpiresAt: true,
          },
        },
      },
    }),
    getCategories(),
  ])

  if (!product) notFound()

  // Resolve the reviewItemId so the origin card can deep-link to the
  // admin ingestion detail. One targeted lookup by the
  // (kind, targetId) unique — no join on Product needed.
  let reviewItemId: string | null = null
  let telegramLink: {
    messageUrl: string | null
    profileUrl: string
    authorDisplayName: string | null
  } | null = null
  if (product.sourceIngestionDraftId) {
    const item = await db.ingestionReviewQueueItem.findUnique({
      where: {
        kind_targetId: {
          kind: 'PRODUCT_DRAFT',
          targetId: product.sourceIngestionDraftId,
        },
      },
      select: { id: true },
    })
    reviewItemId = item?.id ?? null

    // Resolve the original Telegram message + author handles so the
    // admin can jump straight into Telegram to talk to the producer.
    // The supergroup URL `https://t.me/c/{chatId}/{messageId}` lands
    // on the exact message; from there Telegram's native UX opens a
    // DM with the author in one tap.
    if (product.sourceTelegramMessageId) {
      const message = await db.telegramIngestionMessage.findUnique({
        where: { id: product.sourceTelegramMessageId },
        select: {
          tgMessageId: true,
          tgAuthorId: true,
          rawJson: true,
          chat: { select: { tgChatId: true } },
        },
      })
      if (message) {
        // Supergroup ids come as -100xxxxxxxxxx; the web URL format
        // needs the id without the -100 prefix.
        const rawChatId = message.chat.tgChatId.toString()
        const chatSlug = rawChatId.startsWith('-100') ? rawChatId.slice(4) : rawChatId.replace(/^-/, '')
        const messageUrl = chatSlug
          ? `https://t.me/c/${chatSlug}/${message.tgMessageId.toString()}`
          : null
        const profileUrl = message.tgAuthorId
          ? `tg://user?id=${message.tgAuthorId.toString()}`
          : 'tg://'
        const raw = message.rawJson as Record<string, unknown> | null
        const authorDisplayName =
          raw && typeof raw.authorDisplayName === 'string'
            ? (raw.authorDisplayName as string)
            : null
        telegramLink = { messageUrl, profileUrl, authorDisplayName }
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/productos" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Volver al listado
        </Link>
        <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">Catálogo · Edición admin</p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{product.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Productor: <span className="font-medium text-[var(--foreground)]">{product.vendor.displayName}</span>
        </p>
      </div>

      {product.sourceIngestionDraftId && (
        <ProductIngestionOriginCard
          draftId={product.sourceIngestionDraftId}
          sourceMessageId={product.sourceTelegramMessageId}
          reviewItemId={reviewItemId}
          vendor={{
            status: product.vendor.status,
            stripeOnboarded: product.vendor.stripeOnboarded,
            claimCode: product.vendor.claimCode,
            claimCodeExpiresAt: product.vendor.claimCodeExpiresAt,
          }}
          telegramLink={telegramLink}
        />
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <AdminProductEditForm
          categories={categories.map(c => ({ id: c.id, name: c.name }))}
          product={{
            id: product.id,
            name: product.name,
            description: product.description,
            categoryId: product.categoryId,
            basePrice: Number(product.basePrice),
            compareAtPrice: product.compareAtPrice == null ? null : Number(product.compareAtPrice),
            taxRate: Number(product.taxRate),
            unit: product.unit,
            stock: product.stock,
            trackStock: product.trackStock,
            status: product.status,
            originRegion: product.originRegion,
            rejectionNote: product.rejectionNote,
            expiresAt: product.expiresAt ? product.expiresAt.toISOString().slice(0, 10) : null,
          }}
        />
      </div>
    </div>
  )
}
