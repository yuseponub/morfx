# Standalone: Somnio Recompra + CRM Reader — Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 13 files (4 CREATE, 7 MODIFY, 2 data/docs)
**Analogs found:** 13 / 13 (1 poll helper has no exact analog — diseño nuevo basado en primitives conocidas)

---

## File Classification

| File | Action | Role | Data Flow | Closest Analog | Match Quality |
|------|--------|------|-----------|----------------|---------------|
| `src/inngest/functions/recompra-preload-context.ts` | CREATE | Inngest function (background worker) | event → AI call → DB write → observability merge | `src/inngest/functions/agent-production.ts` (step.run + __obs pattern) + `src/inngest/functions/crm-bot-expire-proposals.ts` (skeleton) | exact (composite) |
| `src/lib/agents/production/webhook-processor.ts` | MODIFY | Request-response pipeline edit | dispatch new Inngest event after runner creates session | `src/lib/whatsapp/webhook-handler.ts:310-336` | exact |
| `src/lib/agents/somnio-recompra/comprehension-prompt.ts` | MODIFY | Prompt-building edit | existingData → filter `_v3:` keys → inject CRM section | own file `:14-32` (section concat pattern) | exact (self) |
| `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts` | MODIFY | Agent pipeline edit | input.datosCapturados → poll DB → merge `_v3:crm_context` | no exact analog — helper fresh from primitives | partial |
| `src/lib/agents/crm-reader/types.ts` | MODIFY (optional) | Type extension | add optional `abortSignal` to `ReaderInput` | none needed — 1-line addition | role-match |
| `src/lib/agents/crm-reader/index.ts` | MODIFY (optional) | LLM invocation | thread `abortSignal` through `generateText` | own file `:36-54` | exact (self) |
| `src/inngest/events.ts` | MODIFY | Event schema registration | type union extension | self `:715-748` (V3TimerEvents pattern) | exact (self) |
| `src/app/api/inngest/route.ts` | MODIFY | Function registration entry | import + push into `functions` array | self `:19-31` | exact (self) |
| `.claude/rules/agent-scope.md` | MODIFY | Scope doc | add consumer note to CRM Reader Bot section | self `:27-41` (existing scope block) | exact (self) |
| `supabase/migrations/<ts>_platform_config_recompra_flag.sql` OR manual SQL | CREATE OR MANUAL | Data seed (pre-deploy) | `INSERT INTO platform_config ...` | `src/lib/domain/platform-config.ts:96-154` (consumer) | role-match (Regla 5 data-before-deploy) |
| `package.json` | MODIFY | Dev tooling | add `"test": "vitest run"` script + `vitest` devDep | none — minimal 2-line edit | role-match |
| `src/__tests__/integration/recompra-preload.test.ts` | CREATE | Integration test | vitest + mocked Inngest + real Supabase | `src/__tests__/integration/crm-bots/reader.test.ts:1-50` | exact |
| `src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` | CREATE | Unit test | string-inspection on `buildSystemPrompt` output | `src/lib/agents/somnio/__tests__/block-composer.test.ts` | exact (pure-function unit) |
| `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` | CREATE | Unit test | timer-based poll with mocked `SessionManager.getState` | `src/lib/agents/somnio/__tests__/char-delay.test.ts` | role-match (timing) |
| `src/inngest/functions/__tests__/recompra-preload-context.test.ts` | CREATE | Unit test | mock inngest client + `processReaderMessage` + `SessionManager` | `src/__tests__/integration/crm-bots/reader.test.ts` (adapted to unit) | role-match |

---

## Wave Structure

Derivado de RESEARCH.md §Wave 0 Gaps + dependency order:

- **Wave 0** — Test infra + feature flag seed (unblocking)
- **Wave 1** — Event schema registration + optional reader `abortSignal` extension
- **Wave 2** — New Inngest function + route registration
- **Wave 3** — webhook-processor dispatch (consumer-side wiring)
- **Wave 4** — comprehension-prompt inject + agent poll (reader-side consumption)
- **Wave 5** — Scope doc update (D-17) + docs Regla 4

---

## Pattern Assignments

### Wave 0 — Test Infrastructure + Feature Flag Seed

---

### `package.json` — MODIFY

**Role:** Dev tooling config
**Data flow:** npm → vitest install → `npm run test` script

**Closest analog:** none within repo — this is the infra gap itself. Verified with: `package.json` has no `test` script, no `vitest` dev dep.

**Change shape:**
```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

**Differences for this phase:**
- Instalar `vitest` como devDep. El repo YA tiene `.test.ts` files (6+) pero sin runner declarado (`reader.test.ts:20-22` lo comenta explicitamente).
- El planner decide si añadir `@vitest/ui` o no.

**Referenced by plans covering:** Wave 0 — unblocks todos los test files. RESEARCH §Environment Availability (vitest missing, no fallback).

---

### `src/__tests__/integration/recompra-preload.test.ts` — CREATE

**Role:** Integration test
**Data flow:** vitest → mock inngest client + real Supabase session_state → assert `_v3:crm_context` merged, observability turn row written

**Closest analog:** `src/__tests__/integration/crm-bots/reader.test.ts`

```typescript
// Source: src/__tests__/integration/crm-bots/reader.test.ts:25-50
import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3020'
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_API_KEY = process.env.TEST_API_KEY ?? ''

// 30-second per-test budget for LLM calls (AI SDK generateText with Sonnet 4.5).
const LLM_TIMEOUT_MS = 30_000

beforeAll(() => {
  if (!TEST_WORKSPACE_ID || !TEST_API_KEY) {
    throw new Error(
      'TEST_WORKSPACE_ID and TEST_API_KEY env vars are required. ...',
    )
  }
})
```

**Differences for this phase:**
- NO hay HTTP endpoint — esta fase invoca `processReaderMessage` in-process. Sustituir `fetch(READER_ENDPOINT)` por import directo de la Inngest function handler o `processReaderMessage` mockado.
- Seed de row `platform_config.somnio_recompra_crm_reader_enabled = true` en `beforeEach`.
- Aserciones: leer `session_state.datos_capturados['_v3:crm_context']` y `_v3:crm_context_status === 'ok'`.

**Referenced by plans covering:** D-06 (persist), D-10 (key), D-15 (idempotency).

---

### `src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` — CREATE

**Role:** Unit test
**Data flow:** `buildSystemPrompt({ _v3:crm_context: 'texto...', ... })` → string → assert contains `## CONTEXTO CRM DEL CLIENTE` + filtered JSON dump

**Closest analog:** `src/lib/agents/somnio/__tests__/block-composer.test.ts` (pure function test pattern, sin I/O).

**Shape:**
```typescript
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../comprehension-prompt'

describe('buildSystemPrompt — CRM context injection', () => {
  it('injecta seccion CRM cuando status === "ok"', () => {
    const prompt = buildSystemPrompt({
      nombre: 'Jose',
      '_v3:crm_context': 'Ultimo pedido: 2x Somnio entregado el 2026-04-10...',
      '_v3:crm_context_status': 'ok',
    })
    expect(prompt).toContain('## CONTEXTO CRM DEL CLIENTE')
    expect(prompt).toContain('Ultimo pedido: 2x Somnio')
    // Filtro: keys _v3: NO deben estar en JSON dump
    expect(prompt).not.toContain('_v3:crm_context')
  })

  it('NO injecta seccion CRM cuando status === "timeout"', () => { ... })
})
```

**Differences for this phase:**
- Ningun mock — pure function. Copiar estructura exacta de `block-composer.test.ts`.

**Referenced by plans covering:** D-11 (comprehension read), Claude's Discretion (inyeccion dedicated section ANTES de DATOS YA CAPTURADOS).

---

### `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` — CREATE

**Role:** Unit test (timing-sensitive)
**Data flow:** mocked `SessionManager.getState` returns state con delay → `pollCrmContext(sessionId, ...)` → assert iteraciones y status resultado

**Closest analog:** `src/lib/agents/somnio/__tests__/char-delay.test.ts` (existente test de timing).

**Differences for this phase:**
- Usar `vi.useFakeTimers()` + `vi.advanceTimersByTime(500)` para simular polling sin waits reales.
- Mock `SessionManager.getState` via `vi.mock('@/lib/agents/session-manager', ...)`.

**Referenced by plans covering:** D-13 (500ms x 3s), D-14 (timeout → procede).

---

### `src/inngest/functions/__tests__/recompra-preload-context.test.ts` — CREATE

**Role:** Unit test
**Data flow:** invoke function handler con event mock → assert `processReaderMessage` llamado con shape correcto + `SessionManager.updateCapturedData` llamado con merge-safe payload

**Closest analog:** no existe test unit de Inngest function en el repo. Patron derivado de `reader.test.ts` (setup pattern) + la function spec §Ejemplo 1 de RESEARCH.

**Skeleton:**
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/agents/crm-reader', () => ({
  processReaderMessage: vi.fn().mockResolvedValue({
    text: 'Ultimo pedido entregado...',
    toolCalls: [],
    steps: 3,
    agentId: 'crm-reader',
  }),
}))
vi.mock('@/lib/agents/session-manager', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    updateCapturedData: vi.fn(),
  })),
}))
vi.mock('@/lib/domain/platform-config', () => ({
  getPlatformConfig: vi.fn().mockResolvedValue(true),
}))
```

**Differences for this phase:**
- Primer test de Inngest function puro del repo — planner decide si testear via `handler()` direct invocation o via Inngest test harness.
- D-15 idempotency: test adicional que segundo dispatch (con `_v3:crm_context_status` ya en state) retorna `{ status: 'skipped', reason: 'already_processed' }`.

**Referenced by plans covering:** D-04, D-05, D-06, D-15.

---

### Data seed: `platform_config.somnio_recompra_crm_reader_enabled = false` — PRE-DEPLOY MANUAL

**Role:** Feature flag seed (Regla 5 data-before-deploy)
**Data flow:** SQL INSERT → row disponible → `getPlatformConfig()` retorna valor real en vez de fallback

**Closest analog consumer:** `src/lib/domain/platform-config.ts:96-154` (lectora).

```typescript
// Source: src/lib/domain/platform-config.ts:96-154
export async function getPlatformConfig<T>(key: string, fallback: T): Promise<T> {
  const entry = cache.get(key)
  const now = Date.now()
  if (entry && entry.expiresAt > now) {
    return entry.value as T
  }
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    if (error) return fallback
    if (data == null) return fallback
    const value = (data as { value: unknown }).value
    // ... type-check ...
    cache.set(key, { value, expiresAt: Date.now() + PLATFORM_CONFIG_TTL_MS })
    return value as T
  } catch (err) {
    return fallback
  }
}
```

**Shape del INSERT (pre-deploy):**
```sql
INSERT INTO platform_config (key, value)
VALUES ('somnio_recompra_crm_reader_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

**Differences for this phase:**
- NO es schema change — es data insert. Regla 5 aplica igual: insertar ANTES del push para que `getPlatformConfig` retorne el valor real (aunque fail-open a `false` igualmente seguro).
- Plan-phase decide si va en migration file (`supabase/migrations/<ts>_seed_recompra_crm_reader_flag.sql`) o como pasos manuales ejecutados via Supabase Studio con pausa-confirmar.
- Recomendacion research: migration file (se auditean + replay en entornos nuevos).

**Referenced by plans covering:** Regla 6 (feature flag default OFF), D-17 scope note, Pitfall 6 (no env var).

---

### Wave 1 — Event Schema Registration + Reader AbortSignal

---

### `src/inngest/events.ts` — MODIFY

**Role:** Event schema registration
**Data flow:** TS type union extension → enables typed `inngest.send({ name: 'recompra/preload-context', data: {...} })`

**Closest analog (self):** `src/inngest/events.ts:715-748` — pattern `V3TimerEvents` + union extension line 748.

```typescript
// Source: src/inngest/events.ts:715-748
export type V3TimerEvents = {
  'agent/v3.timer.started': {
    data: {
      sessionId: string
      conversationId: string
      workspaceId: string
      level: number
      timerDurationMs: number
      phoneNumber: string
      contactId: string
    }
  }
  'agent/v3.timer.cancelled': {
    data: {
      sessionId: string
      reason: string
    }
  }
}

export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents & GodentistEvents & V3TimerEvents
```

**Shape esperado del nuevo evento:**
```typescript
export type RecompraPreloadEvents = {
  'recompra/preload-context': {
    data: {
      sessionId: string
      contactId: string
      workspaceId: string
      invoker: 'somnio-recompra-v1'
    }
  }
}

// Add to union on line 748:
export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents & GodentistEvents & V3TimerEvents & RecompraPreloadEvents
```

**Differences for this phase:**
- Namespace nuevo: `recompra/` (RESEARCH A3 verifico no colisiona con eventos existentes).
- Elimina necesidad de `(inngest.send as any)` — Open Q 4 recomienda tipado.

**Referenced by plans covering:** D-04, D-05, Pitfall 8.

---

### `src/lib/agents/crm-reader/types.ts` — MODIFY (optional, recommended)

**Role:** Type extension
**Data flow:** add optional `abortSignal?: AbortSignal` to `ReaderInput`

**Closest analog (self):**
```typescript
// Source: src/lib/agents/crm-reader/types.ts:30-34
export interface ReaderInput {
  workspaceId: string
  messages: ReaderMessage[]
  invoker?: string
}
```

**Shape esperado:**
```typescript
export interface ReaderInput {
  workspaceId: string
  messages: ReaderMessage[]
  invoker?: string
  /** Optional abort signal for upstream timeouts (Pitfall 5 mitigation) */
  abortSignal?: AbortSignal
}
```

**Differences for this phase:**
- 100% additive — todos los callers existentes siguen funcionando sin cambios (`invoker?` ya es optional → mismo patron).
- Sin este edit, planner debe usar Promise.race + setTimeout como fallback (peor — Pitfall 5).

**Referenced by plans covering:** Pitfall 5 (12s AbortSignal), Open Q 5.

---

### `src/lib/agents/crm-reader/index.ts` — MODIFY (optional, pair con types.ts)

**Role:** LLM invocation wiring
**Data flow:** thread `input.abortSignal` → `generateText({ abortSignal })`

**Closest analog (self):**
```typescript
// Source: src/lib/agents/crm-reader/index.ts:36-54
export async function processReaderMessage(input: ReaderInput): Promise<ReaderOutput> {
  const systemPrompt = buildReaderSystemPrompt(input.workspaceId)
  const tools = createReaderTools({
    workspaceId: input.workspaceId,
    invoker: input.invoker,
  })
  const messages = input.messages as unknown as ModelMessage[]

  const result = await generateText({
    model: anthropic(MODEL_ID),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    temperature: 0,
  })
  // ...
}
```

**Shape esperado:**
```typescript
const result = await generateText({
  model: anthropic(MODEL_ID),
  system: systemPrompt,
  messages,
  tools,
  stopWhen: stepCountIs(MAX_STEPS),
  temperature: 0,
  abortSignal: input.abortSignal,  // <-- added
})
```

**Differences for this phase:**
- AI SDK v6 soporta `abortSignal` nativo en `generateText` (RESEARCH §Don't Hand-Roll). Pass-through simple.

**Referenced by plans covering:** Pitfall 5.

---

### Wave 2 — New Inngest Function + Route Registration

---

### `src/inngest/functions/recompra-preload-context.ts` — CREATE

**Role:** Inngest background worker function
**Data flow:** event `recompra/preload-context` → `step.run('call-reader-and-persist')` → `processReaderMessage(...)` → `SessionManager.updateCapturedData(...)` → return `{ readerResult, __obs }` → outer `collector.mergeFrom(...)` → `step.run('observability-flush')`

**Closest analog (composite — dos files):**

1. **Skeleton shape:** `src/inngest/functions/crm-bot-expire-proposals.ts` (entire file, 76 lines — minimal Inngest createFunction pattern)
2. **Observability merge + step.run return shape:** `src/inngest/functions/agent-production.ts:294-367` + `:466-489`

```typescript
// Source: src/inngest/functions/crm-bot-expire-proposals.ts:43-75 (skeleton)
export const crmBotExpireProposalsCron = inngest.createFunction(
  {
    id: 'crm-bot-expire-proposals',
    name: 'Expire CRM Bot Proposals (TTL)',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota */1 * * * *' },
  async ({ step }) => {
    const result = await step.run('expire-proposed', async () => {
      // ... work ...
      return { expiredCount: data?.length ?? 0, cutoff }
    })
    return result
  },
)
```

```typescript
// Source: src/inngest/functions/agent-production.ts:294-367 (observability merge)
const stepResult = await step.run('process-message', async () => {
  const stepCollector = collector
    ? new ObservabilityCollector({
        conversationId: collector.conversationId,
        workspaceId: collector.workspaceId,
        agentId: collector.agentId,
        turnStartedAt: collector.turnStartedAt,
        triggerMessageId: collector.triggerMessageId,
        triggerKind: collector.triggerKind,
      })
    : null

  const invokePipeline = () => processMessageWithAgent({ ... })

  const engineResult = stepCollector
    ? await runWithCollector(stepCollector, invokePipeline)
    : await invokePipeline()

  return {
    engineResult,
    __obs: stepCollector
      ? {
          events: stepCollector.events,
          queries: stepCollector.queries,
          aiCalls: stepCollector.aiCalls,
        }
      : null,
  }
})

// Outer — merge captured observability survived through serialized return
if (collector && stepResult.__obs) {
  collector.mergeFrom(stepResult.__obs)
}
```

```typescript
// Source: src/inngest/functions/agent-production.ts:484-486 (flush as last step)
await step.run('observability-flush', async () => {
  await collector.flush()
})
```

**Differences for this phase:**
- Trigger: `{ event: 'recompra/preload-context' }` en vez de cron.
- Config: `retries: 1` (no 2 — reader gasta tokens, RESEARCH bullet 6), `concurrency: [{ key: 'event.data.sessionId', limit: 1 }]` (dedupe mismo session, RESEARCH Open Q 6).
- Feature flag early-return ANTES del step.run: `if (!(await getPlatformConfig('somnio_recompra_crm_reader_enabled', false))) return { status: 'skipped' }`.
- Idempotency early-return: leer `SessionManager.getState(sessionId)` al inicio; si `datos_capturados['_v3:crm_context_status']` ya existe (ok/empty/error), retornar `{ status: 'skipped', reason: 'already_processed' }` (D-15, Open Q 6).
- Inner `AbortController` + `setTimeout(12_000)` (Pitfall 5). Si Wave 1 agrego `abortSignal` a ReaderInput, pasarlo; sino fallback Promise.race.
- Error-path debe ESCRIBIR el marker `_v3:crm_context_status = 'error'` ANTES de throw (Pitfall 4 — evita poll esperando 3s cuando hubo falla definitiva).
- Usa `SessionManager.updateCapturedData(sessionId, { '_v3:crm_context': text, '_v3:crm_context_status': status })` — NO `adapters.storage.saveState` (Pitfall 2 — ese es full replace).
- Eventos observability a emitir (D-16):
  - `pipeline_decision:crm_reader_completed` con `{ agent, sessionId, contactId, durationMs, toolCallCount, steps, textLength, status }`
  - `pipeline_decision:crm_reader_failed` con `{ agent, sessionId, contactId, durationMs, error }`
- Prompt helper `buildReaderPrompt(contactId)` con template literal D-08 (copiar verbatim).

**Referenced by plans covering:** D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-15, D-16, Pitfalls 1/2/4/5/6/8/9, Regla 2 (fechas Bogota vienen del reader tools), Regla 6 (flag default off).

---

### `src/app/api/inngest/route.ts` — MODIFY

**Role:** Function registration entry
**Data flow:** import new function → push into `serve({ functions: [...] })` array

**Closest analog (self):**
```typescript
// Source: src/app/api/inngest/route.ts:19-68
import { agentTimerFunctions } from '@/inngest/functions/agent-timers'
import { agentProductionFunctions } from '@/inngest/functions/agent-production'
// ... more imports
import { crmBotExpireProposalsCron } from '@/inngest/functions/crm-bot-expire-proposals'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...agentTimerFunctions,
    ...agentProductionFunctions,
    // ...
    crmBotExpireProposalsCron,
  ],
})
```

**Shape esperado:**
```typescript
import { recompraPreloadContextFunctions } from '@/inngest/functions/recompra-preload-context'

// ...
functions: [
  // ...existing...
  ...recompraPreloadContextFunctions,
],
```

**Differences for this phase:**
- Preferir `recompraPreloadContextFunctions = [recompraPreloadContext]` (array export, patron de `agentProductionFunctions`, `godentistReminderFunctions`, etc.) sobre single-export (que usan `crmBotExpireProposalsCron`, `enviaStatusPollingCron`). Array es mas extensible si luego se agrega función relacionada (ej. invalidador si se decide TTL en deferred).

**Referenced by plans covering:** D-04 (function registration).

---

### Wave 3 — Webhook-Processor Dispatch

---

### `src/lib/agents/production/webhook-processor.ts` — MODIFY

**Role:** Request-response pipeline edit — insertar dispatch del nuevo evento DESPUES de `runner.processMessage` (para tener `engineOutput.sessionId`)
**Data flow:** existing is_client branch → existing `loadLastOrderData` → existing runner → **★ NEW:** feature flag check + `inngest.send` + `recordEvent('crm_reader_dispatched')`

**Closest analog:** `src/lib/whatsapp/webhook-handler.ts:310-336`

```typescript
// Source: src/lib/whatsapp/webhook-handler.ts:310-336
if (useInngest) {
  try {
    const { inngest } = await import('@/inngest/client')
    await (inngest.send as any)({
      name: 'agent/whatsapp.message_received',
      data: {
        conversationId,
        contactId,
        messageContent: normalizedContent,
        workspaceId,
        phone,
        messageId: msg.id,
        messageTimestamp,
        messageType: msg.type,
        mediaUrl: mediaUrl ?? null,
        mediaMimeType: mediaMimeType ?? null,
      },
    })
  } catch (inngestError) {
    console.error('Inngest send failed, falling back to inline:', inngestError instanceof Error ? inngestError.message : inngestError)
    // ... fallback ...
  }
}
```

**Integration point in webhook-processor.ts (existing code — ver `:170-250`):**

```typescript
// Source: src/lib/agents/production/webhook-processor.ts:216-232
const runner = new V3ProductionRunner(adapters, {
  workspaceId,
  agentModule: 'somnio-recompra',
  preloadedData: lastOrderData,
})

const engineOutput = await runner.processMessage({
  sessionId: '',
  conversationId,
  contactId: contactId!,
  message: messageContent,
  workspaceId,
  history: [],
  phoneNumber: phone,
  messageTimestamp: input.messageTimestamp,
})
```

**Differences for this phase:**
- Insertar BLOQUE NUEVO inmediatamente DESPUES de linea 250 (`logger.info({conversationId, contactId}, 'Recompra agent processing complete')`), ANTES del `catch (engineError)`. Importante: dispatch despues del runner porque `engineOutput.sessionId` solo existe entonces (RESEARCH Open Q 2).
- Feature flag check via `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)` antes del send — evita cost del `inngest.send` cuando disabled.
- Gate adicional: solo disparar si es sesion NUEVA (`session.version === 0` equivalente). Como `engineOutput` no expone `version`, usar proxy: solo en primer turno (history vacio al entrar al branch). Planner decide mecanismo exacto.
- Emit `pipeline_decision:crm_reader_dispatched` (D-16) inmediatamente antes del `inngest.send` para que quede registrado aunque el send falle.
- Try/catch alrededor del send — si falla, log warn y continuar (el saludo ya salio, fail-open).
- Con events.ts actualizado (Wave 1), `(inngest.send as any)` ya NO es necesario — usar tipado directo.

**Referenced by plans covering:** D-01 (solo session nueva), D-03 (paralelo via Inngest), D-05 (await), Regla 6 (feature flag gate), Pitfall 1 (await obligatorio), Pitfall 6 (flag via platform_config no env).

---

### Wave 4 — Comprehension Inject + Agent Poll

---

### `src/lib/agents/somnio-recompra/comprehension-prompt.ts` — MODIFY

**Role:** Prompt-building edit — inyectar seccion `## CONTEXTO CRM DEL CLIENTE` ANTES de `DATOS YA CAPTURADOS` + filtrar `_v3:` keys del JSON dump
**Data flow:** `existingData: Record<string, string>` → extract `_v3:crm_context` + `_v3:crm_context_status` → build `crmSection` → filter `_v3:` prefix de `filteredData` → concat final prompt

**Closest analog (self, same file `:14-32`):**
```typescript
// Source: src/lib/agents/somnio-recompra/comprehension-prompt.ts:14-32
export function buildSystemPrompt(existingData: Record<string, string>, recentBotMessages: string[] = []): string {
  const dataSection = Object.keys(existingData).length > 0
    ? `\nDATOS YA CAPTURADOS (no re-extraer si ya estan):\n${JSON.stringify(existingData, null, 2)}`
    : '\nDATOS YA CAPTURADOS: Ninguno aun.'

  const botContextSection = recentBotMessages.length > 0
    ? `\nULTIMOS MENSAJES DEL BOT (para contexto de respuestas cortas del cliente):
${recentBotMessages.map((m, i) => `[${i + 1}] "${m}"`).join('\n')}
...`
    : ''

  return `Eres un analizador de mensajes para un agente de ventas de Somnio...${dataSection}${botContextSection}`
}
```

**Shape esperado:**
```typescript
export function buildSystemPrompt(existingData: Record<string, string>, recentBotMessages: string[] = []): string {
  // ★ NEW: extract + filter
  const crmContext = existingData['_v3:crm_context']
  const crmStatus = existingData['_v3:crm_context_status']
  const hasCrmContext = crmStatus === 'ok' && crmContext && crmContext.trim().length > 0

  // ★ NEW: filtrar _v3: prefix del JSON dump (Pitfall 7 + limpieza)
  const filteredData = Object.fromEntries(
    Object.entries(existingData).filter(([k]) => !k.startsWith('_v3:'))
  )

  const dataSection = Object.keys(filteredData).length > 0
    ? `\nDATOS YA CAPTURADOS (no re-extraer si ya estan):\n${JSON.stringify(filteredData, null, 2)}`
    : '\nDATOS YA CAPTURADOS: Ninguno aun.'

  // ★ NEW: seccion dedicada
  const crmSection = hasCrmContext
    ? `\n\n## CONTEXTO CRM DEL CLIENTE (precargado)\n${crmContext}\n\n(Usa este contexto para personalizar la comprension; NO reinventes datos.)`
    : ''

  const botContextSection = recentBotMessages.length > 0
    ? `\nULTIMOS MENSAJES DEL BOT...`   // unchanged
    : ''

  return `Eres un analizador de mensajes para un agente de ventas de Somnio...${crmSection}${dataSection}${botContextSection}`
}
```

**Differences for this phase:**
- Filtrado de `_v3:` keys NUEVO — el codigo actual dumpea `existingData` raw (RESEARCH metadata "comprehension Injection MEDIUM confidence").
- `crmSection` concatenada ANTES de `dataSection` (Claude's Discretion resolvio: seccion dedicada ANTES de "DATOS YA CAPTURADOS").
- NO se truncan `crmContext` en esta fase (Pitfall 7 — monitorear antes). Si p95 > 2000 chars, agregar truncado en follow-up.

**Referenced by plans covering:** D-11 (comprehension read), Claude's Discretion.

---

### `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts` — MODIFY

**Role:** Agent pipeline edit — agregar poll helper + llamada al poll ANTES de `comprehend()` dentro de `processUserMessage`
**Data flow:** `input.datosCapturados` (snapshot stale) → poll DB via `SessionManager.getState(sessionId)` cada 500ms hasta 3s → merge `_v3:crm_context` de vuelta a `input.datosCapturados` → emit `crm_context_used` | `crm_context_missing_after_wait`

**Closest analog:** NO existe poll-con-espera en `somnio-recompra/` ni en `somnio/`. Diseño nuevo basado en primitives (`setTimeout` Promise + while-loop + `SessionManager.getState`).

**Primitive base (SessionManager.getState):**
```typescript
// Source: src/lib/agents/session-manager.ts:402-414 (helper merge-safe exists para write)
async updateCapturedData(
  sessionId: string,
  newData: Record<string, string>
): Promise<void> {
  const state = await this.getState(sessionId)   // <-- usaremos getState tambien para read
  await this.updateState(sessionId, {
    datos_capturados: {
      ...state.datos_capturados,
      ...newData,
    },
  })
}
```

**Shape esperado (helper + integracion):**
```typescript
async function pollCrmContext(
  sessionId: string,
  datosFromInput: Record<string, string>,
  timeoutMs = 3000,
  intervalMs = 500
): Promise<{ crmContext: string | null; status: 'ok' | 'empty' | 'error' | 'timeout' }> {
  const existingStatus = datosFromInput['_v3:crm_context_status']
  if (existingStatus === 'ok' || existingStatus === 'empty' || existingStatus === 'error') {
    return {
      crmContext: datosFromInput['_v3:crm_context'] ?? null,
      status: existingStatus as 'ok' | 'empty' | 'error',
    }
  }
  const { SessionManager } = await import('@/lib/agents/session-manager')
  const sm = new SessionManager()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs))
    try {
      const state = await sm.getState(sessionId)
      const status = state.datos_capturados['_v3:crm_context_status']
      if (status === 'ok' || status === 'empty' || status === 'error') {
        return {
          crmContext: state.datos_capturados['_v3:crm_context'] ?? null,
          status: status as 'ok' | 'empty' | 'error',
        }
      }
    } catch { /* swallow, try again */ }
  }
  return { crmContext: null, status: 'timeout' }
}
```

**Wire inside processUserMessage (after current line 160):**
```typescript
async function processUserMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  // ★ NEW: poll antes de comprehend
  if (input.sessionId) {  // requires V3AgentInput extension — see below
    const { crmContext, status } = await pollCrmContext(input.sessionId, input.datosCapturados)
    if (status === 'ok' && crmContext) {
      input.datosCapturados['_v3:crm_context'] = crmContext
      input.datosCapturados['_v3:crm_context_status'] = 'ok'
      getCollector()?.recordEvent('pipeline_decision', 'crm_context_used', {
        agent: 'somnio-recompra-v1',
        sessionId: input.sessionId,
        contextLength: crmContext.length,
      })
    } else if (status === 'timeout' || status === 'error' || status === 'empty') {
      getCollector()?.recordEvent('pipeline_decision', 'crm_context_missing_after_wait', {
        agent: 'somnio-recompra-v1',
        sessionId: input.sessionId,
        status,
      })
    }
  }
  // ... resto sin cambios (comprehend, mergeAnalysis, etc.) ...
}
```

**Differences for this phase:**
- Necesita **`V3AgentInput` extension** con `sessionId?: string` (RESEARCH Pitfall 3) — edit paralelo en `somnio-recompra/types.ts:133-147` para agregar campo opcional. `v3-production-runner.ts:105-117` debe pasarlo: `sessionId: session.id` en la construccion del `v3Input`.
- Poll corre SOLO si `input.sessionId` existe (defensivo — sandbox/tests no lo pasan, preservar backward-compat).
- Dynamic import de `SessionManager` para evitar circular deps (patron usado en `agent-production.ts:296` y `v3-production-runner.ts:203`).
- NO emitir eventos si status ya viene en `input.datosCapturados` (fast path — el dispatch ya gano la carrera).

**Referenced by plans covering:** D-13 (500ms x 3s), D-14 (timeout procede), D-16 (`crm_context_used`, `crm_context_missing_after_wait`), Pitfall 3 (re-fetch DB).

---

### `src/lib/agents/somnio-recompra/types.ts` — MODIFY

**Role:** Type extension — agregar `sessionId?: string` a `V3AgentInput`
**Data flow:** type union extension → permite a `processUserMessage` invocar `SessionManager.getState(sessionId)`

**Closest analog (self):**
```typescript
// Source: src/lib/agents/somnio-recompra/types.ts:133-147
export interface V3AgentInput {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  accionesEjecutadas?: AccionRegistrada[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
}
```

**Shape esperado:**
```typescript
export interface V3AgentInput {
  // ...existing...
  workspaceId: string
  systemEvent?: SystemEvent
  /** Optional: session id for poll-DB pattern (Pitfall 3 mitigation) */
  sessionId?: string
}
```

**Differences for this phase:**
- Opcional — preserva backward-compat con callers sandbox/tests.
- Engine pasa desde runner line 105-117 (edit pair).

**Referenced by plans covering:** Pitfall 3, D-13.

---

### `src/lib/agents/engine/v3-production-runner.ts` — MODIFY (small — 1 line)

**Role:** Pass sessionId to V3AgentInput
**Data flow:** `session.id` → `v3Input.sessionId`

**Closest analog (self `:105-117`):**
```typescript
// Source: src/lib/agents/engine/v3-production-runner.ts:105-117
const v3Input: V3AgentInput = {
  message: effectiveMessage,
  history,
  currentMode: session.current_mode,
  intentsVistos,
  templatesEnviados: inputTemplatesEnviados,
  datosCapturados: inputDatosCapturados,
  packSeleccionado: session.state.pack_seleccionado as string | null,
  accionesEjecutadas,
  turnNumber,
  workspaceId: this.config.workspaceId,
  // systemEvent: undefined — only for timers, not user messages
}
```

**Shape esperado:**
```typescript
const v3Input: V3AgentInput = {
  // ...existing...
  workspaceId: this.config.workspaceId,
  sessionId: session.id,   // ★ NEW
}
```

**Differences for this phase:**
- 1 line additive — no riesgo.
- NO TOCAR el bug latente en `:131` (saveState top-level `_v3:agent_module`) — Assumption A6 flaggea como deuda tecnica aparte, fuera de scope (recompra base ya VERIFIED).

**Referenced by plans covering:** Pitfall 3 (poll DB desde agent).

---

### Wave 5 — Scope Doc + Regla 4 Docs

---

### `.claude/rules/agent-scope.md` — MODIFY

**Role:** Agent scope doc — agregar `somnio-recompra-v1` como consumer in-process del reader
**Data flow:** doc → referencia humana + validacion code-review

**Closest analog (self `:27-41`):**
```markdown
### CRM Reader Bot (`crm-reader` — API `/api/v1/crm-bots/reader`)
- **PUEDE (solo lectura):**
  - `contacts_search` / `contacts_get` — buscar y leer contactos (tags, custom fields, archivados via flag)
  - `orders_list` / `orders_get` — listar y leer pedidos con items
  - `pipelines_list` / `stages_list` — listar pipelines y etapas del workspace
  - `tags_list` — listar tags y entidades asociadas
- **NO PUEDE:**
  - Mutar NADA (crear/editar/archivar/eliminar contactos, pedidos, notas, tareas, tags, pipelines, etapas, templates, usuarios)
  - Enviar mensajes de WhatsApp
  - Inventar recursos inexistentes (retorna `not_found_in_workspace`)
  - Acceder a otros workspaces (workspace_id viene del header `x-workspace-id` set por middleware — nunca del body)
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/crm-reader/tools/**` (BLOCKER 1 Phase 44)
  - Todas las queries pasan por domain layer que filtra por `workspace_id` (Regla 3)
  - Agent ID registrado: `'crm-reader'` en `agentRegistry`; observability agentId mismo valor; rate-limit bucket `'crm-bot'` compartido con writer
```

**Shape esperado (adicion al final del bloque §CRM Reader Bot):**
```markdown
- **Consumidores in-process documentados:**
  - `somnio-recompra-v1` (Phase standalone `somnio-recompra-crm-reader`): invoca `processReaderMessage` desde funcion Inngest `recompra-preload-context`. Invoker propagado a logs. Workspace isolation garantizada por `workspaceId` del event payload (validado contra `session_state.workspace_id`). Feature-flagged via `platform_config.somnio_recompra_crm_reader_enabled` (default `false`).
```

**Differences for this phase:**
- D-17 explicit: mencionar acceso in-process (no HTTP), invoker propagado.
- Referencia cruzada al phase standalone que lo introdujo.

**Referenced by plans covering:** D-17 (scope doc).

---

### Docs Regla 4 — `docs/analysis/04-estado-actual-plataforma.md` + `docs/architecture/` — MODIFY (final del phase)

**Role:** Docs update per Regla 4
**Data flow:** docs

**Closest analog:** no existen analogs directos — Regla 4 del proyecto requiere actualizar estos archivos cuando se completa un cambio. Planner debe:
- Agregar seccion en `04-estado-actual-plataforma.md` §Somnio Recompra con nota "integra crm-reader via Inngest async desde Phase standalone somnio-recompra-crm-reader"
- Agregar diagrama en `docs/architecture/` (Mermaid) del flujo async (RESEARCH §System Architecture Diagram ya tiene ASCII — convertir a Mermaid)

**Referenced by plans covering:** Regla 4.

---

## Shared Patterns

### Observability Merge via step.run return (MANDATORY para Wave 2)

**Source:** `src/inngest/functions/agent-production.ts:294-367` + `:466-489`
**Apply to:** `src/inngest/functions/recompra-preload-context.ts`
**Why mandatory:** in-memory collectors NO sobreviven replays de Inngest; cada replay corre en lambda fresca. El patron `__obs` return + `collector.mergeFrom` es el UNICO que funciona (42.1 Plan 07). MEMORY entry "Inngest step.run observability merge pattern" lo canoniza.

```typescript
// The pattern in 3 pieces:
// 1. Inner step.run returns __obs alongside business result
return {
  readerResult: result,
  __obs: stepCollector ? { events, queries, aiCalls } : null,
}
// 2. Outer merges before flush
if (collector && stepResult.__obs) collector.mergeFrom(stepResult.__obs)
// 3. Flush as LAST step.run
await step.run('observability-flush', async () => { await collector.flush() })
```

### `await inngest.send` NEVER fire-and-forget (MANDATORY para Wave 3)

**Source:** `src/lib/whatsapp/webhook-handler.ts:310-336`
**Apply to:** `src/lib/agents/production/webhook-processor.ts` new dispatch block
**Why mandatory:** MEMORY "Vercel serverless + Inngest: NEVER fire-and-forget". Sin await, la lambda muere con el promise en microtask queue y Inngest nunca recibe el evento.

### Merge-safe `datos_capturados` write (MANDATORY para Wave 2)

**Source:** `src/lib/agents/session-manager.ts:402-414` (`updateCapturedData`)
**Apply to:** `src/inngest/functions/recompra-preload-context.ts` (NEVER usar `saveState(id, { datos_capturados: {...} })` — es full replace, Pitfall 2).

```typescript
// WRONG — pisa datos_capturados completo
await adapters.storage.saveState(sessionId, {
  datos_capturados: { '_v3:crm_context': text }
})

// RIGHT — merge via helper
const sm = new SessionManager()
await sm.updateCapturedData(sessionId, {
  '_v3:crm_context': text,
  '_v3:crm_context_status': status,
})
```

### Feature flag via `getPlatformConfig` (MANDATORY Wave 0/2/3)

**Source:** `src/lib/domain/platform-config.ts:96-154`
**Apply to:** webhook-processor (pre-dispatch gate) + recompra-preload-context (defense in depth at function entry).
**Why mandatory:** env vars en Vercel warm-cachean hasta 15min despues de un cambio. Pitfall 6.

```typescript
const enabled = await getPlatformConfig<boolean>(
  'somnio_recompra_crm_reader_enabled',
  false
)
if (!enabled) return { status: 'skipped', reason: 'feature_flag_off' }
```

### Dynamic imports para evitar circular deps + cold start

**Source:** `src/inngest/functions/agent-production.ts:296` (`const { processMessageWithAgent } = await import(...)`) + `src/lib/agents/production/webhook-processor.ts:202-204`
**Apply to:** `recompra-preload-context.ts` (import `processReaderMessage`, `SessionManager`, `getPlatformConfig`), `somnio-recompra-agent.ts` poll helper (import `SessionManager` lazy).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Poll helper inside `somnio-recompra-agent.ts` | timing/backoff | snapshot → DB poll → merge | No existe poll-de-session-state en el codebase. Diseño nuevo basado en `setTimeout` + `SessionManager.getState`. Unico riesgo bajo (primitives bien conocidas). |

---

## Metadata

**Analog search scope:**
- `src/inngest/functions/**/*.ts` (todo el directorio)
- `src/lib/agents/crm-reader/**/*.ts`
- `src/lib/agents/somnio-recompra/**/*.ts`
- `src/lib/agents/production/**/*.ts`
- `src/lib/agents/engine/**/*.ts`
- `src/lib/agents/engine-adapters/**/*.ts`
- `src/lib/agents/session-manager.ts`
- `src/lib/domain/platform-config.ts`
- `src/lib/whatsapp/webhook-handler.ts`
- `src/lib/observability/index.ts`
- `src/app/api/inngest/route.ts`
- `src/inngest/events.ts`
- `src/__tests__/integration/crm-bots/reader.test.ts`
- `.claude/rules/agent-scope.md`

**Files scanned:** 15 files read line-by-line + 8 files via Grep

**Pattern extraction date:** 2026-04-20

**Canonical Rule applied:** Regla 0 (GSD completo), Regla 3 (domain layer via `SessionManager`), Regla 5 (platform_config seed pre-deploy), Regla 6 (feature flag default off)

---

## PATTERN MAPPING COMPLETE
