# v4-handoff-soft-signal — Learnings

**Fecha:** 2026-06-14
**Duración:** ~1h ejecución (2 sesiones; Wave 1 día 13, Wave 2 día 14)
**Plans ejecutados:** 3 (2 waves)

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| (falso positivo en verificación) `restart-loop.test.ts` S1 falla `expect(restartEvents).toHaveLength(0)` | **PRE-EXISTENTE** — falla idéntico en el commit base `08b5743a` (verificado restaurando el runner base y re-corriendo) | NO se tocó (fuera de scope; no es regresión de esta fase) | Antes de culpar a un diff, restaurar el archivo fuente al commit base y re-correr el test aislado. Confirma pre-existencia en <1 min. |
| Smokes en vivo `smoke-rag-b` (razonamiento_libre) fallan `expected 'no_match' to be 'generated'` | Smokes que invocan OpenAI+Gemini REALES (gated por `skipIf` en API keys); el modelo eligió generar respuesta en vez de escalar — no-determinista | NO se tocó | Excluir los 4 archivos live (`smoke-rag-a/b`, `smoke-hybrid`, `comprehension-gemini`) del gate determinista. `vitest 1.6.1` solo acepta UN `--exclude` → listar archivos explícitamente. |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| SIN feature flag — soft es el nuevo default de v4 (D-04) | Flag con camino doble OFF=legacy | v4 DORMANT → no hay comportamiento de prod que proteger; flag = deuda innecesaria. Rollback = revertir deploy |
| `updateMode` SE MANTIENE; solo se removió `storage.handoff()` + `clearPendingTemplates()` | Remover todo el bloque handoff | El modo SÍ transiciona a 'handoff' en la sesión (lo lee el handoff agent futuro), pero la sesión NO se apaga |
| Gate del HARD path en `!result.handoffSuggested` (NO en `agentId`) | Branch por `agentId === 'somnio-sales-v4'` | Solo el runner v4 setea `handoffSuggested`; los demás agentes lo dejan `undefined` → `!undefined === true` → hard path intacto (Regla 6 estructural, no por enumeración de agentes) |
| Señal vive en observability (`handoff_suggested` event) + nota inbox; SIN persistencia en `agent_sessions` | Opción C (columna estructurada + badge UI) | Diferido — el handoff agent futuro consume desde observability; V1 minimiza superficie |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| `EngineOutput` (campos nuevos) | `SomnioEngineResult` (tipo de retorno de `somnio-engine.ts`) | `handoffSuggested`/`handoffSignal` no se propagaban hasta `webhook-processor` porque el engine devuelve su propio tipo | Extender `SomnioEngineResult` (`somnio-engine.ts:91-93`) + mapear en `:995`. Desviación documentada por el executor (Regla 2 auto-fix) |
| `V4AgentInput` | `recordV4Event` payload (D-03) | `conversationId`/`turnId` podían venir `undefined` en la capa de input | Nullear explícitamente (`?? null`) en la capa V4AgentInput para payload limpio |

## Tips para Futuros Agentes

### Lo que funcionó bien
- **Aislar regresión vs pre-existente con `git checkout <base> -- <archivo>` quirúrgico**: restaurar SOLO el archivo sospechoso al commit base, correr el test, restaurar con `git checkout HEAD -- <archivo>`. Prueba definitiva sin worktrees ni stash.
- Ejecución secuencial en main (sin worktrees) cuando el SDK de merge-back no está disponible y dos plans comparten un archivo en waves distintas (`webhook-processor.ts` en Plan 01 wave 1 + Plan 02 wave 2).
- Esqueleto-placeholder de Plan 01 (`logger.info('inbox note pending Plan 02')`) como ancla buscable para que Plan 02 lo reemplace sin ambigüedad de líneas.

### Lo que NO hacer
- NO confiar en los conteos `grep -c` literales de los `<done>` gates cuando los executors dejan comentarios que mencionan el símbolo removido (ej: `storage.handoff` aparece 2x en comentarios pero 0 llamadas reales). Verificar `grep "symbol("` (con paréntesis) para llamadas reales.
- NO capturar suites largas con `| tail -25` y asumir que viste todas las fallas — el tail recorta fallas anteriores. Re-grep el archivo de salida completo por TODAS las líneas `FAIL`.

### Patrones a seguir
- Señal/decisión separadas: el productor (v4) emite señal determinista + nota visible; el consumidor (handoff agent futuro) toma la decisión dura con visión global. Reusa el `reason` que cada gate YA emite — no inventar razones.
- Supresión cosmética narrowly-scoped: guard `code === 'V4_ZOMBIE_LAMBDA_EXIT' && message.includes('ckpt_0_post_acquire')` — el mecanismo y la telemetría (`zombie_lambda_exit`) intactos; solo el display en inbox.

### Comandos útiles
```bash
# Gate determinista (excluye 4 smokes en vivo; vitest 1.6.1 = 1 solo --exclude)
FILES=$(ls src/lib/agents/somnio-v4/__tests__/*.test.ts | grep -vE "smoke-rag-a|smoke-rag-b|smoke-hybrid|comprehension-gemini" | tr '\n' ' ')
npx vitest run $FILES src/lib/agents/engine/__tests__/ src/lib/agents/interruption-system-v2/__tests__/

# Aislar regresión vs pre-existente
git checkout 08b5743a -- src/lib/agents/engine/v4-production-runner.ts
npx vitest run <test> ; git checkout HEAD -- src/lib/agents/engine/v4-production-runner.ts
```
