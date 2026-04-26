---
phase: agent-lifecycle-router
plan: 03
type: execute
wave: 2                                          # B-4 fix: serializado tras Plan 02 (domain extensions consolidadas alli)
depends_on: [01, 02]                             # B-4 fix: Plan 02 owns las domain extensions; importamos
files_modified:
  - src/lib/agents/routing/operators.ts
  - src/lib/agents/routing/facts.ts
  - src/lib/agents/routing/engine.ts
  - src/lib/agents/routing/cache.ts
  - src/lib/agents/routing/route.ts
  - src/lib/agents/routing/__tests__/operators.test.ts
  - src/lib/agents/routing/__tests__/engine.test.ts
  - src/lib/agents/routing/__tests__/cache.test.ts
  - src/lib/agents/routing/__tests__/route.test.ts
  - package.json
  - package-lock.json
# B-4 fix: domain extensions (orders.ts, tags.ts, messages.ts, workspace-agent-config.ts) viven en Plan 02. Plan 03 SOLO importa.
autonomous: true
requirements_addressed: [ROUTER-REQ-02, ROUTER-REQ-03, ROUTER-REQ-04, ROUTER-REQ-09, ROUTER-REQ-10]
user_setup: []

must_haves:
  truths:
    - "Dependencia `json-rules-engine@7.3.1` y `lru-cache@11.x` instaladas en package.json (verified 2026-04-25 npm view per RESEARCH §Standard Stack)."
    - "Custom operators registrados: `daysSinceAtMost`, `daysSinceAtLeast`, `tagMatchesPattern`, `arrayContainsAny`, `arrayContainsAll`. Todos honoran timezone America/Bogota (Regla 2) — `daysSince*` usa `new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })`."
    - "Fact resolvers registrados: `activeOrderStage`, `daysSinceLastDelivery`, `daysSinceLastInteraction`, `isClient`, `hasOrderInLastNDays`, `tags`, `hasPagoAnticipadoTag`, `isInRecompraPipeline`, `lastInteractionAt`, `recompraEnabled` (10 facts dinamicos del catalog — B-1 fix: recompraEnabled lee `workspace_agent_config.recompra_enabled` via `getWorkspaceRecompraEnabled` de Plan 02). `lifecycle_state` se setea runtime en route.ts entre engines (no es resolver)."
    - "B-4 enforcement: Plan 03 SOLO IMPORTA functions de `@/lib/domain/orders|tags|contacts|messages|workspace-agent-config` (creadas/extendidas en Plan 02). NO crea ni modifica archivos en `src/lib/domain/`. NO `createAdminClient` en `src/lib/agents/routing/**` (Regla 3). Cada resolver wrappea try/catch + retorna sentinel `'__error__'` o `null` para evitar engine.run rejection (Pitfall 4)."
    - "LRU cache `lru-cache@11` con TTL 10000ms, max 100 (D-13). Version-column revalidation via `getMaxUpdatedAt(workspaceId)` antes de retornar cached rules (Pattern 3)."
    - "`routeAgent({ contactId, workspaceId })` emite los 3 outputs distintos D-16: `{ agent_id, reason: 'matched', rule_fired }` | `{ agent_id: null, reason: 'human_handoff' }` | `{ agent_id: null, reason: 'no_rule_matched' }`. Audit log fire-and-forget via `recordAuditLog`."
    - "Tests vitest pasan: FIRST-hit fires highest-priority + skips lower (Pitfall 1 — empirico verified live), `daysSinceAtMost` honors Bogota tz, fact-throw → sentinel + fallback rule fires, LRU revalidates on version-column delta, route emits 3 distinct reasons."
  artifacts:
    - path: "src/lib/agents/routing/operators.ts"
      provides: "registerOperators(engine) — custom operators timezone-aware"
      exports: ["registerOperators"]
    - path: "src/lib/agents/routing/facts.ts"
      provides: "registerFacts(engine, ctx) — 9 facts dinamicos via domain layer"
      exports: ["registerFacts"]
    - path: "src/lib/agents/routing/engine.ts"
      provides: "buildEngine({ contactId, workspaceId, rules, runtimeFacts? }) — Engine factory per-request"
      exports: ["buildEngine"]
    - path: "src/lib/agents/routing/cache.ts"
      provides: "getRulesForWorkspace(workspaceId) — LRU 10s + version revalidation. invalidateWorkspace(workspaceId) — invalidacion explicita post-edit"
      exports: ["getRulesForWorkspace", "invalidateWorkspace"]
    - path: "src/lib/agents/routing/route.ts"
      provides: "routeAgent({contactId, workspaceId}) — Public API. 2-engine pipeline (classifier → router) + audit log + 3 outputs D-16"
      exports: ["routeAgent", "RouteDecision"]
  key_links:
    - from: "src/lib/agents/routing/route.ts"
      to: "src/lib/agents/routing/cache.ts (rules) + src/lib/domain/routing.ts (recordAuditLog) + src/lib/agents/registry.ts (validate agent_id)"
      via: "import + invocation"
      pattern: "getRulesForWorkspace|recordAuditLog|agentRegistry"
    - from: "src/lib/agents/routing/facts.ts"
      to: "src/lib/domain/orders|tags|contacts|pipelines (NUNCA createAdminClient directo)"
      via: "import desde @/lib/domain/* + try/catch sentinel"
      pattern: "from '@/lib/domain"
    - from: "src/lib/agents/routing/engine.ts"
      to: "src/lib/agents/routing/operators.ts + facts.ts"
      via: "registerOperators + registerFacts cada `new Engine()`"
      pattern: "registerOperators\\(engine\\)|registerFacts\\(engine"
---

<objective>
Wave 1 — Engine core (json-rules-engine wiring) + LRU cache + custom operators + fact resolvers + public API `routeAgent`. Esta es la cabeza del router: el archivo `route.ts` que el webhook-processor (Plan 04) invocara cuando el feature flag este ON.

Purpose: (1) Instalar `json-rules-engine@7.3.1` + `lru-cache@11` (D-02 + D-13). (2) Registrar 5 custom operators con timezone Bogota awareness (Regla 2). (3) Registrar 9 fact resolvers que IMPORTAN desde domain layer (Regla 3). (4) Implementar el cache LRU con version-column revalidation (Pattern 3). (5) Implementar `routeAgent` con la pipeline 2-engine que emite los 3 outputs D-16. (6) Tests TDD primero.

Output: 5 archivos de codigo + 4 archivos de test + package.json/lock actualizados. TypeScript compila, tests pasan.

**CRITICAL — Pitfall 7 (RESEARCH §Pitfall 7):** Una `Engine` por request. NO singleton de Engine en module top-level. Cache solo las definiciones de rules; `new Engine()` cada vez en `routeAgent`.

**CRITICAL — Pitfall 4 (RESEARCH §Pitfall 4):** Cada fact resolver wrapea su llamada a domain en try/catch + retorna sentinel. Engine.run nunca debe rejectar por un DB error transitorio.

**CRITICAL — Pitfall 1:** El UNIQUE constraint en DB (Plan 01) protege contra writes con same priority. PERO al runtime tambien — verificar que el cache loader NO inserta dos rules con same priority en `engine.addRule` consecutivos. Si llegan, log warning + skip second.

**CRITICAL — Regla 3:** Verificar via grep al final del Plan 03: `grep -rn "createAdminClient" src/lib/agents/routing/ --exclude-dir=__tests__` debe retornar VACIO. Todos los reads de DB deben ir via `@/lib/domain/*`.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-lifecycle-router/CONTEXT.md  # D-02 stack, D-04 tags, D-13 cache 10s LRU, D-16 3 outputs
@.planning/standalone/agent-lifecycle-router/RESEARCH.md  # §Standard Stack lineas 74-117 (versions exactas), §Architecture Patterns Patterns 1-3 lineas 220-441 (engine + facts + cache code), §Pitfalls 1, 3, 4, 7 (mitigation patterns), §Code Examples lineas 681-790 (operators + engine + facts code verbatim)
@CLAUDE.md  # Regla 2 (timezone Bogota en daysSince), Regla 3 (NO createAdminClient en agents/routing)
@src/lib/agents/routing/schema/validate.ts  # creado en Plan 02 — usado por cache loader para on-load validation (Pitfall 5)
@src/lib/domain/routing.ts  # creado en Plan 02 — exports: loadActiveRulesForWorkspace, getMaxUpdatedAt, recordAuditLog
@src/lib/domain/orders.ts  # source para activeOrderStage / daysSinceLastDelivery / hasOrderInLastNDays
@src/lib/domain/tags.ts  # source para fact 'tags'
@src/lib/domain/contacts.ts  # source para isClient
@src/lib/agents/registry.ts  # agentRegistry — validate agent_id post-route
@src/lib/agents/routing/__tests__/fixtures.ts  # creado en Plan 02

<interfaces>
<!-- json-rules-engine v7.3.1 — interfaces principales (verified types/index.d.ts) -->
import { Engine, EngineOptions, RuleProperties, Almanac } from 'json-rules-engine'

interface EngineOptions {
  allowUndefinedFacts?: boolean       // we use true (missing fact → undefined, not throw)
  allowUndefinedConditions?: boolean
  replaceFactsInEventParams?: boolean
}

// Custom operator API
engine.addOperator(name: string, callback: (factValue, jsonValue) => boolean, factValueValidator?: (factValue) => boolean)

// Fact resolver API
engine.addFact(name: string, value: any | ((params, almanac) => Promise<any>))

// Rule API (RuleProperties)
{ conditions, event: { type, params }, priority?, onSuccess?, onFailure?, name? }

// Engine.run + stop
const result = await engine.run(runtimeFacts?)  // returns { events, results, ... }
engine.stop()  // halts NEXT priority group (does NOT halt parallel same-priority — Pitfall 1)

<!-- lru-cache@11 — interfaces principales -->
import { LRUCache } from 'lru-cache'
const cache = new LRUCache<string, T>({
  max: 100,                  // D-13: max 100 workspaces per lambda
  ttl: 10_000,               // D-13: 10s TTL
  updateAgeOnGet: false,
})
cache.get(key) | cache.set(key, value) | cache.delete(key) | cache.clear()

<!-- Domain layer functions el fact resolver puede importar (verified existing) -->
import { getMaxUpdatedAt, loadActiveRulesForWorkspace, recordAuditLog } from '@/lib/domain/routing'
// Plus existing reads:
// src/lib/domain/orders.ts — getActiveOrderForContact?, getLastDeliveredOrderDate?
//   NOTE: estas funciones especificas NO existen aun. Los facts las requieren.
//   Plan 03 Task 2 las CREA en domain/orders.ts (extension del archivo existente, NO archivo nuevo).
// src/lib/domain/contacts.ts — getContactById (existe)
// src/lib/domain/tags.ts — getContactTags? (verificar; si no existe, agregar)

<!-- agentRegistry — validate agent_id post-route -->
import { agentRegistry } from '@/lib/agents/registry'
agentRegistry.has(agentId: string): boolean
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Install deps + custom operators (timezone-aware) + tests</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Standard Stack (lineas 74-117 versions exactas) + §Code Examples lineas 720-790 (operators code verbatim)
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §Regla 2 reference (timezone Bogota)
    - CLAUDE.md (Regla 2 textual)
  </read_first>
  <behavior>
    Custom operators registrados: 5 operators.
    - Test 1: `daysSinceAtMost(factValue: '2026-04-22T10:00:00-05:00', jsonValue: 5)` con NOW = 2026-04-25 → true (3 dias <= 5)
    - Test 2: `daysSinceAtMost(factValue: '2026-04-15T10:00:00-05:00', jsonValue: 5)` con NOW = 2026-04-25 → false (10 dias > 5)
    - Test 3: `daysSinceAtMost(null, 5)` → false (sin fecha)
    - Test 4: `daysSinceAtMost('not a date', 5)` → false (parse failure handled)
    - Test 5: `daysSinceAtLeast('2026-04-15T10:00:00-05:00', 5)` con NOW = 2026-04-25 → true (10 >= 5)
    - Test 6: `tagMatchesPattern(['vip','forzar_humano'], '^forzar_')` → true
    - Test 7: `tagMatchesPattern(['vip'], '^forzar_')` → false
    - Test 8: `arrayContainsAny(['vip','pago_anticipado'], ['forzar_humano','pago_anticipado'])` → true
    - Test 9: `arrayContainsAll(['vip','pago_anticipado','foo'], ['vip','pago_anticipado'])` → true
    - Test 10: `arrayContainsAll(['vip'], ['vip','pago_anticipado'])` → false
    - Test 11: timezone Bogota — un timestamp UTC 04:00 (= Bogota 23:00 dia anterior) cuenta como 1 dia mas que en UTC math
  </behavior>
  <action>
    **Paso 1 — Instalar deps**:
    ```bash
    npm install --save json-rules-engine@7.3.1 lru-cache@^11
    ```

    Confirmar versiones instaladas:
    ```bash
    grep -A1 '"json-rules-engine"' package.json
    grep -A1 '"lru-cache"' package.json
    ```

    Commit:
    ```bash
    git add package.json package-lock.json
    git commit -m "deps(agent-lifecycle-router): json-rules-engine@7.3.1 + lru-cache@11 (D-02 + D-13)"
    ```

    **Paso 2 — Crear `src/lib/agents/routing/__tests__/operators.test.ts`** (RED):

    ```typescript
    import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
    import { Engine } from 'json-rules-engine'
    import { registerOperators } from '../operators'

    describe('custom operators (Regla 2 — Bogota timezone)', () => {
      let engine: Engine
      let getOperator: (name: string) => any

      beforeEach(() => {
        engine = new Engine([], { allowUndefinedFacts: true })
        registerOperators(engine)
        // Access internal operatorMap — json-rules-engine v7 exposes it as engine.operators
        getOperator = (name: string) => (engine as any).operators.get(name)
        // Freeze "now" to 2026-04-25T15:00:00 America/Bogota
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-25T20:00:00Z'))  // = 2026-04-25 15:00 Bogota (UTC-5)
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('daysSinceAtMost: 3 days ago, max 5 → true', () => {
        const op = getOperator('daysSinceAtMost')
        expect(op.evaluator('2026-04-22T15:00:00-05:00', 5)).toBe(true)
      })

      it('daysSinceAtMost: 10 days ago, max 5 → false', () => {
        const op = getOperator('daysSinceAtMost')
        expect(op.evaluator('2026-04-15T15:00:00-05:00', 5)).toBe(false)
      })

      it('daysSinceAtMost: null fact → false', () => {
        const op = getOperator('daysSinceAtMost')
        expect(op.evaluator(null, 5)).toBe(false)
      })

      it('daysSinceAtMost: invalid date string → false', () => {
        const op = getOperator('daysSinceAtMost')
        expect(op.evaluator('not a date', 5)).toBe(false)
      })

      it('daysSinceAtLeast: 10 days ago, min 5 → true', () => {
        const op = getOperator('daysSinceAtLeast')
        expect(op.evaluator('2026-04-15T15:00:00-05:00', 5)).toBe(true)
      })

      it('tagMatchesPattern: regex matches → true', () => {
        const op = getOperator('tagMatchesPattern')
        expect(op.evaluator(['vip', 'forzar_humano'], '^forzar_')).toBe(true)
      })

      it('tagMatchesPattern: regex no match → false', () => {
        const op = getOperator('tagMatchesPattern')
        expect(op.evaluator(['vip'], '^forzar_')).toBe(false)
      })

      it('arrayContainsAny: at least one common element → true', () => {
        const op = getOperator('arrayContainsAny')
        expect(op.evaluator(['vip', 'pago_anticipado'], ['forzar_humano', 'pago_anticipado'])).toBe(true)
      })

      it('arrayContainsAll: all required present → true', () => {
        const op = getOperator('arrayContainsAll')
        expect(op.evaluator(['vip', 'pago_anticipado', 'foo'], ['vip', 'pago_anticipado'])).toBe(true)
      })

      it('arrayContainsAll: missing required → false', () => {
        const op = getOperator('arrayContainsAll')
        expect(op.evaluator(['vip'], ['vip', 'pago_anticipado'])).toBe(false)
      })

      it('daysSinceAtMost: timezone Bogota — UTC 04:00 same day counts as previous Bogota day', () => {
        const op = getOperator('daysSinceAtMost')
        // 2026-04-24T04:00:00Z = 2026-04-23T23:00 Bogota (yesterday in Bogota)
        // From 2026-04-25 15:00 Bogota = 2 days
        expect(op.evaluator('2026-04-24T04:00:00Z', 1)).toBe(false)  // 2 days, max 1 → fail
        expect(op.evaluator('2026-04-24T04:00:00Z', 2)).toBe(true)
      })
    })
    ```

    **Paso 3 — Crear `src/lib/agents/routing/operators.ts`** (GREEN — verbatim de RESEARCH §Code Examples lineas 720-790):

    ```typescript
    /**
     * Custom operators for json-rules-engine.
     *
     * All temporal operators honor timezone America/Bogota (Regla 2).
     * Pattern source: RESEARCH.md §Code Examples lines 720-790 (verified live).
     *
     * Registered operators:
     *   - daysSinceAtMost(factValue: ISO string, jsonValue: number) → boolean
     *   - daysSinceAtLeast(factValue: ISO string, jsonValue: number) → boolean
     *   - tagMatchesPattern(factValue: string[], jsonValue: regex source) → boolean
     *   - arrayContainsAny(factValue: string[], jsonValue: string[]) → boolean
     *   - arrayContainsAll(factValue: string[], jsonValue: string[]) → boolean
     */

    import type { Engine } from 'json-rules-engine'

    const BOGOTA = 'America/Bogota'

    /**
     * Returns the current Date interpreted in Bogota timezone.
     * Required because raw `new Date()` is UTC and silent miscount happens across midnight Bogota.
     */
    function nowInBogota(): Date {
      return new Date(new Date().toLocaleString('en-US', { timeZone: BOGOTA }))
    }

    export function registerOperators(engine: Engine): void {
      // daysSinceAtMost — true if the timestamp is at most jsonValue days ago (Bogota tz)
      engine.addOperator(
        'daysSinceAtMost',
        (factValue: string | null, jsonValue: number) => {
          if (factValue === null || factValue === undefined) return false
          if (typeof factValue !== 'string') return false
          const ts = new Date(factValue)
          if (Number.isNaN(ts.getTime())) return false
          const diffDays = Math.floor((nowInBogota().getTime() - ts.getTime()) / 86_400_000)
          return diffDays <= jsonValue
        },
      )

      // daysSinceAtLeast — true if the timestamp is at least jsonValue days ago (Bogota tz)
      engine.addOperator(
        'daysSinceAtLeast',
        (factValue: string | null, jsonValue: number) => {
          if (factValue === null || factValue === undefined) return false
          if (typeof factValue !== 'string') return false
          const ts = new Date(factValue)
          if (Number.isNaN(ts.getTime())) return false
          const diffDays = Math.floor((nowInBogota().getTime() - ts.getTime()) / 86_400_000)
          return diffDays >= jsonValue
        },
      )

      // tagMatchesPattern — fact is string[], jsonValue is regex source string
      engine.addOperator(
        'tagMatchesPattern',
        (factValue: string[], jsonValue: string) => {
          if (!Array.isArray(factValue)) return false
          let re: RegExp
          try {
            re = new RegExp(jsonValue)
          } catch {
            return false  // invalid regex source — treat as no match (admin form should validate)
          }
          return factValue.some(t => typeof t === 'string' && re.test(t))
        },
      )

      // arrayContainsAny — OR-semantics
      engine.addOperator(
        'arrayContainsAny',
        (factValue: string[], jsonValue: string[]) => {
          if (!Array.isArray(factValue) || !Array.isArray(jsonValue)) return false
          return factValue.some(v => jsonValue.includes(v))
        },
      )

      // arrayContainsAll — AND-semantics
      engine.addOperator(
        'arrayContainsAll',
        (factValue: string[], jsonValue: string[]) => {
          if (!Array.isArray(factValue) || !Array.isArray(jsonValue)) return false
          return jsonValue.every(v => factValue.includes(v))
        },
      )
    }
    ```

    **Paso 4 — Run tests**:
    ```bash
    npx vitest run src/lib/agents/routing/__tests__/operators.test.ts
    # Esperado: 11 passed
    ```

    **Paso 5 — Commit**:
    ```bash
    git add src/lib/agents/routing/operators.ts src/lib/agents/routing/__tests__/operators.test.ts
    git commit -m "feat(agent-lifecycle-router): Plan 03 Task 1 — 5 custom operators (Regla 2 Bogota tz) + 11 tests"
    ```
  </action>
  <verify>
    <automated>grep -q '"json-rules-engine": "7.3.1"' package.json</automated>
    <automated>grep -q '"lru-cache": "\^11' package.json</automated>
    <automated>test -f src/lib/agents/routing/operators.ts</automated>
    <automated>grep -q "America/Bogota" src/lib/agents/routing/operators.ts</automated>
    <automated>grep -c "engine.addOperator" src/lib/agents/routing/operators.ts | grep -q "5"</automated>
    <automated>npx tsc --noEmit src/lib/agents/routing/operators.ts</automated>
    <automated>npx vitest run src/lib/agents/routing/__tests__/operators.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` contiene `"json-rules-engine": "7.3.1"` y `"lru-cache": "^11.x"`.
    - `operators.ts` exporta `registerOperators(engine)` que invoca `engine.addOperator` exactamente 5 veces (5 operators custom).
    - Todos los temporales (`daysSince*`) usan `new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })` — string `'America/Bogota'` aparece en el archivo.
    - Test "timezone Bogota" pasa (verifica que UTC 04:00 cuenta como 2 dias atras desde Bogota).
    - 11 tests pasan.
    - 2 commits atomicos: deps + Task 1.
  </acceptance_criteria>
  <done>
    - Operators listos para que engine.ts los registre antes de cada `engine.run()`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fact resolvers + engine factory + cache (LRU 10s + version revalidation)</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Architecture Patterns Pattern 2 lineas 315-365 (fact resolvers via domain) + Pattern 3 lineas 367-441 (LRU + version-column) + §Pitfalls 4 (try/catch sentinel) + §Pitfalls 7 (per-request Engine)
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §D-13 (cache 10s lru-cache@11)
    - src/lib/domain/orders.ts (verificar exports — getActiveOrderForContact existe? — agregar si no)
    - src/lib/domain/contacts.ts (getContactById existe? — verificar)
    - src/lib/domain/tags.ts (verificar lectura de tags por contact_id)
    - src/lib/domain/routing.ts (creado Plan 02 — exports loadActiveRulesForWorkspace, getMaxUpdatedAt)
    - src/lib/agents/routing/operators.ts (creado Task 1)
  </read_first>
  <behavior>
    - Test 1: `buildEngine({ contactId, workspaceId, rules: [], runtimeFacts: { lifecycle_state: 'in_transit' } })` retorna Engine con 5 operators registrados + 9+1 facts (9 dinamicos + 1 runtime).
    - Test 2: Fact resolver `activeOrderStage` invoca `getActiveOrderForContact(contactId, workspaceId)` y retorna `order?.stage_kind ?? null`.
    - Test 3: Fact resolver `tags` invoca `getContactTags(contactId, workspaceId)` y retorna `string[]`.
    - Test 4: Fact resolver throw → retorna `'__error__'` sentinel, no rejecta engine.run (Pitfall 4).
    - Test 5: `getRulesForWorkspace(ws)` primer call hace DB read via `loadActiveRulesForWorkspace`. Segundo call dentro de 10s → no DB read, returns cached.
    - Test 6: `getRulesForWorkspace(ws)` despues de TTL expira → DB read again.
    - Test 7: `getMaxUpdatedAt` retorna delta nuevo → cache invalida, DB read again. (Version-column revalidation)
    - Test 8: `invalidateWorkspace(ws)` borra cache de ese workspace.
    - Test 9: cache tiene `max: 100` workspaces (verificable creando 101 entries y confirmar que el primero se evicto).
    - Test 10: cache loader llama `validateRule` por cada row al cargar; rule invalida → log warning + skip (NO crash).
    - Test 11: cache loader detecta priority collision (2 rules same workspace+rule_type+priority active=true) → log warning + keep solo una (defense post-Pitfall 1, ademas del UNIQUE en DB).
  </behavior>
  <action>
    **Paso 1 — Verificar/agregar funciones domain necesarias**. Run grep para confirmar:
    ```bash
    grep -n "getActiveOrderForContact\|getLastDeliveredOrderDate\|getContactTags\|getOrdersInLastNDays\|getLastInboundMessageAt" src/lib/domain/*.ts
    ```

    Para CADA funcion que NO exista, agregar al archivo del domain correspondiente. Templates (todas son LECTURAS, mantienen workspace_id filter):

    ```typescript
    // src/lib/domain/orders.ts (agregar al final del archivo)
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
      return data?.updated_at ?? null
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
    ```

    Para tags (`src/lib/domain/tags.ts`):
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
    ```

    Para isInRecompraPipeline (`src/lib/domain/orders.ts` o pipelines.ts):
    ```typescript
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

    Para lastInteractionAt (`src/lib/domain/messages.ts`):
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
      return data?.created_at ?? null
    }
    ```

    Si alguna de estas no compila por nombres de columna distintos, ajustar a la realidad del schema PERO mantener el contrato de retorno.

    Commit:
    ```bash
    git add src/lib/domain/orders.ts src/lib/domain/tags.ts src/lib/domain/messages.ts
    git commit -m "feat(agent-lifecycle-router): Plan 03 Task 2a — domain reads para fact resolvers (orders, tags, messages)"
    ```

    **Paso 2 — Crear `src/lib/agents/routing/facts.ts`** (GREEN). Cada fact resolver wrappea en try/catch + retorna sentinel (Pitfall 4):

    ```typescript
    /**
     * Fact resolvers — registered per-Engine instance per-request (Pitfall 7).
     *
     * Each resolver:
     *   1. Imports its data via @/lib/domain/* (Regla 3 — NO createAdminClient here).
     *   2. Wraps the call in try/catch and returns a sentinel on error (Pitfall 4 —
     *      DB hiccups must not reject engine.run).
     *
     * Resolved facts (9 dynamic):
     *   - activeOrderStage    → string | null
     *   - daysSinceLastDelivery → number | null
     *   - daysSinceLastInteraction → number | null
     *   - isClient            → boolean
     *   - hasOrderInLastNDays → number  (counts active orders in window — params.days)
     *   - tags                → string[]
     *   - hasPagoAnticipadoTag → boolean
     *   - isInRecompraPipeline → boolean
     *   - lastInteractionAt   → string | null
     *
     * Note: lifecycle_state is NOT registered here — it is set runtime by route.ts
     *       between Layer 1 and Layer 2 engines.
     */

    import type { Engine } from 'json-rules-engine'
    import {
      getActiveOrderForContact,
      getLastDeliveredOrderDate,
      countOrdersInLastNDays,
      isContactInRecompraPipeline,
    } from '@/lib/domain/orders'
    import { getContactTags } from '@/lib/domain/tags'
    import { getContactById } from '@/lib/domain/contacts'
    import { getLastInboundMessageAt } from '@/lib/domain/messages'
    import { getWorkspaceRecompraEnabled } from '@/lib/domain/workspace-agent-config'  // B-1 fix

    const BOGOTA = 'America/Bogota'
    const ERROR_SENTINEL = '__error__'

    function nowMsBogota(): number {
      return new Date(new Date().toLocaleString('en-US', { timeZone: BOGOTA })).getTime()
    }

    export interface FactContext {
      contactId: string
      workspaceId: string
    }

    export function registerFacts(engine: Engine, ctx: FactContext): void {
      engine.addFact('activeOrderStage', async () => {
        try {
          const order = await getActiveOrderForContact(ctx.contactId, ctx.workspaceId)
          return order?.stage_kind ?? null
        } catch (err) {
          console.error('[routing.facts] activeOrderStage failed:', err)
          return ERROR_SENTINEL
        }
      })

      engine.addFact('daysSinceLastDelivery', async () => {
        try {
          const ts = await getLastDeliveredOrderDate(ctx.contactId, ctx.workspaceId)
          if (!ts) return null
          const ms = new Date(ts).getTime()
          if (Number.isNaN(ms)) return null
          return Math.floor((nowMsBogota() - ms) / 86_400_000)
        } catch (err) {
          console.error('[routing.facts] daysSinceLastDelivery failed:', err)
          return null
        }
      })

      engine.addFact('lastInteractionAt', async () => {
        try {
          return await getLastInboundMessageAt(ctx.contactId, ctx.workspaceId)
        } catch (err) {
          console.error('[routing.facts] lastInteractionAt failed:', err)
          return null
        }
      })

      engine.addFact('daysSinceLastInteraction', async (_params, almanac) => {
        try {
          const ts = await almanac.factValue<string | null>('lastInteractionAt')
          if (!ts) return null
          const ms = new Date(ts).getTime()
          if (Number.isNaN(ms)) return null
          return Math.floor((nowMsBogota() - ms) / 86_400_000)
        } catch (err) {
          console.error('[routing.facts] daysSinceLastInteraction failed:', err)
          return null
        }
      })

      engine.addFact('isClient', async () => {
        try {
          const contact = await getContactById(ctx.contactId, ctx.workspaceId)
          return Boolean((contact as any)?.is_client)
        } catch (err) {
          console.error('[routing.facts] isClient failed:', err)
          return false
        }
      })

      engine.addFact('hasOrderInLastNDays', async (params: any) => {
        try {
          const days = typeof params?.days === 'number' && params.days > 0 ? params.days : 7
          return await countOrdersInLastNDays(ctx.contactId, ctx.workspaceId, days)
        } catch (err) {
          console.error('[routing.facts] hasOrderInLastNDays failed:', err)
          return 0
        }
      })

      engine.addFact('tags', async () => {
        try {
          return await getContactTags(ctx.contactId, ctx.workspaceId)
        } catch (err) {
          console.error('[routing.facts] tags failed:', err)
          return []
        }
      })

      engine.addFact('hasPagoAnticipadoTag', async (_params, almanac) => {
        try {
          const tags = await almanac.factValue<string[]>('tags')
          return Array.isArray(tags) && tags.includes('pago_anticipado')
        } catch {
          return false
        }
      })

      engine.addFact('isInRecompraPipeline', async () => {
        try {
          return await isContactInRecompraPipeline(ctx.contactId, ctx.workspaceId)
        } catch (err) {
          console.error('[routing.facts] isInRecompraPipeline failed:', err)
          return false
        }
      })

      // B-1 fix: legacy parity — replicates webhook-processor.ts:172 `recompraEnabled = config?.recompra_enabled ?? true`.
      // Used by Plan 07 priority-900 rule that mirrors `is_client && !recompra_enabled` legacy branch.
      engine.addFact('recompraEnabled', async () => {
        try {
          return await getWorkspaceRecompraEnabled(ctx.workspaceId)
        } catch (err) {
          console.error('[routing.facts] recompraEnabled failed:', err)
          return true  // default true preserves legacy behavior on transient DB errors
        }
      })
    }
    ```

    **Paso 3 — Crear `src/lib/agents/routing/engine.ts`** (Engine factory):

    ```typescript
    /**
     * Engine factory — one Engine per request per layer (Pitfall 7).
     * Cache stores the rule definitions; this builds a fresh Engine each call.
     */

    import { Engine } from 'json-rules-engine'
    import type { RuleProperties } from 'json-rules-engine'
    import { registerOperators } from './operators'
    import { registerFacts } from './facts'

    export interface BuildEngineInput {
      contactId: string
      workspaceId: string
      rules: RuleProperties[]
      runtimeFacts?: Record<string, unknown>
    }

    export function buildEngine(input: BuildEngineInput): Engine {
      const engine = new Engine([], {
        allowUndefinedFacts: true,
        allowUndefinedConditions: false,
        replaceFactsInEventParams: false,
      })
      registerOperators(engine)
      registerFacts(engine, { contactId: input.contactId, workspaceId: input.workspaceId })
      for (const [factId, value] of Object.entries(input.runtimeFacts ?? {})) {
        engine.addFact(factId, value as any)
      }
      for (const rule of input.rules) engine.addRule(rule)
      return engine
    }
    ```

    **Paso 4 — Crear `src/lib/agents/routing/cache.ts`** (LRU + version-column revalidation per Pattern 3):

    ```typescript
    /**
     * Per-instance LRU cache for compiled rule definitions.
     *
     * D-13: 10s TTL, max 100 workspaces.
     * Pattern 3 (RESEARCH §Architecture Patterns): version-column revalidation via
     * getMaxUpdatedAt — on hit, cheap MAX(updated_at) check before serving cached rules.
     *
     * IMPORTANT: this cache stores rule DEFINITIONS, not Engine instances (Pitfall 7).
     * route.ts constructs `new Engine()` per request from cached definitions.
     */

    import { LRUCache } from 'lru-cache'
    import type { RuleProperties } from 'json-rules-engine'
    import { loadActiveRulesForWorkspace, getMaxUpdatedAt, type RoutingRule } from '@/lib/domain/routing'
    import { validateRule } from './schema/validate'

    interface CompiledRuleSet {
      classifierRules: CompiledRule[]
      routerRules: CompiledRule[]
      maxUpdatedAt: string | null
      loadedAt: number
    }

    export interface CompiledRule {
      id: string
      rule_type: 'lifecycle_classifier' | 'agent_router'
      compiled: RuleProperties
    }

    const cache = new LRUCache<string, CompiledRuleSet>({
      max: 100,
      ttl: 10_000,  // D-13: 10 seconds
      updateAgeOnGet: false,
    })

    /**
     * Returns active rules for the workspace, using LRU + version-column revalidation.
     *
     * Cost on cache HIT (still within TTL): 1 cheap SELECT for getMaxUpdatedAt.
     * Cost on cache MISS or version delta: full reload via loadActiveRulesForWorkspace.
     */
    export async function getRulesForWorkspace(workspaceId: string): Promise<CompiledRuleSet> {
      const cached = cache.get(workspaceId)
      if (cached) {
        // Soft revalidation: cheap MAX(updated_at) check
        const result = await getMaxUpdatedAt({ workspaceId })
        const currentMax = result.success ? result.data : null
        if (currentMax === cached.maxUpdatedAt) {
          return cached  // fresh
        }
        // Else fall through to reload
      }
      return reloadRulesForWorkspace(workspaceId)
    }

    async function reloadRulesForWorkspace(workspaceId: string): Promise<CompiledRuleSet> {
      const result = await loadActiveRulesForWorkspace({ workspaceId })
      if (!result.success) {
        // On DB error, return empty rules (route.ts emits no_rule_matched + fallback)
        return { classifierRules: [], routerRules: [], maxUpdatedAt: null, loadedAt: Date.now() }
      }

      const compileSet = (rules: RoutingRule[]): CompiledRule[] => {
        const out: CompiledRule[] = []
        const seenPriorities = new Set<string>()
        for (const r of rules) {
          // On-load schema validation (Pitfall 5)
          const v = validateRule(r)
          if (!v.ok) {
            console.warn(`[routing.cache] skipping invalid rule ${r.id}: ${v.errors.join('; ')}`)
            continue
          }
          // Defense vs Pitfall 1 — even though DB has UNIQUE INDEX, runtime collision check
          const key = `${r.rule_type}:${r.priority}`
          if (seenPriorities.has(key)) {
            console.warn(`[routing.cache] priority collision for ${r.workspace_id}/${key} — skipping rule ${r.id}`)
            continue
          }
          seenPriorities.add(key)
          out.push({
            id: r.id,
            rule_type: r.rule_type,
            compiled: {
              conditions: r.conditions as any,
              event: r.event as any,
              priority: r.priority,
              name: r.name,
            },
          })
        }
        return out
      }

      const classifierRules = compileSet(result.data.classifierRules)
      const routerRules = compileSet(result.data.routerRules)

      // Compute max(updated_at) across all loaded rules (sorted DESC in domain)
      const allRows = [...result.data.classifierRules, ...result.data.routerRules]
      const maxUpdatedAt = allRows.length > 0
        ? allRows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), allRows[0].updated_at)
        : null

      const set: CompiledRuleSet = { classifierRules, routerRules, maxUpdatedAt, loadedAt: Date.now() }
      cache.set(workspaceId, set)
      return set
    }

    export function invalidateWorkspace(workspaceId: string): void {
      cache.delete(workspaceId)
    }

    /**
     * For tests only.
     */
    export function _clearAllCache(): void {
      cache.clear()
    }
    ```

    **Paso 5 — Crear tests `src/lib/agents/routing/__tests__/engine.test.ts` y `cache.test.ts`** (W-4 fix: scaffolds concretos, sin invencion del executor).

    Crear `src/lib/agents/routing/__tests__/engine.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { Engine } from 'json-rules-engine'

    // Mock domain — fact resolvers consultan estos
    vi.mock('@/lib/domain/orders', () => ({
      getActiveOrderForContact: vi.fn(),
      getLastDeliveredOrderDate: vi.fn(),
      countOrdersInLastNDays: vi.fn(),
      isContactInRecompraPipeline: vi.fn(),
    }))
    vi.mock('@/lib/domain/tags', () => ({ getContactTags: vi.fn() }))
    vi.mock('@/lib/domain/contacts', () => ({ getContactById: vi.fn() }))
    vi.mock('@/lib/domain/messages', () => ({ getLastInboundMessageAt: vi.fn() }))
    vi.mock('@/lib/domain/workspace-agent-config', () => ({ getWorkspaceRecompraEnabled: vi.fn() }))

    import * as orders from '@/lib/domain/orders'
    import * as tagsDomain from '@/lib/domain/tags'
    import * as wsConfig from '@/lib/domain/workspace-agent-config'
    import { buildEngine } from '../engine'

    const ctx = { contactId: 'ct1', workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490', rules: [] as any[] }

    beforeEach(() => { vi.clearAllMocks() })

    describe('buildEngine — basic factory', () => {
      it('returns Engine with 5 operators registered + 9 dynamic facts (+ runtime if provided)', () => {
        ;(orders.getActiveOrderForContact as any).mockResolvedValue(null)
        const engine = buildEngine({ ...ctx, runtimeFacts: { lifecycle_state: 'in_transit' } })
        expect(engine).toBeInstanceOf(Engine)
        // Internal access — operators set has 5 custom (+ stock built-ins)
        const opCount = (engine as any).operators?.size ?? 0
        expect(opCount).toBeGreaterThanOrEqual(5)
        // facts has at least 10 dynamic + 1 runtime
        const factCount = (engine as any).facts?.size ?? 0
        expect(factCount).toBeGreaterThanOrEqual(10)
      })
    })

    describe('fact resolvers — happy path', () => {
      it('activeOrderStage delegates to getActiveOrderForContact and returns stage_kind', async () => {
        ;(orders.getActiveOrderForContact as any).mockResolvedValue({ id: 'o1', stage_kind: 'transit', created_at: 'x' })
        const engine = buildEngine(ctx)
        engine.addRule({
          conditions: { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
          event: { type: 'route', params: { lifecycle_state: 'in_transit' } },
        })
        const result = await engine.run({})
        expect(result.events.length).toBeGreaterThan(0)
        expect(orders.getActiveOrderForContact).toHaveBeenCalledWith('ct1', ctx.workspaceId)
      })

      it('tags fact returns string[] from getContactTags', async () => {
        ;(tagsDomain.getContactTags as any).mockResolvedValue(['vip', 'forzar_humano'])
        const engine = buildEngine(ctx)
        engine.addRule({
          conditions: { all: [{ fact: 'tags', operator: 'arrayContainsAny', value: ['forzar_humano'] }] },
          event: { type: 'route', params: { agent_id: null } },
        })
        const result = await engine.run({})
        expect(result.events.length).toBeGreaterThan(0)
      })

      it('recompraEnabled fact returns boolean from getWorkspaceRecompraEnabled (B-1)', async () => {
        ;(wsConfig.getWorkspaceRecompraEnabled as any).mockResolvedValue(false)
        const engine = buildEngine(ctx)
        engine.addRule({
          conditions: { all: [
            { fact: 'isClient', operator: 'equal', value: true },
            { fact: 'recompraEnabled', operator: 'equal', value: false },
          ]},
          event: { type: 'route', params: { agent_id: 'somnio-sales-v1' } },
        })
        // mock isClient via getContactById
        const contacts = await import('@/lib/domain/contacts') as any
        ;(contacts.getContactById as any).mockResolvedValue({ is_client: true })
        const result = await engine.run({})
        expect(result.events.length).toBeGreaterThan(0)
        expect(wsConfig.getWorkspaceRecompraEnabled).toHaveBeenCalledWith(ctx.workspaceId)
      })
    })

    describe('fact resolvers — error sentinel (Pitfall 4)', () => {
      it('throw inside resolver returns sentinel, does NOT reject engine.run', async () => {
        ;(orders.getActiveOrderForContact as any).mockRejectedValue(new Error('DB hiccup'))
        const engine = buildEngine(ctx)
        // No rule references activeOrderStage explicitly — engine.run must still complete
        await expect(engine.run({})).resolves.toBeDefined()
      })
    })

    describe('FIRST-hit semantics (Pitfall 1)', () => {
      it('with priority 100 + 90 both matching, only priority 100 fires onSuccess', async () => {
        ;(orders.getActiveOrderForContact as any).mockResolvedValue({ id: 'o1', stage_kind: 'transit', created_at: 'x' })
        let firedFirst = false
        let firedSecond = false
        const engine = buildEngine(ctx)
        engine.addRule({
          conditions: { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
          event: { type: 'route', params: { lifecycle_state: 'in_transit' } },
          priority: 100,
          onSuccess: () => { firedFirst = true; engine.stop() },
        })
        engine.addRule({
          conditions: { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
          event: { type: 'route', params: { lifecycle_state: 'just_received' } },
          priority: 90,
          onSuccess: () => { firedSecond = true },
        })
        await engine.run({})
        expect(firedFirst).toBe(true)
        expect(firedSecond).toBe(false)
      })
    })

    describe('runtime facts override', () => {
      it('runtime fact lifecycle_state is queryable in Layer 2 conditions', async () => {
        const engine = buildEngine({ ...ctx, runtimeFacts: { lifecycle_state: 'in_transit' } })
        engine.addRule({
          conditions: { all: [{ fact: 'lifecycle_state', operator: 'equal', value: 'in_transit' }] },
          event: { type: 'route', params: { agent_id: 'somnio-recompra-v1' } },
        })
        const result = await engine.run({})
        expect(result.events.length).toBeGreaterThan(0)
      })
    })
    ```

    Crear `src/lib/agents/routing/__tests__/cache.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { makeRule, ruleWithPathField } from './fixtures'

    const mockLoadActive = vi.fn()
    const mockGetMaxUpdated = vi.fn()
    vi.mock('@/lib/domain/routing', () => ({
      loadActiveRulesForWorkspace: (...args: any[]) => mockLoadActive(...args),
      getMaxUpdatedAt: (...args: any[]) => mockGetMaxUpdated(...args),
    }))

    import { getRulesForWorkspace, invalidateWorkspace, _clearAllCache } from '../cache'

    const ws = 'a3843b3f-c337-4836-92b5-89c58bb98490'

    beforeEach(() => {
      vi.clearAllMocks()
      _clearAllCache()
    })

    describe('cache: getRulesForWorkspace', () => {
      it('first call hits DB via loadActiveRulesForWorkspace', async () => {
        mockLoadActive.mockResolvedValue({ success: true, data: { classifierRules: [], routerRules: [] } })
        const r = await getRulesForWorkspace(ws)
        expect(mockLoadActive).toHaveBeenCalledOnce()
        expect(r.classifierRules.length).toBe(0)
      })

      it('second call within TTL with same maxUpdatedAt → returns cached, no full reload', async () => {
        const r1 = makeRule({ id: 'r1', updated_at: '2026-04-25T10:00:00Z' })
        mockLoadActive.mockResolvedValue({ success: true, data: { classifierRules: [r1], routerRules: [] } })
        await getRulesForWorkspace(ws)
        expect(mockLoadActive).toHaveBeenCalledTimes(1)

        // Subsequent call: max unchanged → no reload
        mockGetMaxUpdated.mockResolvedValue({ success: true, data: '2026-04-25T10:00:00Z' })
        await getRulesForWorkspace(ws)
        expect(mockLoadActive).toHaveBeenCalledTimes(1)  // still 1
      })

      it('detects version delta via getMaxUpdatedAt → triggers reload (Pattern 3)', async () => {
        const r1 = makeRule({ id: 'r1', updated_at: '2026-04-25T10:00:00Z' })
        const r2 = makeRule({ id: 'r2', updated_at: '2026-04-25T11:00:00Z' })
        mockLoadActive.mockResolvedValueOnce({ success: true, data: { classifierRules: [r1], routerRules: [] } })
        await getRulesForWorkspace(ws)

        mockGetMaxUpdated.mockResolvedValue({ success: true, data: '2026-04-25T11:00:00Z' })
        mockLoadActive.mockResolvedValueOnce({ success: true, data: { classifierRules: [r1, r2], routerRules: [] } })
        const r = await getRulesForWorkspace(ws)
        expect(mockLoadActive).toHaveBeenCalledTimes(2)
        expect(r.classifierRules.length).toBe(2)
      })

      it('skips invalid rules (Pitfall 5) and logs warning', async () => {
        const validR = makeRule({ id: 'good', priority: 100 })
        const invalidR = ruleWithPathField as any  // contains `path` field
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        mockLoadActive.mockResolvedValue({ success: true, data: { classifierRules: [validR, invalidR], routerRules: [] } })
        const r = await getRulesForWorkspace(ws)
        expect(r.classifierRules.length).toBe(1)  // only good
        expect(r.classifierRules[0].id).toBe('good')
        expect(warn).toHaveBeenCalled()
      })

      it('detects same-priority collision runtime, keeps first (Pitfall 1 defense)', async () => {
        const r1 = makeRule({ id: 'a', priority: 100, rule_type: 'lifecycle_classifier' })
        const r2 = makeRule({ id: 'b', priority: 100, rule_type: 'lifecycle_classifier' })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        mockLoadActive.mockResolvedValue({ success: true, data: { classifierRules: [r1, r2], routerRules: [] } })
        const r = await getRulesForWorkspace(ws)
        expect(r.classifierRules.length).toBe(1)
        expect(r.classifierRules[0].id).toBe('a')
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('priority collision'))
      })

      it('invalidateWorkspace clears cache for that workspace', async () => {
        mockLoadActive.mockResolvedValue({ success: true, data: { classifierRules: [], routerRules: [] } })
        await getRulesForWorkspace(ws)
        invalidateWorkspace(ws)
        await getRulesForWorkspace(ws)
        expect(mockLoadActive).toHaveBeenCalledTimes(2)  // reloaded after invalidate
      })

      it('cache max=100 — 101st workspace evicts oldest', async () => {
        mockLoadActive.mockResolvedValue({ success: true, data: { classifierRules: [], routerRules: [] } })
        for (let i = 0; i < 101; i++) {
          await getRulesForWorkspace(`ws-${i}`)
        }
        // ws-0 should have been evicted; calling again triggers reload (call count > 101)
        mockGetMaxUpdated.mockResolvedValue({ success: true, data: null })
        await getRulesForWorkspace('ws-0')
        expect(mockLoadActive.mock.calls.length).toBeGreaterThan(101)
      })
    })
    ```

    **Paso 6 — Run tests**:
    ```bash
    npx vitest run src/lib/agents/routing/__tests__/engine.test.ts \
                   src/lib/agents/routing/__tests__/cache.test.ts
    ```

    **Paso 7 — Commit**:
    ```bash
    git add src/lib/agents/routing/facts.ts \
            src/lib/agents/routing/engine.ts \
            src/lib/agents/routing/cache.ts \
            src/lib/agents/routing/__tests__/engine.test.ts \
            src/lib/agents/routing/__tests__/cache.test.ts
    git commit -m "feat(agent-lifecycle-router): Plan 03 Task 2 — facts (10 with recompraEnabled B-1) + engine factory + LRU cache (10s, max 100) + tests (W-4 explicit specs)"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/routing/facts.ts</automated>
    <automated>test -f src/lib/agents/routing/engine.ts</automated>
    <automated>test -f src/lib/agents/routing/cache.ts</automated>
    <automated>grep -c "engine.addFact" src/lib/agents/routing/facts.ts | awk '{ if ($1 >= 10) exit 0; else exit 1 }'</automated>
    <automated>grep -q "getWorkspaceRecompraEnabled" src/lib/agents/routing/facts.ts</automated>
    <automated>grep -q "ERROR_SENTINEL\|catch.*return.*null\|catch.*return.*\[\]" src/lib/agents/routing/facts.ts</automated>
    <automated>grep -q "ttl: 10_000\|ttl: 10000" src/lib/agents/routing/cache.ts</automated>
    <automated>grep -q "max: 100" src/lib/agents/routing/cache.ts</automated>
    <automated>grep -q "validateRule" src/lib/agents/routing/cache.ts</automated>
    <automated>grep -q "priority collision" src/lib/agents/routing/cache.ts</automated>
    <automated>! grep -rn "createAdminClient" src/lib/agents/routing/ --include="*.ts" --exclude-dir=__tests__</automated>
    <automated>npx tsc --noEmit src/lib/agents/routing/facts.ts src/lib/agents/routing/engine.ts src/lib/agents/routing/cache.ts</automated>
    <automated>npx vitest run src/lib/agents/routing/__tests__/engine.test.ts src/lib/agents/routing/__tests__/cache.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - 10 fact resolvers registrados en facts.ts (count via grep `engine.addFact` >= 10) — B-1 fix incluye `recompraEnabled` reading `workspace_agent_config.recompra_enabled` via Plan 02 domain extension `getWorkspaceRecompraEnabled`.
    - Cada fact resolver tiene try/catch con retorno de sentinel (Pitfall 4 — verificable: NO hay `await` desnudo sin try/catch).
    - cache.ts usa `lru-cache@11`, `ttl: 10_000`, `max: 100`.
    - cache.ts invoca `validateRule` por cada row al cargar — rules invalidas se loggean y skipean (NO crash, Pitfall 5).
    - cache.ts detecta priority collision runtime + log warning (defense post-Pitfall 1).
    - **Regla 3 enforcement:** `grep -rn createAdminClient src/lib/agents/routing/ --exclude-dir=__tests__` retorna VACIO.
    - tsc --noEmit pasa.
    - 11+ tests engine + cache pasan.
  </acceptance_criteria>
  <done>
    - Engine + facts + cache listos para que route.ts (Task 3) los componga.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: route.ts (public API) — pipeline 2-engine + 3 outputs D-16 + audit log</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Architecture Patterns Pattern 1 lineas 220-313 (routeAgent code verbatim)
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §D-16 (3 outputs: matched / human_handoff / no_rule_matched)
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Pitfalls 1 (FIRST-hit pattern) + §Pitfalls 4 (engine.run try/catch)
    - src/lib/agents/registry.ts (agentRegistry.has)
    - src/lib/domain/routing.ts (recordAuditLog signature)
    - src/lib/agents/routing/cache.ts + engine.ts (creados Task 2)
  </read_first>
  <behavior>
    - Test 1: Match en classifier `lifecycle_state='in_transit'` + match en router → returns `{ agent_id: 'somnio-recompra-v1', reason: 'matched', fired_classifier_rule_id, fired_router_rule_id }`.
    - Test 2: Match `forzar_humano` rule en router emite `agent_id: null` → returns `{ agent_id: null, reason: 'human_handoff', fired_router_rule_id }`.
    - Test 3: Sin classifier match (lifecycle_state stays 'new_prospect' default) + sin router match → returns `{ agent_id: null, reason: 'no_rule_matched' }`.
    - Test 4: agent_id emitido pero NOT en registry → throws con mensaje "Routing emitted unregistered agent_id: X".
    - Test 5: FIRST-hit semantics — 2 classifier rules priority 100 y 50 ambas matchean → solo la 100 gana (verificable via fired_classifier_rule_id).
    - Test 6: engine.run THROWS (Pitfall 4) → routeAgent catches + retorna `{ agent_id: null, reason: 'fallback_legacy' }` (Plan 04 webhook-processor decide fallback).
    - Test 7: Audit log se invoca con shape correcto (mock recordAuditLog, verificar args incluyen reason + facts_snapshot + latency_ms).
    - Test 8: latency_ms > 0 en el output.
    - Test 9: facts_snapshot contiene los facts evaluados durante la decision (introspectables del almanac post-run).
  </behavior>
  <action>
    **Paso 1 — Crear `src/lib/agents/routing/route.ts`** (GREEN, source RESEARCH §Pattern 1):

    ```typescript
    /**
     * Public API for agent-lifecycle-router.
     *
     * Called by webhook-processor.ts (Plan 04) when lifecycle_routing_enabled === true.
     *
     * Pipeline (Pattern 1, 3-layer model):
     *   Layer 1 (Classifier): rules emit lifecycle_state. Default 'new_prospect' if no match.
     *   Layer 2 (Router):     rules consume lifecycle_state + tags + ... and emit agent_id.
     *
     * Output (D-16, 3 distinct reasons):
     *   - { agent_id: 'somnio-recompra-v1', reason: 'matched', rule_fired }
     *   - { agent_id: null,                  reason: 'human_handoff', rule_fired }
     *   - { agent_id: null,                  reason: 'no_rule_matched' }
     *   - { agent_id: null,                  reason: 'fallback_legacy' }  // engine.run threw
     *
     * Pitfall 4: engine.run is wrapped in try/catch — DB hiccup → fallback_legacy +
     *            webhook-processor.ts uses legacy if/else.
     */

    import { agentRegistry } from '@/lib/agents/registry'
    import { recordAuditLog, type RoutingReason } from '@/lib/domain/routing'
    import { getRulesForWorkspace } from './cache'
    import { buildEngine } from './engine'

    export interface RouteDecision {
      agent_id: string | null
      reason: RoutingReason
      lifecycle_state: string
      fired_classifier_rule_id: string | null
      fired_router_rule_id: string | null
      latency_ms: number
      facts_snapshot: Record<string, unknown>
    }

    export interface RouteAgentInput {
      contactId: string
      workspaceId: string
      conversationId?: string | null
      inboundMessageId?: string | null
    }

    const FACT_NAMES_TO_SNAPSHOT = [
      'activeOrderStage',
      'daysSinceLastDelivery',
      'daysSinceLastInteraction',
      'isClient',
      'tags',
      'hasPagoAnticipadoTag',
      'isInRecompraPipeline',
    ] as const

    export async function routeAgent(input: RouteAgentInput): Promise<RouteDecision> {
      const t0 = Date.now()
      let lifecycleState = 'new_prospect'
      let firedClassifierId: string | null = null
      let firedRouterId: string | null = null
      let agentId: string | null = null
      let reason: RoutingReason = 'no_rule_matched'
      let factsSnapshot: Record<string, unknown> = {}

      try {
        const ruleSet = await getRulesForWorkspace(input.workspaceId)

        // ============ Layer 1: Classifier ============
        const e1 = buildEngine({
          contactId: input.contactId,
          workspaceId: input.workspaceId,
          rules: [],  // attach below to wire onSuccess
        })
        for (const r of ruleSet.classifierRules) {
          e1.addRule({
            ...r.compiled,
            onSuccess: (event) => {
              firedClassifierId = r.id
              const params = (event as any).params ?? {}
              if (params.lifecycle_state) lifecycleState = params.lifecycle_state
              e1.stop()
            },
          })
        }
        const e1Result = await e1.run({})
        // Snapshot facts evaluated during classifier
        factsSnapshot = await snapshotFacts(e1Result.almanac, FACT_NAMES_TO_SNAPSHOT)

        // ============ Layer 2: Router ============
        const e2 = buildEngine({
          contactId: input.contactId,
          workspaceId: input.workspaceId,
          rules: [],
          runtimeFacts: { lifecycle_state: lifecycleState },
        })
        for (const r of ruleSet.routerRules) {
          e2.addRule({
            ...r.compiled,
            onSuccess: (event) => {
              firedRouterId = r.id
              const params = (event as any).params ?? {}
              // agent_id may be string or null (D-16: null = human_handoff)
              if ('agent_id' in params) agentId = params.agent_id
              e2.stop()
            },
          })
        }
        await e2.run({})

        // ============ Determine reason (D-16) ============
        if (firedRouterId !== null && agentId !== null) {
          // matched → validate against agentRegistry
          if (!agentRegistry.has(agentId)) {
            throw new Error(`Routing emitted unregistered agent_id: ${agentId}`)
          }
          reason = 'matched'
        } else if (firedRouterId !== null && agentId === null) {
          reason = 'human_handoff'
        } else {
          reason = 'no_rule_matched'
        }
      } catch (err) {
        console.error('[routing.route] engine pipeline threw — fallback_legacy:', err)
        reason = 'fallback_legacy'
        agentId = null
      }

      const decision: RouteDecision = {
        agent_id: agentId,
        reason,
        lifecycle_state: lifecycleState,
        fired_classifier_rule_id: firedClassifierId,
        fired_router_rule_id: firedRouterId,
        latency_ms: Date.now() - t0,
        facts_snapshot: factsSnapshot,
      }

      // Fire-and-forget audit log
      recordAuditLog({
        workspace_id: input.workspaceId,
        contact_id: input.contactId,
        conversation_id: input.conversationId ?? null,
        inbound_message_id: input.inboundMessageId ?? null,
        agent_id: decision.agent_id,
        reason: decision.reason,
        lifecycle_state: decision.lifecycle_state,
        fired_classifier_rule_id: decision.fired_classifier_rule_id,
        fired_router_rule_id: decision.fired_router_rule_id,
        facts_snapshot: decision.facts_snapshot,
        rule_set_version_at_decision: null,  // optional — Plan 06 may compute via cache.maxUpdatedAt
        latency_ms: decision.latency_ms,
      }).catch(err => console.error('[routing.route] audit log write failed:', err))

      return decision
    }

    async function snapshotFacts(
      almanac: any,
      names: readonly string[],
    ): Promise<Record<string, unknown>> {
      const snapshot: Record<string, unknown> = {}
      for (const name of names) {
        try {
          snapshot[name] = await almanac.factValue(name)
        } catch {
          snapshot[name] = null
        }
      }
      return snapshot
    }
    ```

    **Paso 2 — Crear `src/lib/agents/routing/__tests__/route.test.ts`** con los 9 behaviors. Mock `getRulesForWorkspace`, `agentRegistry.has`, `recordAuditLog`. Use fixtures de Plan 02.

    **Paso 3 — Run tests**:
    ```bash
    npx vitest run src/lib/agents/routing/__tests__/route.test.ts
    ```

    **Paso 4 — Verificar Regla 3 final**:
    ```bash
    grep -rn "createAdminClient" src/lib/agents/routing/ --include="*.ts" --exclude-dir=__tests__
    # Esperado: VACIO
    ```

    **Paso 5 — Commit**:
    ```bash
    git add src/lib/agents/routing/route.ts src/lib/agents/routing/__tests__/route.test.ts
    git commit -m "feat(agent-lifecycle-router): Plan 03 Task 3 — routeAgent (3 outputs D-16) + audit log + 9 tests"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/routing/route.ts</automated>
    <automated>grep -q "export async function routeAgent" src/lib/agents/routing/route.ts</automated>
    <automated>grep -q "'matched'" src/lib/agents/routing/route.ts</automated>
    <automated>grep -q "'human_handoff'" src/lib/agents/routing/route.ts</automated>
    <automated>grep -q "'no_rule_matched'" src/lib/agents/routing/route.ts</automated>
    <automated>grep -q "'fallback_legacy'" src/lib/agents/routing/route.ts</automated>
    <automated>grep -q "agentRegistry.has" src/lib/agents/routing/route.ts</automated>
    <automated>grep -q "recordAuditLog" src/lib/agents/routing/route.ts</automated>
    <automated>! grep -rn "createAdminClient" src/lib/agents/routing/ --include="*.ts" --exclude-dir=__tests__</automated>
    <automated>npx tsc --noEmit src/lib/agents/routing/route.ts</automated>
    <automated>npx vitest run src/lib/agents/routing/__tests__/</automated>
  </verify>
  <acceptance_criteria>
    - `routeAgent({ contactId, workspaceId })` exportada como public API.
    - Los 4 reasons aparecen literal en route.ts: 'matched', 'human_handoff', 'no_rule_matched', 'fallback_legacy'.
    - Pipeline 2-engine: classifier → router (con `lifecycle_state` runtime fact entre layers).
    - `engine.run` esta envuelto en try/catch (Pitfall 4). En throw → reason='fallback_legacy'.
    - `agentRegistry.has(agentId)` validado solo cuando reason='matched' y agentId!=null.
    - `recordAuditLog` invocado fire-and-forget (.catch en lugar de await raise).
    - **Regla 3 enforcement final:** grep retorna vacio.
    - 9 tests route.test.ts pasan.
    - Suite total `vitest run src/lib/agents/routing/__tests__/` exit 0 con 42+ tests pasando (10 schema + 11 domain + 11 operators + ~12 engine/cache (incluye W-4 expansion) + 9 route + recompraEnabled fact test).
  </acceptance_criteria>
  <done>
    - `routeAgent` listo para Plan 04 webhook integration.
    - Wave 1 lista para que Wave 2 (Plans 04 + 05) pueda paralelizar.
  </done>
</task>

</tasks>

<verification>
- 5 archivos de codigo creados (operators, facts, engine, cache, route).
- 4 archivos de test creados (operators, engine, cache, route).
- 41+ tests pasan en total entre Plans 02 + 03.
- TypeScript compila sin errores.
- Regla 3 enforcement: cero `createAdminClient` en `src/lib/agents/routing/**`.
- Pitfall 1, 2, 4, 5, 7 mitigations en codigo (verificable via grep).
</verification>

<success_criteria>
- Plan 04 puede `import { routeAgent } from '@/lib/agents/routing/route'` y reemplazar el if/else.
- Plan 05 puede usar `buildEngine` y `validateRule` para construir dry-run con candidate rules.
- Plan 06 puede llamar `invalidateWorkspace` post-edit en Server Actions.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-lifecycle-router/03-SUMMARY.md` documentando:
- 5 archivos de codigo + 4 archivos de test creados.
- Lista de los 5 operators + 9 facts.
- Tests counts.
- Confirmacion Regla 3 enforcement.
- Hooks publicos para Plan 04 (routeAgent) y Plan 05 (buildEngine).
</output>
