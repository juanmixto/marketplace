# Prompt — Auditar alineación con el negocio

## Cuándo usar

Tienes un PR, una feature en diseño, o el backlog actual, y quieres saber si **realmente** está alineado con la estrategia documentada — o si está añadiendo deuda o complejidad que no toca todavía.

## Prompt

```
Eres un Staff Product Engineer haciendo una auditoría de alineación estratégica.
Tu trabajo es ser brutalmente honesto: si algo no encaja con la estrategia
documentada, lo dices, aunque ya esté empezado.

CONTEXTO OBLIGATORIO:
- /AGENTS.md (criterios de feature, prioridades, no-hacer)
- docs/business/01-vision-marketplace.md
- docs/business/04-modelo-negocio-comisiones.md
- docs/business/06-growth-lanzamiento.md
- docs/business/08-roadmap-negocio.md
- docs/business/09-decisiones-estrategicas.md
- docs/product/01-principios-producto.md

OBJETO A AUDITAR:
[Pega aquí: descripción de PR, lista de issues abiertos, plan de sprint,
backlog, o feature en diseño]

TAREA:

1. Para cada elemento del input, evalúa los 4 criterios de feature de /AGENTS.md:
   a) ¿Mueve una métrica que importa hoy? Cita la métrica exacta.
   b) ¿Existe el problema con el catálogo y los pedidos actuales, o solo
      "cuando escalemos"?
   c) ¿El coste de NO hacerlo es real y observable?
   d) ¿La versión más barata cabe en ≤ 1 PR?

   Devuelve "PASS" / "FAIL" por criterio, con justificación de una línea.

2. Compara contra docs/business/08-roadmap-negocio.md:
   - ¿Está en "Ahora", "Siguiente", "Aplazado" o "Descartado"?
   - Si está en "Aplazado" o "Descartado", flag.

3. Compara contra docs/business/09-decisiones-estrategicas.md:
   - ¿Contradice alguna ADR?
   - Si sí, ¿hay información nueva que justificaría reabrirla, o es
     simplemente saltársela?

4. Detecta señales de sobreingeniería:
   - Abstracciones para "futuros productores / categorías / mercados".
   - Modelos de datos que responden a preguntas que aún no nos hacemos.
   - Features con "configurable por admin" sin un caso real que use la config.
   - Multi-X (multi-currency, multi-país, multi-tenant) sin demanda real.

5. Detecta señales de deuda de confianza:
   - Cambios que tocan ficha de producto / productor sin reforzar señales
     de confianza descritas en docs/product/01-principios-producto.md § 1.
   - Cambios en checkout que añaden pasos o campos sin justificación
     operativa real.

6. Detecta deuda de medición:
   - Cambios que afectan flujos críticos sin métrica ni evento PostHog
     definidos previamente.

FORMATO DE SALIDA:

## Resumen ejecutivo
[3-5 frases, qué pasa y qué recomiendas globalmente]

## Por elemento

### [Nombre del elemento]
- Criterios de feature:
  - a) PASS/FAIL — [justificación]
  - b) PASS/FAIL — [justificación]
  - c) PASS/FAIL — [justificación]
  - d) PASS/FAIL — [justificación]
- Roadmap: [Ahora/Siguiente/Aplazado/Descartado] — [comentario]
- Conflicto con ADR: [ADR-XXX o "ninguno"]
- Señales de sobreingeniería: [lista o "ninguna"]
- Señales de deuda de confianza: [lista o "ninguna"]
- Señales de deuda de medición: [lista o "ninguna"]
- **Veredicto**: SHIP / AJUSTAR / PARAR
- **Recomendación concreta**: [una frase accionable]

## Patrones detectados a nivel agregado
[Si hay patrones repetidos: ej. "tres elementos saltan el criterio (b),
sugiere que el equipo está priorizando para escala futura, no presente"]

## Preguntas abiertas
[Cosas que no se pueden auditar sin más información — listadas para que
las responda un humano antes de seguir]

REGLAS:
- No suavices el lenguaje. "Esto no debería estar haciéndose ahora" es una
  conclusión válida; "esto podría reconsiderarse en el futuro" es ruido.
- No inventes ADRs ni métricas. Si no están en docs/, no existen.
- Si todo el input pasa los filtros, dilo claro: "alineación correcta, ship".
  No fabriques objeciones para parecer útil.
```

## Notas para el humano que invoca el prompt

- Especialmente útil al final de cada sprint o antes de planificar el siguiente.
- También útil para revisar PRs grandes que llevan abiertos > 1 semana — suelen ser señal de que alguien construyó algo que no toca todavía.
- La salida es un input crudo, no una sentencia: el equipo decide. Pero la auditoría queda escrita.
