---
phase: 42.1-observabilidad-bots-produccion
plan: 11
type: execute
wave: 7
depends_on: [07, 08, 09, 10]
files_modified:
  - .planning/phases/42.1-observabilidad-bots-produccion/smoke-tests.md
  - .planning/phases/42.1-observabilidad-bots-produccion/activation-runbook.md
  - docs/analysis/04-estado-actual-plataforma.md
  - src/lib/observability/pricing.ts
autonomous: false

must_haves:
  truths:
    - "Smoke test de AsyncLocalStorage en Next 16 + Vercel Node runtime PASO (logea collector no-null desde funcion nested dentro de server action / inngest handler)"
    - "Smoke test de anti-recursion PASO (flush no se auto-captura — verificable con: insertar un turno con flag ON y confirmar que agent_observability_queries NO tiene filas apuntando a 'agent_observability_*' tables)"
    - "Latencia P50 del turno con flag ON medida en produccion: delta vs baseline <= 20ms"
    - "Latencia P95 del flush paso registrado en pino logs <= 200ms"
    - "Volumen real de filas/turno medido y documentado: matches expectativa del research"
    - "Precios en pricing.ts verificados contra https://www.anthropic.com/pricing (fecha anotada)"
    - "Feature flag OBSERVABILITY_ENABLED=true ACTIVADO en Vercel production"
    - "Panel UI accedido y funcional por el super-user — verifico turnos reales de los 3 bots"
    - "Sandbox Debug Panel intacto (sin regresion) — verificado con test manual"
    - "Documentacion actualizada en docs/analysis/04-estado-actual-plataforma.md (Regla 4) y LEARNINGS.md de la fase"
  artifacts:
    - path: ".planning/phases/42.1-observabilidad-bots-produccion/smoke-tests.md"
      provides: "Resultados de los smoke tests pre-activacion"
    - path: ".planning/phases/42.1-observabilidad-bots-produccion/activation-runbook.md"
      provides: "Runbook paso a paso de activacion + rollback"
    - path: "src/lib/observability/pricing.ts"
      provides: "Pricing table con precios verificados y fecha de validacion"
  key_links:
    - from: "OBSERVABILITY_ENABLED=true"
      to: "collector activation"
      via: "Vercel env var → cold start → isObservabilityEnabled() returns true"
      pattern: "OBSERVABILITY_ENABLED"
---

<objective>
Validar end-to-end que el sistema funciona en produccion sin impactar el agente, activar el feature flag, monitorear durante una ventana de observacion, y documentar aprendizajes. Este es el plan de "go-live" de la fase.

Purpose: Regla 6 (proteger agente en produccion) + Regla 4 (documentacion actualizada). No se activa nada hasta validar que no rompe produccion.
Output: Sistema ACTIVO en produccion + docs actualizados + LEARNINGS documentados.

**DESCOPE explicito (NO incluido en Phase 42.1):**
- Captura de eventos Inngest cross-turn (por ejemplo, eventos `agent/silence.detected` que disparan otro turno mas tarde).
- Captura de webhook entries (Meta webhook entry → conversation creation).
- Estos elementos estan mencionados en CONTEXT.md bajo cross-cutting pero quedan DEFERIDOS a una fase futura de observabilidad. Phase 42.1 cubre exclusivamente mecanismos turn-internos del agente.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-CONTEXT.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-01-SUMMARY.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-07-SUMMARY.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-10-SUMMARY.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verificar precios Anthropic + smoke tests pre-activacion</name>
  <files>
src/lib/observability/pricing.ts
.planning/phases/42.1-observabilidad-bots-produccion/smoke-tests.md
  </files>
  <action>
1. Verificar precios Anthropic actuales:
   - Consultar https://www.anthropic.com/pricing (via WebFetch) para Claude Haiku 4.5 y Claude Sonnet 4.5.
   - Actualizar `src/lib/observability/pricing.ts` con los precios actuales. Cambiar el TODO comment por `// Prices verified 2026-04-XX against https://www.anthropic.com/pricing` con fecha real.
   - Si un modelo en uso no esta en la pagina de pricing, flaggearlo en el archivo con comentario y costo 0.

2. Smoke test 1 — AsyncLocalStorage en Next 16:
   - Crear un archivo temporal `scripts/smoke/als-smoke-test.ts` (o usar un ruta debug en /api):
     ```typescript
     import { runWithCollector, getCollector, ObservabilityCollector } from '@/lib/observability'
     const c = new ObservabilityCollector({ conversationId: 'smoke', workspaceId: 'smoke', agentId: 'somnio-v3', turnStartedAt: new Date(), triggerKind: 'system_event' })
     await runWithCollector(c, async () => {
       await new Promise(r => setTimeout(r, 10))
       const nested = getCollector()
       console.log('ALS passthrough:', nested === c ? 'PASS' : 'FAIL')
     })
     ```
   - Ejecutar con `npx tsx scripts/smoke/als-smoke-test.ts` o exponerlo como /api/debug/als-smoke con gate de super-user.
   - Documentar resultado en `smoke-tests.md`.
   - Borrar el script/ruta al completar.

3. Smoke test 2 — Anti-recursion (requiere flag ON temporalmente en staging o dev):
   - En un entorno non-prod con schema aplicado, activar OBSERVABILITY_ENABLED=true.
   - Ejecutar un turno simulado del agente (mediante Inngest dev trigger o el mecanismo de test del proyecto).
   - Query: `SELECT count(*) FROM agent_observability_queries WHERE table_name LIKE 'agent_observability_%' OR table_name = 'agent_prompt_versions'`.
   - Expected: 0. Si es >0, HAY RECURSION → debug Pitfall 1 del research.
   - Documentar en smoke-tests.md.
   - **FALLBACK si la DB local no tiene el schema aplicado:** correr este smoke test directamente en Vercel produccion con flag ON para UN turno controlado (enviar UN solo mensaje al sandbox/staging del bot), inmediatamente DESACTIVAR el flag, y entonces query las tablas de observabilidad para evidencia de recursion. Si hay recursion, las filas escritas son inmutables (purgables manualmente con DELETE FROM agent_observability_*) y el flag OFF garantiza que no se siga acumulando.

4. Smoke test 3 — Sandbox Debug Panel sin regresion:
   - Abrir la ruta del sandbox en dev.
   - Ejecutar un turno simulado.
   - Verificar que el debug panel del sandbox sigue renderizando identico a antes.
   - Documentar en smoke-tests.md.

5. Crear `.planning/phases/42.1-observabilidad-bots-produccion/smoke-tests.md` con tabla de tests + resultados.

**BLOQUEANTE:** Si CUALQUIER smoke test falla, PARAR y reportar antes de activar en produccion.
  </action>
  <verify>
- pricing.ts tiene fecha de verificacion reciente
- smoke-tests.md existe con los 3 tests en PASS
- Sandbox Debug Panel intacto
  </verify>
  <done>
Pre-flight checks completos. Listo para activar feature flag en produccion.
  </done>
</task>

<task type="auto">
  <name>Task 2: Runbook de activacion + push a Vercel con flag OFF</name>
  <files>.planning/phases/42.1-observabilidad-bots-produccion/activation-runbook.md</files>
  <action>
Crear runbook con los pasos ordenados:

```markdown
# Phase 42.1 — Activation Runbook

## Pre-activacion (ya completado)
- [x] Migration aplicada en produccion (Plan 01 checkpoint)
- [x] Smoke tests en PASS (Plan 11 Task 1)
- [x] Precios Anthropic verificados

## Paso 1: Deploy del codigo con flag OFF
1. Confirmar que OBSERVABILITY_ENABLED NO existe en Vercel env vars de produccion.
2. Merge/push de la rama de Phase 42.1 a main.
3. Verificar que Vercel termina el deploy sin errores.
4. Smoke check post-deploy (flag OFF): enviar un mensaje real al bot de Somnio V3 → responde normalmente. Verificar que NINGUNA fila aparece en agent_observability_turns.
5. Monitorear p50/p95 del agente en Vercel logs durante 30 min (sin flag activo → debe ser identico al baseline previo).

## Paso 2: Activar flag OBSERVABILITY_ENABLED=true en Vercel
1. Vercel Dashboard → morfx → Settings → Environment Variables.
2. Agregar `OBSERVABILITY_ENABLED=true` scope: Production.
3. Trigger redeploy manual (o esperar proximo cold start).
4. Esperar 2-3 min para que Inngest functions cambien a nueva version.

## Paso 3: Verificacion post-activacion
1. Enviar un mensaje de prueba a Somnio V3, GoDentist, Recompra (3 mensajes separados).
2. Abrir inbox WhatsApp → seleccionar cada conversacion → toggle Debug bot.
3. Confirmar que se ven los turnos de los 3 bots con contadores >0.
4. Click en un turno de Somnio V3 → ver timeline con >5 events, queries, ≥1 AI call.
5. Expandir una AI call → confirmar system prompt, messages, response, tokens, costo visibles.
6. Monitoreo de latencia en Vercel logs durante 1 HORA:
   - p50 agente: debe ser <= baseline + 20ms
   - p95 flush (buscar logs `observability flush complete`): <= 200ms

## Rollback instantaneo
Si algo va mal:
1. Vercel Dashboard → env vars → OBSERVABILITY_ENABLED=false (o delete).
2. Trigger redeploy.
3. Nuevas invocaciones de Inngest seran no-op inmediatamente.
4. Datos ya escritos permanecen (se purgaran en 30 dias).

## Criterios de exito de la activacion
- [ ] Los 3 bots siguen funcionando
- [ ] Latencia sin regresion significativa
- [ ] Panel muestra datos reales de los 3 bots
- [ ] Pino log `observability flush complete` aparece en cada turno
- [ ] Ninguna alerta de error del agente durante 1 hora de monitoreo
```
  </action>
  <verify>
- Runbook existe y es seguible
  </verify>
  <done>
Runbook listo. User puede seguirlo paso a paso.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: CHECKPOINT — Usuario ejecuta runbook de activacion + valida</name>
  <what-built>
Sistema completo de observabilidad listo para activar:
- Schema aplicado en produccion
- Codigo instrumentado con flag OFF (deploy a Vercel de paso 1 del runbook)
- Panel UI completo
- Smoke tests en PASS
- Runbook de activacion + rollback documentado
  </what-built>
  <how-to-verify>
Seguir activation-runbook.md paso a paso:

1. **Paso 1 (deploy con flag OFF):**
   - Claude pushea a Vercel (git push origin main)
   - Usuario confirma que deploy de Vercel termina sin errores
   - Usuario envia 1 mensaje de prueba a Somnio V3
   - Usuario verifica en Supabase: `SELECT count(*) FROM agent_observability_turns` → **debe ser 0**
   - Usuario confirma: "deploy ok, flag OFF verified"

2. **Paso 2 (activar flag):**
   - Usuario agrega OBSERVABILITY_ENABLED=true en Vercel env vars (scope Production)
   - Usuario triggers redeploy
   - Usuario confirma: "flag activado"

3. **Paso 3 (verificacion):**
   - Usuario envia 3 mensajes (1 a cada bot)
   - Usuario abre cada conversacion en el inbox → toggle Debug bot
   - Usuario verifica que cada panel muestra un turno nuevo con contadores >0
   - Usuario expande un turno → ve timeline, queries, AI calls
   - Usuario monitorea Vercel logs 1 hora — confirma ausencia de errores nuevos
   - Usuario confirma: "sistema funcional en produccion, sin regresion del agente"

4. **Rollback (solo si falla):**
   - Usuario pone OBSERVABILITY_ENABLED=false
   - Usuario confirma que el agente vuelve al comportamiento baseline
   - Usuario reporta el problema especifico

Resume-signal: "sistema activo en produccion" o "rollback ejecutado: <razon>".
  </how-to-verify>
  <resume-signal>Usuario confirma activacion exitosa o rollback con diagnostico.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Actualizar documentacion + LEARNINGS (post-activacion)</name>
  <files>
docs/analysis/04-estado-actual-plataforma.md
.planning/phases/42.1-observabilidad-bots-produccion/LEARNINGS.md
  </files>
  <action>
Solo ejecutar DESPUES de que el usuario confirme activacion exitosa.

1. Actualizar `docs/analysis/04-estado-actual-plataforma.md`:
   - Agregar seccion "Sistema de Observabilidad de Bots (Phase 42.1)"
   - Describir: que bots cubre, como acceder al panel, retencion (30 dias), kill switch
   - Referenciar el activation-runbook.md
   - Marcar como ✅ ACTIVO con fecha

2. Crear `.planning/phases/42.1-observabilidad-bots-produccion/LEARNINGS.md`:
   - Bugs encontrados durante execution/activation
   - Decisiones que se validaron (o tuvieron que cambiar)
   - Latencia real medida vs estimada
   - Volumen real medido vs estimado en RESEARCH.md
   - Patrones aprendidos: AsyncLocalStorage en Next 16, fetch override en ambos clientes, anti-recursion via createRawAdminClient
   - Pitfalls que hit y como se resolvieron
   - TODOs para fases futuras (dashboard agregado, diff de prompts, export, etc.)

3. Commit final:
   ```
   docs(42.1): complete Phase 42.1 observability system activation
   
   - Feature flag OBSERVABILITY_ENABLED=true active in production
   - 3 bots covered: Somnio V3, GoDentist, Somnio Recompra
   - Panel UI accessible in WhatsApp inbox (super-user only)
   - 30-day retention via monthly partitions + daily cron
   - Zero-overhead no-op path when flag OFF
   ```
  </action>
  <verify>
- docs/analysis/04-estado-actual-plataforma.md actualizado con la fase
- LEARNINGS.md existe con bugs, decisiones validadas, metricas reales
- Commit hecho y pusheado
  </verify>
  <done>
Fase 42.1 COMPLETA. Sistema activo, documentado, monitoreado.
  </done>
</task>

</tasks>

<verification>
- Smoke tests pasan
- Activacion exitosa confirmada por el usuario
- Docs actualizados (Regla 4)
- LEARNINGS documentados (Regla 0)
- Panel accesible y funcional con datos reales de los 3 bots
</verification>

<success_criteria>
El sistema de observabilidad esta ACTIVO en produccion para los 3 bots conversacionales. El super-user puede abrir cualquier conversacion en el inbox y ver el debug panel con timeline completo de cualquier turno de los ultimos 30 dias. El kill switch esta verificado. No hay regresion del agente. Documentacion y LEARNINGS actualizados.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-11-SUMMARY.md` con: resultados de smoke tests, metricas reales de latencia (p50/p95), volumen real de filas/turno, lista de bugs encontrados y corregidos, link al runbook y LEARNINGS.md.
</output>
