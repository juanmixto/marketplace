# Prompts — índice

Plantillas de prompts pensadas para que un agente IA (Claude Code, Cursor, ChatGPT, etc.) opere sobre este repositorio sin perder contexto de negocio ni de producto.

## Cómo usar estos prompts

1. Cada prompt asume que el agente tiene acceso al repositorio y puede leer archivos.
2. El primer paso de **todo** prompt es leer `/AGENTS.md`, `docs/business/00-index.md` y `docs/product/00-index.md`. Si el agente lo salta, se le recuerda.
3. Los prompts no sustituyen al juicio humano — sustituyen al brief que tendrías que escribir desde cero cada vez.
4. Si un prompt produce un output que contradice una decisión en `docs/business/09-decisiones-estrategicas.md`, se descarta el output y se reabre la decisión solo si hay información nueva real.

## Mapa

| Prompt | Para qué |
|---|---|
| [`create-github-issues.md`](create-github-issues.md) | Convertir una idea o lista de mejoras en issues bien formados, alineados con prioridades. |
| [`analyze-product-flow.md`](analyze-product-flow.md) | Analizar un flujo crítico, detectar fricciones y proponer mejoras priorizadas. |
| [`audit-business-alignment.md`](audit-business-alignment.md) | Auditar un PR, feature o backlog contra la estrategia y principios documentados. |

## Convenciones del directorio

- Un prompt = un archivo Markdown con: contexto, instrucciones, formato de salida esperado.
- Tono: directo. Cero "actúa como un experto X". Si el rol importa, se incluye en el prompt y punto.
- Si un prompt depende de información volátil (catálogo actual, métricas), se lo recuerda al agente y se le pide pedirla, no inventarla.
