# Activación del Agente Varixcenter — Acción Manual del Operador

**Tipo:** human-action (Regla 6 / D-02 — activación 100% manual, sin feature flag)
**Workspace target:** `c6621640-ba67-43de-9f05-905f09a6dc8f` ("Varixcenter")
**Estado del código:** completo, testeado, verificado (6 grep gates + suites verdes + Regla 6) y pusheado a Vercel (Regla 5 ya satisfecha — la migración de templates está en prod desde Wave 5).

Esta acción **ACTIVA el agente** (empieza a recibir tráfico WA/FB/IG del workspace). No la ejecuta Claude.

---

## ⚠️ Pre-requisito #1 (BLOQUEANTE) — Env vars en Vercel

Sin estas dos env vars el booking hace **fail-open → handoff humano** en runtime (la cita NO se agenda en varix-clinic). Agregarlas ANTES de crear la routing rule:

| Env var | Valor (de varix-clinic/.env.local) | Ambientes Vercel |
|---------|-----------------------------------|------------------|
| `VARIX_CLINIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` de varix-clinic | Production + Preview |
| `VARIX_CLINIC_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` de varix-clinic | Production + Preview |

- NO pegar los valores en este doc ni en commits.
- Tras agregarlas, re-desplegar (o esperar el deploy del push del código) para que el runtime las lea.
- A1 (allowlist IP): la conexión REST desde la máquina de desarrollo funcionó sin allowlist; Supabase no restringe IPs por defecto. Confirmar sólo si varix-clinic tiene Network Restrictions activadas (improbable).

---

## Pre-requisito #2 — Verificar dropdown en routing-editor

Tras el deploy verde, ir a `/agentes/routing/editor` (workspace Varixcenter) y confirmar que en el dropdown de agentes aparece **"Varixcenter Valoraciones"**. Si no aparece, el deploy no incluyó el código del agente — no continuar.

---

## SQL pre-formado de activación

> **Nota de corrección (deviation Rule 1):** el `rule_type` correcto es **`'agent_router'`** (NO `'router'`).
> La tabla `routing_rules` tiene `CHECK (rule_type IN ('lifecycle_classifier', 'agent_router'))`
> (migración `20260425220000_agent_lifecycle_router.sql`) y el motor de routing
> (`src/lib/agents/routing/cache.ts:25`, `dry-run.ts:167`) sólo reconoce `'agent_router'`.
> El template de la sección godentist-fb-ig en `agent-scope.md` usa `'router'`, lo cual fallaría
> la CHECK constraint — aquí se usa el valor correcto.

```sql
-- =====================================================================
-- ACTIVACIÓN AGENTE VARIXCENTER — workspace c6621640-ba67-43de-9f05-905f09a6dc8f
-- =====================================================================

-- Pre-check 1: ¿existe row de config para el workspace?
SELECT workspace_id, lifecycle_routing_enabled, conversational_agent_id
FROM workspace_agent_config
WHERE workspace_id = 'c6621640-ba67-43de-9f05-905f09a6dc8f';
-- Wave 0 audit confirmó: 0 filas → NO existe row → hay que hacer INSERT (no UPDATE).

-- ⚠️ GAP DETECTADO EN ACTIVACIÓN REAL (2026-06-12): además de lifecycle_routing_enabled,
-- el master switch agent_enabled DEBE quedar en true — con false, isAgentEnabledForConversation
-- (src/lib/agents/production/agent-config.ts:160) deshabilita TODAS las conversaciones y el bot
-- nunca responde aunque la routing rule esté activa. El INSERT de abajo fue corregido en vivo
-- con: PATCH workspace_agent_config SET agent_enabled=true.

-- Paso A: crear/asegurar la row de workspace_agent_config con el lifecycle router activo.
-- (Columnas NOT NULL sin default: sólo workspace_id (PK). Las demás tienen DEFAULT:
--  agent_enabled=false, conversational_agent_id='somnio-sales-v1', crm_agents_enabled,
--  handoff_message, timer_preset='real', response_speed=1.0, created_at, updated_at.
--  conversational_agent_id queda en su default 'somnio-sales-v1' pero NO afecta: el
--  lifecycle router + la routing rule de abajo deciden el agente por canal.)
INSERT INTO workspace_agent_config (workspace_id, lifecycle_routing_enabled, agent_enabled)
VALUES ('c6621640-ba67-43de-9f05-905f09a6dc8f', true, true)
ON CONFLICT (workspace_id)
DO UPDATE SET lifecycle_routing_enabled = true,
              updated_at = timezone('America/Bogota', NOW());

-- Pre-check 2: priorities libres (Pitfall 4 — UNIQUE INDEX uq_routing_rules_priority WHERE active=true).
SELECT priority, name, rule_type FROM routing_rules
WHERE workspace_id = 'c6621640-ba67-43de-9f05-905f09a6dc8f' AND active = true
ORDER BY priority;
-- Wave 0 audit confirmó: 0 active rules → priority 100 libre.

-- Paso B: crear la routing rule (multi-canal D-02, fact channel → agent_id varixcenter).
INSERT INTO routing_rules (workspace_id, name, rule_type, priority, conditions, event, active)
VALUES (
  'c6621640-ba67-43de-9f05-905f09a6dc8f',
  'Varixcenter routing (WA+FB+IG)',
  'agent_router',   -- corregido: NO 'router' (CHECK constraint + motor de routing)
  100,              -- priority libre confirmado en Wave 0 (0 rules activas)
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object('fact', 'channel', 'operator', 'in', 'value', ARRAY['whatsapp', 'facebook', 'instagram'])
    )
  ),
  jsonb_build_object('type', 'route', 'params', jsonb_build_object('agent_id', 'varixcenter')),
  true
);
```

---

## Rollback rápido (desactivar — recovery <10s tras cache TTL)

```sql
UPDATE routing_rules SET active = false
WHERE name = 'Varixcenter routing (WA+FB+IG)'
  AND workspace_id = 'c6621640-ba67-43de-9f05-905f09a6dc8f';
```

Tras crear la regla, el agente empieza a recibir tráfico WA/FB/IG del workspace; el cache de routing refresca en <10s (TTL).

---

## Smoke tests recomendados (post-activación)

1. **Dropdown:** `/agentes/routing/editor` muestra "Varixcenter Valoraciones" (ya verificado en Pre-requisito #2).
2. **Smoke real WA:** enviar un mensaje de prueba al número/canal del workspace `c6621640-...` y verificar:
   - (a) el bot responde con templates de **varixcenter** (saludo "...28 años de experiencia" + "¿Deseas agendar tu valoración?"), NO templates de godentist.
   - (b) al completar el flujo (nombre + teléfono + cédula + agendar), la cita aparece en **varix-clinic**:
     ```sql
     -- En el Supabase de varix-clinic:
     SELECT id, paciente, fecha, hora, tipo, estado, doctor_id
     FROM appointments
     ORDER BY created_at DESC LIMIT 5;
     -- La cita de prueba debe estar: tipo=valoración, estado='programada'.
     ```
3. ⚠️ **Si el smoke real falla, NO dejar la routing rule activa** — ejecutar el rollback SQL hasta resolver.

---

## Tras la activación (Regla 0 GSD + Regla 4)

- Documentar en `LEARNINGS.md` del standalone: bugs encontrados, el patrón del primer agente MorfX que escribe en DB externa (cross-project), y cualquier desviación.
- Actualizar el MEMORY del proyecto con el estado SHIPPED + activado.
