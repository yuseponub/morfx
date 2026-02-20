# FIXES FASE 1 — Hotfixes Pre-Migración

**Contexto:** Auditoría pre-migración encontró 13 riesgos. Estos 5 son los urgentes.
**Regla:** Son hotfixes de producción aprobados explícitamente por el usuario.
**Al terminar:** Un solo commit, push a main, verificar con `npx tsc --noEmit`.

---

## FIX R-1: Eliminar ruta temporal sin autenticación

**Archivo:** `src/app/api/temp-send-agendados/route.ts`
**Acción:** ELIMINAR EL ARCHIVO COMPLETO (322 líneas)
**Razón:** Endpoint público sin auth que envía WhatsApp masivo. Dice "DELETE THIS FILE after use".

```bash
git rm src/app/api/temp-send-agendados/route.ts
```

---

## FIX R-3: Variables {{}} no resueltas → reemplazar con string vacío

**Archivo:** `src/lib/automations/variable-resolver.ts`
**Líneas:** 62-68
**Problema:** Si `{{unknown.field}}` no existe en contexto, deja el placeholder literal en el texto.
**Fix:** Reemplazar placeholder con string vacío y loguear warning.

**ANTES (líneas 60-68):**
```typescript
      // Distinguish between "path exists but value is null" and "path doesn't exist"
      // For both cases where the path resolves to null/undefined, replace with empty string
      // Only leave {{path}} unchanged if the top-level key doesn't exist at all
      const topKey = path.split('.')[0]
      if (topKey in context) {
        return ''
      }
      // Path not found at all: leave original placeholder
      return `{{${rawPath}}}`
```

**DESPUÉS:**
```typescript
      // Any unresolved path (null, undefined, or missing key) → empty string
      // Never leave {{placeholder}} literals in output — they confuse WhatsApp/webhooks
      const topKey = path.split('.')[0]
      if (!(topKey in context)) {
        console.warn(`[variable-resolver] Unresolved variable: {{${path}}} — top-level key "${topKey}" not in context`)
      }
      return ''
```

---

## FIX R-5: tags.ts — agregar workspace_id a 4 queries de contacto

**Archivo:** `src/lib/domain/tags.ts`
**Problema:** 4 queries de contacto no filtran por workspace_id (lectura cross-workspace posible).

**NOTA:** Hay que leer el archivo primero para encontrar las líneas exactas. Buscar TODOS los `.from('contacts').select(` que NO tengan `.eq('workspace_id', ...)`. Agregar `.eq('workspace_id', ctx.workspaceId)` a cada uno.

**Patrón a buscar (4 ocurrencias):**
```typescript
const { data: contact } = await supabase
  .from('contacts')
  .select('name, phone')
  .eq('id', ALGO)
  .single()
```

**Agregar ANTES del `.single()`:**
```typescript
  .eq('workspace_id', ctx.workspaceId)
```

Las 4 ocurrencias están en:
1. Dentro de `assignTag` — lectura de contacto para contexto de trigger (entityType === 'contact')
2. Dentro de `assignTag` — lectura de contacto de la orden (entityType === 'order', busca contact del order)
3. Dentro de `removeTag` — lectura de contacto para contexto de trigger (entityType === 'contact')
4. Dentro de `removeTag` — lectura de contacto de la orden (entityType === 'order')

---

## FIX R-6: notes.ts — agregar workspace_id a 2 UPDATE operations

**Archivo:** `src/lib/domain/notes.ts`
**Problema:** UPDATE de notas no filtra workspace_id — modificación cross-workspace posible.

**NOTA:** Leer el archivo. Buscar `.from('contact_notes').update(` y `.from('task_notes').update(` que NO tengan `.eq('workspace_id', ...)`.

**Patrón a buscar (2 ocurrencias):**
```typescript
const { error: updateError } = await supabase
  .from('contact_notes')  // o 'task_notes'
  .update({ content: trimmed })
  .eq('id', params.noteId)
```

**Agregar DESPUÉS del `.eq('id', ...)`:**
```typescript
  .eq('workspace_id', ctx.workspaceId)
```

---

## FIX R-7: messages.ts — éxito parcial debe retornar success: false

**Archivo:** `src/lib/domain/messages.ts`
**Problema:** Si el mensaje se envía por API (cobrado) pero el INSERT en DB falla, retorna `success: true`. Debería ser `success: false` para que el caller sepa que hubo problema.

**Buscar 3 ocurrencias** del patrón (en sendTextMessage, sendMediaMessage, sendTemplateMessage):
```typescript
return {
  success: true,
  data: { messageId: '', waMessageId: wamid },
  error: 'Mensaje enviado pero no se pudo guardar en DB',
}
```

**Cambiar `success: true` → `success: false` en las 3 ocurrencias.**

---

## VERIFICACIÓN

Después de los 5 fixes:
1. `npx tsc --noEmit` — 0 errores
2. Un solo commit: `fix(audit): 5 hotfixes pre-migración (R-1,R-3,R-5,R-6,R-7)`
3. `git push origin main`

---

## INSTRUCCIÓN POST-COMPACT

Decirle a Claude:
> Lee `.planning/audit/FIXES-PHASE1.md` y ejecuta los 5 fixes exactamente como están documentados. Son hotfixes de producción aprobados. No necesitan plan GSD.
