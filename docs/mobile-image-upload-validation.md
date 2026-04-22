# Mobile image upload validation

Validation checklist for the client-side image compression flow used by
vendor product uploads and vendor hero uploads.

## Scope

- `src/lib/image-compress.ts`
- `src/components/vendor/ImageUploader.tsx`
- `src/components/vendor/VendorHeroUpload.tsx`

## What to verify

### Device coverage

- Safari on iPhone
- Chrome on Android
- Desktop Chrome for fallback comparison

### Cases

- Large JPEG from camera roll, 3 MB to 10 MB+
- PNG with transparent background
- WebP upload
- HEIC / HEIF from iPhone, if the browser exposes it
- Very large photo, 4000 px or more on the long edge
- Image with EXIF orientation rotated
- Unsupported / malformed file

### Expected behavior

- The UI remains responsive while compression runs.
- The file sent to `/api/upload` is the compressed version, not the original.
- The preview reflects the compressed/oriented image.
- If HEIC / HEIF cannot be decoded in the browser, the form surfaces a clear error and does not fall back to uploading the original bytes.
- If compression fails for another reason, the form fails safely and surfaces a clear error.
- The upload flow never exceeds the server file-size cap.

## Manual checklist

- [ ] Select a camera photo on iPhone and confirm the preview is upright.
- [ ] Select the same photo from gallery on Android and confirm the preview is upright.
- [ ] Confirm the upload request payload size is smaller than the original file.
- [ ] Confirm HEIC either compresses successfully or fails with a clear fallback message.
- [ ] Confirm large images do not freeze the tab for a noticeable amount of time.
- [ ] Confirm the vendor hero upload and product upload behave consistently.

## Evidence to collect

- Original file size
- Compressed file size
- Final dimensions
- Final format
- Device / browser used

## Notes

- If a file still exceeds the server limit after compression, the flow should stop
  before upload rather than silently sending the original.
- Keep the comparison evidence in the issue thread or a follow-up QA note.
