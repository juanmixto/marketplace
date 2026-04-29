# 03 — Fricciones de usuario conocidas

> Catálogo vivo de fricciones **observadas** (no hipotéticas) en compradores y productores.
> Cada entrada: descripción, evidencia, impacto, prioridad, estado.

## Convenciones

- **Prioridad**:
  - `P0` — bloquea un flujo crítico → arreglar **antes** de cualquier feature nueva.
  - `P1` — degrada conversión / repetición → arreglar este sprint.
  - `P2` — papel de lija → arreglar cuando haya hueco.
  - `P3` — anotado, sin compromiso.
- **Estado**: `abierta` | `en curso` | `cerrada` | `descartada` (con razón).
- Toda fricción nueva debe traer **evidencia** (sesión observada, ticket de soporte, métrica). Sin evidencia no entra.

## Plantilla por fricción

```
### F-NNN — Título corto

- **Dónde**: pantalla / flujo concreto.
- **Quién**: comprador frío / comprador recurrente / productor / equipo.
- **Síntoma**: qué hace o no hace el usuario.
- **Evidencia**: ticket #, grabación, métrica PostHog, observación directa (con fecha).
- **Hipótesis de causa**: la mejor hipótesis que tenemos (puede estar mal).
- **Impacto**: qué métrica empeora y cuánto.
- **Prioridad**: P0–P3.
- **Estado**: abierta / en curso / cerrada / descartada.
- **Notas**: workaround temporal, intentos anteriores, etc.
```

## Fricciones abiertas

> _Esta sección la rellena el equipo a medida que observa fricciones reales. Está intencionadamente vacía al crear el documento — no se inventan fricciones._

## Fricciones cerradas

> _Histórico de fricciones resueltas. Se mantiene como memoria institucional para no repetir errores._

---

## Reglas para usar esta lista

1. **Si una fricción no se puede describir con evidencia, no se añade aquí.** Va a una nota suelta o a "ideas".
2. **Una fricción cerrada no se borra** — se marca cerrada y se queda. Sirve de aprendizaje.
3. **Antes de proponer una feature nueva**, agentes y humanos deberían revisar P0/P1 abiertas. Si hay P0 sin cerrar, ninguna feature nueva tiene sentido.
4. **Una fricción que lleva > 3 meses abierta sin tocarse** se reevalúa: o se sube de prioridad o se baja a P3 / descartada.
