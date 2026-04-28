---
phase: somnio-sales-v3-pw-confirmation
plan: 05
status: complete
wave: 2
completed: 2026-04-27
duration_minutes: 15
---

# Plan 05 SUMMARY — Wave 2 Comprehension Layer (schema + prompt + entry)

## Decision agregada

**GO** — 3 archivos creados en `src/lib/agents/somnio-pw-confirmation/`. typecheck passes. 3 atomic commits, NO push.

## Commits (3 atomic)

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `03c87a9` | `feat(somnio-sales-v3-pw-confirmation): add comprehension Zod schema (22 intents + datos_extraidos shape)` |
| 2    | `b1ba1be` | `feat(somnio-sales-v3-pw-confirmation): add comprehension prompt builder (post-purchase context + CRM section conditional + D-26 state guard instruction)` |
| 3    | `db787d8` | `feat(somnio-sales-v3-pw-confirmation): add comprehension entry — Haiku call via generateObject + degradation fallback` |

## Archivos creados

| Path | LoC | Rol |
|------|-----|-----|
| `src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts` | 192 | Zod `MessageAnalysisSchema` + `DatosExtraidosSchema` + `PW_INTENT_VALUES` (22 intents) + types |
| `src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts` | 246 | Pure function `buildPwConfirmationPrompt({state, history, crmContext})` → string con 7 secciones (D-05 + D-26 honrados) |
| `src/lib/agents/somnio-pw-confirmation/comprehension.ts` | 154 | `analyzeMessage(...)` — AI SDK v6 generateObject + Haiku + Zod schema + degradation fallback |

**Total: 592 LoC** across 3 files.

## D-26 quote (Section 5 — "Estado actual de la maquina")

Verbatim del prompt builder (line 214-220, `comprehension-prompt.ts`):

```
## 5. Estado actual de la maquina

Phase actual: `${currentPhase}`

NOTA D-26: Si el estado es `awaiting_confirmation` o `awaiting_confirmation_post_data_capture`,
una respuesta afirmativa (si/dale/ok/correcto/listo/confirmo/👍) DEBE clasificarse como
`confirmar_pedido`. NO requiere validar el ultimo template enviado — el estado de la maquina es el guard.
```

D-26 también está reforzado en Section 3 (Intents) con el bloque:

```
REGLA CRITICA D-26 (state-machine guard):
Si el estado actual de la maquina es `awaiting_confirmation` o `awaiting_confirmation_post_data_capture`,
una respuesta afirmativa del cliente (si / dale / ok / correcto / listo / confirmo / 👍) DEBE clasificarse
como `confirmar_pedido`. NO requiere validar el ultimo template enviado — el estado de la maquina es
el guard. NO consultes `messages.template_name` (esa columna es informativa, no autoritativa).
```

Y en el `.describe()` del campo `intent` en el Zod schema (`comprehension-schema.ts:139-145`):

```typescript
intent: z
    .enum(PW_INTENT_VALUES)
    .describe(
      'Primary intent of the message ... ' +
        'D-26: si el estado actual de la maquina es awaiting_confirmation y el cliente ' +
        'responde si/dale/ok/correcto/listo/confirmo, intent = confirmar_pedido (sin importar ' +
        'que template fue el ultimo enviado). Si no se puede clasificar, usar "fallback".'
    ),
```

## D-05 quote (Section 6 — "Contexto del pedido (CRM)")

Verbatim del prompt builder (line 222-228, conditional on `hasCrmContext`):

**Cuando CRM context disponible:**

```
## 6. Contexto del pedido (CRM)

${crmContext.trim()}

(Usa este contexto para personalizar la comprension: detecta datos faltantes en el pedido — direccion, ciudad, departamento, telefono — y clasifica el intent considerando el estado real del pedido. NO reinventes datos; lo que NO esta aqui o en el mensaje del cliente, NO lo extraigas.)

---
```

**Cuando NO disponible (degradación graceful):**

```
## 6. Contexto del pedido (CRM)

(No disponible — error o timeout del CRM reader. Procede con cautela; si necesitas datos del pedido para responder, pide al cliente que confirme su numero de pedido o nombre completo. NO inventes datos del pedido.)

---
```

Plan 09 Inngest function `pw-confirmation-preload-and-invoke` poblara `crmContext` antes de invocar `analyzeMessage(...)` (D-05 BLOQUEANTE — el reader corre primero).

## 22 Intents finales (Zod enum + prompt list)

**14 informacionales** (clonados de sales-v3 set per D-15 + D-27):
`saludo, precio, promociones, contenido, formula, como_se_toma, pago, envio, ubicacion, contraindicaciones, dependencia, efectividad, registro_sanitario, tiempo_entrega`

**7 sales / post-purchase** (PW-confirmation specific):
`confirmar_pedido, cancelar_pedido, esperar, cambiar_direccion, editar_items, agendar, pedir_humano`

**1 fallback:** `fallback`

**Excluidos (NO en el enum, prompt explica por qué):** `quiero_comprar, seleccion_pack, confirmar` — estos son intents de sales-v3 (prospect agent), no aplican post-compra (D-18 scope NO).

## DatosExtraidosSchema (6 campos shipping)

Todos `z.string().nullish()` — la LLM nunca debe inventar datos:

| Campo | Describe |
|-------|----------|
| `nombre` | First name; capitalize properly. NULL if not in message. |
| `apellido` | Last name; capitalize properly. NULL if not in message. |
| `telefono` | Normalizar a 573XXXXXXXXX (10 digitos despues de 57). |
| `direccion` | Solo el texto de la direccion (NO incluir ciudad/depto). |
| `ciudad` | Proper case (bogota → Bogota). |
| `departamento` | Proper case (cundinamarca → Cundinamarca). |

## comprehension.ts API

```typescript
export interface AnalyzeMessageInput {
  message: string
  state: unknown
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>
  crmContext?: string
}

export async function analyzeMessage(input: AnalyzeMessageInput): Promise<MessageAnalysis>
```

**Modelo:** `anthropic('claude-haiku-4-5')` (literal, parity sales-v3/recompra).
**maxOutputTokens:** 512.
**temperature:** 0.1 (deterministic).
**Schema:** `MessageAnalysisSchema` (Zod) via `generateObject` AI SDK v6.

**Degradation policy:**
- Cualquier throw del SDK (timeout, network, schema parse fail) → catch → return `{intent: 'fallback', confidence: 0, datos_extraidos: null, notas: 'Comprehension error: ...'}`.
- Logger `createModuleLogger('somnio-pw-confirmation-comprehension')` registra el error con messagePreview.
- Telemetry `getCollector()?.recordEvent('comprehension', 'result', {...durationMs, fallback: true, error})`.
- NUNCA throws al caller (REGLA 6 — observability nunca bloquea agent flow). State-machine pure (D-25).

## typecheck output

```bash
$ npx tsc --noEmit
exit: 0
(no output)
```

**Zero new TS errors** introduced by the 3 files in this plan.

## Desviaciones del plan

**Ninguna desviación material.** Todas las assertions del plan pasaron en primera ejecución.

**Nota housekeeping:** Plan 04 (`constants.ts`) se ejecutó en paralelo (Wave 2) y su archivo apareció untracked durante mi commit de Task 1. Hice `git reset --soft HEAD~1` + `git reset HEAD constants.ts` para asegurar que mi commit incluyera SOLO `comprehension-schema.ts` (el otro executor commiteó `constants.ts` por separado en `02ebc84`). No hay acoplamiento — Plan 05 es self-sufficient (el schema re-exporta `PW_INTENT_VALUES`, no importa de constants.ts), per la nota explícita en el plan ("Si Plan 04 termino primero, comprehension.ts puede importar `PW_INTENT_VALUES` desde schema.ts pero NO desde constants.ts (acoplamiento minimo).").

## Implicancias para Plans subsiguientes

- **Plan 06 (transitions.ts + state.ts):** puede consumir `MessageAnalysis.intent` para driver transitions. Mergea `analysis.datos_extraidos` en captured state via `mergeAnalysis`.
- **Plan 11 (engine-pw-confirmation.ts):** invoca `analyzeMessage({message, state, history, crmContext})` con `crmContext` extraído de `session_state.datos_capturados['_v3:crm_context']`. Si la sesión no tiene crm_context (Inngest reader falló o timed out), pasa `undefined` y el prompt degrada graciosamente.
- **Plan 12 (tests):** mockear `generateObject` de `'ai'` package. Verificar:
  - Happy path: intent classification correcta para los 22 valores.
  - D-26: estado `awaiting_confirmation` + mensaje "si"/"dale"/"ok" → intent `confirmar_pedido`.
  - Degradation: when `generateObject` throws → return `{intent: 'fallback', confidence: 0}` sin throw al caller.
  - CRM section conditional: prompt incluye `crmContext` cuando provisto, mensaje degradado cuando ausente.
  - Telemetría: `getCollector()?.recordEvent` invocado con shape correcto en happy + fallback paths.

## Self-Check

- [x] Archivo `src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts` existe con 192 LoC.
- [x] Archivo `src/lib/agents/somnio-pw-confirmation/comprehension-prompt.ts` existe con 246 LoC.
- [x] Archivo `src/lib/agents/somnio-pw-confirmation/comprehension.ts` existe con 154 LoC.
- [x] `MessageAnalysisSchema` exportada con intent enum (22 PW intents).
- [x] `DatosExtraidosSchema` exportada con 6 campos shipping nullish.
- [x] `buildPwConfirmationPrompt` exportada con signature `({state, history, crmContext}) => string`.
- [x] Prompt incluye 7 secciones (Producto, Tu rol, Intents, Extraccion, Estado actual, CRM context, Conversacion).
- [x] Prompt incluye "ELIXIR DEL SUEÑO" + "INVIMA / PHARMA SOLUTIONS SAS" + precios + "YA HIZO UN PEDIDO" + "D-26".
- [x] CRM section conditional: con/sin `crmContext.trim().length > 0`.
- [x] `analyzeMessage` invoca `generateObject` con `claude-haiku-4-5` + `MessageAnalysisSchema` + `maxOutputTokens: 512` + `temperature: 0.1`.
- [x] Error path retorna `{intent: 'fallback', confidence: 0, datos_extraidos: null, notas: 'Comprehension error: ...'}`.
- [x] Telemetry `getCollector()?.recordEvent('comprehension', 'result', ...)` en happy + fallback paths (try/catch swallow).
- [x] typecheck passes (exit 0, no errors in new files).
- [x] 3 atomic commits, NO push.
- [x] Commits: `03c87a9` (schema) → `b1ba1be` (prompt) → `db787d8` (entry).
- [x] Plan 11 (engine) puede invocar `analyzeMessage(...)` con `crmContext` del session state.
- [x] Plan 12 puede testear (mock `ai.generateObject`).
- [x] D-26 implementado en el prompt (instruccion clara al LLM en sections 3 + 5 + en `intent` `.describe()`).
- [x] D-05 honrado (CRM context section conditional con degradación graceful).

**Self-Check: PASSED**
