---
plan: 08
phase: somnio-sales-v4-runtime-wiring
wave: 6
depends_on: [04, 05, 06, 07]
files_modified:
  - supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql
  - .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql
  - .planning/standalone/somnio-sales-v4-runtime-wiring/08-SMOKE-WAVE-B.md
addresses_decisions: [D-6, D-23, D-24, D-27, D-28]
addresses_research_pitfalls: [Pitfall 6 — READ COMMITTED suficiente vs SERIALIZABLE]
autonomous: false
estimated_tasks: 5
must_haves:
  truths:
    - "supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql existe pero NO se aplica automáticamente (Regla 5)"
    - "Migration contiene 2 statements EXACTOS dentro de BEGIN/COMMIT (D-40 padre absorb)"
    - "Statement 1 cierra v3 sessions del workspace Somnio con close_reason='v4_runtime_wiring_flip'"
    - "Statement 2 inserta routing_rule con event.agent_id='somnio-sales-v4'"
    - "BEGIN/COMMIT con READ COMMITTED — NO SERIALIZABLE (Pitfall 6)"
    - ".planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql existe y elimina la routing_rule"
    - "Push Plan 04/05/06 a Vercel ejecutado (Regla 1 — código v4 wireado en prod ANTES del SQL flip)"
    - "Pre-flip query verifica priority slot libre en routing_rules"
    - "Post-flip queries verifican: v3 sessions cerradas, v4 routing rule activa, observability events de v4 fluyendo"
    - "Cost query confirma solo Gemini + GPT-4o mini en agent_id='somnio-sales-v4' productivo (D-27)"
    - "Usuario aplica MANUALMENTE el SQL en momento elegido + confirma 'flip aplicado, v4 vivo' o 'rollback'"
    - "Smoke B reporte completo con observability + cost + decisión final"
  artifacts:
    - path: "supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql"
      provides: "SQL atómico de flip (NO auto-aplicar)"
      contains: "BEGIN;"
    - path: ".planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql"
      provides: "SQL rollback (delete routing rule)"
      contains: "DELETE FROM"
    - path: ".planning/standalone/somnio-sales-v4-runtime-wiring/08-SMOKE-WAVE-B.md"
      provides: "Reporte Smoke B post-flip productivo"
      contains: "Smoke Wave B"
  key_links:
    - from: "Webhook Somnio inbound post-flip"
      to: "routing-engine consultando routing_rules"
      via: "regla con event.agent_id='somnio-sales-v4'"
      pattern: "agent_id.*somnio-sales-v4"
    - from: "v3 sessions abiertas pre-flip"
      to: "agent_sessions.closed_at = NOW() + close_reason='v4_runtime_wiring_flip'"
      via: "UPDATE bulk en transacción"
      pattern: "v4_runtime_wiring_flip"
---

<objective>
Wave 6 — **Smoke Wave B = atomic flip productivo**. ESTE ES EL PLAN FINAL.

**D-23 absorb del Plan 13 padre:** este Plan 08 reemplaza al Plan 13 del standalone padre (`somnio-sales-v4`) que se quedó pendiente. Incluye:
1. SQL flip (close v3 sessions + INSERT routing rule v4)
2. Rollback SQL ready
3. Push de código a Vercel ANTES del SQL (Regla 1)
4. Human-action gate para que el usuario aplique el SQL manualmente
5. Post-flip observability + cost queries
6. Smoke B reporte
7. Cierre del standalone

**D-23 razón ("smoke prod con tráfico real"):** "Aprovechando volumen bajo de clientes ahora reduce riesgo. SQL rollback rápido a la mano." El usuario decidió que el primer testing v4 productivo sea con tráfico Somnio real (atomic flip total — ZERO shadow, zero A/B).

**Tareas:**

1. **Task 1**: Crear archivo SQL flip + archivo SQL rollback
2. **Task 2**: Commit local del SQL (sin push del SQL — Regla 5: nunca auto-apply migration)
3. **Task 3**: Push de código v4 (Plans 04/05/06) a Vercel — código wireado en prod **antes** del flip SQL
4. **Task 4**: HALT human-action — usuario aplica SQL manualmente + verifica + confirma
5. **Task 5**: Post-flip observability + cost queries + reporte Smoke B + cierre standalone

**Pitfall 6 (RESEARCH):** READ COMMITTED es suficiente para BEGIN/COMMIT — la transacción NO tiene read-after-write logic. NO usar SERIALIZABLE.

**Anti-Pitfall preflight checklist (verificable antes del flip):**

- [ ] Smoke A PASS (Plan 07 confirmado por usuario)
- [ ] Push de código a Vercel completo (Plans 04/05/06 deployed) — el branch v4 webhook está vivo en prod, esperando routing rule
- [ ] Plans 02/05 pre-deploy pruebas locales OK
- [ ] Env vars Vercel confirmed (Plan 01 Task 2 checkpoint pass)

**Consideraciones operacionales:**

- **Ventana temporal:** D-23 dice "volumen bajo de clientes ahora". Si jose decide ejecutar el flip en horario de baja actividad (madrugada Bogotá UTC-5), mejor — pero es decisión suya en runtime, no del plan.
- **Monitoreo post-flip:** primeros 30-60 min crítico. Watch:
  - Inbox UI en `/conversaciones` — mensajes de Somnio aparecen, son coherentes
  - Observability events: agent_id='somnio-sales-v4' dominante (no fallback a v1 ni v3)
  - Cost: Gemini + GPT-4o mini, NO Haiku
- **Rollback:** Tarda <30s con el SQL rollback (DELETE routing_rule). Webhooks subsecuentes vuelven a v3 (default cuando no hay routing rule activa con agent_id v4).

**SQL pre-formado (D-23 reference + adaptación al naming standalone):**

Workspace Somnio: `'a3843b3f-c337-4836-92b5-89c58bb98490'`

Statement 1 (close v3 sessions):
```sql
UPDATE public.agent_sessions
SET
  closed_at = timezone('America/Bogota', NOW()),
  close_reason = 'v4_runtime_wiring_flip',
  current_mode = 'closed'
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id = 'somnio-sales-v3'
  AND closed_at IS NULL;
```

Statement 2 (insert routing rule v4):
```sql
INSERT INTO public.routing_rules (
  workspace_id, schema_version, rule_type, name, priority,
  conditions, event, active
) VALUES (
  'a3843b3f-c337-4836-92b5-89c58bb98490',
  'v1',
  'agent_router',
  'somnio-v4-runtime-wiring-flip',
  1000,
  '{}'::jsonb,                                        -- match-all del workspace
  '{"agent_id": "somnio-sales-v4"}'::jsonb,
  true
);
```

(El priority=1000 asume libre. Pre-flip query (Task 4) verifica esto y user adjusta si necesita).

Output: v4 LIVE en Somnio prod (con flip aplicado) o rollback ejecutado limpiamente.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
@.planning/standalone/somnio-sales-v4/13-PLAN.md
@supabase/migrations/20260425220000_agent_lifecycle_router.sql
</context>

<interfaces>
<!-- routing_rules schema (referenced in Plan 13 padre) -->
Columnas: `workspace_id` (UUID), `schema_version` (TEXT), `rule_type` (TEXT), `name` (TEXT), `priority` (INT 1-100000), `conditions` (JSONB), `event` (JSONB), `active` (BOOLEAN).

UNIQUE constraint: `(workspace_id, rule_type, priority) WHERE active=true`.

<!-- agent_sessions schema -->
```sql
UPDATE agent_sessions
SET closed_at = timezone('America/Bogota', NOW()),
    close_reason = 'v4_runtime_wiring_flip',
    current_mode = 'closed'
WHERE workspace_id = '<somnio>'
  AND agent_id = 'somnio-sales-v3'
  AND closed_at IS NULL;
```

<!-- D-43 (padre): Inngest timers v3 colgados hacen no-op por checkSessionActive guard -->
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo SQL flip + archivo SQL rollback</name>
  <files>supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql, .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/13-PLAN.md (parent plan padre — usar como template verbatim)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-23 absorb del Plan 13 padre)
    - supabase/migrations/20260425220000_agent_lifecycle_router.sql (routing_rules schema source-of-truth)
    - CLAUDE.md (Regla 5 — migration archive sin auto-apply)
  </read_first>
  <action>
**A) Crear `supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql`:**

```sql
-- Standalone: somnio-sales-v4-runtime-wiring / Plan 08 — FLIP ATÓMICO
--
-- ⚠️ REGLA 5 ESTRICTA: este SQL NO se aplica automáticamente.
-- ⚠️ El usuario lo ejecuta MANUALMENTE en Supabase Studio cuando decide hacer el flip.
-- ⚠️ Antes del flip, Smoke Wave A (Plan 07) debe estar PASS.
-- ⚠️ Antes del flip, código v4 (Plans 04/05/06) DEBE estar deployado en Vercel (Task 3 lo asegura).
-- ⚠️ Después del flip: v4 recibe 100% del tráfico Somnio.
-- ⚠️ Para revertir: ver .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql
--
-- Atomicidad: BEGIN/COMMIT con READ COMMITTED es suficiente (RESEARCH Pitfall 6).
-- No hace falta SERIALIZABLE — la transacción no tiene read-after-write logic.
--
-- Decisiones aplicadas:
--   D-23: smoke en prod con tráfico real (absorb del Plan 13 padre)
--   D-24: post-flip observability events tracked con agent_id='somnio-sales-v4'
--   D-27: post-flip cost query por agent + model + purpose
--   Padre D-38: close hard de todas las sesiones v3 abiertas (clientes vuelven con sesión nueva en v4)
--   Padre D-40: 2 statements en BEGIN/COMMIT
--   Padre D-43: Inngest timers v3 hacen no-op vía checkSessionActive guard

BEGIN;

-- =================================================================
-- Statement 1: cerrar todas las sesiones v3 abiertas del workspace Somnio
-- =================================================================
UPDATE public.agent_sessions
SET
  closed_at = timezone('America/Bogota', NOW()),
  close_reason = 'v4_runtime_wiring_flip',
  current_mode = 'closed'
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id = 'somnio-sales-v3'
  AND closed_at IS NULL;

-- =================================================================
-- Statement 2: insertar routing rule v4
-- =================================================================
-- IMPORTANTE: el priority=1000 asume que no hay otra regla active=true con priority=1000
-- para (workspace_id='Somnio', rule_type='agent_router'). Verificar antes con:
--   SELECT * FROM routing_rules
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND rule_type='agent_router'
--      AND active=true
--    ORDER BY priority;
-- Si la priority=1000 está ocupada, ajustar antes de COMMIT.
INSERT INTO public.routing_rules (
  workspace_id, schema_version, rule_type, name, priority,
  conditions, event, active
) VALUES (
  'a3843b3f-c337-4836-92b5-89c58bb98490',
  'v1',
  'agent_router',
  'somnio-v4-runtime-wiring-flip',
  1000,
  '{}'::jsonb,                                        -- match-all del workspace
  '{"agent_id": "somnio-sales-v4"}'::jsonb,
  true
);

COMMIT;

-- =================================================================
-- Verificación post-flip (correr después del COMMIT en otra ventana SQL):
-- =================================================================
-- 1) v3 sessions cerradas:
--    SELECT COUNT(*) FROM agent_sessions
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND agent_id='somnio-sales-v3' AND closed_at IS NULL;
--    -- expect: 0
--
-- 2) routing_rule v4 activa:
--    SELECT * FROM routing_rules
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND name='somnio-v4-runtime-wiring-flip' AND active=true;
--    -- expect: 1 row
--
-- 3) próximos webhooks Somnio crearán sessions con agent_id='somnio-sales-v4':
--    SELECT agent_id, COUNT(*) FROM agent_sessions
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND created_at > NOW() - INTERVAL '5 minutes'
--    GROUP BY agent_id;
--    -- expect: somnio-sales-v4 dominante (idealmente único nuevo)
--
-- 4) cost por modelo (D-27):
--    SELECT agent_id, model, purpose, COUNT(*) calls, SUM(cost_usd) total_usd
--    FROM agent_observability_ai_calls
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND agent_id='somnio-sales-v4'
--      AND created_at > NOW() - INTERVAL '15 minutes'
--    GROUP BY agent_id, model, purpose;
--    -- expect: solo gemini-2.5-flash-lite + gpt-4o-mini, CERO claude-haiku
```

**B) Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql`:**

```sql
-- Standalone: somnio-sales-v4-runtime-wiring / Plan 08 — ROLLBACK
--
-- ⚠️ Solo ejecutar si el flip causa problemas y se decide volver a v3.
-- ⚠️ Mecánica: borra la routing_rule de v4. v3 vuelve a recibir 100% del tráfico Somnio.
-- ⚠️ Las sessions v3 cerradas en el flip NO se reabren (clientes vuelven con sesión nueva en v3).
--
-- Decisiones aplicadas:
--   D-23 (rollback): revertir routing rule
--   Padre D-39: clientes que vuelven post-rollback empiezan sesión nueva
--   Padre D-41: v3 sigue recibiendo bug fixes — sigue 100% operativo

BEGIN;

DELETE FROM public.routing_rules
 WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
   AND name = 'somnio-v4-runtime-wiring-flip';

COMMIT;

-- Verificación post-rollback:
-- 1) routing_rule eliminada:
--    SELECT * FROM routing_rules
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND name='somnio-v4-runtime-wiring-flip';
--    -- expect: 0 rows
--
-- 2) próximos webhooks Somnio van a v3 (default):
--    SELECT agent_id, COUNT(*) FROM agent_sessions
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND created_at > NOW() - INTERVAL '5 minutes'
--    GROUP BY agent_id;
--    -- expect: somnio-sales-v3 dominante
--
-- (Las sessions v3 cerradas en el flip permanecen cerradas. Los clientes vuelven con session nueva.)
```

**Anti-pattern aplicado:**
- Pitfall 6: NO usar SERIALIZABLE (READ COMMITTED suficiente)
- Padre D-38: solo cerrar sessions con `closed_at IS NULL` (no re-cerrar las ya cerradas — sobreescribir close_reason corrompe historial)
- Padre D-43: Inngest timers v3 quedan colgados pero el guard checkSessionActive ya existe — no hay que tocarlos
- Regla 5: NO incluir este SQL en el flujo automático de migraciones — el archivo se commitea pero no se aplica

**Verificación:**

```bash
test -f supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql
test -f .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql
grep -q "BEGIN;" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql
grep -q "COMMIT;" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql
grep -q "v4_runtime_wiring_flip" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql
grep -q "agent_id.*somnio-sales-v4" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql
grep -q "DELETE FROM" .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql
```
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql && grep -q "BEGIN;" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql && grep -q "COMMIT;" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql && grep -q "UPDATE public.agent_sessions" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql && grep -q "close_reason = 'v4_runtime_wiring_flip'" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql && grep -q "INSERT INTO public.routing_rules" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql && grep -q "'somnio-sales-v4'" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql && grep -q "closed_at IS NULL" supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql && test -f .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql && grep -q "DELETE FROM public.routing_rules" .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql && grep -q "name = 'somnio-v4-runtime-wiring-flip'" .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql</automated>
  </verify>
  <acceptance_criteria>
    - Archivo flip existe con BEGIN/COMMIT
    - 2 statements: UPDATE agent_sessions + INSERT routing_rules
    - close_reason='v4_runtime_wiring_flip' literal
    - agent_id='somnio-sales-v4' en la INSERT
    - Filter `closed_at IS NULL` en UPDATE (anti corrupción)
    - Archivo rollback existe con DELETE de la regla
    - Comentarios explicativos abundantes (Regla 5 + post-flip queries documentadas)
  </acceptance_criteria>
  <done>SQL flip + rollback documentados.</done>
</task>

<task type="auto">
  <name>Task 2: Commit local del SQL flip + ROLLBACK (sin push de SQL)</name>
  <files>supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql, .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql</files>
  <read_first>
    - CLAUDE.md (Regla 1 — push de código v4 es Task 3, no Task 2; Task 2 solo commit local del SQL)
    - CLAUDE.md (Regla 5 — SQL no auto-apply)
  </read_first>
  <action>
```bash
git add supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql
git commit -m "$(cat <<'EOF'
feat(somnio-v4-runtime-wiring): plan-08 — flip atómico SQL (NO auto-apply)

- supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql:
  - BEGIN; UPDATE agent_sessions SET closed_at=NOW() WHERE agent_id='somnio-sales-v3' AND closed_at IS NULL; INSERT routing_rules('somnio-v4-runtime-wiring-flip', 1000, agent_id='somnio-sales-v4'); COMMIT;
  - Pitfall 6: READ COMMITTED suficiente (sin read-after-write logic)
  - D-23 absorb del Plan 13 padre

- .planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql:
  - DELETE FROM routing_rules WHERE name='somnio-v4-runtime-wiring-flip'
  - Padre D-39: clientes post-rollback con session nueva en v3
  - Padre D-41: v3 sigue 100% operativo durante flip + post-rollback

⚠️ Regla 5: SQL NO se aplica automáticamente. Usuario lo ejecuta MANUAL en Task 4.

Standalone: somnio-sales-v4-runtime-wiring
Decisions: D-23, D-24, D-27 + padre D-38, D-39, D-40, D-41, D-43

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verificar commit:**
```bash
git log -1 --pretty=%s | grep -q "feat(somnio-v4-runtime-wiring): plan-08"
```

**NO push aún.** El push sucede en Task 3 (Regla 1 — código antes que SQL — pero el SQL nunca se auto-aplica, está commiteado para tener el archivo en git tras flip aplicado).
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4-runtime-wiring): plan-08"</automated>
  </verify>
  <acceptance_criteria>
    - Commit local con mensaje plan-08
    - Sin push aún
    - Co-Authored-By line presente
  </acceptance_criteria>
  <done>Commit local listo.</done>
</task>

<task type="auto">
  <name>Task 3: Push de código v4 a Vercel (Plans 04/05/06 + SQL archivo) — Regla 1</name>
  <files>(repo state — push only, no edits)</files>
  <read_first>
    - CLAUDE.md (Regla 1 — push antes de pedir pruebas; Regla 5 — push del SQL archive aunque no se auto-aplica)
    - CLAUDE.md (Regla 6 — verificar que somnio-v3, godentist, recompra, pw-confirmation no se modificaron)
  </read_first>
  <action>
**Pre-push verificación Regla 6 (cero edits a otros agentes):**

```bash
# Verifica que ni v3-production-runner, ni branches de webhook a otros agentes, ni código de otros agentes se editaron:
git diff origin/main..HEAD --name-only | grep -vE "^(src/lib/agents/(somnio-v4|engine)/|src/app/api/sandbox/process/route.ts|src/lib/agents/production/webhook-processor.ts|src/lib/sandbox/types.ts|package.json|package-lock.json|supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql|\\.planning/)" || echo "WARNING: archivos fuera del scope esperado modificados"

# Verifica grep cero claude-haiku-4-5 en somnio-v4 productivo:
grep -rn "claude-haiku-4-5" src/lib/agents/somnio-v4/ | grep -v "__tests__\|TODO\|//"
# expect: 0 lines

# Verifica que routing-engine + agent-lifecycle-router NO se tocaron:
git diff origin/main..HEAD --name-only | grep -E "agent-lifecycle-router|routing-engine"
# expect: empty
```

Si CUALQUIER warning aparece → PARA y revisa antes de push.

**Push:**

```bash
git push origin main
```

**Verificar Vercel deploy:**

1. Vercel dashboard → Deployments → último commit `plan-08` debería triggerear deploy.
2. Esperar a que el build complete (esperado 2-5 min).
3. Verificar logs:
   ```bash
   # En la terminal local, si tienes vercel CLI:
   vercel logs --prod | head -50
   ```
   o vía Vercel UI buscar errores de build.

Si build falla:
- Revisar los logs (probable error TypeScript o env var faltante)
- Fix + commit + push de nuevo
- Repetir hasta build verde

**Verificar runtime productivo (sin tocar tráfico real aún — el flip SQL no está aplicado):**

El branch v4 webhook está en prod pero **DORMIDO** (no hay routing rule). Cero impacto a tráfico actual. Esto es exactamente lo que queremos.

```bash
# Smoke verifica que el deploy productivo responde:
curl -sI https://morfx.app/api/health | head -3
# expect: HTTP/2 200
```

**Documentar en SUMMARY.md (Task 5):**
- Hash commit del push
- Vercel deploy URL
- Build duration
- Estado: branch v4 dormido en prod (sin routing rule activa)
  </action>
  <verify>
    <automated>git log origin/main --oneline -1 | grep -qE "plan-08|somnio-v4-runtime-wiring" && curl -sI https://morfx.app/api/health 2>/dev/null | head -1 | grep -qE "200|HTTP/2 200"</automated>
  </verify>
  <acceptance_criteria>
    - Verificación pre-push pasa (cero edits fuera del scope)
    - Cero `claude-haiku-4-5` en código productivo somnio-v4/
    - Cero edits a routing-engine / agent-lifecycle-router
    - `git push origin main` ejecutado sin error
    - Vercel build verde (manual check)
    - https://morfx.app responde 200 (sanity check deploy)
    - Branch v4 webhook en prod, dormido (sin routing rule activa)
  </acceptance_criteria>
  <done>Código v4 deployado en Vercel prod, en standby.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 4: HALT FINAL — Usuario aplica SQL flip + verifica + confirma</name>
  <what-built>
    Código v4 deployado en Vercel prod (branch v4 webhook dormido). SQL flip listo para aplicación manual.
  </what-built>
  <how-to-verify>
**STOP — FLIP MANUAL D-23 / Regla 5.**

⚠️ ESTE ES EL MOMENTO DECISIVO. Después de aplicar el SQL, v4 recibe 100% del tráfico Somnio.

**Pre-flip checklist:**
- [ ] Smoke A PASS confirmado (Plan 07 Task 3 closed)
- [ ] Push commit plan-08 verde en Vercel (Task 3 confirmado)
- [ ] `morfx.app` responde 200
- [ ] Tienes `.planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql` a la mano
- [ ] Has leído `supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql` y entiendes lo que hace
- [ ] Estás en una ventana de tiempo confortable (recomendado: baja actividad — madrugada Bogotá, o ventana donde puedas monitorear 30-60 min)

**Pasos del usuario (en orden):**

**1. Pre-flip query — verificar que la priority=1000 no está ocupada:**

```sql
-- Supabase Studio (PROD MorfX) → SQL Editor
SELECT priority, name, event FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND rule_type='agent_router'
  AND active=true
ORDER BY priority;
```

Si priority=1000 está ocupada por otra regla → ajustar el INSERT del flip a una priority disponible (ej. 1001 o 999). Editar el archivo SQL antes de ejecutar.

Si no hay reglas con priority=1000 → continuar.

**2. Aplicar el flip:**

- Supabase Studio (PROD MorfX) → SQL Editor
- Copiar `supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql` completo (incluyendo BEGIN/COMMIT)
- Ejecutar
- Verificar que NO hay errores

**3. Post-flip checks (correr en otra ventana SQL):**

```sql
-- v3 sessions cerradas
SELECT COUNT(*) FROM agent_sessions
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id='somnio-sales-v3' AND closed_at IS NULL;
-- expect: 0

-- routing_rule v4 activa
SELECT * FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND name='somnio-v4-runtime-wiring-flip' AND active=true;
-- expect: 1 row
```

**4. Esperar 5-10 minutos** y verificar que webhooks nuevos crean sessions v4:

```sql
SELECT agent_id, COUNT(*) FROM agent_sessions
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND created_at > NOW() - INTERVAL '10 minutes'
GROUP BY agent_id;
-- expect: somnio-sales-v4 dominante (ideal: único nuevo)
```

**5. Monitor primeros 30-60 min:** Inbox UI en `/conversaciones`, observability events. Si algo va mal:
- Aplicar `.planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql`
- Avisar al asistente con razón

**6. Confirmar al asistente:**
- Si exitoso: **"flip aplicado, v4 vivo"**
- Si rollback: **"rollback aplicado, volvimos a v3"** + razón breve

NO continuar al Task 5 hasta confirmación explícita.

**Síntomas esperados post-flip exitoso:**
- Inbox: clientes nuevos de Somnio reciben respuesta razonable (saludo, info de producto, etc.)
- Observability: events `comprehension_completed_v4`, `subloop_*`, `webhook_agent_routed` con agent_id='somnio-sales-v4'
- Cost: queries muestran solo gemini + gpt-4o-mini

**Síntomas que indican rollback:**
- Cliente reporta respuesta absurda
- Server logs muestran 5xx en `/api/webhooks/whatsapp` con stack trace de v4
- Observability event spike en `error` o `subloop_invariant_violation`
- Costo dispara (>$0.01/turn — algo está calling más LLMs de lo esperado)
  </how-to-verify>
  <resume-signal>Usuario escribe "flip aplicado, v4 vivo" o "rollback aplicado"</resume-signal>
</task>

<task type="auto">
  <name>Task 5: Post-flip observability + cost queries + Smoke B reporte + cierre del standalone</name>
  <files>.planning/standalone/somnio-sales-v4-runtime-wiring/08-SMOKE-WAVE-B.md, .planning/standalone/somnio-sales-v4-runtime-wiring/SUMMARY.md</files>
  <read_first>
    - CLAUDE.md (Regla 4 — actualizar docs)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-24, D-27)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
    - .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md
  </read_first>
  <action>
**Tras la confirmación del Task 4** ("flip aplicado, v4 vivo" o "rollback aplicado"):

**A) Si flip aplicado:**

Esperar 30+ minutos para que tráfico real se acumule. Luego correr queries en Supabase Studio:

**Query 1 — Distribución de agentes en sessions nuevas (últimos 30min):**
```sql
SELECT agent_id, COUNT(*) sessions, MIN(created_at) first, MAX(created_at) last
FROM agent_sessions
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND created_at > NOW() - INTERVAL '30 minutes'
GROUP BY agent_id
ORDER BY sessions DESC;
```
Esperado: `somnio-sales-v4` dominante.

**Query 2 — Observability events (D-24):**
```sql
SELECT decision_type, COUNT(*) count, MIN(created_at) first, MAX(created_at) last
FROM agent_observability_events
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id='somnio-sales-v4'
  AND created_at > NOW() - INTERVAL '30 minutes'
GROUP BY decision_type
ORDER BY count DESC;
```
Esperado:
- `webhook_agent_routed` events (uno por webhook procesado por v4)
- `comprehension_completed`, `comprehension_completed_v4`
- `subloop_*` events si hubo low-confidence o razonamiento_libre
- `subloop_invariant_violation` = 0 (BLOCKER si > 0)
- Errores = 0

**Query 3 — Costo por modelo (D-27):**
```sql
SELECT model, purpose, COUNT(*) calls, SUM(input_tokens) in_tok, SUM(output_tokens) out_tok, SUM(cost_usd) total_usd
FROM agent_observability_ai_calls
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id='somnio-sales-v4'
  AND created_at > NOW() - INTERVAL '30 minutes'
GROUP BY model, purpose
ORDER BY total_usd DESC;
```
Esperado:
- `gemini-2.5-flash-lite` rows (purpose: comprehension + subloop_nunca_decir)
- `gpt-4o-mini` rows (purpose: subloop)
- CERO `claude-haiku` rows (BLOCKER si aparece)

**Query 4 — Cualquier error o regression:**
```sql
SELECT decision_type, payload, created_at
FROM agent_observability_events
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id='somnio-sales-v4'
  AND created_at > NOW() - INTERVAL '30 minutes'
  AND (
    decision_type LIKE '%error%' OR
    decision_type LIKE '%fail%' OR
    decision_type = 'subloop_invariant_violation' OR
    decision_type = 'handoff_low_confidence_fallback'
  )
ORDER BY created_at DESC LIMIT 50;
```
Esperado: 0 errores. handoff_low_confidence_fallback events son OK (esperados — D-57). errors / fails / invariant_violation son BLOCKER si aparecen.

**B) Si rollback aplicado:**

Documentar la razón del rollback:
- Mensaje exacto del usuario
- Cuántos turnos v4 alcanzó a procesar antes del rollback
- Errores observados (si los hubo)
- Próximos pasos (probable: gap closure cycle — reabrir Plans 02/05 o investigar Plan 04 webhook routing)

**C) Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/08-SMOKE-WAVE-B.md`:**

```markdown
# Smoke Wave B — PROD con tráfico real (Plan 08)

## Veredicto
- [PASS / ROLLBACK]
- Razón: [...]

## Hash flip
- Commit aplicado: [...]
- Hora aplicación: [Bogota timezone]
- Hora confirmación usuario: [...]

## Post-flip queries (si PASS)
### Query 1: distribución agentes sessions
[paste]

### Query 2: observability events
[paste]

### Query 3: costo por modelo
[paste — confirma solo gemini + gpt-4o-mini]

### Query 4: errores
[paste — esperado vacío]

## Métricas
- Total sessions v4: [N]
- Total turnos: [M]
- Cost USD acumulado 30min: $[X]
- Cost USD por turno promedio: $[Y]
- Anthropic Haiku calls: [N — esperado 0]
- Subloop invocations: [P]
- Invariant violations: [Q — esperado 0]
- Handoff humano triggers: [R — esperados naturalmente vía D-57]

## Comportamiento observado
- [Observaciones cualitativas: clientes responden coherentemente, sub-loop dispara cuando esperado, etc.]

## Próximos standalones (deferred ideas — derivados de este shipping)
- [Si quedó algún gap, listarlo]
- LEARNINGS.md del padre `somnio-sales-v4` (cierre)
- LEARNINGS.md de este standalone runtime-wiring
- `crm-mutation-tools-pw-confirmation-integration` (de MEMORY.md)
- Activación del flag `USE_NO_REPETITION_V4` (futuro standalone)
```

**D) Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/SUMMARY.md` (cierre del standalone):**

```markdown
# SUMMARY — somnio-sales-v4-runtime-wiring

## Estado final
- [v4 LIVE en Somnio prod / ROLLBACKED] (date)

## Plans ejecutados (8 plans, 7 waves)
- 01: Setup deps + V4ProductionRunner clonado [shipped {commit}]
- 02: LoopOutcomeSchema re-shape D-29 + validación post-hoc + E2E test [shipped {commit}]
- 03: engine-v4.ts sandbox wrapper + branch /api/sandbox/process [shipped {commit}]
- 04: webhook-processor.ts branch v4 [shipped {commit}]
- 05: Stack mixto swap (Gemini + GPT-4o mini) [shipped {commit}]
- 06: NoRepetitionFilter wired bajo USE_NO_REPETITION_V4 [shipped {commit}]
- 07: Smoke A sandbox [PASS / FAIL] {commit reporte}
- 08: Smoke B atomic flip prod [PASS / ROLLBACK] {commit reporte + SQL flip + rollback files}

## Decisiones lockeadas
- D-1 to D-30 honrados (ver CONTEXT.md)
- Padre D-31 to D-44 absorbidos en Plan 08 (D-23 absorb)

## Costos finales
- Pre-swap (estimado mensual a 100K turnos): $[?]
- Post-swap (medido 30min post-flip extrapolado): $[?]
- Ahorro: ~$[?]/mes

## Hallazgos críticos resueltos
- H-1 (sub-loop nunca corrió en runtime real): cerrado por Plan 02 + smoke A + flip
- H-2 (Anthropic AI SDK schema rejection): mitigado swap a Gemini + GPT-4o mini
- H-3 (Gemini structured output más permisivo): aprovechado para comprehension

## Próximos standalones
- LEARNINGS.md del padre `somnio-sales-v4`
- LEARNINGS.md de este standalone (post-flip 1 semana D-76 cubre Ventana 1 calibración pasiva)
- `crm-mutation-tools-pw-confirmation-integration`
- `crm-mutation-tools-recompra-integration`
- Activación `USE_NO_REPETITION_V4` (cuando se decida)
- Migración v3 / godentist / recompra / pw-confirmation a Gemini (otros standalones — Regla 6)

## Anti-patrones evitados
- Cero edits a v3-production-runner.ts, engine-v3.ts (Regla 6)
- Cero edits a comprehension/sub-loop de otros agentes (Regla 6)
- SQL no auto-aplicado (Regla 5)
- Push de código antes que SQL (Regla 1)
- Schema flat post-Plan 02 = primera vez que sub-loop corre contra API real (cerró H-1)
```

**E) Update MEMORY.md con cierre:**

```bash
# Append to MEMORY.md (no overwrite):
# Update "Current State" section: somnio-sales-v4-runtime-wiring SHIPPED YYYY-MM-DD
```

(Esto es opcional — depende de si el orquestador del workflow lo hace automáticamente. Si no, escribir manualmente al final.)

**F) Confirmar deploy verde + cierre:**

```bash
# Verifica último commit en origin/main:
git log origin/main --oneline | head -5

# Verifica producción responde:
curl -sI https://morfx.app/api/health | head -1
```
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-sales-v4-runtime-wiring/08-SMOKE-WAVE-B.md && grep -qE "Veredicto|PASS|ROLLBACK" .planning/standalone/somnio-sales-v4-runtime-wiring/08-SMOKE-WAVE-B.md && test -f .planning/standalone/somnio-sales-v4-runtime-wiring/SUMMARY.md && grep -q "Plans ejecutados" .planning/standalone/somnio-sales-v4-runtime-wiring/SUMMARY.md</automated>
  </verify>
  <acceptance_criteria>
    - Si flip aplicado: `08-SMOKE-WAVE-B.md` con Veredicto PASS, queries 1-4 pegadas, métricas calculadas
    - Si rollback: `08-SMOKE-WAVE-B.md` con Veredicto ROLLBACK + razón
    - `SUMMARY.md` cierre del standalone con 8 plans listados + estados + decisiones honradas + próximos standalones
    - Cero `claude-haiku` calls observados en cost query (post-flip success)
    - `subloop_invariant_violation` events = 0
    - https://morfx.app responde 200
  </acceptance_criteria>
  <done>Standalone somnio-sales-v4-runtime-wiring CIERRE.</done>
</task>

</tasks>

<verification>
- SQL flip + ROLLBACK archives commiteados (NO auto-applied)
- Push de código v4 a Vercel hecho ANTES del SQL (Regla 1)
- Pre-flip query verifica priority slot libre
- Atomic flip BEGIN/COMMIT con READ COMMITTED (Pitfall 6)
- Post-flip queries documentan distribución agentes + observability + costos
- Cost confirma stack mixto (Gemini + GPT-4o mini, cero Haiku) — D-30 verified
- Smoke B reporte completo
- SUMMARY.md cierre standalone
</verification>

<success_criteria>
- v4 productivo en Somnio (post-flip success) — atomic flip cerró D-23
- O rollback ejecutado limpiamente — código v4 dormante, v3 sigue 100% operativo
- D-1 a D-30 lockeadas honradas
- H-1 (sub-loop nunca corrió en runtime real) cerrado por Smoke A + B
- Standalone padre `somnio-sales-v4` Plan 13 absorbido (D-23)
- Calibración Ventana 1 (D-76 padre) puede empezar — observación pasiva primera semana post-flip
</success_criteria>

<output>
- `supabase/migrations/20260506999999_somnio_v4_runtime_wiring_flip.sql`
- `.planning/standalone/somnio-sales-v4-runtime-wiring/08-ROLLBACK.sql`
- `.planning/standalone/somnio-sales-v4-runtime-wiring/08-SMOKE-WAVE-B.md` (post-flip queries + métricas + veredicto)
- `.planning/standalone/somnio-sales-v4-runtime-wiring/SUMMARY.md` (cierre standalone)
- (Opcional) Update MEMORY.md "Current State" con shipping date

Hash commit final = HEAD origin/main tras push de Plan 08.
</output>
