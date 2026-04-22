---
phase: crm-stage-integrity
plan: 01
status: complete
wave: 0
requirements:
  - D-03
  - D-10
  - D-11
  - D-13
  - D-17
  - D-20
  - D-24
commits:
  - e8aca1f
checkpoint_confirmed_at: "2026-04-22"
---

# Plan 01 — Composite DB Migration (Wave 0) — COMPLETE

## What shipped

Composite migration file `supabase/migrations/20260422142336_crm_stage_integrity.sql` commiteado en git (commit `e8aca1f`) y aplicado en Supabase production. Desbloquea Plans 02-05 (Regla 5 satisfecha).

### Sections in migration (9 total)

1. `ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS description text NULL` — **Rule 3 deviation**: schema actual (migración `20260420000443_platform_config.sql`) solo tenía 3 columnas (key/value/updated_at); `description` requerida por Example 5 RESEARCH INSERT pattern. Aditivo, idempotente, preserva el patron del plan.
2. `CREATE TABLE IF NOT EXISTS order_stage_history` — 13 columnas, CHECK constraint con 7 valores en `source`, `changed_at` default `timezone('America/Bogota', NOW())` (Regla 2).
3. 3 indices (D-11): `idx_osh_order_changed`, `idx_osh_workspace_changed`, `idx_osh_kill_switch` (parcial `WHERE source != 'manual'`).
4. RLS + 4 policies (D-13): SELECT workspace-scoped, INSERT open, UPDATE/DELETE deny.
5. `prevent_order_stage_history_mutation()` plpgsql + 2 triggers BEFORE UPDATE/DELETE (defense-in-depth vs service_role bypass).
6. GRANTs explicitos: `service_role` ALL + `authenticated` SELECT (LEARNING 1 Phase 44.1).
7. `ALTER PUBLICATION supabase_realtime ADD TABLE orders` idempotente vía `DO $$ IF NOT EXISTS`.
8. Seed 2 flags en `platform_config` (D-17 CAS, D-20 killswitch) ambos `'false'::jsonb` con `ON CONFLICT (key) DO NOTHING` (Regla 6).
9. `COMMENT ON TABLE/COLUMN` — documentación in-DB.

## Checkpoint (Task 2) — Outputs verbatim de Supabase production

### Paso 2b — CHECK constraint (7 valores esperados)

```json
[
  {
    "conname": "order_stage_history_source_check",
    "pg_get_constraintdef": "CHECK ((source = ANY (ARRAY['manual'::text, 'automation'::text, 'webhook'::text, 'agent'::text, 'robot'::text, 'cascade_capped'::text, 'system'::text])))"
  }
]
```

### Paso 2c — 4 indices (primary + 3 custom, incluido parcial)

```json
[
  {
    "indexname": "idx_osh_kill_switch",
    "indexdef": "CREATE INDEX idx_osh_kill_switch ON public.order_stage_history USING btree (order_id, changed_at DESC) WHERE (source <> 'manual'::text)"
  },
  {
    "indexname": "idx_osh_order_changed",
    "indexdef": "CREATE INDEX idx_osh_order_changed ON public.order_stage_history USING btree (order_id, changed_at DESC)"
  },
  {
    "indexname": "idx_osh_workspace_changed",
    "indexdef": "CREATE INDEX idx_osh_workspace_changed ON public.order_stage_history USING btree (workspace_id, changed_at DESC)"
  },
  {
    "indexname": "order_stage_history_pkey",
    "indexdef": "CREATE UNIQUE INDEX order_stage_history_pkey ON public.order_stage_history USING btree (id)"
  }
]
```

### Paso 3c — Trigger append-only bloquea UPDATE (esperado)

INSERT (permitido):
```json
[{ "id": "6d3bf905-3cd4-4c77-9c93-e22e67547d83" }]
```

UPDATE (bloqueado por trigger):
```
Failed to run sql query: ERROR:  P0001: order_stage_history is append-only (TG_OP=UPDATE)
CONTEXT:  PL/pgSQL function prevent_order_stage_history_mutation() line 3 at RAISE
```

Nota operacional: la fila de prueba queda permanentemente en producción con `source='system'` (el trigger BEFORE DELETE también bloquea el borrado para service_role). Nivel de ruido aceptable (1 fila synthetic en tabla que se llenará naturalmente desde Plan 02+ onwards).

### Paso 4a — orders en supabase_realtime publication

```json
[{ "tablename": "orders" }]
```

### Paso 4b — Ambos flags seeded default false

```json
[
  {
    "key": "crm_stage_integrity_cas_enabled",
    "value": false,
    "description": "Optimistic compare-and-swap en moveOrderToStage. Activar per-workspace tras observar telemetria. See .planning/standalone/crm-stage-integrity/CONTEXT.md D-17."
  },
  {
    "key": "crm_stage_integrity_killswitch_enabled",
    "value": false,
    "description": "Runtime kill-switch: skip automation si >5 cambios no-manuales en 60s. See D-20."
  }
]
```

## Confirmación Regla 5 + Regla 6

- **Regla 5:** Migración aplicada en Supabase production ANTES de cualquier push de código que la referencie. Plans 02-05 desbloqueados.
- **Regla 6:** Ambos flags = `false` en producción. Cuando se deployen Plans 02-05:
  - `moveOrderToStage` leerá `crm_stage_integrity_cas_enabled=false` → ejecutará LEGACY path sin `.eq('stage_id', prev)` (byte-identical).
  - `automation-runner` leerá `crm_stage_integrity_killswitch_enabled=false` → skip kill-switch query (byte-identical).
  - INSERT a `order_stage_history` sí comenzará desde primer move post-deploy (D-18: additive, sin flag, best-effort).

## Success criteria — status

- ✓ Archivo SQL existe en git con timestamp `20260422142336` (mayor a última migración previa).
- ✓ Tabla `order_stage_history` en prod con 13 columnas + 3 indices + RLS + 4 policies + trigger plpgsql doble guardia.
- ✓ `orders` en `supabase_realtime` publication.
- ✓ 2 flags en `platform_config` con `value=false`.
- ✓ GRANTs `service_role` ALL + `authenticated` SELECT aplicadas.
- ✓ Trigger append-only verificado end-to-end (UPDATE falla con P0001).
- ✓ Usuario confirmó "ok ya ejecute ese" + pegó outputs de Pasos 2b, 2c, 3c (ambos), 4a, 4b.

## Rule 3 deviations documented

1. **Agregado `ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS description text NULL`** al inicio de la migración. Razón: schema actual de `platform_config` no tenía columna `description`; INSERT con `(key, value, description)` del plan (Example 5 RESEARCH) habría fallado. Fix aditivo, idempotente. Beneficio secundario: descripciones ahora son first-class indexable data en la tabla, mejor para UI/audit downstream.

## Unblocks

- Plan 02 (Wave 1): CAS en `moveOrderToStage` puede leer `crm_stage_integrity_cas_enabled` via `getPlatformConfig`, y puede escribir a `order_stage_history` (service_role INSERT permitido).
- Plan 03 (Wave 2): automation-runner puede leer `crm_stage_integrity_killswitch_enabled` y ejecutar kill-switch query contra índice parcial `idx_osh_kill_switch` (<5ms esperado, Pitfall 8).
- Plan 05 (Wave 4): Kanban puede suscribirse a `postgres_changes UPDATE` sobre `orders` via Supabase Realtime.
