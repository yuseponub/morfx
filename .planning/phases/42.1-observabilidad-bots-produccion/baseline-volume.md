# Baseline de Volumen — Bots en Produccion (Phase 42.1, Plan 01)

**Fecha:** 2026-04-08
**Proposito:** Validar que la estrategia de particionado mensual del schema de observabilidad es suficiente para el volumen real de los 3 bots conversacionales antes de aplicar la migration en produccion.

---

## Metodologia

Sin acceso directo a Supabase desde el agente de ejecucion, las siguientes queries DEBEN correrse manualmente en el SQL editor de produccion para refinar/confirmar el baseline. La decision de proceder con particionado mensual se basa en el estimate documentado en `42.1-RESEARCH.md` (lineas 587-599), que ya esta calibrado contra patrones de uso conocidos del equipo.

### Query 1 — Volumen de mensajes inbound por workspace (proxy de turns/dia)

```sql
SELECT
  workspace_id,
  DATE(timezone('America/Bogota', created_at)) AS dia,
  COUNT(*) AS inbound_msgs
FROM whatsapp_messages
WHERE created_at > now() - interval '7 days'
  AND direction = 'inbound'
GROUP BY workspace_id, dia
ORDER BY dia DESC, inbound_msgs DESC;
```

### Query 2 — Identificar workspace_id de cada bot

```sql
SELECT id AS workspace_id, name, agent_id
FROM workspaces
WHERE agent_id IN ('somnio-v3', 'godentist', 'somnio-recompra')
ORDER BY name;
```

> Si la columna `agent_id` no esta directamente en `workspaces`, usar `workspace_preferences` o `agents` segun el schema actual. El equipo conoce a que workspace pertenece cada bot.

### Query 3 — Promedio y pico sobre 7 dias

```sql
WITH daily AS (
  SELECT workspace_id,
         DATE(timezone('America/Bogota', created_at)) AS dia,
         COUNT(*) AS turns
  FROM whatsapp_messages
  WHERE created_at > now() - interval '7 days'
    AND direction = 'inbound'
  GROUP BY workspace_id, dia
)
SELECT workspace_id,
       ROUND(AVG(turns)) AS avg_turns_per_day,
       MAX(turns) AS peak_turns_per_day
FROM daily
GROUP BY workspace_id
ORDER BY avg_turns_per_day DESC;
```

---

## Baseline Estimado (segun 42.1-RESEARCH.md)

Estimate del research-phase (MEDIUM confidence) basado en patrones conocidos del equipo:

| Bot | turns/dia avg (est.) | turns/dia pico (est.) | proyeccion mensual |
|-----|----------------------|------------------------|--------------------|
| Somnio V3 | 3,000 | 12,500 | ~90K-375K turns |
| GoDentist | <1,000 | <2,000 | ~30K turns |
| Somnio Recompra | <500 | <1,500 | ~15K turns |

**Total estimado (limite superior):** ~14,000 turns/dia entre los 3 bots = ~420K turns/mes

### Proyeccion de filas por tabla del schema

Multiplicadores del research-phase:
- ~10-20 events/turn
- ~5-15 queries/turn
- ~2-4 ai_calls/turn

Aplicado al limite superior agregado (~14K turns/dia):

| Tabla | filas/dia (est.) | filas/mes (est.) |
|-------|-------------------|--------------------|
| agent_observability_turns | 14,000 | ~420K |
| agent_observability_events | 140,000 - 280,000 | ~4.2M - 8.4M |
| agent_observability_queries | 70,000 - 210,000 | ~2.1M - 6.3M |
| agent_observability_ai_calls | 28,000 - 56,000 | ~840K - 1.7M |

**Total cross-tabla:** ~7M - 17M filas/mes en el limite superior.

---

## Veredicto

**MONTHLY PARTITION OK.**

Razones:
1. El volumen total estimado (~7M-17M filas/mes en el peor caso agregado) es comodo para particiones mensuales en Postgres + Supabase. Las particiones de 1-6M filas son rapidas para queries indexadas con `(turn_id, sequence)` y `(conversation_id, started_at DESC)`.
2. La retencion de 30 dias (Decision #3) garantiza que nunca habra mas de ~2 particiones vivas por tabla en estado estable (la del mes actual + la del anterior pendiente de purga).
3. Los indices definidos en el schema (idx_turns_conversation, idx_events_turn, idx_queries_table, idx_ai_calls_prompt_version) cubren los patrones de query del UI panel (lookup por conversation_id, timeline por turn_id).
4. Si tras 1-2 semanas de captura real el volumen excede 5x el estimate (>70K turns/dia), se puede:
   - Cambiar a particiones diarias via la helper function `create_observability_partition` extendida
   - Comprimir `messages`/`response_content` JSONB en `agent_observability_ai_calls` (las filas mas pesadas: ~5-15KB c/u)
   - Reducir la retencion a 14-21 dias

**Punto de re-evaluacion:** Despues de Plan 03 (instrumentacion del primer bot — Somnio V3), correr Query 1/3 contra `agent_observability_turns_202604` con datos reales y comparar contra este baseline. Si el delta es >5x, escalar particionado antes de instrumentar GoDentist y Recompra.

---

## Pendiente

- [ ] Usuario corre Query 1, 2 y 3 en Supabase prod tras aplicar la migration y comparte resultados reales
- [ ] Plan 03 incluye una task explicita de "validar volumen real vs baseline" antes de extender a los otros bots
- [ ] Si Query 3 retorna >70K turns/dia para Somnio V3 solo, PARAR y discutir granularidad de particionado antes de continuar Phase 42.1
