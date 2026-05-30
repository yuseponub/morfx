# Phase v4-hybrid-template-rag-turn - Learnings

**Fecha:** 2026-05-30
**Duración:** ~1 sesión (plan-phase + execute-phase end-to-end; ejecución secuencial ~1.5h de agentes)
**Plans ejecutados:** 5 (4 waves)
**Standalone #3** del roadmap v4 (cierra la secuencia turn-ledger → crm-subloop → hybrid).
**Baseline Regla 6:** `9fd422f0` (commit del discuss). **Rama:** `exec/debounce-v2-wave6`.
**Goal logrado:** eliminada la palanca binaria (return temprano `somnio-v4-agent.ts:243-314`) → resolvedor de 2 slots per-intent que combina template+RAG en un turno. v4 DORMANT, Regla 6 limpia. gsd-verifier 18/18.

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| `tsc` rompía en 3 test files al añadir los campos del schema | `.nullable()` = required-with-null (NO opcional, por diseño T-5) → TypeScript exige los 3 campos nuevos en TODO objeto del tipo `MessageAnalysis`, incluyendo fixtures `cannedAnalysis`/`makeAnalysis()` | Plan 01 actualizó fixtures en `comprehension-schema.test.ts`, `somnio-v4-agent.test.ts`, `v4-production-runner-restart.test.ts` (Rule 2) | Al extender un structured-output schema con `.nullable()`, hacer `grep -rl "<TypeName>" __tests__/` ANTES y actualizar TODOS los fixtures en el mismo commit |
| Output de tests perdido al re-correr suite lenta | `npx vitest ... | tail -25` — `tail` solo emite en EOF; al hacer `timeout 300` SIGTERM, nada se flushea → log vacío, parecía "fallo" sin evidencia | Re-correr escribiendo directo a archivo (`> log 2>&1`) sin `tail`, en background + Monitor por la línea de summary | NUNCA pipear vitest a `tail` cuando puede ser SIGTERM'd; redirigir a archivo y leer incrementalmente |
| `ReferenceError: beforeAll is not defined` en primer GREEN (Plan 02) | import de vitest incompleto en el test nuevo | Fix inline en el commit GREEN; el RED seguía válido (falló en module-resolution, modo RED correcto) | En TDD, un RED que falla por "no resuelve módulo" es válido, pero revisar imports del test antes del GREEN |
| `Promise.all`=0 grep gate fallaba por un comentario (Plan 03) | El comentario mencionaba "Promise.all" explicando por qué NO se usa | Reformular el comentario (Rule 1) | Los grep-gates de acceptance criteria matchean comentarios; redactar comentarios sin el token prohibido |
| Test usaba intent enum inválido `razonamiento_libre` como valor (Plan 03) | `razonamiento_libre` es un reason de escalación, NO un miembro del enum de intents; el sumidero válido es `otro` | Corregido a `otro` + el test obsoleto de status `template` repurposed a aserción defensiva de handoff | Verificar enums contra el schema fuente, no asumir por nombre |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Ejecución SECUENCIAL en main tree (NO worktree) | Worktree isolation + paralelo en Wave 1 | Drift de worktree DOCUMENTADO en este WSL (standalones previos: pw-confirmation Plan 08, v4-subloop-debug). Waves 2-4 son single-plan (sin beneficio de paralelo). Correctness > velocidad (Regla 0) |
| Resolvedor de slots al FINAL, post-gate-CRM (T-1) | En el lugar del return temprano (pre-guards) | Permite que sales-track/gate-CRM/response-track resuelvan la parte CUBIERTA; el resolvedor solo INYECTA RAG para el/los intent(s) low. Ortogonal al gate CRM |
| Handoff parcial = poblar `output.templates` + `newMode='handoff'` (R1, sin mecanismo nuevo) | Campo/columna nueva de "handoff parcial" | El runner YA envía templates (5h) ANTES de `storage.handoff()` (1123); precedente pw-confirmation. R1 "desinflado" — cero código nuevo de transporte |
| RAG×2 SECUENCIAL (T-4) | `Promise.all` paralelo | CKPTs de interrupción limpios en secuencial; caso low+low es raro; paralelo complica debug payloads + interrupt ambiguo sobre el mismo lock |
| `.nullable()` NO `.optional()` (T-5) | `.optional()` | Shape fijo > shape variable contra `AI_NoOutputGeneratedError` (lección del tooling schema con ~32 combos nullable). Condicional-a-secondary va en el PROMPT, no en el schema |
| `mapOutcomeToAgentOutput` queda como dead code, KEPT | Borrarlo | El plan lo instruyó explícito; su lógica de mapeo RAG se inlineó en el resolvedor. Borrarlo era riesgo extra fuera de scope |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| Plan 01 (schema) | Suite v4 completa | 2 fallas aparecieron al correr toda la suite (`few-shots M1`, `smoke-rag-b`) | Confirmadas NO-regresión vía `git diff 9fd422f0..HEAD -- sub-loop/` = 0 líneas → son deuda del standalone `rag-generative`, no de esta fase |
| Plan 04 (call-site edit) | Plan 03 (orchestrator) | Plan 04 edita el call-site de `resolveResponseTrack` DENTRO de `somnio-v4-agent.ts` (que Plan 03 posee) | Serializado por waves (P04 wave 3 corre tras P03 wave 2); `files_modified` de P04 incluye `somnio-v4-agent.ts` (fix del plan-checker). 24/24 tests verdes tras el edit |
| Smoke real-embedding | CI / chequeos rápidos | `smoke-rag-a/b` hacen llamadas reales a embeddings (~0.5-1s/caso, ~2min/file) → suite lenta | Separar tests unitarios rápidos de smokes network-bound; correr unit suite scopeada para integration-checks |

## Tips para Futuros Agentes

### Lo que funcionó bien
- **Distinguir regresión de deuda pre-existente vía baseline diff:** ante una falla, `git diff <baseline>..HEAD -- <dir>` del módulo dueño del test. Si es 0-line, la falla es pre-existente, no tuya. Crítico cuando la suite mezcla código de varios standalones en la misma rama de integración.
- **Verifier independiente re-corriendo gates:** el gsd-verifier no confió en los SUMMARYs — re-corrió los 8 greps Regla-6 y grep-eó el código real. Detecta SUMMARYs optimistas.
- **R1 desinflado por research:** lo que sonaba como "el mayor riesgo" (handoff parcial = mecanismo nuevo) era reuso de send-before-handoff ya cableado. Research que traza la cadena end-to-end ahorra trabajo de implementación.
- **Spot-checks tras cada plan** (grep de invariantes críticos: CheckpointId=8, early-return=0, siblings 0-diff) antes de avanzar al siguiente wave.

### Lo que NO hacer
- NO pipear `vitest` a `tail` si el comando puede recibir SIGTERM (`timeout`) — el output se pierde. Redirigir a archivo.
- NO correr la suite v4 COMPLETA para un integration-check rápido — los smokes real-embedding la vuelven de >5min. Scopear a los unit tests relevantes.
- NO asumir que `.nullable()` es "opcional" — es required-with-null; rompe fixtures de TODO el tipo.
- NO tocar el sub-loop ni `interruption-system-v2` (gate de CheckpointId=8) — preservar verbatim. Las 2 RAG invocaciones reusan los 8 CKPTs (eventos duplicados aceptables).
- NO borrar dead code fuera de scope (mapOutcomeToAgentOutput) aunque quede huérfano — riesgo sin beneficio en una fase de refactor acotado.

### Patrones a seguir
- **Slot resolver pattern:** decisión binaria por-turno → decisión per-intent (matriz NxM). Función pura (`computeSlots`) clasifica, el orquestador combina al final. Reusa la maquinaria determinista (response-track) para lo cubierto, inyecta lo generativo solo para lo low.
- **RAG como `ProcessedMessage` sintético:** `{templateId:'rag:'+topic, content:responseText, contentType:'texto', delayMs:0, priority:'CORE'}` — entra al pipeline de envío SIN pasar por block-composer, y se FILTRA de `templates_enviados` (pseudo-id `rag:*`) porque su registro canónico es el ledger `kb_topic`.
- **Paridad runner↔engine via shared `processMessage`:** mientras el cambio viva en el agente compartido y NO cambie el shape de `V4AgentOutput`, la paridad prod↔sandbox es automática. Vigilar SOLO si se añade un campo nuevo que el runner deba enviar.
- **Interrupt mid-slots → `errorMessage` (Path A restart), NO handoff:** seguro porque el send es post-return del agente; un slot resuelto sin enviar se descarta limpio en el restart.

### Comandos útiles
```bash
# Distinguir regresión de deuda pre-existente (módulo dueño del test):
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/somnio-v4/sub-loop/   # 0-line = no es tu cambio

# Regla 6 — los 8 greps de no-regresión (baseline del standalone, NO main):
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/{somnio-v3,godentist,godentist-fb-ig,somnio-recompra,somnio-pw-confirmation}/
git diff --name-only 9fd422f0..HEAD -- src/lib/agents/engine/v3-production-runner.ts src/lib/agents/interruption-system-v2/

# CheckpointId sigue exactamente 8 (gate de interruption-system-v2):
grep -oE "'(ckpt_[0-9]_[a-z_]+)'" src/lib/agents/interruption-system-v2/checkpoints.ts | sort -u | wc -l

# Invariante del refactor: palanca binaria eliminada:
grep -c "return mapOutcomeToAgentOutput" src/lib/agents/somnio-v4/somnio-v4-agent.ts   # = 0

# Unit suite rápida (excluye smokes real-embedding network-bound):
npx vitest run src/lib/agents/somnio-v4/__tests__/{slots,comprehension-schema,somnio-v4-agent,response-track}.test.ts
```

---

## Deuda Técnica Identificada

- **(Heredada, NO de esta fase)** `sub-loop/__tests__/few-shots.test.ts > M1 probability framing`: aserción desactualizada del standalone `rag-generative` (el prompt ahora arranca con `tone-base.ts`, la frase `compañero humano experto` quedó solo en comentario). Arreglar en el cierre de rag-generative.
- **(Heredada)** `smoke-rag-a/b`: tests live-LLM con timeouts + nondeterminismo `generated` vs `no_match`. Llaman `runSubLoop` directo (bypasean el orquestador de esta fase). Validación = scope de rag-generative.
- **Items diferidos a v4-activation** (requieren v4 activo con tráfico real, hoy 0 workspaces; documentados en `SMOKE-RESULTS.md`):
  1. Coherencia de tono template+RAG en el turno combinado (risk #4).
  2. UX del mensaje de handoff parcial — genérico vs custom (Open Q 1, T-3=(b) fallback diferido).
  3. Latencia real low+low (estimada 11-20s) bajo el TTL 45s del lock (R5-A).
  4. D-01/R3 con Gemini en vivo: estabilidad del schema extendido + no-swap primary/secondary confidence. Env-gate `SMOKE_HYBRID_REAL=1` ya en su lugar.
- **subLoopDebug con 2 invocaciones (T-6):** V1 captura el ÚLTIMO payload; el debug panel renderiza 1. Mejorar a array es deferible.

## Notas para el Standalone / Módulo

- **Roadmap v4 de 3 standalones COMPLETO:** turn-ledger ✅ + crm-subloop ✅ + hybrid-template-rag ✅. Ver [[somnio_v4_architecture_roadmap]].
- v4 sigue **DORMANT** en prod (0 workspaces). Activación per-workspace: `UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>'`. Al activar, ejecutar los 4 smokes diferidos de arriba.
- **Sin migración DB** (thresholds en `platform_config`, handoff via `agent_sessions.status`, ledger `atendido[]` multi-entry — todo ya existía). **Sin feature flag** (D-10 — v4 DORMANT aísla).
- Artefactos de evidencia: `VERIFICATION.md` (18/18), `REGLA6-EVIDENCE.md` (8 greps), `SMOKE-RESULTS.md` (mocked green + deferrals).
