---
plan: 13
phase: somnio-sales-v4
wave: 7
depends_on: [12]
files_modified:
  - supabase/migrations/20260501999999_somnio_v4_flip.sql
  - .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql
addresses_decisions: [D-31, D-32, D-33, D-36, D-37, D-38, D-39, D-40, D-41, D-42, D-43, D-44, D-61, D-67, D-73, D-75, D-76, D-78]
addresses_research_pitfalls: [Pitfall 6]
autonomous: false
estimated_tasks: 4
must_haves:
  truths:
    - "Migration archivo existe en supabase/migrations/ pero NO se aplica automáticamente (Regla 5 estricta)"
    - "Archivo contiene 2 statements EXACTOS dentro de BEGIN/COMMIT (D-40)"
    - "Statement 1 cierra v3 sessions del workspace Somnio con close_reason='v4_flip' (D-38)"
    - "Statement 2 inserta routing_rule con event.agent_id='somnio-sales-v4' (D-40)"
    - "Archivo de rollback existe y elimina la routing_rule (D-33)"
    - "Usuario aplica MANUALMENTE en prod en momento elegido (D-31)"
    - "Post-flip: v4 recibe 100% del tráfico Somnio sin ajustes adicionales (D-31, D-44)"
  artifacts:
    - path: "supabase/migrations/20260501999999_somnio_v4_flip.sql"
      provides: "SQL atómico de flip — close v3 sessions + insert routing rule"
      contains: "BEGIN;"
    - path: ".planning/standalone/somnio-sales-v4/13-ROLLBACK.sql"
      provides: "Rollback a v3 — DELETE routing_rule"
      contains: "DELETE FROM routing_rules"
  key_links:
    - from: "Webhook entrante post-flip"
      to: "routing-engine consultando routing_rules"
      via: "regla con event.agent_id='somnio-sales-v4'"
      pattern: "agent_id.*somnio-sales-v4"
    - from: "Sesiones v3 abiertas pre-flip"
      to: "agent_sessions.closed_at = NOW()"
      via: "UPDATE bulk en transacción"
      pattern: "close_reason = 'v4_flip'"
---

<objective>
Wave 6 — flip atómico. ESTE ES EL ÚLTIMO PLAN.

D-40 obliga 2 SQL statements en BEGIN/COMMIT:
1. UPDATE agent_sessions: cerrar todas las sesiones v3 abiertas del workspace Somnio (D-38).
2. INSERT routing_rules: regla que asigna `agent_id='somnio-sales-v4'` para tráfico Somnio (D-31).

D-31 — flip total bajo comando del usuario. Sin shadow, sin A/B. El SQL NO se aplica automáticamente — el usuario lo corre manualmente en el momento que decida.

Pitfall 6: BEGIN/COMMIT bajo READ COMMITTED es suficiente; no hace falta SERIALIZABLE.

Output: 1 archivo SQL de flip + 1 archivo SQL de rollback + commit (sin push automático del SQL — el archivo solo documenta).

**IMPORTANTE:** Antes del flip, Plan 12 debió cerrar con smoke PASS del usuario. Si Plan 12 falló, NO ejecutar este Plan.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@supabase/migrations/20260425220000_agent_lifecycle_router.sql
</context>

<interfaces>
<!-- routing_rules schema (PATTERNS sección "YYYYMMDD_somnio_v4_flip.sql") -->
Columnas: `workspace_id` (UUID), `schema_version` (TEXT), `rule_type` (TEXT), `name` (TEXT), `priority` (INT 1-100000), `conditions` (JSONB), `event` (JSONB), `active` (BOOLEAN).

UNIQUE constraint: `(workspace_id, rule_type, priority) WHERE active=true`.

<!-- agent_sessions schema (anti-Pitfall 6) -->
Para cerrar v3 sessions:
```sql
UPDATE agent_sessions
SET closed_at = timezone('America/Bogota', NOW()),
    close_reason = 'v4_flip',
    current_mode = 'closed'
WHERE workspace_id = '<somnio>'
  AND agent_id = 'somnio-sales-v3'
  AND closed_at IS NULL;
```

<!-- D-43: Inngest timers v3 quedan colgados pero hacen no-op por checkSessionActive guard -->
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo de flip + archivo de rollback con instrucciones</name>
  <files>supabase/migrations/20260501999999_somnio_v4_flip.sql, .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "YYYYMMDD_somnio_v4_flip.sql" — pattern verbatim)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (§Example 4 + Pitfall 6)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-31, D-38, D-40, D-43)
    - supabase/migrations/20260425220000_agent_lifecycle_router.sql (routing_rules schema)
  </read_first>
  <action>
**A) `supabase/migrations/20260501999999_somnio_v4_flip.sql`:**

Timestamp `999999` deliberado al final del 2026-05-01 para que el archivo aparezca al final de la lista alfabética en `supabase/migrations/`. Un naming alternativo válido si causa confusión es `20260501230000_somnio_v4_flip.sql` — el executor puede ajustar según convención del proyecto.

```sql
-- Standalone: somnio-sales-v4 / Plan 13 — FLIP ATÓMICO
--
-- ⚠️ REGLA 5 ESTRICTA: este SQL NO se aplica automáticamente.
-- ⚠️ El usuario lo ejecuta MANUALMENTE en Supabase Studio cuando decide hacer el flip.
-- ⚠️ Antes del flip, Plan 12 (smoke) debe estar PASS.
-- ⚠️ Después del flip: v4 recibe 100% del tráfico Somnio (D-31).
-- ⚠️ Para revertir: ver .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql
--
-- Atomicidad: BEGIN/COMMIT con READ COMMITTED es suficiente (RESEARCH Pitfall 6).
-- No hace falta SERIALIZABLE — la transacción no tiene read-after-write logic.
--
-- Decisiones aplicadas:
--   D-31: flip total bajo comando del usuario
--   D-38: close hard de todas las sesiones v3 abiertas
--   D-40: 2 statements en BEGIN/COMMIT
--   D-43: Inngest timers v3 hacen no-op vía checkSessionActive guard

BEGIN;

-- =================================================================
-- Statement 1: cerrar todas las sesiones v3 abiertas del workspace Somnio (D-38)
-- =================================================================
UPDATE public.agent_sessions
SET
  closed_at = timezone('America/Bogota', NOW()),
  close_reason = 'v4_flip',
  current_mode = 'closed'
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id = 'somnio-sales-v3'
  AND closed_at IS NULL;

-- =================================================================
-- Statement 2: insertar routing rule v4 (D-40)
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
  'somnio-v4-flip',
  1000,
  '{}'::jsonb,                                    -- match-all del workspace
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
--      AND name='somnio-v4-flip' AND active=true;
--    -- expect: 1 row
--
-- 3) próximos webhooks Somnio crearán sessions con agent_id='somnio-sales-v4':
--    SELECT agent_id, COUNT(*) FROM agent_sessions
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND created_at > NOW() - INTERVAL '5 minutes'
--    GROUP BY agent_id;
--    -- expect: somnio-sales-v4 dominante
```

**B) `.planning/standalone/somnio-sales-v4/13-ROLLBACK.sql`:**

```sql
-- Standalone: somnio-sales-v4 / Plan 13 — ROLLBACK
--
-- ⚠️ Solo ejecutar si el flip causa problemas y se decide volver a v3.
-- ⚠️ Mecánica: borra la routing_rule de v4. v3 vuelve a recibir 100% del tráfico.
-- ⚠️ Las sessions v3 cerradas en el flip NO se reabren (D-39 inverso — clientes vuelven con sesión nueva en v3).
--
-- Decisiones aplicadas:
--   D-33: rollback = revertir routing rule
--   D-39: clientes que vuelven post-rollback empiezan sesión nueva
--   D-41: v3 sigue recibiendo bug fixes — sigue 100% operativo

BEGIN;

DELETE FROM public.routing_rules
 WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
   AND name = 'somnio-v4-flip';

COMMIT;

-- Verificación post-rollback:
-- 1) routing_rule eliminada:
--    SELECT * FROM routing_rules
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND name='somnio-v4-flip';
--    -- expect: 0 rows
--
-- 2) próximos webhooks Somnio van a v3 (default):
--    SELECT agent_id, COUNT(*) FROM agent_sessions
--    WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
--      AND created_at > NOW() - INTERVAL '5 minutes'
--    GROUP BY agent_id;
--    -- expect: somnio-sales-v3 dominante
--
-- (Las sessions v3 cerradas en el flip permanecen cerradas. Los clientes vuelven con session nueva — D-44.)
```

**Anti-patterns aplicados:**
- Pitfall 6: NO usar SERIALIZABLE
- D-38: solo cerrar sessions con `closed_at IS NULL` (no re-cerrar las ya cerradas — sobreescribir close_reason corrompe historial)
- D-43: Inngest timers v3 quedan colgados pero el guard checkSessionActive ya existe — no hay que tocarlos
- NO incluir este SQL en el flujo automático de migraciones — Regla 5 estricta
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260501999999_somnio_v4_flip.sql && grep -q "BEGIN;" supabase/migrations/20260501999999_somnio_v4_flip.sql && grep -q "COMMIT;" supabase/migrations/20260501999999_somnio_v4_flip.sql && grep -q "UPDATE public.agent_sessions" supabase/migrations/20260501999999_somnio_v4_flip.sql && grep -q "close_reason = 'v4_flip'" supabase/migrations/20260501999999_somnio_v4_flip.sql && grep -q "INSERT INTO public.routing_rules" supabase/migrations/20260501999999_somnio_v4_flip.sql && grep -q "'somnio-sales-v4'" supabase/migrations/20260501999999_somnio_v4_flip.sql && grep -q "closed_at IS NULL" supabase/migrations/20260501999999_somnio_v4_flip.sql && test -f .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql && grep -q "DELETE FROM public.routing_rules" .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql && grep -q "name = 'somnio-v4-flip'" .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql</automated>
  </verify>
  <acceptance_criteria>
    - Archivo flip existe con BEGIN/COMMIT
    - 2 statements: UPDATE agent_sessions + INSERT routing_rules
    - close_reason='v4_flip' literal
    - agent_id='somnio-sales-v4' en la INSERT
    - Filter `closed_at IS NULL` en UPDATE (anti corrupción)
    - Archivo rollback existe con DELETE de la regla
    - Comentarios explicativos abundantes
  </acceptance_criteria>
  <done>SQL flip + rollback documentados.</done>
</task>

<task type="auto">
  <name>Task 2: Commit local de los SQL files (sin push hasta confirmación)</name>
  <files>supabase/migrations/20260501999999_somnio_v4_flip.sql, .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql</files>
  <read_first>
    - CLAUDE.md (Reglas 1, 5)
  </read_first>
  <action>
```bash
git add supabase/migrations/20260501999999_somnio_v4_flip.sql .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql
git commit -m "feat(somnio-v4): plan-13 — flip atómico SQL (NO auto-apply)

- supabase/migrations/20260501999999_somnio_v4_flip.sql:
  - BEGIN; UPDATE agent_sessions SET closed_at=NOW() WHERE agent_id='somnio-sales-v3' AND closed_at IS NULL; INSERT routing_rules('somnio-v4-flip', 1000, agent_id='somnio-sales-v4'); COMMIT;
  - Pitfall 6: READ COMMITTED suficiente (sin read-after-write logic)
  - D-38 D-40 D-31

- .planning/standalone/somnio-sales-v4/13-ROLLBACK.sql:
  - DELETE FROM routing_rules WHERE name='somnio-v4-flip'
  - D-33: revertir rule = volver a v3
  - D-39: clientes post-rollback con session nueva en v3

⚠️ Regla 5: SQL NO se aplica automáticamente. Usuario lo ejecuta MANUAL en momento elegido.

Standalone: somnio-sales-v4
Decisions: D-31, D-32, D-33, D-38, D-39, D-40, D-41, D-43, D-44

Co-Authored-By: Claude <noreply@anthropic.com>"
```

NO push hasta el HALT del Task 3 confirme.
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-13"</automated>
  </verify>
  <acceptance_criteria>
    - Commit local con mensaje plan-13
    - Sin push aún
  </acceptance_criteria>
  <done>Commit local listo.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: HALT FINAL — Usuario ejecuta el flip en prod</name>
  <what-built>
    Archivo SQL de flip listo. Cero tráfico actual a v4.
  </what-built>
  <how-to-verify>
**STOP — FLIP MANUAL D-31 / Regla 5.**

⚠️ ESTE ES EL MOMENTO DECISIVO. Después de aplicar el SQL, v4 recibe 100% del tráfico Somnio.

**Antes del flip, verifica:**
- [ ] Plan 12 cerró con "smoke v4 PASS — listo para flip"
- [ ] Estás en una ventana de tiempo confortable (preferentemente baja-actividad — RESEARCH recomienda 3am Bogota como buena ventana, pero no es estrictamente necesario)
- [ ] Tienes el archivo `.planning/standalone/somnio-sales-v4/13-ROLLBACK.sql` a la mano por si necesitas revertir
- [ ] Has revisado el contenido de `supabase/migrations/20260501999999_somnio_v4_flip.sql` y entiendes lo que hace

**Pasos del usuario:**

1. **Pre-flip query** — verificar que la priority=1000 no está ocupada:
```sql
SELECT priority, name FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND rule_type='agent_router'
  AND active=true
ORDER BY priority;
```
Si priority=1000 está ocupada por otra regla, ajustar el INSERT del flip a una priority disponible (ej. 1001).

2. **Aplicar el flip:**
   - Supabase Studio → SQL Editor (PROD MorfX)
   - Copiar `supabase/migrations/20260501999999_somnio_v4_flip.sql` completo (incluyendo BEGIN/COMMIT)
   - Ejecutar
   - Verificar que NO hay errores

3. **Post-flip checks (correr en otra ventana SQL):**
```sql
-- v3 sessions cerradas
SELECT COUNT(*) FROM agent_sessions
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id='somnio-sales-v3' AND closed_at IS NULL;
-- expect: 0

-- routing_rule v4 activa
SELECT * FROM routing_rules
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND name='somnio-v4-flip' AND active=true;
-- expect: 1 row
```

4. **Esperar 5-10 minutos** y verificar que webhooks nuevos crean sessions v4:
```sql
SELECT agent_id, COUNT(*) FROM agent_sessions
WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'
  AND created_at > NOW() - INTERVAL '10 minutes'
GROUP BY agent_id;
-- expect: somnio-sales-v4 dominante (idealmente único)
```

5. **Monitor primero 30 min:** revisar Inbox UI, observability events. Si algo va mal:
   - Aplicar `.planning/standalone/somnio-sales-v4/13-ROLLBACK.sql`
   - Avisar al asistente
6. **Confirmar al asistente:**
   - Si exitoso: "flip aplicado, v4 vivo"
   - Si rollback: "rollback aplicado, volvimos a v3"

NO continuar al Task 4 hasta confirmación explícita.
  </how-to-verify>
  <resume-signal>Usuario escribe "flip aplicado, v4 vivo" o "rollback aplicado"</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Push tras confirmación + cierre de standalone</name>
  <files>(repo state actual)</files>
  <read_first>
    - CLAUDE.md (Reglas 1, 4)
  </read_first>
  <action>
Tras la confirmación del Task 3:

1. Push:
```bash
git push origin main
```

2. Crear `.planning/standalone/somnio-sales-v4/SUMMARY.md` (cierre del standalone) con:
   - Lista de los 13 plans + outcome de cada uno
   - Total commits
   - Estado final: v4 LIVE en Somnio (o ROLLBACKED)
   - Próximos standalones (deferred ideas):
     - `somnio-handoff-sla-monitoring`
     - `somnio-sales-v3-deprecation`
     - `crm-mutation-tools-pw-confirmation-integration`
     - `somnio-sales-v4-confidence-schema-pivot` (contingency post 4 semanas)

3. Actualizar `MEMORY.md` (si aplica) con: "somnio-sales-v4 SHIPPED YYYY-MM-DD" + breve descripción.

4. (Opcional) Crear PR comment / mensaje resumen para el usuario.
  </action>
  <verify>
    <automated>git log origin/main --oneline | head -3 | grep -q "plan-13" && test -f .planning/standalone/somnio-sales-v4/SUMMARY.md</automated>
  </verify>
  <acceptance_criteria>
    - Commit plan-13 en origin/main
    - SUMMARY.md de standalone creado
    - (Si flip aplicado) v4 procesando tráfico Somnio en prod
    - (Si rollback) v3 sigue procesando tráfico — código v4 dormante (sin routing rule), zero impacto
  </acceptance_criteria>
  <done>Standalone somnio-sales-v4 cierre.</done>
</task>

</tasks>

<policy_only_decisions_note>
<!-- W-01 (revision): the following decisions are policy-only — they do NOT
     produce code changes but are captured here in the final flip plan as a
     project-wide audit trail. They live in CONTEXT.md as locked decisions
     governing operation, calibration cadence, and process for v4 in production: -->

- D-36: monitoreo de calibración via dashboard (sin código nuevo en V1)
- D-37: criterio para pivot a confidence_calibration enum si métricas lo justifican
- D-42: criterio de "v4 stable" antes de deprecar v3 (>= N semanas + tasas observability)
- D-61: política de cuándo escalar threshold global vs por intent (parametrizable D-11)
- D-67: prohibición de agregar campos schema-side al comprehension output (locked)
- D-73: política de promoción humano-en-el-loop para clusters (PR review obligatorio)
- D-75: cadencia de revisión de unknown_cases backlog (operador, no automated)
- D-76: ventanas de calibración post-flip (Ventana 1 = pasiva, Ventana 2+ = ajustes)
- D-78: criterio de "agent ready for non-Somnio rollout" (post-V1 — futuro standalone)

Estas decisiones están registradas en CONTEXT.md y se aplican operacionalmente.
Plan 13 las agrupa aquí porque son las que rigen el ciclo de vida post-flip de v4.
</policy_only_decisions_note>

<verification>
- SQL flip aplicado por usuario manualmente
- Post-flip queries confirman estado correcto
- v4 procesando tráfico (o rollback ejecutado limpiamente)
- Push final hecho
- SUMMARY.md de cierre creado
</verification>

<success_criteria>
- v4 productivo (o rollback limpio si se decidió)
- Calibración Ventana 1 (D-76) puede empezar — observación pasiva primera semana
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/13-SUMMARY.md` con:
- Pre-flip queries output (priority disponible)
- Post-flip queries output (sessions cerradas + rule activa)
- Confirmación de tráfico llegando a v4 (o rollback log)
- Hash commits

También crear `.planning/standalone/somnio-sales-v4/SUMMARY.md` (cierre del standalone completo).
</output>
