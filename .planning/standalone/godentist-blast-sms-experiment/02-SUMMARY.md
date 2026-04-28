---
phase: godentist-blast-sms-experiment
plan: 02
status: complete
completed: 2026-04-28
wave: 1
---

# Plan 02 — SQL Setup `sms_workspace_config` GoDentist

## What was built

- **`.planning/standalone/godentist-blast-sms-experiment/02-sql-setup-godentist-balance.sql`** — INSERT idempotente con `ON CONFLICT` y `GREATEST(...)` para no bajar saldo si pre-existe mayor.
- **Fila aplicada en prod Supabase** por usuario 2026-04-28 11:39:16 UTC.

## SELECT verificación (output prod)

```json
{
  "workspace_id": "36a74890-aad6-4804-838c-57904b1c9328",
  "is_active": true,
  "balance_cop": "450000.00",
  "allow_negative_balance": false,
  "total_sms_sent": 0,
  "created_at": "2026-04-28 11:39:16.388238+00",
  "updated_at": "2026-04-28 11:39:16.388238+00"
}
```

Fila NUEVA (created_at == updated_at == 2026-04-28 11:39:16 UTC) — no había row previo, INSERT puro (path `ON CONFLICT` no se activó).

## Gates de `sendSMS` (src/lib/domain/sms.ts:101-127)

| Gate | Esperado | Real | Status |
|------|----------|------|--------|
| Row presente (`config != null`) | true | true | ✓ |
| `is_active = true` | true | true | ✓ |
| `balance_cop >= SMS_PRICE_COP (97)` | true | 450000 ≫ 97 | ✓ |

**Plan 04 sendSMS pasará los 3 gates** para los primeros ~4.146 SMS (gasto estimado $402.162 — sobra margen $47.838).

## Decisiones LOCKED ejecutadas

- **D-09** Domain layer billing — ✓ fila configurada, sendSMS la leerá vía RPC atómico
- **D-13.2** Saldo inicial ≥ $428k — ✓ $450.000 (margen 12% sobre $401k esperado)
- **D-13.3** `is_active=true` desde inicio — ✓

## Regla 5 (CLAUDE.md): N/A

No es schema migration — `sms_workspace_config` ya existe desde `20260316100000_sms_onurix_foundation.sql`. Esto fue seed data del workspace, ejecutado manualmente vía SQL Editor por el usuario antes de cualquier código que lo consuma.

## Next

→ Plan 03: Build `scripts/test-blast-sms-5-team.ts` + pausa para que el usuario provea 5 phones del equipo (al menos 1 con acento) y autoriza el envío real (~$485 COP).
