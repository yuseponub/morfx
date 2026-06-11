# Handoff post-compact — smokes v4 completos + discuss v4-smoke-stability

**Escrito:** 2026-06-11 por la sesión Fable orquestadora. **Propósito:** retomar tras /compact con contexto frío.

## Qué se hizo (todo SHIPPED y pusheado a origin/main)

1. **`somnio-v4-consolidation`** (12 planes): código muerto fuera + core único `src/lib/agents/somnio-v4/core/` (`runTurn` en turn-orchestrator.ts). Runner prod (`engine/v4-production-runner.ts`, 1295→572) y engine sandbox (`somnio-v4/engine-v4.ts`, 768→330) son wrappers del MISMO mecanismo — paridad por construcción. Review Fable salvó CR-01 Critical (sandbox perdía `simulate:true` → mutation-tools reales). VERIFICATION 20/20. Artefactos: `.planning/standalone/somnio-v4-consolidation/` (LEARNINGS.md = lección punto-ciego-de-mocks).
2. **`gemini-fallback-haiku`** (5 planes): módulo `src/lib/agents/somnio-v4/llm-fallback/` — fallback Gemini→claude-haiku-4-5 con circuit-breaker in-memory por callSite (cooldown 30s), cableado a 4 call-sites (generation, compliance, comprehension, vision/image-classifier). Review Fable (1H/4M) + 6 fixes. **Smoke pre-flip LIVE PASS** (`SMOKE-PREFLIP.md` + scripts `scripts/_smoke-fallback-{live,vision}.ts`): detección 93ms, breaker, M-03 confidence calibrado 0.92, vision image-parts OK, doble-fallo D-10 probado en vivo.

**Suite canónica actual: 404 passed | 7 skipped** (SUITE_CMD en `somnio-v4-consolidation/BASELINE.md`). v4 sigue DORMANT en prod.

## Qué quiere el usuario AHORA (esta sesión post-compact)

**A. Smokes "del switch y del agente en general"** — validar end-to-end los cambios grandes del ciclo GSD completo:
   1. Re-correr smokes del fallback (ya tienen script): `npx tsx scripts/_smoke-fallback-live.ts` y `npx tsx scripts/_smoke-fallback-vision.ts` (parchean fetch para matar solo Gemini; Haiku real con ANTHROPIC_API_KEY de .env.local — NUNCA romper keys en Vercel, ver memoria `vercel_env_gotchas`).
   2. Smoke A/B del agente completo sobre el core consolidado + fallback: `npx vitest run src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts` (~12min, 17 casos) y `...smoke-rag-b.test.ts` (~2min, 10 casos). Comparar contra baseline operativo: `somnio-v4-consolidation/BASELINE.md` + `GATE-W2.md` (metodología Pitfall 12: 1 re-run por caso divergente, infra LLM no cuenta como FAIL, comparar DECISIÓN no texto). Flakies documentados: A/10, A/11, A/13, B/1-B/3 oscilan generated↔handoff (~70-85% estabilidad corrida-a-corrida es lo normal).
   3. Opcional: smoke en sandbox browser (localhost:3020/sandbox, agente somnio-v4) para verificación visual del debug panel.

**B. `/gsd-discuss-phase v4-smoke-stability`** (esta sesión es Fable = correcto para discuss de criterio/calibración, regla en memoria `token-frugal-delegation`). Scope del standalone: estabilizar los casos borderline del smoke — calibrar gates `nunca_decir`/`response_confidence` (threshold 0.70) y/o el verificador de compliance para que A/10 ("cuánto tarda a Medellín"), A/11 ("cómo pago"), A/13 ("duración efecto"), B/1/B/3 (razonamiento_libre) dejen de oscilar. Los resultados frescos del paso A alimentan el discuss con datos actuales. NO tocar: el módulo llm-fallback (shipped), el core (shipped), los 5 agentes no-v4 (Regla 6).

## Gotchas operativos vigentes

- **Sesiones concurrentes en main:** varixcenter (rompió build Vercel 2026-06-11 por pushear guards.ts sin su schema — SU problema, no tocar; sus pushes posteriores lo arreglan) y whatsapp-inbox. SIEMPRE `git pull --rebase --autostash` antes de push; stage por path, nunca `git add -A`.
- **Smokes necesitan keys reales** en `.env.local` (GOOGLE_GENERATIVE_AI_API_KEY + ANTHROPIC_API_KEY — ambas presentes y verificadas hoy).
- Dev server local: `npm run dev` (puerto 3020); WSL /mnt/c tarda ~2min en arrancar; puede estar ya corriendo (verificar `ss -tlnp | grep 3020`).
- Gemini puede estar saturado ("high demand") — si Smoke A/B cae masivamente en infra, esperar y re-correr (Pitfall 11/12).
- El flip RAG (somnio-v4-rag-generative Plan 08) queda desbloqueado tras esto.

## Orden sugerido de la sesión

1. Leer este archivo + `git log origin/main -5 --oneline` (estado fresco).
2. Correr smokes fallback (rápidos, ~1min) → confirmar módulo vivo.
3. Lanzar Smoke A (12min, background) y B (2min) → tabla vs baseline con metodología GATE-W2.
4. Con los datos frescos → `/gsd-discuss-phase v4-smoke-stability`.
