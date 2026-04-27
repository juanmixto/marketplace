# 02 — Flujos críticos

> Los flujos listados aquí **no pueden romperse**. Cualquier cambio que los toque requiere:
> 1. Test que cubra la golden path.
> 2. Verificación manual en móvil real (no solo emulador).
> 3. Mención explícita en la descripción del PR.

## CF-1 — Descubrimiento → ficha → compra (en frío, móvil)

**Quién**: comprador que llega por primera vez al marketplace desde una URL externa.

**Pasos**:
1. Aterrizaje en home o ficha de producto.
2. Vista de catálogo con producto identificable y foto clara.
3. Click en producto → ficha completa con: foto principal, precio, productor, descripción, plazo, política, CTA "Añadir al carrito" / "Comprar".
4. Carrito visible con coste total **incluyendo envío** antes de continuar.
5. Checkout sin registro obligatorio (guest checkout es la golden path).
6. Pago Stripe.
7. Confirmación con resumen + plazo + qué pasa después.
8. Email de confirmación al instante.

**Qué no puede pasar nunca**:
- Que el precio cambie entre ficha y checkout sin avisar.
- Que el envío aparezca por primera vez en el último paso.
- Que se pida registro **obligatorio** antes de pagar.
- Que el pago falle silenciosamente.
- Que la confirmación sea ambigua sobre el siguiente paso.

## CF-2 — Pedido → productor → entrega

**Quién**: pedido confirmado tras pago.

**Pasos**:
1. Sistema notifica al productor (Telegram, email backup).
2. Productor confirma cumplimiento dentro del SLA acordado.
3. Productor prepara y envía.
4. Comprador recibe actualización (mínimo: pedido confirmado, pedido enviado).
5. Entrega.
6. Cierre del pedido + ventana de devolución.
7. Liquidación al productor.

**Qué no puede pasar nunca**:
- Que el productor no se entere de un pedido.
- Que el comprador no sepa el estado durante > 48h sin actualización.
- Que el sistema marque entregado sin señal real.
- Que se liquide al productor antes del cierre de la ventana.

## CF-3 — Onboarding de productor

**Quién**: productor invitado tras evaluación manual.

**Pasos**:
1. Aceptación + envío de formulario de datos.
2. Recogida de datos fiscales y de envío.
3. Acceso al panel del productor (móvil).
4. Equipo prepara fichas iniciales con input del productor.
5. Visto bueno del productor antes de publicar.
6. Publicación.
7. Primer pedido → ciclo CF-2.

**Qué no puede pasar nunca**:
- Que se publique una ficha sin visto bueno del productor.
- Que el productor no pueda ver sus pedidos en móvil.
- Que falten datos fiscales antes del primer cobro.

## CF-4 — Atención al comprador

**Quién**: comprador con incidencia.

**Pasos**:
1. Canal único (email / formulario web).
2. Respuesta humana < 24h en horario laboral.
3. Resolución según matriz de incidencias (ver `docs/business/05-logistica-operaciones.md`).
4. Comunicación clara del próximo paso al comprador.

**Qué no puede pasar nunca**:
- Que una incidencia se quede sin acuse > 24h.
- Que el comprador tenga que perseguir respuestas.
- Que la resolución contradiga la política pública sin explicación.

## CF-5 — Devolución / reembolso

**Quién**: comprador dentro de la ventana de devolución.

**Pasos**:
1. Solicitud por canal de atención.
2. Validación de elegibilidad (dentro de plazo, condición del producto).
3. Instrucciones claras de devolución física.
4. Recepción y comprobación.
5. Reembolso por el método original.
6. Comunicación al productor + ajuste de liquidación.

**Qué no puede pasar nunca**:
- Que el comprador adelante coste sin saber a qué se compromete.
- Que el reembolso tarde > X días tras recepción.
- Que el productor descubra la devolución cuando ya está liquidada.

---

## Cómo añadir un nuevo flujo crítico

Si un flujo se vuelve crítico (porque su rotura afecta directamente la promesa del marketplace), se añade aquí con:

- Identificador `CF-N`.
- Quién lo recorre.
- Pasos en lenguaje de negocio (no técnico).
- "Qué no puede pasar nunca" — la sección que justifica los tests.
