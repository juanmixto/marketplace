---
summary: Reglas específicas para móvil. La conversión móvil manda (principio 2). Tap targets, latencia, formularios cortos.
audience: agents,humans
read_when: tocar UI móvil, layout, tap targets, formularios
---

# 04 — Prioridades UX móvil

> Reglas específicas para móvil. La conversión móvil manda (`01-principios-producto.md` § 2).

## Reglas duras

1. **Diseño y test en móvil real primero.** Emulador del navegador no cuenta como verificación. Probar al menos en un Android medio (~ 4 GB RAM) y un iPhone reciente.
2. **Sin scroll horizontal en ninguna pantalla.** Si aparece, es bug.
3. **Touch target mínimo 44×44 pt.** Botones, links, controles de formulario.
4. **Tipografía mínima 16 px en inputs** (evita zoom auto en iOS).
5. **Una acción primaria por pantalla.** El resto, secundaria visual o oculta tras "Más".
6. **CTAs sticky cuando aplique** (ficha de producto, carrito, checkout) — pero sin tapar contenido relevante.
7. **Imágenes con `loading="lazy"` por defecto y dimensiones declaradas** para evitar CLS.
8. **Forms con teclados correctos**: `inputMode`, `autoComplete`, `enterkeyhint`. Email = teclado email, número = teclado numérico.
9. **No abrir nuevas ventanas / popups** si se puede evitar — destruye contexto en móvil.
10. **Latencia percibida < interacción local**: estados de carga visibles inmediatos en cualquier acción que tarde > 200 ms.

## Checkout móvil — checklist específico

- Total visible **siempre** (no escondido tras un acordeón).
- Envío calculado **antes** de pedir datos personales.
- Mínimo de campos. Cada campo nuevo necesita justificación.
- Sin "crear cuenta" obligatorio. Guest checkout es la golden path.
- Botón de pago sticky en la parte inferior.
- Errores de validación inline, junto al campo, en castellano humano.
- Apple Pay / Google Pay si la pasarela los soporta — reduce fricción enormemente.

## Ficha de producto — checklist específico

- Foto principal **above the fold** sin tener que hacer scroll.
- Precio + envío + plazo visibles en el primer scroll.
- Productor con nombre y link a su página, también above the fold.
- Descripción debajo, no cortada con "leer más" agresivo.
- CTA primaria sticky o muy accesible.
- Sin carrousels que rotan automáticamente — frustran al usuario que intenta leer.

## Listados / catálogo — checklist específico

- Tarjetas con foto, nombre, precio, productor. Nada más en el primer vistazo.
- Filtros accesibles desde un único punto, no esparcidos.
- Sort por defecto razonable (no aleatorio entre cargas).
- Sin scroll infinito sin paginación visible — confunde, mata el botón "atrás".

## Reglas anti-patrón en móvil

- **No** hacer overlays modales para confirmaciones triviales.
- **No** usar `position: fixed` que tape el área del producto en pantallas pequeñas.
- **No** usar tooltips hover-only — en móvil no existen (`Tooltip` del repo tiene fallback táctil; usarlo).
- **No** usar `<select>` nativo para listas largas; preferir un componente custom móvil-friendly.
- **No** usar carouseles para navegación primaria.
- **No** hacer animaciones que bloquean interacción durante > 200 ms.

## Cómo se valida

Antes de mergear cualquier cambio que toque flujo crítico:

1. **DevTools mobile + tunnel a móvil real** (laptop expone via tunnel; iPhone/Android lo abren). Ver `reference_dev_tunnel` en memoria de agente si aplica.
2. Probar la golden path completa en el dispositivo.
3. Probar al menos un edge case (input largo, teclado abierto, rotación).
4. Documentar en el PR qué dispositivo se usó.
