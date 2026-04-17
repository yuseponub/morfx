# SMS Billing Atomic RPC - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** sms-billing-atomic-rpc (standalone)
**Trigger:** Bug debug `.planning/debug/sms-billing-inconsistency.md`
**Areas discussed:** Atomicidad, Guards, Backfill, Fallback defensivo

---

## Pre-discussion exchange

**User:** "gsd fix"
**Claude:** Presenté 3 opciones (hotfix 1-línea, plan GSD estructural, paralelo).
**User:** "no entiendo, es un fix rapido o requiere fix estructural?"
**Claude:** Aclaré que el fix de 1 línea resuelve el síntoma observado; los defectos B y C son defense-in-depth.
**User:** "hagamos el fix estructural gsd fix"
**Decisión:** Proceder con fase standalone completa (discuss → research → plan → execute).

---

## Gray Areas Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Estrategia de atomicidad | RPC nuevo vs 2 calls + reconciliación vs idempotency key | ✓ (delegated) |
| Guard p_amount <= 0 en RPC | RAISE EXCEPTION vs success=false vs no-op silencioso | ✓ (delegated) |
| Backfill de rows cost_cop=0 | Conservador vs amplio con audit vs sin backfill | ✓ (delegated) |
| Fallback de credits en domain | ||1 silent vs estimar length vs error explicit | ✓ (delegated) |

**User's choice:** "no entiendo nada de esto, decidelo tu y que sea robusto"

**Notes:** Usuario delegó todas las decisiones técnicas con mandato de robustez. Claude aplicó los defaults recomendados en las 4 gray areas, documentando el reasoning en CONTEXT.md para trazabilidad.

---

## Area 1: Atomicidad (Defect B)

| Option | Description | Selected |
|--------|-------------|----------|
| RPC transaccional único | INSERT + UPDATE + INSERT en una sola tx plpgsql con FOR UPDATE lock | ✓ |
| 2 calls + reconciliación async | Mantener separación, añadir Inngest job que detecta divergencia | |
| Idempotency key end-to-end | Client genera UUID, RPC rechaza duplicados | |

**Selected:** RPC transaccional único (D-01, D-02, D-03)

**Rationale:** Elimina el defecto B por diseño (Postgres transaction = atomicidad automática). Reduce complejidad vs reconciliación. Idempotency key queda como deuda futura (deferred).

---

## Area 2: Guard p_amount

| Option | Description | Selected |
|--------|-------------|----------|
| RAISE EXCEPTION | Fail-loud, error visible en Supabase logs | ✓ |
| Retornar success=false | Consistente con patrón actual del RPC | |
| No-op silencioso | Comportamiento actual (el bug) | |

**Selected:** RAISE EXCEPTION (D-05, D-06)

**Rationale:** El RPC nunca debería llegar con amount=0 post-fix. Si pasa, queremos ruido máximo (error en logs Postgres + Supabase) para diagnóstico rápido, no success=false que podría ser misinterpretado. Aplica a ambos RPCs (existente y nuevo).

---

## Area 3: Backfill

| Option | Description | Selected |
|--------|-------------|----------|
| Conservador | Solo los 2 IDs conocidos del debug file | |
| Amplio con audit SQL primero | Audit read-only → confirmación → backfill idempotente con --dry-run default | ✓ |
| Sin backfill | Aceptar deuda, solo fix forward | |

**Selected:** Amplio con audit (D-09, D-10, D-11)

**Rationale:** Puede haber más rows afectados que los 2 conocidos (48s entre los mensajes observados, pero el fix llega ~24h después — ventana de riesgo). Audit primero para ver el alcance real, luego backfill idempotente con confirmación. `--dry-run` por default por Regla 5 (no escrituras sin preview).

---

## Area 4: Fallback defensivo

| Option | Description | Selected |
|--------|-------------|----------|
| `Number(credits) || 1` silent | Fallback silencioso a 1 segmento | ✓ (con warning) |
| Estimar por longitud | `Math.ceil(message.length / 160)` | |
| Retornar error explicit | Fail el domain call, dejar al caller decidir | |

**Selected:** `Number(credits) || 1` + `console.warn` explícito (D-07, D-08)

**Rationale:** Alinea con el patrón ya validado en `test-onurix-domain.mjs:78`. Estimar por longitud duplica la lógica de Onurix (podría divergir). Error explicit rompe el flujo cuando el SMS ya se envió (peor UX). El warning en log es visibilidad suficiente para detectar comportamiento raro de Onurix sin romper la operación.

---

## Claude's Discretion

Áreas donde el usuario delegó y Claude decidió:

1. **Ubicación y nombre de scripts:** `scripts/audit-sms-zero-cost.mjs` y `scripts/backfill-sms-zero-cost.mjs` (convención existente)
2. **Backfill via RPC plpgsql** para atomicidad (preferido sobre Node client)
3. **Orden de commits** durante execute-phase: migración SQL → domain refactor → scripts → tests
4. **`deduct_sms_balance` existente se mantiene** (no deprecated) para callers de recarga
5. **Ampliar warnings a otros campos de Onurix** si research revela que devuelve más basura ocasional

## Deferred Ideas

- Monitoring proactivo de `cost_cop=0` post-fix
- Auditoría análoga del path WhatsApp/Meta billing
- Idempotency key end-to-end
- Retry automático SMS
- Tests pgTAP para RPCs Postgres
- Refactor del harness de tests `test-onurix-*.mjs`
