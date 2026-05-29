# ACTIVATION STEPS — somnio-sales-v4 con CRM grounded sub-loop

> **Audiencia:** el operador/usuario que decida activar v4 en producción.
> **Estado actual:** v4 **DORMANT** (0 workspaces). NADA de esto afecta clientes hoy.
> **Estos son pasos MANUALES** (config UI + env vars Vercel + un UPDATE SQL). No hay
> feature flag (D-16): la activación es el propio `UPDATE workspace_agent_config`.
>
> **Ejecutar los pasos 1 y 2 ANTES del paso 3.** Activar sin config/env vars correctos
> deja el grounding ciego (T-cl-02) o las mutaciones de stage sin UUID (T-cl-03).

---

## Paso 1 — Configurar active-stages de Somnio en `/agentes/crm-tools` (D-21)

Resuelve el `config_not_set` de la Vista A del grounding (sin esto, el grounding
retorna `config_not_set` y el sub-loop opera ciego).

1. El operador entra a **`/agentes/crm-tools`** (UI existente, módulo `crm-query-tools`).
2. Selecciona el pipeline **"Ventas Somnio Standard"** (UUID
   `a0ebcb1e-d79a-4588-a569-d2bcef23e6b8`).
3. Marca como **active-stages** los stages pre-confirmación:
   - **NUEVO PEDIDO** (`6be952b0-0a95-4957-b5f7-62e8fd8eb815`)
   - **FALTA INFO**
   - **FALTA CONFIRMAR**
4. Guardar. Esto pobla `crm_query_tools_config` (singleton por workspace) +
   `crm_query_tools_active_stages` (junction) para el workspace Somnio
   (`a3843b3f-c337-4836-92b5-89c58bb98490`).

→ Resultado: la Vista A del grounding deja de retornar `config_not_set`.

---

## Paso 2 — Env vars de stage/pipeline en Vercel (fail-closed)

Setear **ANTES** de activar. Son leídas por `src/lib/agents/somnio-v4/config.ts`.

| Env var | Valor | Obligatoria |
|---------|-------|-------------|
| `SOMNIO_CONFIRMADO_STAGE_UUID` | `4770a36e-5feb-4eec-a71c-75d54cb2797c` | **Sí** (sin ella el gate OMITE `moveOrderToStage` a CONFIRMADO) |
| `SOMNIO_NUEVO_PEDIDO_STAGE_UUID` | `6be952b0-0a95-4957-b5f7-62e8fd8eb815` | **Sí** (sin ella el gate OMITE `createOrder` del cascarón) |
| `SOMNIO_VENTAS_PIPELINE_UUID` | `a0ebcb1e-d79a-4588-a569-d2bcef23e6b8` | **Opcional** (override) |

**Fail-closed (T-cl-03):** si `SOMNIO_CONFIRMADO_STAGE_UUID` /
`SOMNIO_NUEVO_PEDIDO_STAGE_UUID` están **ausentes**, el gate **OMITE**
`createOrder`/`moveOrderToStage` y loggea el motivo — **no crashea**. Por eso son
obligatorias antes de activar: sin ellas el flujo CRM no avanza.

**Pipeline (opcional):** `getPipelineUuid()` ya tiene **fallback verificado** a
`a0ebcb1e-d79a-4588-a569-d2bcef23e6b8` (pipeline "Ventas Somnio Standard") si la var no
está. Se documenta `SOMNIO_VENTAS_PIPELINE_UUID` solo para un override futuro.

---

## Paso 3 — Activación DORMANT → LIVE (per-workspace, sin feature flag)

```sql
-- ACTIVAR v4 en Somnio:
UPDATE workspace_agent_config
SET conversational_agent_id = 'somnio-sales-v4'
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';  -- Somnio
```

Sin feature flag (D-16). La activación ES este UPDATE.

### Rollback (recovery inmediato)

```sql
-- ROLLBACK: revertir al agente previo (o simplemente NO activar).
-- v4 vuelve a DORMANT, cero efecto en clientes.
UPDATE workspace_agent_config
SET conversational_agent_id = '<agente-previo>'   -- p.ej. 'somnio-sales-v3'
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
```

Rollback = revertir el UPDATE (o no activar). v4 vuelve a DORMANT.

---

## Smoke pre-activación (sandbox — antes del paso 3)

En **`/sandbox`** con Somnio v4 (mutaciones SIMULADAS in-memory, `simulate:true`):

1. **Nacimiento del cascarón:** al completar los datos críticos, el sub-loop crea el
   pedido cascarón (simulado) en NUEVO PEDIDO. Verificar `crmActions` en el debug panel.
2. **Enriquecimiento con pack:** al elegir pack, `updateOrder` enriquece el cascarón
   (productos + `total_value` real). Verificar `crmActions`.
3. **Confirmación:** al confirmar, `moveOrderToStage` mueve a CONFIRMADO
   (`4770a36e-...`). Verificar `crmActions` (origen `'rag'`) en el debug panel.

### FIX 3 (cosmético) — cascarón sin pack renderiza **$0** en el Kanban

Confirmar que el cascarón **sin pack todavía** se renderiza como **$0** en el Kanban
CRM (NO `null`, NO `NaN`). Razón: `orders.total_value` es
`DECIMAL(12,2) NOT NULL DEFAULT 0` (verificado en
`supabase/migrations/20260129000003_orders_foundation.sql:76`), así que el cascarón
nace con `total_value = 0` → el Kanban muestra **$0** hasta que el `updateOrder` del
pack lo enriquece con el precio real.

> **Smoke real WhatsApp diferido** a la activación (cuando el usuario decida el paso 3).
> Mientras v4 esté DORMANT, el único smoke disponible es el de sandbox (simulado).
