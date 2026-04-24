---
phase: agent-forensics-panel
plan: 04
type: execute
wave: 3
depends_on: [03]
files_modified:
  - package.json
  - package-lock.json
  - src/lib/agent-forensics/auditor-prompt.ts
  - src/lib/agent-forensics/__tests__/auditor-prompt.test.ts
  - src/app/api/agent-forensics/audit/route.ts
  - src/app/api/agent-forensics/audit/__tests__/route.test.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx
autonomous: false

decisions_addressed: [D-03, D-08, D-09, D-13]

must_haves:
  truths:
    - "Dependencies nuevas instaladas: `react-markdown@^10.1.0` + `remark-gfm@^4.0.1` en package.json (RESEARCH.md Standard Stack verified via npm view)"
    - "Funcion `buildAuditorPrompt({ spec, condensed, snapshot, turn })` en `src/lib/agent-forensics/auditor-prompt.ts` retorna `{ systemPrompt, userMessage }` — system prompt obliga estructura markdown con secciones Diagnostico/Resumen/Evidencia/Discrepancias/Proximos pasos + regla NO inventar pointers (D-09 + D-13)"
    - "API route `src/app/api/agent-forensics/audit/route.ts` (POST) — body { turnId, startedAt, respondingAgentId, conversationId } + assertSuperUser gate + 403 on FORBIDDEN + Promise.all assembly (getTurnDetail + loadAgentSpec + loadSessionSnapshot) + condenseTimeline + buildAuditorPrompt + streamText(model: `anthropic('claude-sonnet-4-6')`, temperature: 0.3, maxOutputTokens: 4096) + toUIMessageStreamResponse (D-08)"
    - "Component `auditor-tab.tsx` — useChat + DefaultChatTransport pointing a `/api/agent-forensics/audit` + single button 'Auditar sesion' + sendMessage con body {turnId, startedAt, respondingAgentId, conversationId} + ReactMarkdown remarkGfm renders assistant text en div.prose + 'Copiar al portapapeles' boton con sonner toast + error display"
    - "tabs.tsx reemplaza el placeholder Auditor con `<AuditorTab turnId startedAt respondingAgentId conversationId />`"
    - "Pitfall 3 verified — spec files bundle correctly (next.config Plan 01 active + outputFileTracingIncludes matches `src/lib/agent-specs/**/*.md`)"
    - "Pitfall 4 mitigated — react-markdown sin `rehype-raw`, sin `dangerouslySetInnerHTML`, sin `skipHtml={false}` (safe-by-default)"
    - "Pitfall 7 mitigated — auditor NO vive en Inngest step.run; es una API route normal de Next.js"
    - "Tests: auditor-prompt.test.ts verifica prompt contiene spec + condensed JSON + snapshot JSON + structural markdown headers + NO-inventar regla. route.test.ts verifica 403 sin super-user + 200 con super-user + modelo claude-sonnet-4-6 + temperature 0.3"
    - "Plan es NOT autonomous — Task 5 es checkpoint humano smoke-test en prod (click 'Auditar sesion', verify markdown renders + pointers resuelven)"
  artifacts:
    - path: "src/lib/agent-forensics/auditor-prompt.ts"
      provides: "Prompt assembly — markdown enforcement + NO-invent rule"
      contains: "buildAuditorPrompt"
    - path: "src/app/api/agent-forensics/audit/route.ts"
      provides: "POST endpoint with super-user + streaming Anthropic + Promise.all context assembly"
      contains: "claude-sonnet-4-6"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"
      provides: "useChat UI + ReactMarkdown + Copiar button"
      contains: "AuditorTab"
    - path: "package.json"
      provides: "react-markdown + remark-gfm dependencies"
      contains: "react-markdown"
  key_links:
    - from: "POST /api/agent-forensics/audit"
      to: "loadAgentSpec + loadSessionSnapshot + getTurnDetail + condenseTimeline + buildAuditorPrompt + streamText"
      via: "Promise.all context assembly + pipe into AI SDK v6"
      pattern: "Promise\\.all\\(\\["
    - from: "auditor-tab.tsx useChat"
      to: "API route"
      via: "DefaultChatTransport({ api: '/api/agent-forensics/audit' }) + sendMessage with body"
      pattern: "/api/agent-forensics/audit"
    - from: "tabs.tsx Auditor TabContent"
      to: "<AuditorTab />"
      via: "replaces Plan 02 placeholder"
      pattern: "<AuditorTab"
    - from: "ReactMarkdown renders assistant text"
      to: "user copies to Claude Code"
      via: "prose class + Copiar button + sonner toast"
      pattern: "remarkPlugins=\\{\\[remarkGfm\\]\\}"
---

<objective>
Wave 2 — Auditor AI final piece. Instala dependencies de markdown rendering (`react-markdown` + `remark-gfm`), crea el prompt assembly pure function (`buildAuditorPrompt`), crea el streaming API route (`/api/agent-forensics/audit`) con super-user gate + AI SDK v6 + claude-sonnet-4-6, crea el tab UI con useChat + boton "Auditar" + ReactMarkdown + "Copiar al portapapeles", y conecta el tab en `tabs.tsx` reemplazando el placeholder que Plan 02 dejo.

Purpose: (a) D-03 manual trigger — boton explicito en vez de auto-auditoria. (b) D-08 model selection — claude-sonnet-4-6 (in-use ya en sticker-interpreter). (c) D-09 markdown-only output (no JSON). (d) D-13 pointers file:line + prosa narrativa pegable a Claude Code.

Output: 2 dependencies + 1 prompt utility + 2 test files + 1 API route + 1 React component + 1 modificado (tabs.tsx conecta AuditorTab).

**Dependency:** Plan 02 (tabs.tsx + condensed-timeline + forensics-tab + condenseTimeline) + Plan 03 (agent-specs + loadAgentSpec + loadSessionSnapshot + SessionSnapshot component) DEBEN estar shipped. Este plan es el ultimo piece del panel.

**NOT autonomous:** Task 5 es checkpoint humano — se requiere smoke-test manual en prod (click boton, verify auditor responde con markdown valido + pointers que resuelven en codigo real).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-forensics-panel/CONTEXT.md — Q3 (invocacion manual vs auto → D-03), Q8 (modelo → D-08), Q9 (output format → D-09), Q13 (pointers file:line → D-13)
@.planning/standalone/agent-forensics-panel/DISCUSSION-LOG.md — D-03, D-08, D-09, D-13 locked
@.planning/standalone/agent-forensics-panel/RESEARCH.md §Pattern 4 (AI SDK streaming — lineas 358-463 verbatim reference), §Pitfalls 3/4/6/7 (aplicables aqui), §Code Examples §auditor-prompt (lineas 754-827 verbatim), §Open Items §5 (auditor architecture resolution — lineas 1099-1122)
@.planning/standalone/agent-forensics-panel/PATTERNS.md §auditor-prompt.ts NEW (503-550), §audit/route.ts NEW (552-612), §auditor-tab.tsx NEW (816-873), §Shared Patterns §AI SDK streaming + useChat (1040-1052)
@src/app/api/builder/chat/route.ts — canonica analog (164 lineas — patron streamText + toUIMessageStreamResponse + auth)
@src/app/api/config-builder/templates/chat/route.ts — segunda analog (verbatim clone con 4 swaps)
@src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx — useChat + DefaultChatTransport + fetch interceptor
@src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx — useChat + sendMessage + status/error
@src/lib/auth/super-user.ts — assertSuperUser (throws 'FORBIDDEN')
@src/lib/agents/media/sticker-interpreter.ts — `claude-sonnet-4-6` en uso (line ~80)
@src/lib/observability/repository.ts — getTurnDetail disponible
@src/lib/agent-forensics/condense-timeline.ts (POST Plan 02) — condenseTimeline disponible
@src/lib/agent-forensics/load-agent-spec.ts (POST Plan 03) — loadAgentSpec disponible
@src/lib/agent-forensics/load-session-snapshot.ts (POST Plan 03) — loadSessionSnapshot disponible
@src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx (POST Plan 02) — placeholder Auditor a reemplazar

<interfaces>
<!-- buildAuditorPrompt signature -->
export function buildAuditorPrompt(args: {
  spec: string
  condensed: CondensedTimelineItem[]
  snapshot: unknown
  turn: TurnSummary
}): { systemPrompt: string; userMessage: string }

<!-- API route request body -->
POST /api/agent-forensics/audit
{
  turnId: string
  startedAt: string    // ISO timestamp (partition key — getTurnDetail requires it)
  respondingAgentId: string | null  // null → falls back to turn.agentId in the prompt
  conversationId: string
}

<!-- API route response -->
Server-Sent Events stream via toUIMessageStreamResponse
on forbidden: Response 403 'Forbidden'
on error: Response 500 JSON { error: string }

<!-- auditor-tab props -->
interface Props {
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string
}

<!-- useChat client pattern -->
const transport = useMemo(() => new DefaultChatTransport({
  api: '/api/agent-forensics/audit',
  body: () => ({ turnId, startedAt, respondingAgentId, conversationId }),
}), [turnId, startedAt, respondingAgentId, conversationId])

const { messages, sendMessage, status, error } = useChat({ transport })

const runAudit = () => sendMessage({ text: 'Auditar' })  // server ignores text
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Instalar dependencies `react-markdown@^10.1.0` + `remark-gfm@^4.0.1` + RE-AGREGAR `outputFileTracingIncludes` en next.config.ts (rollback recovery desde Plan 01)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Standard Stack (versions verified via npm view), §Environment Availability
    - package.json (verificar estado actual — grep `react-markdown\|remark` debe devolver vacio)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §No Analog Found (react-markdown es nuevo en codebase)
    - **.planning/standalone/agent-forensics-panel/01-SUMMARY.md §Post-ship issues §Issue 1** — contexto del rollback de `next.config.ts` hecho en commit `6ddebbb` durante Plan 01. La route `/api/agent-forensics/audit` SI se crea en este Plan 04 (Task 4), por lo tanto esta vez Vercel aceptara la key.
    - `next.config.ts` — verificar que NO tiene ya `outputFileTracingIncludes` (fue removido). Confirmar con `grep outputFileTracingIncludes next.config.ts`.
  </read_first>
  <action>
    **Paso 1 — Verificar que dependencies no esten ya instaladas:**
    ```bash
    grep -E '"react-markdown"|"remark-gfm"' package.json || echo "not installed"
    ```

    **Paso 2 — Instalar (pnpm, NO npm — el proyecto usa pnpm):**
    ```bash
    pnpm add react-markdown@^10.1.0 remark-gfm@^4.0.1
    ```

    **Paso 3 — Verificar instalacion:**
    ```bash
    grep -E '"react-markdown"|"remark-gfm"' package.json
    ```

    Debe mostrar las 2 lineas en `dependencies`.

    **Paso 4 — Verificar peer-deps:**
    ```bash
    pnpm ls react-markdown remark-gfm 2>&1 | head -20
    ```

    No debe haber WARN de peer-dep conflicts con React 19. Si hay, investigar (react-markdown@10.x soporta React 19 — si hay warn, reportar).

    **Paso 5 — RE-AGREGAR `outputFileTracingIncludes` en `next.config.ts`:**

    Este bloque fue rollbackeado en Plan 01 (commit `6ddebbb`) porque Vercel rechazaba la key apuntando a una route que no existia. Ahora que Plan 04 Task 4 va a crear la route `/api/agent-forensics/audit` en el mismo plan, la key es valida.

    Editar `next.config.ts` y re-agregar el bloque DESPUES de `serverExternalPackages` y ANTES de `experimental`:

    ```typescript
      // pdfkit needs filesystem access to .afm font files bundled in node_modules
      // bwip-js has native bindings that break when bundled
      serverExternalPackages: ['pdfkit', 'bwip-js'],
      // agent-forensics-panel Plan 04: bundle agent spec markdown files into the
      // audit API route lambda. Next.js 15 does NOT bundle arbitrary fs-read
      // files by default — only `import`-ed modules. Without this include, the
      // audit route's `fs.readFile(src/lib/agent-specs/<id>.md)` fails in Vercel
      // lambdas with ENOENT.
      outputFileTracingIncludes: {
        '/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md'],
      },
      experimental: {
    ```

    **Paso 6 — Verify build NO roto:**
    ```bash
    npx tsc --noEmit
    ```

    **Paso 7 — Commit local:**
    ```bash
    git add package.json pnpm-lock.yaml next.config.ts
    git commit -m "chore(agent-forensics-panel): Plan 04 Task 1 — deps react-markdown + remark-gfm + re-add outputFileTracingIncludes (D-09, rollback recovery Plan 01)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>grep -q '"react-markdown"' package.json</automated>
    <automated>grep -q '"remark-gfm"' package.json</automated>
    <automated>test -d node_modules/react-markdown</automated>
    <automated>test -d node_modules/remark-gfm</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -c "error TS" | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` tiene `"react-markdown": "^10.1.0"` + `"remark-gfm": "^4.0.1"` en dependencies.
    - `node_modules/react-markdown` + `node_modules/remark-gfm` existen.
    - NO hay peer-dep conflicts con React 19.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Dependencies listas. Tasks 3 y 4 pueden importarlas.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Crear `src/lib/agent-forensics/auditor-prompt.ts` + tests (markdown structure enforcement + NO-invent rule)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Code Examples — auditor-prompt.ts verbatim (lineas 754-827)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §auditor-prompt.ts NEW (503-550)
    - src/lib/agent-forensics/condense-timeline.ts (POST Plan 02 — CondensedTimelineItem type)
    - src/lib/observability/repository.ts (TurnSummary type)
    - src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts (prompt assembly test shape — si existe)
  </read_first>
  <behavior>
    - Test 1: Output contains the spec body verbatim (spec es long string, verify full inclusion).
    - Test 2: Output contains JSON-stringified condensed timeline (en un code fence json).
    - Test 3: Output contains JSON-stringified snapshot (en un code fence json).
    - Test 4: Output contains turn metadata (id, conversationId, entry agent, responding agent, trigger, duration, error).
    - Test 5: System prompt contains required section headers: `# Diagnostico:` (or similar) + `## Resumen` + `## Evidencia del timeline` + `## Discrepancias con la spec` + `## Proximos pasos`.
    - Test 6: System prompt contains NO-invent rule (`NUNCA inventes` or similar).
    - Test 7: Si `turn.respondingAgentId` es null, el user message falls back a `turn.agentId` para el Responding agent field.
  </behavior>
  <action>
    **Paso 1 — Test FIRST:**

    Crear `src/lib/agent-forensics/__tests__/auditor-prompt.test.ts`:

    ```typescript
    import { describe, it, expect } from 'vitest'
    import { buildAuditorPrompt } from '../auditor-prompt'

    const specStub = '# Somnio Recompra v1\n\n## Scope\n- PUEDE responder promos.\n- NO PUEDE mutar tags.\n'
    const condensedStub = [
      {
        kind: 'event' as const,
        sequence: 1,
        recordedAt: '2026-04-24T10:00:00Z',
        category: 'pipeline_decision',
        label: 'recompra_routed',
        summary: 'recompra_routed · {"contactId":"x"}',
        raw: { id: 'e1', sequence: 1, recordedAt: '2026-04-24T10:00:00Z', category: 'pipeline_decision', label: 'recompra_routed', payload: { contactId: 'x' }, durationMs: null },
      },
    ]
    const snapshotStub = {
      session_id: 'sess-1',
      datos_capturados: { nombre: 'Jose', phone: '+57...', intent_previo: 'saludo' },
    }
    const turnStub = {
      id: 't1',
      conversationId: 'c1',
      workspaceId: 'w1',
      agentId: 'somnio-v3',
      respondingAgentId: 'somnio-recompra-v1',
      startedAt: '2026-04-24T10:00:00Z',
      finishedAt: '2026-04-24T10:00:01Z',
      durationMs: 1000,
      eventCount: 1,
      queryCount: 0,
      aiCallCount: 0,
      totalTokens: 100,
      totalCostUsd: 0.0001,
      hasError: false,
      triggerKind: 'user_message',
      currentMode: null,
      newMode: null,
    }

    describe('buildAuditorPrompt — structure + NO-invent rule (D-09, D-13)', () => {
      it('includes the spec body verbatim in user message', () => {
        const { userMessage } = buildAuditorPrompt({ spec: specStub, condensed: condensedStub, snapshot: snapshotStub, turn: turnStub as any })
        expect(userMessage).toContain('# Somnio Recompra v1')
        expect(userMessage).toContain('PUEDE responder promos')
      })

      it('includes condensed timeline as JSON code fence', () => {
        const { userMessage } = buildAuditorPrompt({ spec: specStub, condensed: condensedStub, snapshot: snapshotStub, turn: turnStub as any })
        expect(userMessage).toMatch(/```json[\s\S]*recompra_routed[\s\S]*```/)
      })

      it('includes snapshot JSON', () => {
        const { userMessage } = buildAuditorPrompt({ spec: specStub, condensed: condensedStub, snapshot: snapshotStub, turn: turnStub as any })
        expect(userMessage).toMatch(/```json[\s\S]*datos_capturados[\s\S]*```/)
      })

      it('includes turn metadata (entry + responding agent)', () => {
        const { userMessage } = buildAuditorPrompt({ spec: specStub, condensed: condensedStub, snapshot: snapshotStub, turn: turnStub as any })
        expect(userMessage).toContain('somnio-v3')          // entry
        expect(userMessage).toContain('somnio-recompra-v1') // responding
        expect(userMessage).toContain('user_message')        // triggerKind
      })

      it('system prompt enforces required markdown structure', () => {
        const { systemPrompt } = buildAuditorPrompt({ spec: specStub, condensed: condensedStub, snapshot: snapshotStub, turn: turnStub as any })
        expect(systemPrompt).toMatch(/Resumen/)
        expect(systemPrompt).toMatch(/Evidencia/i)
        expect(systemPrompt).toMatch(/Discrepancias/i)
        expect(systemPrompt).toMatch(/Próximos pasos|Proximos pasos/i)
      })

      it('system prompt contains NO-invent rule (pointer safety)', () => {
        const { systemPrompt } = buildAuditorPrompt({ spec: specStub, condensed: condensedStub, snapshot: snapshotStub, turn: turnStub as any })
        expect(systemPrompt).toMatch(/NUNCA inventes|no inventes/i)
      })

      it('falls back to agentId when respondingAgentId is null', () => {
        const { userMessage } = buildAuditorPrompt({
          spec: specStub, condensed: condensedStub, snapshot: snapshotStub,
          turn: { ...turnStub, respondingAgentId: null } as any,
        })
        // Responding agent should fall back to agentId
        expect(userMessage).toContain('Responding agent')
        // Verify somnio-v3 appears at least twice (entry + responding fallback)
        const matches = userMessage.match(/somnio-v3/g) || []
        expect(matches.length).toBeGreaterThanOrEqual(2)
      })
    })
    ```

    Correr (RED):
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/auditor-prompt.test.ts
    ```

    **Paso 2 — Crear `src/lib/agent-forensics/auditor-prompt.ts`** (verbatim from RESEARCH.md §Code Examples lineas 754-827, with small tweaks for test compatibility):

    ```typescript
    // src/lib/agent-forensics/auditor-prompt.ts
    // Source: RESEARCH.md §Code Examples lines 754-827 (verbatim reference)
    import type { TurnSummary } from '@/lib/observability/repository'
    import type { CondensedTimelineItem } from './condense-timeline'

    /**
     * Build the two-part prompt for the forensics auditor.
     *
     * The systemPrompt enforces markdown structure with specific section headers
     * and a NO-invent rule (auditor must only cite pointers from the spec).
     * The userMessage contains: spec body + turn metadata + condensed timeline JSON + snapshot JSON.
     *
     * D-09: markdown output only (no JSON parsing).
     * D-13: markdown with file:line pointers + narrative prose.
     */
    export function buildAuditorPrompt(args: {
      spec: string
      condensed: CondensedTimelineItem[]
      snapshot: unknown
      turn: TurnSummary
    }): { systemPrompt: string; userMessage: string } {
      const systemPrompt = `Eres un auditor técnico de agentes conversacionales. Tu trabajo es analizar el comportamiento de un bot en un turno específico y diagnosticar si respondió como debería, con base en su spec.

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
- El output debe ser pegable directamente a Claude Code sin edición humana.`

      const respondingAgent = args.turn.respondingAgentId ?? args.turn.agentId

      const userMessage = `## Spec del bot (fuente de verdad de comportamiento esperado)

${args.spec}

---

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

## Timeline condensado (orden de secuencia)

\`\`\`json
${JSON.stringify(args.condensed, null, 2)}
\`\`\`

## Snapshot completo del session_state

\`\`\`json
${JSON.stringify(args.snapshot, null, 2)}
\`\`\`

---

Analiza este turno contra la spec. Emite tu diagnóstico en markdown siguiendo la estructura indicada en el system prompt.`

      return { systemPrompt, userMessage }
    }
    ```

    **Paso 3 — Tests GREEN + typecheck:**
    ```bash
    npx vitest run src/lib/agent-forensics/__tests__/auditor-prompt.test.ts
    npx tsc --noEmit
    ```

    **Paso 4 — Commit local:**
    ```bash
    git add src/lib/agent-forensics/auditor-prompt.ts src/lib/agent-forensics/__tests__/auditor-prompt.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 04 Task 2 — buildAuditorPrompt markdown + NO-invent rule (D-09, D-13)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agent-forensics/__tests__/auditor-prompt.test.ts 2>&1 | grep -qE "7 passed|Test Files.*1 passed"</automated>
    <automated>grep -q "buildAuditorPrompt" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>grep -q "NUNCA inventes" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>grep -q "Resumen" src/lib/agent-forensics/auditor-prompt.ts && grep -q "Evidencia" src/lib/agent-forensics/auditor-prompt.ts && grep -q "Discrepancias" src/lib/agent-forensics/auditor-prompt.ts && grep -q "Próximos pasos\|Proximos pasos" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>grep -q "respondingAgentId ?? args.turn.agentId" src/lib/agent-forensics/auditor-prompt.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "auditor-prompt" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `auditor-prompt.ts` exporta `buildAuditorPrompt(args)` retornando `{ systemPrompt, userMessage }`.
    - System prompt incluye 4 section headers + NO-invent rule + regla "pegable directamente a Claude Code".
    - User message incluye spec body + turn metadata (id, conversation, entry agent, responding agent, trigger, duration, tokens, cost, error) + condensed JSON code fence + snapshot JSON code fence.
    - Fallback `respondingAgentId ?? agentId` correcto.
    - 7 tests verde.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - Prompt builder listo. Route lo usa en Task 3.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Crear API route `src/app/api/agent-forensics/audit/route.ts` + tests (super-user + streamText + claude-sonnet-4-6)</name>
  <read_first>
    - src/app/api/builder/chat/route.ts (canonica — 164 lineas, patron completo streamText + auth + stream response)
    - src/app/api/config-builder/templates/chat/route.ts (analog shorter)
    - src/lib/auth/super-user.ts (assertSuperUser — throws 'FORBIDDEN')
    - src/lib/agents/media/sticker-interpreter.ts (claude-sonnet-4-6 en uso — line ~80)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Pattern 4 (lineas 362-419 — verbatim reference), §Pitfall 7 (NO Inngest — es API route normal)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §audit/route.ts NEW (552-612)
    - src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts (mock pattern para route tests)
  </read_first>
  <behavior>
    - Test 1: POST sin auth → assertSuperUser throws FORBIDDEN → response 403 'Forbidden'.
    - Test 2: POST con auth → 200 + stream response (mock streamText + toUIMessageStreamResponse).
    - Test 3: streamText invocado con `anthropic('claude-sonnet-4-6')` + `temperature: 0.3` + `maxOutputTokens: 4096`.
    - Test 4: Prompt assembly: llamadas a getTurnDetail + loadAgentSpec + loadSessionSnapshot + condenseTimeline + buildAuditorPrompt (via mocks, verificar orden).
    - Test 5: Si loadAgentSpec throws (unknown agent), route responde 500 con JSON error.
    - Test 6: `respondingAgentId === null` → loadAgentSpec llamado con `turn.agentId` (fallback). Mocks `loadAgentSpec`; verifica que se llamo con `turn.agentId`, no con `null`.
  </behavior>
  <action>
    **Paso 1 — Test FIRST** (mocks-heavy):

    Crear `src/app/api/agent-forensics/audit/__tests__/route.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    // Mocks — hoisted BEFORE import of route
    const mockAssertSuperUser = vi.fn()
    const mockGetTurnDetail = vi.fn()
    const mockLoadAgentSpec = vi.fn()
    const mockLoadSessionSnapshot = vi.fn()
    const mockCondenseTimeline = vi.fn()
    const mockBuildAuditorPrompt = vi.fn()
    const mockStreamText = vi.fn()
    const mockAnthropic = vi.fn((id: string) => ({ _model: id }))
    const mockToUIMessageStreamResponse = vi.fn(() => new Response('stream', { status: 200 }))

    vi.mock('@/lib/auth/super-user', () => ({
      assertSuperUser: mockAssertSuperUser,
    }))
    vi.mock('@/lib/observability/repository', () => ({
      getTurnDetail: mockGetTurnDetail,
    }))
    vi.mock('@/lib/agent-forensics/load-agent-spec', () => ({
      loadAgentSpec: mockLoadAgentSpec,
    }))
    vi.mock('@/lib/agent-forensics/load-session-snapshot', () => ({
      loadSessionSnapshot: mockLoadSessionSnapshot,
    }))
    vi.mock('@/lib/agent-forensics/condense-timeline', () => ({
      condenseTimeline: mockCondenseTimeline,
    }))
    vi.mock('@/lib/agent-forensics/auditor-prompt', () => ({
      buildAuditorPrompt: mockBuildAuditorPrompt,
    }))
    vi.mock('ai', () => ({
      streamText: mockStreamText,
    }))
    vi.mock('@ai-sdk/anthropic', () => ({
      anthropic: mockAnthropic,
    }))

    import { POST } from '../route'

    function makeRequest(body: any): Request {
      return new Request('http://localhost/api/agent-forensics/audit', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    }

    describe('POST /api/agent-forensics/audit', () => {
      beforeEach(() => {
        vi.clearAllMocks()
        mockStreamText.mockReturnValue({
          toUIMessageStreamResponse: mockToUIMessageStreamResponse,
        })
        mockGetTurnDetail.mockResolvedValue({ turn: { id: 't1', agentId: 'somnio-v3', respondingAgentId: 'somnio-recompra-v1' }, events: [], queries: [], aiCalls: [] })
        mockLoadAgentSpec.mockResolvedValue('# spec')
        mockLoadSessionSnapshot.mockResolvedValue({ snapshot: { x: 1 }, sessionId: 's1' })
        mockCondenseTimeline.mockReturnValue([])
        mockBuildAuditorPrompt.mockReturnValue({ systemPrompt: 'sys', userMessage: 'user' })
      })

      it('returns 403 when not super-user', async () => {
        mockAssertSuperUser.mockRejectedValue(new Error('FORBIDDEN'))
        const res = await POST(makeRequest({ turnId: 't1', startedAt: '2026-04-24T10:00:00Z', respondingAgentId: 'somnio-recompra-v1', conversationId: 'c1' }))
        expect(res.status).toBe(403)
      })

      it('returns 200 stream when authorized', async () => {
        mockAssertSuperUser.mockResolvedValue(undefined)
        const res = await POST(makeRequest({ turnId: 't1', startedAt: '2026-04-24T10:00:00Z', respondingAgentId: 'somnio-recompra-v1', conversationId: 'c1' }))
        expect(res.status).toBe(200)
        expect(mockToUIMessageStreamResponse).toHaveBeenCalled()
      })

      it('uses claude-sonnet-4-6 with temperature 0.3 and maxOutputTokens 4096', async () => {
        mockAssertSuperUser.mockResolvedValue(undefined)
        await POST(makeRequest({ turnId: 't1', startedAt: '2026-04-24T10:00:00Z', respondingAgentId: 'somnio-recompra-v1', conversationId: 'c1' }))
        expect(mockAnthropic).toHaveBeenCalledWith('claude-sonnet-4-6')
        expect(mockStreamText).toHaveBeenCalledWith(
          expect.objectContaining({
            temperature: 0.3,
            maxOutputTokens: 4096,
          }),
        )
      })

      it('assembles context in parallel (all 3 loads called with correct args)', async () => {
        mockAssertSuperUser.mockResolvedValue(undefined)
        await POST(makeRequest({ turnId: 't1', startedAt: '2026-04-24T10:00:00Z', respondingAgentId: 'somnio-recompra-v1', conversationId: 'c1' }))
        expect(mockGetTurnDetail).toHaveBeenCalledWith('t1', '2026-04-24T10:00:00Z')
        expect(mockLoadAgentSpec).toHaveBeenCalledWith('somnio-recompra-v1')
        expect(mockLoadSessionSnapshot).toHaveBeenCalledWith('c1')
        expect(mockCondenseTimeline).toHaveBeenCalled()
        expect(mockBuildAuditorPrompt).toHaveBeenCalled()
      })

      it('returns 500 JSON when context assembly throws', async () => {
        mockAssertSuperUser.mockResolvedValue(undefined)
        mockLoadAgentSpec.mockRejectedValue(new Error('Unknown agent spec: foo'))
        const res = await POST(makeRequest({ turnId: 't1', startedAt: '2026-04-24T10:00:00Z', respondingAgentId: 'foo', conversationId: 'c1' }))
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error).toContain('Unknown agent spec')
      })

      it('falls back to turn.agentId when respondingAgentId is null', async () => {
        mockAssertSuperUser.mockResolvedValue(undefined)
        await POST(makeRequest({ turnId: 't1', startedAt: '2026-04-24T10:00:00Z', respondingAgentId: null, conversationId: 'c1' }))
        expect(mockLoadAgentSpec).toHaveBeenCalledWith('somnio-v3')  // turn.agentId
      })
    })
    ```

    Correr (RED):
    ```bash
    npx vitest run src/app/api/agent-forensics/audit/__tests__/route.test.ts
    ```

    **Paso 2 — Crear `src/app/api/agent-forensics/audit/route.ts`:**

    ```typescript
    // src/app/api/agent-forensics/audit/route.ts
    // Source: adapted from src/app/api/builder/chat/route.ts + RESEARCH.md §Pattern 4
    // D-08: claude-sonnet-4-6. D-09: markdown output. D-13: pointers + prose.
    // Pitfall 7: this is a normal Next.js API route, NOT an Inngest function.

    import { streamText } from 'ai'
    import { anthropic } from '@ai-sdk/anthropic'
    import { assertSuperUser } from '@/lib/auth/super-user'
    import { getTurnDetail } from '@/lib/observability/repository'
    import { loadAgentSpec } from '@/lib/agent-forensics/load-agent-spec'
    import { loadSessionSnapshot } from '@/lib/agent-forensics/load-session-snapshot'
    import { condenseTimeline } from '@/lib/agent-forensics/condense-timeline'
    import { buildAuditorPrompt } from '@/lib/agent-forensics/auditor-prompt'

    interface AuditRequestBody {
      turnId: string
      startedAt: string
      respondingAgentId: string | null
      conversationId: string
    }

    export async function POST(request: Request): Promise<Response> {
      try {
        await assertSuperUser()  // throws Error('FORBIDDEN') if not the owner

        const body = (await request.json()) as AuditRequestBody
        const { turnId, startedAt, respondingAgentId, conversationId } = body

        // 1) Fetch turn first (we need turn.agentId for the spec fallback)
        const detail = await getTurnDetail(turnId, startedAt)
        const effectiveAgentId = respondingAgentId ?? detail.turn.agentId

        // 2) Assemble context in parallel
        const [spec, { snapshot }] = await Promise.all([
          loadAgentSpec(effectiveAgentId),
          loadSessionSnapshot(conversationId),
        ])

        // 3) Condense timeline (pure function, cheap)
        const condensed = condenseTimeline(detail, respondingAgentId)

        // 4) Build prompt
        const { systemPrompt, userMessage } = buildAuditorPrompt({
          spec,
          condensed,
          snapshot,
          turn: detail.turn,
        })

        // 5) Stream Claude
        const result = streamText({
          model: anthropic('claude-sonnet-4-6'),  // D-08
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          temperature: 0.3,
          maxOutputTokens: 4096,
        })

        return result.toUIMessageStreamResponse()
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

    **Paso 3 — Tests GREEN + typecheck:**
    ```bash
    npx vitest run src/app/api/agent-forensics/audit/__tests__/route.test.ts
    npx tsc --noEmit
    ```

    **Paso 4 — Commit local:**
    ```bash
    git add src/app/api/agent-forensics/audit/route.ts src/app/api/agent-forensics/audit/__tests__/route.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 04 Task 3 — POST /api/agent-forensics/audit (streamText + super-user + claude-sonnet-4-6)

D-03: manual invocation. D-08: model locked. D-13: context includes spec + condensed + snapshot.
Pitfall 7 mitigated (normal API route, no Inngest).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/app/api/agent-forensics/audit/__tests__/route.test.ts 2>&1 | grep -qE "6 passed|Test Files.*1 passed"</automated>
    <automated>test -f src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "claude-sonnet-4-6" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "assertSuperUser" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "toUIMessageStreamResponse" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "temperature: 0.3" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "maxOutputTokens: 4096" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -q "FORBIDDEN" src/app/api/agent-forensics/audit/route.ts && grep -q "403" src/app/api/agent-forensics/audit/route.ts</automated>
    <automated>grep -E "step\.run|inngest\.send" src/app/api/agent-forensics/audit/route.ts | wc -l | grep -q "^0$"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "agent-forensics/audit/route" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `route.ts` existe, exports POST handler.
    - Usa `assertSuperUser` + returns 403 cuando throws FORBIDDEN.
    - Assembly: `getTurnDetail` primero + `Promise.all([loadAgentSpec, loadSessionSnapshot])` en paralelo + `condenseTimeline` + `buildAuditorPrompt`.
    - `streamText` con `anthropic('claude-sonnet-4-6')` + temperature 0.3 + maxOutputTokens 4096.
    - Return `result.toUIMessageStreamResponse()`.
    - Error catch: console.error prefix `[agent-forensics/audit]` + 500 JSON.
    - Fallback respondingAgentId ?? turn.agentId para loadAgentSpec.
    - NO tiene `step.run` ni `inngest.send` (Pitfall 7).
    - 6 tests verde.
    - TypeScript compile limpio.
    - Commit local.
  </acceptance_criteria>
  <done>
    - API route listo. UI lo consume en Task 4.
  </done>
</task>

<task type="auto">
  <name>Task 4: Crear `auditor-tab.tsx` (useChat + ReactMarkdown + Copiar) + wire en `tabs.tsx`</name>
  <read_first>
    - src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx (canonica — useChat + DefaultChatTransport + sendMessage + error display 36-86, 137-143)
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx (second analog)
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx (POST Plan 02 — tiene el placeholder TabsContent value="auditor")
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Pattern 4 client side (lineas 424-463), §Pitfall 4 (react-markdown safe-by-default — no rehype-raw, no dangerouslySetInnerHTML)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §auditor-tab.tsx NEW (816-873)
    - Verify sonner import: `grep "from 'sonner'" src/app | head -3`
  </read_first>
  <action>
    **Paso 1 — Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx`:**

    ```typescript
    'use client'
    import { useMemo } from 'react'
    import { useChat } from '@ai-sdk/react'
    import { DefaultChatTransport } from 'ai'
    import ReactMarkdown from 'react-markdown'
    import remarkGfm from 'remark-gfm'
    import { toast } from 'sonner'
    import { Copy, Play, Loader2 } from 'lucide-react'
    import { Button } from '@/components/ui/button'

    interface Props {
      turnId: string
      startedAt: string
      respondingAgentId: string | null
      conversationId: string
    }

    export function AuditorTab({ turnId, startedAt, respondingAgentId, conversationId }: Props) {
      // Transport — memoized per turn so remount resets (intentional)
      const transport = useMemo(
        () =>
          new DefaultChatTransport({
            api: '/api/agent-forensics/audit',
            body: () => ({ turnId, startedAt, respondingAgentId, conversationId }),
          }),
        [turnId, startedAt, respondingAgentId, conversationId],
      )

      const { messages, sendMessage, status, error } = useChat({ transport })

      const isStreaming = status === 'streaming' || status === 'submitted'

      const runAudit = () => {
        if (isStreaming) return
        // Server ignores the text — context comes from body
        sendMessage({ text: 'Auditar' })
      }

      // Extract assistant markdown by concatenating text parts
      const assistantText = messages
        .filter((m) => m.role === 'assistant')
        .flatMap((m) =>
          (m.parts ?? []).filter((p) => p.type === 'text').map((p: any) => p.text as string),
        )
        .join('\n')

      const copyToClipboard = async () => {
        if (!assistantText) return
        try {
          await navigator.clipboard.writeText(assistantText)
          toast.success('Diagnostico copiado al portapapeles — pegar en Claude Code')
        } catch {
          toast.error('No se pudo copiar al portapapeles')
        }
      }

      return (
        <div className="h-full flex flex-col min-h-0">
          {/* Header — action bar */}
          <div className="px-3 py-2 border-b flex-shrink-0 flex items-center gap-2">
            <Button
              size="sm"
              onClick={runAudit}
              disabled={isStreaming}
              className="h-7"
            >
              {isStreaming ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Auditando…
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Auditar sesion
                </>
              )}
            </Button>

            {assistantText.length > 0 && !isStreaming && (
              <Button
                size="sm"
                variant="outline"
                onClick={copyToClipboard}
                className="h-7"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copiar al portapapeles
              </Button>
            )}

            {assistantText.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                {assistantText.length} chars
              </span>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="px-3 py-2 flex-shrink-0">
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                Error: {error.message}
              </div>
            </div>
          )}

          {/* Output */}
          <div className="flex-1 overflow-y-auto">
            {assistantText.length === 0 && !isStreaming && !error ? (
              <div className="h-full flex items-center justify-center p-4">
                <div className="text-xs text-muted-foreground italic text-center max-w-sm">
                  Click "Auditar sesion" para que Claude Sonnet 4.6 analice este turn contra la spec del bot.
                  El output es markdown pegable a Claude Code.
                </div>
              </div>
            ) : (
              <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{assistantText}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )
    }
    ```

    **Paso 2 — Modificar `tabs.tsx` para reemplazar placeholder:**

    Abrir `src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx`. Buscar:

    ```typescript
    <TabsContent value="auditor" className="flex-1 min-h-0 mt-0">
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-sm text-muted-foreground italic">
          Auditor AI — disponible en Plan 04.
        </div>
      </div>
    </TabsContent>
    ```

    Reemplazar con:

    ```typescript
    <TabsContent value="auditor" className="flex-1 min-h-0 mt-0">
      <AuditorTab
        turnId={turnId}
        startedAt={startedAt}
        respondingAgentId={respondingAgentId}
        conversationId={conversationId}
      />
    </TabsContent>
    ```

    Agregar import al top:
    ```typescript
    import { AuditorTab } from './auditor-tab'
    ```

    **Paso 3 — Verificar que no haya rehype-raw o dangerouslySetInnerHTML (Pitfall 4):**
    ```bash
    grep -rE "rehype-raw|dangerouslySetInnerHTML|skipHtml" src/app/\(dashboard\)/whatsapp/components/debug-panel-production/ && exit 1 || echo "OK"
    ```

    **Paso 4 — Verify typecheck + tests full:**
    ```bash
    npx tsc --noEmit
    npm test -- --run 2>&1 | tail -10
    ```

    **Paso 5 — Commit local:**
    ```bash
    git add src/app/\(dashboard\)/whatsapp/components/debug-panel-production/auditor-tab.tsx \
            src/app/\(dashboard\)/whatsapp/components/debug-panel-production/tabs.tsx
    git commit -m "feat(agent-forensics-panel): Plan 04 Task 4 — AuditorTab useChat + ReactMarkdown + Copiar (D-03, D-09, D-13)

Pitfall 4 mitigated: react-markdown sin rehype-raw ni dangerouslySetInnerHTML.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```

    **Paso 6 — Push del plan completo ANTES del checkpoint smoke-test:**

    El smoke-test debe ocurrir en prod (deploy Vercel). Pushear para que el deploy genere la version disponible.

    ```bash
    git push origin main
    ```

    Esperar ~2-3 min para Vercel build.
  </action>
  <verify>
    <automated>test -f "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "useChat" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "ReactMarkdown" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "remarkPlugins={\[remarkGfm\]}" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "api: '/api/agent-forensics/audit'" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "Copiar al portapapeles" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "sonner" "src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx"</automated>
    <automated>grep -q "<AuditorTab" "src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx"</automated>
    <automated>grep -q "disponible en Plan 04" "src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx" && exit 1 || exit 0</automated>
    <automated>grep -rE "rehype-raw|dangerouslySetInnerHTML|skipHtml" "src/app/(dashboard)/whatsapp/components/debug-panel-production/" | wc -l | grep -q "^0$"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -c "error TS" | grep -q "^0$"</automated>
    <automated>git log origin/main..HEAD --oneline 2>&1 | wc -l | grep -qE "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `auditor-tab.tsx` existe, usa `useChat` + `DefaultChatTransport` apuntando a `/api/agent-forensics/audit`, body carries { turnId, startedAt, respondingAgentId, conversationId }.
    - UI: boton "Auditar sesion" (primary), boton "Copiar al portapapeles" (solo cuando hay output), status indicator, error display.
    - ReactMarkdown con `remarkPlugins={[remarkGfm]}` dentro de `div.prose`.
    - NO hay `rehype-raw`, `dangerouslySetInnerHTML`, o `skipHtml={false}` (Pitfall 4 mitigated).
    - `tabs.tsx` reemplazo completo el placeholder con `<AuditorTab ...props />`.
    - TypeScript compile limpio.
    - Suite test full verde.
    - 4 commits de Plan 04 pusheados a origin/main.
  </acceptance_criteria>
  <done>
    - Panel forensics funcional end-to-end. Task 5 verifica en prod.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 5: Checkpoint humano — smoke test del auditor en produccion</name>
  <what-built>
    Panel forensics completo desplegado: 3 tabs (Forensics/Raw/Auditor). Tab Forensics muestra timeline condensado + session snapshot. Tab Auditor tiene boton "Auditar sesion" que llama a `/api/agent-forensics/audit` con Claude Sonnet 4.6, recibe markdown via streaming, lo renderiza con react-markdown, permite copiar.
  </what-built>
  <how-to-verify>
    **Pre-requisito:** Vercel deploy Ready (Task 4 Paso 6 ya pusheo). Si el deploy fallo, debug antes de continuar.

    **PASO 1 — Abrir el panel en prod:**

    1. Ir a `https://morfx.app/whatsapp` (login como super-user).
    2. Seleccionar un workspace que tenga turns recientes de recompra (Somnio).
    3. Elegir una conversation de cliente (is_client=true).
    4. Click "Debug bot" para abrir el panel.
    5. Seleccionar un turn reciente (post-Plan-01 deploy).

    **PASO 2 — Verificar Forensics tab (default):**

    - Debe aparecer activo por default.
    - Header: `somnio-recompra-v1` (NOT `somnio-v3` — bug fix de Plan 01 activo).
    - Timeline condensado: entre 3-15 items tipicamente (en comparacion al raw que tiene 20-40).
    - Cero queries SQL (D-05 verified).
    - Session snapshot visible al final — JSON viewer expandible.

    **PASO 3 — Verificar Raw tab:**

    - Click tab Raw.
    - Lista completa de events + queries + aiCalls (como antes del panel forensics — sin regresion).

    **PASO 4 — Verificar Auditor tab:**

    - Click tab Auditor.
    - Ver mensaje "Click 'Auditar sesion' para que Claude Sonnet 4.6 analice este turn...".
    - Click boton "Auditar sesion".
    - El boton cambia a "Auditando…" con spinner.
    - Tras ~5-15 segundos empieza a streamear texto (markdown).
    - Al terminar, aparecen secciones:
      - `# Diagnostico: somnio-recompra-v1` (o similar)
      - `## Resumen`
      - `## Evidencia del timeline`
      - `## Discrepancias con la spec`
      - `## Proximos pasos`

    **PASO 5 — Verificar pointers `file:line`:**

    El output debe tener pointers como `src/lib/agents/somnio-recompra/response-track.ts:36` embedded en prosa.

    **Test:** tomar UN pointer al azar del output, verificar que el archivo y el numero de linea existen realmente en la codebase:
    ```bash
    # ejemplo
    sed -n '36p' src/lib/agents/somnio-recompra/response-track.ts
    ```

    Si el pointer no resuelve → problema (el auditor estaria inventando, violacion D-13 + NO-invent rule). Si todos los pointers resuelven → D-13 satisfecho.

    **PASO 6 — Verificar "Copiar al portapapeles":**

    - Click "Copiar al portapapeles".
    - Debe aparecer toast sonner "Diagnostico copiado al portapapeles…".
    - Pegar en un editor → debe aparecer el markdown completo.

    **PASO 7 — Verificar auth gate:**

    - Logout o usar otra cuenta no-super-user.
    - Intentar hacer POST manual a `/api/agent-forensics/audit` (via curl o fetch):
      ```bash
      curl -X POST https://morfx.app/api/agent-forensics/audit -H "Content-Type: application/json" -d '{"turnId":"x","startedAt":"2026-04-24T10:00:00Z","respondingAgentId":"somnio-recompra-v1","conversationId":"c"}'
      ```
    - Debe responder 403 Forbidden (sin auth) o 401 redirect.

    **PASO 8 — Reportar:**

    En la respuesta al checkpoint, incluir:
    - Screenshot (opcional) del auditor respondiendo.
    - Copy del markdown generado (primeras 30 lineas).
    - Confirmacion que los pointers resuelven.
    - Confirmacion que el auth gate funciona.
    - Cualquier issue detectado (ej. pointer inventado → BLOCKER, investigar spec).
  </how-to-verify>
  <resume-signal>
    Pegar el markdown de muestra + "aprobado" + confirmacion que pointers resuelven. Si hay issues (pointers inventados, modelo no responde, streaming fall, markdown no renderiza, auth no funciona), describirlos para debug. El executor NO procede a Plan 05 sin aprobacion.
  </resume-signal>
  <acceptance_criteria>
    - Vercel deploy Ready.
    - Tab Forensics muestra timeline condensado + snapshot correctamente.
    - Tab Auditor llama al API sin error.
    - Streaming funciona (texto aparece progresivamente).
    - Markdown renderiza con formato (headers, listas, code fences).
    - Secciones del system prompt respetadas (Resumen / Evidencia / Discrepancias / Proximos pasos).
    - Pointers file:line resuelven a archivos+lineas reales.
    - Boton Copiar funciona + sonner toast aparece.
    - Auth gate: 403 para non-super-user.
    - Usuario confirma con "aprobado" o documenta issues.
  </acceptance_criteria>
</task>

</tasks>

<verification>
## Plan 04 — Verificacion goal-backward

**Truths observables post-plan:**

1. **Dependencies shipped:** `package.json` contiene react-markdown + remark-gfm en dependencies.
2. **API endpoint lives:** `POST https://morfx.app/api/agent-forensics/audit` existe y responde 403 sin auth / stream con auth.
3. **Prompt structure:** el markdown emitido incluye los 4 section headers obligatorios.
4. **Pointers reales:** pointers `file:line` en el output resuelven a archivos+lineas existentes en git.
5. **Pitfall 3:** spec files bundled — `fs.readFile` NO tira ENOENT en lambda prod.
6. **Pitfall 4:** Markdown rendering safe — no XSS via script tags.
7. **Pitfall 7:** NO Inngest step.run involucrado — auditor llama Anthropic una sola vez por click (no duplicados).
8. **Tests verde:** auditor-prompt (7) + route (6) = 13 tests nuevos green.
9. **End-to-end smoke:** usuario confirmo en prod que el flujo completo funciona.
</verification>

<success_criteria>
- 2 new npm deps installed + 2 new TS libs + 2 new test files + 1 API route + 1 React component + 1 archivo modificado (tabs.tsx).
- 4 commits atomicos pusheados a origin/main.
- Vercel deploy Ready.
- Checkpoint humano approved con evidencia de markdown + pointers + auth gate.
- 3 Pitfalls mitigados: 3 (spec bundling), 4 (XSS), 7 (no Inngest).
- Plan 05 desbloqueado (polish/docs/LEARNINGS).
</success_criteria>

<output>
Al cerrar este plan, crear `.planning/standalone/agent-forensics-panel/04-SUMMARY.md` documentando:
- Muestra del output del auditor (primeras 30 lineas) para un turn de recompra real.
- Lista de pointers file:line que aparecieron + confirmacion que resuelven.
- Latencia observada del auditor (click → primer chunk de stream, click → respuesta completa).
- Cost estimado por invocacion (tokens in + out × pricing Sonnet 4.6).
- Cualquier ajuste al spec file que el auditor revelo necesario (ej. "pointer X no resolvia, actualizamos spec para tener el pointer correcto").
- Pitfalls verificados en prod (3, 4, 7).
- Notas para Plan 05: docs sync + LEARNINGS.md + full suite + Vercel deploy final.
</output>
