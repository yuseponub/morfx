---
status: in-progress
phase: somnio-sales-v4-runtime-wiring
plan: 07 (Smoke Wave A)
created: 2026-05-13
last_iter: 6
verdict: NEEDS_TUNING (NOT production-ready, NOT ready for Plan 08)
---

# Smoke Wave A — Continuation Context (Post-Compact)

## Decision Locked

**Plan 08 (SQL flip productivo) DIFERIDO.** No se procede a producción hasta que el smoke A muestre comportamiento consistente para los 4 corpus tipos.

V3 sigue activo en producción para Somnio. v4 está deployed en código pero **dormant** (sin routing rule). Cero impacto a clientes reales hasta que el flip ocurra.

## What's Working (DON'T BREAK)

| Componente | Estado | Evidence |
|------------|--------|----------|
| Comprehension Gemini Flash-Lite | ✅ Funcional | "hola" → intent=saludo 95% intent_confidence=0.95 |
| Gemini safetySettings BLOCK_NONE | ✅ Funcional con Cloud Billing | "qué tan adictivo es vs zolpidem?" pasa comprehension (antes throwed AI_NoOutputGeneratedError) |
| Sub-loop GPT-4o mini + LoopOutcomeSchema flat (D-29) | ✅ Funcional | Zolpidem test → sub-loop fired → kb_search → no_match → handoff |
| Plan 12.1 calibration parcial | ⚠️ Funciona en algunos casos | zolpidem=0.25, embarazada=0.25; FALLA en alcohol=0.92, abuela=0.85, azucar=0.95 |
| validateLoopOutcomeInvariants (Plan 02) | ✅ Funcional | knowledgeQueried populado correctamente tras Iter 2 fix |
| Handoff silencioso (sin emitir template) | ✅ Funcional + INTENCIONAL | Decisión confirmada por usuario: silence en handoff es el comportamiento deseado |
| Inspector v4 debug surface | ✅ Funcional | intent_confidence, threshold, subLoopReason visibles |
| Display normalize 0..1 → 0-100 | ✅ Funcional | "Confianza 85%" (antes "0.85%") |

## What's Broken / Iter-Needed

### Issue 1 — Few-shot calibration gaps en `comprehension-prompt.ts`

Patrones probados que la calibración Plan 12.1 NO acierta:

| Test message | intent_confidence devuelto | Esperado | Gap |
|--------------|---------------------------|----------|-----|
| `puedo tomar alcohol si lo estoy consumiendo?` | 0.920 | ~0.30 | Few-shot no cubre alcohol/cerveza/vino/whisky |
| `puede tomarlo mi abuela de 78 años` | 0.850 | ~0.30 | "edad avanzada como '96 años'" no matcheó "78" — necesita rango |
| `tiene azucar?` | 0.950 | ~0.40-0.50 | No hay few-shot de "ingrediente específico" / "tiene X?" |
| `puedo tomarlo embarazada?` | 0.250 | ~0.25 | ✓ correct (matcheó el rule "circunstancia personal: embarazo") |
| `qué tan adictivo es vs zolpidem?` | 0.250 | ~0.25 | ✓ correct (matcheó "comparación con fármaco") |

**Consecuencia del bug:** cuando confidence sale alta (>=0.70), NO se dispara sub-loop → el response track emite el template CORE generic del intent. Templates genéricos NO responden la pregunta específica.

### Issue 2 — Template content gaps en `agent_templates`

Cuando NO se dispara sub-loop, el response track manda templates CORE pre-canned del intent. Tres templates problemáticos observados:

| Template observado | Pregunta cliente | Problema |
|--------------------|------------------|----------|
| "La melatonina es un compuesto orgánico natural... el citrato de magnesio es un mineral..." | "puedo tomar alcohol?" | Responde con anticoagulantes pero ignora alcohol |
| Mismo template | "puede tomarlo mi abuela de 78?" | Ignora edad |
| "Nuestro ELIXIR DEL SUEÑO contiene 90 comprimidos de melatonina y magnesio..." | "tiene azucar?" | No aborda azúcar específicamente |

**Diagnóstico:** templates CORE de `contraindicaciones` y `contenido` son genéricos. El response track los entrega tal cual sin contextualizar.

### Issue 3 — KB content gaps

| Pregunta | Sub-loop outcome | KB cobertura |
|----------|------------------|--------------|
| "qué tan adictivo es vs zolpidem?" | no_match → handoff | No hay doc específico de comparación con zolpidem |
| "puedo tomarlo embarazada?" | no_match → handoff | No hay doc específico de embarazo |

Sub-loop ejecutó `kb_search` correctamente — el KB simplemente no tiene contenido para esos topics.

## All Code Fixes Made This Session

Commit chain: `3122fce..6ed2cbf`. Branch: `main`. Deployed to Vercel Production (alias `morfx.app`). v4 dormant.

| Commit | Title | Purpose |
|--------|-------|---------|
| `3122fce` | feat: instalar @ai-sdk/google + @ai-sdk/openai (D-9, D-30) | Plan 01 Task 1 deps |
| `c9c8323` | feat: clonar v4-production-runner.ts (D-13) | Plan 01 Task 3 |
| `5ae5587` | docs: SUMMARY Plan 01 | Documentation |
| `94edd73` | feat: reshape LoopOutcomeSchema flat per D-29 | Plan 02 Task 1 |
| `62cab92` | feat: validateLoopOutcomeInvariants + flat narrowing | Plan 02 Task 2 |
| `0690322` | test: output-schema unit + sub-loop E2E (skipIf no key) | Plan 02 Task 3 |
| `4cfcb6a` | docs: SUMMARY Plan 02 | Documentation |
| `cd2f70f` | feat: engine-v4.ts sandbox wrapper (D-19, D-22, B-2 fix) | Plan 03 Task 1 |
| `0a71cae` | feat: /api/sandbox/process branch agentId=somnio-sales-v4 | Plan 03 Task 2 |
| `9c3592b` | docs: SUMMARY Plan 03 | Documentation |
| `deedbcd` | feat: webhook-processor branch v4 (Pitfall 2 / B-001) | Plan 04 |
| `69cef19` | docs: SUMMARY Plan 04 | Documentation |
| `41705da` | feat: comprehension a Gemini Flash-Lite via AI SDK v6 | Plan 05 Task 1 |
| `853357a` | feat: sub-loop a GPT-4o mini con OPENAI_API_KEY_SALESV4 | Plan 05 Task 2 |
| `6dc505e` | feat: nunca-decir-check a Gemini Flash-Lite | Plan 05 Task 3 |
| `9079bd4` | docs: SUMMARY Plan 05 | Documentation |
| `12abe91` | feat: USE_NO_REPETITION_V4 flag separado para v4 | Plan 06 |
| `4c067ed` | docs: SUMMARY Plan 06 | Documentation |
| `f5cc626` | fix: sync pnpm-lock.yaml con @ai-sdk/google + openai | Plan 01 follow-up (Vercel build failure fix) |
| `67d5f9b` | fix: surface processUserMessage errors en sandbox inspector | Plan 07 Iter 1 — error visibility |
| `58946ba` | fix: disable Gemini safety filters + diagnostic guard | Plan 07 Iter 2 — safety BLOCK_NONE |
| `2e93997` | feat: surface intent_confidence + subLoopReason + threshold | Plan 07 Iter 3 — debug surface |
| `caf906a` | fix: diagnostic wrap del generateText completo | Plan 07 Iter 4 — comprehension error context |
| `3e009d6` | fix: diagnostic wrap del sub-loop generateText también | Plan 07 Iter 5 — sub-loop error context |
| `6ed2cbf` | fix: normalizar display de confidence legacy (0..1 → 0-100) | Plan 07 Iter 6 — cosmetic |

## Plans Already Pushed to Vercel

Plans 01-06 production code is deployed BUT v4 is DORMANT (no routing rule en `routing_rules`). v3 atiende todo Somnio.

## Environment State

- `.env.local` NO tiene `GOOGLE_GENERATIVE_AI_API_KEY` ni `OPENAI_API_KEY_SALESV4` (locales) — el dev local NO se ha usado, todo el smoke ha sido contra Vercel Production /sandbox.
- Vercel Production env vars: **Sensitive type** (no recuperables via `vercel env pull`). Cloud Billing ENABLED por usuario durante esta sesión → BLOCK_NONE respetado.
- Working tree dirty (lots de archivos no relacionados: voice-app, otros standalones, debug/, etc.) — TODO ignorado durante este standalone.

## Next Iter Plan (Post-Compact)

### Iter 7 — Calibration Few-Shot Expansion

File: `src/lib/agents/somnio-v4/comprehension-prompt.ts`

Agregar few-shots (additive — D-25 lockea las existentes pero NO las nuevas):

```
### intent="contraindicaciones" — patterns missing
- "puedo tomar alcohol?" → 0.35 (interacción con sustancia común)
- "puedo tomarlo con cerveza?" → 0.30
- "puedo tomarlo con vino?" → 0.30
- "es seguro con alcohol?" → 0.40
- "puede tomarlo mi abuela de 78?" → 0.30 (edad específica)
- "una persona de 70 puede?" → 0.30
- "y un adulto mayor?" → 0.40 (genérico, sin edad)

### intent="contenido" / "formula" — ingredient specifics
- "tiene azúcar?" → 0.45 (ingrediente específico)
- "tiene gluten?" → 0.45
- "es vegano?" → 0.50
- "tiene lactosa?" → 0.45
- "tiene cafeína?" → 0.50
```

Edit cuidadoso: NO eliminar existentes (D-25). Solo agregar.

### Iter 8 — Template Content Audit

Query `agent_templates` para `agent_id='somnio-sales-v4'`:
- ¿`contraindicaciones` CORE menciona alcohol? Embarazo? Edad? Si no → enrich.
- ¿`contenido` CORE lista ingredientes detallados? Si no → enrich.

Decisión arquitectónica pendiente: ¿split en sub-intents (`contraindicaciones_alcohol`, `contraindicaciones_embarazo`) o un solo template más rico? Discutir con usuario.

### Iter 9 — KB Content Audit

Query `knowledge_base WHERE workspace_id='a3843b3f-c337-4836-92b5-89c58bb98490'` y verificar cobertura de:
- Embarazo + lactancia
- Comparativas con fármacos (zolpidem, melatonina pura, etc.)
- Edad avanzada
- Condiciones específicas (apnea, fibromialgia, hipertensión, etc.)

Si faltan → agregar KB docs. KB lookup en sub-loop solo funciona si hay contenido vectorizado.

### Iter 10+ — Re-run Smoke

Re-test los 4 corpus + nuevos casos. Expected:
- Calibration: confidence baja para alcohol/edad/azúcar → sub-loop fired
- Sub-loop: encuentra KB hits → canonical responses con texto verbatim
- Templates: incluso para high confidence, content matches específico de la pregunta

## Conventions for Post-Compact Sessions

### Si el usuario dice "sigamos afinando"
1. Read este archivo
2. Read `CONTEXT.md` + `RESEARCH.md` del standalone
3. Read commits recientes con `git log --oneline -25`
4. Verificar deploy actual: `vercel ls | head -3`
5. Preguntar: ¿qué iter atacamos primero? Calibration (Iter 7), Templates (Iter 8), o KB (Iter 9)?

### Production State Verification
- Cliente Somnio inbound → routing_engine → v3 (sin cambios)
- v4 deployed pero sin routing rule → cero tráfico real
- Regla 6 honored — verificar con: `git diff origin/main..HEAD -- src/lib/agents/somnio-v3/` returns empty

### Anti-Patterns to Avoid Going Forward

1. **NO modificar `comprehension-schema.ts`** (D-25 / Plan 12.1 lockeado por research)
2. **NO modificar `comprehension-prompt.ts` BORRANDO ejemplos existentes** — solo aditivo
3. **NO push a Vercel cambios que activen v4 productivo** sin pasar Smoke A completo
4. **NO crear routing_rule activando v4** — eso es Plan 08, después del smoke
5. **NO touch v3/godentist/recompra/pw-confirmation files** (Regla 6)
6. **NO running diagnostic wrap removal** — los diagnostics committed (caf906a + 3e009d6) son safety net importante; no remover hasta v4 estable

## User Sentiment Snapshot

User está cansado del back-and-forth pero comprometido con calidad. Quiere:
- Refinar v4 hasta que esté listo (NO compromisos)
- Pruebas en sandbox antes de tocar producción
- Cuando finalmente flip a Plan 08, que sea con confianza

User mood: "hay que afinarlo mucho, ninguna funciono bien" — frustración con cobertura de calibration + templates, pero entendiendo que es esperado en smoke iteración.

## Critical Constants

- **Workspace Somnio**: `a3843b3f-c337-4836-92b5-89c58bb98490`
- **threshold**: `0.70` (en `platform_config.somnio_v4_low_confidence_threshold`)
- **Cloud Billing**: ENABLED en Google project (BLOCK_NONE respetado)
- **OPENAI_API_KEY_SALESV4**: configurado en Vercel Production scope (Sensitive)
- **GOOGLE_GENERATIVE_AI_API_KEY**: configurado en Vercel Production scope (Sensitive)
- **Vercel Production URL**: `https://morfx.app` (alias para latest deploy del branch main)
- **HEAD actual**: `6ed2cbf` (Plan 07 Iter 6 cosmetic fix)

## Pre-Compact Checklist

- [x] Document creado en `.planning/standalone/somnio-sales-v4-runtime-wiring/07-CONTINUATION.md`
- [x] All fixes commiteados y pusheados
- [x] Vercel deploy Ready
- [x] User explicitly invocará `/compact` después de este mensaje
- [ ] Memory.md actualizada (post-compact siguiente paso)
