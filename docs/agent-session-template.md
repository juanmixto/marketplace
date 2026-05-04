---
summary: Plantilla para notas de sesión persistentes. Copia a .claude/sessions/<YYYY-MM-DD>-<slug>.md cuando arranques una tarea no trivial.
audience: agentes (Claude, Codex, etc.)
read_when: al arrancar una tarea que vaya a generar varios commits o que pueda extenderse a otra sesión
---

# Plantilla: nota de sesión

`.claude/sessions/` está **gitignored** — las notas son privadas por máquina,
útiles para que la siguiente sesión (mismo agente, otro agente, sin tokens, etc.)
tenga el contexto operativo sin tener que reconstruirlo. No sustituyen al PR,
sustituyen a la memoria volátil del chat.

## Cuándo usar una nota

- La tarea va a generar **>1 commit** o **>1 PR**.
- La tarea puede extenderse más allá de esta sesión (corte de tokens, pausa, otro agente continúa).
- Estás explorando o experimentando y el plan puede cambiar.

**No** uses una nota para tareas de un solo PR pequeño y autocontenido — eso es ruido.

## Cómo usar

1. Al arrancar: copia esta plantilla a `.claude/sessions/<YYYY-MM-DD>-<slug>.md`.
2. Rellena **Objetivo** y **Plan** antes de tu primer tool call de implementación.
3. Actualiza **Estado** cuando cambies de fase, cuando descubras algo no obvio,
   o al final de tu turno.
4. Al cerrar la sesión: deja un último update en **Estado** con qué quedaba pendiente.
5. Cuando la tarea acabe (PR mergeado, tarea archivada): borra la nota.

Para cerrar PRs, abre también [`docs/runbooks/pr-landing-checklist.md`](runbooks/pr-landing-checklist.md) y copia su bloque `AGENTS quick copy` al empezar la fase de merge.

---

## Plantilla — copia desde aquí abajo

```markdown
---
agent: <claude | codex | otro>
started: <YYYY-MM-DD HH:MM TZ>
task: <slug corto>
related_prs: <#1234, #1235>
---

# <título corto>

## Objetivo
<1-2 frases. Qué quiere el usuario, no qué vas a hacer técnicamente.>

## Plan
- [ ] paso 1
- [ ] paso 2
- [ ] paso 3

## Estado
<actualízalo cada vez que termines un paso, cambies de plan, o cierres sesión>

- HH:MM — arrancado, leído contexto, listo para empezar.
- HH:MM — paso 1 hecho, PR #X abierto, en espera de CI.
- HH:MM — sesión pausada. Próximo paso: <qué>. Bloqueador: <si lo hay>.

## Decisiones que hay que recordar
<solo cosas no obvias del código o del plan. Si el commit ya lo explica, NO lo dupliques aquí.>

## Notas para quien continúe
<si te quedas sin tokens o cierras la pestaña: qué tiene que saber el siguiente?>
```
