---
phase: client-activation-auto-revoke
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260428160000_client_activation_revoke.sql
  - docs/analysis/04-estado-actual-plataforma.md
  - .planning/standalone/client-activation-auto-revoke/LEARNINGS.md
autonomous: false
requirements:
  - LR-1
  - LR-2
  - LR-3
  - LR-4
  - LR-5
  - LR-6
  - LR-7
  - D-01
  - D-02
  - D-03
  - D-04
  - D-05

must_haves:
  truths:
    - "Archivo `supabase/migrations/20260428160000_client_activation_revoke.sql` existe en git con CREATE OR REPLACE FUNCTION mark_client_on_stage_change() conteniendo ramas IN/OUT (ambas direcciones de cruce de frontera del set activador)"
    - "El cuerpo de la funcion NO contiene `v_tag_id` ni `INSERT INTO contact_tags` ni referencia literal a `'Cliente'` (D-05 dead code drop)"
    - "El cuerpo de la funcion usa `IS NOT DISTINCT FROM` para la guarda de stage_id igual (Pitfall 1 RESEARCH — manejo NULL correcto)"
    - "El cuerpo de la funcion usa `OLD.contact_id` (no `NEW.contact_id`) en la subquery EXISTS de la rama OUT (RQ-2.a RESEARCH)"
    - "La migracion crea `CREATE INDEX IF NOT EXISTS idx_orders_contact_stage ON orders (contact_id, stage_id)` (RQ-2.d RESEARCH — composite index para EXISTS hot path)"
    - "La migracion incluye un bloque `DO $$ ... LOOP ... END $$` que itera workspaces con `enabled = true AND array_length(activation_stage_ids, 1) > 0`, hace UPDATE reset a `is_client=false` + UPDATE set a `is_client=true` para contactos con orden en activator stages, y emite `RAISE NOTICE` con conteos por workspace (D-04 + Refinement RESEARCH)"
    - "La migracion incluye guard idempotente para `ALTER PUBLICATION supabase_realtime ADD TABLE contacts` (Pitfall 5 RESEARCH — defensive, catch duplicate_object)"
    - "La migracion NO contiene `DROP TRIGGER orders_mark_client_on_stage` ni `CREATE TRIGGER orders_mark_client_on_stage` — el trigger binding del 2026-02-21 sigue valido por CREATE OR REPLACE FUNCTION del cuerpo solamente"
    - "Migracion aplicada en Supabase production ANTES del push (Regla 5). Usuario ejecuta SQL en Supabase SQL Editor + valida con queries del bundle UAT + queries cross-check 3 y 4 del RESEARCH §Production Verification SQL Bundle"
    - "Query `SELECT phone, is_client FROM contacts WHERE phone = '3137549286'` devuelve `is_client = false` post-deploy (verificacion del bug-fix original — D-04 backfill habra cubierto el caso)"
    - "Query cross-check 3 (`contacts.is_client=true sin orden en activator stage`) devuelve 0 filas — backfill consistente"
    - "Query cross-check 4 (`contacts.is_client=false con orden activa en activator stage`) devuelve 0 filas — backfill consistente"
    - "Push a `origin main` ejecutado SOLO despues de que usuario confirma migracion aplicada y queries cross-check pasan (Regla 5 sequencing strict)"
    - "Documentacion actualizada en `docs/analysis/04-estado-actual-plataforma.md` lineas 176-186 (seccion 2.5 Client Activation Badge) y 730 (seccion Triggers DB) reflejando comportamiento bidireccional + dead code Cliente tag removed"
    - "Archivo `.planning/standalone/client-activation-auto-revoke/LEARNINGS.md` creado con D-05 finding + EXISTS/OLD.contact_id pattern + DO $$ + RAISE NOTICE backfill pattern + Regla 5 simplest-variant lesson"
  artifacts:
    - path: "supabase/migrations/20260428160000_client_activation_revoke.sql"
      provides: "CREATE OR REPLACE FUNCTION (IN/OUT branches) + composite index + DO $$ backfill + idempotent realtime publication guard"
      contains: "CREATE OR REPLACE FUNCTION mark_client_on_stage_change"
    - path: "docs/analysis/04-estado-actual-plataforma.md"
      provides: "Documentacion sincronizada — Seccion 2.5 + Triggers DB describen comportamiento bidireccional (Regla 4)"
      contains: "is_client"
    - path: ".planning/standalone/client-activation-auto-revoke/LEARNINGS.md"
      provides: "LEARNINGS post-cierre — patterns reusables + finding D-05"
      contains: "EXISTS"
  key_links:
    - from: "supabase/migrations/20260428160000_client_activation_revoke.sql"
      to: "trigger orders_mark_client_on_stage (existente, NO se recrea)"
      via: "CREATE OR REPLACE FUNCTION mark_client_on_stage_change — el binding del 2026-02-21 apunta al mismo nombre"
      pattern: "CREATE OR REPLACE FUNCTION mark_client_on_stage_change"
    - from: "supabase/migrations/20260428160000_client_activation_revoke.sql DO $$ block"
      to: "client_activation_config (filtra enabled=true) + contacts.is_client + orders.stage_id = ANY(activation_stage_ids)"
      via: "Bulk UPDATE con GET DIAGNOSTICS + RAISE NOTICE per-workspace"
      pattern: "FOR v_workspace_id, v_stage_ids IN.*LOOP"
    - from: "trigger UNSET branch"
      to: "EXISTS check on OLD.contact_id (no NEW.contact_id) — RQ-2.a"
      via: "EXISTS (SELECT 1 FROM orders WHERE contact_id = OLD.contact_id AND ... AND id <> NEW.id)"
      pattern: "OLD.contact_id"
---

<objective>
Wave 1 — Migracion DB unica + cierre del bug productivo de `is_client`. Crea el archivo `supabase/migrations/20260428160000_client_activation_revoke.sql` que: (1) reemplaza el cuerpo de la funcion `mark_client_on_stage_change()` con logica bidireccional IN/OUT (rama OUT nueva con EXISTS sobre `OLD.contact_id` excluyendo el orden que dispara), (2) elimina el bloque legacy de `Cliente` tag (D-05 — dead code, zero consumers en src/), (3) anade composite index `idx_orders_contact_stage` para acelerar el EXISTS hot path (RQ-2.d), (4) ejecuta backfill global via bloque `DO $$` que itera workspaces con `enabled=true AND array_length(activation_stage_ids,1)>0`, emitiendo `RAISE NOTICE` con conteos por workspace, (5) guarda idempotentemente `ALTER PUBLICATION supabase_realtime ADD TABLE contacts` (Pitfall 5).

Tras commit local, **PAUSA estricta Regla 5**: el usuario aplica el SQL en Supabase SQL Editor production, valida con bundle de queries UAT (CONTEXT.md lineas 144-151) + queries cross-check 3 y 4 del RESEARCH §Production Verification SQL Bundle, y solo entonces se hace push a `origin main`. Cierra con actualizacion de `docs/analysis/04-estado-actual-plataforma.md` (Regla 4) y archivo `LEARNINGS.md` capturando D-05 finding + patterns reusables.

Purpose: Cerrar el bug productivo del contacto `3137549286` (y todos los contactos historicamente mal marcados) en una sola pasada. Restaurar la decision correcta del `agent-lifecycle-router` priority-900 — clientes que se devolvieron / cancelaron deben enrutar a `somnio-sales-v3` (primera compra), no a `somnio-recompra-v1`. La logica viva en el trigger garantiza atomicidad TX (D-03) y elimina el riesgo de bypass desde cualquier ruta de mutacion (domain layer, SQL manual, automations, agentes).

Output: 1 archivo SQL en git + aplicado en prod + 2 archivos doc actualizados + 1 archivo LEARNINGS + push final del repo.

**CRITICAL — Regla 5 (variante mas simple del codebase):** No hay codigo dependiente — la app sigue leyendo `contacts.is_client` igual antes/despues. La unica restriccion sequencing es: commit migracion local → PAUSA → usuario aplica + valida → push. Failure mode acotado: si SQL falla en SQL Editor, el comportamiento previo (one-way trigger) sigue funcionando, no rompe nada en runtime.

**CRITICAL — Regla 3 EXENTA:** D-03 explicitamente eligio Postgres trigger sobre domain layer. La logica de `is_client` vive en DB por diseno. Esta migracion NO toca `src/lib/domain/client-activation.ts` (sigue sirviendo al boton "Recalcular" del standalone `client-activation-backfill`).

**CRITICAL — Regla 6 NO aplica:** No es comportamiento de agente nuevo. Es bug-fix del fact `isClient` (`src/lib/agents/routing/facts.ts:187-194`) que empieza a devolver `false` correcto en vez de `true` stale. CONTEXT.md explicitamente prohibe feature flag — no hay rollback deseable, el comportamiento previo era buggy.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/client-activation-auto-revoke/CONTEXT.md — D-01..D-05 lockeadas, lista NO-hacer
@.planning/standalone/client-activation-auto-revoke/RESEARCH.md — §Trigger SQL Pattern (cuerpo final drop-in), §Backfill Strategy (DO $$ refinement), §Production Verification SQL Bundle, §Pitfall 1-7
@supabase/migrations/20260221000000_client_activation_badge.sql — funcion original que se REEMPLAZA via CREATE OR REPLACE (NO drop+recreate, solo cuerpo)
@supabase/migrations/20260203000001_crm_whatsapp_sync.sql — origen historico del legacy `Cliente` tag (lineas 74-120, ya parcialmente removido)
@supabase/migrations/20260422142336_crm_stage_integrity.sql — pattern reference para header conventions + idempotency guards
@src/lib/domain/client-activation.ts — pattern reference de backfill semantics (NO se modifica — sigue valido para boton "Recalcular")
@src/lib/agents/routing/facts.ts — `isClient` fact resolver (live DB read, no cache)
@src/lib/domain/contacts.ts — `getContactIsClient` hot path
@docs/analysis/04-estado-actual-plataforma.md — lineas 176-186 (Seccion 2.5 Client Activation Badge) + linea 730 (Triggers DB) — DEBEN actualizarse (Regla 4)
@CLAUDE.md §Regla 3 (domain layer — EXENTA por D-03), §Regla 4 (docs sincronizadas), §Regla 5 (migracion antes de push — STRICT aqui)

<interfaces>
<!-- Funcion final que reemplaza el cuerpo del 2026-02-21 (CREATE OR REPLACE deja trigger binding intacto) -->
CREATE OR REPLACE FUNCTION mark_client_on_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_workspace_id UUID;
  v_old_in_set BOOLEAN;
  v_new_in_set BOOLEAN;
  v_other_exists BOOLEAN;
BEGIN
  -- ... ver Task 1 para cuerpo COMPLETO
END;
$$;

<!-- Trigger binding existente (NO recrear) -->
-- CREATE TRIGGER orders_mark_client_on_stage
--   AFTER INSERT OR UPDATE ON orders
--   FOR EACH ROW
--   EXECUTE FUNCTION mark_client_on_stage_change();

<!-- Index nuevo (RQ-2.d) -->
CREATE INDEX IF NOT EXISTS idx_orders_contact_stage ON orders (contact_id, stage_id);

<!-- Backfill DO $$ (D-04 + Refinement RESEARCH) -->
DO $$
DECLARE
  v_workspace_id UUID;
  v_stage_ids UUID[];
  v_reset_count INTEGER;
  v_set_count INTEGER;
BEGIN
  FOR v_workspace_id, v_stage_ids IN
    SELECT workspace_id, activation_stage_ids
    FROM client_activation_config
    WHERE enabled = true AND array_length(activation_stage_ids, 1) > 0
  LOOP
    -- ... ver Task 1 para cuerpo COMPLETO
  END LOOP;
END $$;

<!-- Idempotent realtime guard (Pitfall 5) -->
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear migracion `supabase/migrations/20260428160000_client_activation_revoke.sql` (drop-in del RESEARCH)</name>
  <read_first>
    - .planning/standalone/client-activation-auto-revoke/CONTEXT.md (D-01..D-05 + lista NO-hacer)
    - .planning/standalone/client-activation-auto-revoke/RESEARCH.md §Trigger SQL Pattern (cuerpo final completo, lineas 117-225), §Backfill Strategy (DO $$ refinado, lineas 265-312), §Pitfall 5 (realtime guard idempotente, lineas 449-462), §Pitfall 1-3-7 (NULL handling + v_tag_id drop + cache misconception)
    - supabase/migrations/20260221000000_client_activation_badge.sql — la funcion original que se REEMPLAZA (verificar literalmente que NO se hace `DROP FUNCTION` ni `DROP TRIGGER orders_mark_client_on_stage` — solo `CREATE OR REPLACE FUNCTION` del cuerpo)
    - supabase/migrations/20260422142336_crm_stage_integrity.sql — pattern de header conventions + idempotency
    - supabase/migrations/20260428000000_agent_audit_sessions.sql — confirma que el slot `20260428160000` no colisiona con migracion existente del mismo dia
  </read_first>
  <action>
    Crear archivo `supabase/migrations/20260428160000_client_activation_revoke.sql` con el contenido **literal exacto** que sigue (copiado verbatim de RESEARCH.md §Trigger SQL Pattern + §Backfill Strategy + §Pitfall 5). NO improvisar — el SQL ya esta validado en research.

    ```sql
    -- =============================================================================
    -- client-activation-auto-revoke — bidirectional is_client trigger + global backfill
    -- =============================================================================
    -- Reemplaza el cuerpo de mark_client_on_stage_change() (creado en 20260221000000)
    -- para que tambien revoque is_client=false cuando un contacto ya no tiene ordenes
    -- en activation_stage_ids. Drop dead-code Cliente tag block (D-05). Anade composite
    -- index idx_orders_contact_stage para acelerar EXISTS hot path. Ejecuta backfill
    -- global automatico al final.
    --
    -- Idempotente: CREATE OR REPLACE FUNCTION + CREATE INDEX IF NOT EXISTS + ON CONFLICT
    -- + DO $$ con WHERE gates. Replay safe.
    --
    -- Trigger binding `orders_mark_client_on_stage` (creado el 2026-02-21) sigue VALIDO —
    -- esta migracion NO ejecuta DROP TRIGGER ni CREATE TRIGGER, solo reemplaza el cuerpo
    -- de la funcion a la que el trigger ya apunta.
    --
    -- Regla 5: aplicar en Supabase SQL Editor production ANTES del push de este commit.
    -- Regla 3: EXENTA por D-03 — la logica de is_client vive en DB por diseno.
    -- Regla 6: NO aplica — es bug-fix, no cambio de comportamiento de agente. CONTEXT.md
    --          prohibe feature flag explicitamente.
    -- =============================================================================

    -- 1) CREATE OR REPLACE FUNCTION — bidirectional IN/OUT logic, dead-code Cliente tag dropped
    CREATE OR REPLACE FUNCTION mark_client_on_stage_change()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_config RECORD;
      v_workspace_id UUID;
      v_old_in_set BOOLEAN;
      v_new_in_set BOOLEAN;
      v_other_exists BOOLEAN;
    BEGIN
      -- Skip if no contact linked
      IF NEW.contact_id IS NULL THEN
        RETURN NEW;
      END IF;

      -- On UPDATE, only fire if stage_id actually changed (Pitfall 1: IS NOT DISTINCT FROM handles NULL)
      IF TG_OP = 'UPDATE' AND OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
        RETURN NEW;
      END IF;

      v_workspace_id := NEW.workspace_id;

      -- Load config; skip if missing or disabled
      SELECT enabled, activation_stage_ids
      INTO v_config
      FROM client_activation_config
      WHERE workspace_id = v_workspace_id;

      IF NOT FOUND OR NOT v_config.enabled THEN
        RETURN NEW;
      END IF;

      -- D-02: classify boundary crossing
      v_new_in_set := NEW.stage_id = ANY(v_config.activation_stage_ids);

      IF TG_OP = 'INSERT' THEN
        -- INSERT to activator => IN; INSERT outside => skip
        IF v_new_in_set THEN
          UPDATE contacts
          SET is_client = true
          WHERE id = NEW.contact_id
            AND workspace_id = v_workspace_id
            AND is_client = false;
        END IF;
        RETURN NEW;
      END IF;

      -- TG_OP = 'UPDATE' from here on
      v_old_in_set := OLD.stage_id = ANY(v_config.activation_stage_ids);

      -- Skip internal transitions (both inside or both outside the set)
      IF v_old_in_set = v_new_in_set THEN
        RETURN NEW;
      END IF;

      IF v_new_in_set AND NOT v_old_in_set THEN
        -- IN: order entered the activator set
        UPDATE contacts
        SET is_client = true
        WHERE id = NEW.contact_id
          AND workspace_id = v_workspace_id
          AND is_client = false;
        RETURN NEW;
      END IF;

      -- OUT: v_old_in_set AND NOT v_new_in_set
      -- D-03 edge case: only flip false if NO OTHER order of this contact remains in the set.
      -- Use OLD.contact_id (RQ-2.a RESEARCH) when checking "other orders" so a same-TX contact
      -- reassignment doesn't leave the previous owner falsely marked as client.
      SELECT EXISTS (
        SELECT 1 FROM orders
        WHERE contact_id = OLD.contact_id
          AND workspace_id = v_workspace_id
          AND stage_id = ANY(v_config.activation_stage_ids)
          AND id <> NEW.id
      ) INTO v_other_exists;

      IF NOT v_other_exists THEN
        UPDATE contacts
        SET is_client = false
        WHERE id = OLD.contact_id
          AND workspace_id = v_workspace_id
          AND is_client = true;
      END IF;

      -- Defensive: if contact_id was reassigned (OLD.contact_id <> NEW.contact_id) AND new
      -- contact now has its first order in an activator stage, also mark new contact.
      IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND v_new_in_set THEN
        UPDATE contacts
        SET is_client = true
        WHERE id = NEW.contact_id
          AND workspace_id = v_workspace_id
          AND is_client = false;
      END IF;

      RETURN NEW;
    END;
    $$;

    -- Trigger binding `orders_mark_client_on_stage` (created 2026-02-21) stays valid —
    -- CREATE OR REPLACE FUNCTION above replaces only the body that the existing trigger
    -- already references. NO DROP TRIGGER / CREATE TRIGGER needed.

    -- 2) Composite index — accelerates the OUT-branch EXISTS check (RQ-2.d RESEARCH)
    -- Matches the WHERE clause: contact_id + stage_id = ANY(uuid[]).
    -- Existing idx_orders_contact (single column) still works but scans more rows for
    -- contacts with many orders.
    CREATE INDEX IF NOT EXISTS idx_orders_contact_stage
      ON orders (contact_id, stage_id);

    -- 3) Defensive realtime publication guard (Pitfall 5 RESEARCH)
    -- The 2026-02-21 migration already added contacts to supabase_realtime (line 121).
    -- This block is a no-op in prod but ensures fresh dev DBs have it.
    DO $$
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END $$;

    -- 4) Backfill — recalcula is_client en TODOS los workspaces con config habilitada.
    -- D-04 + Refinement RESEARCH: filtra array_length>0 (skip configs vacios), GET DIAGNOSTICS
    -- + RAISE NOTICE para observabilidad por-workspace en SQL Editor output, gates idempotentes
    -- (WHERE is_client = X) para que replay sea cheap no-op.
    -- D-01: archivadas SI cuentan (no filtramos archived_at). Espeja behavior de
    -- backfillIsClient en src/lib/domain/client-activation.ts.
    DO $$
    DECLARE
      v_workspace_id UUID;
      v_stage_ids UUID[];
      v_reset_count INTEGER;
      v_set_count INTEGER;
    BEGIN
      FOR v_workspace_id, v_stage_ids IN
        SELECT workspace_id, activation_stage_ids
        FROM client_activation_config
        WHERE enabled = true
          AND array_length(activation_stage_ids, 1) > 0
      LOOP
        -- 1) Reset all is_client=true contacts in this workspace
        UPDATE contacts
        SET is_client = false
        WHERE workspace_id = v_workspace_id
          AND is_client = true;
        GET DIAGNOSTICS v_reset_count = ROW_COUNT;

        -- 2) Set true for contacts that have >=1 order in activation stages
        WITH client_contact_ids AS (
          SELECT DISTINCT o.contact_id
          FROM orders o
          WHERE o.workspace_id = v_workspace_id
            AND o.contact_id IS NOT NULL
            AND o.stage_id = ANY(v_stage_ids)
        )
        UPDATE contacts c
        SET is_client = true
        FROM client_contact_ids cci
        WHERE c.id = cci.contact_id
          AND c.workspace_id = v_workspace_id
          AND c.is_client = false;
        GET DIAGNOSTICS v_set_count = ROW_COUNT;

        RAISE NOTICE 'client_activation backfill: workspace=% reset=% set=%',
          v_workspace_id, v_reset_count, v_set_count;
      END LOOP;
    END $$;

    -- =============================================================================
    -- FIN. Aplicar en Supabase SQL Editor production antes de pushear este commit.
    -- =============================================================================
    ```

    REGLAS CRITICAS al escribir el archivo:
    - Filename literal: `20260428160000_client_activation_revoke.sql` (RESEARCH §Migration Filename — slot 16:00 Bogota, no colisiona con `20260428000000_agent_audit_sessions.sql`).
    - NO incluir `DROP FUNCTION` ni `DROP TRIGGER orders_mark_client_on_stage` — el `CREATE OR REPLACE FUNCTION` reemplaza el cuerpo manteniendo el binding (Pitfall: si dropeas el trigger pierdes el AFTER INSERT OR UPDATE, no funciona).
    - NO declarar `v_tag_id UUID;` — Pitfall 3 RESEARCH: variable no usada genera WARNING en CREATE OR REPLACE.
    - NO incluir `SELECT t.id INTO v_tag_id ... INSERT INTO contact_tags` — D-05 dead code drop. RESEARCH §D-05 Resolution lineas 54-107 confirma zero consumers en src/.
    - NO modificar `src/lib/domain/client-activation.ts` (CONTEXT.md NO-list explicit).
    - NO emitir Inngest event para `is_client` change (CONTEXT.md NO-list explicit).
    - NO tocar registros existentes en `contact_tags` con tag `Cliente` (CONTEXT.md NO-list explicit — limpieza historica out of scope).
    - Usar `IS NOT DISTINCT FROM` para guard de stage equality (Pitfall 1 — `=` returna NULL con NULL stage_id, IF entonces no skipea como deberia).
    - Usar `OLD.contact_id` (no `NEW.contact_id`) en EXISTS de rama OUT (RQ-2.a — necesario para reassignment correcto).
    - Bloque defensive del Defensive contact reassignment (linea ~117 del cuerpo) DEBE estar — ese path corrige la rara situacion de reassign en mismo UPDATE.

    NO ejecutar el SQL contra produccion — solo crear el archivo. La aplicacion ocurre en Task 4 (checkpoint humano).
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -c "CREATE OR REPLACE FUNCTION mark_client_on_stage_change" supabase/migrations/20260428160000_client_activation_revoke.sql | grep -q "^1$"</automated>
    <automated>! grep -q "v_tag_id" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>! grep -q "INSERT INTO contact_tags" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>! grep -q "name = 'Cliente'" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "IS NOT DISTINCT FROM" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "contact_id = OLD.contact_id" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "id <> NEW.id" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "CREATE INDEX IF NOT EXISTS idx_orders_contact_stage" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "ALTER PUBLICATION supabase_realtime ADD TABLE contacts" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "EXCEPTION WHEN duplicate_object" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "FOR v_workspace_id, v_stage_ids IN" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "array_length(activation_stage_ids, 1) > 0" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "GET DIAGNOSTICS" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>grep -q "RAISE NOTICE 'client_activation backfill" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>! grep -q "DROP TRIGGER orders_mark_client_on_stage" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
    <automated>! grep -q "CREATE TRIGGER orders_mark_client_on_stage" supabase/migrations/20260428160000_client_activation_revoke.sql</automated>
  </verify>
  <done>
    - Archivo `supabase/migrations/20260428160000_client_activation_revoke.sql` existe en disk con TODAS las secciones (CREATE OR REPLACE FUNCTION + composite index + idempotent realtime guard + DO $$ backfill + RAISE NOTICE).
    - Verificaciones automatizadas pasan TODAS — incluido los grep negativos (`! grep -q v_tag_id`, `! grep -q INSERT INTO contact_tags`, `! grep -q DROP TRIGGER`).
    - NO commiteado todavia — Task 3 hace el commit atomico.
    - NO aplicado contra prod — Task 4 (checkpoint) lo aplica.
  </done>
</task>

<task type="auto">
  <name>Task 2: Actualizar `docs/analysis/04-estado-actual-plataforma.md` con comportamiento bidireccional (Regla 4)</name>
  <read_first>
    - docs/analysis/04-estado-actual-plataforma.md lineas 176-186 (Seccion 2.5 Client Activation Badge — Configuracion + behavior actual one-way)
    - docs/analysis/04-estado-actual-plataforma.md linea 730 (Triggers DB — descripcion de `mark_client_on_stage_change`)
    - .planning/standalone/client-activation-auto-revoke/CONTEXT.md (resumen del cambio bidireccional + dead code Cliente tag drop)
  </read_first>
  <action>
    Editar `docs/analysis/04-estado-actual-plataforma.md` con dos updates puntuales (Regla 4 — codigo y docs deben estar sincronizados al pushear):

    **Update 1 — Linea ~182 (Seccion 2.5 Client Activation Badge):**

    Reemplazar la linea actual:
    > `- **Trigger DB:** `mark_client_on_stage_change()` — INSERT OR UPDATE en orders, chequea config y marca is_client + tag "Cliente"`

    Por:
    > `- **Trigger DB:** `mark_client_on_stage_change()` — INSERT OR UPDATE en orders, **bidireccional desde 2026-04-28**: SET is_client=true al cruzar IN del set activador, SET is_client=false al cruzar OUT cuando no quedan otras ordenes activas del contacto en el set (D-01..D-03 standalone client-activation-auto-revoke). Tag "Cliente" legacy removido — era dead code (zero consumers en src/, D-05).`

    **Update 2 — Linea ~730 (Triggers DB):**

    Reemplazar la linea actual:
    > `- `mark_client_on_stage_change()` — Marca is_client=true y auto-tag "Cliente" cuando orden llega a etapa de activacion configurable`

    Por:
    > `- `mark_client_on_stage_change()` — Bidireccional desde 2026-04-28 (standalone client-activation-auto-revoke): SET is_client=true en cruce IN del set activador, SET is_client=false en cruce OUT si no hay otra orden viva del contacto en el set (EXISTS sobre OLD.contact_id). Backfill global ejecutado en la misma migracion. Tag "Cliente" auto-asignacion removida (dead code, D-05).`

    NO tocar otras secciones del documento (lineas 184-186, 713 — Configuracion + Backfill manual + Realtime — siguen vigentes sin cambios).

    NO actualizar `docs/architecture/` ni `docs/roadmap/features-por-fase.md` — este standalone es bug-fix puntual sin impacto arquitectural ni nueva fase.
  </action>
  <verify>
    <automated>grep -q "bidireccional desde 2026-04-28" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "client-activation-auto-revoke" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>grep -q "EXISTS sobre OLD.contact_id" docs/analysis/04-estado-actual-plataforma.md</automated>
    <automated>! grep -q "marca is_client + tag \"Cliente\"" docs/analysis/04-estado-actual-plataforma.md</automated>
  </verify>
  <done>
    - 2 lineas actualizadas en `docs/analysis/04-estado-actual-plataforma.md` (Seccion 2.5 + Triggers DB).
    - Resto del documento intacto.
    - Lista para commit junto con migracion (Task 3).
  </done>
</task>

<task type="auto">
  <name>Task 3: Commit atomico migracion + docs (NO push — Regla 5 PAUSE)</name>
  <read_first>
    - CLAUDE.md §Regla 5 (migracion antes de push — STRICT en este standalone porque NO hay codigo dependiente, pero el patron de PAUSE sigue vigente para validar el SQL en prod antes de marcar el commit como "shipped")
    - .claude/rules/code-changes.md (commits atomicos por tarea, mensaje en espanol, Co-Authored-By Claude)
  </read_first>
  <action>
    Ejecutar commit atomico de los 2 archivos creados/modificados en Tasks 1-2. **CRITICAL: NO ejecutar `git push origin main`** — el push se hace en Task 5 despues de que el usuario confirma migracion aplicada en prod.

    ```bash
    git add supabase/migrations/20260428160000_client_activation_revoke.sql docs/analysis/04-estado-actual-plataforma.md
    git commit -m "$(cat <<'EOF'
    feat(client-activation-auto-revoke): bidirectional is_client trigger + global backfill

    Reemplaza el cuerpo de mark_client_on_stage_change() con logica IN/OUT:
    - IN (cruce hacia activator stage): SET is_client=true (comportamiento previo).
    - OUT (cruce desde activator stage): SET is_client=false si no quedan otras
      ordenes vivas del contacto en el set (EXISTS sobre OLD.contact_id).

    Drop legacy Cliente tag block — dead code (zero consumers en src/, D-05).
    Add composite index idx_orders_contact_stage para EXISTS hot path (RQ-2.d).
    Backfill global automatico en DO $$ con RAISE NOTICE per-workspace (D-04).
    Idempotente (CREATE OR REPLACE + IF NOT EXISTS + WHERE gates).

    Cierra bug productivo: contacto 3137549286 con is_client=true tras devolucion.

    Trigger binding orders_mark_client_on_stage del 2026-02-21 sigue valido —
    solo el cuerpo de la funcion se reemplaza.

    Regla 3 EXENTA: D-03 elige Postgres trigger sobre domain layer.
    Regla 5: aplicar SQL en Supabase prod ANTES de push (sin codigo dependiente
    pero sequencing strict para validar backfill antes de cerrar).
    Regla 6 NO aplica: bug-fix, no comportamiento de agente. Sin feature flag
    (CONTEXT.md prohibe).

    Standalone: client-activation-auto-revoke
    Plan: 01

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    ```

    Verificar que el commit se creo y que `git status` queda limpio (excepto otros cambios no relacionados que ya estaban en working tree antes — no tocar).

    NO push. NO `--no-verify`. Si hay pre-commit hook que falla, fix el problema y crear NUEVO commit (no `--amend`).
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(client-activation-auto-revoke): bidirectional is_client trigger"</automated>
    <automated>git log -1 --name-only | grep -q "supabase/migrations/20260428160000_client_activation_revoke.sql"</automated>
    <automated>git log -1 --name-only | grep -q "docs/analysis/04-estado-actual-plataforma.md"</automated>
    <automated>! git log origin/main..HEAD --oneline | head -1 | grep -q "" && git log origin/main..HEAD --oneline | head -1 | grep -q "client-activation-auto-revoke"</automated>
  </verify>
  <done>
    - Commit atomico creado con HEAD apuntando a el (mensaje empieza con `feat(client-activation-auto-revoke):`).
    - 2 archivos en el commit (migracion + doc update).
    - Co-Authored-By Claude presente en mensaje.
    - HEAD esta 1 commit por delante de `origin/main` (verificar con `git log origin/main..HEAD --oneline`).
    - **NO push hecho** — bloqueado hasta Task 5 post-checkpoint.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Checkpoint — Usuario aplica migracion en Supabase prod + valida bundle UAT + cross-check 3 y 4</name>
  <read_first>
    - supabase/migrations/20260428160000_client_activation_revoke.sql (el archivo creado en Task 1)
    - CLAUDE.md §Regla 5 (migracion antes de deploy — variante simple aplica aqui)
    - .planning/standalone/client-activation-auto-revoke/CONTEXT.md §Verificacion post-deploy lineas 144-151 (6 escenarios UAT)
    - .planning/standalone/client-activation-auto-revoke/RESEARCH.md §Production Verification SQL Bundle lineas 559-597 (4 queries: bug case + sanity + cross-check 3 + cross-check 4)
  </read_first>
  <what-built>
    Tasks 1-3 dejaron commiteado en local el archivo `supabase/migrations/20260428160000_client_activation_revoke.sql` + docs actualizadas en `docs/analysis/04-estado-actual-plataforma.md`. El commit NO esta pusheado todavia.

    El SQL es idempotente y safe-to-replay:
    - `CREATE OR REPLACE FUNCTION` reemplaza el cuerpo de `mark_client_on_stage_change()` que ya existe (el binding del trigger no se toca).
    - `CREATE INDEX IF NOT EXISTS` no falla si el indice ya existe.
    - `DO $$ ... ALTER PUBLICATION ... EXCEPTION WHEN duplicate_object` no falla si `contacts` ya esta en `supabase_realtime` (que YA esta — la 2026-02-21 lo agrego).
    - `DO $$` backfill esta gated por `WHERE is_client = X` — replay sobre datos ya correctos es no-op.

    Falta que el usuario:
    1. Abra Supabase SQL Editor del proyecto production de morfx.
    2. Copie el contenido entero del archivo de migracion y lo ejecute.
    3. Capture la salida `RAISE NOTICE` del backfill (DEBE aparecer una linea por cada workspace con `enabled=true` — para Somnio sera algo como `client_activation backfill: workspace=a3843b3f-c337-4836-92b5-89c58bb98490 reset=17204 set=NNNN`).
    4. Valide el bug-fix original + sanity + cross-check 3 + cross-check 4.
    5. Confirme explicitamente para desbloquear el push (Task 5).

    **Fail-mode bounded:** si el SQL falla por cualquier razon, el comportamiento previo (one-way trigger del 2026-02-21) sigue activo, no rompe nada en runtime. Esto es la variante MAS SEGURA posible de Regla 5 — no hay codigo desplegado que dependa del nuevo schema.

    **Regla 3 EXENTA reminder:** Esta logica vive en DB por diseno (D-03). NO hay cambio en `src/lib/domain/client-activation.ts` ni en `moveOrderToStage` ni en `crm-writer-adapter`. La atomicidad TX del trigger garantiza que cualquier ruta de mutacion (domain, SQL manual, automation, agent) dispara el recalculo correcto de `is_client`.
  </what-built>
  <how-to-verify>
    **Paso 1 — Aplicar la migracion en Supabase production:**

    1. Abrir https://supabase.com/dashboard → proyecto de produccion morfx → SQL Editor → New query.
    2. Copiar el contenido ENTERO de `supabase/migrations/20260428160000_client_activation_revoke.sql` (incluye CREATE OR REPLACE FUNCTION + CREATE INDEX + DO $$ realtime guard + DO $$ backfill — todo en el mismo query).
    3. Pegar en SQL Editor, **activar la pestana "Messages" / "NOTICE output"** para ver los `RAISE NOTICE`, click Run.
    4. Esperado: "Success" + en la consola de NOTICE aparecen N lineas (una por workspace con `enabled=true`):
       ```
       NOTICE: client_activation backfill: workspace=a3843b3f-c337-4836-92b5-89c58bb98490 reset=17204 set=14XXX
       NOTICE: client_activation backfill: workspace=<otro-uuid> reset=N set=M
       ...
       ```
       Si NO aparecen NOTICEs, verificar que la pestana de Messages esta activa en Supabase SQL Editor (sino los `RAISE NOTICE` se silencian a la UI).

    Si hay error **antes** del DO $$ backfill (ej. error de sintaxis en CREATE OR REPLACE FUNCTION), NO continuar — reportar a Claude para fix en Task 1 + nuevo commit (NO `--amend`, crear nuevo commit) y re-ejecutar todo el SQL.

    **Paso 2 — Validar el bug-fix original (la razon de existir de este standalone):**

    ```sql
    -- 2a. Bug case original — contacto 3137549286 debe quedar en is_client=false
    SELECT phone, is_client, name FROM contacts WHERE phone = '3137549286';
    ```
    Expected: `is_client = false` (asumiendo que todas las ordenes del contacto salieron del activator set; si el contacto nunca tuvo ordenes vinculadas tambien sera false).

    ```sql
    -- 2b. Audit del contacto — listar sus ordenes y stages
    SELECT o.id, o.stage_id, ps.name AS stage_name,
           (o.stage_id = ANY((SELECT activation_stage_ids FROM client_activation_config WHERE workspace_id = o.workspace_id))) AS in_activator_set
    FROM orders o
    LEFT JOIN pipeline_stages ps ON ps.id = o.stage_id
    WHERE o.contact_id = (SELECT id FROM contacts WHERE phone = '3137549286' LIMIT 1)
    ORDER BY o.created_at DESC;
    ```
    Expected: TODAS las filas con `in_activator_set = false`. Si alguna fila tiene `in_activator_set = true` Y el query 2a devolvio `is_client = false` → bug en backfill, reportar a Claude.

    **Paso 3 — Sanity check post-backfill (contadores per workspace):**

    ```sql
    -- 3a. Contadores per workspace
    SELECT workspace_id,
           COUNT(*) FILTER (WHERE is_client = true) AS clients,
           COUNT(*) AS total_contacts
    FROM contacts
    WHERE workspace_id IN (SELECT workspace_id FROM client_activation_config WHERE enabled = true)
    GROUP BY workspace_id;
    ```
    Expected: para Somnio (workspace `a3843b3f-c337-4836-92b5-89c58bb98490`), `clients` debe coincidir aproximadamente con el `set=NNNN` del NOTICE del Paso 1. Si difiere drasticamente (ej. 0 clients post-backfill cuando antes habia 17204) → algo paso, reportar.

    **Paso 4 — Cross-check #3 RESEARCH (contacts.is_client=true SIN orden en activator stage):**

    ```sql
    -- 4. Inconsistencia: contactos marcados client SIN orden activa
    SELECT c.id, c.workspace_id, c.phone
    FROM contacts c
    WHERE c.is_client = true
      AND NOT EXISTS (
        SELECT 1 FROM orders o, client_activation_config cfg
        WHERE o.contact_id = c.id
          AND o.workspace_id = c.workspace_id
          AND cfg.workspace_id = c.workspace_id
          AND o.stage_id = ANY(cfg.activation_stage_ids)
      );
    ```
    Expected: **0 filas**. Cualquier fila aqui = backfill missed un caso (huerfano marcado erroneamente). Si devuelve filas, NO continuar al push — reportar a Claude para investigar.

    **Paso 5 — Cross-check #4 RESEARCH (contacts.is_client=false CON orden activa en activator stage):**

    ```sql
    -- 5. Inconsistencia inversa: contactos NO marcados client pero CON orden activa
    SELECT DISTINCT c.id, c.workspace_id, c.phone
    FROM contacts c
    JOIN orders o ON o.contact_id = c.id
    JOIN client_activation_config cfg ON cfg.workspace_id = c.workspace_id
    WHERE c.is_client = false
      AND o.stage_id = ANY(cfg.activation_stage_ids)
      AND cfg.enabled = true;
    ```
    Expected: **0 filas**. Cualquier fila aqui = backfill missed contactos con ordenes activas. Si devuelve filas, NO continuar al push — reportar a Claude.

    **Paso 6 — Validar trigger funcional con UPDATE de prueba (UAT escenario 4 — internal transition no debe disparar):**

    Esto es opcional pero recomendado para confirmar que el trigger esta vivo:

    ```sql
    -- 6a. Identificar un contacto Somnio con 1 sola orden en activator stage (test seguro de IN→OUT)
    SELECT o.contact_id, o.id AS order_id, o.stage_id, c.is_client
    FROM orders o
    JOIN contacts c ON c.id = o.contact_id
    JOIN client_activation_config cfg ON cfg.workspace_id = o.workspace_id
    WHERE o.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      AND o.stage_id = ANY(cfg.activation_stage_ids)
      AND cfg.enabled = true
    GROUP BY o.contact_id, o.id, o.stage_id, c.is_client
    HAVING COUNT(o.id) OVER (PARTITION BY o.contact_id) = 1
    LIMIT 1;
    ```
    (Si no hay contactos con 1-sola-orden, skip este paso — los queries 4 y 5 ya validan el estado global.)

    **Paso 7 — Confirmar que la trigger binding sigue presente:**

    ```sql
    -- 7. Verificar que orders_mark_client_on_stage existe y apunta a mark_client_on_stage_change
    SELECT t.tgname, p.proname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.orders'::regclass
      AND t.tgname = 'orders_mark_client_on_stage';
    ```
    Expected: 1 fila con `proname = mark_client_on_stage_change`. Si 0 filas, el trigger se perdio (no deberia pasar — solo CREATE OR REPLACE FUNCTION sin tocar trigger), reportar.

    **Paso 8 — Confirmar verbalmente para desbloquear push (Task 5):**

    Pegar a Claude:
    - Salida del Paso 1 NOTICE (lineas `client_activation backfill: workspace=...`).
    - Salida del Paso 2a (`is_client = false` para 3137549286).
    - Salida del Paso 4 (debe ser 0 filas o "No rows").
    - Salida del Paso 5 (debe ser 0 filas o "No rows").
    - Confirmacion: "migracion aplicada, validaciones pasan, listo para push".
  </how-to-verify>
  <resume-signal>
    Escribe "migracion aplicada" + adjunta:
    1. Lineas NOTICE del Paso 1 (al menos la de Somnio workspace).
    2. Resultado Paso 2a (`SELECT phone, is_client FROM contacts WHERE phone='3137549286'`).
    3. Resultado Paso 4 (debe ser "0 rows" o vacio).
    4. Resultado Paso 5 (debe ser "0 rows" o vacio).

    Si algun cross-check (4 o 5) devuelve filas, NO escribas "migracion aplicada" — describe las filas a Claude para investigar el backfill antes de avanzar.

    Si el Paso 1 fallo con error SQL, describe el error verbatim — Claude crea NUEVO commit con fix (NO `--amend`) y vuelves a empezar desde Paso 1.
  </resume-signal>
</task>

<task type="auto">
  <name>Task 5: Push commit a `origin main` + crear LEARNINGS.md</name>
  <read_first>
    - CLAUDE.md §Regla 1 (push despues de cambios de codigo) §Regla 5 (push solo despues de migracion validada — gate del Task 4 ya paso aqui)
    - .planning/standalone/crm-stage-integrity/LEARNINGS.md (template reference para estructura)
    - .planning/standalone/client-activation-auto-revoke/CONTEXT.md (resumen de decisiones para LEARNINGS)
    - .planning/standalone/client-activation-auto-revoke/RESEARCH.md §D-05 Resolution + §Trigger SQL Pattern §RQ-2.a (para LEARNINGS patterns)
  </read_first>
  <action>
    **Paso 1 — Push del commit creado en Task 3:**

    ```bash
    git push origin main
    ```

    Esto sincroniza el repo con la migracion ya aplicada en Supabase prod (Regla 5 cumplida — DB ahora es source of truth + repo es archivo historico).

    Verificar que el push funciono:
    ```bash
    git status   # debe decir "Your branch is up to date with 'origin/main'"
    ```

    **Paso 2 — Crear `.planning/standalone/client-activation-auto-revoke/LEARNINGS.md`:**

    Crear el archivo con este contenido (Regla 4 — LEARNINGS al cerrar standalone):

    ```markdown
    # Client Activation Auto-Revoke — Learnings

    **Shipped:** 2026-04-28 (Plan 01 cierre — migracion aplicada en Somnio prod + push)
    **Standalone path:** `.planning/standalone/client-activation-auto-revoke/`
    **Bug origen:** Contacto `3137549286` con `is_client=true` tras devolucion. Trigger one-way del 2026-02-21 nunca revocaba.
    **Plans:** 01 (migracion compuesta + backfill global + docs + push). Plan 02 (integration tests) deferido — opcional, ver §Deferred section.

    ## Commits

    ### Plan 01 — Bidirectional trigger + global backfill
    - `<TBD>` `feat(client-activation-auto-revoke): bidirectional is_client trigger + global backfill`

    ## Salidas relevantes del backfill (Somnio)

    Capturar aqui las lineas NOTICE del Paso 1 del checkpoint Task 4 (formato `client_activation backfill: workspace=... reset=N set=M`) — sirve de baseline para auditorias futuras del estado del flag is_client.

    ```
    <pegar lineas NOTICE>
    ```

    ## Patterns aprendidos (reusables)

    ### P-1: D-05 finding — Tag legacy `Cliente` era dead code

    **Contexto:** El trigger del 2026-02-21 incluia `INSERT INTO contact_tags` con tag `name = 'Cliente'` (case-sensitive). Research grep exhaustivo en `src/` (`rg "['\"]Cliente['\"]" src/`) confirmo zero consumers funcionales:
    - 3 hits totales, todos unrelated (fallback display name, HTML tooltip, speaker label en transcript).
    - El badge "Cliente" del inbox v2 se alimenta de `contacts.is_client` directo, NO del tag.
    - El trigger porteado del 2026-02-03 cambio `LOWER(name) = 'cliente'` a `name = 'Cliente'` — case-sensitivity break implica que workspaces con tag legacy lowercase nunca matchearon, lo que sugiere que el branch nunca disparo en prod desde el 2026-02-21.

    **Leccion:** Antes de portear codigo en migraciones (especialmente case-sensitive checks contra `tags`), grep src/ + grep prod read-only. Dead code en triggers genera deuda silenciosa que se acarrea de migracion en migracion.

    ### P-2: EXISTS con `OLD.contact_id` (no `NEW.contact_id`) en triggers de unset bidireccional

    **Contexto:** Para evaluar "¿queda otra orden activa del contacto?" en la rama OUT del trigger, la subquery EXISTS DEBE usar `OLD.contact_id`, no `NEW.contact_id`. Razon:
    - Si el UPDATE reasigna el contacto (`OLD.contact_id <> NEW.contact_id`), evaluar `NEW.contact_id` busca ordenes del NUEVO duenio cuando lo que queremos saber es si el VIEJO duenio sigue siendo cliente.
    - El `id <> NEW.id` excluye el orden que esta cambiando (siempre seguro porque el id no cambia entre OLD y NEW).
    - Defensive trailing block evalua tambien al nuevo contacto si el reasignamiento lo deja con primera orden en activator stage.

    **Leccion:** En triggers bidireccionales sobre tablas con FK que pueden cambiar en mismo UPDATE (contact_id, workspace_id, etc.), siempre razonar sobre OLD vs NEW per-rama. Default a OLD para revocacion, NEW para activacion.

    ### P-3: `IS NOT DISTINCT FROM` para guardas de equality con NULL posible

    **Contexto:** El guard original `IF TG_OP = 'UPDATE' AND OLD.stage_id = NEW.stage_id THEN RETURN NEW` falla si alguno de los dos `stage_id` es NULL — el `=` retorna NULL (no true/false), y el IF entonces NO skipea como deberia. Substituir por `IS NOT DISTINCT FROM` resuelve: trata NULL = NULL como true.

    **Leccion:** En PL/pgSQL, cualquier guard de "no cambio" o "valores iguales" sobre columnas nullable DEBE usar `IS NOT DISTINCT FROM` (o `IS DISTINCT FROM` para "cambio"). El `=` es un footgun para casos edge.

    ### P-4: Backfill DO $$ + RAISE NOTICE para observabilidad en Supabase SQL Editor

    **Contexto:** Backfill bulk dentro de migracion es opaco si no emite mensajes — el usuario no sabe si proceso 0 o 17204 contactos. El patron `DO $$ ... GET DIAGNOSTICS x = ROW_COUNT; RAISE NOTICE 'msg=%', x; END $$` da visibilidad per-iteracion sin requerir tabla de logs separada.

    **Patron reusable:**
    ```sql
    DO $$
    DECLARE
      v_loop_var TYPE;
      v_count INTEGER;
    BEGIN
      FOR v_loop_var IN SELECT ... LOOP
        UPDATE ... ;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE 'context: var=% count=%', v_loop_var, v_count;
      END LOOP;
    END $$;
    ```

    Importante: Supabase SQL Editor tiene una pestana "Messages" / "NOTICE output" — el usuario debe activarla o los NOTICE se silencian a la UI (siguen disponibles en logs del proyecto).

    **Leccion:** Migraciones con bulk operations DEBEN emitir RAISE NOTICE per-batch. Sirve para validar que el backfill corrio + sirve de baseline en auditorias futuras.

    ### P-5: Regla 5 simplest variant — migracion sin codigo dependiente

    **Contexto:** Estandar de Regla 5 es "aplicar migracion en prod ANTES de pushear codigo que la usa". En este standalone NO HAY codigo dependiente — la app sigue leyendo `contacts.is_client` igual antes/despues. La migracion (1) reemplaza el cuerpo del trigger y (2) hace backfill. Failure mode bounded: si SQL falla, el trigger one-way previo sigue activo, app no rompe.

    **Workflow simplificado:**
    1. Crear migracion + commit local.
    2. PAUSE → usuario aplica SQL en Supabase prod + valida.
    3. Push (sincronizacion repo ↔ prod, no introduce nuevo comportamiento).

    **Leccion:** Regla 5 es un spectrum. Cuando NO hay codigo dependiente, el push final es archival (mantiene repo como source of truth pero no introduce runtime change). Documentar el subtype "migracion-only" en el plan para que el usuario entienda la naturaleza low-risk del checkpoint.

    ### P-6: CREATE OR REPLACE FUNCTION mantiene trigger binding

    **Contexto:** El trigger `orders_mark_client_on_stage` se creo el 2026-02-21 apuntando a `mark_client_on_stage_change()`. Esta migracion `CREATE OR REPLACE FUNCTION` cambia el cuerpo, pero el trigger sigue funcional sin recrearlo. NO ejecutar `DROP TRIGGER` + `CREATE TRIGGER` — eso es innecesario y arriesga perder el binding entre el drop y el create si algo falla en medio.

    **Leccion:** PL/pgSQL es funcion-y-binding-separado. CREATE OR REPLACE FUNCTION es atomico para el cuerpo. Triggers atan nombre-de-funcion, no cuerpo, asi que el cambio se propaga automaticamente al siguiente fire.

    ## Anti-patterns evitados

    - **NO emitir Inngest event para is_client change** — CONTEXT.md NO-list explicit. Si surge necesidad de observabilidad downstream, abrir standalone separado.
    - **NO modificar `src/lib/domain/client-activation.ts`** — `backfillIsClient()` sigue valido para el boton "Recalcular" del standalone `client-activation-backfill`. Domain-level y trigger-level conviven (el primero es manual desde UI, el segundo es automatico per-mutacion).
    - **NO purgar `contact_tags` con tag `Cliente`** — CONTEXT.md NO-list explicit. La limpieza historica de datos que el usuario manualmente creo es decision del usuario, no de esta migracion.
    - **NO feature flag** — CONTEXT.md NO-list explicit. El comportamiento previo era buggy, el nuevo es correcto, sin rollback deseable.

    ## Deferred (Plan 02 opcional)

    Integration test suite en `src/__tests__/integration/client-activation-trigger.test.ts` mirroring el patron de `orders-cas.test.ts`. RESEARCH §Test Strategy lista 8 escenarios:
    1. INSERT a activator → flips true.
    2. UPDATE non-activator → activator → flips true.
    3. UPDATE activator → non-activator (sin otra orden) → flips false.
    4. UPDATE activator → non-activator (con otra orden activator) → STAYS true.
    5. UPDATE non-activator → non-activator → no cambio.
    6. UPDATE activator → activator (mismo set) → no cambio.
    7. INSERT outside activator → no cambio.
    8. Same-TX two-order updates same contact → final state correcto.

    **Razon de deferral:** El UAT manual del checkpoint Task 4 cubre los 6 escenarios criticos de CONTEXT.md. La suite automatizada es net-positive (regression safety) pero no bloqueante para el cierre del bug. Re-evaluar si surge regression en el trigger en futuras migraciones.

    Para retomar: abrir nuevo plan `02-PLAN.md` en este standalone, mirror estructura de `src/__tests__/integration/orders-cas.test.ts` (env-gated con `describe.skipIf(!envReady)`), implementar los 8 escenarios.

    ## Files modified summary

    | File | Change |
    |------|--------|
    | `supabase/migrations/20260428160000_client_activation_revoke.sql` | NUEVO — CREATE OR REPLACE FUNCTION + composite index + DO $$ realtime guard + DO $$ backfill |
    | `docs/analysis/04-estado-actual-plataforma.md` | Updated lineas Seccion 2.5 + Triggers DB para reflejar bidireccionalidad + dead-code Cliente removido |

    ## Files NOT modified (intentional — out of scope)

    | File | Reason |
    |------|--------|
    | `src/lib/domain/client-activation.ts` | D-03: logica vive en trigger DB. backfillIsClient() sigue valido para UI manual recalc. |
    | `src/lib/domain/orders.ts` (`moveOrderToStage`) | D-03: trigger atomico cubre todas las rutas, no necesita wrapper en domain. |
    | `src/lib/agents/crm-writer/two-step.ts` | D-03: trigger se dispara desde UPDATE underlying, no requiere proxy. |
    | `src/lib/agents/routing/facts.ts` (`isClient`) | RQ-5: lee live DB per request, sin cache. Funciona transparente con flag bidireccional. |
    | `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` | D-05: badge alimentado por `contacts.is_client`, no por tag `Cliente`. Sin cambios. |
    | `contact_tags` rows historicas con `Cliente` tag | CONTEXT.md NO-list: limpieza de datos historicos out of scope. |
    ```

    Reemplazar `<TBD>` con el hash del commit del Task 3 (ejecutar `git log -1 --format=%H` y substituir).

    Reemplazar `<pegar lineas NOTICE>` con las lineas exactas que el usuario adjunto en el resume-signal del checkpoint Task 4.

    **Paso 3 — Commit del LEARNINGS:**

    ```bash
    git add .planning/standalone/client-activation-auto-revoke/LEARNINGS.md
    git commit -m "$(cat <<'EOF'
    docs(client-activation-auto-revoke): Plan 01 LEARNINGS — bidirectional trigger shipped

    Captura D-05 finding (tag Cliente dead code), patterns reusables P-1..P-6
    (EXISTS sobre OLD.contact_id, IS NOT DISTINCT FROM, DO $$ + RAISE NOTICE
    backfill, Regla 5 simplest variant, CREATE OR REPLACE FUNCTION mantiene
    trigger binding) + salidas verbatim del backfill Somnio.

    Plan 02 (integration tests) marcado deferred opcional.

    Standalone: client-activation-auto-revoke
    Plan: 01 (cierre)

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    git push origin main
    ```

    **Paso 4 — Validacion final:**

    ```bash
    git log -2 --oneline   # debe mostrar el commit feat + el commit docs LEARNINGS, ambos pusheados
    git status             # debe estar clean (Your branch is up to date)
    ```
  </action>
  <verify>
    <automated>git log origin/main -1 --pretty=%s | grep -q "docs(client-activation-auto-revoke): Plan 01 LEARNINGS"</automated>
    <automated>git log origin/main -2 --pretty=%s | grep -q "feat(client-activation-auto-revoke): bidirectional is_client trigger"</automated>
    <automated>test -f .planning/standalone/client-activation-auto-revoke/LEARNINGS.md</automated>
    <automated>grep -q "P-2: EXISTS con .OLD.contact_id" .planning/standalone/client-activation-auto-revoke/LEARNINGS.md</automated>
    <automated>grep -q "P-5: Regla 5 simplest variant" .planning/standalone/client-activation-auto-revoke/LEARNINGS.md</automated>
    <automated>grep -q "Deferred (Plan 02 opcional)" .planning/standalone/client-activation-auto-revoke/LEARNINGS.md</automated>
    <automated>git status --porcelain | grep -v -E "^.. (\.claude|\.planning/standalone/(agent-godentist|godentist-scraping|shopify-contact|v3-tiempo)|\.planning/REQUIREMENTS-DRAFT|\.planning/debug|\.planning/phases|scripts/voice-app|src/lib/agent-forensics)" | grep -v "^$" | head -1; true</automated>
  </verify>
  <done>
    - `git push origin main` exitoso (Regla 1 + Regla 5 cumplidas — push despues de validacion).
    - `LEARNINGS.md` creado en `.planning/standalone/client-activation-auto-revoke/` con todos los Patterns P-1..P-6, salidas verbatim del backfill Somnio, files modified summary + files NOT modified intentional.
    - Commit del LEARNINGS pusheado tambien.
    - `git status` clean (los `M`/`??` pre-existentes no relacionados quedan tal cual — no se tocan).
    - Standalone client-activation-auto-revoke CERRADO. Bug del contacto `3137549286` resuelto.
  </done>
</task>

</tasks>

<verification>
- `supabase/migrations/20260428160000_client_activation_revoke.sql` existe en git con CREATE OR REPLACE FUNCTION bidireccional + composite index + DO $$ backfill + idempotent realtime guard.
- Migracion aplicada en Supabase production por el usuario en el checkpoint Task 4 — el cuerpo de `mark_client_on_stage_change()` ahora incluye ramas IN/OUT, sin referencias a `Cliente` tag o `v_tag_id`.
- Backfill global ejecutado: contacto `3137549286` ahora tiene `is_client = false`. Cross-checks 3 y 4 del RESEARCH §Production Verification SQL Bundle devuelven 0 filas (0 inconsistencias).
- `idx_orders_contact_stage` creado en `orders` (pg_indexes verificable).
- Trigger binding `orders_mark_client_on_stage` del 2026-02-21 sigue funcional, apunta al nuevo cuerpo.
- `docs/analysis/04-estado-actual-plataforma.md` actualizado en Seccion 2.5 + Triggers DB (Regla 4).
- `.planning/standalone/client-activation-auto-revoke/LEARNINGS.md` creado con patterns P-1..P-6 + Plan 02 deferred section.
- 2 commits pusheados a `origin main` (feat + docs LEARNINGS). Regla 5 sequencing strict respetado: commit local → PAUSE → usuario aplica SQL prod → validacion → push.
</verification>

<success_criteria>
- Bug del contacto `3137549286` cerrado: routing fact `isClient` (`src/lib/agents/routing/facts.ts:187-194`) ahora devuelve `false` correcto en vez de `true` stale.
- `agent-lifecycle-router` priority-900 rule (`src/lib/agents/routing/...`) ahora enruta clientes con devoluciones a `somnio-sales-v3` en vez de `somnio-recompra-v1`.
- Trigger bidireccional cubre los 6 escenarios UAT de CONTEXT.md (lineas 144-151) — validados manualmente en checkpoint Task 4.
- Pitfall 1 (NULL stage_id) mitigado via `IS NOT DISTINCT FROM`. Pitfall 3 (v_tag_id WARNING) eliminado al droppear el DECLARE. Pitfall 5 (realtime publication) cubierto por guard idempotente.
- Sin cambios en codigo de aplicacion — `src/lib/domain/client-activation.ts` + `moveOrderToStage` + `crm-writer-adapter` intactos. Solo cambia el comportamiento del trigger en DB y la documentacion.
- Regla 5 sequencing strict respetado: NO push antes del checkpoint Task 4 (`git log origin/main..HEAD` mostro el commit pendiente hasta que usuario confirmo migracion aplicada).
- Regla 3 EXENTA documentada en commit message + LEARNINGS (D-03 explicita).
- Regla 6 NO aplica documentada en commit message + LEARNINGS (no agente nuevo, sin feature flag por CONTEXT.md NO-list).
- Regla 4 cumplida: `docs/analysis/04-estado-actual-plataforma.md` actualizado en mismo PR/commit que la migracion.
</success_criteria>

<output>
After completion, create `.planning/standalone/client-activation-auto-revoke/01-SUMMARY.md` documenting:
- Commit hashes de Task 3 (migracion + docs) y Task 5 (LEARNINGS)
- Filename exacto: `20260428160000_client_activation_revoke.sql`
- Timestamp del checkpoint Task 4 + verbatim de las salidas adjuntadas por el usuario:
  - Lineas NOTICE del backfill (al menos Somnio workspace)
  - Resultado de `SELECT phone, is_client FROM contacts WHERE phone = '3137549286'`
  - Resultados de cross-check #3 y #4 (deben ser "0 rows")
- Confirmacion explicita: "Bug 3137549286 cerrado. Trigger bidireccional activo. Backfill global ejecutado. Regla 5 sequencing respetado. Regla 3 EXENTA + Regla 6 NO aplica documentado."
- Push final commit range + URL deploy Vercel (notar que Vercel no aplica migraciones — solo compila — y no hay codigo dependiente)
- Plan 02 (integration tests) marcado como DEFERRED OPCIONAL con link a §Deferred section del LEARNINGS
</output>
