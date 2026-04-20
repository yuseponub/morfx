---
phase: quick-044
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx
autonomous: true

must_haves:
  truths:
    - "Popover de ConversationTagInput incluye un CommandItem '+ Crear nueva etiqueta' al final (compact y full mode)"
    - "Al hacer click abre un Dialog con input de nombre + color picker + boton Crear"
    - "createTag se llama con applies_to='whatsapp' por defecto"
    - "Tras crear la tag, se auto-aplica a la conversacion via addTagToConversation"
    - "La lista availableTags se refresca tras crear (sin reload de pagina)"
    - "El flujo usa TAG_COLORS y getContrastColor de @/lib/data/tag-colors (no hardcodear)"
    - "Manejo de errores: toast.error muestra mensaje de createTag si falla (incluye duplicado)"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx"
      provides: "Integracion inline de creacion de tags desde el popover"
      contains: "Crear nueva etiqueta"
  key_links:
    - from: "ConversationTagInput popover"
      to: "createTag (src/app/actions/tags.ts)"
      via: "FormData con name, color, applies_to='whatsapp'"
      pattern: "createTag"
    - from: "ConversationTagInput tras crear"
      to: "addTagToConversation (src/app/actions/conversations.ts)"
      via: "conversationId + nueva tag.id"
      pattern: "addTagToConversation"
---

<objective>
Permitir crear etiquetas nuevas desde el popover del modulo de WhatsApp sin navegar a /crm/contactos.

Flujo UX:
1. Usuario abre popover "Agregar etiqueta" en una conversacion
2. Al final del CommandList aparece un item "+ Crear nueva etiqueta"
3. Click abre un Dialog minimalista: input de nombre + swatches de TAG_COLORS + boton "Crear"
4. Al crear: tag se guarda (applies_to='whatsapp') y se aplica automaticamente a la conversacion
5. El popover se refresca con la nueva tag visible

Scope de la tag creada: 'whatsapp' (aparece en WhatsApp; no contamina el filtro de Pedidos).

Reutiliza los server actions existentes (createTag, addTagToConversation, getTagsForScope) — no se crea domain layer nuevo.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx
@src/app/actions/tags.ts
@src/app/actions/conversations.ts
@src/lib/data/tag-colors.ts
@src/app/(dashboard)/crm/contactos/components/tag-manager.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Integrar creacion inline de tag en ConversationTagInput</name>
  <files>
    src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx
  </files>
  <action>
1. Agregar imports: Dialog components (DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription) y createTag desde @/app/actions/tags, TAG_COLORS, DEFAULT_TAG_COLOR, getContrastColor desde @/lib/data/tag-colors, Input desde @/components/ui/input.

2. Extraer logica compartida (refetch de availableTags) a una funcion refreshTags dentro del componente para poder llamarla despues de crear.

3. Agregar estado:
   - createDialogOpen: boolean
   - newTagName: string
   - newTagColor: string (default DEFAULT_TAG_COLOR)
   - isCreatingTag: boolean
   - pendingQuery: string (para pre-llenar el nombre con lo que el usuario tipeo en CommandInput)

4. Agregar CommandItem "+ Crear nueva etiqueta" al final del CommandGroup en AMBOS Popover (compact y full mode). Al seleccionar:
   - cerrar el Popover (setOpen(false))
   - pre-llenar newTagName con el query actual del CommandInput si existe
   - abrir createDialogOpen

5. Agregar componente Dialog (al final del JSX, antes del cierre del Popover externo o como hermano):
   - Titulo: "Crear nueva etiqueta"
   - Descripcion: "Se aplicara automaticamente a esta conversacion."
   - Input de nombre (autoFocus)
   - Grid de swatches: TAG_COLORS como circulos clickeables, con anillo cuando esta seleccionado
   - Vista previa del badge con color actual usando getContrastColor
   - Footer: boton Cancelar + boton Crear (disabled si !newTagName.trim() || isCreatingTag)

6. handleCreateTag: construir FormData con name, color, applies_to='whatsapp'; llamar createTag; si success: llamar addTagToConversation(conversationId, data.id); llamar refreshTags; onTagsChange?.(); cerrar dialog; resetear estado; toast.success. Si error: toast.error con result.error.

7. Mantener el comportamiento existente del popover (filtros, handleAddTag, handleRemoveTag) intacto.
  </action>
  <verify>
    - grep "Crear nueva etiqueta" en el archivo → aparece al menos una vez
    - grep "applies_to.*whatsapp" → presente
    - grep "createTag(" → presente
    - grep "addTagToConversation(" → sigue presente (no roto)
    - Build: npx tsc --noEmit no arroja errores en el archivo
  </verify>
  <done>
    Archivo modificado con la nueva UI y la logica de creacion. No otros archivos tocados.
  </done>
</task>

</tasks>
