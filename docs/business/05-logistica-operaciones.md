# 05 — Logística y operaciones

> Estado **real**, no aspiracional. Si algo se hace a mano, aquí dice que se hace a mano.

## Modelo logístico inicial: dropshipping desde productor

**Cada productor envía sus pedidos directamente al comprador.** El marketplace no manipula producto físico.

### Por qué dropshipping al inicio

- **Capex cero**: sin almacén, sin estanterías, sin equipo logístico interno.
- **Velocidad de validación**: podemos abrir una categoría nueva en semanas, no meses.
- **Producto fresco**: el queso sale del obrador, no de un almacén intermedio. Mejor experiencia de marca.
- **Permite empezar pequeño con el productor**: no le exigimos enviar lotes a un hub.

### Riesgos del modelo dropshipping (y mitigación)

| Riesgo | Mitigación inicial |
|---|---|
| Inconsistencia de embalaje / experiencia entre productores | Plantilla mínima de embalaje que enviamos a cada productor + tarjeta común que mete cada uno |
| Productores con cumplimiento desigual | SLA por escrito, panel con métricas de plazo, escalado a llamada si se incumple 2 veces |
| El comprador percibe varios envíos como "varias tiendas" | Comunicación clara desde la confirmación: "Tu pedido se prepara en [obrador X] y sale de allí" |
| Stock no real | Confirmación semanal automatizada de stock + estado "agotado" inmediato si productor no confirma en 24 h |
| Coste de envío disparado en pedidos cross-productor | No agrupar cross-productor al inicio; mostrar envío por productor en checkout |
| Devoluciones cruzadas | Devolución va al productor de origen, no al marketplace; flujo único pero dirección variable |
| Productor da plazos optimistas | Medir plazo real vs prometido por productor; ajustar en la ficha si el real diverge |

## Responsabilidad del productor

El productor firma (en condiciones del onboarding) que es responsable de:

- **Stock real** declarado y actualizado al menos semanalmente.
- **Preparación del pedido** dentro del SLA: ≤ 2 días laborables desde notificación al envío.
- **Embalaje seguro** que cumpla los estándares mínimos (ver más abajo).
- **Etiquetado** según política del marketplace (datos del comprador correctos, remitente legible).
- **Comunicación de incidencias** en ≤ 24 h hábiles si algo se rompe (rotura de stock, retraso, daño detectado al embalar).
- **Cumplimiento legal**: factura al comprador, IVA, registros sanitarios si aplica.
- **Calidad del producto** que envía: lo que llega tiene que parecerse a la foto.

## Responsabilidad del marketplace

- **Atención al comprador** en primera línea (hasta que la incidencia requiera al productor).
- **Reembolsos / devoluciones** ejecutadas según política común.
- **Notificación operativa al productor** (Telegram + email) en cada pedido.
- **Métricas y feedback** al productor: tiempo medio de envío, tasa de incidencia, repetición de cliente.
- **Curaduría continua**: ficha al día, foto si la del productor envejece, copy si cambia el producto.
- **Resolución comercial** de disputas entre comprador y productor.

## Packaging: estándar mínimo común

Cada productor mantiene su packaging, pero **debe cumplir** un mínimo común:

| Eje | Estándar |
|---|---|
| Caja exterior | Cartón doble corrugado para frágiles (aceite, queso, miel en cristal) |
| Relleno | Material que sujete el producto: papel kraft arrugado, viruta de madera, espuma reciclada. **No** plástico de burbuja como única protección. |
| Cristal | Producto envuelto individualmente; ≥ 3 cm de protección entre cristal y borde de caja |
| Cadena de frío (cuando aplica) | Bolsa térmica reciclable + acumulador de gel; etiqueta exterior "Producto refrigerado, abrir al recibir" |
| Etiquetado | Dirección del comprador legible; remitente con nombre del productor |
| Tarjeta del marketplace | Tarjeta común (impresa por nosotros y enviada al productor) que el productor mete en cada pedido. Incluye QR a "tu pedido" + canal de atención. |
| Sostenibilidad | Preferencia por materiales reciclables; cero plástico no necesario |

**Antes del primer pedido real**, hacemos un envío de prueba con cada productor a una dirección del equipo y validamos packaging.

## SLA mínimo

| Evento | Plazo objetivo | Plazo máximo |
|---|---|---|
| Notificación del pedido al productor | Inmediato (Telegram) | < 5 min |
| Confirmación de stock por el productor | < 12 h hábiles | 24 h |
| Preparación + envío | 2 días laborables | 5 días laborables |
| Plazo de entrega del transportista | 24–72 h península | 5 días laborables |
| **Total comprador** | **3–5 días laborables** | **7 días laborables** |
| Atención al comprador (primera respuesta) | < 4 h hábiles | 24 h hábiles |
| Reembolso tras devolución recibida | < 3 días | 7 días |

**Si un productor incumple el SLA dos veces en un mes**, conversación + plan. Tres veces, pausa de su catálogo.

## Atención y soporte

- Canal único al comprador en esta etapa: **email + formulario web**. Nada de chat 24/7.
- WhatsApp como canal **al productor** (operativo, no comercial al comprador).
- Plantillas de respuesta documentadas en el panel interno.
- SLA: respuesta humana < 24 h hábiles.

### Matriz de incidencias frecuentes

| Incidencia | Tratamiento por defecto |
|---|---|
| Stock no real (ya no hay) | Cancelar y reembolsar **inmediatamente**. Avisar al productor. Penalización interna en la ficha del productor. |
| Retraso de envío > plazo prometido | Comunicar proactivo al comprador antes de que pregunte. Si > 7 días laborables, ofrecer cancelación. |
| Producto dañado en envío | Reposición o reembolso. Coste a cargo del marketplace si fue envío; del productor si el embalaje fue insuficiente. |
| Producto con calidad inferior a foto / descripción | Reembolso completo. Productor revisa el SKU; si reincidente, retirada del catálogo. |
| Comprador insatisfecho dentro de ventana de devolución | Aceptar sin discusión si está en plazo y política. |
| Pedido perdido por transportista | Reembolso al comprador inmediato; gestión con el transportista la lleva el productor (mantiene la relación). |
| Comprador receptor ausente y devolución del transportista | Notificar al comprador, ofrecer nuevo intento (su coste) o reembolso parcial. |

## Operaciones diarias (estado real)

| Tarea | Responsable hoy | Frecuencia | Automatizable cuando |
|---|---|---|---|
| Curar producto / foto / copy | Equipo (manual) | Por SKU / cambio | No prioritario, ventaja competitiva |
| Onboarding de productor | Equipo (manual) | Por productor | Cuando autoservicio sea seguro |
| Notificar pedidos al productor | Sistema (Telegram) | Por pedido | Ya automatizado |
| Confirmar stock y plazo | Productor (manual) | Por pedido + revisión semanal | No automatizar; señal de fiabilidad |
| Atención al comprador | Equipo (manual) | Por incidencia | Plantillas + macros antes de bot |
| Tracking + estado del envío | Mixto | Por pedido | Cuando todos los productores usen transportistas con API |
| Liquidaciones | Sistema | Mensual / quincenal | Ya semi-automático vía Stripe Connect |
| Auditoría de SLA por productor | Equipo (manual) | Mensual | Cuando haya panel de métricas por productor |
| Revisión de catálogo (fotos, copy, stock) | Equipo (manual) | Mensual | Cuando haya alertas automáticas |

## Cuándo pasar a modelo logístico centralizado

Mientras siga **dropshipping**, el modelo se sostiene hasta ~300 pedidos / semana en términos de coordinación operativa. Empezar a **considerar centralización parcial** cuando:

- Se sostiene > 200 pedidos / semana durante 6 semanas.
- ≥ 30 % de pedidos son pack cross-productor (justifica consolidación).
- Reincidencia de incidencias logísticas con productores específicos cuesta más en atención que el ahorro de no centralizar.
- El comprador empieza a pedir entrega prometida (≤ 48 h) y los datos lo justifican.
- El equipo es lo suficientemente grande para abrir frente operativo.

**Forma intermedia antes de centralizar del todo**: hub para 1–2 productores estratégicos cuyo packaging / cadena de frío / volumen justifique stock en nuestro almacén. **No** centralizar todo de golpe.

**Cuándo NO centralizar**:
- Antes de validar la unidad económica del pedido (margen tras envío + comisión + atención).
- Si el equipo no tiene capacidad de gestión de almacén.
- Si el ahorro proyectado < 15 % del coste actual.

## Lo que NO hacemos en operaciones

- No tocamos producto físico (en validación inicial).
- No mantenemos almacén propio.
- No emitimos factura por cuenta del productor (cada productor factura por su parte).
- No ofrecemos servicios logísticos al productor (etiquetas, recogida) como producto comercial.
- No competimos en plazo con Amazon ni mensajeros 24h.

Cualquiera de estas cambiará el modelo si las hacemos. Antes de hacerlas, pasar por `09-decisiones-estrategicas.md`.
