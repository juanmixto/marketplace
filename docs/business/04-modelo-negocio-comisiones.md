# 04 — Modelo de negocio y comisiones

## Cómo ganamos dinero

**Comisión sobre cada pedido completado.** Punto. No hay cuotas de alta, ni mensualidades, ni planes premium en esta etapa.

Razones:
- El productor solo paga si vende → fricción de alta mínima → más fácil curar productores buenos.
- Alinea incentivos: el marketplace gana cuando el productor gana.
- Una sola palanca de pricing → menos cosas que negociar caso por caso.

## Estructura de comisión (placeholder operativo)

> Los números concretos se mantienen fuera del repo (Notion / hoja de cálculo). Aquí solo el **modelo**.

- **Comisión base por categoría**, no por productor. Evita negociaciones individuales.
- **Comisión calculada sobre el subtotal del producto**, no sobre envío ni IVA.
- **Liquidación al productor** cuando el pedido pasa a estado entregado y se cierra la ventana de devolución.

## Costes que absorbe el marketplace

- Pasarela de pago (Stripe).
- Hosting + infraestructura técnica.
- Atención al comprador en primera línea.
- Fotos / curaduría inicial de fichas (al inicio, hasta que escale).

## Costes que absorbe el productor

- Coste de producto.
- Embalaje y preparación.
- Envío (salvo cuando el marketplace lo subsidia explícitamente como palanca de growth).

## Envío: quién paga, quién factura

- **Producto enviado por el productor** desde su ubicación.
- Coste de envío visible al comprador antes del pago.
- El marketplace **no consolida** envíos cross-productor en esta etapa.
- Plazos los marca el productor; el marketplace los muestra como rango.

## Devoluciones

- Política mínima común para todo el marketplace (claridad para el comprador).
- El productor puede tener política más generosa, nunca más restrictiva.
- Coste de devolución por defecto a cargo del comprador, salvo defecto / error de envío.

## Por qué no hacemos (todavía)

| Modelo | Por qué no, todavía |
|---|---|
| Suscripción para compradores | Sin volumen ni repetición probada. Resuelve un problema que no tenemos. |
| Cuota mensual a productores | Filtra contra productores buenos pero pequeños, justo los que queremos. |
| Marketplace propio (compra-stock-revende) | Capital intensivo. Mata el match-making y nos mete en logística. |
| Multi-currency / multi-país | Complejidad fiscal y operativa enorme antes de validar un mercado. |
| Programa de afiliados | Sin tracción orgánica que amplificar todavía. |

Cada una de estas tiene su sitio en `08-roadmap-negocio.md` o en `09-decisiones-estrategicas.md` cuando aplique.

## Métricas que importan en este modelo

Por orden:

1. **Pedidos completados / mes**.
2. **Tasa de conversión móvil** (ficha de producto → pedido pagado).
3. **% de pedidos repetidos** del mismo comprador en 90 días.
4. **Tiempo del productor desde alta a primer pedido**.
5. **Coste de adquisición** del comprador (cuando empiece growth pagado).

GMV se mira **después** de las cuatro primeras. Por sí solo no dice nada.
