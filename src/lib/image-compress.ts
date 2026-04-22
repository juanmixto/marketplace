export interface CompressPreset {
  /** Max dimension of the longest side in CSS pixels. */
  maxDimension: number
  /** Initial JPEG quality (0..1). Ratcheted down if still over target. */
  quality: number
  /** Aim for this byte size; shrink quality further until we're under it. */
  targetBytes: number
}

export const COMPRESS_PRESETS = {
  product: { maxDimension: 1600, quality: 0.82, targetBytes: 2_500_000 },
  cover: { maxDimension: 1600, quality: 0.8, targetBytes: 1_500_000 },
  avatar: { maxDimension: 512, quality: 0.82, targetBytes: 400_000 },
} as const satisfies Record<string, CompressPreset>

export type PresetName = keyof typeof COMPRESS_PRESETS

const SERVER_MAX_BYTES = 5 * 1024 * 1024
const COMPRESSIBLE = /^image\/(jpeg|png|webp|heic|heif)$/i
const JPEG_EXTENSIONS = /\.(png|webp|jpg|jpeg|heic|heif)$/i

export interface ImageCompressionMetadata {
  originalBytes: number
  compressedBytes: number
  originalWidth: number
  originalHeight: number
  compressedWidth: number
  compressedHeight: number
  originalType: string
  compressedType: string
  orientation: number
  compressed: boolean
  ratio: number
}

export interface PreparedImageForUpload {
  file: File
  metadata: ImageCompressionMetadata
}

export class ImageCompressionError extends Error {
  constructor(
    public readonly code: 'decode-failed' | 'heic-unsupported' | 'encode-failed' | 'too-large',
    message: string,
  ) {
    super(message)
    this.name = 'ImageCompressionError'
  }
}

export async function compressImage(
  file: File,
  preset: CompressPreset | PresetName,
): Promise<File> {
  const result = await prepareImageForUpload(file, preset)
  return result.file
}

export async function prepareImageForUpload(
  file: File,
  preset: CompressPreset | PresetName,
): Promise<PreparedImageForUpload> {
  if (typeof window === 'undefined') {
    return {
      file,
      metadata: buildMetadata(file, file, 0, 0, 0, 0, 1),
    }
  }

  if (!COMPRESSIBLE.test(file.type)) {
    return {
      file,
      metadata: buildMetadata(file, file, 0, 0, 0, 0, 1),
    }
  }

  const cfg = typeof preset === 'string' ? COMPRESS_PRESETS[preset] : preset
  const orientation = await readOrientation(file)

  let drawable: Drawable
  try {
    drawable = await loadDrawable(file)
  } catch {
    if (isHeicLike(file.type)) {
      throw new ImageCompressionError(
        'heic-unsupported',
        'HEIC/HEIF images are not supported by this browser',
      )
    }
    throw new ImageCompressionError('decode-failed', 'Could not decode image')
  }

  try {
    const sourceWidth = isOrientationSwapped(orientation) ? drawable.height : drawable.width
    const sourceHeight = isOrientationSwapped(orientation) ? drawable.width : drawable.height
    const { width, height } = fitWithin(sourceWidth, sourceHeight, cfg.maxDimension)

    const needsResize = sourceWidth > cfg.maxDimension || sourceHeight > cfg.maxDimension
    const needsTransform = needsResize || orientation !== 1 || isHeicLike(file.type)

    if (!needsTransform && file.size <= cfg.targetBytes) {
      return {
        file,
        metadata: buildMetadata(
          file,
          file,
          drawable.width,
          drawable.height,
          drawable.width,
          drawable.height,
          orientation,
        ),
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new ImageCompressionError('encode-failed', 'Could not create a canvas context')
    }
    const scale = Math.min(width / sourceWidth, height / sourceHeight)
    ctx.scale(scale, scale)
    applyOrientation(ctx, orientation, drawable.width, drawable.height)
    ctx.drawImage(drawable, 0, 0)

    let quality = cfg.quality
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (!blob) {
      throw new ImageCompressionError('encode-failed', 'Could not encode image')
    }

    while (blob.size > cfg.targetBytes && quality > 0.5) {
      quality = Math.round((quality - 0.1) * 100) / 100
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      if (!blob) {
        throw new ImageCompressionError('encode-failed', 'Could not encode image')
      }
    }
    while (blob.size > SERVER_MAX_BYTES && quality > 0.3) {
      quality = Math.round((quality - 0.1) * 100) / 100
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      if (!blob) {
        throw new ImageCompressionError('encode-failed', 'Could not encode image')
      }
    }
    if (!blob) {
      throw new ImageCompressionError('encode-failed', 'Could not encode image')
    }
    if (blob.size > SERVER_MAX_BYTES) {
      throw new ImageCompressionError('too-large', 'Image still exceeds server upload limits')
    }

    const newName = file.name.replace(JPEG_EXTENSIONS, '') + '.jpg'
    const compressed = new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() })
    return {
      file: compressed,
      metadata: buildMetadata(
        file,
        compressed,
        drawable.width,
        drawable.height,
        width,
        height,
        orientation,
      ),
    }
  } finally {
    if (typeof ImageBitmap !== 'undefined' && drawable instanceof ImageBitmap) {
      drawable.close()
    }
  }
}

export function readExifOrientationFromBytes(bytes: ArrayBuffer): number {
  const view = new DataView(bytes)
  if (view.byteLength < 4) return 1
  if (view.getUint16(0, false) !== 0xffd8) return 1

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1
      continue
    }

    const marker = view.getUint8(offset + 1)
    if (marker === 0xda || marker === 0xd9) break

    const segmentLength = view.getUint16(offset + 2, false)
    if (segmentLength < 2) break

    if (marker === 0xe1) {
      const headerOffset = offset + 4
      if (headerOffset + 6 > view.byteLength) return 1
      const header = readAscii(view, headerOffset, 6)
      if (header !== 'Exif\u0000\u0000') {
        offset += 2 + segmentLength
        continue
      }

      const tiffStart = headerOffset + 6
      if (tiffStart + 8 > view.byteLength) return 1
      const littleEndian = view.getUint16(tiffStart, false) === 0x4949
      const magic = view.getUint16(tiffStart + 2, littleEndian)
      if (magic !== 0x002a) return 1

      const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian)
      const ifd0Start = tiffStart + ifd0Offset
      if (ifd0Start + 2 > view.byteLength) return 1

      const entryCount = view.getUint16(ifd0Start, littleEndian)
      for (let i = 0; i < entryCount; i += 1) {
        const entryOffset = ifd0Start + 2 + i * 12
        if (entryOffset + 12 > view.byteLength) break
        const tag = view.getUint16(entryOffset, littleEndian)
        if (tag !== 0x0112) continue
        const type = view.getUint16(entryOffset + 2, littleEndian)
        const count = view.getUint32(entryOffset + 4, littleEndian)
        if (type !== 3 || count < 1) return 1
        return view.getUint16(entryOffset + 8, littleEndian)
      }
      return 1
    }

    offset += 2 + segmentLength
  }

  return 1
}

type Drawable = CanvasImageSource & { width: number; height: number }

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h }
  const ratio = w >= h ? max / w : max / h
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}

async function readOrientation(file: File): Promise<number> {
  if (!file.type.toLowerCase().includes('jpeg')) return 1
  try {
    return readExifOrientationFromBytes(await file.arrayBuffer())
  } catch {
    return 1
  }
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

function applyOrientation(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number,
) {
  switch (orientation) {
    case 2:
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      break
    case 3:
      ctx.translate(width, height)
      ctx.rotate(Math.PI)
      break
    case 4:
      ctx.translate(0, height)
      ctx.scale(1, -1)
      break
    case 5:
      ctx.rotate(0.5 * Math.PI)
      ctx.scale(1, -1)
      break
    case 6:
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(0, -height)
      break
    case 7:
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(width, -height)
      ctx.scale(-1, 1)
      break
    case 8:
      ctx.rotate(-0.5 * Math.PI)
      ctx.translate(-width, 0)
      break
    default:
      break
  }
}

function isOrientationSwapped(orientation: number) {
  return orientation >= 5 && orientation <= 8
}

function isHeicLike(type: string) {
  const normalized = type.toLowerCase()
  return normalized === 'image/heic' || normalized === 'image/heif'
}

function readAscii(view: DataView, offset: number, length: number) {
  let result = ''
  for (let i = 0; i < length; i += 1) {
    result += String.fromCharCode(view.getUint8(offset + i))
  }
  return result
}

function buildMetadata(
  original: File,
  output: File,
  originalWidth: number,
  originalHeight: number,
  outputWidth: number,
  outputHeight: number,
  orientation: number,
): ImageCompressionMetadata {
  return {
    originalBytes: original.size,
    compressedBytes: output.size,
    originalWidth,
    originalHeight,
    compressedWidth: outputWidth,
    compressedHeight: outputHeight,
    originalType: original.type,
    compressedType: output.type,
    orientation,
    compressed: output !== original,
    ratio: original.size === 0 ? 0 : Math.round((output.size / original.size) * 1000) / 1000,
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), type, quality))
}
