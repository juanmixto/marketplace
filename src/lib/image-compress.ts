/**
 * Client-side image preparation for uploads.
 *
 * Resizes + re-encodes images in the browser before they hit /api/upload,
 * so users can select a large phone photo and still upload a lighter asset.
 * The pipeline also corrects JPEG EXIF orientation when the browser exposes
 * the raw pixels without rotating them for us.
 */

export interface CompressPreset {
  /** Max dimension of the longest side in CSS pixels. */
  maxDimension: number
  /** Initial output quality (0..1). Ratcheted down if still over target. */
  quality: number
  /** Aim for this byte size; shrink quality further until we're under it. */
  targetBytes: number
}

export const COMPRESS_PRESETS = {
  product: { maxDimension: 1600, quality: 0.82, targetBytes: 1_600_000 },
  cover: { maxDimension: 1600, quality: 0.8, targetBytes: 1_400_000 },
  avatar: { maxDimension: 512, quality: 0.82, targetBytes: 400_000 },
} as const satisfies Record<string, CompressPreset>

export type PresetName = keyof typeof COMPRESS_PRESETS

const SERVER_MAX_BYTES = 5 * 1024 * 1024
const JPEG_SOI = 0xffd8

export const IMAGE_INPUT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,image/heic-sequence,image/heif-sequence'

export class ImageCompressionError extends Error {
  constructor(
    public readonly code:
      | 'unsupported-type'
      | 'decode-failed'
      | 'heic-not-supported'
      | 'file-too-large',
    message: string,
  ) {
    super(message)
    this.name = 'ImageCompressionError'
  }
}

export interface PreparedImage {
  file: File
  originalSize: number
  compressedSize: number
  originalWidth: number
  originalHeight: number
  outputWidth: number
  outputHeight: number
  originalType: string
  outputType: string
  orientation: number
  usedCompression: boolean
}

export function isSupportedImageInputType(type: string | null | undefined): boolean {
  return typeof type === 'string' && /^(image\/(jpeg|png|webp|hei(c|f)(-sequence)?))$/i.test(type)
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}

export async function compressImage(
  file: File,
  preset: CompressPreset | PresetName,
): Promise<File> {
  const prepared = await prepareImageForUpload(file, preset)
  return prepared.file
}

export async function prepareImageForUpload(
  file: File,
  preset: CompressPreset | PresetName,
): Promise<PreparedImage> {
  if (typeof window === 'undefined') {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      originalWidth: 0,
      originalHeight: 0,
      outputWidth: 0,
      outputHeight: 0,
      originalType: file.type,
      outputType: file.type,
      orientation: 1,
      usedCompression: false,
    }
  }
  if (!isSupportedImageInputType(file.type)) {
    throw new ImageCompressionError('unsupported-type', 'unsupported-image-type')
  }

  const cfg = typeof preset === 'string' ? COMPRESS_PRESETS[preset] : preset
  const orientation = await readExifOrientation(file)
  const outputType = await chooseOutputType()

  let drawable: Drawable
  try {
    await yieldToMain()
    drawable = await loadDrawable(file)
  } catch {
    const code = /image\/hei(c|f)/i.test(file.type) ? 'heic-not-supported' : 'decode-failed'
    throw new ImageCompressionError(code, code)
  }

  try {
    const display = getOrientedDimensions(drawable.width, drawable.height, orientation)
    const { width, height } = fitWithin(display.width, display.height, cfg.maxDimension)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new ImageCompressionError('decode-failed', 'canvas-context-unavailable')
    }

    drawOrientedImage(ctx, drawable, orientation, canvas.width, canvas.height)

    let quality = cfg.quality
    await yieldToMain()
    let blob = await canvasToBlob(canvas, outputType, quality)
    while (blob && blob.size > cfg.targetBytes && quality > 0.5) {
      quality = Math.round((quality - 0.1) * 100) / 100
      await yieldToMain()
      blob = await canvasToBlob(canvas, outputType, quality)
    }
    while (blob && blob.size > SERVER_MAX_BYTES && quality > 0.3) {
      quality = Math.round((quality - 0.1) * 100) / 100
      await yieldToMain()
      blob = await canvasToBlob(canvas, outputType, quality)
    }
    if (!blob) {
      throw new ImageCompressionError('decode-failed', 'encode-failed')
    }
    if (blob.size > SERVER_MAX_BYTES) {
      throw new ImageCompressionError('file-too-large', 'compressed-file-too-large')
    }

    const outputExt = outputType === 'image/webp' ? '.webp' : '.jpg'
    const outputName = file.name.replace(/\.[^.]+$/i, '') + outputExt
    const compressedFile =
      blob.size >= file.size &&
      orientation === 1 &&
      drawable.width === width &&
      drawable.height === height &&
      file.type === outputType
        ? file
        : new File([blob], outputName, { type: outputType, lastModified: Date.now() })

    return {
      file: compressedFile,
      originalSize: file.size,
      compressedSize: compressedFile.size,
      originalWidth: display.width,
      originalHeight: display.height,
      outputWidth: width,
      outputHeight: height,
      originalType: file.type,
      outputType: compressedFile.type,
      orientation,
      usedCompression: compressedFile !== file,
    }
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
      return await createImageBitmap(file, { imageOrientation: 'none' })
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

function getOrientedDimensions(width: number, height: number, orientation: number) {
  if (orientation >= 5 && orientation <= 8) {
    return { width: height, height: width }
  }
  return { width, height }
}

function drawOrientedImage(
  ctx: CanvasRenderingContext2D,
  drawable: Drawable,
  orientation: number,
  canvasWidth: number,
  canvasHeight: number,
) {
  ctx.save()
  switch (orientation) {
    case 2:
      ctx.translate(canvasWidth, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(drawable, 0, 0, canvasWidth, canvasHeight)
      break
    case 3:
      ctx.translate(canvasWidth, canvasHeight)
      ctx.rotate(Math.PI)
      ctx.drawImage(drawable, 0, 0, canvasWidth, canvasHeight)
      break
    case 4:
      ctx.translate(0, canvasHeight)
      ctx.scale(1, -1)
      ctx.drawImage(drawable, 0, 0, canvasWidth, canvasHeight)
      break
    case 5:
      ctx.rotate(0.5 * Math.PI)
      ctx.scale(1, -1)
      ctx.drawImage(drawable, 0, -canvasWidth, canvasHeight, canvasWidth)
      break
    case 6:
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(0, -canvasWidth)
      ctx.drawImage(drawable, 0, 0, canvasHeight, canvasWidth)
      break
    case 7:
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(canvasHeight, -canvasWidth)
      ctx.scale(-1, 1)
      ctx.drawImage(drawable, 0, 0, canvasHeight, canvasWidth)
      break
    case 8:
      ctx.rotate(-0.5 * Math.PI)
      ctx.translate(-canvasHeight, 0)
      ctx.drawImage(drawable, 0, 0, canvasHeight, canvasWidth)
      break
    default:
      ctx.drawImage(drawable, 0, 0, canvasWidth, canvasHeight)
      break
  }
  ctx.restore()
}

async function chooseOutputType() {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const webp = await canvasToBlob(canvas, 'image/webp', 0.8)
  if (webp?.type === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}

async function yieldToMain() {
  await new Promise<void>(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

async function readExifOrientation(file: File): Promise<number> {
  if (!/^image\/jpeg$/i.test(file.type)) return 1
  const bytes = new Uint8Array(await file.arrayBuffer())
  return extractExifOrientation(bytes)
}

export function extractExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4) return 1
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(0) !== JPEG_SOI) return 1

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    offset += 2

    if (marker === 0xffda || marker === 0xffd9) break
    if ((marker & 0xff00) !== 0xff00) break

    const segmentLength = view.getUint16(offset)
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break

    if (marker === 0xffe1 && segmentLength >= 10) {
      const tiffStart = offset + 8
      if (
        view.getUint32(offset + 2) === 0x45786966 &&
        view.getUint16(offset + 6) === 0x0000 &&
        tiffStart + 8 <= view.byteLength
      ) {
        const littleEndian = view.getUint16(tiffStart) === 0x4949
        const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian)
        const ifdOffset = tiffStart + firstIfdOffset
        if (ifdOffset + 2 > view.byteLength) return 1
        const entries = view.getUint16(ifdOffset, littleEndian)
        for (let index = 0; index < entries; index += 1) {
          const entryOffset = ifdOffset + 2 + index * 12
          if (entryOffset + 12 > view.byteLength) return 1
          const tag = view.getUint16(entryOffset, littleEndian)
          if (tag === 0x0112) {
            const value = view.getUint16(entryOffset + 8, littleEndian)
            return value >= 1 && value <= 8 ? value : 1
          }
        }
      }
    }

    offset += segmentLength
  }

  return 1
}
