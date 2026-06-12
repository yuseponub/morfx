# Standalone: template-builder-suggested-actions — Research

**Researched:** 2026-06-12
**Domain:** AI SDK v6 (useChat/streamText/tools) + React 19 client-side derivation — Template Builder chat
**Confidence:** HIGH (todo verificado contra el codebase y los types instalados de `ai@6.0.86`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Arquitectura de chips
- **D-01 (pre-locked):** Opción C híbrida — base determinista derivada del estado del `TemplateDraft` (función pura client-side) + la IA puede añadir chips contextuales vía una tool opcional nueva (ej: `suggestActions`). La base determinista garantiza que siempre haya chips aunque la IA no llame la tool.
- **D-02 (pre-locked):** Máximo 3-4 chips por ronda TOTAL (deterministas + IA combinados). Nunca más de 4 visibles.
- **D-03 (Merge):** Determinista manda — los chips deterministas de la etapa ocupan los primeros slots (garantizan el paso crítico: validar, confirmar, subir imagen) y los de la IA rellenan los slots restantes hasta el tope. Dedupe por similitud de label/intención (no mostrar un determinista y un IA-chip que digan lo mismo).

#### Comportamiento del click
- **D-04:** Mensaje visible — el click envía el texto del chip como burbuja del usuario vía `sendMessage` normal. Transparencia total del historial; cero cambios al route/backend.
- **D-05:** Híbrido con acciones locales — chips que mapean a acciones de UI las ejecutan directo sin pasar por la IA: "📷 Subir imagen" dispara el `fileInputRef` existente en `chat-pane.tsx`; "Ver mis templates" navega a `/configuracion/whatsapp/templates`. El resto de chips envían mensaje.
- **D-06:** Chips deshabilitados/ocultos mientras `status` es `submitted`/`streaming` — solo se muestran cuando el turno terminó (`status === 'ready'`), debajo del último mensaje del asistente.

#### Confirmación final (submitTemplate)
- **D-07:** El chip "✅ Confirmar y crear" SÍ cuenta como confirmación explícita — el click envía "Confirmo, créalo" como mensaje del usuario, que el system prompt recibe como confirmación textual válida (no se modifica la regla del prompt). Guard determinista: este chip SOLO aparece cuando el último `validateTemplateDraft` del turno fue success y el draft está completo. Nunca aparece antes de validar.

#### Chips de arranque (empty-state)
- **D-08:** Set genérico de 4: "Confirmación de pedido" · "Recordatorio de cita" · "Promoción" · "Código de verificación". Cubre las 3 categorías Meta y los casos comunes de los workspaces actuales (Somnio, GoDentist, Varixcenter). No personalizados por workspace en V1.
- **D-09:** Click de arranque envía descripción completa pre-armada (ej: "Quiero un template para confirmar pedidos, que salude al cliente por su nombre y le diga la fecha de entrega") → la IA propone borrador de una, minimizando turnos. Los 4 prompts pre-armados se definen en el plan.

#### Persistencia
- **D-10:** Recalcular todo al recargar — los chips deterministas se recomputan del draft al cargar la sesión; los chips de la IA se re-leen del tool-result de `suggestActions` ya persistido en los `messages` de la sesión (el session-store ya guarda los UIMessages completos). Cero storage nuevo.

### Claude's Discretion
- Estilo visual de los chips (pills/outline, iconos, orden) — seguir el design system existente del builder.
- Texto exacto de cada chip determinista por etapa y de los 4 prompts de arranque (proponer en plan, ajustable en QA).
- Detalle del schema de la tool `suggestActions` (labels + mensajes) y cómo instruirla en el system prompt sin romper la REGLA CERO existente.
- Lógica exacta de detección de etapa desde el draft (qué campos chequear en qué orden).

### Deferred Ideas (OUT OF SCOPE)
- Portar los chips al builder de automatizaciones (`/automatizaciones/builder`) — standalone follow-up si este funciona bien.
- Chips de arranque personalizados por workspace/vertical — V2.
- Telemetría de uso de chips (qué chips se clickean) — V2.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **Regla 0:** Workflow GSD completo — este RESEARCH alimenta `/gsd:plan-phase`; no hay código sin plan aprobado.
- **Regla 1:** Push a Vercel tras cambios de código antes de pedir pruebas al usuario.
- **Regla 3 (Domain Layer):** No aplica directamente — `suggestActions` es pure-echo (sin DB, sin mutación). El único tool que muta (`submitTemplate`) ya delega a `createTemplate` del domain y NO se toca.
- **Regla 4:** Actualizar docs afectados (`.claude/rules/agent-scope.md` §Config Builder lista "7 tools" → pasará a 8; el ciclo documentado dice `stepCountIs(6)` pero el route real usa `stepCountIs(15)` — discrepancia preexistente notada en CONTEXT.md).
- **Regla 6:** El builder de automatizaciones (`/automatizaciones/builder`) NO se toca. `BuilderInput` se importa desde allá (chat-pane.tsx:24) — solo consumir, no modificar.
- **agent-scope.md §Config Builder:** el agente NO puede mutar fuera de templates. `suggestActions` no amplía el scope de mutación (echo puro). El system prompt debe seguir documentando PUEDE/NO PUEDE.
- **Stack:** Next.js 15 App Router, React 19, TypeScript estricto, Tailwind, puerto dev 3020.

## Summary

La feature es 100% implementable con los patrones que ya existen en el builder. Los tres pilares: (1) **derivación determinista de etapa** — función pura sobre `TemplateDraft` + escaneo de tool-parts en `messages` (la "etapa de validación" NO vive en el draft context, vive exclusivamente en los tool-parts persistidos de los mensajes); (2) **tool `suggestActions`** — clon exacto del patrón echo de `updateDraft` (tools.ts:218-242), con guard mecánico vía `prepareStep.activeTools` para no competir con la REGLA CERO en el step 0; (3) **render derivado, no side-effect** — los chips se derivan con `useMemo` del array `messages` + `draft`, NO con `processedPartsRef` (ese mecanismo es para dispatches idempotentes al reducer, no para UI derivada).

Hallazgo crítico verificado para D-10: el `onFinish` del route persiste los **messages del request** (los que el cliente envió), no la respuesta del turno — la última respuesta del asistente solo se persiste en el SIGUIENTE request (route.ts:119-125, mismo patrón documentado en /api/builder/chat:135-144). Consecuencia: tras recargar, los AI-chips del último turno no existen en la sesión persistida (lag de 1 turno). Es una limitación preexistente que también afecta al preview del draft; los chips deterministas la mitigan (se recomputan del draft replayado). Existe fix opcional verificado (`toUIMessageStreamResponse({ originalMessages, onFinish })` en ai@6.0.86) si el planner decide cerrarla.

**Primary recommendation:** Componente `SuggestedActionChips` montado en chat-pane entre el área de mensajes y el input (patrón del error-banner, chat-pane.tsx:252-259), alimentado por `deriveStage(draft, messages)` pura + extracción `useMemo` del último mensaje del asistente; tool `suggestActions` echo server-side; guard D-07 por comparación del draft actual contra `part.input.draft` del último `validateTemplateDraft` exitoso.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Derivación de etapa + chips deterministas | Browser/Client (función pura) | — | Todo el estado fuente (`draft`, `messages`) ya vive en el cliente |
| Tool `suggestActions` (echo) | API/Backend (tools.ts, execute server-side) | Browser (lee el tool-result part) | Mismo tier que `updateDraft`; el execute corre en el route streaming |
| Instrucción del prompt | API/Backend (system-prompt.ts) | — | Server-side, se inyecta en streamText |
| Guard step-0 (activeTools) | API/Backend (route.ts prepareStep) | — | Único punto que controla toolChoice por step |
| Render de chips + click handlers | Browser/Client (chat-pane.tsx) | — | `sendMessage`, `fileInputRef`, `router.push` son client-side |
| Persistencia D-10 | Database (builder_sessions.messages JSONB) | API (session-store) | Ya existe; cero storage nuevo |

## Standard Stack

Cero dependencias nuevas. Todo ya está instalado y verificado:

| Library | Version | Purpose | Verificación |
|---------|---------|---------|--------------|
| `ai` | ^6.0.86 | streamText, tool(), parts tipados, prepareStep.activeTools | [VERIFIED: package.json + node_modules/ai/dist/index.d.ts] |
| `@ai-sdk/react` | ^3.0.88 | useChat (status, sendMessage, messages) | [VERIFIED: package.json] |
| `@ai-sdk/anthropic` | ^3.0.43 | modelo claude-sonnet-4 del route | [VERIFIED: route.ts:104] |
| `zod` | ^4.3.6 | inputSchema de la tool | [VERIFIED: package.json] |
| `lucide-react` | (instalado) | iconos de chips (ImagePlus, Check, etc.) | [VERIFIED: imports existentes] |
| `next/navigation` | Next 15 | `useRouter().push` para "Ver mis templates" | [VERIFIED: App Router estándar del codebase] |

**Tipos clave verificados en `node_modules/ai/dist/index.d.ts`:**
- `ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'` (línea 3286) — D-06 usa `status === 'ready'`.
- `ToolUIPart`: `{ type: 'tool-${NAME}', state, input, output, toolCallId, ... }` (línea 1516). En `state: 'output-available'` el part tiene **`input` Y `output`** disponibles (líneas ~1573-1582) — esto habilita el guard D-07 (comparar `input.draft` del validate contra el draft actual).
- `PrepareStepResult.activeTools?: Array<keyof TOOLS>` (líneas 911-924) — permite excluir `suggestActions` del step 0 forzado.
- `toUIMessageStreamResponse(options: UIMessageStreamResponseInit & UIMessageStreamOptions)` con `originalMessages` + `onFinish` (líneas 1964-1977, 2228) — fix opcional del lag de persistencia.

## Stage-Detection Map (derivación determinista de etapa)

### Dónde vive cada pieza de estado — respuesta a Q1/Q2

| Estado | Dónde vive HOY | Evidencia |
|--------|---------------|-----------|
| Campos del draft (name, bodyText, headerFormat, examples...) | `TemplateDraftContext` reducer | template-draft-context.tsx:26-52 |
| `headerImageStoragePath` | Draft context, seteado por `UPDATE_FIELD` tras upload (NO por `updateDraft` tool — el patch schema no lo incluye) | chat-pane.tsx:174-179; tools.ts:221-231 |
| Resultado del último `validateTemplateDraft` | **SOLO en tool-parts de `messages`** (`type: 'tool-validateTemplateDraft'`, `state: 'output-available'`, `output: { success: true } \| { error, errors }`, `input: { draft }`) | tools.ts:247-273; chat-message.tsx:159-170 |
| Flag "submitted" | **SOLO en tool-parts** (`tool-submitTemplate` con `output.success === true`) | tools.ts:278-414; chat-message.tsx:131-147 |

**No existe flag `validated`/`submitted` en el context ni en chat-pane.** Recomendación firme: **NO extender el reducer**. Derivar todo con `useMemo` desde `messages` + `draft`. Extender el reducer crearía una segunda fuente de verdad que se desincroniza al recargar sesión (el replay de patches no incluye resultados de validate/submit) — la derivación desde messages es gratis y sobrevive la rehidratación por construcción.

### Predicados por etapa (orden de precedencia — first match wins)

Helpers disponibles: `extractVarIndices(text)` de validation.ts:55-60 es **función pura sin deps de servidor** (solo importa `./types`) → importable client-side sin riesgo. `bodyVars = extractVarIndices(draft.bodyText)`.

Definiciones previas:
- `lastValidatePart` = último part `tool-validateTemplateDraft` con `state === 'output-available'` escaneando `messages` en orden (el último gana).
- `lastSubmitOk` = existe part `tool-submitTemplate` con `state === 'output-available'` y `output.success === true`, y es posterior (en orden de messages) a cualquier user-message que reinicie el flujo. Simplificación V1 suficiente: tomarlo del **último mensaje del asistente que contenga milestone-parts** — en la práctica, si el último milestone del historial es un submit exitoso, la etapa es post-submit.
- `draftMatchesValidated(input, draft)` = igualdad campo a campo de: `name, language, category, headerFormat, headerText, bodyText, footerText` + igualdad estructural (JSON.stringify de keys ordenadas) de `bodyExamples, headerExamples`. **Excluir** `headerImageLocalUrl` (efímero) y `variableMapping` (ver Pitfall 6). `headerImageStoragePath`: comparar con tolerancia — el input del validate viene del conocimiento de la IA, que conoce el storagePath solo por el mensaje de aviso (chat-pane.tsx:182-184); recomendar comparar `Boolean(a) === Boolean(b)` en vez de igualdad estricta.

| # | Etapa | Predicado | Chips (CONTEXT §specifics — texto final a discreción en plan) |
|---|-------|-----------|------|
| 1 | **Post-submit exitoso** | `lastSubmitOk` | "Crear otro template" · "Ver mis templates" (local: navegar) |
| 2 | **Chat vacío** | `messages.length === 0` | Los 4 de arranque D-08 (se renderizan en el empty-state, chat-pane.tsx:223-236, no en el strip de chips) |
| 3 | **Validación OK vigente** (guard D-07) | `lastValidatePart?.output.success === true && draftMatchesValidated(lastValidatePart.input.draft, draft)` | "✅ Confirmar y crear" · "Revisar de nuevo" |
| 4 | **Validación falló vigente** | `lastValidatePart?.output.error && draftMatchesValidated(lastValidatePart.input.draft, draft)` | "Corregir automáticamente" · "Editar yo mismo" |
| 5 | **IMAGE sin imagen** | `draft.headerFormat === 'IMAGE' && !draft.headerImageStoragePath` | "📷 Subir imagen" (local: fileInput) · "Mejor sin imagen" |
| 6 | **Variables sin ejemplos** | `bodyVars.length > 0 && bodyVars.some(i => !draft.bodyExamples[String(i)])` | "Usar ejemplos sugeridos" · "Escribir mis ejemplos" |
| 7 | **Borrador sin variables** | `draft.bodyText.trim() !== '' && bodyVars.length === 0` | "Agregar variables" · "Agregar imagen" · "Cambiar el texto" · "Continuar →" |
| 8 | **Draft completo sin validar** | `draft.bodyText.trim() !== ''` (y no matcheó 3-7) | "Validar template" · "Cambiar algo" |
| 9 | **Fallback** | ninguno | Solo AI-chips (si hay) o nada |

Notas:
- La fila "Pidió botones WA (no soportado)" de la tabla del CONTEXT **no es derivable del draft** — es exactamente el caso que cubre la tool `suggestActions` de la IA (la IA sabe que el usuario pidió botones; el draft no). No intentar predicado determinista.
- El guard D-07 "re-evaluar si el draft cambia después de validar" sale **gratis** de `draftMatchesValidated`: cualquier `UPDATE_FIELD` del preview-pane (preview-pane.tsx dispatcha UPDATE_FIELD en cada input) o `APPLY_AI_PATCH` posterior rompe la igualdad → el chip desaparece hasta re-validar. Cero estado nuevo.
- Etapa 3/4 dominan sobre 5-8 a propósito: si hay un validate vigente, sus chips son los relevantes. Si el draft cambió post-validate, la igualdad falla y se cae a 5-8 naturalmente.

## suggestActions Tool Design

### Patrón echo verificado (clon de `updateDraft`, tools.ts:218-242)

```typescript
// tools.ts — agregar al objeto retornado por createTemplateBuilderTools()
// Fuente del patrón: tools.ts:218-242 (updateDraft)
suggestActions: tool({
  description:
    'OPCIONAL — al FINAL de tu turno, sugiere hasta 3 acciones rápidas que el usuario ' +
    'probablemente quiera hacer a continuación. Cada acción tiene un label corto (botón) ' +
    'y el mensaje que se enviará al clickearlo. NUNCA la llames como primera tool del turno. ' +
    'NUNCA sugieras confirmar la creación del template (eso lo maneja la UI).',
  inputSchema: z.object({
    actions: z
      .array(
        z.object({
          label: z.string().min(1).max(30),   // texto del botón
          message: z.string().min(1).max(200), // lo que "diría" el usuario al click
        }),
      )
      .min(1)
      .max(3),
  }),
  execute: async (params): Promise<{ success: true; actions: Array<{ label: string; message: string }> }> => {
    // Echo — la UI lo lee del tool-result part (mismo patrón que updateDraft)
    return { success: true, actions: params.actions }
  },
}),
```

Decisiones de diseño con evidencia:
- **`max(3)` y no 4:** D-02 capea el TOTAL en 4 y D-03 da prioridad a los deterministas — la IA nunca necesita más de 3 slots.
- **`execute` server-side (no client-tool):** mantiene el shape `{ success: true, ... }` que el scan parent-level de chat-pane.tsx:104-105 espera (`if (!('success' in o) || o.success !== true) continue`), y evita el camino de client-side tools (addToolResult) que no existe en este builder.
- **Sin discriminated union de error:** la tool no puede fallar (echo puro). Zod rechaza inputs malformados antes del execute; AI SDK emite `output-error` part que la UI ya maneja genéricamente (chat-message.tsx:297-306).

### Instrucción en system prompt sin romper REGLA CERO — respuesta a Q3

La REGLA CERO (system-prompt.ts:31-43) obliga `updateDraft` ANTES de cualquier texto, y el route refuerza con `prepareStep` → `toolChoice: 'required'` en step 0 (route.ts:113-118). Riesgo real: con `suggestActions` disponible, el modelo tiene una tool "barata" para satisfacer el toolChoice forzado del step 0 sin llamar `updateDraft` → debilita REGLA CERO.

**Mitigación en dos capas (recomendada):**

1. **Mecánica (route.ts, cambio de 1 línea):** excluir `suggestActions` del step 0:
```typescript
prepareStep: async ({ stepNumber }: { stepNumber: number }) => {
  if (stepNumber === 0) {
    return {
      toolChoice: 'required' as const,
      activeTools: [
        'listExistingTemplates', 'suggestCategory', 'suggestLanguage',
        'captureVariableMapping', 'updateDraft', 'validateTemplateDraft',
        'submitTemplate',
      ] as const, // todas menos suggestActions
    }
  }
  return {}
},
```
`activeTools` en `PrepareStepResult` verificado en ai@6.0.86 (node_modules/ai/dist/index.d.ts:911-924). [VERIFIED: types instalados]

2. **Prompt (system-prompt.ts):** agregar como tool 8 en la lista (línea ~77) + sección nueva. Puntos que la instrucción DEBE incluir:
   - Es OPCIONAL y se llama **al final del turno**, después de `updateDraft` y del razonamiento — nunca como primera tool.
   - Máximo 1 llamada por turno, máximo 3 acciones.
   - `label` = imperativo corto (≤30 chars); `message` = primera persona, lo que el usuario diría (ej: label "Agregar emojis", message "Agrégale emojis al mensaje").
   - **NUNCA** sugerir acciones de confirmación/creación ("confirmo", "créalo", "envíalo") — la UI maneja ese chip con guard propio (D-07).
   - No repetir acciones obvias del flujo (validar, subir imagen) — la UI ya las muestra; sugerir solo lo contextual (ej: "Continuar sin botones" cuando el usuario pidió botones WA, "Hacerlo más corto", "Versión en inglés").
   - Si no hay nada contextual que aportar, NO llamarla (la base determinista cubre).

**stepCountIs(15) (route.ts:108):** no requiere cambio — hay holgura de steps para que la IA llame `suggestActions` al final. [VERIFIED: route.ts]

## Chips Rendering & Extraction Pattern

### Extracción de AI-chips del ÚLTIMO mensaje del asistente — respuesta a Q4

**Recomendación: derive-from-messages con `useMemo`, NO `processedPartsRef`.**

Razón: `processedPartsRef` (chat-pane.tsx:47, 100-122) es un mecanismo de **dedupe de side-effects** — garantiza que cada tool-result dispatche al reducer UNA vez. Los chips no son un side-effect: son UI derivada que debe (a) reflejar solo el turno actual, (b) desaparecer cuando llega un turno nuevo, (c) rehidratarse al recargar. Un `useMemo` sobre `messages` cumple las tres por construcción; un ref de "ya procesado" pelearía contra (b) y (c).

```typescript
// En chat-pane.tsx (o en un hook useSuggestedActions(messages, draft))
const aiChips = useMemo(() => {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant' || !Array.isArray(last.parts)) return []
  // El último part suggestActions del último assistant message gana
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const part = last.parts[i] as { type?: string; state?: string; toolName?: string; output?: unknown }
    const isMatch =
      (part.type === 'tool-suggestActions' ||
        (part.type === 'dynamic-tool' && part.toolName === 'suggestActions')) &&
      part.state === 'output-available'
    if (isMatch) {
      const o = part.output as { success?: boolean; actions?: Array<{ label: string; message: string }> }
      if (o?.success === true && Array.isArray(o.actions)) return o.actions
    }
  }
  return []
}, [messages])
```

- "Solo el turno actual": si el último mensaje es del usuario (turno en curso) o el asistente no llamó la tool, `aiChips = []` y solo se ven los deterministas. Los suggestActions de mensajes viejos se descartan solos porque solo se mira `messages[length-1]`.
- El branch `dynamic-tool` se incluye por paridad con el código existente (chat-pane.tsx:93-97), aunque con tools estáticas el part será `tool-suggestActions`. [VERIFIED: patrón AI SDK v6 en chat-message.tsx:276-307]

### Merge D-03 (determinista manda) + dedupe

```typescript
function mergeChips(deterministic: Chip[], ai: Chip[], cap = 4): Chip[] {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') // sin acentos
     .replace(/[^\p{L}\p{N} ]/gu, '').trim()                          // sin emoji/punct
  const CONFIRM_RE = /\b(confirm|crear?lo|envia|crea el template|submit)\b/i
  const seen = new Set(deterministic.map((c) => norm(c.label)))
  const out = [...deterministic]
  for (const chip of ai) {
    if (out.length >= cap) break
    if (seen.has(norm(chip.label))) continue          // dedupe por label normalizado
    if (CONFIRM_RE.test(chip.label) || CONFIRM_RE.test(chip.message)) continue // proteger guard D-07
    out.push(chip); seen.add(norm(chip.label))
  }
  return out.slice(0, cap)
}
```
El filtro `CONFIRM_RE` es defensa en profundidad: aunque el prompt prohíbe sugerir confirmaciones, el compliance de prompts es frágil (lección REGLA CERO documentada en CONTEXT §riesgos) — un AI-chip de confirmación bypasearía el guard determinista D-07.

### Ubicación del render — respuesta a Q7

**Strip fijo entre el área de mensajes y el input**, exactamente como el error-banner existente (chat-pane.tsx:252-259): fuera del contenedor scrolleable (`<div className="flex-1 overflow-y-auto">` línea 222), arriba del input area (línea 262). Ventajas verificadas:
- **No rompe el auto-scroll:** el effect `bottomRef.current?.scrollIntoView` corre en `[messages, status]` (chat-pane.tsx:74-76) — los chips fuera del scroll-container no alteran el scrollHeight de los mensajes.
- D-06 directo: render condicional `status === 'ready' && messages.length > 0 && chips.length > 0`.
- Los chips de arranque D-08 van en el OTRO punto: dentro del empty-state (chat-pane.tsx:223-236, branch `messages.length === 0`).

```tsx
{/* chat-pane.tsx — insertar entre línea 250 (cierre messages area) y 252 (error display) */}
{status === 'ready' && messages.length > 0 && mergedChips.length > 0 && (
  <div className="px-4 pb-1">
    <div className="max-w-3xl mx-auto flex flex-wrap gap-2">
      {mergedChips.map((chip) => ( /* botón pill */ ))}
    </div>
  </div>
)}
```

### Render del tool-part en la burbuja (evitar ruido visual)

`ChatMessage` renderiza CUALQUIER tool-part con `success: true` como pill verde genérico "X OK" (chat-message.tsx:184-193) y muestra `ToolLoading` con label fallback "Ejecutando suggestActions..." durante el streaming (chat-message.tsx:54-62). Sin cambios, cada llamada a `suggestActions` mete ruido en la burbuja. El plan debe:
1. Agregar entrada a `TOOL_LABELS` (chat-message.tsx:40-48): `suggestActions: 'Sugiriendo acciones...'` (para el loading) — o suprimir el loading también.
2. Agregar branch en `ToolOutput` que retorne `null` para `suggestActions` (los chips se renderizan en el strip, no en la burbuja).

## Persistence Verification (D-10) — respuesta a Q5

**Cadena verificada completa:**

1. **Escritura:** route.ts:119-125 `onFinish` → `updateSession(sessionId, workspaceId, { messages })` → UPDATE de `builder_sessions.messages` (JSONB) (session-store.ts:158-197). Los UIMessages se guardan **completos, con tool-parts incluidos** (input + output + state). ✅
2. **Lectura:** `handleSelectSession` (template-builder-layout.tsx:100-120) → `GET /api/builder/sessions?sessionId=` → `setInitialMessages(session.messages)` → remount de ChatPane vía `chatKey` → `useChat({ messages: initialMessages })` (chat-pane.tsx:68-71). ✅
3. **Rehidratación del draft:** `dispatch({ type: 'RESET' })` (layout:114) + el scan parent-level de chat-pane.tsx:82-125 replaya TODOS los patches `updateDraft`/`suggestCategory`/`suggestLanguage` de los mensajes persistidos → el draft se reconstruye → chips deterministas se recomputan. El `processedPartsRef` arranca vacío porque el remount (key=chatKey) crea un ref nuevo. ✅
4. **AI-chips tras recarga:** el `useMemo` de extracción lee `messages[length-1]` — si el último mensaje persistido es del asistente y tiene `tool-suggestActions` con `output-available`, los chips reaparecen. ✅ (con la limitación del punto siguiente)

**⚠️ LIMITACIÓN VERIFICADA — lag de persistencia de 1 turno:** el `onFinish` de route.ts persiste `messages` **del request body** (lo que el cliente envió ANTES de la respuesta del turno). El comentario explícito en el route hermano lo confirma: *"The response for this turn will be included in the NEXT request's messages array"* (/api/builder/chat/route.ts:135-144). Consecuencias:
- Tras recargar, el último mensaje persistido del asistente es el del **penúltimo** turno → los AI-chips del turno final se pierden, y el draft replayado pierde los patches del turno final.
- Es comportamiento preexistente que ya afecta al preview — los chips no lo empeoran ni lo arreglan.
- **Fix opcional disponible y verificado en ai@6.0.86:** `result.toUIMessageStreamResponse({ originalMessages: messages, onFinish: async ({ messages: updated }) => updateSession(...), headers: ... })` — `UIMessageStreamOptions.originalMessages` activa "persistence mode" y el `onFinish` recibe la lista completa actualizada (node_modules/ai/dist/index.d.ts:1964-1977). Cambio acotado al route de templates (no toca /api/builder/chat — Regla 6 análoga). **Recomendación:** decidir en plan; aceptar el lag es válido (consistente con el comportamiento actual) pero el fix cierra D-10 al 100% con ~5 líneas.
- `headerImageStoragePath` NO se rehidrata nunca (se setea por `UPDATE_FIELD` tras el upload, no por `updateDraft` — el patch schema de tools.ts:221-231 no lo incluye). Tras recargar un draft IMAGE, la etapa 5 ("subir imagen") reaparece — consistente con lo que muestra el preview. Limitación preexistente, no del feature.

## Local Actions Wiring (D-05) — respuesta a Q6

| Acción | Mecanismo exacto | Evidencia |
|--------|-----------------|-----------|
| "📷 Subir imagen" | `fileInputRef.current?.click()` — el ref ya existe en chat-pane.tsx:46 (`const fileInputRef = useRef<HTMLInputElement>(null)`), input oculto en líneas 278-284, mismo trigger que el botón existente (línea 267). El `onChange` ya hace todo: validación 5MB/mime, preview, upload, dispatch y `sendMessage` de aviso a la IA (chat-pane.tsx:135-192) | [VERIFIED] |
| "Ver mis templates" | `useRouter()` de `next/navigation` + `router.push('/configuracion/whatsapp/templates')` desde el componente de chips (client component). Alternativa `<Link>` es válida pero el chip es un `<button>` con handler — `router.push` es el patrón natural. La ruta destino existe (ConfigBackLink ya apunta ahí, template-builder-layout.tsx:129) | [VERIFIED: ruta] |
| "Crear otro template" (post-submit) | `handleNewSession` vive en el **layout** (template-builder-layout.tsx:85-92), NO en ChatPane. Dos opciones: (a) pasar prop `onNewSession` a ChatPane (1 prop nueva, limpio); (b) que el chip envíe mensaje "Quiero crear otro template" (sigue en la misma sesión/draft — peor: el draft queda sucio). **Recomendación: opción (a)** — resetea draft + sesión + chatKey correctamente | [VERIFIED: layout] |
| Resto de chips | `sendMessage({ text: chip.message })` — misma firma que handleSubmit usa (chat-pane.tsx:206). Los chips de arranque D-09 igual, con sus prompts pre-armados | [VERIFIED] |

Nota D-06: además de ocultar chips cuando `isLoading`, los handlers deben no-op si `status !== 'ready'` (doble guard, igual que `handleSubmit` chequea `isLoading`, chat-pane.tsx:203-209).

## UI / Design-System Notes

Vocabulario visual existente del builder (para los chips, discreción de Claude pero anclada):
- **Pills existentes:** `rounded-full bg-{color}/10 text-xs px-2.5 py-1 w-fit` con icono lucide 3x3 (chat-message.tsx:176-180, 188-192).
- **Botones:** shadcn `Button` con `variant="outline" size="sm"` + `gap-1.5` (template-builder-layout.tsx:152-160) o `<button>` crudo con `rounded-lg border bg-background hover:bg-muted transition-colors disabled:opacity-50` (chat-pane.tsx:269).
- **Recomendación de estilo chip:** `<button>` con `rounded-full border bg-background hover:bg-muted px-3 py-1.5 text-xs font-medium transition-colors` — pill clickeable consistente con ambos patrones. El chip "✅ Confirmar y crear" puede diferenciarse (ej: `border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:...` — paleta ya usada en chat-message.tsx:133).
- **Ancho:** el strip respeta `max-w-3xl mx-auto` (mismo contenedor que mensajes e input, chat-pane.tsx:238/263) con `flex flex-wrap gap-2`.
- **Empty-state D-08:** los 4 chips de arranque reemplazan/acompañan el párrafo de ejemplo (chat-pane.tsx:230-234), grid 2x2 o wrap, mismos estilos pill.
- **Portabilidad:** CONTEXT pide que el componente sea portable al builder de automatizaciones — extraer `SuggestedActionChips` como componente presentacional puro (props: `chips`, `onChipClick`) + hook/función `deriveTemplateStage` separada (la parte template-specific).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detección de variables `{{N}}` | regex propio en el componente | `extractVarIndices` (validation.ts:55-60, pure, client-safe) | Ya maneja dedupe + sort; única fuente de verdad |
| Validación del draft client-side | re-implementar reglas Meta para el guard D-07 | leer el tool-result de `validateTemplateDraft` de messages | El guard D-07 exige el resultado REAL del tool, no una réplica que puede divergir |
| Tracking de "validated/submitted" | flags nuevos en reducer/state | derivación `useMemo` de tool-parts | Los parts ya están persistidos (D-10 gratis); flags duplicarían fuente de verdad |
| Dedupe de tool-results para chips | reutilizar `processedPartsRef` | `useMemo` sobre `messages[length-1]` | processedPartsRef es para side-effects idempotentes, no para UI derivada |
| Navegación | `window.location.href` | `useRouter().push` de next/navigation | App Router estándar, sin full reload |

## Common Pitfalls

### Pitfall 1: `suggestActions` satisface el toolChoice forzado del step 0 y mata REGLA CERO
**Qué pasa:** route.ts:113-118 fuerza `toolChoice: 'required'` en step 0 para garantizar `updateDraft`. Con una tool "gratis" disponible, el modelo puede llamar `suggestActions` primero y dejar el preview vacío.
**Prevención:** `activeTools` sin `suggestActions` en step 0 (verificado en ai@6.0.86) + instrucción de prompt "NUNCA como primera tool".
**Señal temprana:** preview vacío tras un turno con chips presentes.

### Pitfall 2: AI-chip de confirmación bypasea el guard D-07
**Qué pasa:** si la IA sugiere `{label: "Confirmar", message: "Confirmo, créalo"}` antes de validar, el click envía confirmación textual válida → la IA puede llamar `submitTemplate` sin que el chip determinista guardado haya aparecido.
**Prevención:** prohibición en la description de la tool + en el prompt + filtro `CONFIRM_RE` en `mergeChips` (3 capas).

### Pitfall 3: Ruido visual del tool-part en la burbuja
**Qué pasa:** chat-message.tsx:184-193 renderiza pill verde genérico para cualquier output `success:true` y chat-message.tsx:54-62 muestra "Ejecutando suggestActions..." en streaming.
**Prevención:** branch `null` para `suggestActions` en `ToolOutput` + decidir si suprimir también el loading (recomendado: sí — la tool es invisible para el usuario).

### Pitfall 4: Lag de persistencia de 1 turno rompe D-10 para el turno final
**Qué pasa:** onFinish persiste los messages del REQUEST (route.ts:119-125; comentario explícito en /api/builder/chat:135-144). Tras recargar, los AI-chips (y patches de draft) del último turno no existen.
**Prevención:** aceptar (consistente con preview actual) o fix con `toUIMessageStreamResponse({ originalMessages, onFinish })` — decidir en plan. NO asumir que "el session-store ya guarda todo" cubre el turno final.

### Pitfall 5: Doble render / doble fuente de chips
**Qué pasa:** CONTEXT documenta el doble mecanismo de dispatch (scan parent + effect per-component). Si los chips se leen tanto del scan como de un estado propio, se duplican o quedan stale.
**Prevención:** UNA fuente: `useMemo` de extracción. Cero `useState` para AI-chips, cero dispatches.

### Pitfall 6: `validateTemplateDraft` exige cobertura de `variableMapping` que el prompt dice dejar vacío
**Qué pasa:** validation.ts:129-134 falla con "Falta mapping para variable {{N}}" si el body tiene variables sin mapping, pero system-prompt.ts:52 instruye dejar `variableMapping` vacío en el flujo normal. En la práctica la IA pasa el draft en `input.draft` con lo que ella conoce — para templates con variables, la validación puede fallar sistemáticamente por mapping, y el chip "✅ Confirmar y crear" (etapa 3) nunca aparecería; aparecerían los chips de etapa 4 ("Corregir automáticamente").
**Impacto en este standalone:** el guard D-07 simplemente refleja el resultado real del tool — correcto por diseño. Pero el plan debe EXCLUIR `variableMapping` del comparador `draftMatchesValidated` (el mapping del draft context casi siempre es `{}` mientras la IA puede haber pasado otro) y el QA debe probar un template CON variables end-to-end para ver qué hace realmente la IA con el mapping. Arreglar la contradicción validation↔prompt está **fuera de scope** (CONTEXT: "Fuera de scope: ... validación").
**Estado:** [VERIFIED: validation.ts:129-134 vs system-prompt.ts:52] — contradicción real en el código; comportamiento runtime de la IA [ASSUMED].

### Pitfall 7: Chips dentro del scroll-container rompen el "scroll-to-bottom"
**Qué pasa:** si los chips se montan dentro del div scrolleable después de `bottomRef`, el `scrollIntoView` (chat-pane.tsx:74-76) deja los chips medio cortados o fuerza saltos al aparecer/desaparecer.
**Prevención:** strip FUERA del scroll-container (patrón error-banner, chat-pane.tsx:252-259).

### Pitfall 8: `headerImageStoragePath` no sobrevive recarga → etapa 5 reaparece
**Qué pasa:** el storagePath se setea por `UPDATE_FIELD` post-upload (chat-pane.tsx:174-179), no viaja en patches de `updateDraft` → tras recargar un draft IMAGE ya subido, los chips dicen "📷 Subir imagen" otra vez.
**Prevención:** ninguna en este standalone (consistente con lo que muestra el preview tras recarga — limitación preexistente del builder). Documentar en QA expectations del plan.

## State of the Art

| Old Approach | Current Approach | Notas |
|--------------|------------------|-------|
| AI SDK v4/v5 `toolInvocations` en message | v6: `message.parts` con `tool-{name}` / `dynamic-tool` + states `input-streaming/input-available/output-available/output-error` | Ya adoptado en el builder [VERIFIED: chat-message.tsx] |
| `experimental_activeTools` | `activeTools` (estable, también en PrepareStepResult) | [VERIFIED: index.d.ts:1119-1126, 924] |
| Persistir messages del request en onFinish | `toUIMessageStreamResponse({ originalMessages, onFinish })` persistence mode | Disponible pero NO adoptado en el codebase — adopción opcional (Pitfall 4) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La IA (claude-sonnet-4) cumplirá "suggestActions al final, nunca primero" la mayoría de las veces con el prompt + activeTools guard | suggestActions design | Bajo — la base determinista D-01 cubre los turnos sin tool; el guard mecánico cubre el step 0 |
| A2 | Comportamiento runtime de la IA con `variableMapping` en `validateTemplateDraft` (puede inventar mappings para pasar la validación) | Pitfall 6 | Medio — el chip "Confirmar y crear" podría no aparecer para templates con variables; QA del plan debe probarlo end-to-end |
| A3 | `output.actions` del part persistido conserva el shape exacto tras round-trip JSONB (serialización Supabase) | Persistence D-10 | Bajo — updateDraft ya hace el mismo round-trip con `patch` y funciona (replay verificado en código) |

## Open Questions

1. **¿Cerrar el lag de persistencia (Pitfall 4) en este standalone?**
   - Sabemos: fix de ~5 líneas verificado en ai@6.0.86, acotado al route de templates.
   - No claro: si el usuario prefiere consistencia con el comportamiento actual (lag también en preview) o cerrar D-10 al 100%.
   - Recomendación: incluirlo como task opcional del plan con flag de decisión; default = incluirlo (es estrictamente mejor y no toca /api/builder/chat).
2. **Chip "Crear otro template" — prop `onNewSession` vs mensaje:** recomendación firme prop (a) (ver Local Actions); confirmarlo en plan.

## Environment Availability

Fase de código puro (Next.js + libs ya instaladas). Sin dependencias externas nuevas. **SKIPPED** (no external dependencies identified).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (usado en todo el repo: `npx vitest run <path>`) |
| Config file | existente a nivel repo |
| Quick run command | `npx vitest run src/lib/config-builder/templates/__tests__/` |
| Full suite command | `npx vitest run src/lib/config-builder/` + `npx tsc --noEmit` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-01/D-03 | `deriveStage` + `mergeChips` (precedencia, cap 4, dedupe, filtro confirm) | unit | `npx vitest run src/lib/config-builder/templates/__tests__/suggested-actions.test.ts` | ❌ Wave 0 |
| D-07 | guard: `draftMatchesValidated` true/false según ediciones post-validate | unit | mismo archivo | ❌ Wave 0 |
| Tool echo | `suggestActions.execute` retorna `{success, actions}`; Zod rechaza >3 actions | unit | mismo archivo (o tools.test.ts) | ❌ Wave 0 |
| Prompt | system prompt menciona suggestActions + prohibiciones | unit | extender `src/lib/config-builder/templates/__tests__/system-prompt.test.ts` | ✅ existe |
| D-04/D-05/D-06/D-08/D-09/D-10 | clicks, acciones locales, gating por status, arranque, recarga | manual QA (browser /configuracion/whatsapp/templates/builder, puerto 3020) | — | manual-only (UI streaming + sesión real; justificación: requiere LLM en vivo) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/config-builder/templates/__tests__/` + `npx tsc --noEmit`
- **Per wave merge:** full suite de config-builder
- **Phase gate:** suite verde + QA manual checklist antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/config-builder/templates/__tests__/suggested-actions.test.ts` — deriveStage + mergeChips + guard D-07 (la lógica debe vivir en un módulo puro importable, ej. `src/lib/config-builder/templates/suggested-actions.ts`, para ser testeable sin React)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (route ya autentica: route.ts:33-52, sin cambios) | — |
| V4 Access Control | no nuevo — workspace isolation existente (cookie + membership check) intacta | — |
| V5 Input Validation | yes | Zod schema de `suggestActions` (max 3 actions, label ≤30, message ≤200) — caps evitan que la IA infle el payload |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| AI-chip induce submit sin validar (prompt injection indirecta vía label/message) | Elevation | Filtro `CONFIRM_RE` client-side + prohibición en tool description + guard D-07 determinista (el submit real sigue requiriendo que la IA llame `submitTemplate`, que sigue tras el prompt-gate de confirmación) |
| XSS vía labels de la IA | Tampering | React escapa por defecto; NO usar `dangerouslySetInnerHTML` en chips (render como texto) |
| Scope creep del agente | Elevation | `suggestActions` es echo puro, cero imports de supabase/domain — verificable con grep en el diff de tools.ts |

## Sources

### Primary (HIGH confidence — codebase + types instalados)
- `src/lib/config-builder/templates/tools.ts` (patrón echo updateDraft:218-242; validateTemplateDraft:247-273; submitTemplate:278-414)
- `src/lib/config-builder/templates/system-prompt.ts` (REGLA CERO:31-43; tools list:69-77; confirmación:130)
- `src/lib/config-builder/templates/types.ts` (TemplateDraft:42-57)
- `src/lib/config-builder/templates/validation.ts` (extractVarIndices:55-60; validateDraft:71-146; contradicción mapping:129-134)
- `src/app/api/config-builder/templates/chat/route.ts` (prepareStep:113-118; onFinish:119-125; stepCountIs(15):108)
- `src/app/api/builder/chat/route.ts:135-144` (comentario que confirma el lag de persistencia)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx` (useChat:68; scan:82-125; fileInputRef:46+267; empty-state:223-236; error strip:252-259; auto-scroll:74-76)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx` (parts renderer; TOOL_LABELS:40-48; generic OK pill:184-193)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-draft-context.tsx` (reducer:41-52; initialDraft:26-39)
- `src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx` (handleSelectSession:100-120; handleNewSession:85-92; chatKey remount)
- `src/lib/builder/session-store.ts` (updateSession:158-197; messages JSONB)
- `node_modules/ai/dist/index.d.ts` @6.0.86 (ChatStatus:3286; ToolUIPart:1516; PrepareStepResult.activeTools:911-924; UIMessageStreamOptions.originalMessages/onFinish:1964-1977; toUIMessageStreamResponse:2228)

### Secondary / Tertiary
- Ninguna — investigación 100% interna al repo y a los types instalados. No se requirió web search.

## Metadata

**Confidence breakdown:**
- Stage detection: HIGH — todos los campos y predicados verificados contra types.ts + validation.ts + chat flow real
- suggestActions design: HIGH — patrón echo idéntico a updateDraft; activeTools verificado en types instalados
- Persistencia D-10: HIGH — cadena completa verificada, incluida la limitación del lag (con evidencia textual del comentario del route hermano)
- Comportamiento runtime de la IA (compliance de prompt, mapping en validate): MEDIUM — mitigado por diseño determinista + QA del plan

**Research date:** 2026-06-12
**Valid until:** ~30 días (stack interno estable; revalidar si se actualiza `ai` major)
