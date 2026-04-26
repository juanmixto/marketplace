# 04 — Modelo de negocio y comisiones

## Cómo ganamos dinero

**Comisión sobre cada pedido completado.** Sin cuotas de alta, sin mensualidades, sin planes premium en esta etapa.

Razones:
- El productor solo paga si vende → fricción de alta mínima → más fácil curar productores buenos.
- Alinea incentivos: el marketplace gana cuando el productor gana.
- Una sola palanca de pricing → menos cosas que negociar caso por caso.

## Comisión recomendada: 20–30 % sobre subtotal del producto

| Tramo | Cuándo aplicarlo | Productor objetivo |
|---|---|---|
| **20 %** | Productor estratégico, ticket alto, capacidad de stock alta, exclusividad parcial o piezas ancla del catálogo | Productor con marca propia ya reconocida que aporta credibilidad al marketplace |
| **22–25 %** | Caso por defecto en la mayoría de productores artesanales premium | El 70–80 % de los productores cae aquí |
| **26–30 %** | Productor que requiere mucho trabajo de curaduría / fotografía / soporte; o categoría con coste operativo alto | Productor sin web propia, sin fotos, con producto excelente pero capacidad operativa baja |
| **> 30 %** | **No aplicar al inicio.** Solo justificable con servicio extra explícito (ej. fotografía profesional incluida, soporte a medida). En ese caso, separar como cargo aparte, no inflar comisión. | — |

La comisión es **negociada productor a productor dentro del rango**, no estándar ciega. La razón se documenta en su ficha interna.

### Cuándo usar comisión menor (20 %)

- El productor es **ancla del catálogo**: tiene reputación que atrae compradores y otros productores.
- Capacidad de **enviar volumen alto** sin colapsar (≥ 200 pedidos / mes).
- Aporta **exclusividad parcial** (no vende en marketplaces grandes a precio inferior).
- **Negociación inicial** crítica para abrir una categoría: bajamos comisión a cambio de cerrar antes.
- **Pieza editorial**: el productor protagoniza un contenido largo que nos da SEO / redes / prensa.

### Cuándo justificar comisión mayor (28–30 %)

- El productor **no tiene fotos propias**: el equipo invierte 3–6 horas en una sesión.
- El productor **no tiene copy**: redactamos las fichas desde cero.
- Atención al productor previsiblemente alta (no contesta en horas, hay que perseguir).
- Categoría con **costes ocultos** (cadena de frío, embalaje especial, devoluciones más frecuentes).
- Producto con **margen unitario bajo en términos absolutos** (ticket 12–18 €): la comisión absoluta es pequeña aunque el % sea mayor.

### Riesgos del margen

| Riesgo | Cómo se manifiesta | Mitigación |
|---|---|---|
| Productor canibalizado | Su precio en marketplace + comisión queda muy por encima de su precio directo → frustración + sabotaje | Acordar precio común mínimo en marketplace ≥ precio en su web propia; revisar trimestralmente |
| Comprador percibe sobreprecio | Mismo producto en otra plataforma a precio claramente menor → no convierte | Investigar el "precio en otros canales" antes de fijar PVP; nuestro objetivo no es ser el más barato, pero sí estar en rango |
| Comisión que mata la artesanía | Productor reduce calidad para mantener su margen tras nuestra comisión | Negociar PVP donde el productor cobra **más** que en mercado físico, no menos |
| Concentración en un productor | 60% de los pedidos vienen de uno solo → riesgo de quedarnos sin negocio si se va | Métrica de concentración: ningún productor > 35% de pedidos durante > 3 meses sostenidos |
| Comisión efectiva real < comisión nominal | Devoluciones, incidencias, descuentos comen el margen | Medir comisión efectiva mensual, no nominal |

## Ticket medio objetivo

Por categoría, en validación inicial:

| Categoría | Ticket medio objetivo | Mínimo razonable | Máximo deseable |
|---|---|---|---|
| Aceite | 28–35 € | 18 € | 60 € |
| Queso | 30–45 € | 22 € | 75 € |
| Miel | 18–25 € | 12 € | 35 € |
| Pack mixto | 35–55 € | 25 € | 80 € |
| **Marketplace global** | **30–40 €** | — | — |

Por debajo del mínimo razonable → el envío se come el margen y/o la experiencia se siente cutre.
Por encima del máximo → comprador online frío rara vez convierte sin marca conocida.

## Packs para subir AOV

Los packs son la palanca principal para subir el ticket medio sin levantar precio unitario. Reglas:

- **Pack debe incluir descuento percibido**: típicamente 5–10% sobre la suma de SKUs sueltos. No más; no es Amazon Day.
- **Comisión sobre el pack**: misma fórmula (20–30%), aplicada sobre el subtotal del pack.
- **Packs cross-productor solo si el envío es único** (mismo productor o consolidación interna). Si requiere envíos separados, no es pack: es carrito.
- **Cada pack es un SKU**, no un combo dinámico. Esto simplifica logística y márgenes.

Objetivo: que **30–40 % de los pedidos contengan al menos un pack** en mes 6.

## Costes que absorbe el marketplace

- Pasarela de pago (Stripe): ~1.5–2.9 % + fee fijo por transacción, según método.
- Hosting + infraestructura técnica.
- Atención al comprador en primera línea.
- Fotos / curaduría inicial de fichas (al inicio, hasta que escale).
- Fee de envío residual cuando se subsidia como palanca de growth (acotado y explícito).

## Costes que absorbe el productor

- Coste de producto.
- Embalaje y preparación.
- Envío (salvo subsidio explícito del marketplace).
- Devoluciones por defecto del producto.

## Envío: quién paga, quién factura

- **Producto enviado por el productor** desde su ubicación (dropshipping, ver `05-logistica-operaciones.md`).
- **Coste de envío visible al comprador antes del último paso del checkout**.
- **El marketplace no consolida** envíos cross-productor en validación inicial.
- **Plazos** los marca el productor; el marketplace los muestra como rango (ej. "3–5 días laborables").
- **Factura del producto** la emite el productor (cada uno). El marketplace factura su comisión al productor.

## Devoluciones

- Política mínima común para todo el marketplace, clara en el footer y en cada ficha.
- El productor puede tener política más generosa, **nunca más restrictiva**.
- Coste de devolución por defecto a cargo del comprador, salvo defecto de producto o error de envío.
- Reembolso por método de pago original, máximo 7 días desde recepción de la devolución.

## Modelos que NO usamos (todavía) y por qué

| Modelo | Por qué no |
|---|---|
| Suscripción para compradores | Sin volumen ni repetición probada. Resuelve un problema que aún no tenemos. |
| Cuota mensual a productores | Filtra contra los productores buenos pero pequeños — los que queremos. |
| Marketplace propio (compra-stock-revende) | Capital intensivo. Mata el match-making y nos mete en logística. |
| Multi-currency / multi-país | Complejidad fiscal y operativa enorme antes de validar mercado nacional. |
| Programa de afiliados con incentivo monetario | Sin tracción orgánica que amplificar. |
| Comisión escalonada por volumen del productor | Complejidad operativa innecesaria con < 50 productores. |

Cada uno tiene su sitio en `08-roadmap-negocio.md` o como ADR cuando aplique.

## Métricas que importan en este modelo

Por orden:

1. **Pedidos completados / mes**.
2. **Tasa de conversión móvil** (ficha de producto → pedido pagado).
3. **% de pedidos repetidos** del mismo comprador en 90 días.
4. **Ticket medio (AOV)** y **% pedidos con pack**.
5. **Tiempo del productor desde alta a primer pedido**.
6. **Comisión efectiva real** (cobrada tras devoluciones e incidencias).
7. **Coste de adquisición** del comprador (cuando empiece growth pagado).

GMV se mira **después** de las primeras cuatro. Por sí solo no dice nada.

## Cuándo revisar el modelo de comisiones

Reapertura del rango 20–30 % cuando:
- Concentración > 50 % en una categoría hace que el rango medio no funcione.
- Productores buenos rechazan sistemáticamente el rango (señal de que el mercado pide otro).
- Comisión efectiva real diverge > 20 % de la nominal de forma sostenida.
- Aparecen costes operativos nuevos significativos (logística centralizada, equipo de fotografía interno).
