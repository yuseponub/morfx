---
phase: agent-lifecycle-router
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/domain/routing.ts
  - src/lib/domain/orders.ts                    # B-4 fix: extension (getActiveOrderForContact, getLastDeliveredOrderDate, countOrdersInLastNDays, isContactInRecompraPipeline)
  - src/lib/domain/tags.ts                      # B-4 fix: extension (getContactTags, listAllTags)
  - src/lib/domain/contacts.ts                  # B-4 fix: extension (helper getters needed by Plan 03 facts)
  - src/lib/domain/messages.ts                  # B-4 fix: extension (getLastInboundMessageAt, getInboundConversationsLastNDays for Plan 05)
  - src/lib/domain/workspace-agent-config.ts    # B-1 fix: NEW file (getWorkspaceRecompraEnabled for legacy parity rule)
  - src/lib/agents/routing/schema/validate.ts
  - src/lib/agents/routing/__tests__/domain.test.ts
  - src/lib/agents/routing/__tests__/schema.test.ts
  - src/lib/agents/routing/__tests__/fixtures.ts
  - src/lib/agents/routing/__tests__/domain-extensions.test.ts   # B-4 fix: tests for the domain extensions
autonomous: true
requirements_addressed: [ROUTER-REQ-01, ROUTER-REQ-07, ROUTER-REQ-09, ROUTER-REQ-12]
user_setup: []

must_haves:
  truths:
    - "Domain layer `src/lib/domain/routing.ts` es el UNICO archivo del repo con `createAdminClient()` para escribir/leer las tablas routing_rules, routing_facts_catalog, routing_audit_log (Regla 3 — verificable con grep)."
    - "B-4 fix: TODAS las extensiones de domain layer que Plan 03 fact resolvers necesitan se consolidan en este Plan 02 (no en Plan 03), eliminando file conflict en wave paralela. Funciones nuevas/extendidas: `getActiveOrderForContact`, `getLastDeliveredOrderDate`, `countOrdersInLastNDays`, `isContactInRecompraPipeline` (orders.ts); `getContactTags`, `listAllTags` (tags.ts); `getLastInboundMessageAt`, `getInboundConversationsLastNDays` (messages.ts); `getWorkspaceRecompraEnabled` (workspace-agent-config.ts NEW file)."
    - "B-1 fix: `getWorkspaceRecompraEnabled(workspaceId): Promise<boolean>` lee `workspace_agent_config.recompra_enabled` y retorna ese boolean (default true if config missing — preserva comportamiento legacy de webhook-processor.ts:172). Funcion necesaria para fact resolver `recompraEnabled` en Plan 03 + regla legacy parity priority 900 en Plan 07."
    - "Toda funcion de domain.routing recibe `workspaceId` como parametro y filtra por `workspace_id` en cada query (Regla 3, multi-tenant safety)."
    - "`validateRule(rule)` con Ajv compila el schema rule-v1.schema.json al import del modulo y rechaza payloads con campo `path` (Pitfall 2 mitigation verificable con test)."
    - "`recordAuditLog(...)` acepta los 4 valores literales del enum reason: 'matched', 'human_handoff', 'no_rule_matched', 'fallback_legacy' (D-16 + DB CHECK constraint). Insert va a tabla `routing_audit_log` via createAdminClient."
    - "Tests vitest pasan: schema rejects path field, schema accepts valid v1 rule with all/any/not nesting, schema rejects unknown lifecycle_state, domain.upsertRule sets updated_at, domain.recordAuditLog accepts all 4 reasons."
  artifacts:
    - path: "src/lib/domain/routing.ts"
      provides: "CRUD funciones para routing_rules + recordAuditLog + listFactsCatalog. Single-source-of-truth para mutaciones de routing tables (Regla 3)."
      exports:
        - "listRules"
        - "getRule"
        - "upsertRule"
        - "deleteRule"
        - "recordAuditLog"
        - "listFactsCatalog"
        - "loadActiveRulesForWorkspace"
        - "getMaxUpdatedAt"
      contains: "createAdminClient"
    - path: "src/lib/agents/routing/schema/validate.ts"
      provides: "Ajv-compiled validator para rule-v1.schema.json. Export validateRule(rule) → { ok, errors? }."
      exports:
        - "validateRule"
        - "compileSchema"
      contains: "import ruleV1Schema from './rule-v1.schema.json'"
    - path: "src/lib/agents/routing/__tests__/fixtures.ts"
      provides: "Sample rules (valid/invalid) + sample facts + helper makeRule(...). Reusado por Plans 03, 04, 05, 06."
      exports:
        - "validClassifierRule"
        - "validRouterRule"
        - "ruleWithPathField"
        - "ruleWithUnknownLifecycleState"
        - "makeRule"
  key_links:
    - from: "src/lib/agents/routing/schema/validate.ts"
      to: "src/lib/agents/routing/schema/rule-v1.schema.json (creado en Plan 01)"
      via: "import ruleV1Schema"
      pattern: "import ruleV1Schema from"
    - from: "src/lib/domain/routing.ts"
      to: "tabla Supabase routing_rules / routing_facts_catalog / routing_audit_log"
      via: "createAdminClient() + .from('routing_*')"
      pattern: "from\\('routing_"
    - from: "src/lib/domain/routing.ts:upsertRule"
      to: "src/lib/agents/routing/schema/validate.ts:validateRule"
      via: "import + invocacion antes de insert (defense en write per D-12)"
      pattern: "validateRule\\("
---

<objective>
Wave 1 — Domain layer + JSON Schema validator. Single-source-of-truth (Regla 3) para todas las mutaciones de routing_rules / routing_audit_log / routing_facts_catalog.

Purpose: (1) Aislar TODA la I/O hacia las nuevas tablas routing_* en `src/lib/domain/routing.ts` con `createAdminClient()` + filtro `workspace_id` por query. (2) Materializar el validator Ajv del JSON Schema creado en Plan 01 — invocado en write (admin form Plan 06) y on-load (cache Plan 03). (3) Crear fixtures compartidas para tests posteriores. (4) TDD: tests primero (RED), implementacion despues (GREEN).

Output: 5 archivos nuevos. Codigo TypeScript compila (`tsc --noEmit`) y tests vitest pasan.

**CRITICAL — Regla 3:** `createAdminClient()` SOLO en `src/lib/domain/routing.ts`. NUNCA en `src/lib/agents/routing/**` (engine, facts, route, dry-run, cache). Verificable: `grep -r "createAdminClient" src/lib/agents/routing/` debe retornar vacio en todos los Plans subsiguientes.

**CRITICAL — Pitfall 5 (RESEARCH §Pitfall 5):** Schema validation se hace en write Y on-load. Plan 03 cache.ts tambien valida cada rule al cargarla — pero el validator vive aqui en Plan 02 (un solo modulo, Plan 03 lo importa).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-lifecycle-router/CONTEXT.md  # D-12 schema versionado, D-16 reason enum 4 valores
@.planning/standalone/agent-lifecycle-router/RESEARCH.md  # §Code Examples lineas 818-839 (Ajv setup), §Pattern 5 audit log shape, §Don't Hand-Roll lineas 528-541 (Ajv recommended)
@CLAUDE.md  # Regla 3 Domain Layer estricta
@src/lib/domain/tags.ts  # patron canonico domain layer: createAdminClient + workspace_id filter + DomainResult
@src/lib/domain/types.ts  # DomainContext y DomainResult shapes
@src/lib/agents/routing/schema/rule-v1.schema.json  # creado en Plan 01 — schema source-of-truth
@supabase/migrations/<ts>_agent_lifecycle_router.sql  # creado en Plan 01 — confirma column names

<interfaces>
<!-- Patron canonico domain layer (extraido de src/lib/domain/tags.ts) -->
import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

// DomainContext shape (verified src/lib/domain/types.ts):
export interface DomainContext {
  workspaceId: string
  userId?: string
  source?: 'user' | 'webhook' | 'agent' | 'system'
}

// DomainResult shape:
export type DomainResult<T> = { success: true; data: T } | { success: false; error: string }

<!-- Shape de RoutingRule (typescript) — derivado de la tabla -->
export interface RoutingRule {
  id: string
  workspace_id: string
  schema_version: 'v1'
  rule_type: 'lifecycle_classifier' | 'agent_router'
  name: string
  priority: number
  conditions: TopLevelCondition  // matches JSON Schema $defs/topLevelCondition
  event: { type: 'route'; params: { lifecycle_state: string } | { agent_id: string | null } }
  active: boolean
  created_at: string
  updated_at: string
  created_by_user_id: string | null
  created_by_agent_id: string | null
}

<!-- Reason enum (D-16 + DB CHECK constraint en routing_audit_log) -->
export type RoutingReason = 'matched' | 'human_handoff' | 'no_rule_matched' | 'fallback_legacy'

<!-- Audit log row shape (matches tabla routing_audit_log) -->
export interface RoutingAuditEntry {
  workspace_id: string
  contact_id: string
  conversation_id: string | null
  inbound_message_id: string | null
  agent_id: string | null
  reason: RoutingReason
  lifecycle_state: string
  fired_classifier_rule_id: string | null
  fired_router_rule_id: string | null
  facts_snapshot: Record<string, unknown>
  rule_set_version_at_decision: string | null
  latency_ms: number
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Tests + fixtures + Ajv validator (RED → GREEN)</name>
  <read_first>
    - src/lib/agents/routing/schema/rule-v1.schema.json (creado en Plan 01)
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Code Examples lineas 818-839 (Ajv compile pattern)
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Pitfalls 2 (path field rejection)
    - vitest.config.ts (project root — confirmar test framework)
  </read_first>
  <behavior>
    Tests que el validator debe pasar:
    - Test 1: validateRule(validClassifierRule) → { ok: true }
    - Test 2: validateRule(validRouterRule) → { ok: true } con event.params.agent_id = string
    - Test 3: validateRule(validRouterRule_humanHandoff) → { ok: true } con event.params.agent_id = null
    - Test 4: validateRule({...validRule, conditions: { all: [{ fact: 'x', operator: 'equal', value: 'y', path: '$.something' }] }}) → { ok: false, errors contiene 'path' o 'additionalProperties' } (Pitfall 2)
    - Test 5: validateRule({...validRule, event: { type: 'route', params: { lifecycle_state: 'invalid_state' } }}) → { ok: false, errors menciona enum }
    - Test 6: validateRule({...validRule, schema_version: 'v2'}) → { ok: false, errors menciona schema_version o const}
    - Test 7: validateRule({...validRule, conditions: { all: [{ any: [{ fact: 'x', operator: 'equal', value: 'y'}] }] }}) → { ok: true } (nesting valido)
    - Test 8: validateRule({...validRule, priority: 0}) → { ok: false } (minimum 1)
    - Test 9: validateRule({...validRule, priority: 100001}) → { ok: false } (maximum 100000)
    - Test 10: validateRule({...validRule, name: ''}) → { ok: false } (minLength 1)
  </behavior>
  <action>
    **Paso 1 — Crear `src/lib/agents/routing/__tests__/fixtures.ts`** (TDD: fixtures compartidas para Plans 03-06):

    ```typescript
    // Test fixtures shared across all routing tests.
    // Used by: Plan 02 (this), Plan 03 (engine + cache), Plan 05 (dry-run), Plan 06 (admin form).

    import type { RoutingRule } from '@/lib/domain/routing'

    export const validClassifierRule: Omit<RoutingRule, 'id' | 'created_at' | 'updated_at' | 'created_by_user_id' | 'created_by_agent_id'> = {
      workspace_id: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      schema_version: 'v1',
      rule_type: 'lifecycle_classifier',
      name: 'in_transit_active_order',
      priority: 100,
      conditions: {
        all: [
          { fact: 'activeOrderStage', operator: 'equal', value: 'transit' },
        ],
      },
      event: { type: 'route', params: { lifecycle_state: 'in_transit' } },
      active: true,
    }

    export const validRouterRule: Omit<RoutingRule, 'id' | 'created_at' | 'updated_at' | 'created_by_user_id' | 'created_by_agent_id'> = {
      workspace_id: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      schema_version: 'v1',
      rule_type: 'agent_router',
      name: 'in_transit_to_postsale',
      priority: 100,
      conditions: {
        all: [
          { fact: 'lifecycle_state', operator: 'equal', value: 'in_transit' },
          { fact: 'tags', operator: 'doesNotContain', value: 'forzar_humano' },
        ],
      },
      event: { type: 'route', params: { agent_id: 'somnio-recompra-v1' } },
      active: true,
    }

    export const validRouterRule_humanHandoff: typeof validRouterRule = {
      ...validRouterRule,
      name: 'forzar_humano_handoff',
      priority: 1000,
      conditions: {
        all: [
          { fact: 'tags', operator: 'arrayContainsAny', value: ['forzar_humano'] },
        ],
      },
      event: { type: 'route', params: { agent_id: null } },  // null = human handoff (D-16)
    }

    export const ruleWithPathField = {
      ...validClassifierRule,
      conditions: {
        all: [
          { fact: 'activeOrderStage', operator: 'equal', value: 'transit', path: '$.stage' },  // CVE-2025-1302 surface
        ],
      },
    }

    export const ruleWithUnknownLifecycleState = {
      ...validClassifierRule,
      event: { type: 'route', params: { lifecycle_state: 'invalid_state' } },
    }

    export const ruleWithNestedAnyAll = {
      ...validClassifierRule,
      conditions: {
        all: [
          {
            any: [
              { fact: 'activeOrderStage', operator: 'equal', value: 'transit' },
              { fact: 'activeOrderStage', operator: 'equal', value: 'preparation' },
            ],
          },
          { fact: 'isClient', operator: 'equal', value: true },
        ],
      },
    }

    /**
     * Helper to construct a complete RoutingRule from partial overrides.
     * Used by tests that need to mutate single fields.
     */
    export function makeRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
      return {
        id: '00000000-0000-0000-0000-000000000001',
        workspace_id: 'a3843b3f-c337-4836-92b5-89c58bb98490',
        schema_version: 'v1',
        rule_type: 'lifecycle_classifier',
        name: 'test_rule',
        priority: 100,
        conditions: { all: [{ fact: 'isClient', operator: 'equal', value: true }] },
        event: { type: 'route', params: { lifecycle_state: 'new_prospect' } },
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by_user_id: null,
        created_by_agent_id: null,
        ...overrides,
      }
    }
    ```

    **Paso 2 — Crear `src/lib/agents/routing/__tests__/schema.test.ts`** (RED — falla porque validate.ts no existe):

    ```typescript
    import { describe, it, expect } from 'vitest'
    import { validateRule } from '../schema/validate'
    import {
      validClassifierRule,
      validRouterRule,
      validRouterRule_humanHandoff,
      ruleWithPathField,
      ruleWithUnknownLifecycleState,
      ruleWithNestedAnyAll,
    } from './fixtures'

    describe('validateRule (rule-v1.schema.json)', () => {
      it('accepts valid classifier rule', () => {
        const result = validateRule(validClassifierRule)
        expect(result.ok).toBe(true)
      })

      it('accepts valid router rule with agent_id string', () => {
        const result = validateRule(validRouterRule)
        expect(result.ok).toBe(true)
      })

      it('accepts router rule with agent_id null (human handoff per D-16)', () => {
        const result = validateRule(validRouterRule_humanHandoff)
        expect(result.ok).toBe(true)
      })

      it('rejects rule with path field in leaf condition (Pitfall 2 — CVE-2025-1302)', () => {
        const result = validateRule(ruleWithPathField)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          const allErrors = result.errors.join(' ')
          expect(allErrors).toMatch(/path|additionalProperties/)
        }
      })

      it('rejects rule with unknown lifecycle_state', () => {
        const result = validateRule(ruleWithUnknownLifecycleState)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.errors.join(' ')).toMatch(/enum|invalid_state/)
        }
      })

      it('rejects rule with schema_version != v1', () => {
        const result = validateRule({ ...validClassifierRule, schema_version: 'v2' as 'v1' })
        expect(result.ok).toBe(false)
      })

      it('accepts nested any-inside-all conditions', () => {
        const result = validateRule(ruleWithNestedAnyAll)
        expect(result.ok).toBe(true)
      })

      it('rejects priority below 1', () => {
        const result = validateRule({ ...validClassifierRule, priority: 0 })
        expect(result.ok).toBe(false)
      })

      it('rejects priority above 100000', () => {
        const result = validateRule({ ...validClassifierRule, priority: 100001 })
        expect(result.ok).toBe(false)
      })

      it('rejects empty name', () => {
        const result = validateRule({ ...validClassifierRule, name: '' })
        expect(result.ok).toBe(false)
      })
    })
    ```

    **Paso 3 — Crear `src/lib/agents/routing/schema/validate.ts`** (GREEN):

    ```typescript
    /**
     * Ajv-compiled validator for rule-v1.schema.json.
     *
     * Used by:
     *   - src/lib/domain/routing.ts (write-time validation in upsertRule)
     *   - src/lib/agents/routing/cache.ts (on-load validation per Pitfall 5)
     *
     * Schema source: src/lib/agents/routing/schema/rule-v1.schema.json
     * Pitfall 2 mitigation: schema's leafCondition has additionalProperties:false → rejects `path` field.
     */

    import Ajv from 'ajv'
    import addFormats from 'ajv-formats'
    import ruleV1Schema from './rule-v1.schema.json'

    const ajv = new Ajv({ allErrors: true, strict: false })
    addFormats(ajv)

    const validateV1 = ajv.compile(ruleV1Schema)

    export type ValidationResult =
      | { ok: true }
      | { ok: false; errors: string[] }

    /**
     * Validates a routing rule against rule-v1.schema.json.
     * Returns ok:true if valid, ok:false with human-readable errors if not.
     */
    export function validateRule(rule: unknown): ValidationResult {
      const valid = validateV1(rule)
      if (valid) return { ok: true }
      const errors = (validateV1.errors ?? []).map(e => {
        const path = e.instancePath || '<root>'
        return `${path} ${e.message ?? 'invalid'} ${JSON.stringify(e.params ?? {})}`
      })
      return { ok: false, errors }
    }

    /**
     * Re-compile schema (only useful for tests that mutate the schema or for hot-reload).
     */
    export function compileSchema() {
      return ajv.compile(ruleV1Schema)
    }
    ```

    **Paso 4 — Verificar que ajv-formats esta instalado** (probablemente no — Plan 03 instala junto con json-rules-engine, pero ajv ya esta):
    ```bash
    grep -q '"ajv-formats"' package.json || npm install ajv-formats@^3
    ```
    Si Plan 03 ya lo va a instalar, se puede deferir — pero `import addFormats from 'ajv-formats'` requiere que este. Recomendacion: instalarlo aqui en Task 1 con commit separado:
    ```bash
    npm install --save ajv-formats@^3
    git add package.json package-lock.json
    git commit -m "deps(agent-lifecycle-router): ajv-formats para validacion rule-v1.schema.json"
    ```

    **Paso 5 — Configurar tsconfig para `resolveJsonModule`**:
    ```bash
    grep -q "resolveJsonModule" tsconfig.json
    ```
    Si no existe, agregarlo (probablemente ya esta en Next.js 15 default). Si tsc falla por el JSON import, agregar `"resolveJsonModule": true` a `compilerOptions`.

    **Paso 6 — Run tests** (espera GREEN):
    ```bash
    npx vitest run src/lib/agents/routing/__tests__/schema.test.ts
    # Esperado: 10 passed
    ```

    **Paso 7 — Commit atomico**:
    ```bash
    git add src/lib/agents/routing/schema/validate.ts \
            src/lib/agents/routing/__tests__/schema.test.ts \
            src/lib/agents/routing/__tests__/fixtures.ts
    git commit -m "feat(agent-lifecycle-router): Plan 02 Task 1 — Ajv validator rule-v1 + fixtures + 10 tests"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/routing/schema/validate.ts</automated>
    <automated>test -f src/lib/agents/routing/__tests__/fixtures.ts</automated>
    <automated>test -f src/lib/agents/routing/__tests__/schema.test.ts</automated>
    <automated>grep -q "import ruleV1Schema from './rule-v1.schema.json'" src/lib/agents/routing/schema/validate.ts</automated>
    <automated>grep -q "addFormats" src/lib/agents/routing/schema/validate.ts</automated>
    <automated>npx tsc --noEmit src/lib/agents/routing/schema/validate.ts src/lib/agents/routing/__tests__/fixtures.ts</automated>
    <automated>npx vitest run src/lib/agents/routing/__tests__/schema.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `validate.ts` importa y compila `rule-v1.schema.json` con Ajv + ajv-formats al import del modulo (no lazy).
    - `validateRule(...)` retorna `ValidationResult` con shape `{ ok: true }` o `{ ok: false; errors: string[] }`.
    - `fixtures.ts` exporta los 5 valores nombrados (validClassifierRule, validRouterRule, validRouterRule_humanHandoff, ruleWithPathField, ruleWithUnknownLifecycleState, ruleWithNestedAnyAll) + el helper makeRule.
    - `schema.test.ts` tiene exactamente 10 tests (uno por behavior listado).
    - Test "rejects rule with path field" PASA — confirmando Pitfall 2 mitigation.
    - `npx vitest run src/lib/agents/routing/__tests__/schema.test.ts` retorna exit code 0.
    - 2 commits atomicos: deps + Task 1 implementation.
  </acceptance_criteria>
  <done>
    - 10/10 tests verdes, validator listo para que Plans 03-06 lo importen.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Domain layer routing.ts (CRUD + recordAuditLog + listFactsCatalog) + tests</name>
  <read_first>
    - src/lib/domain/tags.ts (patron canonico domain layer)
    - src/lib/domain/types.ts (DomainContext + DomainResult)
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Architecture Patterns Pattern 5 lineas 488-517 (audit log shape) + Pattern 3 lineas 367-441 (cache + version-column hint para getMaxUpdatedAt)
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §D-16 (4 reasons enum)
    - supabase/migrations/<ts>_agent_lifecycle_router.sql (creado en Plan 01 — confirma columnas exactas de las 3 tablas)
    - src/lib/agents/routing/__tests__/fixtures.ts (creado en Task 1)
    - src/lib/agents/routing/schema/validate.ts (creado en Task 1)
  </read_first>
  <behavior>
    - Test 1: upsertRule(invalidRule) → { success: false, error contiene 'schema validation' }
    - Test 2: upsertRule(validRule) llama a supabase.from('routing_rules').upsert con el row + retorna { success: true, data: { id } }
    - Test 3: listRules(workspaceId) llama a from('routing_rules').select.eq('workspace_id', X) y retorna data[]
    - Test 4: deleteRule(ruleId, workspaceId) hace soft delete via UPDATE active=false (NO DELETE real, preserva historial)
    - Test 5: recordAuditLog con cada uno de los 4 reasons ('matched','human_handoff','no_rule_matched','fallback_legacy') hace INSERT a routing_audit_log sin lanzar error
    - Test 6: recordAuditLog con reason invalido ('foo') retorna { success: false, error contiene 'invalid reason' } ANTES del insert (validacion app-layer redundante con DB CHECK pero defense-in-depth)
    - Test 7: listFactsCatalog() retorna array con minimo 10 facts seedeados (verificable post-migration; en el test mockear supabase para retornar 10 fixtures)
    - Test 8: getMaxUpdatedAt(workspaceId) retorna el max(updated_at) de routing_rules WHERE workspace_id=X — string ISO timestamp (usado por Plan 03 cache para version-column revalidation)
    - Test 9: loadActiveRulesForWorkspace(workspaceId) retorna SOLO rules con active=true y splitea por rule_type → { classifierRules: RoutingRule[], routerRules: RoutingRule[] }
  </behavior>
  <action>
    **Paso 1 — Crear `src/lib/agents/routing/__tests__/domain.test.ts`** (RED). Mockear `createAdminClient` con vi.mock para que los tests sean unit-level sin DB real:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { validClassifierRule, validRouterRule, ruleWithPathField, makeRule } from './fixtures'

    // Mock @/lib/supabase/admin — patron usado en otros domain tests
    const mockSupabase = {
      from: vi.fn(),
    }
    vi.mock('@/lib/supabase/admin', () => ({
      createAdminClient: () => mockSupabase,
    }))

    import {
      upsertRule,
      listRules,
      deleteRule,
      recordAuditLog,
      listFactsCatalog,
      getMaxUpdatedAt,
      loadActiveRulesForWorkspace,
    } from '@/lib/domain/routing'

    const ctx = { workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490' }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    describe('upsertRule', () => {
      it('rejects invalid rule (path field — Pitfall 2)', async () => {
        const result = await upsertRule(ctx, ruleWithPathField as any)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toMatch(/schema|path|validation/i)
        }
        expect(mockSupabase.from).not.toHaveBeenCalled()  // never reaches DB
      })

      it('inserts valid rule via from(routing_rules).upsert', async () => {
        const upsertMock = vi.fn().mockResolvedValue({ data: [{ id: 'new-id' }], error: null })
        const selectMock = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }) })
        mockSupabase.from.mockReturnValue({ upsert: vi.fn().mockReturnValue({ select: selectMock }) })

        const result = await upsertRule(ctx, validClassifierRule)
        expect(result.success).toBe(true)
        expect(mockSupabase.from).toHaveBeenCalledWith('routing_rules')
      })
    })

    describe('listRules', () => {
      it('filters by workspace_id', async () => {
        const eqMock = vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [makeRule()], error: null }),
        })
        mockSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({ eq: eqMock }),
        })

        const result = await listRules(ctx)
        expect(result.success).toBe(true)
        expect(eqMock).toHaveBeenCalledWith('workspace_id', ctx.workspaceId)
      })
    })

    describe('deleteRule', () => {
      it('does soft delete (UPDATE active=false), not DELETE', async () => {
        const updateMock = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        })
        mockSupabase.from.mockReturnValue({ update: updateMock })

        const result = await deleteRule(ctx, 'rule-id-1')
        expect(result.success).toBe(true)
        expect(updateMock).toHaveBeenCalledWith(
          expect.objectContaining({ active: false }),
        )
      })
    })

    describe('recordAuditLog', () => {
      const baseEntry = {
        workspace_id: ctx.workspaceId,
        contact_id: 'contact-id',
        conversation_id: 'conv-id',
        inbound_message_id: 'msg-id',
        agent_id: 'somnio-recompra-v1',
        lifecycle_state: 'in_transit',
        fired_classifier_rule_id: 'cls-rule-id',
        fired_router_rule_id: 'rt-rule-id',
        facts_snapshot: { activeOrderStage: 'transit' },
        rule_set_version_at_decision: '2026-04-25T10:00:00-05:00',
        latency_ms: 5,
      }

      it.each(['matched', 'human_handoff', 'no_rule_matched', 'fallback_legacy'] as const)(
        'accepts reason="%s"',
        async (reason) => {
          const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
          mockSupabase.from.mockReturnValue({ insert: insertMock })

          const result = await recordAuditLog({ ...baseEntry, reason })
          expect(result.success).toBe(true)
          expect(insertMock).toHaveBeenCalledWith(
            expect.objectContaining({ reason }),
          )
        },
      )

      it('rejects invalid reason BEFORE insert (defense-in-depth vs DB CHECK)', async () => {
        const insertMock = vi.fn()
        mockSupabase.from.mockReturnValue({ insert: insertMock })

        const result = await recordAuditLog({ ...baseEntry, reason: 'foo' as any })
        expect(result.success).toBe(false)
        expect(insertMock).not.toHaveBeenCalled()
      })
    })

    describe('listFactsCatalog', () => {
      it('returns the seeded facts', async () => {
        const seedFacts = Array.from({ length: 10 }, (_, i) => ({
          name: `fact_${i}`,
          return_type: 'string',
          description: `desc ${i}`,
          examples: [],
          active: true,
        }))
        const orderMock = vi.fn().mockResolvedValue({ data: seedFacts, error: null })
        mockSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ order: orderMock }),
          }),
        })

        const result = await listFactsCatalog()
        expect(result.success).toBe(true)
        if (result.success) expect(result.data.length).toBe(10)
      })
    })

    describe('getMaxUpdatedAt', () => {
      it('returns max updated_at as ISO string', async () => {
        const singleMock = vi.fn().mockResolvedValue({ data: { updated_at: '2026-04-25T10:00:00-05:00' }, error: null })
        mockSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ single: singleMock }),
              }),
            }),
          }),
        })

        const result = await getMaxUpdatedAt(ctx)
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toBe('2026-04-25T10:00:00-05:00')
      })
    })

    describe('loadActiveRulesForWorkspace', () => {
      it('splits rules by rule_type', async () => {
        const allRules = [
          makeRule({ id: '1', rule_type: 'lifecycle_classifier', priority: 100 }),
          makeRule({ id: '2', rule_type: 'lifecycle_classifier', priority: 90 }),
          makeRule({ id: '3', rule_type: 'agent_router', priority: 100 }),
        ]
        const orderMock = vi.fn().mockResolvedValue({ data: allRules, error: null })
        mockSupabase.from.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ order: orderMock }),
            }),
          }),
        })

        const result = await loadActiveRulesForWorkspace(ctx)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.classifierRules.length).toBe(2)
          expect(result.data.routerRules.length).toBe(1)
        }
      })
    })
    ```

    **Paso 2 — Crear `src/lib/domain/routing.ts`** (GREEN). Estructura sigue patron de `src/lib/domain/tags.ts`:

    ```typescript
    // ============================================================================
    // Domain Layer — Routing (Single Source of Truth — Regla 3)
    //
    // Single owner of all I/O against routing_rules, routing_facts_catalog,
    // routing_audit_log. NO module under src/lib/agents/routing/** may import
    // createAdminClient — they MUST go through this file (or re-implement reads
    // by importing from here).
    //
    // Phase: agent-lifecycle-router (standalone)
    // Schema: src/lib/agents/routing/schema/rule-v1.schema.json
    // ============================================================================

    import { createAdminClient } from '@/lib/supabase/admin'
    import { validateRule } from '@/lib/agents/routing/schema/validate'

    // ============================================================================
    // TYPES
    // ============================================================================

    export interface DomainContext {
      workspaceId: string
      userId?: string
      source?: 'user' | 'webhook' | 'agent' | 'system'
    }

    export type DomainResult<T> = { success: true; data: T } | { success: false; error: string }

    export type LeafCondition = {
      fact: string
      operator: string
      value: unknown
    }
    export type AllCondition = { all: AnyCondition[] }
    export type AnyCondition_ = { any: AnyCondition[] }
    export type NotCondition = { not: AnyCondition }
    export type AnyCondition = AllCondition | AnyCondition_ | NotCondition | LeafCondition
    export type TopLevelCondition = AllCondition | AnyCondition_ | NotCondition

    export interface RoutingRule {
      id: string
      workspace_id: string
      schema_version: 'v1'
      rule_type: 'lifecycle_classifier' | 'agent_router'
      name: string
      priority: number
      conditions: TopLevelCondition
      event: { type: 'route'; params: { lifecycle_state: string } | { agent_id: string | null } }
      active: boolean
      created_at: string
      updated_at: string
      created_by_user_id: string | null
      created_by_agent_id: string | null
    }

    export type RoutingReason = 'matched' | 'human_handoff' | 'no_rule_matched' | 'fallback_legacy'
    const VALID_REASONS: ReadonlySet<RoutingReason> = new Set(['matched', 'human_handoff', 'no_rule_matched', 'fallback_legacy'])

    export interface RoutingAuditEntry {
      workspace_id: string
      contact_id: string
      conversation_id: string | null
      inbound_message_id: string | null
      agent_id: string | null
      reason: RoutingReason
      lifecycle_state: string
      fired_classifier_rule_id: string | null
      fired_router_rule_id: string | null
      facts_snapshot: Record<string, unknown>
      rule_set_version_at_decision: string | null
      latency_ms: number
    }

    export interface RoutingFact {
      name: string
      return_type: 'string' | 'number' | 'boolean' | 'string[]' | 'null'
      description: string
      examples: unknown[]
      active: boolean
    }

    // ============================================================================
    // RULES — CRUD
    // ============================================================================

    export async function listRules(ctx: DomainContext): Promise<DomainResult<RoutingRule[]>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('routing_rules')
        .select('*')
        .eq('workspace_id', ctx.workspaceId)
        .order('priority', { ascending: false })
      if (error) return { success: false, error: error.message }
      return { success: true, data: (data ?? []) as RoutingRule[] }
    }

    export async function getRule(ctx: DomainContext, ruleId: string): Promise<DomainResult<RoutingRule>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('routing_rules')
        .select('*')
        .eq('workspace_id', ctx.workspaceId)
        .eq('id', ruleId)
        .single()
      if (error || !data) return { success: false, error: error?.message ?? 'not_found' }
      return { success: true, data: data as RoutingRule }
    }

    /**
     * Upsert a rule — validates against rule-v1.schema.json BEFORE write.
     * Validation failure short-circuits without DB call (Regla 3 + Pitfall 2 + Pitfall 5).
     */
    export async function upsertRule(
      ctx: DomainContext,
      rule: Omit<RoutingRule, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<RoutingRule, 'id'>>,
    ): Promise<DomainResult<{ id: string }>> {
      // Defense-in-depth: validate at write time (admin form already validates client-side, but DON'T trust)
      const validation = validateRule(rule)
      if (!validation.ok) {
        return { success: false, error: `schema validation failed: ${validation.errors.join('; ')}` }
      }

      // Force workspace_id to ctx (multi-tenant safety — Regla 3)
      const payload = { ...rule, workspace_id: ctx.workspaceId, updated_at: new Date().toISOString() }

      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('routing_rules')
        .upsert(payload as any, { onConflict: 'id' })
        .select('id')
        .single()
      if (error) return { success: false, error: error.message }
      return { success: true, data: { id: (data as any).id } }
    }

    /**
     * Soft delete via UPDATE active=false. Preserves the row for audit/forensics.
     * Hard delete is intentionally not exposed (Pitfall 5 — schema migrations need historical rows).
     */
    export async function deleteRule(ctx: DomainContext, ruleId: string): Promise<DomainResult<void>> {
      const supabase = createAdminClient()
      const { error } = await supabase
        .from('routing_rules')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('workspace_id', ctx.workspaceId)
        .eq('id', ruleId)
      if (error) return { success: false, error: error.message }
      return { success: true, data: undefined }
    }

    /**
     * Returns max(updated_at) across all rules for the workspace.
     * Used by Plan 03 cache.ts for version-column revalidation (Pattern 3).
     * Returns null ISO string if no rules exist.
     */
    export async function getMaxUpdatedAt(ctx: DomainContext): Promise<DomainResult<string | null>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('routing_rules')
        .select('updated_at')
        .eq('workspace_id', ctx.workspaceId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      if (error && error.code !== 'PGRST116') return { success: false, error: error.message }
      return { success: true, data: data?.updated_at ?? null }
    }

    /**
     * Loads ACTIVE rules and splits them by rule_type. Used by route.ts (Plan 03/04).
     * Sorted by priority DESC so cache + engine see highest-priority first.
     */
    export async function loadActiveRulesForWorkspace(
      ctx: DomainContext,
    ): Promise<DomainResult<{ classifierRules: RoutingRule[]; routerRules: RoutingRule[] }>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('routing_rules')
        .select('*')
        .eq('workspace_id', ctx.workspaceId)
        .eq('active', true)
        .order('priority', { ascending: false })
      if (error) return { success: false, error: error.message }
      const rules = (data ?? []) as RoutingRule[]
      return {
        success: true,
        data: {
          classifierRules: rules.filter(r => r.rule_type === 'lifecycle_classifier'),
          routerRules: rules.filter(r => r.rule_type === 'agent_router'),
        },
      }
    }

    // ============================================================================
    // FACTS CATALOG — read-only (writes via SQL migration only)
    // ============================================================================

    export async function listFactsCatalog(): Promise<DomainResult<RoutingFact[]>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('routing_facts_catalog')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })
      if (error) return { success: false, error: error.message }
      return { success: true, data: (data ?? []) as RoutingFact[] }
    }

    // ============================================================================
    // AUDIT LOG — writes only (reads via UI in Plan 06)
    // ============================================================================

    /**
     * Insert a routing decision into routing_audit_log.
     * Validates `reason` against the 4-value enum BEFORE insert (defense-in-depth vs DB CHECK).
     * Fire-and-forget caller pattern: caller does NOT need to await; errors are logged via console.
     */
    export async function recordAuditLog(entry: RoutingAuditEntry): Promise<DomainResult<void>> {
      if (!VALID_REASONS.has(entry.reason)) {
        return { success: false, error: `invalid reason: ${entry.reason}` }
      }
      const supabase = createAdminClient()
      const { error } = await supabase
        .from('routing_audit_log')
        .insert({
          workspace_id: entry.workspace_id,
          contact_id: entry.contact_id,
          conversation_id: entry.conversation_id,
          inbound_message_id: entry.inbound_message_id,
          agent_id: entry.agent_id,
          reason: entry.reason,
          lifecycle_state: entry.lifecycle_state,
          fired_classifier_rule_id: entry.fired_classifier_rule_id,
          fired_router_rule_id: entry.fired_router_rule_id,
          facts_snapshot: entry.facts_snapshot,
          rule_set_version_at_decision: entry.rule_set_version_at_decision,
          latency_ms: entry.latency_ms,
        })
      if (error) {
        console.error('[domain.routing] recordAuditLog failed:', error.message)
        return { success: false, error: error.message }
      }
      return { success: true, data: undefined }
    }
    ```

    **Paso 3 — Run tests** (espera GREEN):
    ```bash
    npx vitest run src/lib/agents/routing/__tests__/domain.test.ts
    # Esperado: 11+ tests pasan
    ```

    **Paso 4 — Verificar Regla 3 enforcement** (no leaks de createAdminClient fuera del domain):
    ```bash
    grep -rn "createAdminClient" src/lib/agents/routing/ | grep -v "__tests__"
    # Esperado: VACIO (zero results) — el import vive solo en domain
    ```

    **Paso 5 — Commit atomico**:
    ```bash
    git add src/lib/domain/routing.ts src/lib/agents/routing/__tests__/domain.test.ts
    git commit -m "feat(agent-lifecycle-router): Plan 02 Task 2 — domain.routing CRUD + recordAuditLog + 11 tests (Regla 3)"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/domain/routing.ts</automated>
    <automated>test -f src/lib/agents/routing/__tests__/domain.test.ts</automated>
    <automated>grep -q "createAdminClient" src/lib/domain/routing.ts</automated>
    <automated>grep -q "validateRule" src/lib/domain/routing.ts</automated>
    <automated>grep -q "fallback_legacy" src/lib/domain/routing.ts</automated>
    <automated>grep -q "loadActiveRulesForWorkspace" src/lib/domain/routing.ts</automated>
    <automated>grep -q "getMaxUpdatedAt" src/lib/domain/routing.ts</automated>
    <automated>! grep -rn "createAdminClient" src/lib/agents/routing/ --include="*.ts" --exclude-dir=__tests__</automated>
    <automated>npx tsc --noEmit src/lib/domain/routing.ts</automated>
    <automated>npx vitest run src/lib/agents/routing/__tests__/domain.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/domain/routing.ts` existe con los 8 exports nombrados (listRules, getRule, upsertRule, deleteRule, recordAuditLog, listFactsCatalog, getMaxUpdatedAt, loadActiveRulesForWorkspace).
    - `upsertRule` invoca `validateRule(...)` antes del DB call (Pitfall 5 + Pitfall 2 defense).
    - `deleteRule` hace UPDATE active=false (NO `.delete()` real).
    - `recordAuditLog` valida reason contra el set de 4 valores antes del insert.
    - `loadActiveRulesForWorkspace` retorna `{ classifierRules, routerRules }` filtrados por `active=true` y ordenados por priority DESC.
    - `getMaxUpdatedAt` retorna `string | null` (PGRST116 = no rows = null, no error).
    - **Regla 3 enforcement:** `grep -rn "createAdminClient" src/lib/agents/routing/ --exclude-dir=__tests__` retorna VACIO.
    - `tsc --noEmit` exit 0.
    - `vitest run domain.test.ts` exit 0 con minimo 11 tests passing.
  </acceptance_criteria>
  <done>
    - Domain layer enforced, single source of truth, todos los tests pasando.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Domain layer extensions (B-4 fix — consolidated here, not Plan 03) + getWorkspaceRecompraEnabled (B-1 fix)</name>
  <read_first>
    - src/lib/domain/orders.ts (verificar exports actuales — agregar functions sin duplicar)
    - src/lib/domain/tags.ts (verificar `getContactTags` y `listAllTags` ya existen — agregar si no)
    - src/lib/domain/contacts.ts (verificar `getContactById` ya existe — agregar getters si no)
    - src/lib/domain/messages.ts (agregar `getLastInboundMessageAt` y `getInboundConversationsLastNDays`)
    - src/lib/agents/production/agent-config.ts (verificar columna `recompra_enabled` esta en interface — refencia para getWorkspaceRecompraEnabled)
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §code_context (Reusable Assets — confirmar workspace_agent_config existe)
  </read_first>
  <behavior>
    Cada funcion nueva/extendida tiene un test unit que mockea supabase (mismo patron que `domain.test.ts` Task 2). Funciones a implementar/verificar:

    - **orders.ts:**
      - Test 1: `getActiveOrderForContact(contactId, workspaceId)` retorna `{ id, stage_kind, created_at } | null`. Filtra por workspace_id, archived_at IS NULL, order by created_at DESC limit 1.
      - Test 2: `getLastDeliveredOrderDate(contactId, workspaceId)` retorna ISO string del updated_at del ultimo pedido en stages.kind='delivered', o null.
      - Test 3: `countOrdersInLastNDays(contactId, workspaceId, days)` retorna count integer; query usa `gte('created_at', sinceISO)` con since = NOW - days * 86400000.
      - Test 4: `isContactInRecompraPipeline(contactId, workspaceId)` retorna boolean basado en count > 0 de pedidos en stages.pipelines.name='RECOMPRA'.
    - **tags.ts:**
      - Test 5: `getContactTags(contactId, workspaceId)` retorna `string[]` (nombres de tags). Filter contact_tags JOIN tags WHERE tags.workspace_id=X AND contact_tags.contact_id=Y.
      - Test 6: `listAllTags({ workspaceId })` retorna `DomainResult<{ name: string; color: string | null }[]>`. (used by Plan 06 admin form TagPicker).
    - **messages.ts:**
      - Test 7: `getLastInboundMessageAt(contactId, workspaceId)` retorna ISO string o null.
      - Test 8: `getInboundConversationsLastNDays(workspaceId, daysBack, limit)` retorna `Array<{ conversation_id, contact_id, inbound_message_at }>` deduped by conversation_id (used by Plan 05 dry-run).
    - **workspace-agent-config.ts (NEW file — B-1 fix):**
      - Test 9: `getWorkspaceRecompraEnabled(workspaceId)` retorna boolean. Lee `workspace_agent_config.recompra_enabled` via createAdminClient, default `true` if config missing (matches webhook-processor.ts:172 fallback).
  </behavior>
  <action>
    **Paso 1 — Crear `src/lib/agents/routing/__tests__/domain-extensions.test.ts`** con los 9 tests. Mock @/lib/supabase/admin igual que domain.test.ts Task 2.

    Estructura (RED primero):

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    const mockSupabase = { from: vi.fn() }
    vi.mock('@/lib/supabase/admin', () => ({
      createAdminClient: () => mockSupabase,
    }))

    import {
      getActiveOrderForContact,
      getLastDeliveredOrderDate,
      countOrdersInLastNDays,
      isContactInRecompraPipeline,
    } from '@/lib/domain/orders'
    import { getContactTags, listAllTags } from '@/lib/domain/tags'
    import { getLastInboundMessageAt, getInboundConversationsLastNDays } from '@/lib/domain/messages'
    import { getWorkspaceRecompraEnabled } from '@/lib/domain/workspace-agent-config'

    const ws = 'a3843b3f-c337-4836-92b5-89c58bb98490'
    const contactId = 'contact-1'

    beforeEach(() => { vi.clearAllMocks() })

    describe('orders extensions (B-4)', () => {
      it('getActiveOrderForContact returns shape { id, stage_kind, created_at }', async () => {
        // mock chain: from.select.eq.eq.is.order.limit.single -> { data: { id, created_at, stages: { kind } } }
        const singleMock = vi.fn().mockResolvedValue({ data: { id: 'o1', created_at: '2026-04-25T10:00:00Z', stages: { kind: 'transit' } }, error: null })
        const limitMock = vi.fn().mockReturnValue({ single: singleMock })
        const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
        const isMock = vi.fn().mockReturnValue({ order: orderMock })
        const eq2 = vi.fn().mockReturnValue({ is: isMock })
        const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
        mockSupabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })

        const result = await getActiveOrderForContact(contactId, ws)
        expect(result).toEqual({ id: 'o1', stage_kind: 'transit', created_at: '2026-04-25T10:00:00Z' })
      })

      it.each([
        ['getLastDeliveredOrderDate', getLastDeliveredOrderDate, [contactId, ws], { data: { updated_at: '2026-04-20T12:00:00Z' }, error: null }, '2026-04-20T12:00:00Z'],
      ])('%s returns expected', async (_name, fn, args, mockResp, expected) => {
        // simplified — executor expands per actual chain shape
      })

      it('countOrdersInLastNDays returns count integer', async () => {
        const headMock = vi.fn().mockResolvedValue({ count: 3, error: null })
        const gteMock = vi.fn().mockReturnValue(headMock)
        const eq2 = vi.fn().mockReturnValue({ gte: gteMock })
        const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
        mockSupabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })
        const result = await countOrdersInLastNDays(contactId, ws, 7)
        expect(result).toBe(3)
      })

      it('isContactInRecompraPipeline returns boolean', async () => {
        // mock count > 0 -> true
      })
    })

    describe('tags extensions (B-4)', () => {
      it('getContactTags returns string[] of tag names', async () => {
        const eq2 = vi.fn().mockResolvedValue({ data: [{ tags: { name: 'vip' } }, { tags: { name: 'forzar_humano' } }], error: null })
        const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
        mockSupabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })
        const result = await getContactTags(contactId, ws)
        expect(result).toEqual(['vip', 'forzar_humano'])
      })

      it('listAllTags returns DomainResult with name+color array', async () => {
        const orderMock = vi.fn().mockResolvedValue({ data: [{ name: 'vip', color: '#ff0000' }], error: null })
        const eq1 = vi.fn().mockReturnValue({ order: orderMock })
        mockSupabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })
        const result = await listAllTags({ workspaceId: ws })
        expect(result.success).toBe(true)
        if (result.success) expect(result.data).toEqual([{ name: 'vip', color: '#ff0000' }])
      })
    })

    describe('messages extensions (B-4)', () => {
      it('getLastInboundMessageAt returns ISO timestamp or null', async () => {
        // mock chain to return { data: { created_at: '2026-04-25T10:00:00Z' } }
      })

      it('getInboundConversationsLastNDays dedupes by conversation_id', async () => {
        const limitMock = vi.fn().mockResolvedValue({
          data: [
            { conversation_id: 'c1', contact_id: 'ct1', created_at: '2026-04-25T10:00:00Z' },
            { conversation_id: 'c1', contact_id: 'ct1', created_at: '2026-04-25T09:00:00Z' }, // duplicate
            { conversation_id: 'c2', contact_id: 'ct2', created_at: '2026-04-24T10:00:00Z' },
          ],
          error: null,
        })
        const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
        const gteMock = vi.fn().mockReturnValue({ order: orderMock })
        const eq2 = vi.fn().mockReturnValue({ gte: gteMock })
        const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
        mockSupabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })
        const result = await getInboundConversationsLastNDays(ws, 7, 500)
        expect(result.length).toBe(2)
        expect(result.map(r => r.conversation_id).sort()).toEqual(['c1', 'c2'])
      })
    })

    describe('workspace-agent-config (B-1 fix)', () => {
      it('getWorkspaceRecompraEnabled returns true by default if no config', async () => {
        const singleMock = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        const eq1 = vi.fn().mockReturnValue({ single: singleMock })
        mockSupabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })
        const result = await getWorkspaceRecompraEnabled(ws)
        expect(result).toBe(true)
      })

      it('getWorkspaceRecompraEnabled returns config value when set', async () => {
        const singleMock = vi.fn().mockResolvedValue({ data: { recompra_enabled: false }, error: null })
        const eq1 = vi.fn().mockReturnValue({ single: singleMock })
        mockSupabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eq1 }) })
        const result = await getWorkspaceRecompraEnabled(ws)
        expect(result).toBe(false)
      })
    })
    ```

    **Paso 2 — Implementar/extender cada modulo del domain layer.** Sigue el patron canonico de `src/lib/domain/tags.ts` (createAdminClient, workspace_id filter por query, return DomainResult o tipos crudos).

    **a) `src/lib/domain/orders.ts`** — APPEND (no reemplazar funciones existentes):

    ```typescript
    // ============================================================================
    // agent-lifecycle-router extensions (Plan 02 Task 3 — B-4 fix)
    // ============================================================================

    export async function getActiveOrderForContact(
      contactId: string,
      workspaceId: string,
    ): Promise<{ id: string; stage_kind: string | null; created_at: string } | null> {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('orders')
        .select('id, created_at, stages!inner(kind)')
        .eq('workspace_id', workspaceId)
        .eq('contact_id', contactId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (!data) return null
      return { id: data.id, stage_kind: (data as any).stages?.kind ?? null, created_at: data.created_at }
    }

    export async function getLastDeliveredOrderDate(
      contactId: string,
      workspaceId: string,
    ): Promise<string | null> {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('orders')
        .select('updated_at, stages!inner(kind)')
        .eq('workspace_id', workspaceId)
        .eq('contact_id', contactId)
        .eq('stages.kind', 'delivered')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      return (data as any)?.updated_at ?? null
    }

    export async function countOrdersInLastNDays(
      contactId: string,
      workspaceId: string,
      days: number,
    ): Promise<number> {
      const supabase = createAdminClient()
      const since = new Date(Date.now() - days * 86_400_000).toISOString()
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('contact_id', contactId)
        .gte('created_at', since)
      return count ?? 0
    }

    export async function isContactInRecompraPipeline(
      contactId: string,
      workspaceId: string,
    ): Promise<boolean> {
      const supabase = createAdminClient()
      const { count } = await supabase
        .from('orders')
        .select('id, stages!inner(pipelines!inner(name))', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('contact_id', contactId)
        .eq('stages.pipelines.name', 'RECOMPRA')
      return (count ?? 0) > 0
    }
    ```

    Si los nombres de columnas no coinciden con el schema real, ajustar — mantener el contrato de retorno.

    **b) `src/lib/domain/tags.ts`** — APPEND:

    ```typescript
    export async function getContactTags(
      contactId: string,
      workspaceId: string,
    ): Promise<string[]> {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('contact_tags')
        .select('tags!inner(name, workspace_id)')
        .eq('contact_id', contactId)
        .eq('tags.workspace_id', workspaceId)
      return (data ?? []).map((row: any) => row.tags?.name).filter(Boolean) as string[]
    }

    export async function listAllTags(
      ctx: { workspaceId: string },
    ): Promise<DomainResult<{ name: string; color: string | null }[]>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('tags')
        .select('name, color')
        .eq('workspace_id', ctx.workspaceId)
        .order('name', { ascending: true })
      if (error) return { success: false, error: error.message }
      return { success: true, data: data ?? [] }
    }
    ```

    **c) `src/lib/domain/messages.ts`** — APPEND:

    ```typescript
    export async function getLastInboundMessageAt(
      contactId: string,
      workspaceId: string,
    ): Promise<string | null> {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('created_at')
        .eq('workspace_id', workspaceId)
        .eq('contact_id', contactId)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      return (data as any)?.created_at ?? null
    }

    export async function getInboundConversationsLastNDays(
      workspaceId: string,
      daysBack: number,
      limit: number = 500,
    ): Promise<Array<{ conversation_id: string; contact_id: string; inbound_message_at: string }>> {
      const supabase = createAdminClient()
      const since = new Date(Date.now() - daysBack * 86_400_000).toISOString()
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('conversation_id, contact_id, created_at')
        .eq('workspace_id', workspaceId)
        .eq('direction', 'inbound')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit)
      const seen = new Set<string>()
      const out: Array<{ conversation_id: string; contact_id: string; inbound_message_at: string }> = []
      for (const row of data ?? []) {
        if (!row.conversation_id || !row.contact_id) continue
        if (seen.has(row.conversation_id)) continue
        seen.add(row.conversation_id)
        out.push({
          conversation_id: row.conversation_id,
          contact_id: row.contact_id,
          inbound_message_at: row.created_at,
        })
      }
      return out
    }
    ```

    **d) `src/lib/domain/workspace-agent-config.ts`** — CREATE NEW (B-1 fix):

    ```typescript
    /**
     * agent-lifecycle-router — workspace agent config domain extension (B-1 fix).
     *
     * SOLO expone reads necesarios por el router engine. Los writes a workspace_agent_config
     * los gestiona src/lib/agents/production/agent-config.ts (modulo existente preservado).
     */
    import { createAdminClient } from '@/lib/supabase/admin'

    /**
     * Returns workspace_agent_config.recompra_enabled. Default `true` if no config row
     * exists (matches the legacy fallback in webhook-processor.ts:172 — `recompraEnabled = config?.recompra_enabled ?? true`).
     *
     * Used by:
     *   - Plan 03 facts.ts → recompraEnabled fact resolver
     *   - Plan 07 legacy parity rule (priority 900) for Somnio rollout
     */
    export async function getWorkspaceRecompraEnabled(workspaceId: string): Promise<boolean> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('workspace_agent_config')
        .select('recompra_enabled')
        .eq('workspace_id', workspaceId)
        .single()
      if (error || !data) return true  // legacy default
      return Boolean((data as any).recompra_enabled)
    }
    ```

    **Paso 3 — Run tests** (esperan GREEN tras implementacion):
    ```bash
    npx vitest run src/lib/agents/routing/__tests__/domain-extensions.test.ts
    ```

    **Paso 4 — Commit atomico:**
    ```bash
    git add src/lib/domain/orders.ts src/lib/domain/tags.ts src/lib/domain/messages.ts src/lib/domain/workspace-agent-config.ts \
            src/lib/agents/routing/__tests__/domain-extensions.test.ts
    git commit -m "feat(agent-lifecycle-router): Plan 02 Task 3 — domain extensions (B-4 + B-1 fixes) + 9 tests"
    ```
  </action>
  <verify>
    <automated>grep -q "getActiveOrderForContact\|getLastDeliveredOrderDate\|countOrdersInLastNDays\|isContactInRecompraPipeline" src/lib/domain/orders.ts</automated>
    <automated>grep -q "getContactTags\|listAllTags" src/lib/domain/tags.ts</automated>
    <automated>grep -q "getLastInboundMessageAt\|getInboundConversationsLastNDays" src/lib/domain/messages.ts</automated>
    <automated>test -f src/lib/domain/workspace-agent-config.ts</automated>
    <automated>grep -q "getWorkspaceRecompraEnabled" src/lib/domain/workspace-agent-config.ts</automated>
    <automated>test -f src/lib/agents/routing/__tests__/domain-extensions.test.ts</automated>
    <automated>npx tsc --noEmit src/lib/domain/orders.ts src/lib/domain/tags.ts src/lib/domain/messages.ts src/lib/domain/workspace-agent-config.ts</automated>
    <automated>npx vitest run src/lib/agents/routing/__tests__/domain-extensions.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - 4 funciones nuevas en `src/lib/domain/orders.ts` (additive, no edita existentes).
    - 2 funciones nuevas en `src/lib/domain/tags.ts`.
    - 2 funciones nuevas en `src/lib/domain/messages.ts`.
    - Archivo nuevo `src/lib/domain/workspace-agent-config.ts` con `getWorkspaceRecompraEnabled` exportado, default `true` en error/missing config (matches legacy `?? true`).
    - 9 tests pasan en `domain-extensions.test.ts`.
    - tsc compila sin errores en los 4 archivos modificados/creados.
    - **B-4 enforcement:** Plan 03 ya NO va a tocar estos archivos (su frontmatter `files_modified` NO los incluye); Plan 03 solo IMPORTA estas funciones.
  </acceptance_criteria>
  <done>
    - Domain layer extensions consolidadas en Plan 02. Plan 03 puede paralelizar pero no toca domain (file conflict resuelto B-4).
    - `getWorkspaceRecompraEnabled` listo para Plan 03 facts.ts + Plan 07 parity rule (B-1).
  </done>
</task>

</tasks>

<verification>
- 5 archivos creados (validate.ts, fixtures.ts, schema.test.ts, domain.test.ts, routing.ts).
- TypeScript compila sin errores en ambos modulos nuevos.
- 21+ tests vitest pasan (10 schema + 11 domain).
- Pitfall 2 mitigation verificada: rule con `path` rechazada por Ajv.
- Regla 3 enforcement verificada: grep encuentra createAdminClient SOLO en domain/routing.ts.
</verification>

<success_criteria>
- Plan 03 puede importar `loadActiveRulesForWorkspace`, `getMaxUpdatedAt`, `recordAuditLog` desde `@/lib/domain/routing`.
- Plan 06 (admin form) puede usar `upsertRule`, `listRules`, `deleteRule` via Server Actions sin tocar Supabase directo.
- Plan 03 puede importar `validateRule` desde `@/lib/agents/routing/schema/validate` para validation on-load.
- Tests fixtures reusables por Plans 03, 05, 06.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-lifecycle-router/02-SUMMARY.md` documentando:
- Funciones exportadas de domain.routing.
- Tests pasando (counts).
- Confirmacion de Regla 3 enforcement (grep result).
- Hooks para Plan 03 (que tiene que importar).
</output>
