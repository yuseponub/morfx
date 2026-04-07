---
phase: standalone/metricas-conversaciones
plan: 01
subsystem: analytics
tags: [postgres, rpc, metrics, conversations, supabase, migration]
one-liner: "RPC get_conversation_metrics centraliza nuevas/reabiertas/agendadas en Postgres con strict-inbound y LAG() para reabiertas"
requires: []
provides:
  - "RPC get_conversation_metrics(workspace, start, end, reopen_days, tag_name)"
  - "Index idx_conversations_workspace_created"
affects:
  - "standalone/metricas-conversaciones/02 (JS wrapper)"
  - "standalone/metricas-conversaciones/03 (UI)"
tech-stack:
  added: []
  patterns:
    - "SECURITY INVOKER RPC with CTE + LAG() window function"
    - "Strict-inbound nueva: MIN(timestamp) WHERE direction='inbound'"
    - "AT TIME ZONE 'America/Bogota' en todo date_trunc"
key-files:
  created:
    - "supabase/migrations/20260406000000_conversation_metrics_module.sql"
  modified: []
decisions:
  - "Strict-inbound nueva en vez de conversations.created_at (override a RESEARCH.md)"
  - "CREATE INDEX plano (sin CONCURRENTLY) por incompatibilidad con transacciones de Supabase CLI"
  - "SECURITY INVOKER para respetar RLS existente"
metrics:
  duration: "~15min"
  completed: "2026-04-06"
---

# Standalone metricas-conversaciones Plan 01: RPC Migration Summary

## Objective Achieved

Migration creada y aplicada en produccion. La RPC `get_conversation_metrics` existe ahora en la base de datos de produccion y puede ser llamada desde cualquier cliente Supabase. Esto habilita el Plan 02 (JS wrapper) y el Plan 03 (UI).

## What Was Built

### Migration file
- **Path:** `supabase/migrations/20260406000000_conversation_metrics_module.sql`
- **Contenido:**
  - `CREATE INDEX IF NOT EXISTS idx_conversations_workspace_created ON conversations(workspace_id, created_at DESC)`
  - `CREATE OR REPLACE FUNCTION get_conversation_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT) RETURNS TABLE(day DATE, nuevas INT, reabiertas INT, agendadas INT) LANGUAGE sql SECURITY INVOKER`
  - 5 CTEs: `days`, `nuevas_q`, `msg_win`, `reabiertas_q`, `agendadas_q`
  - `GRANT EXECUTE ... TO authenticated`

### Logica de cada metrica
- **nuevas:** conversaciones cuyo primer mensaje inbound (`MIN(timestamp) WHERE direction='inbound'`) cae en el rango. Requiere que el cliente haya respondido al menos una vez.
- **reabiertas:** mensajes inbound donde `LAG(timestamp)` del mismo conversation_id existe (`prev_in IS NOT NULL`) y la diferencia con el anterior inbound es >= `p_reopen_days` dias.
- **agendadas:** filas en `contact_tags` con `tag_id` = tag `VAL` del workspace, agrupadas por dia de `created_at`.

Todas las agregaciones usan `date_trunc('day', ts AT TIME ZONE 'America/Bogota')::date`.

## Production Application

- **Aplicada:** 2026-04-06
- **Metodo:** Usuario pego el contenido del archivo en Supabase Dashboard > SQL Editor del proyecto de produccion y ejecuto.
- **Resultado:** "Success. No rows returned" (confirmado por el usuario).
- **Cumple CLAUDE.md Rule 5:** migracion aplicada en produccion ANTES de cualquier commit o push de codigo que dependa del nuevo schema.

## Deviations from Plan / Research

### Deviation 1: Strict-inbound nueva definition
- **RESEARCH.md proponia:** contar `conversations` por `created_at` directamente.
- **Implementacion final:** contar conversaciones por `MIN(messages.timestamp) WHERE direction='inbound'` en el rango.
- **Razon:** CONTEXT.md especifica que "debe existir al menos un mensaje INBOUND del cliente para contar". Una conversacion creada por un template outbound que nunca recibio respuesta NO debe inflar la metrica de nuevas conversaciones. Este es el pitfall 4 de RESEARCH.md aplicado de forma estricta.
- **Impacto:** las nuevas conversaciones estaran mas bajas que si se contara por `created_at`, pero reflejan el comportamiento real del cliente (quien inicio la conversacion, o quien respondio al template).
- **Clasificacion:** deviation pre-acordada con orchestrator, no un bug fix. Documentada en el plan mismo.

### Deviation 2: CREATE INDEX sin CONCURRENTLY
- **RESEARCH.md original:** `CREATE INDEX CONCURRENTLY`.
- **Implementacion:** `CREATE INDEX IF NOT EXISTS` plano.
- **Razon:** Supabase CLI ejecuta migraciones dentro de una transaccion y `CONCURRENTLY` es incompatible con transacciones. La tabla `conversations` es lo suficientemente pequena en produccion actual para que un lock breve al crear el indice sea aceptable.

## Smoke Test Result

- **Ejecutado por:** usuario en Supabase Dashboard SQL Editor.
- **Query ejecutada:** `CREATE OR REPLACE FUNCTION ...` (migracion completa).
- **Resultado:** "Success. No rows returned" — la funcion y el indice se crearon sin errores.
- **Nota:** un smoke test posterior con `SELECT * FROM get_conversation_metrics(...)` contra el workspace de GoDentist Valoraciones se difiere al Plan 02, cuando el wrapper JS estara listo para llamarlo desde la aplicacion.

## Commits

- `fd93da0` feat(metricas): RPC get_conversation_metrics + index
  - Unico archivo: `supabase/migrations/20260406000000_conversation_metrics_module.sql`

**No push todavia.** Plan 02 hara el push combinado cuando el wrapper JS este listo, para mantener el repo y produccion sincronizados (Rule 5 + Rule 1).

## Next Phase Readiness

- RPC esta disponible en produccion — Plan 02 puede construir el wrapper JS inmediatamente.
- No hay blockers.
- Concerns: ninguno. La strict-inbound nueva debe ser explicada al usuario cuando vea la UI por primera vez (Plan 03) para que entienda por que los numeros pueden ser menores que los de conversations.created_at.

## Authentication Gates

Ninguno. La unica interaccion manual fue la aplicacion de la migracion en Supabase Dashboard, que es una gate explicita por CLAUDE.md Rule 5, no por falta de automatizacion.
