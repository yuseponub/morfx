---
status: diagnosed
created: 2026-06-14
updated: 2026-06-14
severity: high
component: somnio-sales-v4 / comprehension / llm-fallback
---

# Incidente: v4 comprehension caído — Gemini sin créditos → error de schema union types

> Handoff para retomar TRAS compact. Contiene investigación completa + 2 arreglos a implementar + 1 follow-up.
> **El bot v4 está LIVE en Somnio (NO dormant)** — atiende clientes reales (turns data confirma v4 respondiendo 26h). Cualquier fix debe cuidar producción (Regla 6 / Regla 5).

## Síntoma

Inbox de Somnio (workspace `a3843b3f-c337-4836-92b5-89c58bb98490`), hoy 2026-06-14 desde ~16:00 Colombia:
```
[ERROR AGENTE] V4_AGENT_ERROR: V4_AGENT_ERROR @ comprehension:
[Comprehension-v4 generateText] AI_APICallError: Schemas contains too many parameters
with union types (17 parameters with type arrays or anyOf). This…
```
El bot dejó de responder (caído).

## Causa raíz (CONFIRMADA)

**La cuenta/key de Gemini en PROD se quedó sin créditos** (confirmado por el usuario). Ese fue el "qué cambió hoy". Antes de eso, v4 corrió ~18h con el MISMO schema sin un solo error.

**Mecanismo (hipótesis fuerte, no probada al 100%):** con créditos agotados / tier degradado, la API de Gemini aplica validación de schema más estricta (o un code-path distinto) y rechaza el `anyOf`/union — mientras que con créditos lo aceptaba. Por eso el error que se VE es "too many parameters with union types" y no un error de billing explícito.

### Por qué el schema dispara esto
`MessageAnalysisSchema` (`src/lib/agents/somnio-v4/comprehension-schema.ts`) tiene **17 campos `.nullable()`** → 17 `anyOf` en el JSON Schema que recibe Gemini. La API de Gemini (Function Calling / structured output) **no soporta bien `anyOf`/union** — limitación real y documentada:
- vercel/ai #10121, colinhacks/zod #5807, googleapis/python-genai #1807, letta-ai/letta-code #1574.
Los 17: en `intent` → secondary_confidence, secondary_confidence_reasoning, secondary_query, primary_query; en `datos` → nombre, apellido, telefono, ciudad, departamento, direccion, barrio, correo, indicaciones_extra, cedula_recoge, pack, entrega_oficina, menciona_inter.
El nº17 (`primary_query`) entró el 2026-06-13 19:02 (commit `1d17e20b`, standalone `v4-dual-intent-query-split`) — pero estuvo live ~18h SIN fallar, así que el schema-en-17 NO es el detonante temporal; el detonante fue quedarse sin créditos.

## Evidencia / qué se descartó (sin asumir)

- ❌ NO fue switch v3→v4: `agent_observability_turns` muestra `agent_id='somnio-sales-v4'` en TODAS las horas (13-jun 19:00 → 14-jun 22:00).
- ❌ NO fue nuestro cambio de handoff: `git log 65658bbd..HEAD -- comprehension*` vacío; el deploy de hoy no tocó comprehension ni `package.json`/lockfile (sin bump del AI SDK). El JSON Schema enviado a Gemini es byte-idéntico antes/después.
- ❌ NO fue que el schema-17 "saliera hoy": `65658bbd` (prod antes de hoy) ya tenía 17 nullables; live desde anoche.
- ✅ Confirmado: prod sin créditos de Gemini.
- ⚠️ Gap de observabilidad: estos crashes de comprehension **NO se registran** en `agent_observability_turns` (`con_error=0` incluso en horas con error) — el turno revienta antes del flush. Solo se ven en el inbox como `[ERROR AGENTE]`.
- Repro local (`scripts/_repro-gemini-schema.ts`): la key local de Gemini TAMBIÉN está sin saldo → 5/5 "Your prepayment credits are depleted" → no se pudo reproducir el union error localmente (billing corta antes). Re-correr con una key con saldo para confirmar el rechazo del schema como hecho.

## Arreglos a implementar (TRAS compact)

### FIX 1 — Resiliencia del fallback (que el bot no se caiga aunque Gemini falle)
**Problema:** `callWithGeminiFallback` (`src/lib/agents/somnio-v4/llm-fallback/index.ts:68-71`) solo cae a Haiku ante **saturación/timeout**. `isGeminiSaturation` (`llm-fallback/saturation.ts:24-39`) atrapa statusCode 503/429/500/504 + red (statusCode null + isRetryable). El "Pitfall #4" (`index.ts:70-71`) **re-lanza** parse/schema → por eso el union-types NO cae a Haiku y revienta. El error de créditos tampoco cayó (en repro fue "Otro error", no saturation).

**Qué hacer:** extender el predicado de fallback para que TAMBIÉN dispare Haiku ante:
  (a) **error de schema union-types de Gemini** — match `/too many parameters with union types|anyOf|union type/i` en `message`/`responseBody`. Es Gemini-específico; Haiku usa `ANTHROPIC_COMPREHENSION_JSON_SCHEMA` (saneado, sin el límite) → SÍ responde.
  (b) **error de créditos agotados** — match `/prepayment credits are depleted|billing|quota/i` (y/o el statusCode real de ese error en prod — VERIFICAR: en local no fue 429). Decisión de diseño: ¿caer a Haiku ante billing de Gemini? Sí, para no caer el bot — pero ojo, si Anthropic también está sin saldo se cae igual (documentar).
**Cuidado:** NO romper el Pitfall #4 para errores de parse/NoObjectGenerated GENUINOS (esos sí deben re-lanzar — un schema mal formado fallaría igual en Haiku). Discriminar: union-types/credits = Gemini-específico → fallback; parse/NoObject = re-throw.
**Archivos:** `llm-fallback/index.ts`, `llm-fallback/saturation.ts` (o un nuevo predicado `isGeminiSchemaCapacity`/`isBillingError`). Tests: `llm-fallback/__tests__/`, `comprehension-fallback-parity.test.ts`, `sub-loop/__tests__/fallback-parity.test.ts`.
**Consumidores del fallback (todos se benefician):** comprehension.ts, sub-loop/generation-call.ts, sub-loop/compliance-check.ts, media/image-classifier.ts.

### FIX 2 — Reportar correctamente la falta de créditos (SÍ se puede)
**Problema:** hoy un agotamiento de créditos sale como `[ERROR AGENTE] ...union types...` — críptico y engañoso. Además NO queda en observability (turns no captura el crash).
**Qué hacer:** detectar específicamente la condición de créditos agotados (match del message + statusCode) y emitir:
  - Un evento de observability dedicado (ej. `pipeline_decision:llm_credits_depleted` con provider='gemini') en `agent_observability_events` (tabla que SÍ se ve en debug panel).
  - Una alerta operador clara (patrón existente: Inngest event tipo `bold-upstream-broken.ts` → notificación). Considerar nota inbox legible "⚠ Sin créditos de Gemini — usando Haiku" en vez del `[ERROR AGENTE]` técnico, o suprimir el `[ERROR AGENTE]` cuando el fallback cubrió el turno.
**Factible:** sí — el error trae el string "Your prepayment credits are depleted"; se matchea igual que SATURATION_MSG.

### FOLLOW-UP (deuda, no urgente) — adelgazar el schema bajo el límite de Gemini
Reducir los 17 `anyOf`: los 10 strings nullable de `datos` (nombre/apellido/telefono/ciudad/departamento/direccion/barrio/correo/indicaciones_extra/cedula_recoge) → `z.string()` con default `''` en vez de `.nullable()`, manejando `''`=no-capturado en los consumidores. Baja de 17 a ~7 anyOf → Gemini lo acepta aunque la validación sea estricta → no dependes de Haiku por cada turno. Requiere test cuidadoso del parsing de datos (consumidores que checan `null`). Archivo: `comprehension-schema.ts` + revisar consumidores de `analysis.datos.*`.

## Acción inmediata del operador (independiente del código)
Recargar créditos de la key de Gemini de prod (Google AI Studio → Billing) → el bot debería volver a responder con Gemini de inmediato (el schema-17 funcionaba con créditos). Esto desbloquea sin deploy. Los FIX 1/2 son para que NO vuelva a caerse cuando Gemini falle.

## Refs
- `src/lib/agents/somnio-v4/comprehension.ts` (call + catch diagnóstico :184-201; gemini branch :149-169; anthropic branch :170-182)
- `src/lib/agents/somnio-v4/comprehension-schema.ts` (MessageAnalysisSchema, 17 nullables)
- `src/lib/agents/somnio-v4/llm-fallback/index.ts` (:68-71 decisión fallback) + `saturation.ts` (:24-39 predicado)
- `scripts/_repro-gemini-schema.ts` (re-correr con key con saldo)
- Web evidence: vercel/ai#10121, zod#5807, python-genai#1807, letta-code#1574
- Query usada (qué agente + errores por hora): `agent_observability_turns` filtrado por workspace Somnio.
