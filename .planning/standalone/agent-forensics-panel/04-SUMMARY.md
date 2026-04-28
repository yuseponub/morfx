---
phase: agent-forensics-panel
plan: 04
status: shipped
shipped_at: 2026-04-25
commit_range: 0ccc601..d2055f7
decisions_addressed: [D-03, D-08, D-09, D-13]
---

# Plan 04 — Auditor AI (Claude API route) — SUMMARY

## Resumen ejecutivo

Plan 04 entrega el **auditor AI** del panel forensics: una API route POST `/api/agent-forensics/audit` que invoca Claude Sonnet 4.6 con el contexto compuesto (spec del agente + timeline condensado + session snapshot + turn details), y un componente React `AuditorTab` que renderiza la respuesta en streaming markdown con botón de copiar al portapapeles.

Smoke test productivo APROBADO por el usuario tras 2 audits ejecutados sobre conversación real `e5cf0938` del agente `somnio-recompra-v1` en workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`). Los 2 audits demostraron streaming, render markdown, los 4 headers obligatorios, pointers reales (verificados file:line por la orquestación), y botón Copiar funcional.

## Tasks completadas

| Task | Descripción | Commit | Status |
|------|-------------|--------|--------|
| 1 | Deps `react-markdown@10.1.0` + `remark-gfm@4.0.1` + re-add `outputFileTracingIncludes` en `next.config.ts` (rollback recovery del Plan 01 Task 8) | `0ccc601` | ✅ |
| 2 | `src/lib/agent-forensics/auditor-prompt.ts` + 7 tests TDD RED→GREEN — system prompt con 4 headers obligatorios + NO-invent rule (D-09, D-13) | `4efb36e` | ✅ |
| 3 | `src/app/api/agent-forensics/audit/route.ts` + 6 tests con vi.hoisted pattern — streamText + `claude-sonnet-4-6` + `createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY_TOOLS })` + super-user gate + Promise.all assembly (D-08) | `50a4f66` | ✅ |
| 4 | `auditor-tab.tsx` (useChat + DefaultChatTransport + ReactMarkdown + remarkGfm + Copiar + sonner toast) + `tabs.tsx` reemplaza placeholder con AuditorTab cableado (D-03, D-09, D-13) | `d2055f7` | ✅ |
| 5 | Checkpoint humano smoke test productivo — APROBADO 2026-04-25 tras 2 audits exitosos | (manual) | ✅ |

**Commit range total:** `0ccc601..d2055f7` (4 commits feat + smoke test inline).

## Push confirmation

- Pushed a `origin/main` el 2026-04-25 vía hotfix path (los 4 commits + commits de usuario en paralelo).
- Vercel deploy verificado verde post-hotfix de inngest 3.54.0 (`450a0e4`).

## Artifacts created

- `src/lib/agent-forensics/auditor-prompt.ts` — `buildAuditorPrompt({ spec, condensed, snapshot, turn })` retorna `{ systemPrompt, userMessage }`. System prompt incluye estructura markdown obligatoria + regla NO inventar pointers + 4 headers (Diagnóstico / Resumen / Evidencia / Discrepancias / Próximos pasos).
- `src/lib/agent-forensics/__tests__/auditor-prompt.test.ts` — 7 tests verifican spec + condensed JSON + snapshot JSON + structural headers + NO-invent rule.
- `src/app/api/agent-forensics/audit/route.ts` — POST endpoint. Body: `{ turnId, startedAt, respondingAgentId, conversationId }`. Pipeline: assertSuperUser gate (403 on FORBIDDEN) → Promise.all(getTurnDetail + loadAgentSpec + loadSessionSnapshot) → condenseTimeline → buildAuditorPrompt → streamText con `anthropic('claude-sonnet-4-6')`, temperature 0.3, maxOutputTokens 4096 → toUIMessageStreamResponse.
- `src/app/api/agent-forensics/audit/__tests__/route.test.ts` — 6 tests con `vi.hoisted` pattern para mock de SDK + super-user gate + 403/200 paths + verificación de model id + temperature.
- `src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx` — `useChat` + `DefaultChatTransport` apuntando a `/api/agent-forensics/audit` + botón "Auditar sesión" + `sendMessage` con body completo + ReactMarkdown con remarkGfm en `div.prose` + botón "Copiar al portapapeles" con sonner toast + display de errores.

## Artifacts modified

- `package.json` + `pnpm-lock.yaml` — `react-markdown@^10.1.0` y `remark-gfm@^4.0.1` agregados a dependencies. Sin peer-dep conflicts con React 19.
- `next.config.ts` — re-agregado `outputFileTracingIncludes: { '/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md'] }` (rollback recovery del Plan 01 Task 8 — esta vez Vercel lo acepta porque la route SÍ existe en este mismo plan).
- `src/app/(dashboard)/whatsapp/components/debug-panel-production/tabs.tsx` — reemplaza placeholder del tab "Auditor" con `<AuditorTab turnId startedAt respondingAgentId conversationId />`.

## Deviations from plan

**1. Env var name change — `ANTHROPIC_API_KEY` → `ANTHROPIC_API_KEY_TOOLS`.**
- **Found during:** Task 3 (route handler implementation) tras directiva del usuario en chat.
- **Issue:** Plan original especificaba `process.env.ANTHROPIC_API_KEY` que es la key compartida con todos los bots conversacionales productivos (somnio-v3, recompra-v1, godentist, sticker-interpreter, etc.). El usuario pidió aislar el auditor en su propia key para rate-limit isolation, cost tracking separado, blast radius reducido si se rota.
- **Fix:** Toda referencia en route handler usa `createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY_TOOLS })`. Tests con mocks ajustados al nuevo env var. Usuario configuró el env var en Vercel (Production / Preview / Development) y rotó la key vieja que se había compartido inadvertidamente en chat.
- **Impact:** Sin riesgo en producción — el auditor es feature aislada, opt-in, y la key dedicada elimina interferencia entre tools y bots productivos. Captura como pattern para futuros tools internos (AI Automation Builder y Config Builder Templates podrían migrar en followup).

**2. pnpm en lugar de npm.**
- Plan literal decía `npm install`. Corregido a `pnpm add` porque el proyecto usa pnpm con `pnpm-lock.yaml`.

**3. Modelo confirmado — `claude-sonnet-4-6` (no obsoleto `claude-sonnet-4-20250514`).**
- Plan estaba alineado con el modelo correcto. Sin cambio necesario.

## Pitfalls encountered y resolución

**Pitfall 3 (Spec file bundling) — RESUELTO en Task 1.**
- Re-agregado el bloque `outputFileTracingIncludes` que se había rolled-back en Plan 01 (commit `6ddebbb`). Esta vez el directorio `src/lib/agent-specs/` SÍ existe (creado en Plan 03) y la route `/api/agent-forensics/audit` SÍ existe (creada en Task 4 de este plan), por lo tanto Vercel acepta la key. Verificado vía deploy verde.

**Pitfall 4 (XSS via raw HTML en ReactMarkdown) — MITIGADO.**
- Component `auditor-tab.tsx` usa ReactMarkdown sin `rehype-raw`, sin `dangerouslySetInnerHTML`, sin `skipHtml={false}` — safe-by-default rendering.

**Pitfall 7 (auditor en Inngest step.run incompatible con streaming) — N/A.**
- El auditor NO vive en Inngest. Es API route normal de Next.js que stream-handles directo.

**NUEVO Pitfall descubierto post-deploy (NO bloqueante para este plan, captura para Plan 06 LEARNINGS):**
- **El auditor puede inferir falsos positivos cuando interpreta arquitectura sin verificar todas las fuentes.** Demostrado en smoke test: el segundo audit declaró "gap de ~11s entre `sales_track_result` y `crm_reader_dispatched` sugiere problema" pero verificación del código (`webhook-processor.ts:247→288→296`) reveló que el dispatch es POST-runner por diseño (fail-open, no bloquea respuesta al cliente). El auditor confundió "upstream del próximo turn" con "antes del turn actual".
- **Mitigación:** Plan 05 nuevo (`auditor-multi-turn-and-hypothesis`) introduce contexto multi-turn + input de hipótesis del usuario para reducir esta clase de falsos positivos.
- **También:** spec files `src/lib/agent-specs/*.md` deben actualizarse con sección "Pitfalls comunes al diagnosticar este agente" cuando descubrimos malinterpretaciones del auditor (palanca de mejora continua sin tunear prompt).

## Test results

- **Tests nuevos Plan 04:** 13/13 verdes (7 auditor-prompt + 6 route handler).
- **Suite total post-Plan 04:** 182 passed | 7 skipped | 0 failed por código.
- **Integration CRM bots seguían skipped** por env vars `TEST_API_KEY` / `TEST_WORKSPACE_ID` faltantes (pre-existente, mismo estado que Plan 01-03).
- **Typecheck:** `npx tsc --noEmit` → 0 errors.
- **Build prod:** Vercel deploy `d2055f7` verde post-hotfix inngest 3.54.0.

## Smoke test productivo (Task 5) — APROBADO

Usuario ejecutó 2 audits sobre `conversationId=e5cf0938-a001-436b-83c0-c077e839dc50` (workspace Somnio):

**Audit 1 — turn `saludo`:**
- Header `# Diagnóstico: Somnio Recompra v1` ✅
- 4 secciones obligatorias presentes ✅
- Pointers verificados: `transitions.ts:64-68`, `response-track.ts:36`, `LOW_CONFIDENCE_THRESHOLD` en constants — todos resuelven a código real ✅
- Tiempo respuesta: ~10-15s (streaming visible) ✅

**Audit 2 — turn `quiero_comprar`:**
- 4 secciones obligatorias presentes ✅
- Pointers verificados: `transitions.ts:71`, `response-track.ts:344`, `somnio-recompra-agent.ts:274,283,392` — todos resuelven literal ✅
- Imprecisión menor encontrada: auditor citó `webhook-processor.ts:174` para routing pero el `pipeline_decision · recompra_routed` está realmente en línea 192 (174 es el if-check de cliente). NO es invención — es imprecisión sobre qué línea representa "el routing". Captura para Plan 06 LEARNINGS.
- Falsa alarma documentada: ver Pitfall NUEVO arriba sobre interpretación del gap de 11s.

**Botón Copiar:** funciona, toast sonner muestra "Diagnóstico copiado al portapapeles", markdown completo se pega correctamente.

**Auth gate:** super-user gate activo. Usuarios sin permisos reciben 403.

**Costo aproximado:** ~$0.03-0.05 por audit (Sonnet 4.6, ~10K tokens prompt + ~2-3K tokens response).

## Próximos pasos

- **Plan 05 nuevo (insertado tras este plan):** `auditor-multi-turn-and-hypothesis` — contexto multi-turn (sesión completa con granularidad media), input de hipótesis del usuario via text-box pre-audit + chat continuo de seguimiento, persistencia en `agent_audit_sessions`, sin prompt caching (low volume). Decisiones D-14..D-19 lockeadas en DISCUSSION-LOG.
- **Plan 06 (LEARNINGS + docs + tests, ex-Plan 05 renumerado):** captura aprendizajes del phase completo, actualiza docs de plataforma + arquitectura, suite final verde.
- **Backlog item:** "AuditorTab feedback button — guardar correcciones del usuario directo a `src/lib/agent-specs/<agent>.md` para mejora continua del auditor" — separado, no scope de este phase.
- **Followup separado:** "migrar AI Automation Builder + Config Builder Templates a `ANTHROPIC_API_KEY_TOOLS`" — backlog (consolidar uso de keys internas vs conversacionales).

## Self-check

- ✅ Regla 0 (GSD completo): TDD RED→GREEN en Tasks 2 y 3, commits atómicos por task, smoke test bloqueante respetado.
- ✅ Regla 1 (push a Vercel): commits pusheados + deploy verde verificado post-hotfix.
- ✅ Regla 6 (proteger agente productivo): zero modificaciones a agents conversacionales, route nueva aislada, opt-in via botón, env key separada.
- ✅ Decisiones addressed: D-03 (manual invocation), D-08 (Sonnet 4.6), D-09 (markdown output), D-13 (file:line pointers + prosa).
- ✅ Pitfalls 3, 4, 7 mitigados / N/A. Nuevo pitfall sobre interpretation falsos positivos capturado para Plan 05+06.
