---
phase: template-builder-suggested-actions
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/config-builder/templates/suggested-actions.ts
  - src/lib/config-builder/templates/__tests__/suggested-actions.test.ts
  - src/lib/config-builder/templates/tools.ts
  - src/lib/config-builder/templates/system-prompt.ts
  - src/lib/config-builder/templates/__tests__/system-prompt.test.ts
  - src/app/api/config-builder/templates/chat/route.ts
autonomous: true
requirements: [D-01, D-02, D-03, D-07, D-08, D-09, D-10]
must_haves:
  truths:
    - "Existe un módulo puro que deriva la etapa del flujo desde TemplateDraft + messages (sin React, testeable con vitest)"
    - "La tool suggestActions existe como echo puro (cero DB) y la IA está instruida a llamarla solo al final del turno"
    - "El step 0 forzado del route NO puede satisfacerse con suggestActions (REGLA CERO intacta — Pitfall 1)"
    - "El onFinish del route persiste los messages COMPLETOS del turno (persistence mode — cierra Pitfall 4 / D-10 al 100%)"
  artifacts:
    - path: "src/lib/config-builder/templates/suggested-actions.ts"
      provides: "deriveStage, mergeChips, draftMatchesValidated, extractAiActions, STARTER_CHIPS, tipo Chip"
      exports: ["deriveStage", "mergeChips", "draftMatchesValidated", "extractAiActions", "STARTER_CHIPS"]
      min_lines: 150
    - path: "src/lib/config-builder/templates/__tests__/suggested-actions.test.ts"
      provides: "Tests unitarios de precedencia de etapas, guard D-07, merge/dedupe/cap, filtro CONFIRM, extracción AI-chips"
      min_lines: 100
    - path: "src/lib/config-builder/templates/tools.ts"
      provides: "Tool suggestActions (echo)"
      contains: "suggestActions: tool("
    - path: "src/lib/config-builder/templates/system-prompt.ts"
      provides: "Instrucción de la tool 8 + prohibiciones"
      contains: "suggestActions"
    - path: "src/app/api/config-builder/templates/chat/route.ts"
      provides: "activeTools en step 0 + persistence mode"
      contains: "activeTools"
  key_links:
    - from: "src/lib/config-builder/templates/suggested-actions.ts"
      to: "src/lib/config-builder/templates/validation.ts"
      via: "import { extractVarIndices } (NO re-implementar)"
      pattern: "import \\{ extractVarIndices \\} from './validation'"
    - from: "src/app/api/config-builder/templates/chat/route.ts"
      to: "suggestActions"
      via: "exclusión en activeTools del step 0"
      pattern: "activeTools"
    - from: "src/app/api/config-builder/templates/chat/route.ts"
      to: "session-store updateSession"
      via: "toUIMessageStreamResponse({ originalMessages, onFinish })"
      pattern: "originalMessages"
---

<objective>
Construir la capa backend + lógica pura de los chips de acción sugerida del Template Builder: (1) módulo puro `suggested-actions.ts` con la derivación determinista de etapa (D-01), merge con tope 4 y dedupe (D-02/D-03), guard de confirmación (D-07) y los 4 starter-chips con prompts pre-armados (D-08/D-09); (2) tool echo `suggestActions` + instrucción en el system prompt; (3) route: guard mecánico `activeTools` en step 0 (Pitfall 1) + persistence mode para cerrar el lag de 1 turno (Pitfall 4, decisión: SÍ se incluye — recomendación default del RESEARCH, Open Question 1).

Purpose: que el Plan 02 (UI) solo tenga que importar funciones ya testeadas y renderizar.
Output: módulo puro + tests verdes + tool + prompt + route actualizados. Cero UI en este plan.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/template-builder-suggested-actions/CONTEXT.md
@.planning/standalone/template-builder-suggested-actions/RESEARCH.md
@.planning/standalone/template-builder-suggested-actions/PATTERNS.md

<interfaces>
<!-- Contratos existentes que este plan consume. Verificados en RESEARCH/PATTERNS. -->

De src/lib/config-builder/templates/types.ts (42-57):
```typescript
export interface TemplateDraft {
  name: string
  language: TemplateLanguage          // 'es' | 'es_CO' | 'en_US'
  category: TemplateCategoryEnum     // 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  headerFormat: TemplateHeaderFormat // 'NONE' | 'TEXT' | 'IMAGE'
  headerText: string
  headerImageStoragePath: string | null  // comparar Boolean(a) === Boolean(b)
  headerImageLocalUrl: string | null     // EXCLUIR del comparador (efímero)
  bodyText: string
  footerText: string
  variableMapping: Record<string, string> // EXCLUIR del comparador (Pitfall 6)
  bodyExamples: Record<string, string>
  headerExamples: Record<string, string>
}
```

De src/lib/config-builder/templates/validation.ts (55-60) — REUSAR, no re-implementar:
```typescript
export function extractVarIndices(text: string): number[]
// 'Hola {{2}}, tu pedido {{1}}' -> [1, 2]  (puro, client-safe, solo importa ./types)
```

Shape de tool-parts AI SDK v6 (verificado ai@6.0.86, chat-pane.tsx:86-97):
```typescript
// static: { type: 'tool-validateTemplateDraft', state: 'output-available', input: { draft }, output: { success: true } | { error, errors } }
// dynamic: { type: 'dynamic-tool', toolName: 'validateTemplateDraft', state: 'output-available', ... }
// submitTemplate ok: output.success === true
// suggestActions ok: output = { success: true, actions: [{ label, message }] }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Módulo puro suggested-actions.ts + tests unitarios</name>
  <files>src/lib/config-builder/templates/suggested-actions.ts, src/lib/config-builder/templates/__tests__/suggested-actions.test.ts</files>
  <read_first>
    - .planning/standalone/template-builder-suggested-actions/RESEARCH.md (§Stage-Detection Map — tabla de 9 predicados; §Merge D-03 — excerpt de mergeChips a copiar; §Chips Rendering — extracción del último mensaje)
    - .planning/standalone/template-builder-suggested-actions/PATTERNS.md (§1 — banner-header y estilo de validation.ts; §3 — convención de tests y fixture baseDraft)
    - src/lib/config-builder/templates/validation.ts (extractVarIndices:55-60 — import directo; estilo del módulo)
    - src/lib/config-builder/templates/types.ts (TemplateDraft:42-57)
    - src/lib/config-builder/templates/__tests__/system-prompt.test.ts (convención vitest del módulo)
  </read_first>
  <behavior>
    - deriveStage retorna 'post_submit' cuando el último milestone del historial es un tool-submitTemplate con output.success===true (gana sobre validate anterior)
    - deriveStage retorna 'empty' con chips [] cuando messages.length === 0
    - deriveStage retorna 'validated_ok' con chip "✅ Confirmar y crear" SOLO cuando el último validateTemplateDraft fue success Y draftMatchesValidated(input.draft, draft) es true (guard D-07)
    - Editar bodyText después de validar rompe draftMatchesValidated → deriveStage cae a etapa inferior (el chip confirmar desaparece) — D-07 re-evaluación
    - deriveStage retorna 'validated_failed' cuando el último validate tiene output.error y el draft sigue igual
    - deriveStage retorna 'image_missing' cuando headerFormat==='IMAGE' && !headerImageStoragePath
    - deriveStage retorna 'examples_missing' cuando hay variables {{N}} sin entry en bodyExamples
    - deriveStage retorna 'no_variables' cuando bodyText no vacío y sin variables
    - deriveStage retorna 'ready_to_validate' cuando bodyText no vacío (y no matcheó nada anterior)
    - draftMatchesValidated ignora variableMapping y headerImageLocalUrl; headerImageStoragePath se compara con Boolean(a)===Boolean(b); bodyExamples/headerExamples por igualdad estructural con keys ordenadas
    - mergeChips: deterministas primero, cap total 4, dedupe por label normalizado (sin acentos/emoji/case), descarta AI-chips cuyo label O message normalizado matchee CONFIRM_RE (Pitfall 2)
    - extractAiActions: lee SOLO messages[length-1]; si no es assistant o no tiene tool-suggestActions con output-available → []; soporta shapes 'tool-suggestActions' y 'dynamic-tool'+toolName
    - STARTER_CHIPS tiene exactamente 4 entries con los labels D-08
  </behavior>
  <action>
Crear `src/lib/config-builder/templates/suggested-actions.ts` — módulo PURO: cero imports de React/supabase/domain; solo `import type { TemplateDraft } from './types'` e `import { extractVarIndices } from './validation'`. Banner-header del módulo (convención PATTERNS §Shared):

```
// ============================================================================
// Standalone: template-builder-suggested-actions — Plan 01
// Derivación determinista de chips de acción sugerida desde TemplateDraft +
// messages (D-01), merge con tope 4 (D-02/D-03), guard de confirmación (D-07)
// y starter-chips del empty-state (D-08/D-09). Puro: testeable sin React.
// ============================================================================
```

**Tipos exportados:**
```typescript
export type ChipAction = 'upload-image' | 'navigate-templates' | 'new-session'

export interface Chip {
  label: string
  message: string        // texto que se envía como burbuja del usuario ('' en acciones locales)
  action?: ChipAction    // si presente, el click ejecuta acción local y NO envía mensaje (D-05)
  variant?: 'default' | 'confirm'
}

export type StageId =
  | 'post_submit' | 'empty' | 'validated_ok' | 'validated_failed'
  | 'image_missing' | 'examples_missing' | 'no_variables'
  | 'ready_to_validate' | 'fallback'

// Shape mínimo estructural de UIMessage para no importar de 'ai' (el módulo es puro)
export interface MessageLike {
  role?: string
  parts?: unknown[]
}
```

**STARTER_CHIPS (D-08/D-09) — verbatim, estos son los 4 prompts pre-armados definidos en plan:**
```typescript
export const STARTER_CHIPS: Chip[] = [
  {
    label: 'Confirmación de pedido',
    message:
      'Quiero un template para confirmar pedidos: que salude al cliente por su nombre, le confirme que recibimos su pedido con el número de orden y le diga la fecha estimada de entrega.',
  },
  {
    label: 'Recordatorio de cita',
    message:
      'Quiero un template para recordar citas: que salude al paciente por su nombre, le recuerde la fecha y la hora de su cita y le pida confirmar su asistencia.',
  },
  {
    label: 'Promoción',
    message:
      'Quiero un template de promoción: que salude al cliente por su nombre y le presente una oferta especial con descuento por tiempo limitado, invitándolo a responder para aprovecharla.',
  },
  {
    label: 'Código de verificación',
    message:
      'Quiero un template de código de verificación: que entregue al cliente su código de un solo uso y le aclare que expira en pocos minutos.',
  },
]
```

**Helpers internos de escaneo de parts** (cubrir SIEMPRE ambos shapes — PATTERNS §Detección dual static/dynamic):
- `getToolPart(part: unknown): { toolName: string; input?: unknown; output?: unknown } | null` — narrowing estructural: si `part.state !== 'output-available'` → null; toolName desde `type === 'dynamic-tool' ? part.toolName : part.type.startsWith('tool-') ? part.type.slice(5) : null`.
- Escanear TODOS los messages en orden registrando: `lastValidate` (último part `validateTemplateDraft` con su input/output y su posición global) y `lastSubmitOk` (último part `submitTemplate` con `output.success === true` y su posición global). `lastSubmitOk` "gana" si su posición es posterior a la de `lastValidate` (simplificación V1 del RESEARCH).

**`draftMatchesValidated(input: unknown, draft: TemplateDraft): boolean`:**
- Si input no es objeto → false.
- Igualdad estricta de: `name, language, category, headerFormat, headerText, bodyText, footerText`.
- `headerImageStoragePath`: `Boolean(input.headerImageStoragePath) === Boolean(draft.headerImageStoragePath)` (tolerancia — la IA conoce el path solo por el mensaje de aviso).
- `bodyExamples` y `headerExamples`: igualdad estructural — `JSON.stringify(sortKeys(a ?? {})) === JSON.stringify(sortKeys(b ?? {}))` con helper `sortKeys` que ordena las keys alfabéticamente.
- EXCLUIR `variableMapping` (Pitfall 6 — el mapping del context casi siempre es {} mientras la IA puede haber pasado otro) y `headerImageLocalUrl` (efímero).

**`deriveStage(draft: TemplateDraft, messages: MessageLike[]): { stage: StageId; chips: Chip[] }`** — first match wins, en este orden exacto con estos chips verbatim:

| # | StageId | Predicado | Chips |
|---|---------|-----------|-------|
| 1 | `post_submit` | lastSubmitOk es el milestone más reciente | `{label:'Crear otro template', message:'', action:'new-session'}`, `{label:'Ver mis templates', message:'', action:'navigate-templates'}` |
| 2 | `empty` | `messages.length === 0` | `[]` (los starter-chips se renderizan en el empty-state, no en el strip) |
| 3 | `validated_ok` | `lastValidate.output.success === true && draftMatchesValidated(lastValidate.input.draft, draft)` | `{label:'✅ Confirmar y crear', message:'Confirmo, créalo', variant:'confirm'}`, `{label:'Revisar de nuevo', message:'Revisemos el template una vez más antes de crearlo'}` |
| 4 | `validated_failed` | lastValidate existe, su output tiene `error`, y `draftMatchesValidated(...)` | `{label:'Corregir automáticamente', message:'Corrige los errores de validación automáticamente'}`, `{label:'Editar yo mismo', message:'Dime exactamente qué errores hay y los corrijo yo mismo'}` |
| 5 | `image_missing` | `draft.headerFormat === 'IMAGE' && !draft.headerImageStoragePath` | `{label:'📷 Subir imagen', message:'', action:'upload-image'}`, `{label:'Mejor sin imagen', message:'Mejor hagamos el template sin imagen, quita el header de imagen'}` |
| 6 | `examples_missing` | `bodyVars.length > 0 && bodyVars.some(i => !draft.bodyExamples[String(i)])` con `bodyVars = extractVarIndices(draft.bodyText)` | `{label:'Usar ejemplos sugeridos', message:'Sugiere tú los ejemplos para las variables'}`, `{label:'Escribir mis ejemplos', message:'Yo te paso los ejemplos de las variables, pregúntame los valores'}` |
| 7 | `no_variables` | `draft.bodyText.trim() !== '' && bodyVars.length === 0` | `{label:'Agregar variables', message:'Agrega variables al template, por ejemplo el nombre del cliente'}`, `{label:'Agregar imagen', message:'Quiero que el template tenga una imagen en el header'}`, `{label:'Cambiar el texto', message:'Quiero cambiar el texto del mensaje'}`, `{label:'Continuar →', message:'Continúa con el siguiente paso'}` |
| 8 | `ready_to_validate` | `draft.bodyText.trim() !== ''` | `{label:'Validar template', message:'Valida el template'}`, `{label:'Cambiar algo', message:'Quiero cambiar algo antes de validar'}` |
| 9 | `fallback` | ninguno | `[]` |

**`mergeChips(deterministic: Chip[], ai: Chip[], cap = 4): Chip[]`** — copiar del RESEARCH §Merge D-03 con UNA mejora: CONFIRM_RE se evalúa sobre el texto NORMALIZADO (para atrapar "créalo" con acento):
```typescript
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^\p{L}\p{N} ]/gu, '').trim()
const CONFIRM_RE = /(confirm|crealo|crearlo|envialo|submit|crea el template)/
// dentro del loop de AI-chips:
//   if (CONFIRM_RE.test(norm(chip.label)) || CONFIRM_RE.test(norm(chip.message))) continue
```
Deterministas ocupan los primeros slots; AI rellena hasta `cap`; dedupe por `norm(label)`; `slice(0, cap)` final (D-02/D-03).

**`extractAiActions(messages: MessageLike[]): Chip[]`** — mira SOLO `messages[messages.length - 1]`; si no es `role === 'assistant'` o sin parts → `[]`. Recorre parts de atrás hacia adelante; primer part `suggestActions` (ambos shapes) con `state === 'output-available'` y `output.success === true && Array.isArray(output.actions)` → retorna `output.actions` mapeado a `Chip[]` (label/message como strings, sin action ni variant). Si nada matchea → `[]`.

Crear `src/lib/config-builder/templates/__tests__/suggested-actions.test.ts` siguiendo la convención de system-prompt.test.ts (imports explícitos de vitest, comentario de origen sobre el describe, nombres de `it` en español). Fixture `baseDraft` local espejando initialDraft (PATTERNS §3 — NO importar de template-draft-context.tsx, es client component):
```typescript
const baseDraft: TemplateDraft = {
  name: '', language: 'es', category: 'UTILITY', headerFormat: 'NONE',
  headerText: '', headerImageStoragePath: null, headerImageLocalUrl: null,
  bodyText: '', footerText: '', variableMapping: {}, bodyExamples: {}, headerExamples: {},
}
```
Fixtures de messages con parts mínimos, ej:
```typescript
const validateOkMsg = (draft: TemplateDraft) => ({
  id: 'm1', role: 'assistant',
  parts: [{ type: 'tool-validateTemplateDraft', state: 'output-available', input: { draft }, output: { success: true } }],
})
```
Cubrir TODOS los behaviors del bloque `<behavior>` (incluido el caso dynamic-tool y el caso "submit ok posterior a validate gana").
  </action>
  <verify>
    <automated>npx vitest run src/lib/config-builder/templates/__tests__/suggested-actions.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function deriveStage\|export function mergeChips\|export function draftMatchesValidated\|export function extractAiActions" src/lib/config-builder/templates/suggested-actions.ts` retorna 4
    - `grep -c "export const STARTER_CHIPS" src/lib/config-builder/templates/suggested-actions.ts` retorna 1 y el array tiene los 4 labels: "Confirmación de pedido", "Recordatorio de cita", "Promoción", "Código de verificación"
    - `grep -n "from './validation'" src/lib/config-builder/templates/suggested-actions.ts` muestra import de extractVarIndices (NO hay regex propio de `{{N}}` duplicado)
    - `grep -rn "react\|supabase\|@/lib/domain" src/lib/config-builder/templates/suggested-actions.ts` retorna 0 matches no-comentario (módulo puro)
    - `grep -c "variableMapping" src/lib/config-builder/templates/suggested-actions.ts` — aparece SOLO en comentarios de exclusión, nunca en comparación de igualdad
    - `grep -n "Confirmo, créalo" src/lib/config-builder/templates/suggested-actions.ts` retorna 1 match (chip D-07)
    - `npx vitest run src/lib/config-builder/templates/__tests__/suggested-actions.test.ts` verde con ≥14 tests
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <done>Módulo puro con los 5 exports + tests verdes cubriendo las 9 etapas, guard D-07, merge D-02/D-03 y filtro CONFIRM (Pitfall 2 capa 3). Commit atómico en español: `feat(template-builder-chips): modulo puro de derivacion de chips + tests (D-01/D-02/D-03/D-07/D-08/D-09)`.</done>
</task>

<task type="auto">
  <name>Task 2: Tool suggestActions en tools.ts + instrucción en system-prompt.ts + tests de prompt</name>
  <files>src/lib/config-builder/templates/tools.ts, src/lib/config-builder/templates/system-prompt.ts, src/lib/config-builder/templates/__tests__/system-prompt.test.ts</files>
  <read_first>
    - src/lib/config-builder/templates/tools.ts (header 1-19 que enumera las tools; patrón echo updateDraft:218-242; cierre del objeto de createTemplateBuilderTools)
    - src/lib/config-builder/templates/system-prompt.ts (REGLA CERO:31-43 — NO TOCAR; lista de tools:69-77; sección Flujo de Imagenes:122-127 como análogo de estilo; Prohibiciones:129-134)
    - src/lib/config-builder/templates/__tests__/system-prompt.test.ts (patrón toContain a extender)
    - .planning/standalone/template-builder-suggested-actions/RESEARCH.md (§suggestActions Tool Design — excerpt completo de la tool; §Instrucción en system prompt — los 6 puntos obligatorios)
  </read_first>
  <action>
**tools.ts** — agregar `suggestActions` como ÚLTIMA entrada del objeto retornado por `createTemplateBuilderTools(ctx)` (no usa `ctx`, igual que updateDraft). Copiar VERBATIM del RESEARCH §suggestActions Tool Design:

```typescript
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
          label: z.string().min(1).max(30),
          message: z.string().min(1).max(200),
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
Actualizar el comentario header del archivo (líneas ~5-11) que enumera las tools: 7 → 8, agregando `suggestActions` a la lista. PROHIBIDO: agregar imports de supabase/domain en el diff (la tool es echo puro — gate de agent-scope).

**system-prompt.ts** — tres inserciones, SIN tocar la REGLA CERO (líneas 31-43):

(a) Lista de tools (~69-77): cambiar "estas 7 tools" → "estas 8 tools" y agregar entrada con el estilo de `captureVariableMapping`:
```
8. `suggestActions` — **OPCIONAL, solo al FINAL del turno**. Sugiere hasta 3 acciones rapidas contextuales para el usuario. **NUNCA la invoques como primera tool del turno.**
```

(b) Sección nueva después de "Flujo de Imagenes" (mismo estilo de sección con triggers concretos) — texto verbatim:
```
### Acciones sugeridas (suggestActions) — OPCIONAL
Al FINAL de tu turno (despues de updateDraft y de tu texto) puedes llamar `suggestActions` UNA sola vez para sugerir hasta 3 acciones rapidas contextuales.
- NUNCA la llames como primera tool del turno.
- Maximo 1 llamada por turno, maximo 3 acciones.
- `label`: imperativo corto (max 30 caracteres). `message`: primera persona, lo que el usuario diria (ej: label "Agregar emojis" → message "Agregale emojis al mensaje").
- NUNCA sugieras acciones de confirmacion o creacion del template ("confirmo", "crealo", "envialo") — la UI maneja ese boton con su propio guard.
- NO repitas acciones obvias del flujo (validar, subir imagen, confirmar) — la UI ya las muestra. Sugiere solo lo contextual (ej: "Continuar sin botones" cuando el usuario pidio botones de WhatsApp, "Hacerlo mas corto", "Version en ingles").
- Si no tienes nada contextual que aportar, NO la llames.
```

(c) Prohibiciones (~129-134) — bullet nuevo con el formato existente:
```
- **NUNCA** llames `suggestActions` como primera tool del turno ni sugieras en ella acciones de confirmacion/creacion del template.
```

**system-prompt.test.ts** — agregar describe nuevo `'buildTemplatesSystemPrompt — suggestActions'` con comentario de origen (Pitfall 1/2 de este standalone) y asserts `toContain`:
- `expect(prompt).toContain('suggestActions')`
- `expect(prompt).toContain('NUNCA la llames como primera tool del turno')` (o el literal exacto del bullet (b))
- `expect(prompt).toContain('estas 8 tools')`
- Assert de que la REGLA CERO sigue intacta: `expect(prompt).toContain(<literal actual de la REGLA CERO, leído del archivo antes de editar>)`
  </action>
  <verify>
    <automated>npx vitest run src/lib/config-builder/templates/__tests__/ && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "suggestActions: tool(" src/lib/config-builder/templates/tools.ts` retorna 1
    - `grep -c "max(3)" src/lib/config-builder/templates/tools.ts` ≥ 1 (cap de 3 acciones — D-02/D-03: la IA nunca llena más de 3 slots)
    - `git diff src/lib/config-builder/templates/tools.ts | grep -c "createAdminClient\|@supabase\|@/lib/domain"` retorna 0 (echo puro, cero ampliación de scope)
    - `grep -c "estas 8 tools" src/lib/config-builder/templates/system-prompt.ts` retorna 1
    - `grep -c "Acciones sugeridas (suggestActions)" src/lib/config-builder/templates/system-prompt.ts` retorna 1
    - La REGLA CERO (system-prompt.ts:31-43) está byte-idéntica: `git diff src/lib/config-builder/templates/system-prompt.ts` no muestra cambios en ese rango
    - `npx vitest run src/lib/config-builder/templates/__tests__/system-prompt.test.ts` verde con los asserts nuevos
  </acceptance_criteria>
  <done>Tool 8 registrada como echo puro + prompt instruido en 3 puntos + tests de prompt verdes. Commit: `feat(template-builder-chips): tool suggestActions echo + instruccion en system prompt (D-01, Pitfall 2 capas 1-2)`.</done>
</task>

<task type="auto">
  <name>Task 3: Route — activeTools en step 0 (Pitfall 1) + persistence mode (Pitfall 4)</name>
  <files>src/app/api/config-builder/templates/chat/route.ts</files>
  <read_first>
    - src/app/api/config-builder/templates/chat/route.ts (estado actual completo: prepareStep:113-118, onFinish:119-125, toUIMessageStreamResponse + X-Session-Id:128-130)
    - .planning/standalone/template-builder-suggested-actions/RESEARCH.md (§Mitigación en dos capas — excerpt exacto del prepareStep; §Persistence Verification — fix verificado en ai@6.0.86)
    - .planning/standalone/template-builder-suggested-actions/PATTERNS.md (§6 — antes/después del route)
  </read_first>
  <action>
Dos cambios acotados a este route (NO tocar `/api/builder/chat` — Regla 6 análoga, el route hermano de automatizaciones conserva su comportamiento):

**Cambio 1 — Pitfall 1 (obligatorio):** en `prepareStep`, el return del step 0 agrega `activeTools` con las 7 tools EXISTENTES (todas menos `suggestActions`), preservando el comentario existente y agregando uno nuevo que explique el porqué:

```typescript
prepareStep: async ({ stepNumber }: { stepNumber: number }) => {
  if (stepNumber === 0) {
    return {
      toolChoice: 'required' as const,
      // suggestActions excluida del step 0: una tool "barata" satisfaria el
      // toolChoice forzado sin llamar updateDraft y mataria la REGLA CERO
      // (Pitfall 1 — template-builder-suggested-actions).
      activeTools: [
        'listExistingTemplates',
        'suggestCategory',
        'suggestLanguage',
        'captureVariableMapping',
        'updateDraft',
        'validateTemplateDraft',
        'submitTemplate',
      ] as const,
    }
  }
  return {}
},
```

**Cambio 2 — Pitfall 4 (cierra D-10 al 100%):** ELIMINAR el `onFinish` de `streamText` (líneas 119-125 actuales) y migrar la response a persistence mode:

```typescript
// ANTES:
const response = result.toUIMessageStreamResponse()
// DESPUÉS (verificado index.d.ts:1964-1977 de ai@6.0.86):
const response = result.toUIMessageStreamResponse({
  originalMessages: messages,
  onFinish: async ({ messages: updated }) => {
    // Persistence mode: incluye la respuesta del turno actual (cierra el lag
    // de 1 turno que el patron viejo heredaba de /api/builder/chat).
    await updateSession(sessionId!, workspaceId, { messages: updated as unknown[] })
  },
})
response.headers.set('X-Session-Id', sessionId!)
```

CRÍTICO: no debe quedar doble persistencia — el `onFinish` de streamText se ELIMINA por completo. `stopWhen: stepCountIs(15)` NO se toca. La autenticación/workspace check (route.ts:33-52) NO se toca.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/config-builder/templates/__tests__/</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "activeTools" src/app/api/config-builder/templates/chat/route.ts` ≥ 1 y la lista NO contiene 'suggestActions'
    - `grep -c "originalMessages" src/app/api/config-builder/templates/chat/route.ts` retorna 1
    - `grep -c "onFinish" src/app/api/config-builder/templates/chat/route.ts` retorna exactamente 1 (solo el de toUIMessageStreamResponse — el de streamText fue eliminado)
    - `grep -c "stepCountIs(15)" src/app/api/config-builder/templates/chat/route.ts` retorna 1 (sin cambios)
    - `git diff --stat` muestra SOLO este route modificado en este commit (cero cambios en src/app/api/builder/chat/route.ts)
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <done>Step 0 no puede satisfacerse con suggestActions y la sesión persiste los messages completos del turno. Commit: `fix(template-builder-chips): activeTools step 0 + persistence mode en route (Pitfall 1 y 4, D-10)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LLM → tool input | la IA controla labels/messages de suggestActions (input no confiable) |
| Cliente → route | ya autenticado (route.ts:33-52, sin cambios) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-TBC-01 | Elevation | suggestActions (AI-chip de confirmación bypasea guard D-07) | mitigate | 3 capas: prohibición en description (Task 2) + prohibición en prompt (Task 2) + filtro CONFIRM_RE normalizado en mergeChips (Task 1) |
| T-TBC-02 | Elevation | suggestActions satisface toolChoice step 0 (mata REGLA CERO) | mitigate | activeTools sin suggestActions en step 0 (Task 3) |
| T-TBC-03 | Tampering | payload inflado por la IA | mitigate | Zod caps: max 3 actions, label ≤30, message ≤200 (Task 2 — ASVS V5) |
| T-TBC-04 | Elevation | scope creep del agente config-builder | mitigate | echo puro verificable: `git diff tools.ts` sin imports supabase/domain (Task 2 acceptance) |
</threat_model>

<verification>
- `npx vitest run src/lib/config-builder/templates/__tests__/` — suite completa del módulo verde (suggested-actions + system-prompt + preexistentes)
- `npx tsc --noEmit` — exit 0
- `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/config-builder/templates/suggested-actions.ts` — 0 matches
- Los 8 predicados de etapa del RESEARCH §Stage-Detection Map implementados en el orden exacto de precedencia
</verification>

<success_criteria>
- Módulo puro `suggested-actions.ts` con deriveStage/mergeChips/draftMatchesValidated/extractAiActions/STARTER_CHIPS, tests verdes (≥14 tests)
- Tool `suggestActions` registrada (echo, cero DB) + system prompt instruido sin tocar REGLA CERO
- Route con activeTools en step 0 + persistence mode (onFinish único)
- 3 commits atómicos en español, push diferido al Plan 03 (Regla 1 se cumple antes del QA)
</success_criteria>

<output>
Al completar, crear `.planning/standalone/template-builder-suggested-actions/01-SUMMARY.md`
</output>
