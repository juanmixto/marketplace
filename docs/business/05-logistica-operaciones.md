# 05 — Logística y operaciones

> Estado **real**, no aspiracional. Si algo se hace a mano, aquí dice que se hace a mano.

## Pedido — flujo operativo actual

1. **Compra** en la web. Stripe captura el pago.
2. **Notificación al productor** vía Telegram (canal por productor o privado, según onboarding). Email queda como backup.
3. **Confirmación de cumplimiento** por parte del productor: tiene stock, lo prepara, plazo estimado.
4. **Envío** desde el productor con su transportista habitual. Tracking se introduce en el panel cuando lo hay; cuando no, se comunica al comprador a mano.
5. **Entrega** + ventana de devolución abierta.
6. **Liquidación** al productor tras cierre de la ventana.
7. **Cierre** del pedido en sistema.

## Quién hace qué

| Tarea | Responsable hoy | Automatizable cuando |
|---|---|---|
| Curar producto / foto / copy | Equipo (manual) | No prioritario. Es ventaja competitiva. |
| Onboarding de productor | Equipo (manual) | Cuando el productor pueda autoservirse sin perder calidad. |
| Notificar al productor | Sistema (Telegram) | Ya automatizado. |
| Confirmar stock y plazo | Productor (manual) | No automatizar; es señal de fiabilidad. |
| Atención al comprador | Equipo (manual) | Plantillas + macros antes de bot. |
| Tracking + estado | Mixto | Cuando todos los productores envíen con transportistas trazables. |
| Liquidaciones | Sistema | Ya semi-automático vía Stripe. |

## Soporte y atención

- Canal único al comprador en esta etapa (email + formulario web). Nada de chat 24/7.
- SLA objetivo: **respuesta humana < 24h** en horario laboral.
- Cualquier queja recurrente sobre el mismo productor se anota en su ficha interna; tres incidentes = revisión.

## Incidencias frecuentes y su tratamiento

| Incidencia | Tratamiento por defecto |
|---|---|
| Stock no real (ya no hay) | Cancelar y reembolsar inmediatamente. Avisar al productor. |
| Retraso de envío > plazo prometido | Comunicar proactivo al comprador antes de que pregunte. |
| Producto dañado | Reembolso o reposición; coste a cargo del marketplace si fue envío, del productor si fue defecto. |
| Comprador insatisfecho dentro de devolución | Aceptar sin discusión si está dentro de plazo y política. |

## Lo que NO hacemos en operaciones

- No tocamos producto físico.
- No mantenemos almacén propio.
- No emitimos factura por cuenta del productor (cada productor factura por su parte).
- No ofrecemos servicios logísticos (etiquetas, recogida) — el productor usa lo que ya usa.

Cualquiera de estas cambiará el modelo si las hacemos. Antes de hacerlas, pasar por `09-decisiones-estrategicas.md`.
