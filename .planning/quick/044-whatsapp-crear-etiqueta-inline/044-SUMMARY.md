---
phase: quick-044
plan: 01
subsystem: whatsapp-inbox
tags: [whatsapp, tags, inline-creation, ux, popover]
requires: []
provides:
  - Creacion inline de etiquetas desde el modulo WhatsApp
  - CommandItem "+ Crear nueva etiqueta" en popover de ConversationTagInput (compact y full)
  - Dialog rapido con input de nombre, color picker y vista previa
  - Auto-aplicacion de la etiqueta creada a la conversacion actual
affects: []
tech-stack:
  added: []
  patterns:
    - Reutilizacion de server actions existentes (createTag, addTagToConversation)
    - CommandInput controlado (value + onValueChange) para pre-llenar nombre con el query
key-files:
  created: []
  modified:
    - src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx
decisions:
  - id: q044-d1
    title: Scope de tags creadas desde WhatsApp
    choice: applies_to='whatsapp' (no contamina filtros de CRM/Pedidos)
  - id: q044-d2
    title: UX tras crear
    choice: Auto-aplicar la nueva tag a la conversacion y refrescar availableTags (sin reload de pagina)
  - id: q044-d3
    title: Pre-llenar nombre con query del CommandInput
    choice: Si el usuario tipeo texto en el buscador y no encontro match, ese texto pasa al Dialog como nombre inicial
  - id: q044-d4
    title: Reutilizar TAG_COLORS / getContrastColor
    choice: Mismo color picker visual que /crm/contactos TagManager, mantiene consistencia de paleta
metrics:
  duration: ~15min
  completed: 2026-04-20
---

# Quick 044 — Crear etiqueta inline desde WhatsApp

## Que se hizo

Agregar capacidad de crear nuevas etiquetas directamente desde el popover "Agregar etiqueta" del chat de WhatsApp, sin tener que navegar a `/crm/contactos` ni a `/settings/tags`.

## Flujo UX

1. Usuario abre el popover de etiquetas en una conversacion (`ConversationTagInput`, compact o full mode).
2. Al final del `CommandList` aparece un nuevo `CommandItem`:
   - Si no hay busqueda activa: `+ Crear nueva etiqueta`
   - Si el usuario tipeo algo en el buscador: `+ Crear "nombre_tipeado"` (pre-llena el Dialog)
3. Click → se cierra el Popover y se abre un `Dialog` con:
   - Input de nombre (autoFocus, maxLength 50)
   - Swatches de `TAG_COLORS` (mismos colores que TagManager de CRM)
   - Vista previa del badge con `getContrastColor`
   - Footer: Cancelar / Crear
4. Submit → `createTag(FormData)` con `applies_to='whatsapp'` → si OK, `addTagToConversation(conversationId, data.id)` → `refreshTags()` → `onTagsChange?.()` → cierra Dialog con toast de exito.
5. Errores (nombre duplicado, sin workspace, etc.) muestran `toast.error` y dejan el Dialog abierto para corregir.

## Cambios tecnicos

**Archivo unico modificado:** `src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx`

- Import de `Dialog*`, `Input`, `Label`, `CommandSeparator`, `createTag`, `TAG_COLORS`, `DEFAULT_TAG_COLOR`, `getContrastColor`, `cn`.
- Nuevo estado local: `createDialogOpen`, `newTagName`, `newTagColor`, `isCreatingTag`, `commandQuery`.
- `refreshTags()` extraida a `useCallback` para llamarla tras crear.
- `CommandInput` ahora es controlado (`value={commandQuery}` + `onValueChange={setCommandQuery}`) para propagar el texto al Dialog.
- Shared `renderCreateItem()` y `createDialog` compartidos entre modo compact y full — ambos modos ahora permiten crear.
- `handleCreateTag` maneja: validacion, `createTag`, auto-apply, refresh, reset, toasts.

## Scope respetado

- No se toca `tag-manager.tsx` ni `/crm/contactos` — solo se integra el server action existente.
- No se agregan campos nuevos a DB ni migraciones.
- No se exponen edicion/borrado desde WhatsApp (eso sigue en el TagManager del CRM para no saturar el popover).
- Scope `applies_to='whatsapp'` por defecto: si el usuario luego la necesita en Pedidos puede cambiarla desde el TagManager del CRM.

## Verificacion

- `npx tsc --noEmit` — sin errores nuevos en el archivo modificado (errores de tests pre-existentes de `vitest` no relacionados).
- grep de must_haves confirma presencia de: `Crear nueva etiqueta`, `applies_to='whatsapp'`, `createTag(`, `addTagToConversation(`.

## Prueba manual pendiente (usuario)

1. Abrir una conversacion en `/whatsapp` con contacto vinculado.
2. Click en el boton "+" de etiquetas (compact) o "Agregar etiqueta" (full).
3. Tipear un nombre que no exista → debe aparecer `+ Crear "nombre"`.
4. Click → Dialog abre con nombre pre-llenado.
5. Escoger color, click "Crear".
6. Verificar: toast "Etiqueta creada y aplicada", badge aparece en la conversacion, popover refrescado.
7. Reabrir popover con una conversacion sin query tipeado → debe aparecer `+ Crear nueva etiqueta` al final.
