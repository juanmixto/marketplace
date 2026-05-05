---
summary: Inventario de `style={{}}` en código browser-renderizado. Verdict — `style-src-attr 'none'` NO se aplica; todos los usos son runtime-dynamic legítimos.
audience: agents,humans
read_when: tocando CSP `style-src*` directives o añadiendo nuevos `style={{}}` a componentes browser
---

# `style-src-attr 'none'` audit (HU9 / #1250)

## Verdict

**No aplicar `style-src-attr 'none'`.** Los 14 usos en código browser-renderizado son **runtime-dynamic legítimos** (porcentajes calculados, `env()` viewport-aware, transforms de drag, FloatingUI styles, anti-FOUC theme bootstrap). Migrarlos a clases Tailwind o variables CSS implicaría:

- Pérdida de data binding (los porcentajes vienen de la DB / del cliente).
- Pérdida del paréntesis CSS `env(safe-area-inset-*)` que Tailwind no expone como utility de primera clase.
- Romper FloatingUI (la librería emite `style` por contrato).
- Romper el bootstrap de tema anti-FOUC en `app/layout.tsx`.

El coste de la migración supera el beneficio defensivo (que sería bloquear DOM-XSS/data-exfil vía clobbering — pero con `script-src 'strict-dynamic'` ya activo en producción, ese vector está muy degradado).

Cuando aparezca un nuevo `style={{}}` en un componente browser, **revisa primero esta tabla**: si tu caso encaja en una categoría existente, no lo replantees; si abre una nueva categoría, añade fila aquí y considera si la nueva categoría es migrable a clase Tailwind antes de aceptarla.

## Inventario completo (HEAD origin/main, 2026-05-04)

> Excluidos: `src/emails/**` (servidor-only — clientes de email descartan CSS classes, los inline styles son obligatorios y no pasan por CSP del navegador) y `src/app/{opengraph,twitter}-image.tsx`, `src/lib/pwa/brand-{icon,screenshot}.tsx` (rutas server-only que renderizan PNG/SVG, no HTML; tampoco son alcanzados por CSP del navegador).

| Archivo | Uso | Categoría | Migrable a clase? |
|---|---|---|---|
| `src/components/incidents/SlaProgress.tsx` | `width: ${fillPct}%` | porcentaje runtime | ❌ valor del SLA |
| `src/components/buyer/CartPageClient.tsx` | `paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))'` | `env()` notch-aware | ❌ Tailwind no expone `env()` directo |
| `src/app/global-error.tsx` (×11) | layout completo en estilos inline | fallback catastrófico | ❌ debe funcionar SIN stylesheet (catastrophic error page) |
| `src/app/(vendor)/vendor/liquidaciones/page.tsx` (×2) | `height: ${heightPct}%`, `width: ${widthPct}%` | barras de gráfica | ❌ valores desde DB |
| `src/components/pwa/ConnectionStatus.tsx` | `paddingTop: 'max(0.5rem, env(safe-area-inset-top))'` | `env()` notch-aware | ❌ idem CartPageClient |
| `src/components/ui/tooltip.tsx` | `...floatingStyles, ...transitionStyles` | FloatingUI library output | ❌ contrato externo |
| `src/components/catalog/ProductPurchasePanel.tsx` | `paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))'` | `env()` notch-aware | ❌ idem |
| `src/components/layout/Header.tsx` (×2) | `opacity: drawerSwipe.backdropOpacity`, `transform: translateX(${dragX}px)` | drawer-drag runtime | ❌ valores del touch handler |
| `src/app/layout.tsx` | `backgroundColor: initialBg, colorScheme: initialTheme` | anti-FOUC theme bootstrap | ❌ debe pintar antes de leer cookie / classNames |
| `src/app/(vendor)/vendor/dashboard/page.tsx` | `width: ${(setupDone / 3) * 100}%` | porcentaje de onboarding | ❌ valor desde DB |

## Notas para reviewers de futuras CSPs

- `style-src 'self' 'unsafe-inline'` se mantiene. Inline `<style>` (Tailwind, styled-jsx) es inevitable.
- `style-src-attr` (atributo `style="..."` en HTML) **es** aplicable a los 14 sitios listados; NO se restringe por la decisión de este audit.
- Si el código añade un nuevo `style={{}}` que **podría** ser una clase Tailwind, pídeselo al autor. Una vez todos los browser-renderizados son provablemente runtime-dynamic, este audit pierde objeto y se podría reabrir como follow-up.

## Refs

- Issue #1250 (HU9 del epic #1260).
- `src/lib/security-headers.ts:78-87` — comment al lado del `style-src` que apunta aquí.
- `docs/runbooks/sentry.md` § "Alertas armed" — añadir un canary para `style-src-attr` cuando llegue el momento.
