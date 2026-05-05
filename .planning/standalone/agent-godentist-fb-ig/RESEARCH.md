# Standalone: agent-godentist-fb-ig — Research

**Researched:** 2026-05-05
**Domain:** Multi-agent registration + sibling agent pattern + lead-capture parser + template catalog cloning
**Confidence:** HIGH (95%) — Casi todo es replicación mecánica de patrones ya validados en producción (`somnio-sales-v3-pw-confirmation` shipped 2026-04-28). El único elemento técnicamente nuevo es el lead-capture helper para calcular `campos_faltantes` desde el primer turn — y aún ese reusa `camposFaltantes` ya existente (`state.ts:215`).

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

20 decisiones D-01..D-20 lockeadas en `CONTEXT.md`. Resumen prescriptivo:

| ID | Decisión | Implicación para investigación |
|----|----------|--------------------------------|
| D-01 | `channel in ['facebook', 'instagram']` solamente | El sibling NO atiende WhatsApp; FB Messenger = `channel='facebook'` |
| D-02 | Workspace target: `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` ("GoDentist Valoraciones") | Distinto del workspace original; routing rule scope |
| D-03 | `agent_id='godentist-fb-ig'`, dir `src/lib/agents/godentist-fb-ig/`, standalone `agent-godentist-fb-ig` | Nombres fijos |
| D-04 | El agente `godentist` original queda intacto | Cero modificación de `src/lib/agents/godentist/**`; aditivo |
| D-05 | Saludo nuevo locked verbatim (texto goBot 🤖 + Habeas Data inline) | Único cambio de contenido vs catálogo godentist |
| D-06 | Sin disclaimer adicional ni aceptación explícita | Mandar datos = consentimiento implícito |
| D-07 | Si cliente responde irrelevante post-saludo → reusa lógica `retoma_*` del godentist actual | Reusa transitions existentes; NO añadir lógica nueva |
| D-08 | Catálogo independiente: ~75 INSERTs bajo `agent_id='godentist-fb-ig'` | Cloning completo, único cambio: template `saludo` |
| D-09 | Lead-capture parser turn 1: si Haiku clasifica `intent='datos'` → directo `pedir_datos_parcial` con campos faltantes | Reusa `camposFaltantes(state)` (state.ts:215) + `intent='datos'` ya existente |
| D-10 | Sin nuevo intent `consentimiento_habeas` | 23 intents idénticos a godentist |
| D-11 | Comprehension prompt clonado + 1-2 ejemplos extra de lead capture | Mínima deriva del prompt original |
| D-12 | Modelo Haiku idéntico a godentist | Sin cambio de modelo |
| D-13 | State machine sin cambios; estado inicial `nuevo` | Reusa transitions + state machine de godentist |
| D-14 | Sin feature flag — activación 100% via routing rule | Mismo patrón que `somnio-sales-v3-pw-confirmation` |
| D-15 | Routing rule la crea el usuario manualmente post-deploy | Migración NO inserta regla |
| D-16 | Deploy directo a producción del workspace target | Sin sandbox; routing rule controla blast radius |
| D-17 | Suite de tests automáticos completa (transitions, comprehension, response-track, sales-track, lead-capture E2E, template selection) | Suite separada blindada — `godentist/` original NO tiene `__tests__/` (verificado) |
| D-18 | Validación manual E2E por el usuario en FB página + IG perfil | Sin script automatizado contra Meta APIs |
| D-19 | Project skill `src/lib/agent-specs/godentist-fb-ig.md` + actualizar `.claude/rules/agent-scope.md` | Sigue patrón de `godentist.md` y `somnio-sales-v3.md` |
| D-20 | LEARNINGS documenta el pattern "agente sibling para canal alterno" | Reusable para futuros siblings (somnio-fb-ig, etc) |

### Claude's Discretion

Decisiones derivadas en CONTEXT.md (D-04, D-05, D-09, D-11, D-19, D-20) ya están lockeadas verbatim. Cero gray-area pendiente. Lo único a discreción del implementador es la exactitud sintáctica de los `<action>` blocks del plan-phase.

### Deferred Ideas (OUT OF SCOPE)

- Splitear `godentist-fb-ig` en `godentist-fb` y `godentist-ig` (futuro standalone si comportamientos divergen)
- Sibling con lead capture para WhatsApp
- Template `pedir_sede` dedicado (hoy se usa `pedir_datos_parcial` con `{{campos_faltantes}}`)
- Métricas FB/IG vs WhatsApp (post-deploy comparison)
- Disclaimer Habeas Data con URL de política de privacidad
- Detección `opt_out_habeas` como intent dedicado
- Auto-creación de routing rule via UI wizard
- Dashboard comparativa godentist vs godentist-fb-ig

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GFB-01 | Crear módulo `src/lib/agents/godentist-fb-ig/` con todos los archivos del pipeline v3 derivados de godentist | File Inventory + Architecture Patterns |
| GFB-02 | Registrar agente en `agentRegistry` + `agent-catalog.ts` + `webhook-processor.ts` (cold-lambda pre-import + dispatch branch) + `v3-production-runner.ts` (agentModule branch) | Multi-Agent Registration Pattern |
| GFB-03 | Migración SQL `supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql` clonando ~75 templates con saludo D-05 | Template Catalog Migration |
| GFB-04 | Lead capture turn 1: si comprehension retorna `intent='datos'` → ruta directo a `pedir_datos_parcial` con `{{campos_faltantes}}` | Lead Capture Parser Design |
| GFB-05 | Suite de tests `src/lib/agents/godentist-fb-ig/__tests__/` (mínimo 5 archivos: transitions, comprehension, response-track, sales-track, lead-capture E2E) | Test Strategy |
| GFB-06 | Project skill `src/lib/agent-specs/godentist-fb-ig.md` + sección `### Godentist FB/IG Sibling Agent` en `.claude/rules/agent-scope.md` | Documentación |
| GFB-07 | Aplicar VAL tag side-effect del runner a sibling (extender check `agentModule === 'godentist'` para incluir `'godentist-fb-ig'`) | Architecture Patterns + Common Pitfalls |
| GFB-08 | Pre-warm import del sibling en cold-lambda gate del webhook-processor (línea ~225-232) | Multi-Agent Registration Pattern |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Webhook entry FB/IG inbound | API/Backend (`webhook-processor.ts`) | — | Único entry point para mensajes inbound; ya consume `routerHandledMessage` (línea 218) |
| Agent registration | API/Backend (`agentRegistry` singleton) | — | Self-register on import (`src/lib/agents/godentist-fb-ig/index.ts`) |
| UI dropdown del routing-editor | Frontend (Next.js Server Component) | API/Backend (`agent-catalog.ts`) | El componente `routing/editor/page.tsx` lee `AGENT_CATALOG` para popular el dropdown |
| Routing rule creation | UI (operador en `/agentes/routing/editor`) | DB (`routing_rules` table) | D-15 manual; no se programa |
| Comprehension Haiku call | API/Backend (`comprehension.ts`) | Anthropic API | Reusa client singleton + prompt caching |
| State machine + sales-track | API/Backend (puro, in-memory) | — | Determinista, sin I/O excepto persistencia final |
| Template lookup | API/Backend (`TemplateManager`) | DB (`agent_templates`) | Cache 5min por `agent_id:workspace_id` |
| Catalog migration | DB (Supabase migration) | — | ~75 INSERTs, idempotente |
| Lead-capture parser | API/Backend (puro, helper testeable) | — | Pure function: `(state, gates, intent) → pedir_datos_parcial | passthrough` |
| VAL tag side-effect (post datos críticos) | API/Backend (`v3-production-runner.ts`) | Domain (`tags.assignTag`) | Side-effect del runner, NO del agent (mantiene agent puro) |

---

## Standard Stack

### Core (todas ya en `package.json`, sin instalación nueva)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | strict | Tipado del módulo | Convención del proyecto |
| `@anthropic-ai/sdk` | latest | Comprehension Haiku | Ya usado por `godentist/comprehension.ts:11` |
| `zod` | latest | Schema de comprehension structured output | Reusa `MessageAnalysisSchema` clonado |
| `vitest` | latest | Suite de tests del sibling (D-17) | Framework canonical del proyecto, ya configurado |
| Supabase client (vía `@/lib/domain/*` o admin) | latest | Acceso a `agent_templates` (read-only via TemplateManager) | Regla 3 — NO `createAdminClient` directo en el sibling |

### Supporting (módulos del codebase reusados verbatim)

| Module | Path | Purpose |
|--------|------|---------|
| `TemplateManager` | `src/lib/agents/somnio/template-manager.ts` | Lookup de templates por `agent_id`, cache 5min, ya parametrizado por `agent_id` (cache key `${agentId}:${workspaceId ?? 'global'}` — line 258) |
| `composeBlock` | `src/lib/agents/somnio/block-composer.ts` | Composición de bloques de templates por intent + priority |
| `normalizePhone` | `src/lib/agents/somnio/normalizers.ts` | Normalización celular a formato `573XXXXXXXXX` |
| `getCollector` | `src/lib/observability` | Eventos `pipeline_decision`, `comprehension`, `guard`, `template_selection` |
| `runWithPurpose` | `src/lib/observability` | Wrap del Anthropic call |
| `createInstrumentedAnthropic` | `src/lib/observability/anthropic-instrumented` | Cliente Anthropic con tracing |
| `agentRegistry` | `src/lib/agents/registry.ts` | Singleton para registro de agentes |
| `AGENT_CATALOG` | `src/lib/agents/agent-catalog.ts` | Lista visible en routing-editor dropdown |
| `V3ProductionRunner` | `src/lib/agents/engine/v3-production-runner.ts` | Runner que dispatcha a `processMessage` por `agentModule` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cloning todo `godentist/` | Refactorizar el agente para parametrizar `agent_id` + saludo | D-04 prohíbe modificar godentist; refactor introduce riesgo de regresión sobre agente productivo. Cloning es la opción segura validada por `somnio-sales-v3-pw-confirmation`. |
| Migración SQL con `INSERT...SELECT` desde godentist | Repetir los ~75 INSERTs explícitos | `INSERT...SELECT` con CASE es más DRY pero menos legible y harder a verify por intent. Recomendación: usar `INSERT...SELECT` con CASE para reducir duplicación (ver §Template Catalog Migration). |
| Tests inline mockeando Anthropic SDK | Tests de comprehension contra Haiku real | El patrón en `somnio-pw-confirmation/__tests__/` mockea `TemplateManager.getTemplatesForIntents` pero NO mockea Haiku (no hay comprehension.test.ts en somnio-pw-confirmation). Para D-17 con cobertura de comprehension, se recomienda mockear Anthropic con `vi.mock('@anthropic-ai/sdk')` siguiendo patrón de tests del v3 si existen. |

**Installation:** Cero — todo ya está en `package.json`.

**Version verification:** No aplica — sin nuevas dependencias.

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────┐
│ Cliente envía msg   │
│ desde FB/IG         │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│ webhook-processor.ts                             │
│ ─────────────────────                            │
│ 1. Cold-lambda pre-warm (line 225-232):          │
│    Promise.all([..., import('../godentist-fb-ig')]) │  ← AGREGAR
│                                                  │
│ 2. routerEnabled gate (line 218)                 │
│    routeAgent({contactId, workspaceId,           │
│                conversationId})                  │
│      ↓                                           │
│    facts: { channel: 'facebook'|'instagram',     │
│             ... }                                │
│      ↓                                           │
│    routing_rules engine                          │
│      ↓                                           │
│    routerDecidedAgentId = 'godentist-fb-ig'      │
│                                                  │
│ 3. Dispatch branch (línea ~765 sibling de        │
│    'godentist'):                                 │
│    } else if (agentId === 'godentist-fb-ig') {   │  ← AGREGAR
│      await import('../godentist-fb-ig')          │
│      const runner = new V3ProductionRunner(      │
│        adapters,                                 │
│        { workspaceId,                            │
│          agentModule: 'godentist-fb-ig' })       │
│      ...                                         │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│ V3ProductionRunner.processMessage                │
│ ───────────────────────────────                  │
│ Branch por agentModule (línea 153+):             │
│   if (agentModule === 'godentist') ...           │
│   else if (agentModule === 'godentist-fb-ig') {  │  ← AGREGAR
│     const { processMessage } = await import(     │
│       '../godentist-fb-ig/godentist-fb-ig-agent')│
│     ...                                          │
│   }                                              │
│                                                  │
│ Side-effect VAL tag (line 597):                  │
│   if (agentModule !== 'godentist' &&             │  ← EXTENDER
│       agentModule !== 'godentist-fb-ig') return  │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│ src/lib/agents/godentist-fb-ig/                  │
│ godentist-fb-ig-agent.ts → processMessage()      │
│                                                  │
│ Pipeline (idéntico a godentist):                 │
│   1. deserializeState                            │
│   2. comprehend (Haiku)                          │
│   3. mergeAnalysis + computeGates                │
│   4. checkGuards (R0/R1)                         │
│   5. resolveSalesTrack (con LEAD CAPTURE)        │  ← LÓGICA NUEVA
│   6. checkDentosAvailability (si aplica)         │
│   7. resolveResponseTrack (TEMPLATE_LOOKUP =     │
│      'godentist-fb-ig')                          │
│   8. serializeState + emit observability         │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│ TemplateManager.getTemplatesForIntents           │
│ ('godentist-fb-ig', allIntents, ...)             │
│                                                  │
│ Cache key: 'godentist-fb-ig:f024...' (workspace) │
│   o 'godentist-fb-ig:global' (NULL workspace)    │
│ → DB query: agent_templates WHERE                │
│   agent_id='godentist-fb-ig'                     │
└──────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/lib/agents/godentist-fb-ig/
├── config.ts                       # GODENTIST_FB_IG_AGENT_ID + AgentConfig
├── constants.ts                    # GD_INTENTS clonado + CRITICAL_FIELDS + SEDES
├── types.ts                        # AgentState + V3AgentInput/Output (puede re-exportar de godentist)
├── comprehension-prompt.ts         # buildSystemPrompt CLONADO + 1-2 ejemplos lead-capture
├── comprehension-schema.ts         # MessageAnalysisSchema (clonado verbatim)
├── comprehension.ts                # comprehend() con event 'agent:godentist-fb-ig'
├── state.ts                        # createInitialState, mergeAnalysis, computeGates, camposFaltantes
├── transitions.ts                  # TRANSITIONS[] (clonadas) — sin cambios estructurales
├── sales-track.ts                  # resolveSalesTrack() con HOOK lead-capture turn 1
├── response-track.ts               # resolveResponseTrack() con TEMPLATE_LOOKUP_AGENT_ID = 'godentist-fb-ig'
├── guards.ts                       # checkGuards() (clonado verbatim)
├── phase.ts                        # derivePhase() (clonado verbatim)
├── dentos-availability.ts          # checkDentosAvailability() (clonado verbatim — robot Railway compartido)
├── godentist-fb-ig-agent.ts        # processMessage() entry point — clonado de godentist-agent.ts con agent: 'godentist-fb-ig'
├── lead-capture.ts                 # NUEVO: helper puro testeable (D-09)
├── index.ts                        # Self-registers + re-export processMessage
└── __tests__/
    ├── transitions.test.ts         # State machine tests (10-20 casos)
    ├── comprehension.test.ts       # Haiku mock tests (5-10 casos)
    ├── response-track.test.ts      # Template selection tests (10-15 casos, mock TemplateManager)
    ├── sales-track.test.ts         # Sales action resolution tests (8-12 casos)
    ├── lead-capture.test.ts        # Helper puro (8-15 casos boundary)
    └── godentist-fb-ig-agent.test.ts  # E2E pipeline test (5-8 casos integración)
```

### Pattern 1: Self-Registering Agent Module

**What:** Cada agente se auto-registra en `agentRegistry` al import via side-effect en `index.ts`.

**When to use:** Siempre — es el único patrón válido para agentes en este codebase.

**Example (CLONAR de `src/lib/agents/somnio-pw-confirmation/index.ts:1-29`):**

```typescript
// src/lib/agents/godentist-fb-ig/index.ts
/**
 * GoDentist FB/IG Sibling Agent — Module Entry Point
 *
 * Self-registers in the agent registry on import (side-effect).
 *
 * Imported by:
 * - src/app/(dashboard)/agentes/routing/editor/page.tsx (dropdown population)
 * - src/lib/agents/production/webhook-processor.ts (pre-warm cold lambdas — anti-B-001)
 * - src/lib/agents/engine/v3-production-runner.ts (dynamic import — agentModule branch)
 *
 * Separate agent from godentist — both can coexist (D-04).
 */

import { agentRegistry } from '../registry'
import { godentistFbIgConfig, GODENTIST_FB_IG_AGENT_ID } from './config'

// Self-register on module import
agentRegistry.register(godentistFbIgConfig)

// Re-export public API
export { GODENTIST_FB_IG_AGENT_ID } from './config'
export { processMessage } from './godentist-fb-ig-agent'
export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
```

[VERIFIED: file:line — `src/lib/agents/somnio-pw-confirmation/index.ts:1-29`, `src/lib/agents/godentist/index.ts:1-18`]

### Pattern 2: AgentConfig with Locked ID

**Source:** `src/lib/agents/godentist/config.ts:11` + `src/lib/agents/somnio-pw-confirmation/config.ts:24`.

```typescript
// src/lib/agents/godentist-fb-ig/config.ts
import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig' as const

export const godentistFbIgConfig: AgentConfig = {
  id: GODENTIST_FB_IG_AGENT_ID,
  name: 'GoDentist Valoraciones — FB/IG (Lead Capture)',
  description:
    'Sibling de GoDentist para conversaciones FB Messenger / Instagram Direct. ' +
    'Saludo lead-capture (pide nombre+celular upfront + Habeas Data inline). ' +
    'Resto del pipeline idéntico a godentist (4 sedes + 23 servicios + Dentos availability).',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — godentist-fb-ig uses comprehension.ts directly',
    maxTokens: 512,
  },
  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — godentist-fb-ig uses sales-track.ts + response-track.ts directly',
    maxTokens: 512,
  },

  tools: [ // CLONADO verbatim de godentist
    'crm.contact.create',
    'crm.contact.update',
    'crm.contact.get',
    'whatsapp.message.send', // funciona como genérico para Meta channels también
  ],

  states: [ // CLONADO verbatim — D-13
    'nuevo', 'conversacion', 'captura', 'captura_fecha',
    'mostrando_disponibilidad', 'confirmacion', 'cita_agendada', 'handoff',
  ],
  initialState: 'nuevo',
  validTransitions: { /* clonado verbatim de godentist/config.ts:57-65 */ },

  confidenceThresholds: { proceed: 80, reanalyze: 60, clarify: 40, handoff: 0 },
  tokenBudget: 50_000,
}
```

[VERIFIED: file:line — `src/lib/agents/godentist/config.ts:11-75`]

### Pattern 3: TEMPLATE_LOOKUP_AGENT_ID Constant

**What:** El agente importa su propio ID en `response-track.ts` para pasarlo a `TemplateManager.getTemplatesForIntents`.

**Source:** `src/lib/agents/godentist/response-track.ts:25` (`import { GODENTIST_AGENT_ID } from './config'`) + `:201` (`templateManager.getTemplatesForIntents(GODENTIST_AGENT_ID, ...)`) + `:507`.

**Example for sibling:**

```typescript
// src/lib/agents/godentist-fb-ig/response-track.ts (en el clone)
import { GODENTIST_FB_IG_AGENT_ID } from './config'
// ...
const selectionMap = await templateManager.getTemplatesForIntents(
  GODENTIST_FB_IG_AGENT_ID,  // ← cambio único en el clone
  allIntents,
  intentsVistos,
  state.templatesMostrados,
)
```

**Anti-regresión locked:** Esta constante DEBE ser `'godentist-fb-ig'`, NO `GODENTIST_AGENT_ID`. La regresión `cdc06d9` revertida en somnio-recompra documenta lo que pasa si se comparte: el sibling lee templates del godentist original. Ver Common Pitfalls §1.

### Pattern 4: Dispatch en webhook-processor

**Source:** `src/lib/agents/production/webhook-processor.ts:765-790` (branch godentist).

**Branch nuevo a agregar (después del branch godentist, antes del `else` final):**

```typescript
// src/lib/agents/production/webhook-processor.ts (sibling del branch godentist actual)
} else if (agentId === 'godentist-fb-ig') {
  // GoDentist FB/IG sibling — reuses V3ProductionRunner with godentist-fb-ig processMessage
  await import('../godentist-fb-ig')
  const { V3ProductionRunner } = await import('../engine/v3-production-runner')
  const runner = new V3ProductionRunner(adapters, { workspaceId, agentModule: 'godentist-fb-ig' })

  getCollector()?.setRespondingAgentId('godentist-fb-ig')

  engineOutput = await runner.processMessage({
    sessionId: '',
    conversationId,
    contactId: contactId!,
    message: messageContent,
    workspaceId,
    history: [],
    phoneNumber: phone,
    messageTimestamp: input.messageTimestamp,
  })

  getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', {
    agentId,
    conversationId,
    contactId,
  })
  logger.info({ conversationId, agentId }, 'GoDentist FB/IG sibling processing complete')
}
```

[VERIFIED: file:line — `src/lib/agents/production/webhook-processor.ts:765-790`]

### Pattern 5: V3ProductionRunner agentModule Branch

**Source:** `src/lib/agents/engine/v3-production-runner.ts:153-172` + `src/lib/agents/engine/types.ts:158`.

**Cambios en 2 archivos:**

1. **`src/lib/agents/engine/types.ts:158`** — Extender union:
   ```typescript
   agentModule?: 'somnio-v3' | 'godentist' | 'somnio-recompra' | 'somnio-pw-confirmation' | 'godentist-fb-ig'
   ```

2. **`src/lib/agents/engine/v3-production-runner.ts:153-172`** — Agregar branch:
   ```typescript
   if (this.config.agentModule === 'godentist') {
     const { processMessage } = await import('../godentist/godentist-agent')
     output = await processMessage(v3Input as any) as unknown as V3AgentOutput
   } else if (this.config.agentModule === 'godentist-fb-ig') {  // ← NUEVO
     const { processMessage } = await import('../godentist-fb-ig')
     output = await processMessage(v3Input as any) as unknown as V3AgentOutput
   } else if (this.config.agentModule === 'somnio-recompra') {
     // ...
   }
   ```

[VERIFIED: file:line — `src/lib/agents/engine/v3-production-runner.ts:153-172`, `src/lib/agents/engine/types.ts:158`]

### Pattern 6: Cold-Lambda Pre-Warm (anti-B-001)

**Source:** `src/lib/agents/production/webhook-processor.ts:225-232`.

```typescript
await Promise.all([
  import('../somnio-recompra'),
  import('../somnio-v3'),
  import('../somnio'),
  import('../godentist'),
  import('../somnio-pw-confirmation'),
  import('../somnio-v4'),
  import('../godentist-fb-ig'), // ← AGREGAR (Standalone: agent-godentist-fb-ig)
])
```

**Por qué necesario:** En cold lambdas el módulo del sibling NO está importado todavía cuando `routeAgent` corre (`route.ts:138`). Si una regla emite `agent_id='godentist-fb-ig'` y el módulo no está registrado, el router lanza "unregistered agent_id" → fallback_legacy. Documentado como B-001 en `agent-lifecycle-router` LEARNINGS.

[VERIFIED: file:line — `src/lib/agents/production/webhook-processor.ts:225-232`]

### Pattern 7: Catalog Entry para Routing-Editor Dropdown

**Source:** `src/lib/agents/agent-catalog.ts:19-40`.

**Entry a agregar:**

```typescript
{
  id: 'godentist-fb-ig',
  name: 'GoDentist Valoraciones — FB/IG',
  description: 'Sibling de GoDentist para FB Messenger / Instagram Direct. Saludo lead-capture (nombre+celular upfront + Habeas Data inline).',
},
```

Esto hace que `'godentist-fb-ig'` aparezca como opción en el dropdown del routing-editor, permitiendo al usuario crear la regla de D-15.

[VERIFIED: file:line — `src/lib/agents/agent-catalog.ts:19-40`]

### Anti-Patterns to Avoid

- **NO modificar `src/lib/agents/godentist/**` files** (D-04). El godentist original es producción activa; cualquier cambio que se "filtre" viola Regla 6.
- **NO compartir `TEMPLATE_LOOKUP_AGENT_ID` con godentist.** El sibling DEBE usar `GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig'` en su `response-track.ts`. Ver Common Pitfalls §1 (regresión cdc06d9).
- **NO crear feature flag** (D-14). El routing engine es el control point.
- **NO insertar la routing rule en la migración** (D-15). El usuario la crea manualmente para evitar colisión de priority.
- **NO reescribir `TemplateManager`** — ya está parametrizado por agent_id (cache key `${agentId}:${workspaceId ?? 'global'}` line 258).
- **NO tocar el comprehension prompt fuera de los 2 ejemplos extra de lead capture** (D-11). Cualquier deriva mayor introduce variable confusa para debug.

---

## File Inventory: Clone vs Adapt vs Create

Tabla 1-a-1 que el plan-phase puede traducir directo a tareas atómicas.

| # | Archivo del sibling | Origen | Acción | Cambios concretos |
|---|---------------------|--------|--------|-------------------|
| 1 | `src/lib/agents/godentist-fb-ig/config.ts` | `godentist/config.ts` (75 líneas) | **Adapt** | (a) `GODENTIST_FB_IG_AGENT_ID = 'godentist-fb-ig'` (b) `name`, `description` actualizados (c) Resto verbatim (states, validTransitions, tools, thresholds) |
| 2 | `src/lib/agents/godentist-fb-ig/constants.ts` | `godentist/constants.ts` (258 líneas) | **Clone verbatim** | Cero cambios — `GD_INTENTS`, `INFORMATIONAL_INTENTS`, `ESCAPE_INTENTS`, `CRITICAL_FIELDS`, `SEDES`, `SEDE_ALIASES`, `ACTION_TEMPLATE_MAP`, `SIGNIFICANT_ACTIONS`, `HORARIOS_GENERALES_SEDE`, `FESTIVOS_COLOMBIA_2026`, `isNonWorkingDay`, `GD_TIMER_DURATIONS` — todos idénticos. **Alternativa más DRY:** re-exportar de `'../godentist/constants'` (decisión del plan-phase; el riesgo es que cambios futuros al godentist se filtren al sibling, lo cual viola D-04 implícitamente). **Recomendación:** clonar verbatim para aislamiento completo. |
| 3 | `src/lib/agents/godentist-fb-ig/types.ts` | `godentist/types.ts` (243 líneas) | **Clone verbatim** | Cero cambios. Mismo `AgentState`, `V3AgentInput/Output`, `TipoAccion`, `Phase`. **Alternativa:** re-exportar de godentist (mismo trade-off que constants). **Recomendación:** clonar para aislamiento. |
| 4 | `src/lib/agents/godentist-fb-ig/comprehension-prompt.ts` | `godentist/comprehension-prompt.ts` (152 líneas) | **Adapt (D-11)** | Agregar 1-2 ejemplos al prompt mostrando que el primer turno post-saludo siendo `intent: datos` (ej: "María López, 3001234567" → `primary=datos`, `slots={nombre, telefono}`). NO modificar lista de intents ni schema. Insertarlos en la sección "EJEMPLOS DE CLASIFICACION" (si existe) o al final del system prompt antes del `dataSection`. |
| 5 | `src/lib/agents/godentist-fb-ig/comprehension-schema.ts` | `godentist/comprehension-schema.ts` (78 líneas) | **Clone verbatim** | Cero cambios. `MessageAnalysisSchema` reusa `GD_INTENTS` y `SERVICIOS` (importados de `./constants`). |
| 6 | `src/lib/agents/godentist-fb-ig/comprehension.ts` | `godentist/comprehension.ts` (145 líneas) | **Adapt** | (a) Cambiar `agent: 'godentist'` → `agent: 'godentist-fb-ig'` en línea 93 (`getCollector()?.recordEvent('comprehension', 'result', {...})`) (b) Cambiar `runWithPurpose('godentist_comprehension', ...)` → `runWithPurpose('godentist_fb_ig_comprehension', ...)` línea 68 (c) Resto verbatim. |
| 7 | `src/lib/agents/godentist-fb-ig/state.ts` | `godentist/state.ts` (388 líneas) | **Clone verbatim** | Cero cambios. `mergeAnalysis`, `computeGates`, `camposFaltantes`, `serializeState`, `deserializeState`, `hasAction`, `buildResumenContext`, `createInitialState` — todos idénticos. |
| 8 | `src/lib/agents/godentist-fb-ig/transitions.ts` | `godentist/transitions.ts` (974 líneas) | **Clone verbatim** | Cero cambios estructurales. La lógica del lead-capture vive en `sales-track.ts` (Pattern 8 abajo) — NO en transitions. **Razón:** transitions es declarativa por phase+intent; el lead-capture turn 1 es un pre-procesamiento que dispatcha el accion ANTES de consultar la tabla. |
| 9 | `src/lib/agents/godentist-fb-ig/sales-track.ts` | `godentist/sales-track.ts` (133 líneas) | **Adapt (D-09)** | (a) Cambiar `agent: 'godentist'` → `agent: 'godentist-fb-ig'` en los 3 `recordEvent` calls (líneas 51, 90, 111) (b) **Agregar bloque lead-capture entre líneas 67 y 80** (después del early-return de timer_expired, antes del bloque "Auto-triggers by data changes"). Ver Lead Capture Parser Design §Sales Track Hook. |
| 10 | `src/lib/agents/godentist-fb-ig/response-track.ts` | `godentist/response-track.ts` (628 líneas) | **Adapt** | (a) Cambiar `import { GODENTIST_AGENT_ID } from './config'` → `import { GODENTIST_FB_IG_AGENT_ID } from './config'` línea 25 (b) Cambiar `templateManager.getTemplatesForIntents(GODENTIST_AGENT_ID, ...)` → `getTemplatesForIntents(GODENTIST_FB_IG_AGENT_ID, ...)` líneas 201 y 507 (c) Cambiar `agent: 'godentist'` → `agent: 'godentist-fb-ig'` en los 3 `recordEvent` calls (líneas 182, 277). (d) Resto verbatim. |
| 11 | `src/lib/agents/godentist-fb-ig/guards.ts` | `godentist/guards.ts` (42 líneas) | **Clone verbatim** | Cero cambios. R0/R1 idénticos. |
| 12 | `src/lib/agents/godentist-fb-ig/phase.ts` | `godentist/phase.ts` (33 líneas) | **Clone verbatim** | Cero cambios. `derivePhase` idéntica. |
| 13 | `src/lib/agents/godentist-fb-ig/dentos-availability.ts` | `godentist/dentos-availability.ts` (~80 líneas) | **Clone verbatim** | Cero cambios — robot Railway compartido (mismo workspace `godentist-valoraciones` en el robot, mismas credenciales JROMERO/123456). El robot NO discrimina por agent_id. |
| 14 | `src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts` | `godentist/godentist-agent.ts` (533 líneas) | **Adapt** | (a) Cambiar **TODOS** los `agent: 'godentist'` → `agent: 'godentist-fb-ig'` en `getCollector()?.recordEvent` (mínimo 9 ocurrencias en ~líneas 75, 197, 240, 247, 303, 320, 347, 372, 403) (b) Cambiar `console.error('[GoDentist] Error processing message:', errMsg)` → `'[GoDentist FB/IG]'` línea 501 (c) Re-export `processMessage` desde `index.ts`. |
| 15 | `src/lib/agents/godentist-fb-ig/lead-capture.ts` | **NEW** | **Create** | Helper puro testeable. Ver §Lead Capture Parser Design. ~30 LOC. |
| 16 | `src/lib/agents/godentist-fb-ig/index.ts` | `godentist/index.ts` (18 líneas) | **Adapt** | Mismo patrón Pattern 1 — registra config + re-exporta `processMessage` y `GODENTIST_FB_IG_AGENT_ID`. |
| 17 | `src/lib/agents/agent-catalog.ts` | (existente) | **Edit (extender array)** | Agregar entry Pattern 7. |
| 18 | `src/lib/agents/production/webhook-processor.ts` | (existente) | **Edit (2 sitios)** | (a) Línea 225-232 — agregar `import('../godentist-fb-ig')` al `Promise.all` (Pattern 6). (b) Línea ~790 — agregar branch `else if (agentId === 'godentist-fb-ig')` (Pattern 4). |
| 19 | `src/lib/agents/engine/types.ts` | (existente) | **Edit (extender union)** | Línea 158 — extender `agentModule?` union para incluir `'godentist-fb-ig'` (Pattern 5). |
| 20 | `src/lib/agents/engine/v3-production-runner.ts` | (existente) | **Edit (2 sitios)** | (a) Línea 153-172 — agregar branch `agentModule === 'godentist-fb-ig'` (Pattern 5). (b) Línea 597 — extender check VAL tag (`if (agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig') return`) — ver Common Pitfalls §6. |
| 21 | `supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql` | `20260318100000_godentist_templates.sql` (351 líneas) + `20260427210000_pw_confirmation_template_catalog.sql` (517 líneas) | **Create (vía INSERT...SELECT)** | Ver §Template Catalog Migration. ~50-80 LOC con `INSERT...SELECT` + CASE para saludo. |
| 22 | `src/lib/agent-specs/godentist-fb-ig.md` | `src/lib/agent-specs/godentist.md` (252 líneas) | **Adapt** | Clonar estructura completa, actualizar Agent ID, scope PUEDE/NO PUEDE, integraciones (FB/IG channel + lead capture), y agregar referencia al pattern del fact `channel`. |
| 23 | `.claude/rules/agent-scope.md` | (existente) | **Edit (agregar sección)** | Agregar `### Godentist FB/IG Sibling Agent (godentist-fb-ig — webhook FB/IG inbound)` después de la sección de godentist (que NO existe explícitamente — agregar primero spec del godentist sería buena oportunidad pero está fuera de scope). Sigue el patrón de `### Somnio Sales v3 PW-Confirmation Agent` (líneas extensas con PUEDE/NO PUEDE/Validacion/Consumidores). |
| 24 | `src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts` | `src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts` (309 líneas) | **Adapt** | Patrón fixtures + first-match wins + fixtures inline. Ver §Test Strategy. |
| 25 | `src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts` | **NEW** | **Create** | No existe en somnio-pw-confirmation. Mock Anthropic via `vi.mock('@anthropic-ai/sdk')`. Ver §Test Strategy. |
| 26 | `src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts` | `src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts` (321 líneas) | **Adapt** | Mock TemplateManager via `vi.hoisted()` + `vi.mock('@/lib/agents/somnio/template-manager')`. Validar que `agent_id='godentist-fb-ig'` se pasa al lookup (anti-regresión D-08). |
| 27 | `src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts` | `src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts` (260 líneas) | **Adapt** | Cubre lead-capture turn 1 con state.turnCount=1 + intent='datos' → expected accion='pedir_datos_parcial'. |
| 28 | `src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts` | **NEW** | **Create** | Helper puro: 8-15 casos boundary (todos los datos / parciales / ninguno / turn>1 ignorado). |
| 29 | `src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts` | **NEW** | **Create** | E2E pipeline integration test — recibe mensaje, mock Anthropic+TemplateManager, valida output. 5-8 casos. |

**Tamaño estimado del work:**
- ~14 archivos nuevos en `src/lib/agents/godentist-fb-ig/` (incluyendo `__tests__/`)
- 4 archivos editados (`agent-catalog.ts`, `webhook-processor.ts` x2 sitios, `engine/types.ts`, `engine/v3-production-runner.ts` x2 sitios)
- 1 archivo SQL nuevo (`supabase/migrations/<timestamp>_godentist_fb_ig_template_catalog.sql`)
- 2 archivos de documentación nuevos/editados (`agent-specs/godentist-fb-ig.md`, `.claude/rules/agent-scope.md`)
- ~3000-4000 líneas de código nuevo (mayoría es clone verbatim de godentist + tests adaptados de somnio-pw-confirmation)

---

## Multi-Agent Registration Pattern

Los **5 sitios** donde el agente se registra (paso a paso, en orden recomendado):

### Sitio 1: AgentRegistry (self-register on import)

**Archivo:** `src/lib/agents/godentist-fb-ig/index.ts` (NUEVO)

**Acción:** Pattern 1 (arriba). Side-effect import.

**Verificación:** `grep -n "agentRegistry.register" src/lib/agents/godentist-fb-ig/index.ts` retorna 1 match.

### Sitio 2: AGENT_CATALOG (UI dropdown del routing-editor)

**Archivo:** `src/lib/agents/agent-catalog.ts:19-40`

**Acción:** Pattern 7. Agregar entry al array.

**Verificación:** `grep -n "godentist-fb-ig" src/lib/agents/agent-catalog.ts` retorna 1 match (`id: 'godentist-fb-ig'`).

**Side-effect:** El operador ve `'GoDentist Valoraciones — FB/IG'` en el dropdown del routing-editor (`/agentes/routing/editor`) sin necesidad de tocar el componente UI (es Server Component que lee `AGENT_CATALOG`).

**Note re sibling family logic:** `agent-catalog.ts:50-61` tiene helper `getAgentsForWorkspace` que filtra por sibling-family (`somnio-sales-vN`). El sibling `godentist-fb-ig` NO matchea el regex `^(.+)-v\d+$` porque no tiene `vN` suffix — caerá al match exacto. Si el workspace `godentist-valoraciones` tiene `conversational_agent_id='godentist'`, el dropdown del sandbox solo mostrará godentist (no FB/IG). Para que ambos aparezcan en el dropdown del **sandbox**, hay 2 opciones:
- Opción A (recomendada): el dropdown del **routing-editor** (que es un componente distinto al sandbox) llama directo a `AGENT_CATALOG` sin filtro family — verificar que esto sea el caso. Si lo es, el sibling aparece en routing-editor sin más cambios.
- Opción B: Si fuera necesario, extender `getAgentsForWorkspace` para reconocer `'godentist-fb-ig'` como sibling de `'godentist'` (misma family base). **Diferir si A funciona.**

**[ASSUMED]** routing-editor consume `AGENT_CATALOG` directo — verificar en plan-phase leyendo el componente. Si usa `getAgentsForWorkspace`, ajustar.

### Sitio 3: webhook-processor cold-lambda pre-warm

**Archivo:** `src/lib/agents/production/webhook-processor.ts:225-232`

**Acción:** Pattern 6. Agregar `import('../godentist-fb-ig')` al `Promise.all`.

**Verificación:** `grep -n "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts` retorna mínimo 2 matches (uno en pre-warm, uno en dispatch branch).

### Sitio 4: webhook-processor dispatch branch

**Archivo:** `src/lib/agents/production/webhook-processor.ts:765-790` (sibling del branch godentist actual)

**Acción:** Pattern 4. Agregar `else if (agentId === 'godentist-fb-ig')` después del branch godentist y antes del else final (V1 path).

**Verificación:** `grep -n "agentId === 'godentist-fb-ig'" src/lib/agents/production/webhook-processor.ts` retorna 1 match.

### Sitio 5: V3ProductionRunner agentModule branch

**Archivo:** `src/lib/agents/engine/v3-production-runner.ts:153-172` + `src/lib/agents/engine/types.ts:158`

**Acción:** Pattern 5. Extender union + agregar branch.

**Verificación:**
- `grep -n "godentist-fb-ig" src/lib/agents/engine/types.ts` retorna 1 match (línea 158).
- `grep -n "godentist-fb-ig" src/lib/agents/engine/v3-production-runner.ts` retorna mínimo 3 matches (branch + VAL tag check x2).

### Sitio 6 (extra-side-effect): VAL tag side-effect

**Archivo:** `src/lib/agents/engine/v3-production-runner.ts:597`

**Acción:** Extender check para incluir el sibling:

```typescript
// Línea 597 actualmente:
if (this.config.agentModule !== 'godentist') return

// Cambiar a:
if (this.config.agentModule !== 'godentist' && this.config.agentModule !== 'godentist-fb-ig') return
```

**Por qué necesario:** `applyGodentistValTagIfNeeded` (líneas 564-639) asigna tag 'VAL' al contacto cuando se completan los `CRITICAL_FIELDS` por primera vez en la sesión — esto alimenta el sistema de métricas standalone "Conversation Tags to Contact" que cuenta valoraciones agendadas/día. Si el sibling NO se incluye, los leads capturados via FB/IG NO se contarán en métricas de valoraciones, lo cual viola el contract documentado en `agent-specs/godentist.md:170` ("PUEDE: Capturar datos críticos: nombre, telefono, sede_preferida"). Ver Common Pitfalls §6.

[VERIFIED: file:line — `src/lib/agents/engine/v3-production-runner.ts:564-639`]

---

## Template Catalog Migration

### Estructura recomendada — `INSERT...SELECT` con `CASE`

**Patrón locked en CONTEXT.md D-08:**

```sql
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
SELECT
  gen_random_uuid(),
  'godentist-fb-ig',
  workspace_id,
  intent,
  visit_type,
  priority,
  orden,
  content_type,
  CASE
    WHEN intent = 'saludo' AND priority = 'CORE' THEN
      E'\U0001F44B ¡Hola! Soy goBot \U0001F916 de godentist ®️.\n\nTu valoración odontológica es totalmente GRATIS \U0001F9B7✨\nDéjanos estos datos y reservamos tu cita de inmediato:\n\n\U0001F4CC Nombre completo\n\U0001F4CC Celular\n\n\U0001F512 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).\n\nEstás a un paso de comenzar tu nueva sonrisa \U0001F499 ¿Deseas agendar tu cita de valoración GRATIS?'
    ELSE content
  END,
  delay_s
FROM agent_templates
WHERE agent_id = 'godentist'
  AND workspace_id IS NULL;  -- Catalogo global solamente
```

### Migración completa idempotente

```sql
-- ============================================================================
-- GoDentist FB/IG Sibling — Template Catalog Migration
-- Standalone: agent-godentist-fb-ig
--
-- Clones ALL ~75 templates from agent_id='godentist' to agent_id='godentist-fb-ig'.
-- Single content change: template `saludo`/CORE uses lead-capture text per D-05.
-- All other templates verbatim (precios, ubicaciones, horarios, escape, follow-ups,
-- english_response, etc.) per D-08.
--
-- Workspace: NULL (catalog global; el sibling solo se activa en workspace
-- 'GoDentist Valoraciones' f0241182-... pero el catalog es global accesible via
-- workspace-aware TemplateManager).
--
-- Idempotency: DELETE existing rows for agent_id='godentist-fb-ig' before INSERT.
-- Safe to re-run.
--
-- Rollback: DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig';
--
-- Regla 5: Apply MANUALLY in production BEFORE pushing code that references
-- these templates. Plan-phase Plan T should be SQL apply, Plan T+1 should be code push.
-- ============================================================================

BEGIN;

-- Idempotent: clean slate
DELETE FROM agent_templates WHERE agent_id = 'godentist-fb-ig';

-- Clone all templates from godentist with single content swap for saludo CORE
INSERT INTO agent_templates (
  id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
)
SELECT
  gen_random_uuid(),
  'godentist-fb-ig',
  workspace_id,
  intent,
  visit_type,
  priority,
  orden,
  content_type,
  CASE
    WHEN intent = 'saludo' AND priority = 'CORE' THEN
      -- D-05 locked verbatim
      E'\U0001F44B ¡Hola! Soy goBot \U0001F916 de godentist ®️.\n\nTu valoración odontológica es totalmente GRATIS \U0001F9B7✨\nDéjanos estos datos y reservamos tu cita de inmediato:\n\n\U0001F4CC Nombre completo\n\U0001F4CC Celular\n\n\U0001F512 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).\n\nEstás a un paso de comenzar tu nueva sonrisa \U0001F499 ¿Deseas agendar tu cita de valoración GRATIS?'
    ELSE content
  END,
  delay_s
FROM agent_templates
WHERE agent_id = 'godentist'
  AND workspace_id IS NULL;

-- Sanity check: row count post-INSERT must match godentist row count
DO $$
DECLARE
  godentist_count INTEGER;
  sibling_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO godentist_count FROM agent_templates WHERE agent_id = 'godentist' AND workspace_id IS NULL;
  SELECT COUNT(*) INTO sibling_count FROM agent_templates WHERE agent_id = 'godentist-fb-ig';
  IF sibling_count != godentist_count THEN
    RAISE EXCEPTION 'Row count mismatch: godentist=% sibling=% (expected equal)', godentist_count, sibling_count;
  END IF;
  RAISE NOTICE 'Migration OK: % rows cloned from godentist to godentist-fb-ig', sibling_count;
END $$;

COMMIT;
```

**Ventajas vs explicit ~75 INSERTs:**
- ~50 LOC vs ~300 LOC
- Auto-sincronizado con godentist (si añaden un template, se replica al re-run)
- Single source of truth para el contenido (godentist)
- Sanity check automatizado (row count match)

**Trade-offs:**
- Si en el futuro un intent NO debe replicarse (ej: un template `saludo_promocional` específico de WhatsApp), se necesita un `WHERE intent NOT IN (...)` adicional. Para hoy no aplica (D-08 dice ALL templates clonados).
- Si en el futuro se quiere customizar otro template del sibling sin tocar godentist, hay que extender el `CASE` o hacer una migración suplementaria. Para hoy no aplica.

**Naming:** Timestamp recomendado: `20260505100000_godentist_fb_ig_template_catalog.sql` (ajustar al día efectivo del plan-phase). Convención del codebase: `YYYYMMDDHHMMSS_descriptive_name.sql`. La migración más reciente al momento de research es `20260501100400_somnio_v4_match_knowledge_base_rpc.sql`.

**Recovery:** Si la migración falla mid-way (improbable porque todo está en `BEGIN; ... COMMIT;`), Postgres rollback automático. Re-run safe gracias a `DELETE` initial.

**Regla 5 obligatoria:** El plan-phase DEBE incluir un task que (a) corra el SQL en producción, (b) PAUSE esperando confirmación del usuario, (c) DESPUÉS push del código. Ver patrón de `somnio-sales-v3-pw-confirmation` 13-DEPLOY-NOTES.md líneas 7-19.

---

## Lead Capture Parser Design

### Helper puro testeable — `lead-capture.ts`

**Archivo:** `src/lib/agents/godentist-fb-ig/lead-capture.ts` (NUEVO, ~30 LOC)

**Signature:**

```typescript
import type { AgentState, Gates } from './types'
import { camposFaltantes } from './state'
import type { TipoAccion, TimerSignal } from './types'

/**
 * Lead capture decision for first-turn FB/IG conversations.
 *
 * D-09: when the customer's first response (turn 1) contains personal data
 * (intent='datos' classified by Haiku), bypass the normal transition table
 * and route directly to `pedir_datos_parcial` with `{{campos_faltantes}}`
 * computed from the current state.
 *
 * Returns null when lead-capture should NOT trigger (subsequent turns,
 * non-data intents, or when datos críticos already complete — let normal
 * sales-track handle pedir_fecha).
 *
 * Pure function — no I/O, no side effects, fully testable.
 */
export interface LeadCaptureDecision {
  accion: TipoAccion
  timerSignal?: TimerSignal
  reason: string
}

export function resolveLeadCapture(input: {
  turnCount: number
  intent: string
  state: AgentState
  gates: Gates
}): LeadCaptureDecision | null {
  const { turnCount, intent, state, gates } = input

  // Lead capture solo dispara en turn 1 (primer mensaje del cliente post-saludo).
  // turnCount se incrementa en mergeAnalysis ANTES de llamar resolveSalesTrack,
  // así que turn 1 = state.turnCount === 1 después del merge.
  if (turnCount !== 1) return null

  // Solo si Haiku clasifica como 'datos' (cliente envió info personal)
  if (intent !== 'datos') return null

  // Si datos críticos completos + fecha falta → dejar que sales-track normal
  // dispare pedir_fecha (no pedir_datos_parcial con [] vacío).
  if (gates.datosCriticos && !gates.fechaElegida) return null

  // Si datos críticos completos + fecha → mostrar_disponibilidad (sales-track normal)
  if (gates.datosCriticos && gates.fechaElegida) return null

  // Si datos críticos NO completos → pedir_datos_parcial con campos faltantes.
  // camposFaltantes(state) ya retorna ['nombre', 'cedula', 'telefono', 'sede_preferida']
  // o subset según lo que falte (state.ts:215).
  const faltantes = camposFaltantes(state)
  if (faltantes.length === 0) return null  // edge case: nada que pedir

  return {
    accion: 'pedir_datos_parcial',
    timerSignal: { type: 'start', level: 'L1', reason: `lead capture turn 1: ${faltantes.length} campos faltantes` },
    reason: `Lead capture FB/IG: cliente envió datos parciales en turn 1, faltan ${faltantes.join(', ')}`,
  }
}
```

### Sales-track hook

En `src/lib/agents/godentist-fb-ig/sales-track.ts`, agregar bloque entre líneas 67 y 80 (después del early-return de `timer_expired`, antes del bloque "Auto-triggers by data changes"):

```typescript
// ------------------------------------------------------------------
// 1.5 LEAD CAPTURE turn 1 (D-09 godentist-fb-ig sibling)
// Antes de auto-triggers y tabla de transitions, verificar si este
// es el primer turno post-saludo con datos parciales del cliente.
// ------------------------------------------------------------------
const leadCaptureDecision = resolveLeadCapture({
  turnCount: state.turnCount,
  intent,
  state,
  gates,
})
if (leadCaptureDecision) {
  getCollector()?.recordEvent('pipeline_decision', 'lead_capture_triggered', {
    agent: 'godentist-fb-ig',
    intent,
    accion: leadCaptureDecision.accion,
    reason: leadCaptureDecision.reason,
    camposFaltantes: camposFaltantes(state),
  })
  return {
    accion: leadCaptureDecision.accion,
    timerSignal: leadCaptureDecision.timerSignal,
    reason: leadCaptureDecision.reason,
  }
}
```

**Por qué hook en sales-track y no en transitions.ts:**
- Transitions es declarativa por `(phase, intent) → action + condition`. La lógica de "es turn 1 + datos parciales + bypass tabla" es imperativa pre-procesamiento, NO una transition más.
- Mantiene transitions.ts verbatim clonado de godentist (cero deriva).
- El helper es un módulo separado puro y testeable independientemente.

**Cómo se conecta con `pedir_datos_parcial`:**
- `pedir_datos_parcial` ya existe en godentist (action en `ACTION_TEMPLATE_MAP` `constants.ts:136`, manejado en `response-track.ts:334-341`).
- Cuando `resolveResponseTrack` recibe `salesAction='pedir_datos_parcial'`, llama a `camposFaltantes(state)` y construye `extraContext: { campos_faltantes: labels.map(l => '- ' + l).join('\n') }` (líneas 334-341 de godentist response-track).
- El template `pedir_datos_parcial` interpola `{{campos_faltantes}}` con la lista calculada.

**Verificación de helpers ya existentes (resultados de la investigación):**
- ✅ `camposFaltantes(state)` existe — `src/lib/agents/godentist/state.ts:215` (líneas 215-231). Retorna lista de campos críticos faltantes; ya cubre `['nombre', 'cedula', 'telefono', 'sede_preferida']` con auto-include de `fecha_preferida` si todos los demás están completos.
- ✅ `intent='datos'` existe en GD_INTENTS (constants.ts:28).
- ✅ Comprehension Haiku ya extrae `nombre`, `telefono`, `sede_preferida` directamente al `slots.extracted_fields` payload (comprehension-schema.ts:31-57). NO requiere ajustes al schema (D-11).
- ✅ `mergeAnalysis` (state.ts:59) merge-safe: nunca sobrescribe non-null con null; auto-incrementa `turnCount` (línea 161).

**Fail-safes:**
- Si `intent !== 'datos'` (cliente preguntó algo informacional) → helper retorna null → sales-track normal toma el control → transitions.ts dispatcha al template informacional + invitación al tiempo (D-07 satisfecho).
- Si `turnCount !== 1` (turn 2+) → helper retorna null → flujo normal.
- Si `datosCriticos` ya completos → helper retorna null → sales-track normal va a `pedir_fecha`.

---

## Test Strategy

### Marco general

- **Framework:** Vitest (ya configurado en `package.json` y `vitest.config.ts`).
- **Patrón mock:** `vi.hoisted()` + `vi.mock()` (validado por `somnio-pw-confirmation/__tests__/response-track.test.ts:24-49`).
- **Test runner:** `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/`
- **Cobertura mínima D-17:** state machine, comprehension classification, template selection, sales action resolution, lead-capture parser, E2E pipeline integration, anti-regresión D-08 template_lookup_agent_id.

### Archivos a crear (6 totales)

| File | LOC est. | Casos est. | Mock pattern | Cubre |
|------|---------|-----------|--------------|-------|
| `transitions.test.ts` | 250-350 | 12-20 | Sin mocks (pura) | Estado machine: `nuevo` + `intent=datos` + datos parciales → action; `nuevo` + `intent=quiero_agendar` + sin datos → `pedir_datos`; etc. Usar fixtures `createPreloadedState`. |
| `comprehension.test.ts` | 200-300 | 6-10 | `vi.mock('@anthropic-ai/sdk')` | Validar que un mensaje "Juan Pérez, 3001234567" parsea a `intent.primary='datos'`, `slots.nombre='Juan Pérez'`, `slots.telefono='573001234567'` (post-normalize). Validar fallback en `intent.primary=otro` cuando Haiku retorna intent inválido (líneas 122-132 de comprehension.ts). |
| `response-track.test.ts` | 250-350 | 10-15 | `vi.mock('@/lib/agents/somnio/template-manager')` | (a) **Anti-regresión D-08:** verificar que `templateManager.getTemplatesForIntents` se llama con `'godentist-fb-ig'` (NO `'godentist'`). (b) `pedir_datos_parcial` con `state.datos.nombre='Juan'` (faltan telefono+sede) → `extraContext.campos_faltantes` incluye `'- Celular'` y `'- Sede de tu preferencia: ...'`. (c) saludo se renderiza en turn 0. (d) Inglés → `english_response`. |
| `sales-track.test.ts` | 200-300 | 8-12 | Sin mocks | (a) `turnCount=1 + intent=datos + sin datos críticos` → `accion='pedir_datos_parcial'` (lead capture path). (b) `turnCount=1 + intent=datos + datos críticos OK + sin fecha` → `accion=undefined` (delegado a transitions normal que va a `pedir_fecha`). (c) `turnCount=2 + intent=datos` → flujo normal sin lead capture. (d) `intent=quiero_agendar` → `pedir_datos`. |
| `lead-capture.test.ts` | 150-200 | 8-15 | Sin mocks (pura) | Boundaries: turnCount 0/1/2/5; intent datos/saludo/quiero_agendar/otro; gates con/sin datosCriticos; campos faltantes [] vs [nombre] vs [todos]. Cada boundary devuelve null o decision esperada. |
| `godentist-fb-ig-agent.test.ts` | 200-300 | 5-8 | `vi.mock('./comprehension')` + `vi.mock('@/lib/agents/somnio/template-manager')` | E2E pipeline: input mensaje "Juan Pérez, 3001234567" → mock Haiku retorna `intent=datos, slots`, mock TemplateManager retorna template `pedir_datos_parcial` → output incluye texto con `{{campos_faltantes}}` interpolado correctamente. |

### Patterns de mock (clonar de somnio-pw-confirmation)

**Mock TemplateManager (clonar de `response-track.test.ts:24-49`):**

```typescript
const {
  getTemplatesForIntentsMock,
  processTemplatesMock,
} = vi.hoisted(() => ({
  getTemplatesForIntentsMock: vi.fn(),
  processTemplatesMock: vi.fn(),
}))

vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: getTemplatesForIntentsMock,
    processTemplates: processTemplatesMock,
  })),
}))
```

**Mock Anthropic SDK (sugerencia para comprehension.test.ts):**

```typescript
const messagesCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: messagesCreateMock },
  })),
}))

// En cada test:
messagesCreateMock.mockResolvedValue({
  content: [{ type: 'text', text: JSON.stringify({
    intent: { primary: 'datos', secondary: 'ninguno', confidence: 95, reasoning: 'cliente envió nombre + telefono' },
    extracted_fields: { nombre: 'Juan Pérez', telefono: '573001234567', sede_preferida: null, ... },
    classification: { category: 'datos', sentiment: 'neutro', idioma: 'es' },
  })}],
  usage: { input_tokens: 100, output_tokens: 50 },
})
```

### Anti-regresión obligatorio (D-08)

Cada test que invoca `resolveResponseTrack` o `loadSingleTemplate` DEBE assertear:

```typescript
expect(getTemplatesForIntentsMock).toHaveBeenCalledWith(
  'godentist-fb-ig',  // ← NO 'godentist' — D-08 anti-regresión
  expect.any(Array),
  expect.any(Array),
  expect.any(Array),
)
```

Esto blinda contra el bug del commit `cdc06d9` revertido en somnio-recompra (Common Pitfalls §1).

### Cobertura mínima por test file

- `transitions.test.ts`: ≥80% de las branches del switch en `resolveTransition`. Casos boundary obligatorios: `nuevo + datos parciales`, `nuevo + datos críticos`, `nuevo + intent=otro + low confidence` (R0 guard).
- `comprehension.test.ts`: 1 caso por intent crítico (`datos`, `quiero_agendar`, `precio_servicio`, `saludo`, `otro` low-conf). Validar que `parseAnalysis` recovery (líneas 122-132) funciona con intent fuera de enum.
- `response-track.test.ts`: 1 caso por sales action principal (`pedir_datos`, `pedir_datos_parcial`, `pedir_fecha`, `mostrar_disponibilidad`, `mostrar_confirmacion`, `agendar_cita`). 1 caso para inglés. 1 caso para saludo combinado (turn 0 + intent=otro).
- `sales-track.test.ts`: 1 caso por path crítico — lead capture activado, lead capture no activado por gates, timer_expired path.
- `lead-capture.test.ts`: matrix de boundaries (3 turns x 4 intents x 4 estados de gates).
- `godentist-fb-ig-agent.test.ts`: happy path turn 1 lead capture, happy path turn 0 saludo, English short-circuit, error path (Haiku fail).

### Comando de validación pre-push

```bash
npx vitest run src/lib/agents/godentist-fb-ig/__tests__/
npx tsc --noEmit
```

Esperado: 6 suites, 50-80 tests passed (rango basado en somnio-pw-confirmation que tiene 65 tests en 5 suites).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template selection by intent | Custom selector con switch sobre intent | `TemplateManager.getTemplatesForIntents(agent_id, intents, intentsVistos, sent)` (`src/lib/agents/somnio/template-manager.ts:229`) | Ya parametrizado por agent_id (cache key incluye agent_id), maneja `visit_type='primera_vez'`, filtra ya enviados, sort by orden, processTemplates substitución |
| Block composition (CORE+COMP+OPC priorización) | Lógica custom de sort + merge | `composeBlock(byIntent, [], maxLength)` (`src/lib/agents/somnio/block-composer.ts`) | Ya implementa priority-aware composition con max length |
| Phone normalization | Regex custom de teléfonos | `normalizePhone(phoneStr)` (`src/lib/agents/somnio/normalizers.ts`) | Maneja formato 10 dígitos → 573XXXXXXXXX, ya validado en producción |
| Comprehension Haiku call | Direct Anthropic API call | `comprehend(message, history, existingData, recentBotMessages)` (`godentist/comprehension.ts:52`) — clonar y adaptar agent name | Ya tiene client singleton, prompt caching ephemeral, sanitization fallback, observability event |
| State serialization | Custom serializer JSON | `serializeState(state)` + `deserializeState(...)` (`godentist/state.ts:291, 318`) | Ya maneja `_gd:` metadata prefix, AccionRegistrada legacy formats, fecha_vaga mutual exclusion |
| Critical fields gate | Custom check | `computeGates(state)` (`godentist/state.ts:185`) | Ya retorna `{datosCriticos, fechaElegida, horarioElegido, datosCompletos}` |
| Missing fields list | Custom list builder | `camposFaltantes(state)` (`godentist/state.ts:215`) | Ya retorna lista priorizada incluyendo `fecha_preferida` cuando aplica |
| Phase derivation | Custom switch sobre últimas acciones | `derivePhase(accionesEjecutadas)` (`godentist/phase.ts:15`) | Ya scanea de reciente a antiguo y mapea a `Phase` enum |
| Guards (low confidence + escape intents) | Custom if/else | `checkGuards(analysis)` (`godentist/guards.ts:12`) | Ya retorna `{blocked: true, decision}` o `{blocked: false}` con timerSignal correcto |
| Robot Railway availability lookup | New HTTP client | `checkDentosAvailability(date, sede)` (`godentist/dentos-availability.ts`) | Ya tiene URL/credenciales/SEDE_TO_SUCURSAL mapping; el robot NO discrimina por agent_id, sirve a ambos |
| Observability events | Custom logging | `getCollector()?.recordEvent(category, label, data)` | Ya integrado con OpenTelemetry + Datadog, persiste en `agent_observability_events` |
| AgentRegistry self-register | Custom singleton | `agentRegistry.register(config)` from `src/lib/agents/registry.ts:33` | Ya valida required fields, maneja overwrite, expone `get/has/list/listIds` |
| Routing rule fact `channel` | Custom fact resolver | `engine.addFact('channel', ...)` already shipped (`routing/facts.ts:262`) | Standalone routing-channel-fact (2026-05-04) ya proveyó la primitiva; reutilizar tal cual |

**Key insight:** El sibling es un acto de **composición disciplinada**, no de ingeniería nueva. El 95% del trabajo es clone + agent_id swap. El 5% nuevo (lead-capture parser) tiene exactamente 30 líneas y reusa `camposFaltantes` ya existente.

---

## Common Pitfalls

### Pitfall 1: Catálogo compartido entre siblings (regresión cdc06d9 — CRÍTICA)

**What goes wrong:** Si el `response-track.ts` del sibling importa `GODENTIST_AGENT_ID` (en vez de `GODENTIST_FB_IG_AGENT_ID`) y lo pasa a `templateManager.getTemplatesForIntents`, el sibling lee templates del catálogo de godentist en vez del suyo. El nuevo saludo lead-capture nunca se rinderiza — el cliente FB/IG ve el saludo viejo conversacional del godentist.

**Why it happens:** Copy-paste rápido del godentist sin renombrar la constante en TODOS los call sites de `response-track.ts` (líneas 25, 201, 507).

**How to avoid:**
- Tests de response-track DEBEN assertear `expect(getTemplatesForIntentsMock).toHaveBeenCalledWith('godentist-fb-ig', ...)` (ver Test Strategy §Anti-regresión).
- Grep CI: `grep -n "GODENTIST_AGENT_ID" src/lib/agents/godentist-fb-ig/` retorna 0 matches (solo aparece `GODENTIST_FB_IG_AGENT_ID`).
- Plan-phase debe incluir un task explícito de verification: `grep -n "getTemplatesForIntents" src/lib/agents/godentist-fb-ig/response-track.ts` y validar que cada call usa `GODENTIST_FB_IG_AGENT_ID`.

**Warning signs:** Cliente reporta que el saludo no es el nuevo. `agent_observability_events` muestra `template_selection.block_composed` con `templateId` perteneciente al catálogo godentist (el ID del UUID coincide con godentist row).

**Source:** Documentado en `.claude/rules/agent-scope.md` ("regresión `cdc06d9` revertido en somnio-recompra-v1") + CONTEXT.md D-08.

### Pitfall 2: Cold-lambda race (B-001)

**What goes wrong:** Si el sibling NO se agrega al `Promise.all` de pre-warm en `webhook-processor.ts:225-232`, en cold lambdas el módulo no está importado cuando `routeAgent` corre. El router emite `agent_id='godentist-fb-ig'` → `route.ts:138` valida contra `agentRegistry` → falla → fallback_legacy → mensaje atendido por agente WRONG.

**Why it happens:** Olvido al replicar el patrón de pre-warm. El branch dispatch (Pattern 4) tiene su propio `await import('../godentist-fb-ig')` PERO eso ocurre DESPUÉS de `routeAgent`, no antes.

**How to avoid:**
- Plan-phase verification: `grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts` retorna ≥2 (uno en pre-warm, uno en branch).

**Warning signs:** Logs muestran `routeAgent threw uncaught — falling through to legacy if/else` (línea 253) en cold starts (primer mensaje tras ~5min sin tráfico). Producción FB/IG nunca alcanza al sibling.

**Source:** LEARNING B-001 documentado en `agent-lifecycle-router` standalone + verificable en `webhook-processor.ts:225-232` (comentario explícito).

### Pitfall 3: Workspace mismatch en routing rule

**What goes wrong:** El usuario crea la routing rule con `workspace_id` incorrecto (ej: workspace de "GoDentist" en vez de "GoDentist Valoraciones"). El sibling NO recibe tráfico, o peor, recibe tráfico de WhatsApp del workspace equivocado.

**Why it happens:** Confusión entre los 2 workspaces: "GoDentist" (workspace original) y "GoDentist Valoraciones" `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` (target del sibling — D-02).

**How to avoid:**
- Documentación explícita en `agent-specs/godentist-fb-ig.md` con el workspace_id literal.
- Plan-phase debe pasar al usuario el SQL pre-formado de la routing rule con `workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514'` listo para pegar en `/agentes/routing/editor`.

**Warning signs:** El sibling no recibe tráfico (logs muestran 0 invocaciones) aunque el operador confirma haber creado la regla. `routing_rules` query revela `workspace_id` distinto.

### Pitfall 4: Routing priority collision

**What goes wrong:** El usuario crea la routing rule con un `priority` que ya está en uso (UNIQUE INDEX `uq_routing_rules_priority WHERE active=true` rejects). Activación falla silenciosa.

**Why it happens:** D-15 deja al usuario escoger priority manualmente. Sin guía sobre qué prioridades están libres.

**How to avoid:**
- Plan-phase debe incluir SQL pre-check: `SELECT priority FROM routing_rules WHERE workspace_id='f0241182-...' AND active=true ORDER BY priority` para que el usuario vea slots libres.
- Sugerir priority recomendado: revisar otras reglas activas y proponer un número entre 100-900 que no colisione.

**Warning signs:** El operador intenta crear la regla y recibe error de constraint. Si no se detecta, la regla queda en draft sin tráfico.

**Source:** Pitfall 1 documentado en `agent-lifecycle-router` LEARNINGS.

### Pitfall 5: Lead-capture turn detection off-by-one

**What goes wrong:** Si el helper `resolveLeadCapture` chequea `turnCount === 0` en vez de `=== 1`, NUNCA dispara (el merge ya incrementó turnCount antes de que sales-track corra). O si chequea `>= 1`, dispara también en turn 2+ (regresión espuria, sobreescribe transitions normales).

**Why it happens:** Desconocimiento del orden de operaciones en `godentist-agent.ts:182-183`:
```typescript
const { state: mergedState, changes: stateChanges } = mergeAnalysis(state, analysis)
// ... mergeAnalysis incrementa turnCount (state.ts:161)
const salesResult = resolveSalesTrack({ ..., state: mergedState, ... })
```
**El primer mensaje del cliente tiene turnCount=0 al entrar, turnCount=1 al salir de mergeAnalysis.** Por eso el helper chequea `=== 1`.

**How to avoid:**
- `lead-capture.test.ts` DEBE incluir casos boundary: turnCount=0 → null, turnCount=1 → decision, turnCount=2 → null.
- Comentario explícito en el helper documentando el contract.

**Warning signs:** En logs de prod, `pipeline_decision.lead_capture_triggered` aparece en turn 2/3 (debería solo en turn 1). O nunca aparece (turn 1 siendo chequeado como turn 0).

### Pitfall 6: VAL tag side-effect omitido para sibling

**What goes wrong:** El sibling captura datos críticos pero el contacto NO recibe tag `'VAL'`. El sistema de métricas standalone "Conversation Tags to Contact" (que cuenta valoraciones agendadas/día) NO cuenta los leads capturados via FB/IG. Métricas erróneas en producción.

**Why it happens:** `applyGodentistValTagIfNeeded` en `v3-production-runner.ts:597` chequea `if (this.config.agentModule !== 'godentist') return`. Sin extender el check para incluir `'godentist-fb-ig'`, el sibling se salta el side-effect.

**How to avoid:**
- Pattern 5 (Sitio 6) documenta el cambio:
  ```typescript
  if (this.config.agentModule !== 'godentist' && this.config.agentModule !== 'godentist-fb-ig') return
  ```
- Plan-phase verification: `grep -n "agentModule !== 'godentist'" src/lib/agents/engine/v3-production-runner.ts` retorna 1 match con la condición compuesta.

**Warning signs:** Tag `VAL` nunca aparece en contactos del workspace `godentist-valoraciones` provenientes de FB/IG. Dashboard de métricas muestra valoraciones FB/IG=0 vs WhatsApp>0.

**Source:** `src/lib/agents/engine/v3-production-runner.ts:564-639` (comentario completo del side-effect quick-035/036).

### Pitfall 7: Conversación FB/IG sin canal seteado

**What goes wrong:** Una conversación llega al webhook con `conversations.channel=NULL` o un valor inesperado (ej: 'webchat'). El fact `channel` retorna `null` (`facts.ts:262-269`), la regla del operador `channel in ['facebook', 'instagram']` no matchea, mensaje cae al fallback (godentist original o agent default), saludo lead-capture nunca se dispara.

**Why it happens:** Edge case en el ingest de Meta. La columna `conversations.channel` se popula al crear conversación (`conversations.ts:315-346`). Si por bug del ingest llega NULL, fact retorna null.

**How to avoid:**
- Verificar pre-deploy que las conversaciones FB/IG existentes en el workspace `godentist-valoraciones` tienen `channel='facebook'` o `'instagram'` correctamente (SQL: `SELECT channel, COUNT(*) FROM conversations WHERE workspace_id='f0241182-...' GROUP BY channel`).
- Pitfall 4 del routing-channel-fact LEARNINGS documenta el fail-safe del fact (retorna null → reglas con `equal/in` no matchean → comportamiento legacy preservado).

**Warning signs:** `routing_audit_log` para una conversación FB/IG muestra `facts_snapshot.channel = null`. Mensaje atendido por godentist original (no por sibling).

### Pitfall 8: VS Code/git case sensitivity en macOS/WSL

**What goes wrong:** `godentist-fb-ig` vs `Godentist-fb-ig` vs `godentist-FB-IG` causan path collisions. macOS file system es case-insensitive por default, Linux/git case-sensitive. Si alguna iteración crea archivo con casing distinto, push deja inconsistencia.

**How to avoid:**
- Lockear casing en CONTEXT.md (D-03 ya lo hace: `'godentist-fb-ig'` lowercase con guiones).
- Plan-phase debe usar literal exacto en TODAS las menciones (paths, agent_id strings, observability event names).

---

## Code Examples

Snippets reales del codebase listos para copy-paste con file:line refs.

### Ejemplo 1: Self-registering index.ts

**Source:** `src/lib/agents/somnio-pw-confirmation/index.ts:18-29`

```typescript
import { agentRegistry } from '../registry'
import { somnioPwConfirmationConfig } from './config'

agentRegistry.register(somnioPwConfirmationConfig)

export { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'
export { processMessage } from './somnio-pw-confirmation-agent'
export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
```

### Ejemplo 2: Cold-lambda pre-warm

**Source:** `src/lib/agents/production/webhook-processor.ts:225-232`

```typescript
await Promise.all([
  import('../somnio-recompra'),
  import('../somnio-v3'),
  import('../somnio'),
  import('../godentist'),
  import('../somnio-pw-confirmation'),
  import('../somnio-v4'),
])
```

### Ejemplo 3: Dispatch branch en webhook-processor

**Source:** `src/lib/agents/production/webhook-processor.ts:765-790`

```typescript
} else if (agentId === 'godentist') {
  await import('../godentist')
  const { V3ProductionRunner } = await import('../engine/v3-production-runner')
  const runner = new V3ProductionRunner(adapters, { workspaceId, agentModule: 'godentist' })

  getCollector()?.setRespondingAgentId('godentist')

  engineOutput = await runner.processMessage({
    sessionId: '',
    conversationId,
    contactId: contactId!,
    message: messageContent,
    workspaceId,
    history: [],
    phoneNumber: phone,
    messageTimestamp: input.messageTimestamp,
  })

  getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', {
    agentId, conversationId, contactId,
  })
  logger.info({ conversationId, agentId }, 'GoDentist agent processing complete')
}
```

### Ejemplo 4: V3ProductionRunner agentModule branch

**Source:** `src/lib/agents/engine/v3-production-runner.ts:153-172`

```typescript
if (this.config.agentModule === 'godentist') {
  const { processMessage } = await import('../godentist/godentist-agent')
  output = await processMessage(v3Input as any) as unknown as V3AgentOutput
} else if (this.config.agentModule === 'somnio-recompra') {
  const { processMessage } = await import('../somnio-recompra/somnio-recompra-agent')
  output = await processMessage(v3Input as any) as unknown as V3AgentOutput
} else if (this.config.agentModule === 'somnio-pw-confirmation') {
  const { processMessage } = await import('../somnio-pw-confirmation')
  output = await processMessage(v3Input as any) as unknown as V3AgentOutput
} else {
  const { processMessage } = await import('../somnio-v3/somnio-v3-agent')
  output = await processMessage(v3Input)
}
```

### Ejemplo 5: TemplateManager lookup con agent_id

**Source:** `src/lib/agents/godentist/response-track.ts:200-205`

```typescript
const selectionMap = await templateManager.getTemplatesForIntents(
  GODENTIST_AGENT_ID,  // ← cambiar a GODENTIST_FB_IG_AGENT_ID en sibling
  allIntents,
  intentsVistos,
  state.templatesMostrados,
)
```

### Ejemplo 6: pedir_datos_parcial extraContext con campos faltantes

**Source:** `src/lib/agents/godentist/response-track.ts:334-341`

```typescript
case 'pedir_datos_parcial': {
  const faltantes = camposFaltantes(state)
  const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
  return {
    intents: ['pedir_datos_parcial'],
    extraContext: { campos_faltantes: labels.map(l => `- ${l}`).join('\n') },
  }
}
```

### Ejemplo 7: Test fixture pattern (sibling tests)

**Source:** `src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts:33-72`

```typescript
function createPreloadedState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    phase: 'awaiting_confirmation',
    datos: { /* defaults */ },
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    ...overrides,
  }
}

describe('resolveTransition', () => {
  it('phase=X + intent=Y → accion=Z', () => {
    const state = createPreloadedState({ /* test-specific */ })
    const result = resolveTransition(/* ... */)
    expect(result?.action).toBe('expectedAction')
  })
})
```

### Ejemplo 8: Mock TemplateManager con vi.hoisted

**Source:** `src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts:30-49`

```typescript
const {
  getTemplatesForIntentsMock,
  processTemplatesMock,
} = vi.hoisted(() => ({
  getTemplatesForIntentsMock: vi.fn(),
  processTemplatesMock: vi.fn(),
}))

vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: getTemplatesForIntentsMock,
    processTemplates: processTemplatesMock,
  })),
}))

beforeEach(() => {
  getTemplatesForIntentsMock.mockReset()
  processTemplatesMock.mockReset()
})
```

---

## Verification Strategy

### CI/local verification (pre-push)

| Check | Command | Expected |
|-------|---------|----------|
| TypeScript compile | `npx tsc --noEmit` | 0 errors |
| Sibling test suite | `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` | 6 suites, 50-80 tests passed |
| Existing routing tests no regression | `npx vitest run src/lib/agents/routing/__tests__/` | 94 tests passed (sin regresión por D-12 backward compat) |
| Existing godentist tests no impact | `npx vitest run src/lib/agents/godentist/__tests__/` | N/A — godentist NO tiene `__tests__/` (verificado) |
| Anti-regresión D-08 grep | `grep -n "GODENTIST_AGENT_ID" src/lib/agents/godentist-fb-ig/` | 0 matches |
| Sibling self-register grep | `grep -c "agentRegistry.register" src/lib/agents/godentist-fb-ig/index.ts` | 1 |
| Sibling pre-warm grep | `grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts` | ≥2 (pre-warm + dispatch) |
| Catalog entry grep | `grep -c "id: 'godentist-fb-ig'" src/lib/agents/agent-catalog.ts` | 1 |
| agentModule union extended | `grep -n "godentist-fb-ig" src/lib/agents/engine/types.ts` | 1 (línea 158) |
| VAL tag check extended | `grep -n "agentModule !== 'godentist'" src/lib/agents/engine/v3-production-runner.ts` | 1 con compound `&& agentModule !== 'godentist-fb-ig'` |
| 0 createAdminClient en sibling (Regla 3) | `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/` | 0 matches |
| Migration idempotente | Re-run migration en local Supabase | Sin errores en re-run |
| Migration row count | Post-apply: `SELECT COUNT(*) FROM agent_templates WHERE agent_id='godentist-fb-ig'` | Same as `agent_id='godentist' AND workspace_id IS NULL` |

### Production smoke tests

**Smoke 1: Dropdown del routing-editor (CRITICAL)**
- URL: `https://morfx.app/agentes/routing/editor`
- Workspace: GoDentist Valoraciones (`f0241182-...`)
- Expected: dropdown muestra `'GoDentist Valoraciones — FB/IG'` como opción seleccionable
- Verificable por usuario en navegador

**Smoke 2: End-to-end manual (D-18)**
- Usuario crea routing rule manualmente
- Usuario manda mensaje real a la página FB y al perfil IG del workspace
- Expected: respuesta del bot incluye el saludo D-05 (lead-capture con goBot 🤖 + Habeas Data)
- Sin script automatizado contra Meta APIs (D-18)

**Smoke 3: Lead-capture happy path (manual)**
- Cliente envía "Juan Pérez, 3001234567" como segundo mensaje (post-saludo del bot)
- Expected: bot responde `pedir_datos_parcial` con texto interpolado pidiendo `- Sede de tu preferencia: Cabecera, Mejoras Públicas, Floridablanca o Cañaveral`
- Verificable en `agent_observability_events` con `pipeline_decision.lead_capture_triggered`

**Smoke 4: Anti-regresión godentist (CRITICAL)**
- Cliente WhatsApp del workspace godentist original envía mensaje
- Expected: respuesta normal del godentist, saludo CONVERSACIONAL clásico (NO lead-capture)
- Verificable en `agent_observability_events` con `agent='godentist'` (NO `'godentist-fb-ig'`)
- Confirma D-04 (godentist intacto)

---

## Risk Assessment

| Riesgo | Severidad | Probabilidad | Mitigación |
|--------|-----------|--------------|------------|
| Regresión catálogo compartido (Pitfall 1) | ALTA — saludo nuevo nunca rinderiza | MEDIA si ejecutor copia rápido sin tests | Anti-regresión grep + test obligatorio en `response-track.test.ts`. Plan-phase verification check. |
| Cold-lambda race (Pitfall 2) | ALTA — sibling nunca recibe tráfico | BAJA si plan-phase incluye verification grep | Pattern 6 documentado + grep check en plan |
| Workspace mismatch (Pitfall 3) | MEDIA — sibling no recibe tráfico, sin daño | MEDIA — depende del usuario | SQL pre-formado documentado en plan-phase + spec |
| Priority collision (Pitfall 4) | BAJA — error visible al crear regla | BAJA — usuario lo ve al crear | SQL pre-check provisto al usuario |
| Lead capture off-by-one (Pitfall 5) | MEDIA — feature core falla | BAJA si tests cubren boundaries | `lead-capture.test.ts` con casos turn 0/1/2 obligatorios |
| VAL tag omitido (Pitfall 6) | MEDIA — métricas FB/IG erróneas | ALTA si ejecutor olvida extender check | Pattern 5 Sitio 6 documenta cambio explícito; grep check verifica |
| Channel NULL (Pitfall 7) | BAJA — fail-safe del fact retorna null | BAJA — solo edge cases | Pre-deploy SQL check + Pitfall 4 routing-channel-fact ya documenta fallback |
| Casing collision (Pitfall 8) | BAJA — desarrollo local | BAJA — D-03 lockea lowercase | Casing literal en CONTEXT.md |
| Habeas Data legal: cliente reclama | MEDIA — disclaimer Habeas Data inline en saludo (D-05/D-06) | BAJA — disclaimer compliant con Ley 1581/2011 | D-06 documenta razón (consentimiento implícito al enviar datos); deferred URL formal de política si requiere |
| Robot Railway down (compartido con godentist original) | MEDIA — `mostrar_disponibilidad` falla | BAJA — robot Railway estable | Fail-open ya implementado en `dentos-availability.ts` (ver `godentist.md:172-178`) — fallback a `HORARIOS_GENERALES_SEDE` |
| Costo Anthropic Haiku duplica | BAJA — Haiku es barato (~$0.001/call) | ALTA si tráfico FB/IG masivo | Aceptable trade-off; D-12 lockea Haiku |
| TemplateManager cache stale post-migration | BAJA — cache de 5min máximo | ALTA durante deploy | Cache se invalida automáticamente por timestamp; primer request post-deploy puede demorar 100-500ms extra |

---

## Open Questions

**TODAS las decisiones de CONTEXT.md (D-01..D-20) están lockeadas y resueltas.** Las únicas open questions REALES pre-plan-phase son cuestiones operativas menores que el plan-phase puede resolver internamente:

### Q1: ¿`getAgentsForWorkspace` filtra `godentist-fb-ig` del dropdown del routing-editor?

**What we know:** El helper `agent-catalog.ts:50-61` filtra por sibling-family con regex `^(.+)-v\d+$`. `godentist-fb-ig` NO matchea ese regex.

**What's unclear:** No verifiqué si el componente `routing/editor/page.tsx` usa `AGENT_CATALOG` directo o pasa por `getAgentsForWorkspace`. Si es el último, el dropdown del routing-editor para workspace `godentist-valoraciones` (que tiene `conversational_agent_id='godentist'`) puede mostrar SOLO godentist (caso match exacto) sin el sibling.

**Recommendation:** Plan-phase Plan T0 (audit) debe leer `src/app/(dashboard)/agentes/routing/editor/page.tsx` y validar. Si filtra, extender `getAgentsForWorkspace` para reconocer `godentist-fb-ig` como sibling de `godentist`. Trabajo adicional ~10 LOC.

**Risk if wrong:** Operador no ve el sibling en el dropdown → no puede crear la regla → activación bloqueada.

### Q2: ¿La migración SQL `INSERT...SELECT` con CASE introduce algún edge case con `delay_s` o `content_type`?

**What we know:** El godentist actual tiene templates con `content_type='texto'` predominantemente. Algún template específico (ej: imágenes) podría tener `content_type='imagen'`. El `INSERT...SELECT` los clona literal.

**What's unclear:** No revisé EXHAUSTIVAMENTE los ~75 templates de godentist para confirmar que ninguno tiene un `content_type='imagen'` con URL específica que solo aplica a WhatsApp (no FB/IG). [ASSUMED] todos los content_type funcionan en ambos canales — Meta soporta imágenes en mensajes FB/IG.

**Recommendation:** Plan-phase incluya un SELECT exploratory: `SELECT intent, priority, content_type, COUNT(*) FROM agent_templates WHERE agent_id='godentist' AND workspace_id IS NULL GROUP BY intent, priority, content_type ORDER BY intent`. Validar que no hay sorpresas. Si hay imágenes con URL hardcoded WhatsApp-only, evaluar caso por caso (probablemente no aplica).

**Risk if wrong:** Sibling envía un template con URL/format que falla en FB/IG. Pasaría como anomalía menor, no bloqueante.

### Q3: ¿El robot Railway `godentist-production` distingue por workspace en `dentos-availability.ts`?

**What we know:** `dentos-availability.ts:8-9` hardcodea `ROBOT_URL` y `ROBOT_CREDENTIALS = { username: 'JROMERO', password: '123456' }`. El POST body incluye `workspaceId: 'godentist-valoraciones'` (string literal en el robot, NO el UUID del workspace Supabase).

**What's unclear:** El sibling vive en el workspace Supabase `f0241182-...` (workspace "GoDentist Valoraciones"), pero el robot espera el string `'godentist-valoraciones'`. ¿Funciona out-of-the-box o requiere ajuste?

**Recommendation:** Plan-phase debe leer `dentos-availability.ts` completo y confirmar que el `workspaceId` que se envía al robot es el string correcto. Si está hardcoded como `'godentist-valoraciones'` en el helper, funciona out-of-the-box (ambos agentes apuntan al mismo robot). Si es dinámico desde el config del workspace, validar mapping.

**Risk if wrong:** Sibling no puede consultar disponibilidad real de Dentos → fallback a `HORARIOS_GENERALES_SEDE` siempre → UX degradada (cliente ve horarios genéricos en vez de slots reales).

---

## Sources

### Primary (HIGH confidence) — verified via codebase grep + read

- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/godentist/**` — todo el módulo godentist (15 archivos leídos)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-pw-confirmation/**` — sibling pattern reference (config.ts, index.ts, somnio-pw-confirmation-agent.ts, 5 test files)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/registry.ts` — AgentRegistry singleton
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/agent-catalog.ts` — AGENT_CATALOG + getAgentsForWorkspace
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/production/webhook-processor.ts:200-435,740-790` — pre-warm + dispatch + PW-confirmation 2-step
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/engine/v3-production-runner.ts:130-200,560-639` — agentModule routing + VAL tag side-effect
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/engine/types.ts:158` — agentModule union
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio/template-manager.ts:85-160,256-310` — cache key con agent_id
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/routing/facts.ts:240-270` — channel fact resolver
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/routing/route.ts:62-115` — FACT_NAMES_TO_SNAPSHOT con 'channel'
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/domain/conversations.ts:51,315-410` — channel column + getConversationChannel helper
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/supabase/migrations/20260318100000_godentist_templates.sql` — template migration template (351 LoC)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql` — pw-confirmation migration pattern (517 LoC)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/somnio-sales-v3-pw-confirmation/13-DEPLOY-NOTES.md` — sibling deploy pattern
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/routing-channel-fact/LEARNINGS.md` — fact channel pattern
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agent-specs/godentist.md` — godentist spec (template para sibling)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.claude/rules/agent-scope.md` — agent scope reglas (citado en CONTEXT.md)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/agent-godentist-fb-ig/CONTEXT.md` — D-01..D-20
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/agent-godentist-fb-ig/DISCUSSION-LOG.md` — rationale + alternatives discarded

### Secondary (MEDIUM confidence) — referenced in CONTEXT but not exhaustively verified

- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/somnio-sales-v3-pw-confirmation/01..12-{PLAN,SUMMARY}.md` — 13 plans + summaries del sibling padre. Solo se leyó 02-SUMMARY (templates) y 13-DEPLOY-NOTES (cierre). Resto inferido desde el patrón general.

### Tertiary (LOW confidence) — items asumidos pero no verificados

- **[ASSUMED]** `routing/editor/page.tsx` consume `AGENT_CATALOG` directo sin filtro family — open Q1.
- **[ASSUMED]** Robot Railway acepta el string `'godentist-valoraciones'` para ambos agentes — open Q3.
- **[ASSUMED]** Todos los `content_type` del godentist funcionan en FB/IG (Meta soporta imagen) — open Q2.
- **[ASSUMED]** El UNIQUE constraint en `agent_templates` (`UNIQUE(agent_id, intent, visit_type, orden, workspace_id)`) existe y permite el `INSERT` post `DELETE` sin conflict. Confirmado implícitamente por el patrón de `20260427210000_pw_confirmation_template_catalog.sql` que usa `UNIQUE` constraint guard secondary.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `routing/editor/page.tsx` consume `AGENT_CATALOG` directo sin filtro family | Multi-Agent Registration Pattern §Sitio 2 | Operador no ve el sibling en dropdown → activación bloqueada. Mitigation: plan-phase Plan T0 audit. |
| A2 | Robot Railway `godentist-production` acepta string literal `'godentist-valoraciones'` para ambos agentes (godentist + sibling apuntan al mismo robot, mismas credenciales) | Don't Hand-Roll §Robot + Open Q3 | Sibling no puede consultar disponibilidad → fallback a HORARIOS_GENERALES_SEDE siempre. UX degradada. |
| A3 | Todos los ~75 templates del godentist tienen `content_type` que funciona en FB/IG (Meta soporta imágenes) | Template Catalog Migration + Open Q2 | Sibling envía un template con URL/format incompatible con FB/IG. Anomalía menor, no bloqueante. |
| A4 | El UNIQUE constraint en `agent_templates` permite re-INSERT post-DELETE sin conflict | Template Catalog Migration | Migration falla en re-run. Mitigation: la migración tiene `BEGIN; DELETE; INSERT; COMMIT;` atómico. |
| A5 | El componente sandbox (distinto del routing-editor) puede no mostrar el sibling en su dropdown porque `conversational_agent_id` del workspace es `godentist`. NO bloqueante para producción (sandbox es solo QA). | Multi-Agent Registration Pattern §Sitio 2 | Devs no pueden testear el sibling en sandbox. Trabajo adicional ~10 LOC en getAgentsForWorkspace si requiere. |

**Si esta tabla resulta vacía post-plan-phase:** Todas las claims fueron verificadas o resueltas. Hoy quedan 5 ASSUMED, todos de bajo riesgo y resolvibles en Plan T0 audit.

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — todo es codebase existente, cero deps nuevas, patrones ya validados en producción.
- **Architecture patterns:** HIGH — 7 patrones documentados con file:line refs reales del codebase, validados via grep.
- **Migration:** HIGH — `INSERT...SELECT` con CASE es estándar SQL, idempotente con `DELETE` initial. Ejemplo similar en codebase (`20260318100000`).
- **Lead capture parser:** HIGH — diseño puro testeable, reusa `camposFaltantes` ya existente, signature documentada con cubertura de boundaries.
- **Test strategy:** HIGH — patrones validados en `somnio-pw-confirmation/__tests__/` (5 archivos, 65 tests), aplicables 1-a-1 al sibling.
- **Pitfalls:** HIGH — 8 pitfalls documentados, todos basados en regresiones reales del codebase (cdc06d9, B-001, quick-035/036, routing priority collision).
- **Risk assessment:** MEDIUM — riesgos mayores tienen mitigation clara; los 3 ASSUMED restantes son resolvibles en Plan T0 audit del plan-phase.
- **Open questions:** HIGH — 3 Qs identificados, todos resolvibles en plan-phase audit (no bloqueantes para investigación).

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 días — patrones del codebase estables, fact `channel` shipped 2026-05-04 y no hay refactor planeado del routing engine)
**Tamaño aproximado del work:** ~3000-4000 LOC nuevo (mayoría clone verbatim) + ~50-80 LOC migration SQL + ~1500 LOC tests + ~250 LOC docs. Estimado 6-8 plans de gsd-plan-phase.

---

## Project Constraints (from CLAUDE.md)

Las siguientes directivas del proyecto APLICAN a este standalone y deben ser verificadas por plan-phase:

- **Regla 0 (GSD obligatorio):** Sin atajos. Discuss-phase ✅ + Research ✅ + Plan-phase pendiente + Execute + Verify + LEARNINGS.
- **Regla 1 (Push a Vercel):** Cada plan que toca código DEBE pushear a Vercel post-commit.
- **Regla 2 (TZ Bogota):** No aplica directamente — el sibling reusa timezone handling del godentist (ver `state.ts:241-253`).
- **Regla 3 (Domain layer):** Sibling NO importa `createAdminClient` directo. Acceso a `agent_templates` via `TemplateManager`. Acceso a Tags via `assignTag` del domain (ya en el runner). Verificable: `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/godentist-fb-ig/` → 0 matches.
- **Regla 4 (Docs):** Plan-phase incluye actualización de `docs/architecture/06-agent-lifecycle-router.md` (ejemplo de uso del fact `channel`), `docs/analysis/04-estado-actual-plataforma.md` (sección agentes), `LEARNINGS.md` del standalone (D-20 reusable pattern), y eliminación de cualquier deuda técnica P0/P1 que el sibling resuelva.
- **Regla 5 (Migración antes de deploy):** SQL migration aplica en producción ANTES de pushear código que la usa. Plan-phase debe incluir un Plan T (apply SQL) → PAUSE → confirmación usuario → Plan T+1 (push código). MISMO patrón que somnio-sales-v3-pw-confirmation (13-DEPLOY-NOTES Task 1 → Task 2).
- **Regla 6 (Proteger agente en prod):** El godentist original es producción activa atendiendo clientes. D-04 + D-14 garantizan que el sibling NO modifica godentist y se activa 100% via routing rule (sin tráfico hasta que usuario crea regla).
- **`agent-scope.md` rule:** OBLIGATORIO al crear agente nuevo: definir scope explícito, system prompt incluye PUEDE/NO PUEDE, tools acotados, code review valida que ningún tool handler escribe fuera del scope. D-19 cubre esto.
- **`code-changes.md` rule:** No editar código sin PLAN.md aprobado. Plan-phase es paso siguiente obligatorio.
- **`gsd-workflow.md` rule:** No saltar research para "ahorrar tokens". Research completo (este archivo) requerido antes de plan-phase.
