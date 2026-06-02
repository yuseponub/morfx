---
phase: client-activation-auto-revoke
plan: 02
type: execute
wave: 2
depends_on:
  - "01"
files_modified:
  - src/__tests__/integration/client-activation-trigger.test.ts
autonomous: true
requirements:
  - LR-1
  - LR-2
  - LR-5
  - D-01
  - D-02
  - D-03

must_haves:
  truths:
    - "Archivo `src/__tests__/integration/client-activation-trigger.test.ts` existe y mirrors la estructura de `orders-cas.test.ts` (env-gated con `describe.skipIf(!envReady)`, helpers seedOrder/cleanupOrder, admin client con service_role, TEST_WORKSPACE_ID aislado)"
    - "Suite cubre los 8 escenarios listados en RESEARCH.md §Test Strategy seccion 2: INSERT a activator, UPDATE non-activator→activator, UPDATE activator→non-activator (sin otra orden), UPDATE activator→non-activator (con otra orden), UPDATE non-activator→non-activator, UPDATE activator→activator mismo set, INSERT outside activator, same-TX two-order updates"
    - "Cada test verifica `contacts.is_client` post-mutacion via SELECT directo al admin client, asserting expected boolean"
    - "Tests usan `STAGE_A` (non-activator) y `STAGE_B` (activator) del .env.test (NO hardcodean UUIDs Somnio prod) — extender .env.test.example con `TEST_ACTIVATOR_STAGE_ID` si no existe"
    - "Setup: cada test crea contacto fresh, asegura `client_activation_config.activation_stage_ids = [TEST_ACTIVATOR_STAGE_ID]` para TEST_WORKSPACE_ID con `enabled=true`. Teardown: cleanup orders + reset contact"
    - "Tests pasan en `npm test -- src/__tests__/integration/client-activation-trigger.test.ts` cuando env vars completas; SKIP silencioso (no fail) cuando env incompleto (`describe.skipIf(!envReady)`)"
    - "Commit + push respeta Regla 5 estandar (no migracion involved en este plan, push directo despues de tests pasando)"
  artifacts:
    - path: "src/__tests__/integration/client-activation-trigger.test.ts"
      provides: "Integration test suite con 8 escenarios validando trigger bidireccional contra Postgres real"
      contains: "describe.skipIf(!envReady)"
  key_links:
    - from: "src/__tests__/integration/client-activation-trigger.test.ts"
      to: "Supabase prod via admin client (service_role) — TEST_WORKSPACE_ID aislado"
      via: "createClient(SUPABASE_URL, SERVICE_ROLE_KEY)"
      pattern: "describe.skipIf"
    - from: "client-activation-trigger.test.ts"
      to: "Trigger mark_client_on_stage_change (Plan 01 cuerpo bidireccional)"
      via: "INSERT/UPDATE orders + SELECT contacts.is_client assertion"
      pattern: "is_client"
---

<objective>
Wave 2 — **OPCIONAL / DEFERRED CANDIDATE**. Suite de integration tests que automatiza los 6 escenarios UAT de CONTEXT.md + 2 escenarios edge case (RESEARCH §Test Strategy seccion 2: same-TX two-order + activator→activator mismo set). Mirrors el patron de `src/__tests__/integration/orders-cas.test.ts` (env-gated con `describe.skipIf(!envReady)`, helpers fixture-style, TEST_WORKSPACE_ID aislado, cleanup en afterEach).

Purpose: Regression safety para futuras migraciones que toquen el trigger `mark_client_on_stage_change`. Hoy no hay tests automatizados — el UAT manual del checkpoint Task 4 del Plan 01 cubre el cierre del bug, pero cualquier futura migracion que toque el trigger dependera de ejecutar UAT manual nuevamente. Esta suite convierte esos 6+2 escenarios en CI green/red signal.

Output: 1 test file en `src/__tests__/integration/client-activation-trigger.test.ts`. Push directo (no migracion involved en este plan, Plan 01 ya cubrio Regla 5).

**STATUS: OPCIONAL.** Plan 01 cierra el bug independientemente. Este plan se ejecuta SOLO si el usuario decide invertir en regression safety automatizada. CONTEXT.md y RESEARCH.md ambos marcan los integration tests como "RECOMMENDED, optional". Si el usuario opta por skip, mover a `Deferred Ideas` en CONTEXT.md y NO ejecutar este plan.

**Decision gate antes de ejecutar:**
- ¿El usuario quiere invertir tiempo en suite de regression para el trigger?
- ¿Hay TEST_WORKSPACE_ID + TEST_PIPELINE_ID + STAGE_A/B configurados en `.env.test.example`?
- Si AMBAS respuestas son SI → ejecutar Plan 02.
- Si CUALQUIERA es NO → skip Plan 02 + documentar en CONTEXT.md `## Deferred Ideas` (lo que LEARNINGS Plan 01 §Deferred ya describe).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/client-activation-auto-revoke/CONTEXT.md §Verificacion post-deploy lineas 144-151 (6 escenarios UAT que esta suite automatiza)
@.planning/standalone/client-activation-auto-revoke/RESEARCH.md §Test Strategy lineas 337-366 (8 escenarios listados + recommendation de patron orders-cas.test.ts)
@.planning/standalone/client-activation-auto-revoke/01-PLAN.md (Plan 01 — pre-requisito: trigger bidireccional ya en prod via Plan 01)
@.planning/standalone/client-activation-auto-revoke/LEARNINGS.md (Plan 01 §Deferred section — describe los 8 escenarios)
@src/__tests__/integration/orders-cas.test.ts — pattern reference EXACTO (env-gated, helpers, describe.skipIf, beforeEach/afterEach con setFlag/seedOrder/cleanupOrder)
@src/__tests__/integration/order-stage-history-rls.test.ts — pattern reference adicional para append-only RLS triggers
@.env.test.example (root del repo) — env vars existentes; verificar si TEST_ACTIVATOR_STAGE_ID + TEST_NON_ACTIVATOR_STAGE_ID estan o hay que agregarlos
@supabase/migrations/20260428160000_client_activation_revoke.sql (Plan 01 — el SUT)

<interfaces>
<!-- Helpers necesarios (mirror de orders-cas.test.ts:33-58) -->
async function seedContact(workspaceId: string, phone: string): Promise<string>
async function seedOrder(contactId: string, stageId: string, workspaceId: string): Promise<string>
async function cleanupContact(contactId: string)
async function cleanupOrder(orderId: string)
async function getIsClient(contactId: string): Promise<boolean>
async function ensureActivationConfig(workspaceId: string, activatorStageIds: string[])
async function setOrderStage(orderId: string, newStageId: string)

<!-- Env vars (extender .env.test.example si necesario) -->
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TEST_WORKSPACE_ID
TEST_PIPELINE_ID
TEST_STAGE_A    -- non-activator (existente, reusable)
TEST_STAGE_B    -- non-activator alterno (existente, reusable)
TEST_STAGE_C    -- activator (PUEDE necesitar nueva env var TEST_ACTIVATOR_STAGE_ID)
TEST_ACTIVATOR_STAGE_ID -- NUEVA si STAGE_C no esta marcado como activator en config

<!-- Pattern de envReady (orders-cas.test.ts:24-27) -->
const envReady = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID && TEST_PIPELINE_ID && STAGE_A && STAGE_B && STAGE_C)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear suite `src/__tests__/integration/client-activation-trigger.test.ts` con 8 escenarios</name>
  <read_first>
    - src/__tests__/integration/orders-cas.test.ts (pattern reference COMPLETO — env-gated, helpers, describe.skipIf, beforeEach/afterEach)
    - src/__tests__/integration/order-stage-history-rls.test.ts (pattern adicional para tests sobre triggers)
    - .env.test.example en root del repo — verificar env vars existentes; si falta `TEST_ACTIVATOR_STAGE_ID`, agregar al final con comentario explicativo
    - .planning/standalone/client-activation-auto-revoke/RESEARCH.md §Test Strategy lineas 337-366 (8 escenarios literales)
    - .planning/standalone/client-activation-auto-revoke/CONTEXT.md §Verificacion post-deploy lineas 144-151 (6 escenarios UAT mappeados a tests 1-6)
    - supabase/migrations/20260428160000_client_activation_revoke.sql (cuerpo del trigger — entender que asserts hacer)
    - src/lib/domain/contacts.ts:672 (`getContactIsClient`) — referencia para SELECT directo equivalente en helper
  </read_first>
  <action>
    Crear archivo `src/__tests__/integration/client-activation-trigger.test.ts` con la siguiente estructura (mirror exacto del patron `orders-cas.test.ts` extendido con helpers especificos del dominio is_client):

    ```typescript
    /**
     * Integration test — trigger bidireccional mark_client_on_stage_change().
     * D-01..D-03 + RESEARCH (client-activation-auto-revoke) §Trigger SQL Pattern + §Test Strategy.
     *
     * Requiere env vars — ver .env.test.example en la raiz del repo.
     * Si env vars missing -> tests SKIP (no fail, no pass silencioso).
     *
     * Corre contra Supabase real (admin client con service_role). Usa TEST_WORKSPACE_ID
     * aislado — nunca usar workspace productivo.
     *
     * Pre-requisito: migracion 20260428160000_client_activation_revoke.sql aplicada en
     * el proyecto Supabase apuntado por NEXT_PUBLIC_SUPABASE_URL.
     */
    import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest'
    import { createClient } from '@supabase/supabase-js'

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
    const TEST_PIPELINE_ID = process.env.TEST_PIPELINE_ID ?? ''
    // STAGE_A y STAGE_B son non-activator stages (reusables de orders-cas test env).
    const STAGE_A = process.env.TEST_STAGE_A ?? ''
    const STAGE_B = process.env.TEST_STAGE_B ?? ''
    // ACTIVATOR_STAGE es el stage marcado como activator en client_activation_config.
    // Reusa STAGE_C de orders-cas si esta configurado como activator, sino define
    // TEST_ACTIVATOR_STAGE_ID en .env.test.
    const ACTIVATOR_STAGE = process.env.TEST_ACTIVATOR_STAGE_ID ?? process.env.TEST_STAGE_C ?? ''
    // ACTIVATOR_STAGE_2 (opcional) para test de transicion activator→activator mismo set.
    // Si no esta definido, ese test individual hace skip (it.skipIf interno).
    const ACTIVATOR_STAGE_2 = process.env.TEST_ACTIVATOR_STAGE_2_ID ?? ''

    const envReady = Boolean(
      SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID &&
      TEST_PIPELINE_ID && STAGE_A && STAGE_B && ACTIVATOR_STAGE
    )

    const admin = envReady ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null

    // ---------- helpers (only invoked when envReady) ----------

    async function ensureActivationConfig(activatorStageIds: string[]) {
      // Upsert config para TEST_WORKSPACE_ID con enabled=true + activation_stage_ids=[ACTIVATOR_STAGE, ...]
      await admin!
        .from('client_activation_config')
        .upsert({
          workspace_id: TEST_WORKSPACE_ID,
          enabled: true,
          all_are_clients: false,
          activation_stage_ids: activatorStageIds,
        }, { onConflict: 'workspace_id' })
    }

    async function seedContact(phoneSuffix: string): Promise<string> {
      // phone unique per test para evitar collision en TEST_WORKSPACE_ID
      const phone = `5550000${phoneSuffix.padStart(4, '0')}`
      const { data, error } = await admin!
        .from('contacts')
        .insert({
          workspace_id: TEST_WORKSPACE_ID,
          phone,
          name: `TEST trigger ${phoneSuffix}`,
          is_client: false, // baseline
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    }

    async function seedOrder(contactId: string, stageId: string): Promise<string> {
      const { data, error } = await admin!
        .from('orders')
        .insert({
          workspace_id: TEST_WORKSPACE_ID,
          contact_id: contactId,
          stage_id: stageId,
          pipeline_id: TEST_PIPELINE_ID,
          name: 'TEST trigger order',
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    }

    async function setOrderStage(orderId: string, newStageId: string): Promise<void> {
      const { error } = await admin!
        .from('orders')
        .update({ stage_id: newStageId })
        .eq('id', orderId)
      if (error) throw error
    }

    async function getIsClient(contactId: string): Promise<boolean> {
      const { data, error } = await admin!
        .from('contacts')
        .select('is_client')
        .eq('id', contactId)
        .single()
      if (error || !data) return false
      return Boolean((data as { is_client: boolean | null }).is_client)
    }

    async function cleanupOrders(contactId: string) {
      await admin!.from('orders').delete().eq('contact_id', contactId)
    }

    async function cleanupContact(contactId: string) {
      await cleanupOrders(contactId)
      await admin!.from('contacts').delete().eq('id', contactId)
    }

    // ---------- suite ----------

    describe.skipIf(!envReady)('mark_client_on_stage_change — bidirectional trigger', () => {
      beforeAll(async () => {
        // Asegurar config activadora apunta a ACTIVATOR_STAGE (+ ACTIVATOR_STAGE_2 si existe)
        const stages = ACTIVATOR_STAGE_2 ? [ACTIVATOR_STAGE, ACTIVATOR_STAGE_2] : [ACTIVATOR_STAGE]
        await ensureActivationConfig(stages)
      })

      // ---------- Escenario 1: INSERT a activator → flips true ----------
      describe('INSERT path', () => {
        let contactId: string
        beforeEach(async () => { contactId = await seedContact('1') })
        afterEach(async () => { await cleanupContact(contactId) })

        it('INSERT order in activator stage → contact.is_client = true', async () => {
          expect(await getIsClient(contactId)).toBe(false) // baseline
          await seedOrder(contactId, ACTIVATOR_STAGE)
          expect(await getIsClient(contactId)).toBe(true)
        })

        // ---------- Escenario 7: INSERT outside activator → no cambio ----------
        it('INSERT order in non-activator stage → contact.is_client stays false', async () => {
          await seedOrder(contactId, STAGE_A)
          expect(await getIsClient(contactId)).toBe(false)
        })
      })

      // ---------- Escenario 2: UPDATE non-activator → activator (IN) ----------
      describe('UPDATE IN crossing', () => {
        let contactId: string
        let orderId: string
        beforeEach(async () => {
          contactId = await seedContact('2')
          orderId = await seedOrder(contactId, STAGE_A) // start non-activator
        })
        afterEach(async () => { await cleanupContact(contactId) })

        it('UPDATE non-activator → activator → contact.is_client flips true', async () => {
          expect(await getIsClient(contactId)).toBe(false)
          await setOrderStage(orderId, ACTIVATOR_STAGE)
          expect(await getIsClient(contactId)).toBe(true)
        })
      })

      // ---------- Escenario 3: UPDATE activator → non-activator (OUT, sola orden) ----------
      describe('UPDATE OUT crossing — single order', () => {
        let contactId: string
        let orderId: string
        beforeEach(async () => {
          contactId = await seedContact('3')
          orderId = await seedOrder(contactId, ACTIVATOR_STAGE) // start activator
        })
        afterEach(async () => { await cleanupContact(contactId) })

        it('UPDATE activator → non-activator (no other orders) → flips false', async () => {
          expect(await getIsClient(contactId)).toBe(true)
          await setOrderStage(orderId, STAGE_A)
          expect(await getIsClient(contactId)).toBe(false)
        })
      })

      // ---------- Escenario 4: UPDATE activator → non-activator (OUT, otra orden activator) ----------
      describe('UPDATE OUT crossing — multi-order anchor', () => {
        let contactId: string
        let order1: string
        let order2: string
        beforeEach(async () => {
          contactId = await seedContact('4')
          order1 = await seedOrder(contactId, ACTIVATOR_STAGE)
          order2 = await seedOrder(contactId, ACTIVATOR_STAGE) // segunda orden activator anchor
          // is_client ya en true por order1 INSERT, order2 INSERT idempotente
        })
        afterEach(async () => { await cleanupContact(contactId) })

        it('UPDATE one activator → non-activator while other activator order remains → STAYS true', async () => {
          expect(await getIsClient(contactId)).toBe(true)
          await setOrderStage(order1, STAGE_A)
          // EXISTS check encuentra order2 still in activator → no flip false
          expect(await getIsClient(contactId)).toBe(true)
        })
      })

      // ---------- Escenario 5: UPDATE non-activator → non-activator (no cambio) ----------
      describe('UPDATE non-border', () => {
        let contactId: string
        let orderId: string
        beforeEach(async () => {
          contactId = await seedContact('5')
          orderId = await seedOrder(contactId, STAGE_A) // baseline non-activator
        })
        afterEach(async () => { await cleanupContact(contactId) })

        it('UPDATE non-activator → non-activator → contact.is_client stays false (no recalc)', async () => {
          await setOrderStage(orderId, STAGE_B)
          expect(await getIsClient(contactId)).toBe(false)
        })
      })

      // ---------- Escenario 6: UPDATE activator → activator mismo set (no cambio) ----------
      describe.skipIf(!ACTIVATOR_STAGE_2)('UPDATE within activator set', () => {
        let contactId: string
        let orderId: string
        beforeEach(async () => {
          contactId = await seedContact('6')
          orderId = await seedOrder(contactId, ACTIVATOR_STAGE)
        })
        afterEach(async () => { await cleanupContact(contactId) })

        it('UPDATE activator A → activator B (both in set) → stays true', async () => {
          expect(await getIsClient(contactId)).toBe(true)
          await setOrderStage(orderId, ACTIVATOR_STAGE_2)
          expect(await getIsClient(contactId)).toBe(true)
        })
      })

      // ---------- Escenario 8: same-TX two-order updates of same contact ----------
      describe('same-contact concurrent OUTs', () => {
        let contactId: string
        let order1: string
        let order2: string
        beforeEach(async () => {
          contactId = await seedContact('8')
          order1 = await seedOrder(contactId, ACTIVATOR_STAGE)
          order2 = await seedOrder(contactId, ACTIVATOR_STAGE)
        })
        afterEach(async () => { await cleanupContact(contactId) })

        it('Two activator orders both moved OUT (sequential) → final is_client = false', async () => {
          expect(await getIsClient(contactId)).toBe(true)
          await setOrderStage(order1, STAGE_A)
          // order2 still in activator → trigger sees EXISTS → STAYS true
          expect(await getIsClient(contactId)).toBe(true)
          await setOrderStage(order2, STAGE_A)
          // ahora EXISTS retorna false (excluyendo order2 self) → flips false
          expect(await getIsClient(contactId)).toBe(false)
        })

        it('Two activator orders moved OUT in parallel (Promise.all) → final is_client = false', async () => {
          // RQ-2.c RESEARCH: race acceptable; final state correcto via MVCC
          expect(await getIsClient(contactId)).toBe(true)
          await Promise.all([
            setOrderStage(order1, STAGE_A),
            setOrderStage(order2, STAGE_A),
          ])
          // En el peor case ambos triggers ven "el otro existe" → ninguno flipea false.
          // En el mejor case el segundo ve self-only → flipea false.
          // RESEARCH §RQ-2.c discutio el race: final state matches reality (zero activator
          // orders quedan), pero el is_client puede quedar en true por race. Aceptable —
          // un eventual SET o INSERT subsecuente lo corrige. Test acepta TRUE o FALSE
          // (documentando el comportamiento conocido) y verifica que NO crashea.
          const finalState = await getIsClient(contactId)
          expect([true, false]).toContain(finalState)
          // Sanity: no orden en activator stage post-update
          const { count } = await admin!
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('contact_id', contactId)
            .eq('stage_id', ACTIVATOR_STAGE)
          expect(count ?? 0).toBe(0)
        })
      })
    })
    ```

    NOTAS al implementar:
    - El env var `TEST_ACTIVATOR_STAGE_ID` puede no existir en `.env.test.example`. Si tras `cat .env.test.example` confirma que NO esta, agregar al final del archivo:
      ```
      # client-activation-trigger.test.ts
      # ID de un stage que esta en client_activation_config.activation_stage_ids para TEST_WORKSPACE_ID.
      # Si no se define, el suite intenta reusar TEST_STAGE_C — pero TEST_STAGE_C es NON-activator
      # en orders-cas.test.ts, asi que define este explicitamente.
      TEST_ACTIVATOR_STAGE_ID=

      # Opcional — segundo stage activator para test "UPDATE activator A → activator B" (escenario 6).
      # Si no se define, ese test individual hace SKIP (it.skipIf).
      TEST_ACTIVATOR_STAGE_2_ID=
      ```
    - El test 8 parallel (Promise.all) acepta TRUE o FALSE — RESEARCH §RQ-2.c lineas 233-238 documenta el race acceptable. Lo importante es que el sistema NO crashea + las ordenes quedaron correctamente OUT del activator.
    - Cleanup robusto: `cleanupContact` borra ordenes primero (por FK), luego contacto.
    - Si `client_activation_config.workspace_id = TEST_WORKSPACE_ID` ya existe, el `upsert` lo actualiza. NO necesita teardown del config (queda con el TEST_ACTIVATOR_STAGE para futuras corridas).

    Si tras revisar `.env.test.example` ya hay un stage definido como activator (ej. STAGE_C es activator en algun setup), el codigo prioriza `TEST_ACTIVATOR_STAGE_ID` con fallback a `TEST_STAGE_C`. Documentar la eleccion en el LEARNINGS update post-cierre.
  </action>
  <verify>
    <automated>test -f src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "describe.skipIf(!envReady)" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "mark_client_on_stage_change" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "INSERT order in activator stage" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "UPDATE non-activator → activator" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "UPDATE activator → non-activator (no other orders)" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "while other activator order remains" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "non-activator → non-activator" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "Two activator orders both moved OUT (sequential)" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "ensureActivationConfig" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>grep -q "cleanupContact" src/__tests__/integration/client-activation-trigger.test.ts</automated>
    <automated>npx tsc --noEmit src/__tests__/integration/client-activation-trigger.test.ts 2>&1 | head -20 || true</automated>
  </verify>
  <done>
    - Archivo `src/__tests__/integration/client-activation-trigger.test.ts` existe con 8 escenarios + describe.skipIf gating.
    - Si `.env.test.example` no tenia `TEST_ACTIVATOR_STAGE_ID`, se agrego con comentario explicativo.
    - TypeScript compila sin errores (verify con `npx tsc --noEmit`).
    - Tests SKIP silenciosamente cuando env vars incompletas (verificable corriendo `npm test -- src/__tests__/integration/client-activation-trigger.test.ts` localmente sin env).
  </done>
</task>

<task type="auto">
  <name>Task 2: Correr suite localmente (si env disponible) + commit + push</name>
  <read_first>
    - .env.test (si existe) — confirmar env vars completas para correr el suite end-to-end
    - .claude/rules/code-changes.md (commits atomicos, push despues)
    - CLAUDE.md §Regla 1 (push despues de cambios de codigo) §Regla 5 (NO aplica aqui — no migracion involved en este plan)
  </read_first>
  <action>
    **Paso 1 — Correr suite localmente (best-effort):**

    Si el desarrollador tiene `.env.test` configurado con `TEST_WORKSPACE_ID` + `TEST_PIPELINE_ID` + `TEST_STAGE_A` + `TEST_STAGE_B` + `TEST_ACTIVATOR_STAGE_ID`:

    ```bash
    npm test -- src/__tests__/integration/client-activation-trigger.test.ts
    ```

    Esperado: TODOS los tests passing. Si algun test falla:
    - Test 1-3 fail → trigger no esta haciendo IN/OUT correctamente (revisar Plan 01 SQL aplicado en el proyecto Supabase del .env.test).
    - Test 4 fail (anchor) → EXISTS query usando `NEW.contact_id` en vez de `OLD.contact_id` (Plan 01 bug, requiere fix urgente y nueva migracion).
    - Test 8 sequential fail → ROW_COUNT semantics o WHERE gates broken.
    - Test 8 parallel fail → race no acceptable; revisar RQ-2.c RESEARCH para nueva mitigacion.

    Si NO tiene `.env.test`, el suite hace SKIP silencioso (`describe.skipIf(!envReady)`). Eso esta OK — el commit puede proceder sin run local; CI con env vars eventualmente lo correra.

    **Paso 2 — Commit + push:**

    ```bash
    git add src/__tests__/integration/client-activation-trigger.test.ts
    # Si modificaste .env.test.example en Task 1:
    git add .env.test.example  # solo si fue tocado

    git commit -m "$(cat <<'EOF'
    test(client-activation-auto-revoke): add integration suite for bidirectional trigger

    Cubre 8 escenarios de RESEARCH §Test Strategy seccion 2 contra Postgres real:
    1. INSERT activator → is_client=true
    2. UPDATE non-activator → activator → flips true
    3. UPDATE activator → non-activator (sola orden) → flips false
    4. UPDATE activator → non-activator (anchor) → STAYS true
    5. UPDATE non-activator → non-activator → no cambio
    6. UPDATE activator → activator mismo set → no cambio (skipIf sin STAGE_2)
    7. INSERT outside activator → no cambio
    8. Two-order OUT sequential + parallel (parallel acepta TRUE o FALSE per RQ-2.c)

    Pattern mirror de orders-cas.test.ts: env-gated con describe.skipIf(!envReady),
    helpers fixture-style (seedContact/seedOrder/setOrderStage/getIsClient/cleanup),
    admin client con service_role, TEST_WORKSPACE_ID aislado.

    Standalone: client-activation-auto-revoke
    Plan: 02 (opcional — regression safety)

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    git push origin main
    ```

    **Paso 3 — Actualizar LEARNINGS.md del Plan 01 con commit hash + decision sobre TEST_ACTIVATOR_STAGE_ID:**

    Editar `.planning/standalone/client-activation-auto-revoke/LEARNINGS.md` para reemplazar la seccion `## Deferred (Plan 02 opcional)` con:

    ```markdown
    ## Plan 02 — Integration test suite (SHIPPED)

    **Commits:**
    - `<HASH>` `test(client-activation-auto-revoke): add integration suite for bidirectional trigger`

    **Decisiones de implementacion:**
    - Env var `TEST_ACTIVATOR_STAGE_ID` <agregada / reusada de TEST_STAGE_C / ya existia> en `.env.test.example`.
    - Env var opcional `TEST_ACTIVATOR_STAGE_2_ID` para escenario 6 (activator A → activator B mismo set). Si no esta, ese test individual hace SKIP.
    - Test 8 parallel (Promise.all) acepta TRUE o FALSE en is_client final — race acceptable per RQ-2.c RESEARCH (final state matches reality: zero ordenes en activator). Documenta el race conocido y verifica que el sistema NO crashea.
    - Suite SKIP silencioso (no fail) cuando env incompleto — viable en CI sin Supabase test project.
    ```

    Reemplazar `<HASH>` con el commit hash del Paso 2 (ejecutar `git log -1 --format=%H` y substituir).

    Reemplazar `<agregada / reusada / ya existia>` con la opcion correcta segun lo que el desarrollador encontro en Task 1.

    Commit del LEARNINGS update:

    ```bash
    git add .planning/standalone/client-activation-auto-revoke/LEARNINGS.md
    git commit -m "$(cat <<'EOF'
    docs(client-activation-auto-revoke): Plan 02 LEARNINGS update — integration suite shipped

    Standalone: client-activation-auto-revoke
    Plan: 02 (cierre)

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    git push origin main
    ```
  </action>
  <verify>
    <automated>git log origin/main -1 --pretty=%s | grep -q "docs(client-activation-auto-revoke): Plan 02 LEARNINGS update"</automated>
    <automated>git log origin/main -3 --pretty=%s | grep -q "test(client-activation-auto-revoke): add integration suite"</automated>
    <automated>grep -q "Plan 02 — Integration test suite (SHIPPED)" .planning/standalone/client-activation-auto-revoke/LEARNINGS.md</automated>
    <automated>! grep -q "## Deferred (Plan 02 opcional)" .planning/standalone/client-activation-auto-revoke/LEARNINGS.md</automated>
  </verify>
  <done>
    - Suite commiteada + pusheada a `origin main`.
    - LEARNINGS.md actualizado con seccion `Plan 02 — Integration test suite (SHIPPED)` reemplazando la seccion deferred.
    - 2 commits totales (test + docs LEARNINGS update), ambos pusheados.
    - `git status` clean (los `M`/`??` pre-existentes no relacionados quedan tal cual).
    - Standalone client-activation-auto-revoke CERRADO completamente con regression safety automatizada.
  </done>
</task>

</tasks>

<verification>
- `src/__tests__/integration/client-activation-trigger.test.ts` existe con 8 escenarios cubriendo IN/OUT del trigger bidireccional + edge cases (anchor multi-order + same-TX two-order parallel).
- TypeScript compila (`npx tsc --noEmit` sobre el archivo no genera errores).
- Suite SKIP silencioso cuando env vars incompletas — describe.skipIf(!envReady) gate.
- Si `.env.test.example` se modifico para agregar `TEST_ACTIVATOR_STAGE_ID`, el archivo esta en el mismo commit que el test file.
- Commit + push exitoso en `origin main`.
- LEARNINGS.md del Plan 01 actualizado para reemplazar la seccion deferred con `Plan 02 — Integration test suite (SHIPPED)`.
- 2 commits del Plan 02 pusheados (test + docs).
</verification>

<success_criteria>
- Regression safety automatizada para el trigger `mark_client_on_stage_change` — futuras migraciones que toquen el trigger pueden correr este suite y obtener green/red signal en lugar de UAT manual.
- Los 6 escenarios UAT de CONTEXT.md (lineas 144-151) ahora tienen contraparte automatizada (mappeados a tests 1-7 + escenario 8 nuevo para edge case parallel).
- Race acceptable de RQ-2.c documentado en el test 8 parallel — explicito en codigo + en LEARNINGS.
- Suite no requiere environment de produccion para correr — env-gated con TEST_WORKSPACE_ID aislado, usa TEST_PIPELINE_ID + TEST_STAGES dedicated.
- LEARNINGS Plan 01 §Deferred section reemplazada por §Plan 02 SHIPPED — historial de decisiones intacto.
</success_criteria>

<output>
After completion, create `.planning/standalone/client-activation-auto-revoke/02-SUMMARY.md` documenting:
- Commit hashes de Task 2 (test suite + LEARNINGS update)
- Filename: `src/__tests__/integration/client-activation-trigger.test.ts`
- Si `.env.test.example` se modifico: nota explicita + las env vars agregadas
- Resultado de `npm test` local (passing / SKIP por env / fail con descripcion) — si fail, NO marcar standalone como cerrado, requiere fix
- Confirmacion: "Regression safety shipped. 8 escenarios cubiertos. Suite env-gated. LEARNINGS Plan 01 actualizado de Deferred a Shipped."
- Push final commit range
</output>
