---
phase: agent-forensics-panel
plan: 05
type: execute
wave: 4
depends_on: [04]
files_modified:
  - supabase/migrations/20260428000000_agent_audit_sessions.sql
  - src/lib/agent-forensics/pricing.ts
  - src/lib/agent-forensics/__tests__/pricing.test.ts
  - src/lib/agent-forensics/load-conversation-turns.ts
  - src/lib/agent-forensics/__tests__/load-conversation-turns.test.ts
  - src/lib/agent-forensics/condense-previous-turn.ts
  - src/lib/agent-forensics/__tests__/condense-previous-turn.test.ts
  - src/lib/agent-forensics/token-budget.ts
  - src/lib/agent-forensics/__tests__/token-budget.test.ts
  - src/lib/agent-forensics/audit-session-store.ts
  - src/lib/agent-forensics/__tests__/audit-session-store.test.ts
  - src/lib/agent-forensics/auditor-prompt.ts
  - src/lib/agent-forensics/__tests__/auditor-prompt.test.ts
  - src/app/api/agent-forensics/audit/route.ts
  - src/app/api/agent-forensics/audit/__tests__/route.test.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx
autonomous: false

decisions_addressed: [D-14, D-15, D-16, D-17, D-18, D-19]

must_haves:
  truths:
    - "Migration `supabase/migrations/20260428000000_agent_audit_sessions.sql` aplicada en Supabase prod ANTES de codigo runtime (Regla 5 strict checkpoint Task 2)"
    - "Tabla `public.agent_audit_sessions` existe en prod con 13 columnas (id, turn_id, workspace_id, user_id, responding_agent_id, conversation_id, hypothesis, messages, system_prompt, total_turns_in_context, trimmed_count, cost_usd, created_at, updated_at) + 2 indices (idx_audit_sessions_workspace_conv, idx_audit_sessions_turn) + trigger updated_at + GRANT ALL a service_role (D-17, RESEARCH §5)"
    - "Funcion `loadConversationTurns(conversationId, startedAtAnchor)` en `src/lib/agent-forensics/load-conversation-turns.ts` retorna `TurnSummary[]` ordenado ASC con session-active window preferida + fallback 7-dias + LIMIT 50 + incluye automaticamente turns de crm-reader (D-14, D-19, RESEARCH §1)"
    - "Funcion pura `condensePreviousTurn(detail: TurnDetail)` en `src/lib/agent-forensics/condense-previous-turn.ts` retorna `CondensedPreviousTurn` con shape de RESEARCH §2 (turnId + startedAt + durationMs + respondingAgentId + entryAgentId + triggerKind + intent + intentConfidence + pipelineDecisions + templatesEnviados + modeTransitions + toolCalls + guards + stateChanges + hasError + errorMessage + totalTokens + totalCostUsd) (D-14)"
    - "Funcion `truncateContext(previousTurns, auditedTurnId, fixedCostTokens, capTokens=50_000)` en `src/lib/agent-forensics/token-budget.ts` aplica drop-oldest preservando turn auditado, retorna `{ kept, trimmed }` con politica chronological-ASC para el modelo (D-15, RESEARCH §3)"
    - "Funcion `estimateTokens(text)` heuristica `Math.ceil(text.length / 2.8)` exportada desde `token-budget.ts`. Funcion async `countTokensIfNeeded(systemPrompt, userMessage, threshold=40_000)` invoca Anthropic SDK `client.messages.countTokens` SOLO si `estimateTokens > threshold` (RESEARCH §3 Pitfall 14)"
    - "Constante `SONNET_4_6_PRICING = { inputPerMTok: 3, outputPerMTok: 15 }` y funcion `calculateAuditCost(inputTokens, outputTokens)` en `src/lib/agent-forensics/pricing.ts` (RESEARCH §3, A1 confirmar dia-de-execute)"
    - "Modulo `src/lib/agent-forensics/audit-session-store.ts` exporta `createAuditSession(args)`, `appendToAuditSession(id, args)` y `loadAuditSession(id)` que escriben/leen via `createRawAdminClient` contra tabla `agent_audit_sessions` (D-17, sin RLS, server-only)"
    - "System prompt extendido en `src/lib/agent-forensics/auditor-prompt.ts` mantiene los 4 headers obligatorios (Resumen / Evidencia / Discrepancias / Proximos pasos) + agrega bloque CONTEXTO MULTI-TURN (D-14) + bloque ANTI-FALSO-POSITIVO (RESEARCH §8 mitigando Pitfall 04-SUMMARY 11s gap) + bloque condicional HIPOTESIS DEL USUARIO cuando hypothesis !== null (D-16, RESEARCH §7)"
    - "Funcion `buildAuditorPromptV2({ spec, previousTurns, condensed, snapshot, turn, hypothesis })` retorna `{ systemPrompt, userMessage }` con dual-placement de la hipotesis (system prompt define POSTURA, user message define FOCO) y previousTurns embebidos como JSON code-fence en user message (D-16 dual placement, RESEARCH §7)"
    - "API route `src/app/api/agent-forensics/audit/route.ts` extendida acepta body `{ turnId, startedAt, respondingAgentId, conversationId, messages: UIMessage[], hypothesis: string | null, auditSessionId: string | null }` (RESEARCH §4)"
    - "Route handler distingue first-round (`auditSessionId === null`) vs follow-up (`auditSessionId !== null`) — first round arma contexto pesado (Promise.all spec + snapshot + loadConversationTurns + per-turn getTurnDetail paralelo via Promise.all + condensePreviousTurn + truncateContext) y reemplaza messages[0] con userMessage construido; follow-up carga `system_prompt` desde DB y pasa `messages` as-is (Pitfall 12, Pitfall 13 mitigados)"
    - "Route handler `onFinish` calcula `cost_usd = calculateAuditCost(usage.inputTokens, usage.outputTokens)` y persiste: first-round → `createAuditSession` con messages + system_prompt + hypothesis + total_turns_in_context + trimmed_count + cost_usd; follow-up → `appendToAuditSession` con messages + cost_usd_delta (RESEARCH §4)"
    - "Route handler setea response header `X-Audit-Session-Id` (UUID nuevo) en first-round y `X-Forensics-Trimmed: N/M` cuando trimmed > 0 (RESEARCH §3, RESEARCH §4)"
    - "AuditorTab UI tiene Textarea pre-audit (max 2000 chars, opcional, hint visible) + boton 'Auditar sesion' + chat continuo con mensajes user/assistant renderizados (user con Markdown plano, assistant con ReactMarkdown + remarkGfm) + input 'Pregunta de seguimiento' debajo del ultimo assistant + auto-scroll a bottom + reset completo al cambiar `turnId` (Pitfall 9 mitigado, RESEARCH §6)"
    - "AuditorTab fetch wrapper en DefaultChatTransport captura headers `X-Audit-Session-Id` (state local liftado al body de siguiente request) y `X-Forensics-Trimmed` (renderiza warning sutil arriba de mensajes) — pattern verbatim de builder-chat.tsx:43-54 (RESEARCH §3, §4, §6)"
    - "Tests verdes: 5 nuevos archivos test (pricing, load-conversation-turns, condense-previous-turn, token-budget, audit-session-store) + auditor-prompt.test.ts extendido (cubrir hipotesis + bloques nuevos) + route.test.ts extendido (first-round vs follow-up + onFinish persistencia + headers)"
    - "Plan NO autonomous — Task 2 es checkpoint humano BLOQUEANTE Regla 5 strict + Task 12 final tambien checkpoint humano smoke-test productivo end-to-end (text-box hipotesis + chat continuo + persistencia DB)"
  artifacts:
    - path: "supabase/migrations/20260428000000_agent_audit_sessions.sql"
      provides: "Migration con CREATE TABLE + 2 indices + trigger updated_at + GRANT ALL a service_role"
      contains: "agent_audit_sessions"
    - path: "src/lib/agent-forensics/pricing.ts"
      provides: "Constantes pricing Sonnet 4.6 + calculateAuditCost"
      contains: "SONNET_4_6_PRICING"
    - path: "src/lib/agent-forensics/load-conversation-turns.ts"
      provides: "Loader multi-turn con session-active window + fallback 7d + crm-reader incluido"
      contains: "loadConversationTurns"
    - path: "src/lib/agent-forensics/condense-previous-turn.ts"
      provides: "Pure function que reduce TurnDetail a CondensedPreviousTurn shape RESEARCH §2"
      contains: "condensePreviousTurn"
    - path: "src/lib/agent-forensics/token-budget.ts"
      provides: "estimateTokens + countTokensIfNeeded + truncateContext drop-oldest"
      contains: "truncateContext"
    - path: "src/lib/agent-forensics/audit-session-store.ts"
      provides: "createAuditSession + appendToAuditSession + loadAuditSession via createRawAdminClient"
      contains: "createAuditSession"
    - path: "src/lib/agent-forensics/auditor-prompt.ts"
      provides: "buildAuditorPromptV2 con multi-turn + hipotesis + anti-falso-positivo (extiende Plan 04 v1)"
      contains: "buildAuditorPromptV2"
    - path: "src/app/api/agent-forensics/audit/route.ts"
      provides: "Route extendida con first-round/follow-up branches + onFinish persistence + 2 headers"
      contains: "auditSessionId"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"
      provides: "UI con text-box hipotesis + chat continuo + reset al cambiar turn + trimmed warning"
      contains: "Pregunta de seguimiento"
  key_links:
    - from: "POST /api/agent-forensics/audit (first round)"
      to: "loadConversationTurns + Promise.all(getTurnDetail per turn) + condensePreviousTurn + truncateContext + buildAuditorPromptV2"
      via: "heavy assembly only when auditSessionId === null"
      pattern: "auditSessionId === null"
    - from: "POST /api/agent-forensics/audit (follow-up)"
      to: "loadAuditSession (system_prompt cached) + streamText pass-through messages"
      via: "skip heavy assembly, reuse persisted system_prompt (Pitfall 13 mitigation)"
      pattern: "loadAuditSession"
    - from: "streamText.onFinish"
      to: "createAuditSession | appendToAuditSession + calculateAuditCost"
      via: "first-round inserts row, follow-up updates messages + cost_usd"
      pattern: "onFinish: async"
    - from: "AuditorTab fetch wrapper"
      to: "auditSessionId state + trimmedWarning state"
      via: "response.headers.get('X-Audit-Session-Id') + response.headers.get('X-Forensics-Trimmed')"
      pattern: "X-Audit-Session-Id"
    - from: "AuditorTab Textarea pre-audit"
      to: "sendMessage body.hypothesis (round 1 only)"
      via: "useState hypothesis + body callback de DefaultChatTransport"
      pattern: "body: \\(\\) => \\(\\{ "
    - from: "AuditorTab BuilderInput-style follow-up"
      to: "sendMessage({ text }) — useChat agrega al messages array, server pass-through"
      via: "follow-up rounds send corto texto, contexto pesado ya en messages[0]"
      pattern: "Pregunta de seguimiento"
---

<objective>
Plan 05 extiende el auditor base (Plan 04 shipped) en cuatro ejes acoplados: (1) **multi-turn context** — el audit de un turn N lleva al modelo TODOS los turns previos de la misma `conversation_id`, incluidos turns de `crm-reader` cuando existen (D-14, D-19); (2) **input de hipotesis del usuario** via text-box pre-audit (D-16) — el system prompt incluye "El usuario sospecha: <hipotesis>"; (3) **chat continuo de seguimiento** — useChat envia el array completo de messages, el server hace pass-through tras first-round (D-16, D-17); (4) **persistencia en `agent_audit_sessions`** — tabla nueva con hypothesis + messages JSONB + system_prompt + cost_usd acumulado (D-17, Regla 5 strict).

Purpose: cierra los 2 limitaciones criticas detectadas tras el smoke test de Plan 04 (auditor confunde turns aislados generando falsos positivos como el "11s gap" — ver 04-SUMMARY §Pitfalls — y no aprovecha el conocimiento del usuario que ya sabe que sospecha del bot). Convierte al auditor de oracle one-shot en assistant interactivo. La directiva ANTI-FALSO-POSITIVO (RESEARCH §8) en el system prompt fuerza al modelo a listar y descartar hipotesis benignas (timing async, fallback de sesion nueva, fuente alternativa de datos) antes de afirmar anomalias.

Output: 1 migration SQL + 5 modulos library nuevos (pricing, loader multi-turn, condense-previous-turn, token-budget, audit-session-store) + 5 archivos test nuevos + 2 archivos extendidos (auditor-prompt v2 + route handler v2 + tests existentes) + 1 React component reescrito (auditor-tab.tsx con text-box + chat continuo).

**Dependency:** Plan 04 SHIPPED (auditor base + spec files + condenseTimeline + loadAgentSpec + loadSessionSnapshot + AuditorTab base). Plan 05 NO crea nuevas deps npm — todo el stack ya esta instalado por Plan 04 (RESEARCH §Standard Stack).

**NOT autonomous:** Task 2 es checkpoint humano BLOQUEANTE (Regla 5 strict — usuario aplica SQL en Supabase prod + corre verification query + reporta + aprueba ANTES de cualquier codigo runtime que use la tabla). Task 12 final es checkpoint humano smoke test productivo (verifica los 4 outcomes goal-backward: text-box hipotesis funciona, multi-turn context se carga, chat continuo refina, persistencia en DB con cost_usd correcto).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-forensics-panel/CONTEXT.md
@.planning/standalone/agent-forensics-panel/DISCUSSION-LOG.md — Sesion 2 D-14..D-19 locked
@.planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md — 8 sections + Open Items + Pitfalls 9..15 + Assumptions A1..A6
@.planning/standalone/agent-forensics-panel/01-SUMMARY.md — responding_agent_id capture (Plan 05 reusa el campo)
@.planning/standalone/agent-forensics-panel/02-SUMMARY.md — condenseTimeline pure function (Plan 05 lo invoca para turn auditado)
@.planning/standalone/agent-forensics-panel/03-SUMMARY.md — loadAgentSpec + loadSessionSnapshot (Plan 05 los reusa en first-round)
@.planning/standalone/agent-forensics-panel/04-SUMMARY.md — auditor base shipped + Pitfalls post-deploy (11s gap → motivacion ANTI-FALSO-POSITIVO directive)
@src/lib/agent-forensics/auditor-prompt.ts — Plan 04 v1, Plan 05 EXTIENDE (NO reemplaza la signature buildAuditorPrompt — agrega buildAuditorPromptV2)
@src/app/api/agent-forensics/audit/route.ts — Plan 04 v1, Plan 05 EXTIENDE (acepta nuevos campos opcionales en body, branches first-round/follow-up)
@src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx — Plan 04 base, Plan 05 REESCRIBE (chat continuo + text-box)
@src/lib/agent-forensics/condense-timeline.ts — pure function reusada para turn auditado
@src/lib/agent-forensics/load-agent-spec.ts — reusada en first-round
@src/lib/agent-forensics/load-session-snapshot.ts — reusada en first-round
@src/lib/observability/repository.ts — getTurnDetail + listTurnsForConversation (template para nuevo loader)
@src/app/api/builder/chat/route.ts — PRIMARY REFERENCE patron chat continuation (lineas 80-145 verbatim para messages[] + onFinish)
@src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx — useChat + DefaultChatTransport + fetch wrapper header capture (43-54)
@src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx — auto-grow textarea pattern para "Pregunta de seguimiento"
@src/lib/auth/super-user.ts — assertSuperUser ya integrado en route handler de Plan 04
@src/lib/supabase/admin.ts — createRawAdminClient (line 72)
@supabase/migrations/20260424141545_agent_observability_responding_agent_id.sql — TEMPLATE de header migration + Regla 5 reminder + verification query pattern
@supabase/migrations/20260205000000_agent_sessions.sql — `update_updated_at_column()` trigger function reusable (line 115)
@CLAUDE.md — Reglas 0, 1, 5 strict, 6
@.claude/rules/agent-scope.md — auditor NO es agente conversacional productivo

<interfaces>
<!-- ============================================================ -->
<!-- SCHEMA SQL — Migration agent_audit_sessions (RESEARCH §5)    -->
<!-- ============================================================ -->
CREATE TABLE agent_audit_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id                  UUID NOT NULL,
  workspace_id             UUID NOT NULL,
  user_id                  UUID NOT NULL,
  responding_agent_id      TEXT NOT NULL,
  conversation_id          UUID NOT NULL,
  hypothesis               TEXT NULL,
  messages                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  system_prompt            TEXT NOT NULL,
  total_turns_in_context   INTEGER NOT NULL DEFAULT 0,
  trimmed_count            INTEGER NOT NULL DEFAULT 0,
  cost_usd                 NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

<!-- ============================================================ -->
<!-- TYPES nuevos                                                 -->
<!-- ============================================================ -->
export interface CondensedPreviousTurn {
  turnId: string
  startedAt: string
  durationMs: number | null
  respondingAgentId: string
  entryAgentId: string
  triggerKind: string | null
  intent: string | null
  intentConfidence: number | null
  pipelineDecisions: Array<{ label: string; payload: Record<string, unknown> }>
  templatesEnviados: string[]
  modeTransitions: Array<{ from: string; to: string; reason?: string }>
  toolCalls: Array<{ tool: string; status?: string }>
  guards: Array<{ label: string; reason: string }>
  stateChanges: { datosCapturadosAdded?: string[]; modeAtEnd?: string }
  hasError: boolean
  errorMessage?: string
  totalTokens: number
  totalCostUsd: number
}

export interface AuditSessionRow {
  id: string
  turnId: string
  workspaceId: string
  userId: string
  respondingAgentId: string
  conversationId: string
  hypothesis: string | null
  messages: unknown[]            // UIMessage[]
  systemPrompt: string
  totalTurnsInContext: number
  trimmedCount: number
  costUsd: number
  createdAt: string
  updatedAt: string
}

<!-- ============================================================ -->
<!-- FUNCTION SIGNATURES nuevas                                   -->
<!-- ============================================================ -->
export function loadConversationTurns(
  conversationId: string,
  startedAtAnchor: string,
): Promise<TurnSummary[]>

export function condensePreviousTurn(detail: TurnDetail): CondensedPreviousTurn

export function estimateTokens(text: string): number  // Math.ceil(length / 2.8)

export async function countTokensIfNeeded(
  systemPrompt: string,
  userMessage: string,
  threshold?: number,            // default 40_000
): Promise<{ inputTokens: number; usedApi: boolean }>

export function truncateContext(args: {
  previousTurns: CondensedPreviousTurn[]
  auditedTurnId: string
  fixedCostTokens: number
  capTokens?: number             // default 50_000
}): { kept: CondensedPreviousTurn[]; trimmed: number }

export const SONNET_4_6_PRICING: { inputPerMTok: 3; outputPerMTok: 15 }
export function calculateAuditCost(inputTokens: number, outputTokens: number): number

export async function createAuditSession(args: {
  turnId: string
  workspaceId: string
  userId: string
  conversationId: string
  respondingAgentId: string
  hypothesis: string | null
  messages: unknown[]
  systemPrompt: string
  totalTurnsInContext: number
  trimmedCount: number
  costUsd: number
}): Promise<{ id: string }>

export async function appendToAuditSession(
  id: string,
  args: { messages: unknown[]; costUsdDelta: number },
): Promise<void>

export async function loadAuditSession(id: string): Promise<AuditSessionRow | null>

export function buildAuditorPromptV2(args: {
  spec: string
  previousTurns: CondensedPreviousTurn[]
  condensed: CondensedTimelineItem[]
  snapshot: unknown
  turn: TurnSummary
  hypothesis: string | null
}): { systemPrompt: string; userMessage: string }

<!-- ============================================================ -->
<!-- API ROUTE — body extendido (RESEARCH §4)                     -->
<!-- ============================================================ -->
POST /api/agent-forensics/audit
{
  // Existing (Plan 04)
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string

  // NEW Plan 05
  messages: UIMessage[]                  // useChat sends automatically
  hypothesis: string | null              // round 1 only (text-box value), follow-ups send null
  auditSessionId: string | null          // null on first round, UUID on follow-ups
}

<!-- Response headers (Plan 05 nuevos) -->
X-Audit-Session-Id: <uuid>               // first-round only
X-Forensics-Trimmed: <kept>/<total>      // only when trimmed > 0

<!-- ============================================================ -->
<!-- AUDITOR-TAB props (sin cambios en signature, agrega state)   -->
<!-- ============================================================ -->
interface Props {
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string
}

// State local nuevo (RESEARCH §6):
const [hypothesis, setHypothesis] = useState('')
const [auditSessionId, setAuditSessionId] = useState<string | null>(null)
const [trimmedWarning, setTrimmedWarning] = useState<string | null>(null)
const [followUpInput, setFollowUpInput] = useState('')

// Reset al cambiar turn (Pitfall 9, RESEARCH §6):
useEffect(() => {
  setMessages([])
  setHypothesis('')
  setAuditSessionId(null)
  setTrimmedWarning(null)
  setFollowUpInput('')
}, [turnId])
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear migration SQL `supabase/migrations/20260428000000_agent_audit_sessions.sql` + commit local (NO push, NO apply) — pre-requisito Regla 5</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §5 (lineas 757-960 — schema validation + GRANT learning + verification query)
    - .planning/standalone/agent-forensics-panel/DISCUSSION-LOG.md D-17 (schema decision)
    - supabase/migrations/20260424141545_agent_observability_responding_agent_id.sql (TEMPLATE de header + BEGIN/COMMIT + verification query inline)
    - supabase/migrations/20260420000443_platform_config.sql (PRIMARY reference para tabla sin RLS + GRANT learning Phase 44.1)
    - supabase/migrations/20260205000000_agent_sessions.sql:115 (verificar disponibilidad de funcion `update_updated_at_column()`)
    - CLAUDE.md Regla 5 (migracion ANTES del push de codigo que la usa)
  </read_first>
  <action>
    **Paso 1 — Verificar timestamp libre:**
    ```bash
    ls /mnt/c/Users/Usuario/Proyectos/morfx-new/supabase/migrations/ | grep "20260428" || echo "timestamp libre"
    ```
    Si el timestamp `20260428000000` ya existe en el repo, ajustar a `20260428010000` o el siguiente disponible secuencial. El archivo se llama EXACTAMENTE como dicta el patron de timestamp YYYYMMDDHHMMSS.

    **Paso 2 — Crear el archivo de migracion** en `supabase/migrations/20260428000000_agent_audit_sessions.sql` con el contenido EXACTO de RESEARCH §5 lineas 868-948 (verbatim):

    Header (RESEARCH-plan-05.md §5 ready-to-paste block):
    - Comentario explicativo top-level (proposito + sin RLS rationale + Regla 5 reminder).
    - `BEGIN;`
    - `CREATE TABLE IF NOT EXISTS agent_audit_sessions (...)` con las 13 columnas de `<interfaces>` arriba (incluyendo las 3 columnas adicionales `system_prompt`, `total_turns_in_context`, `trimmed_count` que RESEARCH §5 justifico).
    - `CREATE INDEX IF NOT EXISTS idx_audit_sessions_workspace_conv ON agent_audit_sessions (workspace_id, conversation_id, created_at DESC);`
    - `CREATE INDEX IF NOT EXISTS idx_audit_sessions_turn ON agent_audit_sessions (turn_id, created_at DESC);`
    - `CREATE TRIGGER agent_audit_sessions_updated_at BEFORE UPDATE ON agent_audit_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();` (reusa funcion existente).
    - `GRANT ALL ON TABLE public.agent_audit_sessions TO service_role;` (LEARNING Phase 44.1 — sin grant explicito service_role recibe `code: 42501 permission denied`).
    - `COMMENT ON TABLE agent_audit_sessions IS 'Auditor multi-turn audit sessions (Plan 05 agent-forensics-panel). Persists hypothesis + chat history + cost. Server-only access via createAdminClient + assertSuperUser. NO RLS.';`
    - `COMMIT;`
    - Bloque comentario VERIFICATION QUERY al final (RESEARCH §5 verification query) con SELECT a `pg_total_relation_size`, `information_schema.tables`, `information_schema.table_privileges` para que el usuario lo corra en Task 2.

    **Paso 3 — Validar SQL syntax local (no apply):**
    ```bash
    # Si esta instalado psql con docker, validar el parse:
    cat supabase/migrations/20260428000000_agent_audit_sessions.sql | head -1
    # Confirmar que el archivo existe y es legible
    test -f supabase/migrations/20260428000000_agent_audit_sessions.sql && echo OK
    wc -l supabase/migrations/20260428000000_agent_audit_sessions.sql
    ```
    El archivo debe tener ~80 lineas aproximadamente (~30 SQL + ~50 comentarios).

    **Paso 4 — Verificar que la funcion `update_updated_at_column()` existe en el schema** (NO se aplica, solo lectura):
    ```bash
    grep -rn "CREATE OR REPLACE FUNCTION update_updated_at_column" supabase/migrations/ | head -3
    ```
    Debe matchear al menos `20260205000000_agent_sessions.sql:115` u otra migracion de phase anterior. Si NO existe en el codebase, BLOCKER — investigar antes de continuar.

    **Paso 5 — Commit LOCAL (NO push) + NO apply:**
    ```bash
    git add supabase/migrations/20260428000000_agent_audit_sessions.sql
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 1 — migration agent_audit_sessions (D-17)

Schema multi-turn auditor persistence:
- 13 columnas: id, turn_id, workspace_id, user_id, responding_agent_id,
  conversation_id, hypothesis, messages JSONB, system_prompt,
  total_turns_in_context, trimmed_count, cost_usd, created_at, updated_at
- 2 indices: (workspace_id, conversation_id, created_at DESC) y (turn_id, created_at DESC)
- updated_at trigger via update_updated_at_column() existente
- GRANT ALL TO service_role (LEARNING Phase 44.1)
- Sin RLS — server-only via createAdminClient + assertSuperUser

Regla 5 strict: NO se aplica todavia. Task 2 es checkpoint humano bloqueante
para apply en Supabase prod ANTES de cualquier codigo runtime que use la tabla.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```

    **NO HACER `git push` aqui.** El push final es Task 12.

    **Paso 6 — Confirmar que la migracion NO se aplico todavia:**
    ```bash
    git log --oneline -1
    # Debe mostrar el commit de Plan 05 Task 1.
    ```
    Confirmar que el codigo runtime de Tasks 3+ NO existe todavia (no hay archivos en `src/lib/agent-forensics/audit-session-store.ts` etc.):
    ```bash
    test ! -f src/lib/agent-forensics/audit-session-store.ts && echo "Task 3+ aun no creado, OK"
    ```
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260428000000_agent_audit_sessions.sql</automated>
    <automated>grep -q "CREATE TABLE IF NOT EXISTS agent_audit_sessions" supabase/migrations/20260428000000_agent_audit_sessions.sql</automated>
    <automated>grep -q "system_prompt" supabase/migrations/20260428000000_agent_audit_sessions.sql && grep -q "total_turns_in_context" supabase/migrations/20260428000000_agent_audit_sessions.sql && grep -q "trimmed_count" supabase/migrations/20260428000000_agent_audit_sessions.sql</automated>
    <automated>grep -q "idx_audit_sessions_workspace_conv" supabase/migrations/20260428000000_agent_audit_sessions.sql && grep -q "idx_audit_sessions_turn" supabase/migrations/20260428000000_agent_audit_sessions.sql</automated>
    <automated>grep -q "GRANT ALL ON TABLE public.agent_audit_sessions TO service_role" supabase/migrations/20260428000000_agent_audit_sessions.sql</automated>
    <automated>grep -q "update_updated_at_column" supabase/migrations/20260428000000_agent_audit_sessions.sql</automated>
    <automated>grep -q "BEGIN;" supabase/migrations/20260428000000_agent_audit_sessions.sql && grep -q "COMMIT;" supabase/migrations/20260428000000_agent_audit_sessions.sql</automated>
    <automated>grep -q "America/Bogota" supabase/migrations/20260428000000_agent_audit_sessions.sql</automated>
    <automated>git log -1 --oneline | grep -qi "plan 05 task 1"</automated>
    <automated>test ! -f src/lib/agent-forensics/audit-session-store.ts</automated>
  </verify>
  <acceptance_criteria>
    - Migration file existe en `supabase/migrations/20260428000000_agent_audit_sessions.sql` (timestamp puede ajustarse si colisiona).
    - Schema completo: 13 columnas + 2 indices + trigger updated_at + GRANT service_role + COMMENT.
    - Las 3 columnas adicionales (system_prompt, total_turns_in_context, trimmed_count) presentes (RESEARCH §5 justification).
    - `BEGIN;` + `COMMIT;` envuelven el body.
    - Comentario top-level explica Regla 5 + sin RLS rationale.
    - Verification query embebida como comentario al final.
    - Commit local creado con mensaje descriptivo.
    - **NO push, NO apply.**
    - Codigo runtime de Tasks 3+ NO existe todavia.
  </acceptance_criteria>
  <done>
    - Migration archivado en repo y committeado localmente. Task 2 puede empezar (checkpoint humano).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: CHECKPOINT HUMANO BLOQUEANTE — Regla 5 strict — usuario aplica SQL en Supabase prod + verifica + aprueba ANTES de Tasks 3+</name>
  <what-built>
    Migration SQL `supabase/migrations/20260428000000_agent_audit_sessions.sql` lista en repo (Task 1 commit local). Crea tabla `agent_audit_sessions` con 13 columnas + 2 indices + trigger updated_at + GRANT service_role. Sin RLS (server-only). El executor NO procede a Tasks 3+ (codigo runtime que importa de la tabla) sin aprobacion explicita del usuario que la migracion fue aplicada en prod.
  </what-built>
  <how-to-verify>
    **CRITICAL — Regla 5 strict (CLAUDE.md):** NO se puede pushear codigo que referencia tabla, columnas o constraints inexistentes en produccion. La unica forma segura es aplicar la migracion ANTES.

    **PASO 1 — Abrir Supabase SQL Editor de produccion:**

    1. Ir a https://supabase.com/dashboard/project/<production-project-id>/sql/new
    2. Confirmar que estas en el proyecto productivo de morfx.app (NO el dev / preview).

    **PASO 2 — Pegar y ejecutar el contenido del archivo `supabase/migrations/20260428000000_agent_audit_sessions.sql`:**

    Copiar TODO el contenido del bloque `BEGIN; ... COMMIT;` (NO copiar los comentarios `-- VERIFICATION QUERY` del final — esos se corren por separado en el siguiente paso).

    Click "Run". Resultado esperado: "Success. No rows returned." (silencioso).

    Si hay error de syntax o constraint conflict: PARA. Reportar el error al executor para fix antes de re-ejecutar.

    **PASO 3 — Correr verification query** (copiar de los comentarios del archivo de migracion):

    ```sql
    SELECT
      table_name,
      pg_size_pretty(pg_total_relation_size('public.agent_audit_sessions')) AS size,
      (SELECT COUNT(*) FROM agent_audit_sessions) AS row_count
    FROM information_schema.tables
    WHERE table_name = 'agent_audit_sessions';
    ```

    **Resultado esperado:**
    | table_name | size | row_count |
    |------------|------|-----------|
    | agent_audit_sessions | ~16 kB | 0 |

    **PASO 4 — Verificar GRANTs:**

    ```sql
    SELECT grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_name = 'agent_audit_sessions';
    ```

    **Resultado esperado:** Al menos 1 row con `grantee='service_role'` y `privilege_type` que incluya `INSERT`, `UPDATE`, `SELECT`, `DELETE` (o equivalente).

    **PASO 5 — Verificar trigger:**

    ```sql
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.agent_audit_sessions'::regclass
      AND NOT tgisinternal;
    ```

    **Resultado esperado:** 1 row con `tgname='agent_audit_sessions_updated_at'`.

    **PASO 6 — Verificar indices:**

    ```sql
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'agent_audit_sessions'
    ORDER BY indexname;
    ```

    **Resultado esperado:** 3 rows minimo:
    - `agent_audit_sessions_pkey` (PK auto)
    - `idx_audit_sessions_turn`
    - `idx_audit_sessions_workspace_conv`

    **PASO 7 — Reportar:**

    En la respuesta al checkpoint, incluir:
    - Captura o copia del output de los 4 verification queries (table info + grants + trigger + indices).
    - Confirmacion explicita: "migracion aplicada y verificada en prod, OK".
    - Cualquier issue (ej. "trigger no se creo" → BLOCKER, investigar funcion `update_updated_at_column()` en prod).
  </how-to-verify>
  <resume-signal>
    Pegar el output de los 4 verification queries + "aprobado" para que el executor proceda a Tasks 3+ (codigo runtime que importa de la tabla). Si hay issues (tabla no creada, grants ausentes, trigger missing, indice missing), describir el output exacto del SQL Editor para debug. **El executor NO procede sin aprobacion explicita.**
  </resume-signal>
  <acceptance_criteria>
    - Tabla `public.agent_audit_sessions` existe en prod con 13 columnas (verificable via `\d agent_audit_sessions` o information_schema).
    - GRANT `service_role` con privilegios de mutacion confirmado.
    - Trigger `agent_audit_sessions_updated_at` activo.
    - Indices `idx_audit_sessions_workspace_conv` + `idx_audit_sessions_turn` creados.
    - row_count = 0 (tabla vacia, lista para inserts).
    - Usuario explicitamente aprueba con "aprobado" o equivalente.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Crear `src/lib/agent-forensics/pricing.ts` + tests (constantes Sonnet 4.6 + calculateAuditCost)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §3 lineas 518-557 (pricing block + calculateAuditCost example)
    - Anthropic pricing publico al day-of-execution (A1 — planner sugiere confirmar con `npx --yes ctx7@latest` o web)
  </read_first>
  <behavior>
    - Test 1: `SONNET_4_6_PRICING.inputPerMTok === 3` y `SONNET_4_6_PRICING.outputPerMTok === 15`.
    - Test 2: `calculateAuditCost(0, 0) === 0`.
    - Test 3: `calculateAuditCost(1_000_000, 0) === 3` (1M input tokens → $3 exacto).
    - Test 4: `calculateAuditCost(0, 1_000_000) === 15` (1M output tokens → $15 exacto).
    - Test 5: `calculateAuditCost(50_000, 3_000)` ≈ `0.195` (cap maximo D-15: 50K input × $3/MTok + 3K output × $15/MTok).
    - Test 6: precision NUMERIC(10,6) compatible — el resultado tiene <= 6 decimales significativos.
  </behavior>
  <action>
    **Paso 1 — Test FIRST:**

    Crear `src/lib/agent-forensics/__tests__/pricing.test.ts`:
    ```typescript
    import { describe, it, expect } from 'vitest'
    import { SONNET_4_6_PRICING, calculateAuditCost } from '../pricing'

    describe('SONNET_4_6_PRICING constants (RESEARCH-plan-05 §3)', () => {
      it('input price is $3 per million tokens', () => {
        expect(SONNET_4_6_PRICING.inputPerMTok).toBe(3)
      })
      it('output price is $15 per million tokens', () => {
        expect(SONNET_4_6_PRICING.outputPerMTok).toBe(15)
      })
    })

    describe('calculateAuditCost (D-17 cost_usd persistence)', () => {
      it('returns 0 for zero usage', () => {
        expect(calculateAuditCost(0, 0)).toBe(0)
      })
      it('handles 1M input tokens exactly', () => {
        expect(calculateAuditCost(1_000_000, 0)).toBeCloseTo(3, 6)
      })
      it('handles 1M output tokens exactly', () => {
        expect(calculateAuditCost(0, 1_000_000)).toBeCloseTo(15, 6)
      })
      it('cap maximo D-15 (50K input + 3K output) returns ~$0.195', () => {
        // 50000 * 3 / 1_000_000 + 3000 * 15 / 1_000_000 = 0.15 + 0.045 = 0.195
        expect(calculateAuditCost(50_000, 3_000)).toBeCloseTo(0.195, 6)
      })
      it('result fits NUMERIC(10,6) — at most 6 decimals significant', () => {
        const cost = calculateAuditCost(1234, 567)
        expect(Number.isFinite(cost)).toBe(true)
        // Check it can be serialized to NUMERIC(10,6) without overflow
        expect(cost).toBeLessThan(10_000)  // 4 digits before decimal max
      })
    })
    ```

    Correr (RED):
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/pricing.test.ts
    ```

    **Paso 2 — Crear `src/lib/agent-forensics/pricing.ts`:**

    ```typescript
    /**
     * Pricing constants for the auditor (Sonnet 4.6).
     *
     * Source: RESEARCH-plan-05.md §3 lines 518-557.
     * [VERIFIED at 2026-04-25: Anthropic public pricing — $3/MTok input, $15/MTok output]
     * [ASSUMED A1: planner verifies pricing on day-of-execution via Anthropic Console
     *  before this task ships; if pricing changed, update SONNET_4_6_PRICING.]
     *
     * Used by `agent_audit_sessions.cost_usd` persistence (D-17).
     */

    export const SONNET_4_6_PRICING = {
      inputPerMTok: 3,
      outputPerMTok: 15,
    } as const

    /**
     * Calcula el costo USD de un round del auditor.
     * Resultado fits NUMERIC(10, 6) en DB.
     */
    export function calculateAuditCost(
      inputTokens: number,
      outputTokens: number,
    ): number {
      return (
        (inputTokens * SONNET_4_6_PRICING.inputPerMTok) / 1_000_000 +
        (outputTokens * SONNET_4_6_PRICING.outputPerMTok) / 1_000_000
      )
    }
    ```

    **Paso 3 — Tests GREEN + typecheck:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/pricing.test.ts
    npx tsc --noEmit 2>&1 | grep "agent-forensics/pricing" | wc -l
    ```
    Esperado: 6/6 tests verde + 0 errores TS.

    **Paso 4 — Commit local:**
    ```bash
    git add src/lib/agent-forensics/pricing.ts src/lib/agent-forensics/__tests__/pricing.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 3 — pricing.ts Sonnet 4.6 + calculateAuditCost (D-17)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agent-forensics/pricing.ts</automated>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/pricing.test.ts 2>&1 | grep -qE "6 passed|Test Files.*1 passed"</automated>
    <automated>grep -q "SONNET_4_6_PRICING" src/lib/agent-forensics/pricing.ts</automated>
    <automated>grep -q "calculateAuditCost" src/lib/agent-forensics/pricing.ts</automated>
    <automated>grep -q "inputPerMTok: 3" src/lib/agent-forensics/pricing.ts && grep -q "outputPerMTok: 15" src/lib/agent-forensics/pricing.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "agent-forensics/pricing" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `pricing.ts` exporta `SONNET_4_6_PRICING` (input=3, output=15) + `calculateAuditCost(input, output)`.
    - 6 tests verdes.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Pricing module listo. Task 6 (token-budget) y Task 9 (route handler onFinish) lo importan.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Crear `src/lib/agent-forensics/load-conversation-turns.ts` + tests (multi-turn loader con session-window + crm-reader inclusion + LIMIT 50)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §1 lineas 29-192 (query SQL + ventana temporal + opcion A/B + indices verified + crm-reader auto-inclusion + edge cases)
    - .planning/standalone/agent-forensics-panel/DISCUSSION-LOG.md D-14 + D-19
    - src/lib/observability/repository.ts:75-112 (listTurnsForConversation TEMPLATE — proyeccion + mapping)
    - src/lib/agent-forensics/load-session-snapshot.ts (template para 2-step query patron + createRawAdminClient)
    - src/lib/agent-forensics/__tests__/load-session-snapshot.test.ts (TEMPLATE de mock pattern via vi.hoisted + vi.mock createRawAdminClient)
    - supabase/migrations/20260408000000_observability_schema.sql:67-72 (verificar partition + idx_turns_conversation existente — RESEARCH §1 dice cubre el query nuevo sin indice adicional)
  </read_first>
  <behavior>
    - Test 1: `loadConversationTurns(convId, anchor)` resuelve session activa primero — query agent_sessions con `is_active=true` ORDER BY `created_at DESC` LIMIT 1.
    - Test 2: Si session existe, usa `session.created_at` como lower bound + `now+60s` como upper bound, retorna turns ordenados ASC.
    - Test 3: Si NO existe session (maybeSingle returns null), fallback a `[anchor - 7d, anchor + 1h]` window.
    - Test 4: Query incluye seleccion de `responding_agent_id` (turns con `crm-reader` aparecen sin filtro extra — D-19).
    - Test 5: ORDER BY `started_at ASC` + LIMIT 50.
    - Test 6: Si error de DB, throws (no swallow — el route handler decide que hacer).
    - Test 7: Mapping shape igual a `listTurnsForConversation` (campos camelCase + `respondingAgentId` defaultea a null cuando es DB NULL).
  </behavior>
  <action>
    **Paso 1 — Test FIRST:**

    Crear `src/lib/agent-forensics/__tests__/load-conversation-turns.test.ts` con `vi.hoisted` pattern (siguiendo `load-session-snapshot.test.ts`):

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    const mocks = vi.hoisted(() => {
      const fromMock = vi.fn()
      const createRawAdminClientMock = vi.fn(() => ({ from: fromMock }))
      return { fromMock, createRawAdminClientMock }
    })

    vi.mock('@/lib/supabase/admin', () => ({
      createRawAdminClient: mocks.createRawAdminClientMock,
    }))

    import { loadConversationTurns } from '../load-conversation-turns'

    describe('loadConversationTurns (D-14, D-19, RESEARCH §1)', () => {
      beforeEach(() => {
        vi.clearAllMocks()
      })

      it('uses session.created_at as lower bound when active session exists', async () => {
        // Mock query 1: agent_sessions returns a row
        const sessionChain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { created_at: '2026-04-23T10:00:00Z' },
            error: null,
          }),
        }
        // Mock query 2: agent_observability_turns returns turns
        const turnsChain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              { id: 't1', conversation_id: 'c1', workspace_id: 'w1', agent_id: 'somnio-v3', responding_agent_id: 'somnio-recompra-v1', started_at: '2026-04-23T10:01:00Z', finished_at: '2026-04-23T10:01:01Z', duration_ms: 1000, event_count: 5, query_count: 2, ai_call_count: 1, total_tokens: 100, total_cost_usd: 0.001, error: null, trigger_kind: 'user_message', current_mode: null, new_mode: null },
            ],
            error: null,
          }),
        }
        mocks.fromMock
          .mockReturnValueOnce(sessionChain)
          .mockReturnValueOnce(turnsChain)

        const result = await loadConversationTurns('c1', '2026-04-23T11:00:00Z')

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('t1')
        expect(result[0].respondingAgentId).toBe('somnio-recompra-v1')
        // Lower bound = session.created_at
        expect(turnsChain.gte).toHaveBeenCalledWith('started_at', '2026-04-23T10:00:00Z')
      })

      it('falls back to 7-day window when no active session', async () => {
        const sessionChain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        const turnsChain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
        mocks.fromMock
          .mockReturnValueOnce(sessionChain)
          .mockReturnValueOnce(turnsChain)

        const anchor = '2026-04-23T10:00:00Z'
        await loadConversationTurns('c1', anchor)

        // Lower bound = anchor - 7 days
        const expectedLower = new Date(new Date(anchor).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        expect(turnsChain.gte).toHaveBeenCalledWith('started_at', expectedLower)
      })

      it('orders ASC and limits to 50', async () => {
        const sessionChain: any = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        const turnsChain: any = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
        mocks.fromMock.mockReturnValueOnce(sessionChain).mockReturnValueOnce(turnsChain)

        await loadConversationTurns('c1', '2026-04-23T10:00:00Z')

        expect(turnsChain.order).toHaveBeenCalledWith('started_at', { ascending: true })
        expect(turnsChain.limit).toHaveBeenCalledWith(50)
      })

      it('selects responding_agent_id (D-19 includes crm-reader auto)', async () => {
        const sessionChain: any = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        const turnsChain: any = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
        mocks.fromMock.mockReturnValueOnce(sessionChain).mockReturnValueOnce(turnsChain)

        await loadConversationTurns('c1', '2026-04-23T10:00:00Z')

        const selectCall = turnsChain.select.mock.calls[0][0] as string
        expect(selectCall).toContain('responding_agent_id')
        expect(selectCall).toContain('agent_id')
      })

      it('throws when query errors', async () => {
        const sessionChain: any = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        const turnsChain: any = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection refused' } }),
        }
        mocks.fromMock.mockReturnValueOnce(sessionChain).mockReturnValueOnce(turnsChain)

        await expect(
          loadConversationTurns('c1', '2026-04-23T10:00:00Z'),
        ).rejects.toBeDefined()
      })

      it('maps DB rows to TurnSummary shape (camelCase + null fallbacks)', async () => {
        const sessionChain: any = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        const turnsChain: any = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{
              id: 't2', conversation_id: 'c1', workspace_id: 'w1',
              agent_id: 'somnio-v3', responding_agent_id: null,
              started_at: '2026-04-23T10:00:00Z', finished_at: null,
              duration_ms: null, event_count: 0, query_count: 0,
              ai_call_count: 0, total_tokens: 0, total_cost_usd: '0',
              error: null, trigger_kind: null, current_mode: null, new_mode: null,
            }],
            error: null,
          }),
        }
        mocks.fromMock.mockReturnValueOnce(sessionChain).mockReturnValueOnce(turnsChain)

        const result = await loadConversationTurns('c1', '2026-04-23T10:00:00Z')

        expect(result[0].respondingAgentId).toBeNull()
        expect(result[0].hasError).toBe(false)
        expect(result[0].finishedAt).toBeNull()
        expect(result[0].totalCostUsd).toBe(0)
      })
    })
    ```

    Correr (RED):
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/load-conversation-turns.test.ts
    ```

    **Paso 2 — Crear `src/lib/agent-forensics/load-conversation-turns.ts`:**

    Source: RESEARCH-plan-05 §1 lines 138-183 (verbatim adapted).

    ```typescript
    /**
     * Load all turns of a conversation for the multi-turn auditor (Plan 05).
     *
     * Returns turns in chronological ASC order. Includes turns from ANY
     * responding_agent_id (D-19 — crm-reader turns appear automatically when
     * platform_config.somnio_recompra_crm_reader_enabled is on for the workspace).
     *
     * Window strategy (RESEARCH §1):
     *  - Step 1: try active session — narrow window from session.created_at.
     *  - Step 2 (fallback): 7-day window before audited turn anchor.
     *
     * Cap: 50 turns (Somnio sessions average 3-15 turns per RESEARCH §1).
     * Token budgeting (Task 6) applies further trimming if total exceeds 50K.
     *
     * Index: existing `idx_turns_conversation (conversation_id, started_at DESC)`
     * covers the query exactly (verified RESEARCH §1).
     */

    import { createRawAdminClient } from '@/lib/supabase/admin'
    import type { TurnSummary } from '@/lib/observability/repository'

    const TURNS_PROJECTION =
      'id, conversation_id, workspace_id, agent_id, responding_agent_id, started_at, finished_at, duration_ms, event_count, query_count, ai_call_count, total_tokens, total_cost_usd, error, trigger_kind, current_mode, new_mode'

    const MAX_TURNS = 50
    const FALLBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

    export async function loadConversationTurns(
      conversationId: string,
      startedAtAnchor: string,
    ): Promise<TurnSummary[]> {
      const supabase = createRawAdminClient()

      // Step 1: prefer active session window (narrow + correct)
      const sessionRes = await supabase
        .from('agent_sessions')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const sessionCreatedAt = (sessionRes.data?.created_at as string | undefined) ?? null

      const lowerBound = sessionCreatedAt
        ? sessionCreatedAt
        : new Date(new Date(startedAtAnchor).getTime() - FALLBACK_WINDOW_MS).toISOString()
      const upperBound = new Date(Date.now() + 60_000).toISOString()

      // Step 2: fetch turns ASC within window
      const { data, error } = await supabase
        .from('agent_observability_turns')
        .select(TURNS_PROJECTION)
        .eq('conversation_id', conversationId)
        .gte('started_at', lowerBound)
        .lte('started_at', upperBound)
        .order('started_at', { ascending: true })
        .limit(MAX_TURNS)

      if (error) throw error

      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
      return rows.map((r) => ({
        id: r.id as string,
        conversationId: r.conversation_id as string,
        workspaceId: r.workspace_id as string,
        agentId: r.agent_id as string,
        respondingAgentId: (r.responding_agent_id as string | null) ?? null,
        startedAt: r.started_at as string,
        finishedAt: (r.finished_at as string | null) ?? null,
        durationMs: (r.duration_ms as number | null) ?? null,
        eventCount: (r.event_count as number) ?? 0,
        queryCount: (r.query_count as number) ?? 0,
        aiCallCount: (r.ai_call_count as number) ?? 0,
        totalTokens: (r.total_tokens as number) ?? 0,
        totalCostUsd: Number(r.total_cost_usd ?? 0),
        hasError: r.error !== null && r.error !== undefined,
        triggerKind: (r.trigger_kind as string | null) ?? null,
        currentMode: (r.current_mode as string | null) ?? null,
        newMode: (r.new_mode as string | null) ?? null,
      }))
    }
    ```

    **Paso 3 — Tests GREEN + typecheck:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/load-conversation-turns.test.ts
    npx tsc --noEmit 2>&1 | grep "load-conversation-turns" | wc -l
    ```

    **Paso 4 — Commit local:**
    ```bash
    git add src/lib/agent-forensics/load-conversation-turns.ts src/lib/agent-forensics/__tests__/load-conversation-turns.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 4 — loadConversationTurns multi-turn loader (D-14, D-19)

Session-active window preferida + fallback 7d. Incluye crm-reader turns automaticamente.
LIMIT 50 (Somnio sesiones promedio 3-15). Reusa idx_turns_conversation existente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agent-forensics/load-conversation-turns.ts</automated>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/load-conversation-turns.test.ts 2>&1 | grep -qE "6 passed|Test Files.*1 passed"</automated>
    <automated>grep -q "loadConversationTurns" src/lib/agent-forensics/load-conversation-turns.ts</automated>
    <automated>grep -q "responding_agent_id" src/lib/agent-forensics/load-conversation-turns.ts</automated>
    <automated>grep -q "is_active" src/lib/agent-forensics/load-conversation-turns.ts</automated>
    <automated>grep -q "ascending: true" src/lib/agent-forensics/load-conversation-turns.ts</automated>
    <automated>grep -q "limit(MAX_TURNS\|limit(50" src/lib/agent-forensics/load-conversation-turns.ts</automated>
    <automated>grep -q "FALLBACK_WINDOW_MS\|7 \* 24 \* 60 \* 60 \* 1000" src/lib/agent-forensics/load-conversation-turns.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "load-conversation-turns" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `loadConversationTurns(conversationId, startedAtAnchor)` retorna `Promise<TurnSummary[]>`.
    - Step 1: query agent_sessions con is_active=true, lower bound = session.created_at si existe.
    - Step 2 fallback: lower bound = anchor - 7d.
    - Upper bound: now + 60s.
    - ORDER BY started_at ASC + LIMIT 50.
    - SELECT incluye `responding_agent_id` (crm-reader incluido automatico — D-19).
    - Mapping shape igual a `listTurnsForConversation` (camelCase + null fallbacks).
    - 6 tests verdes.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Multi-turn loader listo. Task 9 (route handler first-round) lo invoca.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Crear `src/lib/agent-forensics/condense-previous-turn.ts` + tests (pure function shape RESEARCH §2)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §2 lineas 196-385 (CondensedPreviousTurn shape + algoritmo extraccion + estimacion tokens)
    - src/lib/agent-forensics/condense-timeline.ts (CORE_CATEGORIES y patron de filter+map sobre `detail.events`)
    - src/lib/observability/repository.ts (TurnDetail / TurnDetailEvent types)
    - src/lib/agent-forensics/__tests__/condense-timeline.test.ts (TEMPLATE de stub TurnDetail para tests)
  </read_first>
  <behavior>
    - Test 1: Output incluye `turnId`, `startedAt`, `durationMs`, `respondingAgentId`, `entryAgentId`, `triggerKind`, `intent`, `intentConfidence`, `pipelineDecisions`, `templatesEnviados`, `modeTransitions`, `toolCalls`, `guards`, `stateChanges`, `hasError`, `totalTokens`, `totalCostUsd` (todos los campos del shape).
    - Test 2: `respondingAgentId` defaultea a `turn.agentId` cuando `turn.respondingAgentId` es null.
    - Test 3: `entryAgentId === turn.agentId` siempre.
    - Test 4: `intent` y `intentConfidence` extraidos del primer event con `category='comprehension'`; null si no existe.
    - Test 5: `pipelineDecisions` filtra events con `category='pipeline_decision'` y compacta payload solo con keys whitelist (action, agent, agentId, reason, intent, toAction).
    - Test 6: `templatesEnviados` flatMap de `payload.intents` de events con `category='template_selection'`.
    - Test 7: `modeTransitions` mapea events `category='mode_transition'` a `{from, to, reason?}`.
    - Test 8: `toolCalls` mapea events `category='tool_call'` a `{tool, status?}`.
    - Test 9: `guards` mapea events `category='guard'` a `{label, reason}`.
    - Test 10: `stateChanges.modeAtEnd` viene de `payload.modeAtEnd` del session_lifecycle event O `turn.newMode`.
    - Test 11: Si `turn.hasError`, `errorMessage` truncado a 200 chars.
    - Test 12: Pure function — mismo input dos veces da mismo output (no I/O, no time, no random).
  </behavior>
  <action>
    **Paso 1 — Test FIRST:**

    Crear `src/lib/agent-forensics/__tests__/condense-previous-turn.test.ts` con stubs de `TurnDetail` siguiendo el patron de `condense-timeline.test.ts`. Cubre los 12 cases listados en `<behavior>`.

    El stub helper:
    ```typescript
    function makeDetail(opts: {
      turnId?: string
      agentId?: string
      respondingAgentId?: string | null
      hasError?: boolean
      events?: Array<Partial<TurnDetailEvent>>
    } = {}): TurnDetail {
      return {
        turn: {
          id: opts.turnId ?? 't1',
          conversationId: 'c1',
          workspaceId: 'w1',
          agentId: opts.agentId ?? 'somnio-v3',
          respondingAgentId: opts.respondingAgentId ?? null,
          startedAt: '2026-04-23T10:00:00Z',
          finishedAt: '2026-04-23T10:00:01Z',
          durationMs: 1000,
          eventCount: opts.events?.length ?? 0,
          queryCount: 0,
          aiCallCount: 0,
          totalTokens: 100,
          totalCostUsd: 0.001,
          hasError: opts.hasError ?? false,
          triggerKind: 'user_message',
          currentMode: null,
          newMode: null,
          error: opts.hasError ? { name: 'Err', message: 'something failed', stack: '' } : null,
        },
        events: (opts.events ?? []).map((e, i) => ({
          id: `e${i}`,
          sequence: i,
          recordedAt: '2026-04-23T10:00:00Z',
          category: 'unknown',
          label: null,
          payload: {},
          durationMs: null,
          ...e,
        })) as TurnDetailEvent[],
        queries: [],
        aiCalls: [],
        promptVersionsById: {},
      }
    }
    ```

    Tests (12 cases del `<behavior>` arriba). Correr RED.

    **Paso 2 — Crear `src/lib/agent-forensics/condense-previous-turn.ts`** con el algoritmo verbatim de RESEARCH-plan-05 §2 lineas 302-377:

    ```typescript
    /**
     * Condense a previous turn into the lightly-condensed shape for multi-turn
     * auditor context (D-14, RESEARCH-plan-05 §2).
     *
     * Pure function: same TurnDetail input → same CondensedPreviousTurn output.
     * No I/O, no Date.now(), no random.
     *
     * Used in Plan 05 route handler first-round: maps each previous turn's
     * full TurnDetail into ~165 tokens of structured JSON. The audited turn
     * uses the FULL condenseTimeline + snapshot (heavier).
     */

    import type { TurnDetail } from '@/lib/observability/repository'

    export interface CondensedPreviousTurn {
      turnId: string
      startedAt: string
      durationMs: number | null
      respondingAgentId: string
      entryAgentId: string
      triggerKind: string | null
      intent: string | null
      intentConfidence: number | null
      pipelineDecisions: Array<{ label: string; payload: Record<string, unknown> }>
      templatesEnviados: string[]
      modeTransitions: Array<{ from: string; to: string; reason?: string }>
      toolCalls: Array<{ tool: string; status?: string }>
      guards: Array<{ label: string; reason: string }>
      stateChanges: { datosCapturadosAdded?: string[]; modeAtEnd?: string }
      hasError: boolean
      errorMessage?: string
      totalTokens: number
      totalCostUsd: number
    }

    const PIPELINE_PAYLOAD_KEYS = ['action', 'agent', 'agentId', 'reason', 'intent', 'toAction'] as const

    function slim(payload: unknown, keys: readonly string[]): Record<string, unknown> {
      if (!payload || typeof payload !== 'object') return {}
      const src = payload as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of keys) if (k in src) out[k] = src[k]
      return out
    }

    export function condensePreviousTurn(detail: TurnDetail): CondensedPreviousTurn {
      const turn = detail.turn
      const events = detail.events

      const comprehension = events.find((e) => e.category === 'comprehension')
      const cp = (comprehension?.payload ?? {}) as Record<string, unknown>

      const pipelineDecisions = events
        .filter((e) => e.category === 'pipeline_decision')
        .map((e) => ({
          label: e.label ?? 'unknown',
          payload: slim(e.payload, PIPELINE_PAYLOAD_KEYS),
        }))

      const templatesEnviados = events
        .filter((e) => e.category === 'template_selection')
        .flatMap((e) => {
          const intents = (e.payload as { intents?: unknown })?.intents
          return Array.isArray(intents) ? (intents as string[]) : []
        })

      const modeTransitions = events
        .filter((e) => e.category === 'mode_transition')
        .map((e) => {
          const p = (e.payload ?? {}) as Record<string, unknown>
          return {
            from: (p.from as string) ?? '?',
            to: (p.to as string) ?? '?',
            ...(p.reason ? { reason: p.reason as string } : {}),
          }
        })

      const toolCalls = events
        .filter((e) => e.category === 'tool_call')
        .map((e) => {
          const p = (e.payload ?? {}) as Record<string, unknown>
          return {
            tool: (p.tool as string) ?? e.label ?? 'unknown',
            ...(p.status ? { status: p.status as string } : {}),
          }
        })

      const guards = events
        .filter((e) => e.category === 'guard')
        .map((e) => ({
          label: e.label ?? 'guard',
          reason: ((e.payload as { reason?: string })?.reason ?? '') as string,
        }))

      const lifecycle = events.find((e) => e.category === 'session_lifecycle')
      const lp = (lifecycle?.payload ?? {}) as Record<string, unknown>

      const errorMessage = turn.hasError
        ? (((turn.error as { message?: string } | null)?.message) ?? 'unknown').slice(0, 200)
        : undefined

      return {
        turnId: turn.id,
        startedAt: turn.startedAt,
        durationMs: turn.durationMs,
        respondingAgentId: turn.respondingAgentId ?? turn.agentId,
        entryAgentId: turn.agentId,
        triggerKind: turn.triggerKind,
        intent: (cp.intent as string) ?? null,
        intentConfidence: (cp.confidence as number) ?? null,
        pipelineDecisions,
        templatesEnviados,
        modeTransitions,
        toolCalls,
        guards,
        stateChanges: {
          datosCapturadosAdded: Array.isArray(lp.dataAdded) ? (lp.dataAdded as string[]) : undefined,
          modeAtEnd: (lp.modeAtEnd as string) ?? turn.newMode ?? undefined,
        },
        hasError: turn.hasError,
        ...(errorMessage ? { errorMessage } : {}),
        totalTokens: turn.totalTokens,
        totalCostUsd: turn.totalCostUsd,
      }
    }
    ```

    **Paso 3 — Tests GREEN + typecheck:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/condense-previous-turn.test.ts
    npx tsc --noEmit 2>&1 | grep "condense-previous-turn" | wc -l
    ```

    **Paso 4 — Commit local:**
    ```bash
    git add src/lib/agent-forensics/condense-previous-turn.ts src/lib/agent-forensics/__tests__/condense-previous-turn.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 5 — condensePreviousTurn pure function (D-14)

Shape RESEARCH §2: ~165 tokens promedio por turn previo (vs ~6K para turn auditado).
Pure function — no I/O, no time, deterministic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agent-forensics/condense-previous-turn.ts</automated>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/condense-previous-turn.test.ts 2>&1 | grep -qE "12 passed|Test Files.*1 passed"</automated>
    <automated>grep -q "export interface CondensedPreviousTurn" src/lib/agent-forensics/condense-previous-turn.ts</automated>
    <automated>grep -q "condensePreviousTurn" src/lib/agent-forensics/condense-previous-turn.ts</automated>
    <automated>grep -q "respondingAgentId ?? turn.agentId\|turn.respondingAgentId ?? turn.agentId" src/lib/agent-forensics/condense-previous-turn.ts</automated>
    <automated>grep -q "PIPELINE_PAYLOAD_KEYS\|action.*agent.*reason" src/lib/agent-forensics/condense-previous-turn.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "condense-previous-turn" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `condensePreviousTurn(detail)` retorna `CondensedPreviousTurn` con todos los campos del shape RESEARCH §2.
    - Fallback `respondingAgentId ?? agentId` correcto.
    - Slim de pipeline_decision payload solo con keys whitelist.
    - Pure function (12 tests verdes incluido el determinismo).
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Condensador per-turn previo listo. Task 9 lo invoca via Promise.all sobre cada previous turn.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 6: Crear `src/lib/agent-forensics/token-budget.ts` + tests (estimateTokens + countTokensIfNeeded + truncateContext drop-oldest)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §3 lineas 388-557 (cap 50K + algoritmo hibrido + truncate + Pitfall 14)
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §3 lineas 422-490 (truncateContext code example)
    - package.json (verificar `@anthropic-ai/sdk` ^0.73.0 esta instalado)
    - src/lib/agent-forensics/condense-previous-turn.ts (Task 5 — CondensedPreviousTurn type)
  </read_first>
  <behavior>
    - **estimateTokens:**
      - Test 1: `estimateTokens('') === 0`.
      - Test 2: `estimateTokens('abc')` retorna `Math.ceil(3 / 2.8)` = 2.
      - Test 3: `estimateTokens('a'.repeat(2800))` retorna 1000 (cap exacto).
    - **truncateContext:**
      - Test 4: Si total fits dentro de cap, retorna todos los previousTurns + `trimmed: 0`.
      - Test 5: Si excede cap, drop oldest first — kept es chronological ASC pero seleccion fue newest-first hasta budget.
      - Test 6: El turn auditado (`auditedTurnId`) NUNCA se incluye en kept (filtrado out — el caller ya lo tiene).
      - Test 7: Si previousTurns esta vacio, retorna `{ kept: [], trimmed: 0 }`.
      - Test 8: Margen de seguridad de 2K tokens incluido (cap efectivo = capTokens - fixedCostTokens - 2000).
    - **countTokensIfNeeded:**
      - Test 9: Si `estimateTokens(system + user) <= threshold`, NO llama API, retorna `{ inputTokens: estimateLocal, usedApi: false }`.
      - Test 10: Si excede threshold, llama `client.messages.countTokens` y retorna `{ inputTokens: apiResult, usedApi: true }`.
      - Test 11 (mock): asserts el mock de `@anthropic-ai/sdk` se llamo con model `claude-sonnet-4-6` cuando crossed threshold.
  </behavior>
  <action>
    **Paso 1 — Test FIRST:** Crear `src/lib/agent-forensics/__tests__/token-budget.test.ts` con `vi.hoisted` mock para `@anthropic-ai/sdk` (cubre los 11 cases).

    Mock pattern:
    ```typescript
    const mocks = vi.hoisted(() => ({
      countTokensMock: vi.fn(),
    }))
    vi.mock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { countTokens: mocks.countTokensMock },
      })),
    }))
    ```

    Correr RED.

    **Paso 2 — Crear `src/lib/agent-forensics/token-budget.ts`** con las 3 funciones (verbatim de RESEARCH §3):

    ```typescript
    /**
     * Token budgeting for the multi-turn auditor (D-15, RESEARCH-plan-05 §3).
     *
     * Strategy hibrida (Pitfall 14):
     *  1. Local estimation `length / 2.8` (mix prosa-espanol + JSON) — zero latency.
     *  2. API call to Anthropic `/v1/messages/count_tokens` ONLY when local
     *     estimation > 40K (deja margen 20% para error de estimacion).
     *
     * Cap: 50K tokens TOTAL prompt (D-15). Si excede, truncar drop-oldest
     * preservando turn auditado.
     */

    import Anthropic from '@anthropic-ai/sdk'
    import type { CondensedPreviousTurn } from './condense-previous-turn'

    const CHARS_PER_TOKEN = 2.8                 // RESEARCH §3 mix espanol + JSON
    const DEFAULT_CAP_TOKENS = 50_000
    const SAFETY_MARGIN_TOKENS = 2_000
    const COUNT_TOKENS_THRESHOLD = 40_000        // estimate > this → API call

    export function estimateTokens(text: string): number {
      if (!text) return 0
      return Math.ceil(text.length / CHARS_PER_TOKEN)
    }

    export async function countTokensIfNeeded(
      systemPrompt: string,
      userMessage: string,
      threshold: number = COUNT_TOKENS_THRESHOLD,
    ): Promise<{ inputTokens: number; usedApi: boolean }> {
      const localEstimate = estimateTokens(systemPrompt) + estimateTokens(userMessage)
      if (localEstimate <= threshold) {
        return { inputTokens: localEstimate, usedApi: false }
      }
      // Crosses threshold — call API for precision
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY_TOOLS })
      const result = await client.messages.countTokens({
        model: 'claude-sonnet-4-6',
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      return { inputTokens: result.input_tokens, usedApi: true }
    }

    export function truncateContext(args: {
      previousTurns: CondensedPreviousTurn[]
      auditedTurnId: string
      fixedCostTokens: number
      capTokens?: number
    }): { kept: CondensedPreviousTurn[]; trimmed: number } {
      const cap = args.capTokens ?? DEFAULT_CAP_TOKENS
      const remainingBudget = cap - args.fixedCostTokens - SAFETY_MARGIN_TOKENS

      // Always exclude audited turn from "previous" set
      const candidates = args.previousTurns.filter((t) => t.turnId !== args.auditedTurnId)

      // Sort newest first for selection (drop oldest policy)
      const newestFirst = [...candidates].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      )

      const kept: CondensedPreviousTurn[] = []
      let used = 0
      for (const turn of newestFirst) {
        const cost = estimateTokens(JSON.stringify(turn))
        if (used + cost > remainingBudget) break
        kept.push(turn)
        used += cost
      }

      // Re-sort chronological ASC for the model
      kept.sort((a, b) => a.startedAt.localeCompare(b.startedAt))

      return {
        kept,
        trimmed: candidates.length - kept.length,
      }
    }
    ```

    **Paso 3 — Tests GREEN + typecheck:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/token-budget.test.ts
    npx tsc --noEmit 2>&1 | grep "token-budget" | wc -l
    ```

    **Paso 4 — Commit local:**
    ```bash
    git add src/lib/agent-forensics/token-budget.ts src/lib/agent-forensics/__tests__/token-budget.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 6 — token-budget.ts (D-15, mitiga Pitfall 14)

estimateTokens (heuristica chars/2.8) + countTokensIfNeeded (API call solo si >40K)
+ truncateContext (drop-oldest preservando auditado, chronological ASC para modelo).

Cap 50K tokens. Margen seguridad 2K. ANTHROPIC_API_KEY_TOOLS env var.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agent-forensics/token-budget.ts</automated>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/token-budget.test.ts 2>&1 | grep -qE "11 passed|Test Files.*1 passed"</automated>
    <automated>grep -q "estimateTokens" src/lib/agent-forensics/token-budget.ts && grep -q "truncateContext" src/lib/agent-forensics/token-budget.ts && grep -q "countTokensIfNeeded" src/lib/agent-forensics/token-budget.ts</automated>
    <automated>grep -q "ANTHROPIC_API_KEY_TOOLS" src/lib/agent-forensics/token-budget.ts</automated>
    <automated>grep -q "claude-sonnet-4-6" src/lib/agent-forensics/token-budget.ts</automated>
    <automated>grep -q "DEFAULT_CAP_TOKENS = 50_000\|50_000\|50000" src/lib/agent-forensics/token-budget.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "token-budget" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - 3 funciones exportadas: `estimateTokens`, `countTokensIfNeeded`, `truncateContext`.
    - Cap default 50K, threshold default 40K, safety margin 2K.
    - Drop-oldest policy preserva turn auditado.
    - Re-sort chronological ASC para el modelo.
    - 11 tests verdes.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Token budget listo. Task 9 (route handler) lo invoca antes de streamText.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 7: Crear `src/lib/agent-forensics/audit-session-store.ts` + tests (CRUD via createRawAdminClient — depende de Task 2 SQL aplicado)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §5 (schema + Pitfall 11 onFinish persistence)
    - src/lib/supabase/admin.ts (createRawAdminClient — line 72)
    - src/lib/agent-forensics/load-session-snapshot.ts (TEMPLATE de createRawAdminClient + 2-step query)
    - **PRE-REQUISITO:** Task 2 checkpoint humano APROBADO (tabla existe en prod).
  </read_first>
  <behavior>
    - **createAuditSession:**
      - Test 1: Llama `.from('agent_audit_sessions').insert(...)` con todos los campos requeridos.
      - Test 2: Insert payload usa snake_case keys (mapping de TS camelCase a SQL).
      - Test 3: Retorna `{ id }` extraido del row insertado (`.select('id').single()`).
      - Test 4: Si insert error, throws.
    - **appendToAuditSession:**
      - Test 5: Llama `.from('agent_audit_sessions').update(...).eq('id', id)` con `messages` y `cost_usd = previous + delta`.
      - Test 6: Hace SELECT primero para obtener cost_usd actual, luego UPDATE con suma.
      - Test 7: Si row no existe (count=0 actualizado), throws explicit error.
    - **loadAuditSession:**
      - Test 8: Llama `.from('agent_audit_sessions').select('*').eq('id', id).maybeSingle()`.
      - Test 9: Retorna `null` si maybeSingle data es null.
      - Test 10: Mapea row snake_case a TS camelCase shape `AuditSessionRow`.
  </behavior>
  <action>
    **Paso 1 — Test FIRST:** Crear `src/lib/agent-forensics/__tests__/audit-session-store.test.ts` con `vi.hoisted` + `vi.mock('@/lib/supabase/admin')` siguiendo el patron de `load-session-snapshot.test.ts`.

    **Paso 2 — Crear `src/lib/agent-forensics/audit-session-store.ts`:**

    ```typescript
    /**
     * CRUD for `agent_audit_sessions` (D-17).
     *
     * Server-only — uses `createRawAdminClient` (sin RLS, sin obs wrapper recursion).
     * Caller must enforce super-user gate (assertSuperUser).
     *
     * Migration: supabase/migrations/20260428000000_agent_audit_sessions.sql
     *  applied via Plan 05 Task 2 checkpoint humano (Regla 5 strict).
     */

    import { createRawAdminClient } from '@/lib/supabase/admin'

    export interface AuditSessionRow {
      id: string
      turnId: string
      workspaceId: string
      userId: string
      respondingAgentId: string
      conversationId: string
      hypothesis: string | null
      messages: unknown[]
      systemPrompt: string
      totalTurnsInContext: number
      trimmedCount: number
      costUsd: number
      createdAt: string
      updatedAt: string
    }

    export async function createAuditSession(args: {
      turnId: string
      workspaceId: string
      userId: string
      conversationId: string
      respondingAgentId: string
      hypothesis: string | null
      messages: unknown[]
      systemPrompt: string
      totalTurnsInContext: number
      trimmedCount: number
      costUsd: number
    }): Promise<{ id: string }> {
      const supabase = createRawAdminClient()
      const { data, error } = await supabase
        .from('agent_audit_sessions')
        .insert({
          turn_id: args.turnId,
          workspace_id: args.workspaceId,
          user_id: args.userId,
          conversation_id: args.conversationId,
          responding_agent_id: args.respondingAgentId,
          hypothesis: args.hypothesis,
          messages: args.messages,
          system_prompt: args.systemPrompt,
          total_turns_in_context: args.totalTurnsInContext,
          trimmed_count: args.trimmedCount,
          cost_usd: args.costUsd,
        })
        .select('id')
        .single()

      if (error) throw error
      return { id: (data as { id: string }).id }
    }

    export async function appendToAuditSession(
      id: string,
      args: { messages: unknown[]; costUsdDelta: number },
    ): Promise<void> {
      const supabase = createRawAdminClient()

      // Read current cost_usd to add delta atomically-from-app perspective.
      // (Race: if 2 follow-ups race, the second loses cost; acceptable since
      // UI disables input during streaming — see Pitfall 11.)
      const { data: existing, error: readErr } = await supabase
        .from('agent_audit_sessions')
        .select('cost_usd')
        .eq('id', id)
        .maybeSingle()

      if (readErr) throw readErr
      if (!existing) throw new Error(`Audit session not found: ${id}`)

      const newCost = Number(existing.cost_usd ?? 0) + args.costUsdDelta

      const { error: updateErr } = await supabase
        .from('agent_audit_sessions')
        .update({
          messages: args.messages,
          cost_usd: newCost,
          updated_at: new Date().toISOString(),  // trigger also covers this; explicit for safety
        })
        .eq('id', id)

      if (updateErr) throw updateErr
    }

    export async function loadAuditSession(id: string): Promise<AuditSessionRow | null> {
      const supabase = createRawAdminClient()
      const { data, error } = await supabase
        .from('agent_audit_sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      const r = data as Record<string, unknown>
      return {
        id: r.id as string,
        turnId: r.turn_id as string,
        workspaceId: r.workspace_id as string,
        userId: r.user_id as string,
        respondingAgentId: r.responding_agent_id as string,
        conversationId: r.conversation_id as string,
        hypothesis: (r.hypothesis as string | null) ?? null,
        messages: (r.messages as unknown[]) ?? [],
        systemPrompt: r.system_prompt as string,
        totalTurnsInContext: (r.total_turns_in_context as number) ?? 0,
        trimmedCount: (r.trimmed_count as number) ?? 0,
        costUsd: Number(r.cost_usd ?? 0),
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      }
    }
    ```

    **Paso 3 — Tests GREEN + typecheck + commit local:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/audit-session-store.test.ts
    npx tsc --noEmit 2>&1 | grep "audit-session-store" | wc -l
    git add src/lib/agent-forensics/audit-session-store.ts src/lib/agent-forensics/__tests__/audit-session-store.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 7 — audit-session-store CRUD (D-17)

createAuditSession (insert + return id) + appendToAuditSession (read+sum+update)
+ loadAuditSession (select maybeSingle + map to camelCase). Server-only via
createRawAdminClient. Tabla creada via Plan 05 Task 2 checkpoint Regla 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agent-forensics/audit-session-store.ts</automated>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/audit-session-store.test.ts 2>&1 | grep -qE "10 passed|Test Files.*1 passed"</automated>
    <automated>grep -q "createAuditSession" src/lib/agent-forensics/audit-session-store.ts && grep -q "appendToAuditSession" src/lib/agent-forensics/audit-session-store.ts && grep -q "loadAuditSession" src/lib/agent-forensics/audit-session-store.ts</automated>
    <automated>grep -q "createRawAdminClient" src/lib/agent-forensics/audit-session-store.ts</automated>
    <automated>grep -q "agent_audit_sessions" src/lib/agent-forensics/audit-session-store.ts</automated>
    <automated>grep -q "system_prompt" src/lib/agent-forensics/audit-session-store.ts && grep -q "total_turns_in_context" src/lib/agent-forensics/audit-session-store.ts && grep -q "trimmed_count" src/lib/agent-forensics/audit-session-store.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "audit-session-store" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - 3 funciones exportadas: createAuditSession (insert + return id), appendToAuditSession (read cost + sum + update), loadAuditSession (select maybeSingle).
    - Mapping camelCase ↔ snake_case correcto.
    - Type `AuditSessionRow` exportado.
    - 10 tests verdes.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Storage listo. Task 9 (route handler onFinish) lo invoca.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 8: Extender `src/lib/agent-forensics/auditor-prompt.ts` — agregar `buildAuditorPromptV2` con multi-turn + hipotesis + anti-falso-positivo (mantiene Plan 04 v1)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §7 lineas 1060-1191 (texto exacto del system prompt extendido + dual placement de hipotesis + mental tests)
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §8 lineas 1195-1230 (ANTI-FALSO-POSITIVO directive)
    - src/lib/agent-forensics/auditor-prompt.ts (Plan 04 v1 — mantener `buildAuditorPrompt` exportado para retrocompat)
    - src/lib/agent-forensics/__tests__/auditor-prompt.test.ts (extender, no reemplazar)
    - src/lib/agent-forensics/condense-previous-turn.ts (Task 5 — CondensedPreviousTurn type)
  </read_first>
  <behavior>
    **Tests existentes (Plan 04) deben seguir verdes** — `buildAuditorPrompt` v1 NO se modifica.

    **Tests nuevos para `buildAuditorPromptV2`:**
    - Test V2-1: System prompt INCLUYE los 4 headers obligatorios del v1 (Resumen / Evidencia / Discrepancias / Proximos pasos) Y la NO-invent rule.
    - Test V2-2: System prompt INCLUYE bloque "CONTEXTO MULTI-TURN:" mencionando turns previos + crm-reader + snapshot mutable.
    - Test V2-3: System prompt INCLUYE bloque "ANTI-FALSO-POSITIVO:" mencionando "lista hipotesis benignas y descartalas explicitamente".
    - Test V2-4: Cuando `hypothesis === null`, system prompt NO incluye "HIPOTESIS DEL USUARIO".
    - Test V2-5: Cuando `hypothesis !== null`, system prompt INCLUYE "HIPOTESIS DEL USUARIO" + el texto del usuario + directiva "Investiga ESPECIFICAMENTE si esta hipotesis es correcta".
    - Test V2-6: User message INCLUYE el spec body + JSON code-fence con `previousTurns` + JSON code-fence con `condensed` (turn auditado) + JSON code-fence con `snapshot`.
    - Test V2-7: Cuando `hypothesis !== null`, user message TAMBIEN incluye bloque `## Hipótesis del usuario` (dual placement RESEARCH §7).
    - Test V2-8: Cuando `hypothesis === null`, user message NO incluye bloque hipotesis.
    - Test V2-9: User message incluye instruccion final "Afirma o refuta la hipotesis" SOLO cuando hypothesis !== null.
    - Test V2-10: Fallback `respondingAgentId ?? agentId` preservado del v1.
  </behavior>
  <action>
    **Paso 1 — Tests FIRST:** Extender `src/lib/agent-forensics/__tests__/auditor-prompt.test.ts` con un nuevo `describe('buildAuditorPromptV2 — multi-turn + hipotesis + anti-falso-positivo')` con los 10 tests del `<behavior>`. Los stubs de spec/condensed/snapshot/turn pueden reusar los del v1; agregar stub `previousTurnsStub` con 2 CondensedPreviousTurn.

    Correr RED.

    **Paso 2 — Editar `src/lib/agent-forensics/auditor-prompt.ts`:**

    NO modificar `buildAuditorPrompt` (v1) — mantenerlo intacto para retrocompat.

    AGREGAR al final del archivo:

    ```typescript
    import type { CondensedPreviousTurn } from './condense-previous-turn'

    const SYSTEM_PROMPT_V2_BASE = `Eres un auditor técnico de agentes conversacionales. Tu trabajo es analizar el comportamiento de un bot en un turno específico y diagnosticar si respondió como debería, con base en su spec.

SIEMPRE respondes en markdown con la siguiente estructura:

# Diagnóstico: {nombre del bot}

## Resumen
Un párrafo (máximo 3 líneas) con el veredicto: ¿el comportamiento está dentro o fuera de lo esperado?

## Evidencia del timeline
Lista de hechos observados, citando eventos específicos con formato: \`event · label · payload\`.

## Discrepancias con la spec
Por cada discrepancia:
- **Descripción:** qué esperaba la spec vs. qué ocurrió.
- **Pointer:** archivo:línea donde está el código implicado (ej. \`src/lib/agents/somnio-recompra/response-track.ts:36\`).
- **Hipótesis:** causa probable.

## Próximos pasos
Bullet list de acciones concretas pegables a Claude Code para investigar/arreglar. Usa formato imperativo.

REGLAS:
- NUNCA inventes events/queries que no estén en el timeline dado.
- NUNCA inventes archivos/líneas — usa SOLO los pointers que aparecen en la spec.
- Si no hay discrepancias, dilo explícitamente en la sección "Discrepancias" ("Ninguna detectada.").
- El output debe ser pegable directamente a Claude Code sin edición humana.

CONTEXTO MULTI-TURN:
- El usuario te entrega contexto de TODOS los turns previos de la sesión conversacional (no solo el turn auditado).
- Los turns previos incluyen también turns de \`crm-reader\` cuando existen — son fuente de datos del agente principal, NO ruido.
- Usa el contexto multi-turn para entender la línea narrativa de la conversación: qué intent vino antes, qué template se mandó, qué datos capturó el agente. Cita turns previos por su \`turnId\` cuando son relevantes a la discrepancia.
- El \`session_state\` snapshot que ves es el estado ACTUAL (mutable), no el del momento exacto del turn auditado. Si tu diagnóstico depende del estado-en-momento-del-turn, dilo explícitamente.

ANTI-FALSO-POSITIVO:
- Antes de marcar algo como anomalía o "comportamiento sospechoso", lista hipótesis benignas que explicarían lo observado: timing async (eventos POST-runner que no bloquean respuesta), fallback de sesión nueva (datos vacíos por diseño), fuente alternativa de datos (crm-reader populando contexto en turn paralelo), arquitectura por diseño documentada en la spec.
- Descártalas EXPLÍCITAMENTE con evidencia del timeline o spec antes de afirmar que hay anomalía.
- Si una hipótesis benigna NO se puede descartar con la evidencia disponible, declara la observación como AMBIGUA y pide al usuario información adicional en "Próximos pasos", en vez de afirmar que es bug.`

    function buildSystemPromptV2(args: { hypothesis: string | null }): string {
      let prompt = SYSTEM_PROMPT_V2_BASE
      if (args.hypothesis && args.hypothesis.trim().length > 0) {
        prompt += `

HIPÓTESIS DEL USUARIO:
El usuario sospecha lo siguiente sobre el comportamiento del bot:

> ${args.hypothesis.trim()}

Investiga ESPECÍFICAMENTE si esta hipótesis es correcta o incorrecta. En "Resumen", afirma o refuta la hipótesis del usuario en la primera oración. En "Evidencia del timeline", prioriza eventos relevantes a la hipótesis. Si la hipótesis es incorrecta, explica brevemente qué pasó realmente. Si es correcta, profundiza en por qué y dónde está el código implicado.`
      }
      return prompt
    }

    /**
     * Plan 05 — multi-turn auditor prompt builder (D-14, D-16, D-19, RESEARCH §7+§8).
     *
     * Differs from `buildAuditorPrompt` (v1) in:
     *  - System prompt extends with CONTEXTO MULTI-TURN + ANTI-FALSO-POSITIVO blocks.
     *  - System prompt conditionally appends HIPOTESIS DEL USUARIO when hypothesis is present.
     *  - User message includes JSON code-fence with `previousTurns` (lightly condensed).
     *  - User message dual-places hypothesis block (system defines posture, user defines focus).
     *
     * Maintains the 4 mandatory headers + NO-invent rule from v1.
     */
    export function buildAuditorPromptV2(args: {
      spec: string
      previousTurns: CondensedPreviousTurn[]
      condensed: CondensedTimelineItem[]
      snapshot: unknown
      turn: TurnSummary
      hypothesis: string | null
    }): { systemPrompt: string; userMessage: string } {
      const systemPrompt = buildSystemPromptV2({ hypothesis: args.hypothesis })
      const respondingAgent = args.turn.respondingAgentId ?? args.turn.agentId
      const hypothesisTrimmed = args.hypothesis?.trim() || null

      const userMessage = `## Spec del bot (fuente de verdad de comportamiento esperado)

${args.spec}

${hypothesisTrimmed ? `---\n\n## Hipótesis del usuario\n\n> ${hypothesisTrimmed}\n\n` : ''}---

## Turn analizado

- **ID:** ${args.turn.id}
- **Conversation:** ${args.turn.conversationId}
- **Entry agent (routing):** ${args.turn.agentId}
- **Responding agent:** ${respondingAgent}
- **Trigger:** ${args.turn.triggerKind}
- **Duration:** ${args.turn.durationMs ?? '—'}ms
- **Tokens:** ${args.turn.totalTokens}
- **Cost:** $${args.turn.totalCostUsd.toFixed(6)}
- **Error:** ${args.turn.hasError ? 'SÍ (ver timeline)' : 'No'}

## Turns previos de la sesión (orden cronológico, ligeramente condensados)

\`\`\`json
${JSON.stringify(args.previousTurns, null, 2)}
\`\`\`

## Timeline condensado del turn auditado

\`\`\`json
${JSON.stringify(args.condensed, null, 2)}
\`\`\`

## Snapshot completo del session_state

\`\`\`json
${JSON.stringify(args.snapshot, null, 2)}
\`\`\`

---

Analiza este turno contra la spec, considerando los turns previos como contexto narrativo. ${hypothesisTrimmed ? 'Afirma o refuta la hipótesis del usuario en la sección "Resumen".' : ''} Emite tu diagnóstico en markdown siguiendo la estructura indicada en el system prompt.`

      return { systemPrompt, userMessage }
    }
    ```

    **Paso 3 — Tests GREEN + typecheck + commit:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/auditor-prompt.test.ts
    npx tsc --noEmit 2>&1 | grep "auditor-prompt" | wc -l
    git add src/lib/agent-forensics/auditor-prompt.ts src/lib/agent-forensics/__tests__/auditor-prompt.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 8 — buildAuditorPromptV2 (D-14, D-16, D-19)

System prompt extendido: CONTEXTO MULTI-TURN + ANTI-FALSO-POSITIVO + HIPOTESIS condicional.
User message dual-places hipotesis (system POSTURA, user FOCO).
Mantiene los 4 headers obligatorios + NO-invent rule del Plan 04 v1.
buildAuditorPrompt v1 sin cambios para retrocompat.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/auditor-prompt.test.ts 2>&1 | grep -qE "passed"</automated>
    <automated>grep -q "buildAuditorPromptV2" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>grep -q "CONTEXTO MULTI-TURN" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>grep -q "ANTI-FALSO-POSITIVO" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>grep -q "HIPÓTESIS DEL USUARIO\|HIPOTESIS DEL USUARIO" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>grep -q "Turns previos de la sesión" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>grep -q "buildAuditorPrompt(" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "auditor-prompt" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `buildAuditorPromptV2` exportada con signature `{ spec, previousTurns, condensed, snapshot, turn, hypothesis }`.
    - System prompt: 4 headers + NO-invent + CONTEXTO MULTI-TURN + ANTI-FALSO-POSITIVO + bloque hipotesis condicional.
    - User message: spec + hipotesis condicional + turn meta + previousTurns JSON + condensed JSON + snapshot JSON + instruccion final.
    - `buildAuditorPrompt` v1 intacta (Plan 04 sigue funcionando).
    - Tests existentes verdes + 10 nuevos tests V2 verdes.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Prompt builder v2 listo. Task 9 (route handler) lo invoca en first-round.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 9: Extender `src/app/api/agent-forensics/audit/route.ts` — first-round/follow-up branches + onFinish persistence + headers (mitiga Pitfalls 10, 11, 12, 13)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §4 lineas 561-754 (route handler completo + Promise.all paralelizacion + onFinish + headers + edge cases)
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §3 lineas 502-516 (X-Forensics-Trimmed header pattern)
    - src/app/api/agent-forensics/audit/route.ts (Plan 04 base — extender, NO reescribir desde cero)
    - src/app/api/agent-forensics/audit/__tests__/route.test.ts (extender)
    - src/app/api/builder/chat/route.ts (PRIMARY reference — convertToModelMessages + onFinish persistence pattern)
    - Modulos creados en Tasks 4-8 (loadConversationTurns, condensePreviousTurn, token-budget, audit-session-store, auditor-prompt v2)
  </read_first>
  <behavior>
    **Tests existentes Plan 04 deben seguir verdes** (cuando body no incluye nuevos campos, route hace first-round con messages=[]→[user con texto pesado]).

    **Tests nuevos:**
    - Test 11: First round (`auditSessionId === null`) — invoca `loadConversationTurns` + `Promise.all` getTurnDetail per-previous-turn + condensePreviousTurn + truncateContext + buildAuditorPromptV2.
    - Test 12: First round — onFinish llama `createAuditSession` con cost calculado de usage.
    - Test 13: First round con trimmed > 0 — response header `X-Forensics-Trimmed` setado.
    - Test 14: First round — response header `X-Audit-Session-Id` setado con UUID.
    - Test 15: Follow-up round (`auditSessionId !== null`) — invoca `loadAuditSession` + NO llama loadConversationTurns/getTurnDetail/buildAuditorPromptV2 (skip heavy assembly — Pitfall 13 mitigation).
    - Test 16: Follow-up — usa `system_prompt` cargado de DB.
    - Test 17: Follow-up — onFinish llama `appendToAuditSession` con messages + cost_usd_delta.
    - Test 18: Follow-up con auditSessionId que no existe → 404.
    - Test 19: First round con previous turns load via Promise.all — verifica que getTurnDetail se llamo en paralelo (Pitfall 12 mitigation — todas las calls antes del primer await individual).
    - Test 20: hypothesis llega como string vacio → tratado como null (no se incluye en prompt).
  </behavior>
  <action>
    **Paso 1 — Tests FIRST:** Extender `src/app/api/agent-forensics/audit/__tests__/route.test.ts` con mocks para los modulos nuevos (loadConversationTurns, condensePreviousTurn, truncateContext, buildAuditorPromptV2, audit-session-store) — pattern `vi.hoisted` + `vi.mock`. Los 10 tests nuevos del `<behavior>`.

    Correr RED.

    **Paso 2 — Reescribir `src/app/api/agent-forensics/audit/route.ts`** preservando los handlers Plan 04 (assertSuperUser + 403 + 500 catch) y agregando branches:

    ```typescript
    // src/app/api/agent-forensics/audit/route.ts
    //
    // Agent Forensics Auditor — multi-turn + hypothesis + persistence (Plan 05).
    // Extends Plan 04 base (single-turn audit) with:
    //   - First-round vs follow-up branching (auditSessionId === null detection).
    //   - Multi-turn context assembly (loadConversationTurns + Promise.all per-turn detail).
    //   - Token budgeting + truncate (drop oldest, keep audited).
    //   - Hypothesis injection (D-16 dual placement system + user message).
    //   - Persistence via agent_audit_sessions (D-17, Regla 5 strict — Task 2 applied SQL).
    //   - Headers X-Audit-Session-Id (first round) + X-Forensics-Trimmed (when trimmed > 0).
    //
    // Pitfalls mitigated:
    //   9  — useChat reset on transport change (handled UI-side Task 11)
    //   10 — onFinish + Vercel timeout (maxOutputTokens: 4096 keeps response ~30s)
    //   11 — assistant message during stream (UI disables input — Task 11)
    //   12 — getTurnDetail × N → Promise.all paralelizacion
    //   13 — snapshot mutable across rounds → persist system_prompt, follow-ups skip re-assembly
    //   14 — token counting rate limit → estimateTokens local first, API only > 40K
    //   15 — anti-false-positive directive in system prompt (RESEARCH §8)

    import { streamText, convertToModelMessages, type UIMessage } from 'ai'
    import { createAnthropic } from '@ai-sdk/anthropic'
    import { assertSuperUser } from '@/lib/auth/super-user'
    import { cookies } from 'next/headers'
    import { createClient } from '@/lib/supabase/server'
    import { getTurnDetail } from '@/lib/observability/repository'
    import { loadAgentSpec } from '@/lib/agent-forensics/load-agent-spec'
    import { loadSessionSnapshot } from '@/lib/agent-forensics/load-session-snapshot'
    import { condenseTimeline } from '@/lib/agent-forensics/condense-timeline'
    import { buildAuditorPromptV2 } from '@/lib/agent-forensics/auditor-prompt'
    import { loadConversationTurns } from '@/lib/agent-forensics/load-conversation-turns'
    import { condensePreviousTurn } from '@/lib/agent-forensics/condense-previous-turn'
    import { estimateTokens, truncateContext } from '@/lib/agent-forensics/token-budget'
    import {
      createAuditSession,
      appendToAuditSession,
      loadAuditSession,
    } from '@/lib/agent-forensics/audit-session-store'
    import { calculateAuditCost } from '@/lib/agent-forensics/pricing'

    interface AuditRequestBody {
      turnId: string
      startedAt: string
      respondingAgentId: string | null
      conversationId: string
      messages: UIMessage[]
      hypothesis: string | null
      auditSessionId: string | null
    }

    export async function POST(request: Request): Promise<Response> {
      try {
        await assertSuperUser()

        // Resolve current user id (needed for audit_session.user_id) — assertSuperUser
        // already verified the cookie maps to MORFX_OWNER_USER_ID.
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id ?? ''

        const body = (await request.json()) as AuditRequestBody
        const {
          turnId, startedAt, respondingAgentId, conversationId,
          messages, hypothesis, auditSessionId,
        } = body

        // Normalize hypothesis empty-string → null
        const normalizedHypothesis =
          hypothesis && hypothesis.trim().length > 0 ? hypothesis.trim() : null

        const isFirstRound = auditSessionId === null
        const anthropicTools = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY_TOOLS })

        if (isFirstRound) {
          // ============================================================
          // FIRST ROUND — heavy assembly + persist new audit session
          // ============================================================
          const detail = await getTurnDetail(turnId, startedAt)
          const effectiveAgentId = respondingAgentId ?? detail.turn.agentId

          const [spec, { snapshot }, conversationTurns] = await Promise.all([
            loadAgentSpec(effectiveAgentId),
            loadSessionSnapshot(conversationId),
            loadConversationTurns(conversationId, startedAt),
          ])

          // Condense previous turns in PARALLEL (Pitfall 12 mitigation)
          const previousTurnsRaw = conversationTurns.filter((t) => t.id !== turnId)
          const previousTurnsDetails = await Promise.all(
            previousTurnsRaw.map((t) => getTurnDetail(t.id, t.startedAt)),
          )
          const previousCondensedAll = previousTurnsDetails.map(condensePreviousTurn)

          // Audited turn — full timeline (Plan 04 condenseTimeline)
          const condensedAudited = condenseTimeline(detail, respondingAgentId)

          // Compute fixed cost for token budgeting
          const fixedCostTokens =
            estimateTokens(spec) +
            estimateTokens(JSON.stringify(snapshot)) +
            estimateTokens(JSON.stringify(condensedAudited)) +
            2_000 /* system prompt + meta */

          const { kept, trimmed } = truncateContext({
            previousTurns: previousCondensedAll,
            auditedTurnId: turnId,
            fixedCostTokens,
          })

          const { systemPrompt, userMessage } = buildAuditorPromptV2({
            spec,
            previousTurns: kept,
            condensed: condensedAudited,
            snapshot,
            turn: detail.turn,
            hypothesis: normalizedHypothesis,
          })

          // Replace messages[0] with the heavy first user message — useChat sent
          // a placeholder ('Auditar' or hypothesis text); we inject the full context.
          if (messages.length > 0) {
            messages[0] = {
              ...messages[0],
              parts: [{ type: 'text', text: userMessage }],
            } as UIMessage
          }

          // Pre-create audit session row so we have an id to return in headers BEFORE stream.
          // onFinish updates messages + cost when stream completes.
          const { id: newAuditSessionId } = await createAuditSession({
            turnId,
            workspaceId: detail.turn.workspaceId,
            userId,
            conversationId,
            respondingAgentId: respondingAgentId ?? detail.turn.agentId,
            hypothesis: normalizedHypothesis,
            messages,  // user message only at this point; assistant will be added in onFinish
            systemPrompt,
            totalTurnsInContext: kept.length,
            trimmedCount: trimmed,
            costUsd: 0,  // updated in onFinish
          })

          const modelMessages = await convertToModelMessages(messages)
          const result = streamText({
            model: anthropicTools('claude-sonnet-4-6'),
            system: systemPrompt,
            messages: modelMessages,
            temperature: 0.3,
            maxOutputTokens: 4096,
            onFinish: async ({ usage, response }) => {
              try {
                const inputTokens = usage?.inputTokens ?? 0
                const outputTokens = usage?.outputTokens ?? 0
                const turnCostUsd = calculateAuditCost(inputTokens, outputTokens)
                // Append assistant response message to the array we persisted
                const fullMessages = [...messages, ...((response?.messages ?? []) as unknown[])]
                await appendToAuditSession(newAuditSessionId, {
                  messages: fullMessages,
                  costUsdDelta: turnCostUsd,
                })
              } catch (err) {
                console.error('[agent-forensics/audit] onFinish persist failed (first round):', err)
              }
            },
          })

          const response = result.toUIMessageStreamResponse()
          response.headers.set('X-Audit-Session-Id', newAuditSessionId)
          if (trimmed > 0) {
            response.headers.set('X-Forensics-Trimmed', `${kept.length}/${kept.length + trimmed}`)
          }
          return response
        } else {
          // ============================================================
          // FOLLOW-UP ROUND — load system_prompt from DB, pass-through messages
          // ============================================================
          const session = await loadAuditSession(auditSessionId!)
          if (!session) {
            return new Response('Audit session not found', { status: 404 })
          }

          const modelMessages = await convertToModelMessages(messages)
          const result = streamText({
            model: anthropicTools('claude-sonnet-4-6'),
            system: session.systemPrompt,  // FROZEN ground truth (Pitfall 13)
            messages: modelMessages,
            temperature: 0.3,
            maxOutputTokens: 4096,
            onFinish: async ({ usage, response }) => {
              try {
                const inputTokens = usage?.inputTokens ?? 0
                const outputTokens = usage?.outputTokens ?? 0
                const turnCostUsd = calculateAuditCost(inputTokens, outputTokens)
                const fullMessages = [...messages, ...((response?.messages ?? []) as unknown[])]
                await appendToAuditSession(auditSessionId!, {
                  messages: fullMessages,
                  costUsdDelta: turnCostUsd,
                })
              } catch (err) {
                console.error('[agent-forensics/audit] onFinish persist failed (follow-up):', err)
              }
            },
          })

          return result.toUIMessageStreamResponse()
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'FORBIDDEN') {
          return new Response('Forbidden', { status: 403 })
        }
        console.error('[agent-forensics/audit] Error:', error)
        return Response.json(
          { error: error instanceof Error ? error.message : 'Internal server error' },
          { status: 500 },
        )
      }
    }
    ```

    **Paso 3 — Tests GREEN + typecheck + commit:**
    ```bash
    npx vitest run src/app/api/agent-forensics/audit/__tests__/route.test.ts
    npx tsc --noEmit 2>&1 | grep "agent-forensics/audit/route" | wc -l
    git add src/app/api/agent-forensics/audit/route.ts src/app/api/agent-forensics/audit/__tests__/route.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 9 — route v2 multi-turn + hipotesis + persistencia (D-14..D-19)

First-round (auditSessionId === null) → heavy assembly via Promise.all (Pitfall 12)
+ truncateContext + buildAuditorPromptV2 + createAuditSession + headers
X-Audit-Session-Id + X-Forensics-Trimmed.

Follow-up (auditSessionId !== null) → loadAuditSession (system_prompt frozen
ground truth — Pitfall 13) + pass-through messages + appendToAuditSession.

onFinish calcula cost via calculateAuditCost(usage.inputTokens, outputTokens)
y persiste fullMessages = [...userMessages, ...assistantResponse.messages].

Mitigates Pitfalls 9, 10, 11, 12, 13, 14, 15.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/app/api/agent-forensics/audit/__tests__/route.test.ts 2>&1 | grep -qE "passed"</automated>
    <automated>grep -q "auditSessionId" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "buildAuditorPromptV2" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "loadConversationTurns" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "Promise.all" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "createAuditSession" src/app/api/agent-forensics/audit/route.ts && grep -q "appendToAuditSession" src/app/api/agent-forensics/audit/route.ts && grep -q "loadAuditSession" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "X-Audit-Session-Id" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "X-Forensics-Trimmed" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "onFinish" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "calculateAuditCost" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "claude-sonnet-4-6" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "ANTHROPIC_API_KEY_TOOLS" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "agent-forensics/audit/route" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - Route handler distingue first-round (auditSessionId === null) vs follow-up (auditSessionId !== null).
    - First round: Promise.all spec + snapshot + loadConversationTurns + per-turn getTurnDetail paralelo + condensePreviousTurn + truncateContext + buildAuditorPromptV2 + createAuditSession.
    - Follow-up: loadAuditSession (404 si no existe) + system_prompt frozen + pass-through messages + appendToAuditSession.
    - onFinish persiste mensajes completos + cost_usd via calculateAuditCost.
    - Headers X-Audit-Session-Id (first round) + X-Forensics-Trimmed (cuando trimmed > 0).
    - hypothesis empty string → null (normalizada).
    - 403 FORBIDDEN gate intacto. 500 catch intacto.
    - Tests Plan 04 (6) + tests nuevos Plan 05 (10) verdes.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Route handler v2 listo. Tasks 10-11 son UI consumer.
  </done>
</task>

<task type="auto">
  <name>Task 10: Crear sub-componentes UI auxiliares para AuditorTab v2 — `audit-message.tsx` (renderiza user vs assistant bubbles) + `hypothesis-input.tsx` (Textarea pre-audit con char counter)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §6 lineas 963-1056 (componentes reusables + chat layout pattern + auto-scroll)
    - src/components/ui/textarea.tsx (shadcn Textarea)
    - src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx (auto-grow textarea reference)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx (Plan 04 component a reescribir en Task 11)
  </read_first>
  <action>
    **Paso 1 — Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/audit-message.tsx`:**

    Componente que renderiza un message individual (user a la derecha, assistant a la izquierda con ReactMarkdown). Recibe `{ role: 'user' | 'assistant', text: string }`. Para `assistant` usa ReactMarkdown + remarkGfm + `prose prose-sm dark:prose-invert max-w-none`. Para `user` muestra texto plano con bubble derecha.

    ```typescript
    'use client'

    import ReactMarkdown from 'react-markdown'
    import remarkGfm from 'remark-gfm'
    import { cn } from '@/lib/utils'

    interface AuditMessageProps {
      role: 'user' | 'assistant'
      text: string
      isStreaming?: boolean
    }

    export function AuditMessage({ role, text, isStreaming }: AuditMessageProps) {
      if (role === 'user') {
        return (
          <div className="flex justify-end mb-3">
            <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
              {text}
            </div>
          </div>
        )
      }
      return (
        <div className="flex justify-start mb-3">
          <div className={cn(
            "max-w-[95%] rounded-lg bg-muted/50 px-3 py-2",
            "prose prose-sm dark:prose-invert max-w-none",
            isStreaming && "opacity-90",
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        </div>
      )
    }
    ```

    **Paso 2 — Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/hypothesis-input.tsx`:**

    Textarea opcional con char counter (max 2000 — RESEARCH Open Item §3) + hint placeholder.

    ```typescript
    'use client'

    import { Textarea } from '@/components/ui/textarea'

    interface HypothesisInputProps {
      value: string
      onChange: (val: string) => void
      disabled: boolean
    }

    const MAX_CHARS = 2000

    export function HypothesisInput({ value, onChange, disabled }: HypothesisInputProps) {
      return (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Hipótesis (opcional) — el auditor la investigará específicamente
          </label>
          <Textarea
            value={value}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) onChange(e.target.value)
            }}
            placeholder='Ej: "el bot mandó promo cuando el cliente solo saludó, sin preguntar dirección"'
            disabled={disabled}
            className="min-h-12 text-sm"
          />
          <div className="flex justify-end text-[10px] text-muted-foreground font-mono">
            {value.length} / {MAX_CHARS}
          </div>
        </div>
      )
    }
    ```

    **Paso 3 — Verificar typecheck + commit local:**
    ```bash
    npx tsc --noEmit 2>&1 | grep -E "audit-message|hypothesis-input" | wc -l
    git add "src/app/(dashboard)/whatsapp/components/debug-panel-production/audit-message.tsx" \
            "src/app/(dashboard)/whatsapp/components/debug-panel-production/hypothesis-input.tsx"
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 10 — UI sub-componentes AuditMessage + HypothesisInput (D-16)

AuditMessage: bubble right (user plain) vs bubble left (assistant ReactMarkdown).
HypothesisInput: Textarea opcional con char counter (max 2000).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/whatsapp/components/debug-panel-production/audit-message.tsx"</automated>
    <automated>test -f "src/app/(dashboard)/whatsapp/components/debug-panel-production/hypothesis-input.tsx"</automated>
    <automated>grep -q "ReactMarkdown" "src/app/(dashboard)/whatsapp/components/debug-panel-production/audit-message.tsx"</automated>
    <automated>grep -q "MAX_CHARS = 2000\|MAX_CHARS = 2_000" "src/app/(dashboard)/whatsapp/components/debug-panel-production/hypothesis-input.tsx"</automated>
    <automated>grep -q "Textarea" "src/app/(dashboard)/whatsapp/components/debug-panel-production/hypothesis-input.tsx"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "audit-message|hypothesis-input" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - AuditMessage renderiza user/assistant correctamente.
    - HypothesisInput limita a 2000 chars + char counter visible.
    - TypeScript limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Sub-componentes listos. Task 11 los compone.
  </done>
</task>

<task type="auto">
  <name>Task 11: Reescribir `auditor-tab.tsx` — text-box hipotesis + chat continuo + reset al cambiar turn + capture headers (mitiga Pitfalls 9, 11)</name>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx (Plan 04 — punto de partida, REESCRIBIR completo)
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §6 (UI patterns + chat layout + reset)
    - .planning/standalone/agent-forensics-panel/RESEARCH-plan-05.md §3 lineas 502-516 (header capture pattern)
    - src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx (PRIMARY reference fetch wrapper headers + setMessages reset)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/audit-message.tsx (Task 10)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/hypothesis-input.tsx (Task 10)
  </read_first>
  <action>
    **Paso 1 — Reescribir `src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx`:**

    ```typescript
    'use client'

    /**
     * AuditorTab v2 — Plan 05 (agent-forensics-panel).
     *
     * Extiende Plan 04:
     *  - HypothesisInput pre-audit (D-16, opcional, max 2000 chars).
     *  - Chat continuo: tras primer audit, input "Pregunta de seguimiento"
     *    permite refinar (D-16, RESEARCH §6).
     *  - Reset completo al cambiar turnId (Pitfall 9).
     *  - Capture headers X-Audit-Session-Id (lift to body next request) + X-Forensics-Trimmed (warning UI).
     *  - Disable input durante streaming (Pitfall 11).
     *  - Persistencia transparente (server-side via Plan 05 Task 9).
     */

    import { useEffect, useMemo, useRef, useState } from 'react'
    import { useChat } from '@ai-sdk/react'
    import { DefaultChatTransport, type UIMessage } from 'ai'
    import { toast } from 'sonner'
    import { Copy, Play, Loader2, Send } from 'lucide-react'
    import { Button } from '@/components/ui/button'
    import { AuditMessage } from './audit-message'
    import { HypothesisInput } from './hypothesis-input'

    interface Props {
      turnId: string
      startedAt: string
      respondingAgentId: string | null
      conversationId: string
    }

    export function AuditorTab({
      turnId,
      startedAt,
      respondingAgentId,
      conversationId,
    }: Props) {
      const [hypothesis, setHypothesis] = useState('')
      const [auditSessionId, setAuditSessionId] = useState<string | null>(null)
      const [trimmedWarning, setTrimmedWarning] = useState<string | null>(null)
      const [followUpInput, setFollowUpInput] = useState('')
      const bottomRef = useRef<HTMLDivElement>(null)

      // Refs for fetch wrapper to read latest values without re-creating transport
      const auditSessionIdRef = useRef(auditSessionId)
      const hypothesisRef = useRef(hypothesis)
      useEffect(() => { auditSessionIdRef.current = auditSessionId }, [auditSessionId])
      useEffect(() => { hypothesisRef.current = hypothesis }, [hypothesis])

      // Transport — memoized per turn so navigation between turns resets state.
      // Pitfall 9: deps minimos y estables (turnId + identifying string fields, no callbacks).
      const transport = useMemo(
        () =>
          new DefaultChatTransport({
            api: '/api/agent-forensics/audit',
            body: () => ({
              turnId,
              startedAt,
              respondingAgentId,
              conversationId,
              hypothesis: auditSessionIdRef.current === null
                ? (hypothesisRef.current.trim() || null)
                : null,  // hypothesis only on first round
              auditSessionId: auditSessionIdRef.current,
            }),
            fetch: async (input, init) => {
              const response = await fetch(input, init)
              const newSessionId = response.headers.get('X-Audit-Session-Id')
              if (newSessionId && !auditSessionIdRef.current) {
                setAuditSessionId(newSessionId)
              }
              const trimmedHeader = response.headers.get('X-Forensics-Trimmed')
              if (trimmedHeader) {
                const [kept, total] = trimmedHeader.split('/')
                setTrimmedWarning(`Sesión grande — mostrando últimos ${kept} de ${total} turns previos al auditado`)
              } else {
                setTrimmedWarning(null)
              }
              return response
            },
          }),
        [turnId, startedAt, respondingAgentId, conversationId],
      )

      const { messages, sendMessage, setMessages, status, error } = useChat({ transport })
      const isStreaming = status === 'streaming' || status === 'submitted'

      // Reset al cambiar turn (Pitfall 9 mitigation + RESEARCH §6)
      useEffect(() => {
        setMessages([])
        setHypothesis('')
        setAuditSessionId(null)
        setTrimmedWarning(null)
        setFollowUpInput('')
      }, [turnId, setMessages])

      // Auto-scroll to bottom
      useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, [messages, status])

      const runAudit = () => {
        if (isStreaming) return
        const text = hypothesis.trim() || 'Auditar'
        sendMessage({ text })
      }

      const sendFollowUp = () => {
        if (isStreaming || !followUpInput.trim()) return
        sendMessage({ text: followUpInput.trim() })
        setFollowUpInput('')
      }

      const lastAssistantText = messages
        .filter((m) => m.role === 'assistant')
        .flatMap((m) => (m.parts ?? []).filter((p) => p.type === 'text').map((p: any) => p.text as string))
        .join('\n')

      const copyToClipboard = async () => {
        if (!lastAssistantText) return
        try {
          await navigator.clipboard.writeText(lastAssistantText)
          toast.success('Diagnóstico copiado al portapapeles')
        } catch {
          toast.error('No se pudo copiar al portapapeles')
        }
      }

      // Extract per-message text for rendering
      const messagesForRender: Array<{ id: string; role: 'user' | 'assistant'; text: string }> = messages
        .map((m) => {
          const text = (m.parts ?? [])
            .filter((p) => p.type === 'text')
            .map((p: any) => p.text as string)
            .join('\n')
          return { id: m.id, role: m.role as 'user' | 'assistant', text }
        })
        .filter((m) => m.text.length > 0)

      const hasMessages = messagesForRender.length > 0

      return (
        <div className="h-full flex flex-col min-h-0">
          {/* Top section: hypothesis + audit button (only when no messages yet) */}
          {!hasMessages && (
            <div className="px-3 py-3 border-b flex-shrink-0 space-y-2">
              <HypothesisInput
                value={hypothesis}
                onChange={setHypothesis}
                disabled={isStreaming}
              />
              <Button
                size="sm"
                onClick={runAudit}
                disabled={isStreaming}
                className="w-full h-8"
              >
                {isStreaming ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Auditando…</>
                ) : (
                  <><Play className="w-3.5 h-3.5 mr-1.5" /> Auditar sesión</>
                )}
              </Button>
            </div>
          )}

          {/* Action bar (only after first audit) */}
          {hasMessages && (
            <div className="px-3 py-2 border-b flex-shrink-0 flex items-center gap-2">
              {lastAssistantText.length > 0 && !isStreaming && (
                <Button size="sm" variant="outline" onClick={copyToClipboard} className="h-7">
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copiar último
                </Button>
              )}
              {isStreaming && (
                <span className="text-xs text-muted-foreground italic">
                  <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                  Analizando…
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                {messagesForRender.length} mensaje{messagesForRender.length === 1 ? '' : 's'}
              </span>
            </div>
          )}

          {/* Trimmed warning */}
          {trimmedWarning && (
            <div className="px-3 py-1 flex-shrink-0 text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-b">
              ⚠ {trimmedWarning}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="px-3 py-2 flex-shrink-0">
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                Error: {error.message}
              </div>
            </div>
          )}

          {/* Messages list (scrollable) */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {!hasMessages && !isStreaming && !error && (
              <div className="h-full flex items-center justify-center">
                <div className="text-xs text-muted-foreground italic text-center max-w-sm">
                  Escribe una hipótesis (opcional) y click &quot;Auditar sesión&quot; para que Claude Sonnet 4.6
                  analice este turn + los turns previos contra la spec del bot.
                </div>
              </div>
            )}
            {messagesForRender.map((m, idx) => (
              <AuditMessage
                key={m.id}
                role={m.role}
                text={m.text}
                isStreaming={isStreaming && idx === messagesForRender.length - 1 && m.role === 'assistant'}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Follow-up input (only after first audit completes) */}
          {hasMessages && (
            <div className="border-t bg-background px-3 py-2 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  value={followUpInput}
                  onChange={(e) => setFollowUpInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendFollowUp()
                    }
                  }}
                  placeholder="Pregunta de seguimiento (Enter para enviar)…"
                  disabled={isStreaming}
                  rows={1}
                  className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  style={{ minHeight: '36px', maxHeight: '96px' }}
                />
                <Button
                  size="sm"
                  onClick={sendFollowUp}
                  disabled={isStreaming || !followUpInput.trim()}
                  className="h-9 w-9 p-0"
                >
                  {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      )
    }
    ```

    **Paso 2 — Verificar typecheck + suite full + commit local:**
    ```bash
    npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -c "error TS"
    npx vitest run 2>&1 | tail -10
    git add "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"
    git commit -m "feat(agent-forensics-panel): Plan 05 Task 11 — AuditorTab v2 reescrita (D-14, D-16, D-17)

HypothesisInput pre-audit (text-box opcional max 2000 chars) + chat continuo
con AuditMessage bubbles (user derecha plano, assistant izquierda ReactMarkdown).
Reset completo al cambiar turnId (Pitfall 9). Disable input durante streaming
(Pitfall 11). Capture X-Audit-Session-Id → lift a body siguiente request.
Capture X-Forensics-Trimmed → muestra warning amber.

Sub-componentes Task 10: AuditMessage + HypothesisInput.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>grep -q "HypothesisInput" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "AuditMessage" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "Pregunta de seguimiento" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "X-Audit-Session-Id" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "X-Forensics-Trimmed" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "setMessages(\[\])\|setMessages(\\[\\])" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "setHypothesis('')" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "setAuditSessionId(null)" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -c "error TS" | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - AuditorTab v2 incluye: HypothesisInput pre-audit, boton "Auditar sesión", chat continuo con AuditMessage bubbles, follow-up textarea (Enter envia, Shift+Enter newline), Copiar último.
    - Reset completo al cambiar turnId (5 setters).
    - fetch wrapper captura X-Audit-Session-Id + X-Forensics-Trimmed.
    - Body callback envia hypothesis solo en first round (auditSessionIdRef === null).
    - Disable input durante streaming.
    - Auto-scroll a bottom.
    - TypeScript suite limpia.
    - Commit local.
  </acceptance_criteria>
  <done>
    - UI v2 lista. Task 12 verifica end-to-end en prod.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 12: Push atomico + checkpoint humano final — smoke test productivo end-to-end (text-box + multi-turn + chat continuo + persistencia DB)</name>
  <what-built>
    Plan 05 completo (Tasks 1-11): migration `agent_audit_sessions` aplicada en prod (Task 2 checkpoint), 5 modulos library nuevos (pricing, loadConversationTurns, condensePreviousTurn, token-budget, audit-session-store), auditor-prompt extendido con buildAuditorPromptV2 (multi-turn + hipotesis + anti-falso-positivo), route handler v2 con first-round/follow-up branches + onFinish persistence + headers, AuditorTab v2 reescrita con HypothesisInput pre-audit + chat continuo + reset al cambiar turn + sub-componentes AuditMessage + HypothesisInput.

    **Push pendiente** — Task 12 Paso 1 ejecuta el push atomico de los commits locales de Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10, 11 (Task 2 fue checkpoint humano sin commit codigo).
  </what-built>
  <how-to-verify>
    **PASO 1 — Push atomico a origin/main (Regla 1):**

    ```bash
    git log origin/main..HEAD --oneline
    # Esperado: 10 commits (Plan 05 Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10, 11). Task 2 no tiene commit codigo.
    git push origin main
    ```

    Esperar ~2-3 min para Vercel build. Verificar deploy Ready en https://vercel.com/<project>/<deployment>.

    Si el build falla, debug ANTES de continuar al smoke test.

    **PASO 2 — Smoke test outcome 1: text-box hipotesis + first-round audit con multi-turn context:**

    1. Ir a https://morfx.app/whatsapp (login super-user).
    2. Workspace Somnio.
    3. Conversation `e5cf0938-a001-436b-83c0-c077e839dc50` (la usada en Plan 04 smoke test — debe tener varios turns ya).
    4. Click "Debug bot" + seleccionar un turn de cliente.
    5. Click tab "Auditor".
    6. **Verificar UI nueva:**
       - Aparece textarea "Hipótesis (opcional)" arriba del boton.
       - Char counter `0 / 2000` visible.
       - Boton "Auditar sesión" debajo.
       - NO hay chat aun (no hay messages).
    7. Escribir hipotesis: `"yo creo que el bot mando promo cuando el cliente solo saludo, sin esperar el flow de confirmar dirección"`.
    8. Click "Auditar sesión".
    9. **Verificar streaming:**
       - Aparece "Analizando…" + spinner.
       - Tras ~10-20s aparece markdown del auditor (mas lento que Plan 04 porque ahora carga multi-turn).
       - El response empieza con "Hipótesis CONFIRMADA" o "Hipótesis REFUTADA" en la seccion Resumen (RESEARCH §7 Test 1).
       - 4 secciones obligatorias presentes (Resumen / Evidencia / Discrepancias / Próximos pasos).
       - Pointers reales (verificar 1 al azar resuelve a archivo+linea real con `sed -n 'Np' archivo`).
       - Si el response cita turns previos por turnId, eso confirma multi-turn context cargado.
       - Si la sesion es grande (>10 turns), warning amber "Sesión grande — mostrando últimos N de M turns" aparece arriba.

    **PASO 3 — Smoke test outcome 2: chat continuo follow-up:**

    1. Tras el primer audit completo, debe aparecer textarea "Pregunta de seguimiento" abajo.
    2. Escribir: `"no, no me importa eso. Fíjate en el template del segundo turn. ¿Por qué se mandó en ese momento?"`.
    3. Enter (o click Send).
    4. **Verificar:**
       - El user message aparece como bubble derecha.
       - Spinner indica streaming.
       - Aparece nueva respuesta assistant (bubble izquierda) refinada al template del segundo turn.
       - El response usa los 4 headers (verificar el system prompt persistio).
       - Tiempo: respuesta de follow-up es notablemente mas rapida que first round (no re-arma contexto).

    **PASO 4 — Smoke test outcome 3: persistencia en DB:**

    Abrir Supabase SQL Editor de prod:

    ```sql
    SELECT id, turn_id, conversation_id, hypothesis, jsonb_array_length(messages) AS msg_count,
           total_turns_in_context, trimmed_count, cost_usd, created_at, updated_at
    FROM agent_audit_sessions
    ORDER BY created_at DESC
    LIMIT 5;
    ```

    **Esperado:** 1 row reciente (los smoke tests de PASO 2-3) con:
    - `hypothesis` = el texto que escribiste en PASO 2.
    - `msg_count` >= 4 (round 1: user + assistant; follow-up: user + assistant).
    - `total_turns_in_context` > 0 (cuantos turns previos vio).
    - `trimmed_count` >= 0 (si hubo trimming, > 0).
    - `cost_usd` > 0 (acumulado de los rounds).
    - `created_at` < `updated_at` (trigger funciono — primer round insert + onFinish update + follow-up update).

    **PASO 5 — Smoke test outcome 4: reset al cambiar turn:**

    1. En el panel UI, seleccionar OTRO turn (de otra conversation o el mismo conversation pero turn diferente).
    2. **Verificar:**
       - Tab Auditor se resetea: textarea hipotesis vuelve vacio, boton "Auditar sesión" sin streaming, chat vacio.
       - NO se ve el audit anterior.
       - Si presionas "Auditar sesión" sin hipotesis, hace blind audit (sin bloque hipotesis en prompt).

    **PASO 6 — Verificar audit nuevo del turn 11s gap (regression check ANTI-FALSO-POSITIVO):**

    Re-correr el audit del Plan 04 que fallo (el que declaro "11s gap suspicioso"):

    1. Localizar el turn especifico que tenia el "11s gap" (04-SUMMARY menciona conversation e5cf0938).
    2. Click "Auditar sesión" SIN hipotesis (blind audit).
    3. **Verificar:**
       - El response NO marca el 11s gap como anomalia.
       - O si lo menciona, lo descarta EXPLICITAMENTE como "timing async fail-open POST-runner por diseño documentado".
       - Si vuelve a marcarlo como bug → BLOCKER, refinar el prompt.

    **PASO 7 — Reportar:**

    - Captura del UI con audit completo + chat continuo.
    - Output del SQL query de PASO 4 (o copia textual).
    - Confirmacion de los 4 outcomes (text-box, multi-turn, chat continuo, persistencia).
    - Confirmacion del check ANTI-FALSO-POSITIVO (PASO 6).
    - Cualquier issue (BLOCKERS para fix antes de cerrar plan).
  </how-to-verify>
  <resume-signal>
    Pegar resultado de los 6 pasos + "aprobado" para cerrar Plan 05. Si hay issues (UI rota, persistencia falla, hipotesis no se respeta, prompt regresion), describir el output exacto para debug. **El SUMMARY de Plan 05 (.planning/standalone/agent-forensics-panel/05-SUMMARY.md) NO se crea sin aprobacion.**
  </resume-signal>
  <acceptance_criteria>
    - 10 commits Plan 05 pusheados a origin/main.
    - Vercel deploy Ready.
    - UI nueva visible: HypothesisInput + chat continuo + follow-up textarea.
    - First round con hipotesis: response cita la hipotesis en Resumen (CONFIRMADA / REFUTADA).
    - Multi-turn context cargado (response cita turns previos por turnId si relevante).
    - Trimmed warning aparece cuando aplica.
    - Follow-up: response refina al input del usuario, mas rapido que first round.
    - DB: row en `agent_audit_sessions` con todos los campos populados (hypothesis, messages, cost_usd, total_turns_in_context, etc.).
    - Reset al cambiar turn limpia todo el state.
    - ANTI-FALSO-POSITIVO check: el 11s gap audit NO se vuelve a marcar como bug.
    - Usuario explicitamente aprueba.
  </acceptance_criteria>
</task>

</tasks>

<verification>
## Plan 05 — Verificacion goal-backward

**Outcomes observables post-plan (los 4 que el usuario debe poder ejecutar):**

1. **Outcome 1 — Escribir hipotesis y dar Auditar:** UI tiene textarea pre-audit con char counter. Click "Auditar sesión" envia hypothesis en body de first round. System prompt incluye "HIPÓTESIS DEL USUARIO" + dual placement en user message.

2. **Outcome 2 — Recibir markdown con contexto multi-turn:** Route handler first-round invoca `loadConversationTurns` + Promise.all per-turn `getTurnDetail` + `condensePreviousTurn` + `truncateContext`. User message contiene JSON code-fence con `previousTurns` (incluyendo crm-reader turns). Response cita turns previos por turnId cuando relevante.

3. **Outcome 3 — Escribir follow-up y recibir continuacion:** Tras primer audit, UI muestra textarea "Pregunta de seguimiento". useChat envia messages[] completo. Server detecta `auditSessionId !== null`, carga `system_prompt` cached desde DB (Pitfall 13), pass-through messages, responde focalizado. Latencia notablemente menor que first round (no re-assembly).

4. **Outcome 4 — Cerrar sesion sabiendo que quedo persistida:** Tabla `agent_audit_sessions` en prod tiene row con hypothesis + messages JSONB completo + system_prompt + cost_usd acumulado + created_at < updated_at. Verificable via SQL Editor (PASO 4 del checkpoint).

**Truths observables auxiliares:**

- Migration aplicada (Task 2 checkpoint) — tabla existe con 13 cols + 2 indices + trigger + GRANT service_role.
- 5 modulos library nuevos + 1 extendido (auditor-prompt v2) compilan limpio.
- Tests verdes: pricing (6) + load-conversation-turns (6) + condense-previous-turn (12) + token-budget (11) + audit-session-store (10) + auditor-prompt extendido (V2 10 + V1 7 = 17) + route extendido (V2 10 + V1 6 = 16). Total ~78 tests nuevos.
- Pitfalls 9, 10, 11, 12, 13, 14, 15 mitigados con verify blocks especificos en cada task.
- ANTI-FALSO-POSITIVO directive en system prompt mitiga el 11s gap regression.
- Reset completo al cambiar turn (5 setters) — Pitfall 9.
- Headers `X-Audit-Session-Id` + `X-Forensics-Trimmed` capturados en fetch wrapper.

**Open Items cerrados por el planner durante diseño de tasks:**

- Open Item §1 (rate limit follow-ups): NO se implementa cap explicito en Plan 05 — UI disable durante streaming es suficiente. Backlog para Plan 06.
- Open Item §2 (turn change mid-stream): el `useMemo([turnId, ...])` reset transport — Pitfall 9 resuelto.
- Open Item §3 (hypothesis text length): cap 2000 chars en HypothesisInput.
- Open Item §4 (persist condensed/previousTurns): NO se persiste como columnas separadas — `total_turns_in_context` cubre meta-uso.
- Open Item §5 (first round vs follow-up detection): `auditSessionId === null` adoptado.
- Open Item §6 (cost_usd display UI): mostrado en backlog Plan 06 (no crítico para outcomes goal-backward).
- Open Item §7 (indice por responding_agent_id): defer a backlog.
- Open Item §8 (drop-oldest knapsack): drop-oldest funciona en datos actuales — Plan 06 evaluacion.

**Backlog items capturados para Plan 06 / futuro (NO scope Plan 05):**

- Boton "Reportar imprecisión" / feedback loop hacia spec files.
- Migración AI Automation Builder + Config Builder Templates a `ANTHROPIC_API_KEY_TOOLS`.
- Nueva spec `somnio-sales-v3-pw-confirmation.md` en `src/lib/agent-specs/`.
- Listado UI de audits historicos.
- Display `cost_usd` acumulado en header del tab.
- Indice `(responding_agent_id, created_at DESC)` para query global per-agent.
- Algoritmo knapsack en truncateContext si turns recent son super-pesados.
</verification>

<success_criteria>
- 1 migration SQL aplicada en prod (Task 2 checkpoint Regla 5 strict).
- 5 modulos library nuevos: pricing, load-conversation-turns, condense-previous-turn, token-budget, audit-session-store.
- 5 archivos test nuevos (~45 tests) + 2 archivos test extendidos (auditor-prompt + route).
- 1 modulo library extendido: auditor-prompt (agrega buildAuditorPromptV2, mantiene v1).
- 1 API route extendida: route.ts (first-round/follow-up branches + onFinish + headers).
- 1 React component reescrito: auditor-tab.tsx + 2 sub-componentes (audit-message, hypothesis-input).
- 10 commits atómicos pusheados a origin/main (Task 12 Paso 1).
- Vercel deploy Ready.
- 2 checkpoints humanos aprobados: Task 2 (migration en prod) + Task 12 (smoke test end-to-end).
- 4 outcomes goal-backward verificados en prod: text-box, multi-turn, chat continuo, persistencia DB.
- 7 Pitfalls mitigados (9, 10, 11, 12, 13, 14, 15) con verify blocks.
- ANTI-FALSO-POSITIVO regression check: 11s gap audit NO se vuelve a marcar como bug.
- Reglas 0, 1, 5 strict, 6 respetadas.
- Plan 06 desbloqueado (LEARNINGS + docs sync + suite final + tests E2E opcional).
</success_criteria>

<output>
Al cerrar este plan (post Task 12 aprobado), crear `.planning/standalone/agent-forensics-panel/05-SUMMARY.md` documentando:
- Tasks completadas con commit hashes.
- Push confirmation (commit range origin/main).
- Output del SQL query de verificacion (PASO 4 checkpoint Task 12) — pegar las columnas de la row creada.
- Sample del primer audit con hipotesis (markdown response top 30 lineas) — verificar que cita la hipotesis en Resumen.
- Sample del follow-up response (markdown response top 30 lineas) — verificar que el sistema prompt se preservó.
- Latencia observada: first round (multi-turn assembly) vs follow-up (pass-through) — esperar follow-up significativamente mas rapido.
- Cost acumulado de la sesion smoke test (`cost_usd` final en DB).
- Pitfalls verificados en prod (9, 10, 11, 12, 13, 14, 15).
- Confirmacion regression check ANTI-FALSO-POSITIVO (11s gap NO marcado).
- Backlog items capturados para Plan 06.
- Notas para Plan 06 LEARNINGS: que aprendimos del proceso, que mejorar en specs, etc.
</output>
