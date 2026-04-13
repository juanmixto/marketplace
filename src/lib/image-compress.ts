/**
 * Client-side image compression for uploads.
 *
 * Resizes + re-encodes images in the browser before they hit /api/upload,
 * so users can drop a 20 MB phone photo and still end up under the server's
 * 5 MB cap. Pick a preset based on how the image will be displayed:
 *
 *   - `product`: shown large (zoom, detail views) → keep more detail
 *   - `cover`:   banner-sized backgrounds         → medium fidelity
 *   - `avatar`:  small circular crops             → aggressive shrink
 *
 * Non-image files and already-small images pass through untouched. All
 * output is JPEG (broadest tooling support + best size for photos).
 */

export interface CompressPreset {
  /** Max dimension of the longest side in CSS pixels. */
  maxDimension: number
  /** Initial JPEG quality (0..1). Ratcheted down if still over target. */
  quality: number
  /** Aim for this byte size; shrink quality further until we're under it. */
  targetBytes: number
}

export const COMPRESS_PRESETS = {
  product: { maxDimension: 2048, quality: 0.85, targetBytes: 2_500_000 },
  cover: { maxDimension: 1920, quality: 0.8, targetBytes: 1_500_000 },
  avatar: { maxDimension: 512, quality: 0.82, targetBytes: 400_000 },
} as const satisfies Record<string, CompressPreset>

export type PresetName = keyof typeof COMPRESS_PRESETS

const SERVER_MAX_BYTES = 5 * 1024 * 1024
const COMPRESSIBLE = /^image\/(jpeg|png|webp)$/

export async function compressImage(
  file: File,
  preset: CompressPreset | PresetName,
): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!COMPRESSIBLE.test(file.type)) return file

  const cfg = typeof preset === 'string' ? COMPRESS_PRESETS[preset] : preset

  let drawable: Drawable
  try {
    drawable = await loadDrawable(file)
  } catch {
    return file
  }

  try {
    const { width, height } = fitWithin(drawable.width, drawable.height, cfg.maxDimension)

    if (
      drawable.width <= cfg.maxDimension &&
      drawable.height <= cfg.maxDimension &&
      file.size <= cfg.targetBytes
    ) {
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(drawable, 0, 0, width, height)

    let quality = cfg.quality
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    while (blob && blob.size > cfg.targetBytes && quality > 0.5) {
      quality = Math.round((quality - 0.1) * 100) / 100
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    }
    while (blob && blob.size > SERVER_MAX_BYTES && quality > 0.3) {
      quality = Math.round((quality - 0.1) * 100) / 100
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    }
    if (!blob) return file
    if (blob.size >= file.size) return file

    const newName = file.name.replace(/\.(png|webp|jpg|jpeg)$/i, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    if (typeof ImageBitmap !== 'undefined' && drawable instanceof ImageBitmap) {
      drawable.close()
    }
  }
}

type Drawable = CanvasImageSource & { width: number; height: number }

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h }
  const ratio = w >= h ? max / w : max / h
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}

async function loadDrawable(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through to HTMLImageElement
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image-decode-failed'))
      el.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), type, quality))
}
