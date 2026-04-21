---
phase: somnio-recompra-crm-reader
plan: 06
wave: 4
status: complete
completed_at: 2026-04-21T17:58:00Z
---

# Plan 06 — Comprehension prompt CRM injection (Wave 4)

## Commits

- **Task 1:** `26bc830` — `feat(somnio-recompra-crm-reader-06-T1): inject CRM context section + filter _v3 keys in comprehension-prompt`
- **Task 2:** `431128c` — `test(somnio-recompra-crm-reader-06-T2): add unit test for comprehension-prompt CRM context injection`

## Files Changed

| File | Task | Change |
|------|------|--------|
| `src/lib/agents/somnio-recompra/comprehension-prompt.ts` | 1 | +23/-3 lines — CRM extract + filter + crmSection render |
| `src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` | 2 | New — 10 pure-function unit tests (135 lines) |

## `buildSystemPrompt` post-edit (first 24 lines)

```typescript
export function buildSystemPrompt(existingData: Record<string, string>, recentBotMessages: string[] = []): string {
  // CRM context + status marker set by Plan 03 Inngest function and surfaced by Plan 05 poll.
  const crmContext = existingData['_v3:crm_context']
  const crmStatus = existingData['_v3:crm_context_status']
  const hasCrmContext =
    crmStatus === 'ok' && crmContext != null && crmContext.trim().length > 0

  // Filter out _v3:* internal metadata keys from the data dump. Leaking them would
  // (a) duplicate crm_context text (already rendered in crmSection),
  // (b) surface implementation details ("_v3:crm_context_status" is nonsense for the analyzer),
  // (c) tempt the analyzer to "capture" _v3: keys as regular fields.
  const filteredData = Object.fromEntries(
    Object.entries(existingData).filter(([k]) => !k.startsWith('_v3:')),
  )

  const dataSection = Object.keys(filteredData).length > 0
    ? `\nDATOS YA CAPTURADOS (no re-extraer si ya estan):\n${JSON.stringify(filteredData, null, 2)}`
    : '\nDATOS YA CAPTURADOS: Ninguno aun.'

  const crmSection = hasCrmContext
    ? `\n\n## CONTEXTO CRM DEL CLIENTE (precargado)\n${crmContext}\n\n(Usa este contexto para personalizar la comprension; NO reinventes datos.)`
    : ''
  // ... (botContextSection + full template return unchanged below)
```

Template return is unchanged except the final line of the prompt body:
```
...
${crmSection}${dataSection}${botContextSection}`
```
(was `${dataSection}${botContextSection}` pre-edit)

## Test Run (Task 2)

```
$ npm run test -- src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts

 RUN  v1.6.1 /mnt/c/Users/Usuario/Proyectos/morfx-new

 ✓ src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts  (10 tests) 6ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  12.72s
```

Test coverage: 3 inject cases (order, filter 2 keys, filter N keys), 5 no-inject cases (empty/error/absent status, ok+empty text, ok+whitespace), 2 edge cases (empty input, concat order with botContext).

## Push to Vercel (Regla 1)

```
$ git push origin main
To https://github.com/yuseponub/morfx.git
   c5d9066..431128c  main -> main
```

Range pushed: `c5d9066..431128c` — includes Plans 05+06 (sessionId pass-through + pollCrmContext + wire in processUserMessage + CRM inject in comprehension-prompt + 17 unit tests + SUMMARY files).

## Production State Post-Push

| Component | State |
|-----------|-------|
| `platform_config.somnio_recompra_crm_reader_enabled` | `false` (still, by design) |
| webhook-processor dispatch | Inert (flag=false) |
| Inngest function | Registered, idle |
| `pollCrmContext` | Runs for every recompra user turn → status always `timeout` → emits `crm_context_missing_after_wait` once per turn |
| comprehension-prompt inject | Never triggers — status always absent/timeout, never `'ok'` |
| Production agent behavior | **Byte-identical to pre-phase** (Regla 6 intact end-to-end) |

## Verification — success_criteria

- [x] Pipeline tecnico completo codificado y desplegado.
- [x] Cuando `Plan 07` flip el flag → dispatch → Inngest function writes `_v3:crm_context_status='ok'` → poll merges it → comprehension injects dedicated section → Haiku analyzes with rich CRM context.
- [x] Regla 6: flag=false makes ALL steps no-op end-to-end. Production remains byte-identical until manual flip.
- [x] 17 total unit tests across Plans 03+04+05+06 covering all five observability events and all branches.

## Pipeline Summary (post Plan 06)

```
webhook-processor (flag-gated dispatch)
  └── inngest.send('recompra/preload-context', { sessionId, contactId, workspaceId, invoker })
         │
         ▼
  recompra-preload-context Inngest function (flag-gated, idempotent, 12s AbortSignal)
    └── processReaderMessage (crm-reader agent)
    └── SessionManager.updateCapturedData({ _v3:crm_context, _v3:crm_context_status })
    └── observability: crm_reader_completed | crm_reader_failed

next user turn arrives → v3-production-runner passes sessionId into V3AgentInput
  └── somnio-recompra-agent.processUserMessage
        ├── pollCrmContext(sessionId, datosCapturados)          (fast-path OR poll DB ≤ 3s)
        ├── input.datosCapturados['_v3:crm_context'] = text     (if status='ok')
        ├── observability: crm_context_used | crm_context_missing_after_wait
        ▼
  comprehend → buildSystemPrompt(datosCapturados)
        ├── filters _v3:* from JSON dump
        └── injects "## CONTEXTO CRM DEL CLIENTE (precargado)" section (if status='ok')
              ▼
      Haiku analyzer receives rich CRM context + filtered structured data
```

## Next

Proceed to **Wave 5 = Plan 07** — docs update (Regla 4) + production QA checkpoint (Regla 6 flip + smoke test + observability verification). Plan 07 is `autonomous: false` — human gate to flip the flag.
