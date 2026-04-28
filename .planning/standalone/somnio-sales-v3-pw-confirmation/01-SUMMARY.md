---
phase: somnio-sales-v3-pw-confirmation
plan: 01
status: complete
wave: 0
completed: 2026-04-27
---

# Plan 01 SUMMARY — Wave 0 Audit Production

## Decision agregada
**GO** — Wave 1 desbloqueada. Todos los queries pasaron o se resolvieron via aclaracion del usuario.

## Commits
- `8c8fe40` — `docs(somnio-sales-v3-pw-confirmation): add Wave 0 SQL audit queries (stages, pre-activation templates, automations, baseline)` (Task 1: 01-AUDIT.sql con 5 queries SELECT-only).
- `3bd86c0` — `docs(somnio-sales-v3-pw-confirmation): add Wave 0 production snapshot — stage UUIDs + pre-activation templates + automations audit` (Task 2: 01-SNAPSHOT.md + fix `enabled`→`is_enabled` en query d).

## Stage UUIDs locked

```typescript
export const PW_CONFIRMATION_STAGES = {
  PIPELINE_ID: 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8',
  NUEVO_PAG_WEB: '42da9d61-6c00-4317-9fd9-2cec9113bd38',  // position 1
  FALTA_INFO: '05c1f783-8d5a-492d-86c2-c660e8e23332',     // position 3
  FALTA_CONFIRMAR: 'e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd', // position 4
  CONFIRMADO: '4770a36e-5feb-4eec-a71c-75d54cb2797c',     // position 5
} as const
```

## Pre-activation templates confirmados

| name | id | language | status |
|------|----|----------|--------|
| `pedido_recibido_v2` | `ca08e0d3-a0f6-4b07-b64f-295f1437fec8` | es | APPROVED |
| `direccion_entrega` | `b0150368-da78-437b-b615-f3fb8052993a` | es | APPROVED |
| `confirmar_compra` | `48a40af8-d75f-48ea-8558-fd9d32345506` | es | APPROVED |

D-26 contract validado empiricamente: la automation `template final ultima` (id `71c4f524-2c8b-4350-a96d-bbc8a258b6ff`, `stageId=NUEVO PAG WEB`) envia los 3 templates en secuencia (t=0, t=12s, t=22s) cuando un pedido entra al stage. Confirma que el agente PW siempre recibe sesion en estado `awaiting_confirmation`.

## Automations relevantes

- **`template final ultima`** (`71c4f524-2c8b-4350-a96d-bbc8a258b6ff`, is_enabled=true) — dispara los 3 templates pre-activacion + SMS al entrar a `NUEVO PAG WEB`. Valida D-26.
- **0 automations a `CONFIRMADO`** — confirmado como **NO blocker** por usuario: post-CONFIRMADO es proceso humano (revisar + tag → crea orden en pipeline logistica fuera de scope V1).

## D-28 derivado del audit

Mover a `CONFIRMADO` es el estado terminal del agente PW V1. Post-CONFIRMADO el agente NO interviene mas. La logistica/factura es responsabilidad humana via tag manual. El agente NO debe asumir efectos colaterales automaticos.

## Self-Check
- [x] `01-AUDIT.sql` existe con 5 queries SELECT.
- [x] `01-SNAPSHOT.md` existe con outputs verbatim.
- [x] Stage UUIDs reales capturados (4/4 + pipeline UUID).
- [x] Pre-activation templates confirmados (3/3 APPROVED).
- [x] Automations a CONFIRMADO documentadas (0 rows + decision NO-blocker via usuario).
- [x] Decision agregada GO.
- [x] 2 commits atomicos en git, NO pusheados (Wave 0..6 quedan local hasta Plan 13).

**Self-Check: PASSED**
