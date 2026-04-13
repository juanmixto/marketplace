# 🚚 ADR: Sistema de logística escalable (Sendcloud-ready) + backlog ejecutable

## Estado
Propuesto

## Objetivo de este documento

Este ADR no introduce todavía código funcional de logística. Su objetivo es:

1. dejar por escrito la **decisión de arquitectura** para la futura integración logística del marketplace
2. documentar el **estado real actual del código** para evitar propuestas genéricas o desconectadas del repo
3. convertir el análisis en un **backlog ejecutable** para que otro agente o desarrollador pueda abrir issues e implementar la solución por fases, sin romper el sistema actual

---

## Resumen ejecutivo

La recomendación es evolucionar el sistema actual hacia una integración con **Sendcloud** mediante una capa desacoplada `ShippingProvider`, manteniendo la experiencia del vendedor extremadamente simple:

- el vendedor **no** debe gestionar transportistas manualmente
- el vendedor **no** debe crear etiquetas a mano
- el vendedor debe limitarse a:
  1. revisar el pedido
  2. preparar el paquete
  3. pulsar una acción simple tipo **“Preparar pedido”**
  4. imprimir la etiqueta generada por el sistema

Esto requiere:

- extender `VendorFulfillment`
- introducir una capa `ShippingProvider`
- crear un adapter real para Sendcloud
- recibir estados por webhook
- simplificar la UI de vendedor
- mantener una UX clara para comprador en pedidos multi-vendor

---

## Estado actual del código (análisis del repo)

### 1. Modelo de datos actual

El schema Prisma ya tiene una base razonable para multi-vendor:

- `Order`
- `OrderLine`
- `VendorFulfillment`
- `ShippingZone`
- `ShippingRate`

Actualmente `VendorFulfillment` contiene:

- `orderId`
- `vendorId`
- `status`
- `trackingNumber`
- `carrier`
- `shippedAt`
- `deliveredAt`
- `createdAt`
- `updatedAt`

Esto significa que el modelo actual **sí contempla subfulfillments por vendedor**, pero todavía no representa bien un envío externo real con proveedor logístico.

### 2. Checkout actual

En `src/domains/orders/actions.ts`, `createOrder()`:

- recalcula precios en servidor
- crea `Order`
- crea `OrderLine[]`
- crea `Payment`
- crea `VendorFulfillment[]` (uno por vendor) con estado inicial `PENDING`

Esto es importante: **el split por vendor ya existe**. No hace falta rehacer el dominio de pedidos.

### 3. Flujo actual del vendedor

En `src/domains/vendors/actions.ts` existe `advanceFulfillment()` con transiciones manuales:

- `PENDING -> CONFIRMED`
- `CONFIRMED -> PREPARING`
- `PREPARING -> READY`
- `READY -> SHIPPED`

Cuando el fulfillment pasa a `SHIPPED`, hoy se puede guardar manualmente:

- `trackingNumber`
- `carrier`

También se recalcula el estado del `Order` padre (`PARTIALLY_SHIPPED` / `SHIPPED`).

### 4. UX actual comprador

En `getOrderDetail()` ya se incluyen `fulfillments`, así que la base para mostrar tracking por vendor al comprador ya existe.

### 5. Conclusión técnica

El repo **no necesita una reescritura**. Necesita una **evolución incremental**:

- mantener `VendorFulfillment`
- enriquecerlo con datos de envío real
- desacoplar la logística mediante provider/adapters
- automatizar el paso en el que hoy el vendedor introduce tracking manualmente

---

## Problema de producto que queremos resolver

### Premisa principal

La prioridad del producto es simplicidad extrema para comprador y vendedor.

### Dolor actual o futuro si no se corrige

Si se integra logística de forma ingenua:

- el vendedor tendrá que crear transportes manualmente
- copiar/pegar tracking
- elegir carrier
- lidiar con errores del proveedor
- operar demasiados pasos en cada pedido

Eso añade fricción y limita la escalabilidad operativa.

### Principio de diseño recomendado

**El vendedor no debe gestionar logística; solo debe preparar pedidos.**

Traducción práctica:

- el sistema decide el provider
- el sistema crea el shipment
- el sistema genera la etiqueta
- el sistema recibe actualizaciones del carrier
- el vendedor solo imprime y prepara el paquete

---

## Decisión de arquitectura

### Proveedor elegido

**Sendcloud** como primera integración profesional.

### Motivos

- buen encaje con España
- API suficiente para MVP serio
- permite crecer sin acoplar el dominio a un transportista concreto
- mejor encaje inicial que integración directa con MRW/Correos/SEUR

### No decisión

No se debe acoplar el dominio directamente a Sendcloud. El dominio debe hablar con una abstracción propia:

```ts
interface ShippingProvider {
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>
  getShipment(id: string): Promise<ShipmentResult>
  getTracking(id: string): Promise<TrackingResult>
  cancelShipment(id: string): Promise<void>
}
```

---

## Flujo objetivo de producto

### Vendedor

1. llega un pedido confirmado
2. el vendedor entra a su panel de pedidos
3. ve un CTA claro: **Preparar pedido**
4. al pulsarlo, el sistema:
   - valida que el fulfillment puede avanzar
   - crea automáticamente el shipment mediante `ShippingProvider`
   - guarda tracking y etiqueta
   - deja el fulfillment listo para impresión/envío
5. el vendedor solo imprime la etiqueta

### Comprador

1. compra normalmente en checkout simple
2. si el pedido incluye varios productores, se le comunica de forma clara y tranquila que puede recibir varios paquetes
3. ve tracking por fulfillment/vendor cuando esté disponible
4. recibe estados coherentes sin tener que entender la complejidad interna

---

## Punto de integración recomendado en el flujo actual

Hoy el repo usa `advanceFulfillment()` con varios estados manuales.

La integración no debería esperar al estado `SHIPPED`, porque ese estado representa que el paquete ya ha salido.

La recomendación es automatizar el momento en que el pedido queda **listo para logística**, es decir:

- o bien en `PREPARING -> READY`
- o bien sustituyendo el paso intermedio por una acción explícita `prepareShipment()`

La opción menos disruptiva con el código actual es:

### Recomendación

Usar el salto **`PREPARING -> READY`** como disparador para:

- crear shipment
- generar etiqueta
- persistir tracking preliminar / `providerShipmentId`

Luego `READY -> SHIPPED` puede seguir representando que el pedido ha sido realmente entregado al transportista o confirmado como expedido.

---

## Evolución propuesta del modelo `VendorFulfillment`

Hoy `VendorFulfillment` es insuficiente para modelar un envío externo real.

### Campos recomendados a añadir

- `shippingProvider` — ej. `sendcloud`
- `providerShipmentId` — id externo del shipment
- `labelUrl` — URL o referencia de etiqueta
- `trackingUrl` — URL directa de tracking si existe
- `labelCreatedAt`
- `shippingError` — último error legible
- `lastProviderSyncAt`

### Posibles campos de fase 2

- `pickupRequestedAt`
- `pickupConfirmedAt`
- `providerRawStatus`
- `servicePointId`
- `shipmentMetadata` (si realmente hace falta, con fuerte tipado y no como dumping ground)

---

## Riesgos técnicos

### 1. Estados inconsistentes

Riesgo:
- fulfillment en `READY` pero shipment externo no creado
- shipment creado pero DB no actualizada

Mitigación:
- transacción DB en la parte interna
- diseño explícito de errores
- estados intermedios o campo `shippingError`
- retries controlados

### 2. Webhooks duplicados o fuera de orden

Riesgo:
- eventos repetidos del proveedor
- transición de estado incorrecta

Mitigación:
- endpoint idempotente
- historial de eventos
- mapping defensivo de estados

### 3. Acoplamiento accidental a Sendcloud

Riesgo:
- DTOs internos idénticos a payloads externos
- dominio contaminado por nomenclatura de Sendcloud

Mitigación:
- mapper explícito request/response
- interfaces internas propias

### 4. Sobrecarga UX del vendedor

Riesgo:
- añadir demasiadas opciones logísticas al panel

Mitigación:
- no pedir carrier ni tracking manualmente en happy path
- una sola acción clara: preparar pedido / imprimir etiqueta

---

## Issues existentes relacionados (NO duplicar)

Antes de abrir tickets nuevos, revisar y enlazar con:

- `#58` — mostrar tracking al comprador
- `#70` — email al comprador cuando el pedido se envía
- `#82` — máquina de estados y `PARTIALLY_SHIPPED`
- `#97` — timestamps en fulfillment y shipping rate
- `#268` — cobertura de mutaciones server-side
- `#32` / `#86` — emails transaccionales
- `#73` — observabilidad
- `#179` — validación runtime en webhooks

La nueva línea de trabajo debe **apoyarse** en estos issues, no duplicarlos.

---

## Backlog propuesto (issues a crear)

---

### ISSUE 1 — `feat(shipping): introducir capa ShippingProvider desacoplada`

#### Objetivo
Crear una abstracción interna para proveedores logísticos externos.

#### Alcance
- nuevo dominio `src/domains/shipping/`
- interfaz `ShippingProvider`
- DTOs internos propios
- errores tipados
- mock provider para tests

#### Acceptance criteria
- interfaz definida y usable desde casos de uso
- sin llamadas HTTP en dominio puro
- implementación mock con tests mínimos

#### Prioridad
P0

#### Dependencias
Ninguna

---

### ISSUE 2 — `feat(database): extender VendorFulfillment para envíos externos`

#### Objetivo
Ampliar el modelo actual para representar shipments externos reales.

#### Alcance
Añadir campos como:
- `shippingProvider`
- `providerShipmentId`
- `labelUrl`
- `trackingUrl`
- `labelCreatedAt`
- `shippingError`
- `lastProviderSyncAt`

#### Acceptance criteria
- migración Prisma aplicada
- compatibilidad con datos actuales
- queries actuales siguen funcionando

#### Prioridad
P0

#### Dependencias
Issue 1

---

### ISSUE 3 — `feat(vendor): generación automática de envío al preparar pedido`

#### Objetivo
Automatizar la creación de shipment cuando el vendedor deja el pedido listo.

#### Punto de integración sugerido
En `advanceFulfillment()` durante `PREPARING -> READY`.

#### Acceptance criteria
- el sistema crea shipment automáticamente
- guarda tracking/label
- errores no dejan estados incoherentes
- el vendedor no introduce carrier/tracking en happy path

#### Prioridad
P0

#### Dependencias
Issues 1 y 2

---

### ISSUE 4 — `feat(sendcloud): implementación de provider Sendcloud`

#### Objetivo
Implementar el adapter real de Sendcloud detrás de `ShippingProvider`.

#### Alcance
- cliente HTTP aislado
- mappers request/response
- config por env vars
- manejo defensivo de errores
- tests unitarios

#### Acceptance criteria
- `createShipment()` funcional
- obtención de tracking funcional
- código listo para tests y extensión futura

#### Prioridad
P0

#### Dependencias
Issue 1

---

### ISSUE 5 — `feat(shipping): webhook Sendcloud idempotente`

#### Objetivo
Recibir eventos del provider y sincronizar estados locales.

#### Alcance
- endpoint webhook
- estrategia de idempotencia
- mapping de estados externos a internos
- historial de eventos
- actualización de `VendorFulfillment` y `Order`

#### Relacionados
- `#82`
- `#179`
- `#73`

#### Acceptance criteria
- no duplica eventos
- tolera payloads parciales
- actualiza estados de forma consistente

#### Prioridad
P1

#### Dependencias
Issue 4

---

### ISSUE 6 — `feat(vendor-ui): simplificar UX logística del vendedor`

#### Objetivo
Eliminar fricción operativa en el panel del vendedor.

#### Alcance
- quitar input manual de carrier y tracking en happy path
- añadir CTA claro `Preparar pedido`
- añadir CTA `Imprimir etiqueta`
- mostrar tracking y errores de forma clara

#### Acceptance criteria
- UI simple y difícil de usar mal
- loading/error/success claros
- sin sobrecarga de opciones logísticas

#### Prioridad
P1

#### Dependencias
Issue 3

---

### ISSUE 7 — `feat(buyer): UX clara para envíos multi-vendor`

#### Objetivo
Mantener una UX simple para el comprador aunque haya varios fulfillments.

#### Alcance
- copy claro en checkout: “puedes recibir varios paquetes”
- tracking por vendor en detalle de pedido
- resumen limpio en post-compra

#### Relacionado
- `#58`

#### Acceptance criteria
- buyer entiende envíos múltiples sin complejidad extra
- tracking visible y claro

#### Prioridad
P2

#### Dependencias
Parcialmente bloqueado por Issues 3/5

---

### ISSUE 8 — `test(shipping): cobertura del flujo logístico automático`

#### Objetivo
Proteger el cambio con tests suficientes.

#### Casos mínimos
- crear shipment automáticamente
- error del provider no rompe consistencia
- webhook actualiza estados correctamente
- pedido multi-vendor transiciona bien
- fallback manual si provider falla

#### Relacionado
- `#268`

#### Acceptance criteria
- tests de happy path y error path
- cobertura significativa sobre la nueva lógica

#### Prioridad
P1

#### Dependencias
Depende del avance real del resto

---

## Orden recomendado de implementación

1. Shipping abstraction
2. Extensión DB
3. Adapter Sendcloud
4. Automatización del flujo vendor
5. Webhooks
6. UI vendor
7. UX buyer
8. Tests finales y endurecimiento

---

## Qué NO hacer en MVP

Para mantener foco y reducir riesgo, no meter de inicio:

- selección manual de carrier por vendedor
- recogidas automáticas complejas
- múltiples providers simultáneos en UI
- panel logístico avanzado lleno de toggles
- lógica compleja de optimización de carrier

---

## Resultado esperado tras esta línea de trabajo

- el vendedor no gestiona envíos manualmente
- la plataforma crea y sincroniza envíos automáticamente
- el comprador ve tracking coherente por vendor
- el dominio queda preparado para crecer a más providers sin reescritura

---

## Nota para el agente que ejecute este backlog

1. No rehacer el dominio de pedidos; partir del flujo actual
2. Reutilizar `VendorFulfillment` como base, no sustituirlo por otra entidad nueva salvo necesidad muy justificada
3. Revisar y enlazar issues existentes antes de abrir nuevos
4. Implementar por fases pequeñas y mergeables
5. Mantener siempre la premisa de producto: **la logística debe sentirse automática para el vendedor y transparente para el comprador**
