# v4-llm-fallback-resilience — Research

**Researched:** 2026-06-14
**Status:** Ready for planning
**Inputs:** CONTEXT.md (D-01..D-09) + `.planning/debug/v4-gemini-credits-comprehension-down.md`

> Investigación manual (no `gsd-sdk` en este entorno). 3 agentes de exploración de codebase + 1 búsqueda web + lecturas directas de los archivos clave.

---

## 0. Recap de causa raíz (confirmada en discuss)

Prod se quedó sin créditos de Gemini → la comprehension de `somnio-sales-v4` empezó a fallar y el bot se cayó. El error visible fue "Schemas contains too many parameters with union types (17 parameters...)". El predicado de fallback actual **NO** cae a Haiku ante créditos-agotados ni union-types (solo saturación/timeout) → re-lanza → `V4_AGENT_ERROR` → `[ERROR AGENTE]`.

Esta fase agrega: (1) fallback resiliente a esos 2 errores, (2) reporte de créditos (correo + evento), (3) handoff suave en doble-fallo.

---

## Q1 — ¿MorfX puede enviar correo HOY? **SÍ, y casi verbatim**

**VEREDICTO: SÍ.** Existe infra de correo madura y ya cableada.

- **Librería:** `resend` `^6.12.0` (package.json:94).
- **Módulo reusable:** `src/lib/agents/_shared/alerts.ts` — ya tiene `sendRunawayAlert()` + `maybeSendApproachingLimitAlert()`. Patrón:
  - `getResendClient()` lazy + **fail-silent** si `RESEND_API_KEY` ausente (alerts.ts:28-34).
  - `getFromAddress()` lee `platform_config.crm_bot_alert_from` (default sandbox `onboarding@resend.dev`, cache 30s) (alerts.ts:44-47).
  - **`RECIPIENT = 'joseromerorincon041100@gmail.com'`** YA hardcodeado (alerts.ts:36) — coincide exacto con D-03.
  - **Dedup in-memory** `lastSent` Map, key `{kind}:{workspaceId}:{agentId}`, TTL 15min (alerts.ts:49-71). Cubre el "no spamear" de D-04.
  - Fire-and-forget; nunca lanza (caller usa `void`).

**Implicación para el plan:** agregar 2 funciones a `alerts.ts` siguiendo el molde exacto:
- `sendLLMCreditsDepletedAlert({ workspaceId, provider, callSite })` — severidad NORMAL (D-07a: bot vivo con Haiku).
- `sendBothProvidersDownAlert({ workspaceId, callSite, geminiError, anthropicError })` — severidad CRÍTICA (D-07b: bot caído).
- **Dedup key:** el agotamiento de créditos es del **proveedor (global)**, no per-workspace → usar key `llm_credits:gemini` (no incluir workspaceId en la key de dedup) para 1 correo por outage; el workspaceId va en el CUERPO (D-03), no en la key. Para doble-fallo, key separada `both_down`.

### ⚠️ Acción de operador (Regla 5-adjacent, NO bloquea deploy)
`RESEND_API_KEY` **NO está en `.env.local`** ni (presumiblemente) en Vercel prod. Sin ella, el correo es **fail-silent** (se loguea warning, NO crashea) — el evento observability + handoff siguen funcionando. Para que los correos LLEGUEN de verdad, el operador debe setear en Vercel:
- `RESEND_API_KEY` (de resend.com/api-keys).
- Opcional: `platform_config.crm_bot_alert_from` → dominio DKIM-verificado (`alerts@morfx.app`); si no, usa el sandbox de Resend (funciona pero puede caer en spam).
- ⚠️ Gotcha conocido (memory `vercel_env_gotchas`): vars Sensitive de Vercel se pulean vacías; verificar > 0 chars; redeploy obligatorio tras setear.

**Decisión de diseño (para planner):** el correo debe ser **fail-soft** — si Resend no está configurado, el turno NO se ve afectado (el bot ya respondió con Haiku). El correo es best-effort sobre el evento observability (que es la fuente de verdad durable).

---

## Q2 — Forma exacta de los errores + cómo discriminar (preserva Pitfall #4)

### Cómo llega el error al predicado
**HALLAZGO CRÍTICO:** `comprehension.ts` (catch :184-202) **re-envuelve** el error de Gemini en un `new Error(...)` que **DESTRUYE la clase `APICallError`** pero **PRESERVA el message** (lo incrusta en el string). Resultado: en el path de comprehension, el predicado **NO** puede leer `statusCode`/`responseBody`/`isRetryable` — solo `message`. (Los otros 3 call-sites —generation/compliance/vision— pueden pasar `APICallError` crudo; el predicado debe cubrir AMBOS shapes.)

`isGeminiSaturation` (saturation.ts:24-43) ya tiene un **fallback por message-regex** (línea 41-42) precisamente por esto (Pitfall #5). Los nuevos predicados deben seguir ese patrón: matchear `message` Y (si es APICallError) `responseBody`.

### Strings exactos a matchear
| Condición | String en `message` | statusCode (cuando es APICallError crudo) |
|-----------|---------------------|-------------------------------------------|
| Créditos agotados | `"Your prepayment credits are depleted"` | ⚠️ **no confirmado** (local no expone; verificar en prod — probablemente 429 o 400) |
| Union-types | `"Schemas contains too many parameters with union types"` / `"too many states for serving"` | probablemente 400 |
| Parse/schema GENUINO (NO tocar) | `NoObjectGeneratedError` (no es APICallError) | — |

### Diseño del predicado (NO extender SATURATION_MSG a lo bruto)
El agente exploró y sugirió simplemente añadir los strings a `SATURATION_MSG`. **RECHAZADO** — eso conflaciona créditos/union-types con "saturación" y pierde la capacidad de (a) emitir el evento `llm_credits_depleted` específico, (b) tratar el doble-fallo distinto, (c) mandar el correo de créditos. **En su lugar:**
- **Nuevo predicado `isGeminiBillingError(err)`** → match `/prepayment credits are depleted|billing|quota|RESOURCE_EXHAUSTED.*quota|insufficient.*credit/i` sobre message+responseBody. (Cuidado: `RESOURCE_EXHAUSTED` solo a secas YA está en SATURATION_MSG como saturación; el billing usa la variante con "quota"/"credits". Verificar el string real en prod antes de lockear el regex — ver Open Question OQ-1.)
- **Nuevo predicado `isGeminiSchemaCapacity(err)`** → match `/too many parameters with union types|too many states for serving|union type/i`. NO incluir `anyOf` suelto (demasiado genérico, riesgo de falso positivo con parse errors).
- **Pitfall #4 INTACTO:** `NoObjectGeneratedError` genuino (parsing falló pese a request OK) NO matchea ninguno de los dos → sigue re-lanzando sin fallback.

### El orquestador (`index.ts:67-100`)
Hoy: `if (!isSaturation && !isTimeout) throw`. Nuevo:
```
const isSaturation = isGeminiSaturation(err)
const isTimeout    = isTimeoutError(err)
const isBilling    = isGeminiBillingError(err)
const isSchemaCap  = isGeminiSchemaCapacity(err)
if (!isSaturation && !isTimeout && !isBilling && !isSchemaCap) throw err  // Pitfall #4
// si isBilling → emit llm_credits_depleted + sendLLMCreditsDepletedAlert (severidad normal)
// si isSchemaCap → emit evento RUIDOSO (D-02) gemini_schema_capacity_fallback
// → en todos los casos: caer a Haiku (callAnthropic)
// si Haiku TAMBIÉN falla → fallback_failed + (si isBilling/saturación-global) sendBothProvidersDownAlert + propagar SENTINEL de handoff (ver Q6)
```

---

## Q3 — workspaceId disponible SIN cambiar firmas

`callWithGeminiFallback({callSite, gemini, anthropic})` NO recibe workspaceId. **PERO:** `ObservabilityCollector.workspaceId` está expuesto (collector.ts:75,109) y vive en `AsyncLocalStorage` (context.ts) — todo el turno corre dentro de `runWithCollector`. Entonces dentro del fallback:
```
const ws = getCollector()?.workspaceId  // string | undefined
```
da el workspace id **sin tocar los 4 call-sites**. El **nombre** del workspace no está en el collector → la función de correo (en alerts.ts, que ya importa domain) resuelve el nombre vía un lookup ligero por id (o el correo incluye solo el id + slice — decisión menor para el planner). Esto evita acoplar el fallback al domain layer.

**Nota Regla 3:** alerts.ts ya importa `@/lib/domain/platform-config` → resolver el nombre del workspace ahí (no en el fallback) respeta la regla.

---

## Q4 — Evento observability `llm_credits_depleted`

`emitFallbackEvent(label, payload)` (observability.ts:35-44) → `collector.recordEvent('pipeline_decision', label, payload)` + `console.log('[gemini-fallback] ...')`. Hoy 6 labels typed-union (observability.ts:21-33). **Para agregar:**
1. Extender `FallbackEventLabel` con:
   - `'llm_credits_depleted'` — payload `{ callSite, provider:'gemini', errorCode }`.
   - `'gemini_schema_capacity_fallback'` — el evento RUIDOSO de D-02 (union-types cubierto por Haiku). Payload `{ callSite, errorCode }`.
2. Emitir desde `index.ts` en los branches nuevos.
- **PII (T-fb-01):** SOLO metadatos (callSite, provider, errorCode, workspace id). NUNCA el message del usuario ni API keys. El errorCode = `err.name` (no el message completo, que podría traer fragmentos).
- Tapa el gap del incidente: hoy estos crashes NO quedan en `agent_observability_turns` (`con_error=0`); el evento en `agent_observability_events` SÍ los registra y alimenta el debug panel + dedup.

---

## Q5 — Alerta a operador: reusar alerts.ts (NO Inngest)

Hay 2 patrones en el codebase:
- **A) `alerts.ts`** (Resend directo + dedup in-memory 15min). Síncrono, fire-and-forget, ya manda EMAIL.
- **B) `bold-upstream-broken`** (`src/lib/bold/client.ts` + Inngest event + contador en `platform_config` + concurrency limit 1). Robusto cross-lambda pero hoy NO manda email (solo escribe observability + TODO de WhatsApp).

**RECOMENDACIÓN: usar A (alerts.ts).** El usuario pidió EMAIL explícitamente (no Inngest/WhatsApp). alerts.ts ya hace email + dedup + fail-silent + tiene el RECIPIENT correcto. Inngest añadiría complejidad (nuevo event type en `events.ts`, nueva función, await-en-serverless Pitfall 8) sin beneficio para el caso email. El dedup in-memory de alerts.ts es suficiente (un outage de créditos genera N turnos en la misma lambda warm → la Map los colapsa; cold start re-permite 1, aceptable).
- **Limitación conocida (documentar):** el dedup in-memory NO es cross-lambda. Con muchas lambdas concurrentes podrían salir varios correos al inicio de un outage. Mitigación: el evento observability `llm_credits_depleted` ES la fuente durable; si en el futuro molesta el multi-correo, se migra el dedup a `platform_config` (patrón BOLD). Para V1, in-memory basta.

---

## Q6 — Doble-fallo → handoff suave (D-06) — la parte más delicada

### Estado actual del error path
`comprehend()` (somnio-v4-agent.ts:372) lanza en doble-fallo → propaga → `v4-production-runner.ts:631` arma `code:'V4_AGENT_ERROR'` → `webhook-processor.ts:1115` inserta nota `[ERROR AGENTE]` (es una **nota operator-facing**, NO un WhatsApp al cliente).

### Patrón a replicar: el sentinel `interrupted_at_ckpt_*`
El codebase YA usa un discriminador por prefijo de string en `errorMessage`/`outcome.reason` (somnio-v4-agent.ts:271,405,608,811,863,1135) que el mapper de salida reconoce. **El soft-signal shipping (v4-handoff-soft-signal)** agregó `handoffSuggested` + `handoffReasonDetail` (agent:1065, runner mapResult). D-06 sigue ese molde:
1. Cuando `callWithGeminiFallback` doble-falla, lanzar un error con **sentinel en el message**, ej. `llm_providers_down: <detalle>`.
2. El sentinel **sobrevive** el re-wrap de comprehension (que preserva message).
3. `comprehend()`/el agente detecta el sentinel y hace **early-return** con `handoffSuggested:true` + `handoffReasonDetail:'ambos proveedores LLM caídos'` (en vez de propagar como V4_AGENT_ERROR duro) — igual que los early-returns de `interrupted_at_ckpt_*`.
4. El runner mapea eso a la nota `⚠ HANDOFF SUGERIDO` (SOFT path webhook-processor:~1117) + dispara `sendBothProvidersDownAlert` (correo crítico).

### Tensión D-05 ↔ D-06 (resolver en plan)
- D-05: "mantener el `[ERROR AGENTE]` siempre".
- D-06: doble-fallo → handoff suave (cliente no recibe error; humano atiende).
- **Reconciliación propuesta:** en el caso de éxito (Gemini cae, Haiku cubre) NO hay throw → NO hay `[ERROR AGENTE]` (nada que mostrar; el turno fue exitoso). El `[ERROR AGENTE]` SOLO aparece cuando el turno lanza = **doble-fallo**. Ahí pueden coexistir: nota `[ERROR AGENTE]` (D-05, operator-facing, cruda) + nota `⚠ HANDOFF SUGERIDO` (D-06) + correo crítico. El cliente no recibe nada técnico (ambas son notas internas). **Planner debe confirmar este entendimiento con el usuario si hay duda** — pero es consistente con ambas decisiones.
- ⚠️ Sutil: si comprehension doble-falla, NO hay análisis → el agente no puede generar respuesta de ningún tipo. Handoff es la única salida sensata (no hay "seguir con el bot"). Para generation/compliance/vision doble-fallo a mitad de turno, el handoff también aplica pero el diseño del early-return difiere por call-site — el plan debe trazar cada uno.

---

## Q7 — D-08: ¿el schema-17 es rechazado independiente de créditos? **NO RESUELTO — requiere repro con saldo**

Búsqueda web (ai.google.dev, zod#5807, cline#7897):
- El error "too many parameters with union types" mapea a **"The specified schema produces a constraint that has too many states for serving"** — una **restricción REAL de structured-output de Gemini**, NO un artefacto de billing. Causas: nombres largos, nesting, enums grandes, y **uniones (`anyOf`)**. Zod `.nullable()`/`.union()` generan `anyOf`, que Gemini Function Calling históricamente no soporta bien.
- **Novedad:** "as of November 2025 Gemini API update, support was added for advanced JSON Schema keywords including anyOf" — el soporte de anyOf mejoró, lo que explicaría por qué corrió 18h sin error.

**Conclusión honesta (sin asumir):**
- El union-types es un límite real que **puede reaparecer independiente de créditos** (versión del modelo, cambios server-side de "states for serving", nesting). → **Esto VINDICA D-02** (cubrir union-types en el fallback como defensa permanente, no solo como síntoma de créditos).
- La relación causa-efecto "créditos agotados → schema rechazado" sigue **sin probar**. La correlación temporal es fuerte pero no es prueba.
- **El único modo de cerrar D-08:** recargar créditos y correr `npx tsx scripts/_repro-gemini-schema.ts` (5 llamadas con el schema real). Si acepta 5/5 → schema OK, slim = deuda muerta. Si rechaza → schema genuinamente sobre el límite → reabrir slim como fase aparte.
- **El repro hoy NO distingue créditos de union-types** (créditos cae en "otro error"). Mejora menor opcional: agregar un branch que detecte "prepayment credits" y avise "key sin saldo, recargar y reintentar".

**Para el plan:** D-08 NO bloquea esta fase (el fallback cubre union-types pase lo que pase). El repro es una **tarea de verificación post-recarga**, no de implementación. Schema-slim queda diferido salvo que el repro lo justifique.

---

## Pitfalls (heredados + nuevos)

1. **Pitfall #4 (sagrado):** NO enmascarar parse/schema genuino con fallback. Predicados nombrados y específicos; `NoObjectGeneratedError` sigue re-lanzando.
2. **Pitfall #10 (config.ts):** importar `anthropic` de `@ai-sdk/anthropic` con literal `claude-haiku-4-5` — NUNCA vía `claude-client.ts` (mapea a Sonnet). El fallback ya lo hace; los call-sites de Haiku también.
3. **T-fb-01 (seguridad):** cero contenido de usuario / API keys en eventos NI en correos. Solo metadatos.
4. **Regla 6:** el módulo está acotado a `somnio-v4` (D-04 original). NO ampliar a v3/godentist/recompra/pw-confirmation. NO tocar su comportamiento.
5. **Correo fail-soft:** si Resend no configurado → warning silencioso, turno intacto. El correo NUNCA debe poder tumbar un turno que Haiku ya salvó.
6. **Dedup in-memory NO cross-lambda:** posible multi-correo al inicio de un outage. Aceptable V1; el evento observability es la fuente durable.
7. **Doble-fallo sentinel:** el string sentinel DEBE sobrevivir el re-wrap de comprehension (que preserva message). Verificar con test que el prefijo llega intacto al mapper.
8. **OQ-1 — string real de créditos:** el regex de `isGeminiBillingError` se basa en "Your prepayment credits are depleted" (visto en repro local). El statusCode real en prod (¿429? ¿400?) NO está confirmado. El plan debe matchear por message (robusto al re-wrap) y, si es APICallError crudo, también por statusCode una vez confirmado. Conservador: matchear message primero.

---

## Forma de implementación recomendada (file-by-file, para el planner)

| Archivo | Cambio | Decisiones |
|---------|--------|-----------|
| `llm-fallback/saturation.ts` (o nuevo `predicates.ts`) | + `isGeminiBillingError`, `isGeminiSchemaCapacity` (match message+responseBody) | D-01, D-02, D-09 |
| `llm-fallback/observability.ts` | + labels `llm_credits_depleted`, `gemini_schema_capacity_fallback` al union | D-02, D-04 |
| `llm-fallback/index.ts` | branches nuevos en el catch: billing/schemaCap → evento + correo + fallback a Haiku; doble-fallo billing/global → correo crítico + sentinel handoff | D-01,02,06,07 |
| `_shared/alerts.ts` | + `sendLLMCreditsDepletedAlert` (normal), `sendBothProvidersDownAlert` (crítico); dedup key global por provider; resolver nombre de workspace por id | D-03, D-07 |
| `somnio-v4-agent.ts` (comprehend caller) | detectar sentinel `llm_providers_down:` → early-return `handoffSuggested` (molde `interrupted_at_ckpt_*`) | D-06 |
| `comprehension.ts` | (verificar) que el sentinel del fallback sobreviva el re-wrap del catch :184-202 | D-06 |
| `scripts/_repro-gemini-schema.ts` | (opcional) branch que detecte "credits depleted" y avise recargar | D-08 |
| Tests | `llm-fallback/__tests__/` predicados + doble-fallo sentinel; `comprehension-fallback-parity.test.ts`; alerts dedup | todas |

**Threading workspaceId:** vía `getCollector()?.workspaceId` dentro del fallback (NO cambiar firmas).

---

## Open Questions para el planner

- **OQ-1:** statusCode real de "credits depleted" en prod (429/400/otro). Matchear por message primero (robusto). Confirmar con el operador o en el próximo incidente/repro.
- **OQ-2:** ¿el correo de créditos debe salir desde el fallback (1 chokepoint, 4 call-sites) o solo desde comprehension? Recomendado: desde el chokepoint con dedup global → 1 correo por outage sin importar call-site.
- **OQ-3:** confirmar con el usuario la reconciliación D-05↔D-06 (coexistencia de `[ERROR AGENTE]` + handoff en doble-fallo). Si el usuario quiere que en doble-fallo NO aparezca el `[ERROR AGENTE]` crudo, ajustar el mapper.
- **OQ-4:** ¿el handoff de doble-fallo aplica a los 4 call-sites o solo comprehension (donde no hay análisis)? El plan debe trazar generation/compliance/vision.

---

## Canonical refs (para el planner)
Ver CONTEXT.md §canonical_refs. Archivos núcleo confirmados con números de línea en este RESEARCH:
- `src/lib/agents/_shared/alerts.ts` (reuso de email — :28,36,44,49,86,133)
- `src/lib/agents/somnio-v4/llm-fallback/{index.ts:67-100, saturation.ts:24-43, observability.ts:21-44, config.ts:13-38}`
- `src/lib/agents/somnio-v4/comprehension.ts:149-202` (re-wrap del error)
- `src/lib/observability/collector.ts:75,109` + `context.ts` (workspaceId vía ALS)
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (sentinel pattern + handoffReasonDetail :1065)
- `src/lib/agents/engine/v4-production-runner.ts:631` + `webhook-processor.ts:1115` (V4_AGENT_ERROR → nota)
- `src/lib/bold/client.ts` + `inngest/functions/bold-upstream-broken.ts` (patrón alterno NO elegido)

## Sources (web)
- [Gemini structured output docs](https://ai.google.dev/gemini-api/docs/structured-output)
- [zod#5807 — anyOf incompatibility with Gemini Function Calling](https://github.com/colinhacks/zod/issues/5807)
- [cline#7897 — Gemini too complex json error](https://github.com/cline/cline/issues/7897)
