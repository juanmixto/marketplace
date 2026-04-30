---
summary: Cleanup de blobs huérfanos en Vercel Blob — sync en server actions + sweep nocturno (default DRY-RUN). NO actives delete real sin revisar métricas.
audience: agents,humans
read_when: tocar src/lib/blob-storage.ts, src/workers/jobs/sweep-orphan-blobs.ts, activar el sweep en producción, investigar facturación de Vercel Blob
---

# Photo storage runbook

Issue: [#1050](https://github.com/juanmixto/marketplace/issues/1050) (parte
del epic [#1047](https://github.com/juanmixto/marketplace/issues/1047)).

Mantiene `Product.images[]`, `Vendor.logo` y `Vendor.coverImage`
sincronizados con lo que vive en Vercel Blob. Sin esta limpieza, cada
vez que un vendor reemplaza una foto el archivo viejo se queda en
storage para siempre.

## Dos piezas

### 1. Cleanup síncrono (`deleteBlob`)

- Vive en `src/lib/blob-storage.ts`.
- Se llama desde:
  - `updateProduct` en `src/domains/vendors/actions.ts` — diff entre
    `product.images` (pre-update) y `updated.images` (post-update).
  - `updateVendorProfile` en el mismo archivo — diff sobre
    `[logo, coverImage]`.
- **Reorder NO dispara delete**: el diff es por *contenido*, no por
  posición. Una URL que sigue presente en el array (en cualquier
  índice) se preserva.
- **Modo Vercel**: importa `del()` de `@vercel/blob` dinámicamente,
  igual que el upload. Si `BLOB_READ_WRITE_TOKEN` no está set, emite
  `photo.cleanup.failed` con `error_type=missing_token` y sigue.
- **Modo local** (`/uploads/...`): `fs.unlink` con guard contra
  traversal. Idempotente — `ENOENT` se trata como éxito.
- **Filosofía**: huérfano > update fallido. Cualquier error en
  `deleteBlob` se absorbe (logger.warn + métrica), nunca tumba la
  server action que lo invocó. El sweep nocturno es la red de
  seguridad.

### 2. Sweep nocturno (`runOrphanBlobSweep`)

- Vive en `src/workers/jobs/sweep-orphan-blobs.ts`.
- Lista todos los blobs en Vercel Blob (paginado por `cursor`),
  cruza con la unión de `Product.images[]` ∪ `Vendor.logo` ∪
  `Vendor.coverImage` (cursor-paginated en chunks de 1000), y
  reporta lo que no aparece en ningún lado.
- **DRY-RUN por defecto.** `PHOTO_SWEEP_DRY_RUN=true` (default).
  Solo `'false'` (case-insensitive) activa el delete real; cualquier
  otro valor o ausencia mantiene el modo informativo.

#### Activación manual

```bash
npm run sweep:orphans                              # dry-run
PHOTO_SWEEP_DRY_RUN=false npm run sweep:orphans    # real deletes
```

El script imprime el resultado estructurado por stdout además de
emitir las métricas estándar al logger.

#### Activación como cron

Hoy NO hay un `boss.schedule()` registrado para esta tarea — la
única scheduled job del proyecto (retention sweep) también se
expone solo como script manual y un cron externo dispara
`npm run ingestion:sweep` por la noche. Replica el mismo patrón:

1. En tu host de producción / Vercel cron / GitHub Actions, programa
   `npm run sweep:orphans` para correr una vez al día (sugerencia:
   03:00 Madrid, baja contención).
2. La primera semana déjalo en DRY-RUN y comprueba la métrica
   `photo.sweep.orphans_found` en PostHog/logs.
3. Cuando la cuenta se estabilice (no crece linealmente con cada
   ejecución), pon `PHOTO_SWEEP_DRY_RUN=false` y vuelve a verificar
   `photo.sweep.deleted` durante 1-2 ejecuciones.

#### Skips defensivos

Sin `BLOB_READ_WRITE_TOKEN`, sin el paquete `@vercel/blob`
instalado, o si `list()` revienta, el sweep devuelve un resultado
con `mode: 'skipped'` + `skipReason`, emite
`photo.sweep.skipped` y nunca borra nada.

## Métricas

Todas vienen vía `logger.info` / `logger.warn` con scopes estables.
**Las URLs completas no se loguean** — pueden contener tokens de
acceso temporal de Vercel. Solo el `domain` (host) acompaña a cada
evento.

| Scope | Cuándo |
|---|---|
| `photo.cleanup.success` | `deleteBlob` borró (o detectó ya borrado) un blob. Tags: `mode`, `domain`. |
| `photo.cleanup.failed` | `deleteBlob` falló. Tags: `mode`, `domain`, `error_type`. |
| `photo.sweep.start` | Inicio de un run. Tags: `dryRun`. |
| `photo.sweep.orphans_found` | Tras cruzar storage con DB. Tags: `scannedBlobs`, `referencedUrls`, `orphans`, `dryRun`. |
| `photo.sweep.deleted` | Solo en `dryRun=false`. Tags: `deleted`, `failed`. |
| `photo.sweep.failed` | `list()` o el chunk de DB revientan. Tags: `stage`, `error_type`. |
| `photo.sweep.skipped` | Token o paquete ausente. Tags: `reason`. |

## Riesgo conocido: variantes cacheadas

Borrar una URL en Vercel Blob no invalida las variantes que
`/_next/image` haya cacheado contra esa URL. Hasta que esas
variantes expiren (24h por `Cache-Control` en `next.config.ts`)
seguirán sirviéndose. No es un problema visible para el usuario
final (la variante sigue siendo la imagen correcta), pero sí algo
a tener en cuenta si un soporte reporta "ya borré la foto y sigue
saliendo" en una ventana de minutos. Aceptable.

## Fuera de scope

- Migración a content-addressed storage (hash en el nombre) — eso es
  otro hilo. El cleanup actual asume que la URL del blob es la
  identidad y que no hay dedupe-por-contenido.
- GDPR delete cascade (borrado de fotos cuando se elimina una cuenta
  de vendor) — el flujo de erase ya borra Product/Vendor; las URLs
  quedan huérfanas y entran en este sweep automáticamente.
