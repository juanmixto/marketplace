---
summary: Índice de docs de producto (UX, flujos críticos, fricciones, prioridades móvil). Complementa business/.
audience: agents,humans
read_when: navegar docs de producto
---

# Producto — índice

Documentación de **producto** (UX, flujos, fricciones). Complementa `docs/business/`. El "qué" y "para quién" viven en negocio; aquí vive el "cómo lo siente el usuario".

> Lectura obligatoria antes de tocar checkout, ficha de producto, ficha de productor, onboarding o cualquier flujo visible al usuario. Para tareas con scope concreto, [`docs/AGENT-CONTEXT.md`](../AGENT-CONTEXT.md) destila los principios y los CF-1..CF-5; abre estos archivos completos solo si el `read_when:` aplica.

## Mapa

| # | Archivo | Para qué |
|---|---|---|
| 01 | [`01-principios-producto.md`](01-principios-producto.md) | Reglas duras de diseño y producto. |
| 02 | [`02-flujos-criticos.md`](02-flujos-criticos.md) | Los flujos que **no** pueden romperse. |
| 03 | [`03-fricciones-usuario.md`](03-fricciones-usuario.md) | Fricciones conocidas y su prioridad. |
| 04 | [`04-prioridades-ux-mobile.md`](04-prioridades-ux-mobile.md) | Reglas específicas para móvil. |

## Cómo se mantiene

- Cuando se observa una fricción real (no hipotética), se anota en `03` con evidencia.
- Cuando un flujo crítico cambia, se actualiza `02` **en el mismo PR** que el código.
- Los principios (`01`) son estables. Cambiar uno requiere ADR en `docs/business/09-decisiones-estrategicas.md`.
