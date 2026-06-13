# v4-dual-intent-query-split — Context

**Gathered:** 2026-06-13
**Status:** Ready for planning (discuss + research efectivamente completos — ver `<code_context>`)
**Type:** Standalone (no roadmap phase — orquestación manual, mismo patrón que `v4-gate-confidence-fixes` y `v4-observability-completeness`)

<domain>
## Phase Boundary

Un fix **aditivo** al agente `somnio-sales-v4` (DORMANT en prod) que elimina la **contaminación de query dual-intent en la generación del sub-loop RAG**. Descubierto y reproducido en vivo el 2026-06-13 mientras se verificaba `v4-gate-confidence-fixes`.

**El bug (causa raíz dura, reproducida):**
Cuando un turno tiene 2 intents, el slot PRIMARIO recibe el `rawMessage` completo (que incluye la pregunta del secundario), mientras el SECUNDARIO ya recibe una sub-query segmentada (`secondary_query`). La generación (Gemini Flash, CALL 2) ve en la query partes que NO están en el material del topic primario → aplica la regla anti-invención (líneas 380-382 de `prompt.ts`: "si el material no cubre parte de la pregunta → responseConfidence bajo + FUERA_SCOPE/FALTA_INFO") → penaliza la confianza global → cae bajo el threshold 0.70 → handoff silencioso. **La respuesta del primario, que el modelo podía dar al 95%, se descarta entera.**

**EN SCOPE (1 fix):**
Segmentar también el PRIMARIO: agregar `primary_query` a comprehension (gemelo de `secondary_query`) y consumirlo en `computeSlots` para el slot primario cuando hay 2 intents.

**NO ES ESTA FASE (deferidos, ver `<deferred>`):**
- Que el handoff del primario corte el procesamiento del secundario (bug de orquestación de slots, separado).
- Loguear el `responseText` generado en observabilidad (hueco detectado: `subloop_generation_completed` no guarda el texto).
- Zombie 70s, try/catch crash CRM, KB enrichment (diferidos de `v4-gate-confidence-fixes`).

**Regla 6:** todo aditivo. v4 sigue DORMANT en prod; cero cambio para v3/godentist/recompra/pw-confirmation. **Los turnos de un solo intent quedan byte-idénticos** (el `primary_query` solo se usa cuando `secondary != 'ninguno'`).
</domain>

<decisions>
## Implementation Decisions

### D-01 — Campo `primary_query` en comprehension schema (gemelo de `secondary_query`)
- **Decisión:** agregar `primary_query: z.string().nullable()` a `intent` en `comprehension-schema.ts`, justo después de `secondary_query` (:70-75).
- **Semántica:** "Sub-query segmentada del PRIMER intent — la parte del mensaje que corresponde al primary, reformulada como pregunta auto-contenida. `null` cuando `secondary === 'ninguno'` (se usa el mensaje completo)."
- **Razón:** simétrico a `secondary_query`, que ya hace exactamente esto para el secundario ("reformulada como pregunta auto-contenida"). El LLM hace la segmentación/paráfrasis — resuelve el caso del usuario "si está combinado y es difícil dividirlo en frases".

### D-02 — Instrucción en comprehension prompt (aditiva, no toca clasificación)
- **Decisión:** en `comprehension-prompt.ts`, agregar una línea paralela a la de `secondary_query` (:190) instruyendo `primary_query`, y actualizar los 4 ejemplos (:198-211) + la regla "SIEMPRE poblar" (:273) para incluir `primary_query` cuando `secondary != 'ninguno'`.
- **Regla de poblado:** `primary_query` se puebla SOLO cuando hay 2 intents (`secondary != 'ninguno'`); si `secondary == 'ninguno'` → `primary_query = null`. (El slot primario de un solo intent usa el mensaje completo igual que hoy.)
- **Razón / Regla 6:** cambio ADITIVO — se agrega un campo de salida nuevo, NO se toca la lógica de clasificación de intent/confidence existente. El modelo puebla un campo más; la clasificación queda intacta. Riesgo principal a vigilar en research/plan: que agregar el campo no desvíe la clasificación (mitigación: instrucción aislada, no reescribir las reglas de intent).

### D-03 — `computeSlots` usa `primary_query` solo con secundario presente (fallback `rawMessage`)
- **Decisión:** agregar `primaryQuery: string | null` a `ComputeSlotsArgs` (`slots.ts`) y cambiar la selección de `ragQuery` del slot primario (líneas 128-129):
  ```typescript
  ragQuery: primaryCoverage === 'low'
    ? (secondaryIntent !== 'ninguno' ? (primaryQuery ?? rawMessage) : rawMessage)
    : null,
  ```
- **Razón / blast radius mínimo:** el `primary_query` SOLO se usa cuando hay secundario. Turnos de un solo intent → `rawMessage` exacto = byte-idéntico a hoy (Regla 6). Fallback defensivo a `rawMessage` si comprehension no produjo `primary_query` aun habiendo secundario (sin crash).

### D-04 — `somnio-v4-agent.ts` pasa `primary_query` a `computeSlots`
- **Decisión:** en el call site de `computeSlots` (`somnio-v4-agent.ts:411-417`), agregar `primaryQuery: analysis.intent.primary_query ?? null` (junto a `secondaryQuery` y `rawMessage` que ya se pasan).

### D-05 — NO tocar el prompt de generación (alternativa descartada)
- **Decisión:** NO se modifica `buildGenerationPrompt` (`prompt.ts`) ni las reglas anti-invención / calibración M1/M2/M3.
- **Razón:** la alternativa de instruir a la generación "ignora las partes tangenciales" pelea contra la regla anti-invención calibrada (la regla Miami→FUERA_SCOPE) y tiene blast radius sobre TODAS las generaciones del sub-loop (riesgo de regresión en la calibración). Este fix ataca el INPUT (query limpia por topic), no el juicio del modelo. Ya probado: con query limpia el modelo da 0.95/RESPONDE_BIEN solo, sin tocar su prompt.

### Claude's Discretion
- Redacción exacta de la instrucción de `primary_query` en el prompt y de los 4 ejemplos actualizados.
- Si los tests de `slots.ts` se extienden con casos nuevos (dual-intent low-primary usa primary_query; single-intent usa rawMessage; fallback null→rawMessage) o se agrega un test de regresión dedicado.
- Si se agrega un test de comprehension que verifique que con 2 intents se puebla `primary_query` (deseable, aditivo).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diagnóstico / evidencia (fuente de verdad)
- `.planning/standalone/v4-gate-confidence-fixes/FINDINGS.md` — diagnóstico del turno real `73cb2b38` y mecanismos del sub-loop.
- `scripts/_v4-probe-generation.ts` — probe read-only que REPRODUCE la contaminación: query combinada → 0.6/`FALTA_INFO`; query aislada → 0.95/`RESPONDE_BIEN` (mismo material `interaccion_alcohol`). Reusable para validar el fix.
- `scripts/_v4-probe-comprehension.ts` — probe de comprehension (verifica `primary`/`secondary`/confidences de un mensaje).

### El bug + el fix
- `src/lib/agents/somnio-v4/slots.ts` — `computeSlots` (:102-158); **el bug está en :128-129** (`ragQuery: primaryCoverage === 'low' ? rawMessage : null` — comentario "D-04 only segments the secondary"). `ComputeSlotsArgs` (:72-89). El secundario ya usa `secondaryQuery ?? rawMessage` (:153) — patrón a clonar para el primario.
- `src/lib/agents/somnio-v4/comprehension-schema.ts` — `secondary_query` (:70-75), `secondary_confidence` (:61), `intent` object (:28-76). Agregar `primary_query` aquí.
- `src/lib/agents/somnio-v4/comprehension-prompt.ts` — instrucción de `secondary_query` (:190), ejemplos dual-intent (:198-211), regla "SIEMPRE poblar" (:273). Agregar `primary_query` paralelo.
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — call site de `computeSlots` (:411-417), pasa `secondaryQuery`/`rawMessage`. También loguea `secondary_query` en evento (:449). Agregar `primaryQuery`.

### Contexto del mecanismo (NO se modifica — solo entender)
- `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` — CALL 2 (Gemini Flash + fallback Haiku); `GenerationOutputSchema` con `responseConfidence` + `binary` (RESPONDE_BIEN/FALTA_INFO/FUERA_SCOPE).
- `src/lib/agents/somnio-v4/sub-loop/prompt.ts` — `buildGenerationPrompt` (:332+), reglas anti-invención (:371-387, la regla "Miami → FUERA_SCOPE" es el smoking gun). **NO modificar (D-05).**
- `src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts` — el threshold 0.70 (de `v4-gate-confidence-fixes`) que descarta la respuesta contaminada.

### Reglas
- `CLAUDE.md` Regla 6 (aditivo, v4 dormant, single-intent byte-idéntico) + Regla 3 (no createAdminClient fuera de domain — este fix no toca DB).
</canonical_refs>

<code_context>
## Existing Code Insights

### Discuss + Research efectivamente completos
Este standalone nace de una investigación en vivo ya cerrada (sesión 2026-06-13):
- **Causa raíz confirmada** leyendo el código (`slots.ts:128`) — no hipótesis.
- **Reproducida** con `scripts/_v4-probe-generation.ts`: combinada 0.6/FALTA_INFO vs aislada 0.95/RESPONDE_BIEN, estable en 2 corridas, con el `confidenceRationale` del modelo nombrando la causa ("la pregunta toca dos temas... Bucaramanga no aparece... requiere escalada").
- **Fix diseñado** con file:line exactos (D-01..D-05).
Por eso el plan corre con `--skip-research`.

### Reusable Assets
- `secondary_query` (schema + prompt + slots) — el patrón EXACTO a clonar para el primario. El secundario ya funciona así.
- `scripts/_v4-probe-generation.ts` — para validar el fix post-implementación (correr con query combinada y confirmar que el primario ya no se contamina cuando se le pasa la sub-query limpia).

### Integration Points
- `comprehension-schema.ts` (campo nuevo) → `comprehension-prompt.ts` (instrucción) → `somnio-v4-agent.ts` (pasa a computeSlots) → `slots.ts` (consume). Cadena de 4 archivos, lineal.
- Sin migración de DB. Sin cambio de observabilidad obligatorio (aunque loguear `primary_query` en el evento `comprehension_completed_v4` sería deseable y aditivo — discreción).

### Constraint (Regla 6)
- Single-intent turns: `rawMessage` exacto (el guard `secondaryIntent !== 'ninguno'` lo garantiza). Cero regresión en el caso común.
- v4 sigue DORMANT. Aditivo puro.
</code_context>

<specifics>
## Specific Ideas

- **Evidencia viva (turno `73cb2b38`):** mensaje combinado Path A "Lo puedo tomar si tomo alcohol? Cuanto demora en llegar a bucaramanga". Primario `contraindicaciones`/alcohol → RAG, material `interaccion_alcohol` recuperado bien (similarity 0.56, topicSelected correcto), pero generación `responseConfidence=0.4` + `binary=FUERA_SCOPE` → `no_match` → handoff silencioso. Secundario `tiempo_entrega` @ 0.88 nunca se respondió.
- **Probe que lo prueba:** mismo material, query combinada vs aislada → 0.6/FALTA_INFO vs 0.95/RESPONDE_BIEN. La diferencia es 100% la query, no el material.
- **El KB de `interaccion_alcohol` está EXCELENTE** (Hechos + Posición + Debe contener + NUNCA + Cuándo escalar). El problema NUNCA fue el KB — fue cómo se le pasa la query al primario.
</specifics>

<deferred>
## Deferred Ideas

- **Handoff del primario corta el secundario:** en el turno real, el `no_match`/handoff del primario terminó el turno sin procesar el slot secundario (`tiempo_entrega` @ 0.88, que era 'covered' → template). Bug de orquestación de slots en `somnio-v4-agent.ts` (resolución secuencial primary→secondary). Separado de este fix; vale un follow-up. (Nota: este fix igual mejora el caso porque el primario ya no hará handoff espurio → llega al secundario.)
- **Loguear `responseText` generado en observabilidad:** `subloop_generation_completed` guarda `binary`+`responseConfidence` pero NO el texto redactado — punto ciego (no pudimos ver el texto desde DB, hubo que reproducir con probe). Aditivo, follow-up de observabilidad.
- **Loguear `primary_query` en `comprehension_completed_v4`:** simétrico al `secondary_query` que ya se loguea — deseable, aditivo (puede entrar en este standalone a discreción del planner o quedar follow-up).
- **Heredados de `v4-gate-confidence-fixes`:** zombie 70s (P0 disponibilidad), try/catch crash CRM (#1.b), enriquecimiento KB.
</deferred>

---

*Standalone: v4-dual-intent-query-split*
*Context gathered: 2026-06-13*
</content>
</invoke>
