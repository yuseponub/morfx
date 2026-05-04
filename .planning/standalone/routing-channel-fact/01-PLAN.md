---
phase: routing-channel-fact
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/domain/conversations.ts
  - src/lib/agents/routing/facts.ts
  - src/lib/agents/routing/engine.ts
  - src/lib/agents/routing/route.ts
autonomous: true
requirements:
  - routing-channel-fact-D-04
  - routing-channel-fact-D-05
  - routing-channel-fact-D-06
  - routing-channel-fact-D-07
  - routing-channel-fact-D-01
  - routing-channel-fact-D-02
  - routing-channel-fact-D-03
  - routing-channel-fact-D-08
  - routing-channel-fact-D-09
  - routing-channel-fact-D-10
  - routing-channel-fact-D-12
  - routing-channel-fact-D-13

must_haves:
  truths:
    - "Cuando una regla tiene `{ fact: 'channel', operator: 'in', value: ['facebook', 'instagram'] }` y la conversation es WhatsApp, la regla NO matchea."
    - "Cuando la misma regla se evalua con una conversation Facebook, la regla SI matchea."
    - "Si `conversationId` no se pasa al `buildEngine` (tests existentes, dry-run), el resolver retorna null sin tocar DB y reglas que no usen `channel` siguen pasando como antes."
    - "Si la query a `conversations` falla, el resolver loguea `[routing.facts] channel failed:` y retorna null sin tumbar `engine.run` (Pitfall 4)."
    - "Cada decision en `routing_audit.facts_snapshot` incluye la propiedad `channel` con el valor del canal o `null`."
  artifacts:
    - path: "src/lib/domain/conversations.ts"
      provides: "getConversationChannel(conversationId, workspaceId) read-only helper"
      contains: "export async function getConversationChannel"
    - path: "src/lib/agents/routing/facts.ts"
      provides: "FactContext.conversationId optional field + 'channel' fact resolver registered in registerFacts"
      contains: "engine.addFact('channel'"
    - path: "src/lib/agents/routing/engine.ts"
      provides: "BuildEngineInput.conversationId optional field forwarded to registerFacts"
      contains: "conversationId?: string | null"
    - path: "src/lib/agents/routing/route.ts"
      provides: "Both buildEngine call sites pass conversationId; FACT_NAMES_TO_SNAPSHOT includes 'channel'"
      contains: "'channel'"
  key_links:
    - from: "src/lib/agents/routing/route.ts"
      to: "src/lib/agents/routing/engine.ts"
      via: "buildEngine input.conversationId"
      pattern: "conversationId: input\\.conversationId \\?\\? null"
    - from: "src/lib/agents/routing/engine.ts"
      to: "src/lib/agents/routing/facts.ts"
      via: "registerFacts ctx"
      pattern: "registerFacts\\(engine, \\{ contactId.*conversationId"
    - from: "src/lib/agents/routing/facts.ts"
      to: "src/lib/domain/conversations.ts"
      via: "getConversationChannel import"
      pattern: "getConversationChannel"
    - from: "src/lib/agents/routing/route.ts"
      to: "routing_audit.facts_snapshot"
      via: "FACT_NAMES_TO_SNAPSHOT array"
      pattern: "'channel'"
---

<objective>
Agregar el fact `channel` al motor de reglas del agent-lifecycle-router para que cualquier regla pueda matchear sobre el canal de la conversacion entrante (`'whatsapp' | 'facebook' | 'instagram' | null`).

Purpose: Habilitar la primitiva read-only que motiva este standalone. El fact se resuelve via almanac on-demand, lee `conversations.channel` a traves del domain layer, y queda disponible para que reglas existentes/futuras usen operadores estandar (`equal`, `in`, etc) sin requerir cambios al schema JSON ni a la UI del routing-editor.

Output:
- Helper `getConversationChannel` en domain layer (Regla 3).
- `FactContext` y `BuildEngineInput` extendidos con `conversationId?: string | null`.
- Resolver del fact `channel` registrado en `registerFacts(...)`.
- `route.ts` plumea `input.conversationId ?? null` a ambas llamadas a `buildEngine` y agrega `'channel'` a `FACT_NAMES_TO_SNAPSHOT`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/routing-channel-fact/CONTEXT.md
@.planning/standalone/agent-lifecycle-router/CONTEXT.md
@CLAUDE.md
@.claude/rules/agent-scope.md

<interfaces>
<!-- Patrones extraidos del codigo locked. El executor NO debe explorar; usar estos contratos directos. -->

From src/lib/domain/contacts.ts (canonical read-helper pattern — replicar exactamente):
```typescript
export async function getContactIsClient(
  contactId: string,
  workspaceId: string,
): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contacts')
    .select('is_client')
    .eq('workspace_id', workspaceId)
    .eq('id', contactId)
    .single()
  if (error || !data) return false
  return Boolean((data as { is_client: boolean | null }).is_client)
}
```

From src/lib/agents/routing/facts.ts (FactContext y patron de fact resolver):
```typescript
export interface FactContext {
  contactId: string
  workspaceId: string
}

export function registerFacts(engine: Engine, ctx: FactContext): void {
  // ... 11 facts existentes con patron try/catch + sentinel ...
  // Ejemplo del patron que `channel` debe seguir literalmente:
  engine.addFact('isInRecompraPipeline', async () => {
    try {
      return await isContactInRecompraPipeline(ctx.contactId, ctx.workspaceId)
    } catch (err) {
      console.error('[routing.facts] isInRecompraPipeline failed:', err)
      return false
    }
  })
}
```

From src/lib/agents/routing/engine.ts (BuildEngineInput):
```typescript
export interface BuildEngineInput {
  contactId: string
  workspaceId: string
  rules: RuleProperties[]
  runtimeFacts?: Record<string, unknown>
}

export function buildEngine(input: BuildEngineInput): Engine {
  // ...
  registerFacts(engine, { contactId: input.contactId, workspaceId: input.workspaceId })
  // ...
}
```

From src/lib/agents/routing/route.ts (existing structure):
```typescript
export interface RouteAgentInput {
  contactId: string
  workspaceId: string
  conversationId?: string | null   // YA EXISTE
  inboundMessageId?: string | null
}

const FACT_NAMES_TO_SNAPSHOT = [
  'activeOrderStage',
  'activeOrderStageRaw',
  'activeOrderPipeline',
  'daysSinceLastDelivery',
  'daysSinceLastInteraction',
  'isClient',
  'tags',
  'hasPagoAnticipadoTag',
  'isInRecompraPipeline',
  'lastInteractionAt',
  'recompraEnabled',
] as const

// Layer 1 buildEngine call (line 91):
const e1 = buildEngine({
  contactId: input.contactId,
  workspaceId: input.workspaceId,
  rules: [],
})

// Layer 2 buildEngine call (line 113):
const e2 = buildEngine({
  contactId: input.contactId,
  workspaceId: input.workspaceId,
  rules: [],
  runtimeFacts: { lifecycle_state: lifecycleState },
})
```

From src/lib/domain/conversations.ts (line 51 confirms `channel` column exists with values 'whatsapp' | 'facebook' | 'instagram'):
```typescript
/** Channel type — defaults to 'whatsapp' for backward compatibility */
channel?: 'whatsapp' | 'facebook' | 'instagram'
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Domain helper getConversationChannel + FactContext extension + channel resolver</name>
  <files>src/lib/domain/conversations.ts, src/lib/agents/routing/facts.ts</files>
  <read_first>
    - src/lib/domain/conversations.ts (estado actual completo — agregar el helper al final del archivo, despues de findOrCreateConversation)
    - src/lib/domain/contacts.ts lines 665-688 (patron canonical de getContactIsClient — replicar exactamente la firma y manejo de error)
    - src/lib/agents/routing/facts.ts (estado actual completo — agregar el fact `channel` al final de registerFacts despues de recompraEnabled)
    - .planning/standalone/routing-channel-fact/CONTEXT.md (D-04, D-05, D-02 — reglas de implementacion)
  </read_first>
  <behavior>
    - Test 1: `getConversationChannel(null, 'ws-1')` retorna `null` SIN invocar `createAdminClient` (short-circuit por D-04).
    - Test 2: `getConversationChannel(undefined as any, 'ws-1')` retorna `null` SIN tocar DB.
    - Test 3: `getConversationChannel('conv-1', 'ws-1')` con fixture que retorna `{ channel: 'facebook' }` retorna `'facebook'`.
    - Test 4: `getConversationChannel('conv-1', 'ws-1')` con fixture que retorna `{ channel: 'whatsapp' }` retorna `'whatsapp'`.
    - Test 5: `getConversationChannel('conv-1', 'ws-1')` con fixture que retorna `{ channel: 'instagram' }` retorna `'instagram'`.
    - Test 6: query con error / row no encontrado retorna `null` (consistente con `getContactIsClient` que retorna `false` en miss).
    - Test 7: el query filtra por `workspace_id` (Regla 3) y por `id` — verificar via `.eq` mock calls.
    - Test 8: el fact `channel` registrado en `registerFacts` invoca `getConversationChannel(ctx.conversationId, ctx.workspaceId)`.
    - Test 9: si `ctx.conversationId` es `null` o `undefined`, el fact resolver retorna `null` sin invocar `getConversationChannel`.
    - Test 10: si `getConversationChannel` lanza, el resolver loguea `'[routing.facts] channel failed:'` y retorna `null` (Pitfall 4).
  </behavior>
  <action>
**Paso 1.1 — Agregar `getConversationChannel` a `src/lib/domain/conversations.ts`** (al final del archivo, despues de `findOrCreateConversation`).

Implementar exactamente esta firma (D-04):

```typescript
// ============================================================================
// getConversationChannel — read-only helper for routing fact resolver
// ============================================================================

/**
 * Returns the channel of a conversation: 'whatsapp' | 'facebook' | 'instagram' | null.
 *
 * Used by src/lib/agents/routing/facts.ts → `channel` fact resolver
 * (standalone: routing-channel-fact, D-04).
 *
 * Behavior:
 *   - Short-circuits to null when conversationId is null/undefined WITHOUT
 *     touching DB (D-04 — avoid useless query when caller has no conversation).
 *   - Filters by workspace_id (Regla 3 multi-tenant safety).
 *   - Returns null on query error or missing row (consistent with
 *     getContactIsClient legacy-default-on-miss pattern).
 *   - Read-only — no mutation, no triggers (D-04 explicitly read-only despite
 *     domain layer being the canonical mutation surface).
 */
export async function getConversationChannel(
  conversationId: string | null | undefined,
  workspaceId: string,
): Promise<'whatsapp' | 'facebook' | 'instagram' | null> {
  if (!conversationId) return null
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('channel')
    .eq('workspace_id', workspaceId)
    .eq('id', conversationId)
    .single()
  if (error || !data) return null
  const channel = (data as { channel: string | null }).channel
  if (channel === 'whatsapp' || channel === 'facebook' || channel === 'instagram') {
    return channel
  }
  return null
}
```

**Paso 1.2 — Extender `FactContext` en `src/lib/agents/routing/facts.ts`** (D-05).

Cambiar la interfaz exacta:

```typescript
// Actual (line 103-106):
export interface FactContext {
  contactId: string
  workspaceId: string
}

// Reemplazar con:
export interface FactContext {
  contactId: string
  workspaceId: string
  /**
   * Optional — present when routing is invoked from a webhook with a known
   * conversation. Required by the `channel` fact resolver. When absent, the
   * resolver returns null without touching DB (D-05 backward compat for
   * tests/dry-run that build engines without conversation context).
   */
  conversationId?: string | null
}
```

**Paso 1.3 — Importar `getConversationChannel`** al inicio de `facts.ts`. Agregar al import block existente (linea 33-42):

```typescript
import { getConversationChannel } from '@/lib/domain/conversations'
```

**Paso 1.4 — Registrar el fact `channel`** dentro de `registerFacts(...)`, al final justo despues del bloque de `recompraEnabled` (linea 248). Usar el mismo molde que los 11 facts existentes:

```typescript
  // channel — conversation channel (whatsapp | facebook | instagram | null).
  // Standalone: routing-channel-fact (D-01). Returns null when conversationId
  // is absent OR query fails (Pitfall 4 — fail-safe). Rules with operators
  // `equal` / `in` simply do not match when the value is null.
  engine.addFact('channel', async () => {
    try {
      return await getConversationChannel(ctx.conversationId, ctx.workspaceId)
    } catch (err) {
      console.error('[routing.facts] channel failed:', err)
      return null
    }
  })
```

**Paso 1.5 — Crear/extender los tests** que validen los 10 behaviors descritos arriba. Reusar el patron de `src/lib/agents/routing/__tests__/engine.test.ts` (mocks de `@/lib/domain/*` con vi.mock). Los tests del helper `getConversationChannel` viven en un archivo nuevo o extendido — recomendado: crear `src/lib/domain/__tests__/conversations.test.ts` si no existe (verificar con `ls src/lib/domain/__tests__/`), o agregarlos al `engine.test.ts` y un nuevo `domain-conversations.test.ts` segun convencion del repo.

**NO** modificar tests existentes que pasaron en el shipped del agent-lifecycle-router — D-12 garantiza backward compat total. Solo agregar tests nuevos para `channel` en este task.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/routing/__tests__/ src/lib/domain/__tests__/ 2>&1 | tee /tmp/wave1-task1.log</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export async function getConversationChannel" src/lib/domain/conversations.ts` retorna 1 match.
    - `grep -n "if (!conversationId) return null" src/lib/domain/conversations.ts` retorna al menos 1 match (short-circuit D-04).
    - `grep -n "\.eq('workspace_id', workspaceId)" src/lib/domain/conversations.ts` retorna al menos 1 match nuevo dentro del helper (Regla 3).
    - `grep -n "conversationId?: string | null" src/lib/agents/routing/facts.ts` retorna 1 match dentro de la interfaz `FactContext`.
    - `grep -n "import { getConversationChannel }" src/lib/agents/routing/facts.ts` retorna 1 match.
    - `grep -n "engine.addFact('channel'" src/lib/agents/routing/facts.ts` retorna 1 match.
    - `grep -n "\\[routing.facts\\] channel failed:" src/lib/agents/routing/facts.ts` retorna 1 match.
    - `grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/routing/facts.ts` retorna 0 matches no-comentario (Regla 3 — todas las queries via domain).
    - `npx tsc --noEmit` pasa sin errores nuevos en `src/lib/domain/conversations.ts`, `src/lib/agents/routing/facts.ts`.
    - Los 10 tests del bloque `<behavior>` pasan (vitest run con grep "channel" o equivalente).
    - Tests existentes en `src/lib/agents/routing/__tests__/engine.test.ts` siguen verdes sin modificacion (D-12 backward compat).
  </acceptance_criteria>
  <done>
    - `getConversationChannel(conversationId, workspaceId)` existe en `src/lib/domain/conversations.ts` con la firma y comportamiento de D-04.
    - `FactContext` tiene el campo opcional `conversationId?: string | null` (D-05).
    - El fact `channel` esta registrado en `registerFacts(...)` siguiendo el patron try/catch + sentinel null de los 11 facts existentes (D-02, D-12).
    - 10 nuevos tests pasan; tests existentes no se modificaron.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: BuildEngineInput extension + plumbing en route.ts + audit snapshot</name>
  <files>src/lib/agents/routing/engine.ts, src/lib/agents/routing/route.ts</files>
  <read_first>
    - src/lib/agents/routing/engine.ts (estado actual completo — solo extender BuildEngineInput y la llamada a registerFacts)
    - src/lib/agents/routing/route.ts (estado actual completo — extender los DOS call sites de buildEngine + el array FACT_NAMES_TO_SNAPSHOT)
    - src/lib/agents/routing/__tests__/engine.test.ts (verificar que tests existentes siguen verdes con el nuevo campo opcional — D-12)
    - src/lib/agents/routing/__tests__/route.test.ts (extender el test "facts_snapshot contains expected fact keys" para incluir 'channel')
    - .planning/standalone/routing-channel-fact/CONTEXT.md (D-06, D-07, D-03)
  </read_first>
  <behavior>
    - Test 1: `buildEngine({ contactId, workspaceId, conversationId: 'conv1', rules: [] })` arma engine y el fact `channel` resuelve invocando el domain con `conv1`.
    - Test 2: `buildEngine({ contactId, workspaceId, rules: [] })` SIN conversationId sigue funcionando (campo opcional, D-12); el fact `channel` retorna null.
    - Test 3: `buildEngine({ contactId, workspaceId, conversationId: null, rules: [] })` retorna null para `channel` (short-circuit explicito).
    - Test 4: dentro de `routeAgent({ contactId, workspaceId, conversationId: 'conv1' })`, ambos engines (Layer 1 + Layer 2) reciben `conversationId: 'conv1'`.
    - Test 5: dentro de `routeAgent({ contactId, workspaceId })` SIN conversationId, ambos engines reciben `conversationId: null` (D-07 `?? null`).
    - Test 6: `decision.facts_snapshot` contiene la propiedad `channel` (D-03).
    - Test 7: una regla con `{ fact: 'channel', operator: 'in', value: ['facebook', 'instagram'] }` matchea cuando el fixture devuelve `'facebook'` y NO matchea cuando devuelve `'whatsapp'` (integration end-to-end via `engine.run`).
  </behavior>
  <action>
**Paso 2.1 — Extender `BuildEngineInput`** en `src/lib/agents/routing/engine.ts` (D-06).

Cambiar la interfaz exacta:

```typescript
// Actual (lines 12-18):
export interface BuildEngineInput {
  contactId: string
  workspaceId: string
  rules: RuleProperties[]
  /** Static facts injected at engine build time (e.g. `lifecycle_state` for Layer 2). */
  runtimeFacts?: Record<string, unknown>
}

// Reemplazar con:
export interface BuildEngineInput {
  contactId: string
  workspaceId: string
  rules: RuleProperties[]
  /** Static facts injected at engine build time (e.g. `lifecycle_state` for Layer 2). */
  runtimeFacts?: Record<string, unknown>
  /**
   * Optional — when provided, the `channel` fact resolver reads
   * `conversations.channel` for this conversation. When absent, `channel`
   * returns null. Standalone: routing-channel-fact (D-06).
   */
  conversationId?: string | null
}
```

**Paso 2.2 — Forwardear `conversationId` a `registerFacts`** en `src/lib/agents/routing/engine.ts`. Cambio exacto en la linea 37:

```typescript
// Actual:
registerFacts(engine, { contactId: input.contactId, workspaceId: input.workspaceId })

// Reemplazar con:
registerFacts(engine, {
  contactId: input.contactId,
  workspaceId: input.workspaceId,
  conversationId: input.conversationId ?? null,
})
```

**Paso 2.3 — Plumear `conversationId` desde `route.ts` a ambos `buildEngine`** (D-07).

Cambio exacto en `src/lib/agents/routing/route.ts` linea 91 (Layer 1):

```typescript
// Actual:
const e1 = buildEngine({
  contactId: input.contactId,
  workspaceId: input.workspaceId,
  rules: [], // attach via addRule below to wire onSuccess
})

// Reemplazar con:
const e1 = buildEngine({
  contactId: input.contactId,
  workspaceId: input.workspaceId,
  conversationId: input.conversationId ?? null,
  rules: [], // attach via addRule below to wire onSuccess
})
```

Cambio exacto en `src/lib/agents/routing/route.ts` linea 113 (Layer 2):

```typescript
// Actual:
const e2 = buildEngine({
  contactId: input.contactId,
  workspaceId: input.workspaceId,
  rules: [],
  runtimeFacts: { lifecycle_state: lifecycleState },
})

// Reemplazar con:
const e2 = buildEngine({
  contactId: input.contactId,
  workspaceId: input.workspaceId,
  conversationId: input.conversationId ?? null,
  rules: [],
  runtimeFacts: { lifecycle_state: lifecycleState },
})
```

**Paso 2.4 — Agregar `'channel'` a `FACT_NAMES_TO_SNAPSHOT`** (D-03).

Cambio exacto en `src/lib/agents/routing/route.ts` lineas 62-74:

```typescript
const FACT_NAMES_TO_SNAPSHOT = [
  'activeOrderStage',
  'activeOrderStageRaw',
  'activeOrderPipeline',
  'daysSinceLastDelivery',
  'daysSinceLastInteraction',
  'isClient',
  'tags',
  'hasPagoAnticipadoTag',
  'isInRecompraPipeline',
  'lastInteractionAt',
  'recompraEnabled',
  'channel',
] as const
```

**Paso 2.5 — Extender tests existentes (sin romper).**

En `src/lib/agents/routing/__tests__/route.test.ts`, encontrar el test existente:

```typescript
it('facts_snapshot contains expected fact keys captured from almanac', async () => {
  mockGetRulesForWorkspace.mockResolvedValue(ruleSet([], []))
  const decision = await routeAgent({ contactId, workspaceId: ws })
  expect(decision.facts_snapshot).toHaveProperty('tags')
  expect(decision.facts_snapshot).toHaveProperty('isClient')
  expect(decision.facts_snapshot).toHaveProperty('recompraEnabled')
})
```

Agregar las assertions:

```typescript
  expect(decision.facts_snapshot).toHaveProperty('channel')
```

Y mockear `@/lib/domain/conversations` al inicio del archivo (siguiendo el patron de los otros mocks):

```typescript
vi.mock('@/lib/domain/conversations', () => ({
  getConversationChannel: vi.fn().mockResolvedValue(null),
}))
```

**Paso 2.6 — Agregar test de integracion E2E** en `src/lib/agents/routing/__tests__/engine.test.ts`. Mockear `getConversationChannel` y validar que una regla con operador `in` matchea correctamente:

```typescript
vi.mock('@/lib/domain/conversations', () => ({
  getConversationChannel: vi.fn(),
}))
import * as conversationsDomain from '@/lib/domain/conversations'

describe('channel fact — standalone routing-channel-fact', () => {
  it('rule with { fact: channel, operator: in, value: [facebook, instagram] } matches FB conversation', async () => {
    ;(conversationsDomain.getConversationChannel as ReturnType<typeof vi.fn>).mockResolvedValue('facebook')
    const engine = buildEngine({ ...ctx, conversationId: 'conv-fb' })
    let fired = false
    engine.addRule({
      conditions: { all: [{ fact: 'channel', operator: 'in', value: ['facebook', 'instagram'] }] },
      event: { type: 'route', params: { agent_id: 'godentist-fb' } },
      onSuccess: () => { fired = true },
    })
    await engine.run({})
    expect(fired).toBe(true)
    expect(conversationsDomain.getConversationChannel).toHaveBeenCalledWith('conv-fb', ctx.workspaceId)
  })

  it('rule with { fact: channel, operator: in, value: [facebook, instagram] } does NOT match WhatsApp conversation', async () => {
    ;(conversationsDomain.getConversationChannel as ReturnType<typeof vi.fn>).mockResolvedValue('whatsapp')
    const engine = buildEngine({ ...ctx, conversationId: 'conv-wa' })
    let fired = false
    engine.addRule({
      conditions: { all: [{ fact: 'channel', operator: 'in', value: ['facebook', 'instagram'] }] },
      event: { type: 'route', params: { agent_id: 'godentist-fb' } },
      onSuccess: () => { fired = true },
    })
    await engine.run({})
    expect(fired).toBe(false)
  })

  it('channel fact returns null when conversationId is absent (D-12 backward compat)', async () => {
    const engine = buildEngine(ctx) // no conversationId
    let fired = false
    engine.addRule({
      conditions: { all: [{ fact: 'channel', operator: 'equal', value: 'whatsapp' }] },
      event: { type: 'route', params: {} },
      onSuccess: () => { fired = true },
    })
    await engine.run({})
    expect(fired).toBe(false)
    // Domain helper NOT invoked (short-circuit by D-04 inside resolver)
    // Note: the resolver itself short-circuits via ctx.conversationId === undefined.
  })
})
```

**Paso 2.7 — Verificar `dry-run.ts` sin cambios necesarios.** El archivo `src/lib/agents/routing/dry-run.ts` invoca `buildEngine` sin `conversationId` (lineas 258-262, 281-286). Como el campo es opcional (D-06), dry-run sigue funcionando exactamente igual: el fact `channel` retorna null para reglas que lo referencien en dry-run. Esto es comportamiento correcto y consistente con D-12. NO modificar `dry-run.ts`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/routing/__tests__/ 2>&1 | tee /tmp/wave1-task2.log</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "conversationId?: string | null" src/lib/agents/routing/engine.ts` retorna 1 match dentro de `BuildEngineInput`.
    - `grep -n "conversationId: input.conversationId ?? null" src/lib/agents/routing/engine.ts` retorna 1 match (forwardeo a registerFacts).
    - `grep -nc "conversationId: input.conversationId ?? null" src/lib/agents/routing/route.ts` retorna `2` (Layer 1 + Layer 2 — exactamente dos call sites).
    - `grep -n "'channel'," src/lib/agents/routing/route.ts` retorna 1 match dentro de `FACT_NAMES_TO_SNAPSHOT` (entre `'recompraEnabled'` y el cierre `] as const`).
    - `grep -n "vi.mock('@/lib/domain/conversations'" src/lib/agents/routing/__tests__/route.test.ts` retorna 1 match.
    - `grep -n "vi.mock('@/lib/domain/conversations'" src/lib/agents/routing/__tests__/engine.test.ts` retorna 1 match.
    - `grep -n "toHaveProperty('channel')" src/lib/agents/routing/__tests__/route.test.ts` retorna 1 match.
    - `grep -n "channel fact — standalone routing-channel-fact" src/lib/agents/routing/__tests__/engine.test.ts` retorna 1 match (el `describe` block nuevo).
    - El archivo `src/lib/agents/routing/dry-run.ts` NO fue modificado (`git diff src/lib/agents/routing/dry-run.ts` retorna vacio — D-12 backward compat).
    - `npx tsc --noEmit` pasa sin errores nuevos en los archivos modificados.
    - El comando `npx vitest run src/lib/agents/routing/__tests__/` pasa con 0 fallas; los tests existentes (engine.test.ts, route.test.ts, dry-run.test.ts, cache.test.ts, domain.test.ts, schema.test.ts, integrate.test.ts, operators.test.ts, domain-extensions.test.ts) siguen verdes.
    - Los 3 tests nuevos de E2E (FB matchea, WhatsApp NO matchea, sin conversationId NO matchea) pasan.
    - El test extendido `facts_snapshot contains expected fact keys` ahora valida `channel` y pasa.
  </acceptance_criteria>
  <done>
    - `BuildEngineInput.conversationId?: string | null` existe (D-06).
    - `engine.ts` forwardea `conversationId` a `registerFacts(...)` (D-06).
    - `route.ts` ambos call sites de `buildEngine` pasan `conversationId: input.conversationId ?? null` (D-07).
    - `'channel'` esta en `FACT_NAMES_TO_SNAPSHOT` (D-03).
    - `dry-run.ts` no fue modificado (D-12 backward compat preservado).
    - Tests E2E demuestran que reglas con operador `in` matchean para canales meta y NO para WhatsApp.
    - `facts_snapshot.channel` aparece en cada decision de routing (audit log completo).
  </done>
</task>

</tasks>

<verification>
**Verificacion local (antes de commit):**

1. **Type check:** `npx tsc --noEmit` — sin errores nuevos en `src/lib/domain/conversations.ts`, `src/lib/agents/routing/{facts,engine,route}.ts`.
2. **Unit + integration tests:** `npx vitest run src/lib/agents/routing/__tests__/` — 0 fallas, todos los tests pre-existentes verdes (D-12 backward compat).
3. **Domain layer purity (Regla 3):** `grep -E "createAdminClient|@supabase/supabase-js" src/lib/agents/routing/` retorna 0 matches no-comentario fuera de archivos donde ya existe (`src/lib/agents/routing/route.ts` no debe ganar nuevos imports de Supabase).
4. **No bypass del domain:** `grep -n "from('conversations')" src/lib/agents/routing/` retorna 0 matches (toda lectura va via `getConversationChannel`).
5. **Schema sin cambios (D-09):** `git diff src/lib/agents/routing/schema/rule-v1.schema.json` retorna vacio.
6. **Dry-run sin cambios (D-12):** `git diff src/lib/agents/routing/dry-run.ts` retorna vacio.
7. **Sin migracion DB (D-10):** `ls supabase/migrations/` no contiene archivos nuevos en este standalone (Regla 5 N/A — `conversations.channel` ya existe).
8. **Sin feature flag (D-13):** `git diff` no introduce flags como `routing_channel_fact_enabled` o equivalente.

**Confirmacion semantica del fact:**
- Una regla nueva en routing-editor con `{ fact: "channel", operator: "in", value: ["facebook", "instagram"] }` puede ser matcheable end-to-end (lo demostraran los tests E2E del Task 2).
- `routing_audit.facts_snapshot.channel` aparecera con `'whatsapp'` / `'facebook'` / `'instagram'` / `null` en producccion despues del merge.
</verification>

<success_criteria>
- [ ] `getConversationChannel(conversationId, workspaceId)` retorna `'whatsapp' | 'facebook' | 'instagram' | null` segun el caso (D-04).
- [ ] `FactContext` y `BuildEngineInput` tienen `conversationId?: string | null` opcional (D-05, D-06).
- [ ] Las DOS llamadas a `buildEngine` en `route.ts` forwardean `input.conversationId ?? null` (D-07).
- [ ] El fact `channel` retorna null sin tocar DB cuando `ctx.conversationId` es null/undefined (D-04 short-circuit).
- [ ] El fact `channel` retorna null y loguea `[routing.facts] channel failed:` cuando la query throws (D-02 Pitfall 4).
- [ ] `FACT_NAMES_TO_SNAPSHOT` incluye `'channel'` y `routing_audit.facts_snapshot` lo persiste (D-03).
- [ ] Reglas con `{ fact: 'channel', operator: 'in', value: [...] }` evaluan correctamente end-to-end (test E2E).
- [ ] Tests pre-existentes en `src/lib/agents/routing/__tests__/` siguen verdes sin modificacion estructural (D-12 backward compat).
- [ ] `dry-run.ts` no fue modificado (D-12).
- [ ] No hay migracion DB ni feature flag (D-10, D-13).
- [ ] `grep` confirma que ningun archivo de routing/ usa `createAdminClient` directo (Regla 3).
</success_criteria>

<output>
After completion, create `.planning/standalone/routing-channel-fact/01-SUMMARY.md` documenting:
- Cambios exactos en cada archivo (4 archivos modificados, 0 archivos creados nuevos en src/, ~50 lineas netas de codigo + ~80 lineas de tests).
- Verificacion de los 13 decisions D-01..D-13.
- Lista de comandos `grep` usados para auto-validar las acceptance_criteria.
- Cualquier desviacion del plan (NO se espera ninguna — el plan es deterministico).
</output>
