---
phase: template-builder-suggested-actions
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/suggested-action-chips.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx
autonomous: true
requirements: [D-01, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10]
must_haves:
  truths:
    - "Con status==='ready' y mensajes en pantalla, aparece un strip de hasta 4 chips entre el área de mensajes y el input"
    - "Click en chip de mensaje envía chip.message como burbuja visible del usuario (D-04)"
    - "📷 Subir imagen abre el file picker sin enviar mensaje; Ver mis templates navega; Crear otro template resetea sesión (D-05)"
    - "Mientras status es submitted/streaming no hay chips visibles y los handlers son no-op (D-06)"
    - "Chat vacío muestra los 4 starter-chips D-08 que envían los prompts pre-armados D-09"
    - "La tool suggestActions no genera ruido visual en la burbuja del asistente (sin pill verde ni loading)"
  artifacts:
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/suggested-action-chips.tsx"
      provides: "Componente presentacional puro de chips (portable al builder de automatizaciones)"
      exports: ["SuggestedActionChips"]
      min_lines: 40
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"
      provides: "Integración: useMemo de derivación + strip + click handlers + empty-state chips"
      contains: "deriveStage"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx"
      provides: "Silenciamiento de suggestActions en la burbuja"
      contains: "suggestActions"
    - path: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx"
      provides: "Prop onNewSession hacia ChatPane"
      contains: "onNewSession"
  key_links:
    - from: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"
      to: "src/lib/config-builder/templates/suggested-actions.ts"
      via: "import deriveStage/mergeChips/extractAiActions/STARTER_CHIPS"
      pattern: "from '@/lib/config-builder/templates/suggested-actions'"
    - from: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"
      to: "suggested-action-chips.tsx"
      via: "render del strip con onChipClick"
      pattern: "<SuggestedActionChips"
    - from: "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx"
      to: "chat-pane.tsx"
      via: "prop onNewSession={handleNewSession}"
      pattern: "onNewSession=\\{handleNewSession\\}"
---

<objective>
Renderizar los chips en la UI del builder: componente presentacional puro `SuggestedActionChips` (portable), integración en chat-pane (derivación con useMemo — fuente única, Pitfall 5), click handlers híbridos (mensaje vs acción local — D-04/D-05), gating por status (D-06), starter-chips en empty-state (D-08/D-09), silenciamiento del tool-part en la burbuja (Pitfall 3) y prop `onNewSession` desde el layout.

Purpose: cerrar el loop usuario-visible del feature usando el módulo puro ya testeado del Plan 01.
Output: chips funcionando end-to-end en `/configuracion/whatsapp/templates/builder`.
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
<!-- Contratos creados por el Plan 01 (leer 01-SUMMARY.md para confirmar) -->

De src/lib/config-builder/templates/suggested-actions.ts:
```typescript
export type ChipAction = 'upload-image' | 'navigate-templates' | 'new-session'
export interface Chip { label: string; message: string; action?: ChipAction; variant?: 'default' | 'confirm' }
export interface MessageLike { role?: string; parts?: unknown[] }
export const STARTER_CHIPS: Chip[]                                              // 4 chips D-08/D-09
export function deriveStage(draft: TemplateDraft, messages: MessageLike[]): { stage: StageId; chips: Chip[] }
export function mergeChips(deterministic: Chip[], ai: Chip[], cap?: number): Chip[]
export function extractAiActions(messages: MessageLike[]): Chip[]
```

Existentes en chat-pane.tsx (verificados):
```typescript
const { dispatch, draft } = useTemplateDraft()              // línea 44 — draft YA disponible
const { messages, sendMessage, status, error, setMessages } = useChat({...})  // línea 68
const fileInputRef = useRef<HTMLInputElement>(null)         // línea 46
const isLoading = status === 'submitted' || status === 'streaming'  // línea 201
```

En template-builder-layout.tsx (85-92): `handleNewSession` ya hace el reset completo (sessionId/title/messages/chatKey/dispatch RESET).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Componente SuggestedActionChips + silenciar suggestActions en chat-message.tsx</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/suggested-action-chips.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/whatsapp-bubble.tsx (análogo estructural: 'use client' + banner + props interface local + función pura sin state)
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx (TOOL_LABELS:40-48; ToolLoading:54-62; branches de ToolOutput:131-204; pill genérico success:184-193)
    - .planning/standalone/template-builder-suggested-actions/PATTERNS.md (§2 estilo visual del chip; §8 silenciamiento)
  </read_first>
  <action>
**Crear `suggested-action-chips.tsx`** — componente presentacional PURO y PORTABLE (CONTEXT pide poder portarlo al builder de automatizaciones): NO importa nada template-specific; define su propia interface estructural compatible con `Chip`:

```tsx
'use client'

// ============================================================================
// Standalone: template-builder-suggested-actions — Plan 02
// Chips de acción sugerida, puro render (sin state). Portable: no importa
// nada template-specific — recibe chips + onChipClick por props.
// D-02: el caller garantiza máx 4 chips. D-06: el caller controla disabled.
// XSS: labels renderizados como texto (React escapa) — cero dangerouslySetInnerHTML.
// ============================================================================

export interface SuggestedChip {
  label: string
  message: string
  action?: string
  variant?: 'default' | 'confirm'
}

interface SuggestedActionChipsProps {
  chips: SuggestedChip[]
  disabled?: boolean
  onChipClick: (chip: SuggestedChip) => void
}

export function SuggestedActionChips({ chips, disabled, onChipClick }: SuggestedActionChipsProps) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          disabled={disabled}
          onClick={() => onChipClick(chip)}
          className={
            chip.variant === 'confirm'
              ? 'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950'
              : 'rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
```
(El tipo `Chip` del módulo puro es estructuralmente asignable a `SuggestedChip` — TypeScript lo acepta sin cast.)

**Modificar `chat-message.tsx`** (Pitfall 3 — la tool es invisible para el usuario):

(a) TOOL_LABELS (líneas 40-48) — agregar entrada:
```typescript
suggestActions: 'Sugiriendo acciones...',
```

(b) Suprimir el loading: en el componente `ToolLoading` (líneas ~54-62), early-return ANTES de renderizar:
```typescript
// suggestActions es invisible: los chips se renderizan en el strip del chat-pane
if (toolName === 'suggestActions') return null
```
(Si `ToolLoading` no recibe `toolName` como prop, aplicar el early-return en los call-sites de las líneas ~251 y ~285 donde sí se conoce el toolName.)

(c) Suprimir el output: en `ToolOutput`, insertar ANTES del pill genérico de éxito (líneas 184-193, que captura cualquier `success: true`):
```typescript
// suggestActions: invisible en la burbuja — los chips se renderizan en el strip
if (toolName === 'suggestActions') return null
```
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function SuggestedActionChips" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/suggested-action-chips.tsx"` retorna 1
    - `grep -c "dangerouslySetInnerHTML" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/suggested-action-chips.tsx"` retorna 0
    - `grep -c "config-builder/templates" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/suggested-action-chips.tsx"` retorna 0 (componente portable, sin imports template-specific)
    - `grep -c "suggestActions" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx"` ≥ 2 (entrada en TOOL_LABELS + branch null en ToolOutput; +1 si el loading se suprime por toolName)
    - `grep -n "if (toolName === 'suggestActions') return null" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-message.tsx"` muestra el branch ANTES (número de línea menor) del pill genérico `rounded-full bg-emerald-500/10`
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <done>Componente pill portable creado + suggestActions invisible en burbuja (sin loading ni pill verde). Commit: `feat(template-builder-chips): componente SuggestedActionChips + silenciar tool en burbuja (Pitfall 3)`.</done>
</task>

<task type="auto">
  <name>Task 2: Integración en chat-pane (derivación, strip, handlers, empty-state) + prop onNewSession del layout</name>
  <files>src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx</files>
  <read_first>
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx (COMPLETO — props:28-32, useTemplateDraft:44, useChat:68, scan:82-125, isLoading:201, handleSubmit:203-209, empty-state:223-236, cierre messages-area:250, error display:252-259)
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx (handleNewSession:85-92, render de ChatPane:~180-185)
    - src/lib/config-builder/templates/suggested-actions.ts (creado en Plan 01 — firmas exactas de los exports)
    - .planning/standalone/template-builder-suggested-actions/RESEARCH.md (§Chips Rendering — useMemo NO processedPartsRef; §Local Actions Wiring — tabla de mecanismos; §Ubicación del render — Pitfall 7)
  </read_first>
  <action>
**template-builder-layout.tsx** — pasar la prop nueva al ChatPane existente (~180-185):
```tsx
<ChatPane
  key={chatKey}
  sessionId={sessionId}
  onSessionCreated={handleSessionCreated}
  initialMessages={initialMessages}
  onNewSession={handleNewSession}
/>
```
`handleNewSession` (85-92) NO se modifica — ya hace el reset completo.

**chat-pane.tsx** — seis ediciones:

(1) Imports nuevos:
```typescript
import { useMemo } from 'react'  // agregar al import de react existente
import { useRouter } from 'next/navigation'
import {
  deriveStage,
  mergeChips,
  extractAiActions,
  STARTER_CHIPS,
  type Chip,
} from '@/lib/config-builder/templates/suggested-actions'
import { SuggestedActionChips } from './suggested-action-chips'
```

(2) Props (28-32): agregar `onNewSession: () => void` a `ChatPaneProps` y destructurarla en la firma del componente.

(3) Derivación — UNA SOLA FUENTE (Pitfall 5: cero useState para chips, cero dispatches nuevos, NO usar processedPartsRef). Después de `const isLoading = ...` (línea 201):
```typescript
const router = useRouter()

// Chips: derivación pura desde draft + messages (D-01). useMemo, no side-effects.
const mergedChips = useMemo(() => {
  const { chips: deterministic } = deriveStage(draft, messages)
  const ai = extractAiActions(messages)
  return mergeChips(deterministic, ai, 4)
}, [draft, messages])
```

(4) Click handler — doble guard D-06 (oculto + no-op) y acciones locales D-05:
```typescript
const handleChipClick = useCallback(
  (chip: Chip) => {
    if (isLoading) return // D-06: no-op mientras el turno corre
    if (chip.action === 'upload-image') {
      fileInputRef.current?.click() // el onChange existente hace todo (validación/upload/aviso)
      return
    }
    if (chip.action === 'navigate-templates') {
      router.push('/configuracion/whatsapp/templates')
      return
    }
    if (chip.action === 'new-session') {
      onNewSession()
      return
    }
    if (chip.message.trim()) {
      sendMessage({ text: chip.message }) // D-04: burbuja visible del usuario
    }
  },
  [isLoading, router, onNewSession, sendMessage]
)
```

(5) Strip de chips — FUERA del scroll-container (Pitfall 7), insertado entre el cierre del messages-area (línea 250, `</div>` después de `<div ref={bottomRef} />`) y el error display (252):
```tsx
{/* Chips de acción sugerida (D-06: solo con turno terminado) */}
{status === 'ready' && messages.length > 0 && mergedChips.length > 0 && (
  <div className="px-4 pb-1">
    <div className="max-w-3xl mx-auto">
      <SuggestedActionChips chips={mergedChips} onChipClick={handleChipClick} />
    </div>
  </div>
)}
```

(6) Empty-state D-08/D-09 — dentro del branch `messages.length === 0` existente (223-236), después del `<p>` de ejemplo (mantener el texto actual del párrafo):
```tsx
<div className="flex flex-wrap justify-center gap-2 max-w-md">
  <SuggestedActionChips chips={STARTER_CHIPS} disabled={isLoading} onChipClick={handleChipClick} />
</div>
```
(Los starter-chips no tienen `action` → el handler envía su `message` pre-armado vía sendMessage — D-09.)

PROHIBIDO en este task: tocar el scan parent-level (82-125), el processedPartsRef, handleChatImageUpload, o cualquier lógica existente de sesión. Solo ADICIONES.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run src/lib/config-builder/templates/__tests__/</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "from '@/lib/config-builder/templates/suggested-actions'" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"` retorna 1
    - `grep -c "useMemo" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"` ≥ 1 y `grep -c "useState" sobre el diff` no agrega useState nuevo para chips (verificar con `git diff`: cero `useState` agregado)
    - `grep -c "status === 'ready' && messages.length > 0 && mergedChips.length > 0" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"` retorna 1 (gating D-06)
    - `grep -c "fileInputRef.current?.click()" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"` retorna 2 (botón existente + chip upload-image)
    - `grep -c "router.push('/configuracion/whatsapp/templates')" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"` retorna 1
    - `grep -c "onNewSession: () => void" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"` retorna 1
    - `grep -c "onNewSession={handleNewSession}" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx"` retorna 1
    - `grep -c "STARTER_CHIPS" "src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/chat-pane.tsx"` ≥ 1 (empty-state D-08)
    - El strip está FUERA del div `flex-1 overflow-y-auto` (Pitfall 7): en el JSX, el bloque del strip aparece DESPUÉS del cierre del messages-area y ANTES del `{error &&` display
    - `git diff` de chat-pane.tsx NO modifica las líneas del scan parent-level (82-125) ni handleChatImageUpload (135-192)
    - `npx tsc --noEmit` exit 0
  </acceptance_criteria>
  <done>Chips end-to-end en el builder: derivación useMemo única, strip gated por status, 3 acciones locales + envío de mensaje, starter-chips en empty-state, prop onNewSession conectada. Commit: `feat(template-builder-chips): integracion en chat-pane + empty-state + acciones locales (D-04/D-05/D-06/D-08/D-09)`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| AI-chip output → DOM | labels generados por la IA se renderizan en la UI |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-TBC-05 | Tampering | XSS vía labels de la IA en SuggestedActionChips | mitigate | render como texto plano (React escapa); acceptance criterion: cero dangerouslySetInnerHTML |
| T-TBC-06 | Elevation | chip dispara acción durante streaming (estado inconsistente) | mitigate | doble guard D-06: render condicional `status === 'ready'` + no-op `if (isLoading) return` en handler |
</threat_model>

<verification>
- `npx tsc --noEmit` exit 0
- `npx vitest run src/lib/config-builder/templates/__tests__/` verde (sin regresión del Plan 01)
- Una sola fuente de chips: `git diff` no introduce useState/dispatch/processedPartsRef para chips (Pitfall 5)
- Strip fuera del scroll-container (Pitfall 7) verificado por posición en el JSX
</verification>

<success_criteria>
- Chips visibles y clickeables en `/configuracion/whatsapp/templates/builder` (puerto 3020) con las 4 variantes de comportamiento: mensaje, upload, navegación, nueva sesión
- Empty-state con los 4 starter-chips D-08 enviando los prompts D-09
- Cero regresión en el flujo existente del builder (scan de patches, upload de imagen, submit)
- 2 commits atómicos en español
</success_criteria>

<output>
Al completar, crear `.planning/standalone/template-builder-suggested-actions/02-SUMMARY.md`
</output>
