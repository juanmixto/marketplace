# Mobile image upload validation

Ticket scope:
- [#494](https://github.com/juanmixto/marketplace/issues/494)
- [#495](https://github.com/juanmixto/marketplace/issues/495)
- [#496](https://github.com/juanmixto/marketplace/issues/496)
- [#497](https://github.com/juanmixto/marketplace/issues/497)
- [#498](https://github.com/juanmixto/marketplace/issues/498)

## What shipped

The vendor upload flow now optimizes images in the browser before sending them
to [`POST /api/upload`](../src/app/api/upload/route.ts):

- product images use the `product` preset in [`src/lib/image-compress.ts`](../src/lib/image-compress.ts)
- hero cover images use the `cover` preset
- avatars / logos use the `avatar` preset
- JPEG EXIF orientation is corrected during the canvas render path
- input accepts JPEG, PNG, WebP, and HEIC/HEIF
- output is WebP when the browser encoder is available, otherwise JPEG
- the original heavy file is not uploaded after successful optimization

## Current decisions

### Size and quality

- Product images:
  - max dimension: `1600px`
  - initial quality: `0.82`
  - target payload: `~1.6 MB`
- Cover images:
  - max dimension: `1600px`
  - initial quality: `0.80`
  - target payload: `~1.4 MB`
- Avatar / logo images:
  - max dimension: `512px`
  - initial quality: `0.82`
  - target payload: `~400 KB`

These values intentionally sit inside the requested envelope:

- max width `1200-1600px`
- quality `70-85%`

### Format strategy

- Prefer `image/webp` because it is usually smaller for product photography
- Fall back to `image/jpeg` when the browser cannot encode WebP
- Do not upload PNG/HEIC originals when optimization succeeds

### Fallback strategy

- Unsupported or unreadable files fail before upload with a user-facing error
- HEIC that the browser cannot decode is rejected with a specific message
- If the optimized output still exceeds the 5 MB server cap, the upload is blocked
- The flow does not silently upload the original heavy asset as a fallback

## Before / after expectations

These are target envelopes based on the shipped presets, not measured device-lab numbers:

| Input case | Typical before | Expected after |
| --- | --- | --- |
| Mobile product photo | `3-10+ MB` | `<= 1.6 MB` target when content compresses well |
| Hero cover photo | `3-10+ MB` | `<= 1.4 MB` target when content compresses well |
| Logo / avatar | `1-5 MB` | `<= 400 KB` target |

Real output depends on source dimensions, noise, lighting, and codec support.
For release signoff, record actual samples from iPhone Safari and Chrome Android.

## Manual validation checklist

Run this on at least:

- Safari on iPhone
- Chrome on Android

### Product image uploader

1. Open create product and edit product.
2. Select a large JPG from gallery.
3. Confirm the UI shows an optimizing/uploading state.
4. Confirm the temporary preview matches the optimized image, not the original picker thumbnail.
5. Confirm upload completes and the final gallery preview renders.
6. Confirm DevTools network payload uses the optimized file size and format.
7. Repeat with a portrait photo that has EXIF rotation.
8. Confirm the uploaded preview is not rotated incorrectly.

### Vendor hero upload

1. Upload a cover image.
2. Upload a logo image.
3. Confirm the optimization summary appears after processing.
4. Confirm both assets persist after saving the vendor profile.

### Edge cases

1. Select a very large JPG (`>10 MB` if available).
2. Confirm the UI remains responsive while processing.
3. Select a HEIC from iPhone camera roll.
4. If conversion succeeds, confirm the uploaded file is optimized.
5. If conversion fails, confirm the UI shows the HEIC-specific error and does not upload the original.
6. Try a non-supported format such as GIF or SVG.
7. Confirm the upload is rejected before the network request.

## Known limits

- EXIF correction is implemented for JPEG. Other formats rely on browser decode behavior.
- HEIC support depends on browser decode support; acceptance in the picker does not guarantee conversion success.
- We do not yet persist measured before/after samples in CI; that remains manual QA work under [#498](https://github.com/juanmixto/marketplace/issues/498).
