---
agent: codex
started: 2026-05-05 UTC
task: audit-status-write
related_prs: <>
---

# Status-write audit ratchet

## Objetivo
Crear un ratchet de auditoría que bloquee writes directos a `status` para Order / Payment / Settlement / VendorFulfillment fuera de los módulos de transición.

## Plan
- [x] Leer el patrón de audits existente.
- [x] Implementar `scripts/audit-status-write.mjs`.
- [x] Generar baseline real del repo.
- [x] Añadir test de contrato.
- [x] Conectar package, verify, CI y docs.
- [ ] Commit, push y PR.

## Estado
- 2026-05-05 — arrancado, leído contexto, preparado para implementar.
- 2026-05-05 — auditor implementado; baseline generada con 33 entradas.
- 2026-05-05 — test de contrato pasa.
- 2026-05-05 — auditor real pasa limpio con la baseline.
- 2026-05-05 — commit hecho y rama subida.
- 2026-05-05 — PR abierta: #1363.

## Decisiones que hay que recordar
- `src/domains/*/state-machine.ts` es el allowlist intencional para el ratchet.
- `src/domains/payments/webhook.ts` queda allowlisted temporalmente porque participa en el contrato de pagos.
- El script usa baseline para no convertir deuda histórica en ruido de CI.

## Notas para quien continúe
- El estado actual del repo deja 33 entradas baselineadas.
- El test de contrato usa `--soft` para leer JSON incluso cuando el fixture genera violaciones.
