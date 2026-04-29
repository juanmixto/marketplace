---
summary: 10 principios duros de UX/producto: confianza > cleverness, mobile manda, checkout sagrado, honestidad operativa, feature solo con métrica antes.
audience: agents,humans
read_when: tomar cualquier decisión UX ambigua; revisar PR de producto
---

# 01 — Principios de producto

Reglas duras. Cuando una decisión de UX o producto sea ambigua, se decide en favor del principio que aplique.

## 1. Confianza sobre cleverness

Antes de cualquier feature inteligente, las señales básicas de confianza tienen que estar **explícitas y visibles**:

- Quién es el productor.
- De dónde viene el producto.
- Qué pasa si algo falla.
- Cuánto tarda en llegar.
- Cuánto cuesta llegar.

Si una de las cinco no está visible en la ficha o en el checkout, eso se arregla **antes** que cualquier mejora algorítmica.

## 2. La conversión móvil manda

Cualquier decisión que mejore desktop pero perjudique móvil **se descarta** salvo justificación explícita. No al revés.

## 3. Nada bloquea el descubrimiento

- No hay muros de registro antes de ver producto.
- No hay paywalls de información.
- No hay popups que tapan contenido en el primer scroll.
- El consentimiento de cookies es discreto y no bloqueante (en lo que la ley permita).

## 4. El checkout es el flujo más sagrado del repo

- No se añade un paso al checkout sin medir el coste de conversión.
- No se introduce un campo nuevo sin justificación operativa real (no "por si acaso").
- No se rompe la sesión durante el checkout.
- Cualquier cambio en checkout pasa por revisión específica + tests, no se mete en un PR genérico.

## 5. Honestidad operativa

Si algo está agotado, lo decimos. Si el plazo es de 7 días, lo decimos. Si un envío puede tardar, lo decimos **antes** del pago, no después. Engañar al comprador para convertir destruye repetición, que es la métrica que importa.

## 6. Cero "estados raros" visibles al usuario final

El comprador nunca debería ver:
- Mensajes técnicos en inglés.
- Stack traces o IDs internos.
- Estados intermedios que el sistema usa pero el humano no entiende ("PENDING_REVIEW", "DRAFT").
- Páginas vacías sin explicación.

Esto incluye errores: cada error visible al usuario tiene un copy claro y una salida.

## 7. Una cosa por pantalla en móvil

Cada pantalla móvil tiene **una** acción primaria. Si hay dos, la secundaria es visualmente menor (link, no botón). Si hay tres o más, se replantea la pantalla.

## 8. Feature solo si hay métrica antes

No se añade feature a flujo crítico sin **definir antes** qué métrica debería moverse y en cuánto tiempo. Si no se mueve, se retira. Documentar en el PR.

## 9. Internacionalización: ES por defecto

El idioma por defecto es español. Otros idiomas existen como capa, no como ejercicio de traducción literal. El copy se adapta culturalmente, no se traduce a ciegas.

## 10. Accesibilidad mínima no negociable

- Contraste cumple WCAG AA.
- Touch targets ≥ 44×44 pt en móvil.
- Navegación por teclado funcional en flujos críticos.
- Forms con labels reales, no solo placeholders.

No buscamos certificación; buscamos que un humano con manos torpes en un autobús pueda comprar.
