---
phase: v4-subloop-context-pass
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/generation-call.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/generation-context.test.ts
requirements: [C-01, C-02, C-03, C-04]
autonomous: true
must_haves:
  truths:
    - "El path RAG (low_confidence/razonamiento_libre) pasa contexto del state al sub-loop, igual que el path CRM ya lo hace via grounding"
    - "buildGenerationPrompt recibe e inyecta: datos del cliente (datosCapturados), temas ya atendidos el turno previo (atendido[]), y las ultimas respuestas del bot (recentBotMessages)"
    - "Es SOLO contexto informacional + una instruccion ligera de no-repetir — NO un sistema de no-repeticion con filtrado/scoring (eso es trabajo futuro)"
    - "Cambio v4-only, aditivo, sin migracion DB (toda la data ya viaja en V4AgentInput), sin feature flag (v4 DORMANT)"
    - "Los 5 siblings + v3-runner + interruption-system-v2 quedan 0-line diff vs baseline"
  artifacts:
    - path: src/lib/agents/somnio-v4/sub-loop/index.ts
      provides: "campo opcional stateContext en SubLoopContext + threading a runGenerationCall"
    - path: src/lib/agents/somnio-v4/sub-loop/prompt.ts
      provides: "seccion CONTEXTO DE LA CONVERSACION en buildGenerationPrompt"
---

# Plan 01 — Pasar contexto del state al sub-loop RAG (#2)

## Scope / Context (mini)

**Premisa verificada:** el path CRM del sub-loop recibe contexto rico (`grounding` + `crmHint`, `crm-gate.ts:338`),
pero el path RAG (`runSubLoop` desde `somnio-v4-agent.ts:536`) recibe SOLO `userMessage` + `recentMessages`
(últimas 4 vueltas crudas) + lock fields. NO recibe el state estructurado.

**Objetivo (palabras del usuario):** "pasar contexto del state al sub-loop... para contextualizar al agente de
no repetir algo... por ahora SOLO pasar el context" (el sistema de no-repetición con filtrado es trabajo futuro,
NO esta fase).

**Qué se pasa (3 señales que la historia cruda NO captura como datos estructurados):**
- `datosCapturados` — quién es el cliente (pack, nombre, ciudad, etc.) → el RAG responde contextualizado.
- `atendido[]` del turno previo (`input.turnLedgerDims.atendido`) — qué topics/templates ya se atendieron (con labels) → no repetir tema.
- `recentBotMessages` (ya computado en `somnio-v4-agent.ts:162`) — el texto literal de las últimas 2 respuestas del bot → no repetir frase.

**Por qué NO `templatesEnviados` crudo:** son IDs poco legibles para el LLM; `atendido[]` ya da los labels semánticos.

**Decisiones LOCKED:**
- **C-01** — Extender `SubLoopContext` con `stateContext?` OPCIONAL (no rompe el path CRM que no lo pasa).
- **C-02** — Inyectar SOLO en `buildGenerationPrompt` (generation), NO en el tooling (el tooling solo elige topic KB; no necesita el contexto). Minimiza superficie.
- **C-03** — Instrucción ligera: "Esto ya se le dijo / ya se atendió — no lo repitas; responde lo NUEVO." Sin lógica de filtrado/scoring (futuro).
- **C-04** — Sin migración (data ya en `V4AgentInput`), sin feature flag (v4 DORMANT → Regla 6).

**Regla 6 baseline para diffs:** HEAD actual de `exec/debounce-v2-wave6` al arrancar (anotar el SHA en el SUMMARY).

---

## Task 1 — Extender SubLoopContext + threadear stateContext (C-01, C-02)

<read_first>
- src/lib/agents/somnio-v4/sub-loop/index.ts (SubLoopContext L79-86; runRagSubLoop; la llamada a runGenerationCall L370-378)
- src/lib/agents/somnio-v4/sub-loop/generation-call.ts (firma de runGenerationCall + cómo arma messages L59-61)
- src/lib/agents/somnio-v4/somnio-v4-agent.ts (call site RAG L536-556; recentBotMessages L162; input.datosCapturados; input.turnLedgerDims)
- src/lib/agents/somnio-v4/types.ts (Atendido shape, V4AgentInput)
</read_first>

<action>
1. En `sub-loop/index.ts`, extender la interface:
```ts
export interface SubLoopContext extends SubLoopToolsContext {
  userMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  lockHandle?: LockHandle | null
  lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
  lockIdentifier?: string | null
  // #2 v4-subloop-context-pass (C-01): contexto del state para el path RAG.
  // SOLO informacional (no-repetición es trabajo futuro). El path CRM NO lo pasa (opcional).
  stateContext?: {
    datosCapturados?: Record<string, string>
    atendidoPrevio?: Atendido[]      // input.turnLedgerDims.atendido del turno anterior
    recentBotMessages?: string[]     // últimas respuestas del bot (ya computadas en el agente)
  } | null
}
```
2. En `runRagSubLoop`, pasar `args.ctx.stateContext` a `runGenerationCall` (NO al tooling — C-02). La llamada a generation (L370-378) pasa el stateContext a `buildGenerationPrompt`.
3. En `somnio-v4-agent.ts` call site RAG (L538, dentro del `ctx:{...}`), añadir:
```ts
          stateContext: {
            datosCapturados: input.datosCapturados,
            atendidoPrevio: input.turnLedgerDims?.atendido ?? [],
            recentBotMessages,   // ya existe en scope (L162)
          },
```
</action>

<acceptance_criteria>
- `grep -c "stateContext" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 2 (interface + threading)
- `grep -c "stateContext" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 1 (call site RAG)
- `stateContext` es opcional (`?` o `| null`) — el call site CRM (`crm-gate.ts`) NO lo pasa y sigue compilando: `npx tsc --noEmit` exits 0 (sin nuevos errores)
- El tooling call (`runToolingCall`) NO recibe stateContext: `grep -A4 "runToolingCall(" src/lib/agents/somnio-v4/sub-loop/index.ts | grep -c stateContext` = 0
</acceptance_criteria>

## Task 2 — Inyectar el contexto en buildGenerationPrompt (C-02, C-03)

<read_first>
- src/lib/agents/somnio-v4/sub-loop/prompt.ts (buildGenerationPrompt L268-351 — cómo templatea material + tone + fewShots)
- src/lib/agents/somnio-v4/sub-loop/generation-call.ts (firma)
</read_first>

<action>
1. Extender la firma de `buildGenerationPrompt` con un 4º (o nuevo) parámetro opcional `stateContext?` (el shape de C-01).
2. Si `stateContext` viene poblado, prepend/insertar una sección antes del material del topic:
```
## CONTEXTO DE LA CONVERSACIÓN (no lo repitas)
- Datos del cliente: {datosCapturados serializado legible, ej. "pack: x3, nombre: Ana, ciudad: Bogotá"}
- Ya se atendió este turno/previo: {atendidoPrevio.map(a => a.kind+':'+(a.topic||a.intent)).join(', ')}
- Lo último que dijo el bot: {recentBotMessages.slice(-2).join(' / ')}

Instrucción: responde SOLO lo nuevo que pregunta el cliente. NO repitas lo ya dicho arriba ni vuelvas a saludar.
```
3. Si `stateContext` es null/vacío → NO añadir la sección (comportamiento idéntico a hoy — anti-regresión).
4. `runGenerationCall` pasa el `stateContext` recibido a `buildGenerationPrompt`.
</action>

<acceptance_criteria>
- `grep -c "CONTEXTO DE LA CONVERSACIÓN\|stateContext" src/lib/agents/somnio-v4/sub-loop/prompt.ts` ≥ 1
- Cuando `stateContext` es undefined/null, `buildGenerationPrompt(material, tone, fewShots)` produce EXACTAMENTE el mismo string que antes (sección ausente) — test de anti-regresión
- `npx tsc --noEmit` exits 0
</acceptance_criteria>

## Task 3 — Tests + Regla 6 (C-04)

<read_first>
- src/lib/agents/somnio-v4/sub-loop/__tests__/ (patrón de tests existentes, ej. few-shots.test.ts para buildGenerationPrompt)
- src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts (cómo mockean el sub-loop si aplica)
</read_first>

<action>
1. Crear `sub-loop/__tests__/generation-context.test.ts`:
   - Caso A: `buildGenerationPrompt(material, tone, [], stateContext)` con stateContext poblado → el string contiene "CONTEXTO DE LA CONVERSACIÓN", los datos del cliente, los topics de atendidoPrevio, y la última respuesta del bot.
   - Caso B: `buildGenerationPrompt(material, tone, [])` SIN stateContext → el string NO contiene "CONTEXTO DE LA CONVERSACIÓN" (anti-regresión, byte-igual a hoy salvo lo nuevo).
   - Caso C: stateContext con arrays vacíos → sección omitida (no imprime "Ya se atendió: " vacío).
2. Correr la suite del sub-loop + el smoke-hybrid mockeado para confirmar 0 regresión.
3. Greps Regla 6 contra el baseline (SHA al arrancar):
```bash
git diff --name-only <BASE>..HEAD -- src/lib/agents/{somnio-v3,godentist,godentist-fb-ig,somnio-recompra,somnio-pw-confirmation}/ src/lib/agents/engine/v3-production-runner.ts src/lib/agents/interruption-system-v2/
# Esperado: 0 líneas
grep -oE "'ckpt_[0-9]_[a-z_]+'" src/lib/agents/interruption-system-v2/checkpoints.ts | sort -u | wc -l   # = 8
```
</action>

<acceptance_criteria>
- `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/generation-context.test.ts` exits 0 (≥3 casos: A poblado, B ausente, C vacío)
- La suite del sub-loop existente sigue verde (salvo la deuda pre-existente `few-shots M1` que NO es de esta fase)
- Greps Regla 6 = 0 líneas en siblings/v3-runner/interruption-v2; CheckpointId = 8
- `git diff --name-only <BASE>..HEAD -- src/` solo muestra archivos `somnio-v4/`
</acceptance_criteria>

---

## Verificación final (must_haves)
- El path RAG ahora pasa stateContext (datos + atendido previo + últimas respuestas del bot) al generation prompt.
- Es solo contexto + instrucción ligera (sin filtrado/scoring — futuro).
- Sin migración, sin flag, v4-only, Regla 6 limpia.
- Tests de anti-regresión (sin stateContext = comportamiento idéntico) verdes.
