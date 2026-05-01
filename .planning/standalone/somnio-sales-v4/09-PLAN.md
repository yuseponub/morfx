---
plan: 09
phase: somnio-sales-v4
wave: 4
depends_on: [02, 04, 05, 07]
files_modified:
  - src/lib/agents/somnio-v4/unknown-cases/capture.ts
  - src/lib/agents/somnio-v4/unknown-cases/cluster.ts
  - src/lib/agents/somnio-v4/unknown-cases/redact.ts
  - src/inngest/functions/unknown-cases-cluster-v4.ts
  - src/inngest/functions/knowledge-sync-v4.ts
  - src/inngest/index.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/unknown-cases/__tests__/redact.test.ts
addresses_decisions: [D-05, D-06, D-12, D-13, D-22, D-23, D-24, D-53, D-54, D-58]
addresses_research_pitfalls: [Pitfall 7]
autonomous: true
estimated_tasks: 5
must_haves:
  truths:
    - "captureUnknownCase inserta row en agent_unknown_cases con embedding (1536) + PII redacted"
    - "Inngest cron unknown-cases-cluster-v4 corre TZ=America/Bogota 0 4 * * * y llama RPC cluster_unknown_cases"
    - "Inngest function knowledge-sync-v4 escucha event 'somnio-v4/knowledge.sync' y NO falla deploy si un archivo .md falla (D-54)"
    - "knowledge-sync-v4 emite `pipeline_decision:knowledge_sync_failed` cuando hay fallos (W-05 fix)"
    - "somnio-v4-agent.ts invoca captureUnknownCase HOISTED tras runSubLoop cuando outcome.status==='no_match' (W-08 — Option 2 ÚNICA)"
    - "PII redaction (phone+email) aplicada antes de embedding (RESEARCH Security)"
    - "Cero imports desde @/lib/agents/somnio-v3/* (D-24)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/unknown-cases/capture.ts"
      provides: "captureUnknownCase con redacción PII"
      exports: ["captureUnknownCase"]
    - path: "src/lib/agents/somnio-v4/unknown-cases/cluster.ts"
      provides: "clusterUnknownCases — RPC wrapper"
      exports: ["clusterUnknownCases"]
    - path: "src/inngest/functions/unknown-cases-cluster-v4.ts"
      provides: "Inngest cron diario"
      exports: ["unknownCasesClusterV4"]
    - path: "src/inngest/functions/knowledge-sync-v4.ts"
      provides: "Inngest post-deploy KB sync con observability event (W-05)"
      exports: ["knowledgeSyncV4"]
  key_links:
    - from: "somnio-v4-agent.ts processUserMessage tras runSubLoop con outcome=no_match"
      to: "captureUnknownCase()"
      via: "fire-and-forget call HOISTED post-runSubLoop (W-08 — NO en mapOutcomeToAgentOutput)"
      pattern: "captureUnknownCase\\("
    - from: "unknownCasesClusterV4 cron"
      to: "supabase.rpc('cluster_unknown_cases', ...)"
      via: "wrapper clusterUnknownCases()"
      pattern: "cluster_unknown_cases"
    - from: "knowledgeSyncV4 with failed files"
      to: "agent_observability_events 'pipeline_decision:knowledge_sync_failed' (D-54 / W-05)"
      via: "getCollector().recordEvent()"
      pattern: "knowledge_sync_failed"
---

<objective>
Wave 4 — observation loop completo (D-12 infra día 1):

1. `redact.ts` — PII redaction wrapper (phone+email)
2. `capture.ts` — insert agent_unknown_cases con embedding + redaction
3. `cluster.ts` — wrapper de RPC `cluster_unknown_cases` (creado en Plan 02)
4. Inngest cron `unknown-cases-cluster-v4` (4am Bogota daily)
5. Inngest function `knowledge-sync-v4` (post-deploy hook + tolerante a fallos D-54). **W-05 fix:** emite `pipeline_decision:knowledge_sync_failed` a `agent_observability_events`.
6. Wiring en `somnio-v4-agent.ts` para que `no_match` outcomes invoquen captureUnknownCase **HOISTED** post-`runSubLoop` (W-08 — Option 2 ÚNICA, sin patrón embedded en mapOutcomeToAgentOutput).

Output: 5 archivos nuevos + 1 actualización + 1 test + 1 commit.
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
@src/lib/agents/shared/crm-mutation-tools/helpers.ts
@src/lib/agents/somnio-v4/knowledge-base/sync.ts
@src/inngest/functions/agent-timers-v3.ts
</context>

<interfaces>
<!-- PII redaction helpers existentes (.claude/skills/crm-mutation-tools.md, helpers.ts:33-55) -->
- `phoneSuffix(phone: string): string` — retorna últimos 4 dígitos
- `emailRedact(email: string): string` — retorna `local-part-masked@domain`
- `bodyTruncate(text: string, n=200): string`

<!-- RPC cluster_unknown_cases (Plan 02 ya la creó) -->
```sql
cluster_unknown_cases(p_workspace_id UUID, p_agent_id TEXT, p_similarity_threshold NUMERIC, p_min_cluster_size INT, p_window_days INT)
  RETURNS TABLE(case_id UUID, cluster_id UUID)
```

<!-- Inngest cron pattern -->
```typescript
inngest.createFunction(
  { id: '...', name: '...', retries: 1 },
  { cron: 'TZ=America/Bogota 0 4 * * *' },
  async ({ step }) => { ... }
)
```

<!-- W-08 wiring rule: SOLO Option 2 (hoisted post-runSubLoop). NO patrón embedded en mapOutcomeToAgentOutput. -->
```typescript
// Plan 09 inyecta este patrón en CADA call site de runSubLoop dentro de processUserMessage:
const outcome = await runSubLoop({ reason: ..., ctx: ... })
if (outcome.status === 'no_match') {
  void captureUnknownCase({ ... })  // fire-and-forget
  getCollector()?.recordEvent('pipeline_decision', 'handoff_low_confidence_fallback', { ... })
}
return mapOutcomeToAgentOutput(outcome, mergedState)
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: redact.ts + capture.ts</name>
  <files>src/lib/agents/somnio-v4/unknown-cases/redact.ts, src/lib/agents/somnio-v4/unknown-cases/capture.ts</files>
  <read_first>
    - src/lib/agents/shared/crm-mutation-tools/helpers.ts (phoneSuffix, emailRedact, bodyTruncate)
    - src/lib/agents/somnio-v4/knowledge-base/embed.ts (generateEmbedding)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "unknown-cases/capture.ts")
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Security — PII redaction antes del embedding)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-05, D-12, D-58)
  </read_first>
  <action>
**A) `src/lib/agents/somnio-v4/unknown-cases/redact.ts`**:

```typescript
import { phoneSuffix, emailRedact } from '@/lib/agents/shared/crm-mutation-tools/helpers'

/**
 * Redacta PII (teléfono + email) en un string de mensaje cliente ANTES de embedding.
 * Reusa los helpers ya shipped en crm-mutation-tools.
 */
export function redactPii(text: string): string {
  // Phones: secuencias de 7-15 dígitos (con o sin + prefix)
  let out = text.replace(/\+?[0-9]{7,15}/g, (match) => `phone****${phoneSuffix(match)}`)
  // Emails: básico
  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => emailRedact(match))
  return out
}
```

**B) `src/lib/agents/somnio-v4/unknown-cases/capture.ts`**:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding } from '../knowledge-base/embed'
import { redactPii } from './redact'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from '../config'
import { getCollector } from '@/lib/observability'

export interface CaptureUnknownArgs {
  workspaceId: string
  conversationId: string
  message: string
  intent: string | null
  intentConfidence: number | null
  knowledgeQueried: string[]
  reason: string
}

/**
 * Inserta una fila en agent_unknown_cases (D-05, D-58).
 * - PII redacted ANTES de embedding (RESEARCH Security recommendation).
 * - status='pending' inicial.
 * - cluster_id null hasta que el cron de clustering lo asigne.
 *
 * Fire-and-forget desde el agente — no debe romper el turn si falla.
 */
export async function captureUnknownCase(args: CaptureUnknownArgs): Promise<void> {
  try {
    const redacted = redactPii(args.message)
    const embedding = await generateEmbedding(redacted)
    const supabase = createAdminClient()

    const { error } = await supabase.from('agent_unknown_cases').insert({
      workspace_id: args.workspaceId,
      agent_id: SOMNIO_V4_AGENT_ID,
      conversation_id: args.conversationId,
      message: redacted,
      embedding,
      intent: args.intent,
      confidence: args.intentConfidence,
      knowledge_queried: args.knowledgeQueried,
      reason: args.reason,
      status: 'pending',
    })

    if (error) throw error

    getCollector()?.recordEvent('pipeline_decision', 'unknown_case_captured', {
      agent: SOMNIO_V4_AGENT_ID,
      conversationId: args.conversationId,
      intent: args.intent,
      confidence: args.intentConfidence,
      reason: args.reason,
    })
  } catch (err) {
    // Fire-and-forget — fail silently to not break the turn (D-58 doble logging:
    // observability captura el fallo, mensaje al cliente sigue su flujo)
    getCollector()?.recordEvent('pipeline_decision', 'unknown_case_capture_failed', {
      agent: SOMNIO_V4_AGENT_ID,
      conversationId: args.conversationId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
```

**Anti-patterns aplicados:**
- D-58: doble logging (capture + observability)
- Fire-and-forget — fallos no rompen turn
- PII redaction antes del embedding
- D-24: cero imports somnio-v3
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/unknown-cases/redact.ts && test -f src/lib/agents/somnio-v4/unknown-cases/capture.ts && grep -q "redactPii" src/lib/agents/somnio-v4/unknown-cases/redact.ts && grep -q "phoneSuffix\|emailRedact" src/lib/agents/somnio-v4/unknown-cases/redact.ts && grep -q "captureUnknownCase" src/lib/agents/somnio-v4/unknown-cases/capture.ts && grep -q "agent_unknown_cases" src/lib/agents/somnio-v4/unknown-cases/capture.ts && grep -q "redactPii(args.message)" src/lib/agents/somnio-v4/unknown-cases/capture.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/unknown-cases/ | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - redact.ts redacta phones (7-15 dígitos) y emails
    - capture.ts inserta en `agent_unknown_cases` con `embedding` y `agent_id='somnio-sales-v4'`
    - Redaction antes de embedding
    - try/catch con observability fallback
    - Cero imports somnio-v3
  </acceptance_criteria>
  <done>Capture layer listo.</done>
</task>

<task type="auto">
  <name>Task 2: cluster.ts + Inngest cron unknown-cases-cluster-v4</name>
  <files>src/lib/agents/somnio-v4/unknown-cases/cluster.ts, src/inngest/functions/unknown-cases-cluster-v4.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (secciones "unknown-cases/cluster.ts" + "unknown-cases-cluster.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-05, D-06)
    - supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql (RPC ya existe)
    - src/inngest/functions/agent-timers-v3.ts (Inngest function shape reference)
  </read_first>
  <action>
**A) `src/lib/agents/somnio-v4/unknown-cases/cluster.ts`**:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from '../config'

const SIMILARITY_THRESHOLD = 0.7  // cosine similarity (i.e. distance < 0.3) — RESEARCH §Example 3
const MIN_CLUSTER_SIZE = 10        // D-06
const WINDOW_DAYS = 30             // D-06

export interface ClusterResult {
  clustered: number  // total rows updated
  clusters: number   // count of distinct cluster_ids assigned
}

/**
 * Llama RPC cluster_unknown_cases y aplica los cluster_ids retornados a las filas.
 * Marca `status='ready_for_promotion'` para los rows clusterizados.
 * D-06: clusters se forman al alcanzar >=10 cases en ventana 30 días.
 */
export async function clusterUnknownCases(workspaceId: string = SOMNIO_WORKSPACE_ID): Promise<ClusterResult> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('cluster_unknown_cases', {
    p_workspace_id: workspaceId,
    p_agent_id: SOMNIO_V4_AGENT_ID,
    p_similarity_threshold: SIMILARITY_THRESHOLD,
    p_min_cluster_size: MIN_CLUSTER_SIZE,
    p_window_days: WINDOW_DAYS,
  })

  if (error) throw new Error(`cluster_unknown_cases RPC failed: ${error.message}`)

  const rows = (data ?? []) as Array<{ case_id: string; cluster_id: string }>
  const distinctClusters = new Set(rows.map((r) => r.cluster_id))

  for (const row of rows) {
    await supabase
      .from('agent_unknown_cases')
      .update({ cluster_id: row.cluster_id, status: 'ready_for_promotion' })
      .eq('id', row.case_id)
  }

  return { clustered: rows.length, clusters: distinctClusters.size }
}
```

**B) `src/inngest/functions/unknown-cases-cluster-v4.ts`**:

```typescript
import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import { clusterUnknownCases } from '@/lib/agents/somnio-v4/unknown-cases/cluster'
import { SOMNIO_WORKSPACE_ID } from '@/lib/agents/somnio-v4/config'

const logger = createModuleLogger('somnio-v4-unknown-cases-cluster')

export const unknownCasesClusterV4 = inngest.createFunction(
  {
    id: 'somnio-v4-unknown-cases-cluster',
    name: 'Somnio v4 Unknown Cases Clustering',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 4 * * *' },
  async ({ step }) => {
    const result = await step.run('cluster', () => clusterUnknownCases(SOMNIO_WORKSPACE_ID))
    logger.info(result, 'Clustering complete')
    return result
  }
)

export const unknownCasesClusterV4Functions = [unknownCasesClusterV4]
```
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/unknown-cases/cluster.ts && grep -q "cluster_unknown_cases" src/lib/agents/somnio-v4/unknown-cases/cluster.ts && grep -q "ready_for_promotion" src/lib/agents/somnio-v4/unknown-cases/cluster.ts && test -f src/inngest/functions/unknown-cases-cluster-v4.ts && grep -q "id: 'somnio-v4-unknown-cases-cluster'" src/inngest/functions/unknown-cases-cluster-v4.ts && grep -q "cron: 'TZ=America/Bogota 0 4 \* \* \*'" src/inngest/functions/unknown-cases-cluster-v4.ts</automated>
  </verify>
  <acceptance_criteria>
    - cluster.ts llama RPC con SIMILARITY_THRESHOLD=0.7 + MIN_CLUSTER_SIZE=10 + WINDOW_DAYS=30 (D-06)
    - Marca rows como `ready_for_promotion`
    - Inngest cron diario 4am Bogota
    - id único `somnio-v4-unknown-cases-cluster` (no colisión)
  </acceptance_criteria>
  <done>Clustering listo.</done>
</task>

<task type="auto">
  <name>Task 3: Inngest function knowledge-sync-v4 (post-deploy hook D-53/D-54) — W-05 fix emite knowledge_sync_failed event</name>
  <files>src/inngest/functions/knowledge-sync-v4.ts</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "knowledge-sync-v4.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-53, D-54)
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts (syncKbDoc)
    - scripts/knowledge-sync.ts (CLI walkMd analog)
  </read_first>
  <action>
Crear `src/inngest/functions/knowledge-sync-v4.ts`:

```typescript
import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import { syncKbDoc } from '@/lib/agents/somnio-v4/knowledge-base/sync'
import { getCollector } from '@/lib/observability'
import { SOMNIO_V4_AGENT_ID } from '@/lib/agents/somnio-v4/config'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const logger = createModuleLogger('somnio-v4-knowledge-sync')

async function walkMd(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir).catch(() => [] as string[])
  for (const name of entries) {
    const full = path.join(dir, name)
    const st = await stat(full).catch(() => null)
    if (!st) continue
    if (st.isDirectory()) out.push(...(await walkMd(full)))
    else if (st.isFile() && name.endsWith('.md')) out.push(full)
  }
  return out
}

export const knowledgeSyncV4 = inngest.createFunction(
  {
    id: 'somnio-v4-knowledge-sync',
    name: 'Somnio v4 Knowledge Sync',
    retries: 1,
  },
  { event: 'somnio-v4/knowledge.sync' },
  async ({ event, step }) => {
    const KB_ROOT = path.resolve(process.cwd(), 'src/lib/agents/somnio-v4/knowledge')
    const files = await step.run('list-md', () => walkMd(KB_ROOT))

    let ok = 0
    let fail = 0
    const failedFiles: string[] = []

    for (const file of files) {
      try {
        await step.run(`sync-${path.basename(file)}`, async () => {
          const raw = await readFile(file, 'utf8')
          await syncKbDoc(file, raw)
        })
        ok++
      } catch (err) {
        // D-54: sync fail NO bloquea el deploy. Logging + observability.
        logger.error({ err: (err as Error).message, file }, 'KB sync per-file failed')
        fail++
        failedFiles.push(path.relative(process.cwd(), file))
      }
    }

    if (fail > 0) {
      // W-05 fix: emitir explícitamente `pipeline_decision:knowledge_sync_failed`
      // a agent_observability_events. UI puede mostrar banner basado en este evento.
      await step.run('emit-knowledge-sync-failed', async () => {
        await getCollector()?.recordEvent('pipeline_decision', 'knowledge_sync_failed', {
          agent: SOMNIO_V4_AGENT_ID,
          ok,
          fail,
          total: files.length,
          files: failedFiles,
        })
      })
      logger.warn({ ok, fail, failedFiles }, 'KB sync completed with failures (knowledge_sync_failed emitted)')
    } else {
      logger.info({ ok }, 'KB sync completed cleanly')
    }

    return { ok, fail, total: files.length }
  }
)

export const knowledgeSyncV4Functions = [knowledgeSyncV4]
```

**W-05 fix:** elimina el TODO previo. La emisión del evento es ahora obligatoria cuando `fail > 0`. UI / dashboards pueden subscribirse a `pipeline_decision:knowledge_sync_failed` para alertar al operador.

**Anti-patterns:**
- D-54: NO throw en per-file failure — log y continúa
- NO regenerar embeddings cada deploy (Pitfall 7) — `syncKbDoc` ya hace hash check
- NO ejecutar como Vercel build step (RESEARCH Anti-pattern)
  </action>
  <verify>
    <automated>test -f src/inngest/functions/knowledge-sync-v4.ts && grep -q "id: 'somnio-v4-knowledge-sync'" src/inngest/functions/knowledge-sync-v4.ts && grep -q "event: 'somnio-v4/knowledge.sync'" src/inngest/functions/knowledge-sync-v4.ts && grep -q "syncKbDoc" src/inngest/functions/knowledge-sync-v4.ts && grep -q "fail++" src/inngest/functions/knowledge-sync-v4.ts && grep -F "knowledge_sync_failed" src/inngest/functions/knowledge-sync-v4.ts</automated>
  </verify>
  <acceptance_criteria>
    - id único `somnio-v4-knowledge-sync`
    - listen event `somnio-v4/knowledge.sync`
    - per-file try/catch que NO throw (D-54)
    - reutiliza `syncKbDoc` de Plan 04
    - **W-05:** emite `pipeline_decision:knowledge_sync_failed` cuando `fail > 0` (verificable: `grep -F "knowledge_sync_failed" src/inngest/functions/knowledge-sync-v4.ts` retorna ≥1 match)
  </acceptance_criteria>
  <done>KB sync hook listo con observability event (W-05).</done>
</task>

<task type="auto">
  <name>Task 4: Wire captureUnknownCase HOISTED post-runSubLoop (W-08 — Option 2 ÚNICA) + actualizar Inngest registry</name>
  <files>src/lib/agents/somnio-v4/somnio-v4-agent.ts, src/inngest/index.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (Plan 07 — buscar TODOS los call sites de `await runSubLoop({...})`)
    - src/lib/agents/somnio-v4/unknown-cases/capture.ts (acabado de crear)
    - src/inngest/index.ts (Plan 08 actualizó esto)
  </read_first>
  <action>
**A) `somnio-v4-agent.ts`** — modificación HOISTED (W-08 Option 2 ÚNICA, sin Option 1 embedded):

**REGLA W-08:** El captureUnknownCase NO va dentro de `mapOutcomeToAgentOutput`. SOLO va inmediatamente después de cada `await runSubLoop({...})` cuando el outcome es `no_match`. Esto evita doble-firing si mapOutcomeToAgentOutput se llamara múltiples veces.

Patrón a aplicar en CADA call site de `runSubLoop` dentro de `processUserMessage` (Plan 07 tiene 3: low_confidence/razonamiento_libre, cas_reject, crm_mutation):

```typescript
// Antes (Plan 07):
const outcome = await runSubLoop({ reason: ..., ctx: ... })
return mapOutcomeToAgentOutput(outcome, mergedState)

// Después (Plan 09 W-08):
const outcome = await runSubLoop({ reason: ..., ctx: ... })

if (outcome.status === 'no_match') {
  // D-58 fire-and-forget capture (W-08: hoisted, NO en mapOutcomeToAgentOutput)
  void captureUnknownCase({
    workspaceId: input.workspaceId ?? SOMNIO_WORKSPACE_ID,
    conversationId: input.conversationId,
    message: input.message,
    intent: analysis.intent.primary,
    intentConfidence: analysis.intent.intent_confidence,
    knowledgeQueried: outcome.knowledgeQueried,
    reason: outcome.reason,
  })
  getCollector()?.recordEvent('pipeline_decision', 'handoff_low_confidence_fallback', {
    agent: SOMNIO_V4_AGENT_ID,
    conversationId: input.conversationId,
    knowledgeQueried: outcome.knowledgeQueried,
    reason: outcome.reason,
  })
}

return mapOutcomeToAgentOutput(outcome, mergedState)
```

Imports nuevos en somnio-v4-agent.ts:
```typescript
import { captureUnknownCase } from './unknown-cases/capture'
```

**ANTI-PATTERN W-08 prohibido:** NO añadir `import('./unknown-cases/capture').then(...)` ni invocaciones de `captureUnknownCase` DENTRO de `mapOutcomeToAgentOutput`. Si el executor encuentra ese patrón en código existente (Plan 07), eliminarlo. Verificación negativa:
```bash
# debe retornar 0 — captureUnknownCase NO debe aparecer dentro de mapOutcomeToAgentOutput
awk '/function mapOutcomeToAgentOutput/,/^}$/' src/lib/agents/somnio-v4/somnio-v4-agent.ts | grep -c "captureUnknownCase"
# expected: 0
```

**B) `src/inngest/index.ts`** — registrar las 2 funciones nuevas:
```typescript
import { unknownCasesClusterV4Functions } from './functions/unknown-cases-cluster-v4'
import { knowledgeSyncV4Functions } from './functions/knowledge-sync-v4'
// ...
export const inngestFunctions = [
  // ... existing
  ...v4TimerFunctions,
  ...unknownCasesClusterV4Functions,
  ...knowledgeSyncV4Functions,
]
```
  </action>
  <verify>
    <automated>grep -q "captureUnknownCase" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "handoff_low_confidence_fallback" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -q "unknownCasesClusterV4Functions\|unknownCasesClusterV4" src/inngest/index.ts && grep -q "knowledgeSyncV4Functions\|knowledgeSyncV4" src/inngest/index.ts && [ "$(awk '/function mapOutcomeToAgentOutput/,/^}$/' src/lib/agents/somnio-v4/somnio-v4-agent.ts | grep -c 'captureUnknownCase')" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - `captureUnknownCase` invocado tras runSubLoop cuando `outcome.status === 'no_match'` (HOISTED)
    - Observability event `handoff_low_confidence_fallback` emitido (D-58)
    - **W-08 enforcement:** `captureUnknownCase` NO aparece dentro del cuerpo de `mapOutcomeToAgentOutput` (verificación negativa via awk)
    - Ambas Inngest functions registradas en index
  </acceptance_criteria>
  <done>Wiring completo W-08 Option 2 ÚNICA.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Test redact + commit + push</name>
  <files>src/lib/agents/somnio-v4/unknown-cases/__tests__/redact.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/unknown-cases/redact.ts
  </read_first>
  <behavior>
    - Test 1: redactPii('Mi telefono es 3001234567') → no contiene literal '3001234567'
    - Test 2: redactPii('Mi correo es jose@example.com') → no contiene 'jose@example.com'
    - Test 3: redactPii('Mensaje sin PII') → retorna idéntico
    - Test 4: redactPii('+573001234567 y jose@x.com') → ambos redactados
  </behavior>
  <action>
1. Crear vitest:
```typescript
import { describe, it, expect } from 'vitest'
import { redactPii } from '../redact'

describe('redactPii', () => {
  it('redacts colombian phone', () => {
    const out = redactPii('Mi telefono es 3001234567 gracias')
    expect(out).not.toContain('3001234567')
    expect(out).toContain('phone****')
  })
  it('redacts email', () => {
    const out = redactPii('Mi correo es jose@example.com')
    expect(out).not.toContain('jose@example.com')
  })
  it('passes through PII-free text', () => {
    const out = redactPii('Quiero comprar el producto')
    expect(out).toBe('Quiero comprar el producto')
  })
  it('redacts both phone and email', () => {
    const out = redactPii('Llamen al +573001234567 o escriban a jose@x.com')
    expect(out).not.toContain('3001234567')
    expect(out).not.toContain('jose@x.com')
  })
})
```

2. Ejecutar tests + commit + push:
```bash
pnpm vitest run src/lib/agents/somnio-v4/unknown-cases/__tests__/redact.test.ts
pnpm typecheck

git add src/lib/agents/somnio-v4/unknown-cases/ src/inngest/functions/unknown-cases-cluster-v4.ts src/inngest/functions/knowledge-sync-v4.ts src/inngest/index.ts src/lib/agents/somnio-v4/somnio-v4-agent.ts
git commit -m "feat(somnio-v4): plan-09 — observation loop (capture + cluster + KB sync hook)

- redact.ts: PII redaction wrapper (phoneSuffix + emailRedact)
- capture.ts: insert agent_unknown_cases con embedding + redaction (D-05/D-58)
- cluster.ts: RPC cluster_unknown_cases wrapper (D-06 — threshold 0.7, min 10, window 30d)
- Inngest cron unknown-cases-cluster-v4: TZ=America/Bogota 0 4 * * *
- Inngest function knowledge-sync-v4: event 'somnio-v4/knowledge.sync', tolerante a fallos (D-54)
  - W-05 fix: emite pipeline_decision:knowledge_sync_failed cuando hay fallos
- somnio-v4-agent.ts: invoca captureUnknownCase HOISTED post-runSubLoop con outcome=no_match (D-58)
  - W-08 fix: Option 2 ÚNICA — patrón hoisted, NO embedded en mapOutcomeToAgentOutput
- 4 unit tests redact pasando

D-24 verificado: cero imports somnio-v3
D-12 verificado: infra completa día 1
W-05 fix: knowledge_sync_failed event emitido (verificable via grep)
W-08 fix: captureUnknownCase NO aparece en cuerpo de mapOutcomeToAgentOutput (verificable via awk)

Standalone: somnio-sales-v4
Decisions: D-05, D-06, D-12, D-13, D-22, D-23, D-24, D-53, D-54, D-58

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/agents/somnio-v4/unknown-cases/__tests__/redact.test.ts --reporter=basic 2>&1 | grep -E "passed" && git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-09"</automated>
  </verify>
  <acceptance_criteria>
    - 4 tests pasan
    - `pnpm typecheck` ok
    - Commit + push completados
  </acceptance_criteria>
  <done>Observation loop end-to-end shipped.</done>
</task>

</tasks>

<verification>
- captureUnknownCase invocable
- clustering RPC wrapper invocable
- Inngest cron + sync function registradas
- Wiring no_match → capture verificado en código (W-08 Option 2)
- knowledge_sync_failed event emitido (W-05)
</verification>

<success_criteria>
- Plan 10 (UI) puede listar rows de agent_unknown_cases con cluster_id ya asignado
- Plan 11 (corpus) puede usar pnpm knowledge:sync (CLI) y la Inngest function corre post-deploy
- Cuando knowledge-sync falla, dashboards pueden subscribirse al evento (W-05)
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/09-SUMMARY.md` con:
- Tests output
- Verificación grep `knowledge_sync_failed` (W-05)
- Verificación awk `captureUnknownCase` NO en mapOutcomeToAgentOutput (W-08)
- Hash commit
</output>
