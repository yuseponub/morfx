# Phase 8 - Learnings

## Bug Crítico: CostCategory undefined (31 ene 2026)

### Síntoma
- Mensajes inbound no llegaban a MORFX
- El webhook retornaba error 500
- Templates se marcaban como REJECTED pero sin mostrar error al usuario

### Causa Raíz
Turbopack (bundler de Next.js 15) tiene un bug donde no elimina correctamente las referencias a tipos importados con `import type { X }` cuando se usan en contextos como `Record<X, ...>`.

El error era:
```
ReferenceError: CostCategory is not defined
```

Archivos afectados:
- `src/lib/whatsapp/cost-utils.ts`
- `src/lib/whatsapp/webhook-handler.ts`
- `src/app/actions/usage.ts`

### Solución
Definir el tipo localmente en cada archivo en lugar de importarlo:

```typescript
// ANTES (fallaba)
import type { CostCategory } from './types'
const COST_RATES: Record<CostCategory, ...> = { ... }

// DESPUÉS (funciona)
type CostCategory = 'marketing' | 'utility' | 'authentication' | 'service'
const COST_RATES: Record<CostCategory, ...> = { ... }
```

### Lección
Con Turbopack, evitar importar tipos que se usan en definiciones de constantes a nivel de módulo. Definirlos localmente o usar el tipo inline.

---

## Bug: Join de profiles en conversations (31 ene 2026)

### Síntoma
```
Could not find a relationship between 'conversations' and 'profiles' in the schema cache
```

Las conversaciones no cargaban en la UI.

### Causa
El query de Supabase intentaba hacer un join con `profiles` usando un FK hint que no existía:
```typescript
assignee:profiles!conversations_assigned_to_fkey(full_name, email)
```

### Solución
Remover el join de profiles temporalmente. El campo `assigned_name` se setea a `null`.

```typescript
// Se removió esta línea del select:
// assignee:profiles!conversations_assigned_to_fkey(full_name, email)
```

### TODO
Crear la relación FK correctamente en una migración futura si se necesita mostrar el nombre del agente asignado.

---

## Bug: Templates no mostraban error de 360dialog (31 ene 2026)

### Síntoma
Al crear un template, si fallaba el envío a 360dialog, el usuario veía "Template creado" pero el template quedaba como REJECTED sin explicación.

### Causa
La función `createTemplate` siempre retornaba `{ success: true }` incluso cuando fallaba el catch de la API:

```typescript
} catch (apiError) {
  // Se actualizaba DB pero...
  await supabase.update({ status: 'REJECTED', ... })
}
// ...siempre retornaba éxito
return { success: true, data: template }
```

### Solución
Retornar el error al frontend cuando falla la API:

```typescript
} catch (apiError) {
  const errorMessage = apiError instanceof Error ? apiError.message : '...'
  await supabase.update({ status: 'REJECTED', rejected_reason: errorMessage })
  return { error: `Error de 360dialog: ${errorMessage}` }
}
```

---

## Debugging de Webhooks - Checklist

1. **Verificar que ngrok esté corriendo:** `ps aux | grep ngrok`
2. **Verificar URL de ngrok:** `curl http://127.0.0.1:4040/api/tunnels`
3. **Verificar config en 360dialog:**
   ```bash
   curl -s "https://waba-v2.360dialog.io/v1/configs/webhook" -H "D360-API-KEY: $KEY"
   ```
4. **Re-registrar webhook si es necesario:**
   ```bash
   curl -X POST "https://waba-v2.360dialog.io/v1/configs/webhook" \
     -H "D360-API-KEY: $KEY" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://xxx.ngrok-free.dev/api/webhooks/whatsapp"}'
   ```
5. **Probar webhook manualmente:**
   ```bash
   curl -X POST "https://xxx.ngrok-free.dev/api/webhooks/whatsapp" \
     -H "Content-Type: application/json" \
     -d '{"object":"whatsapp_business_account","entry":[...]}'
   ```
6. **Revisar logs del servidor:** `tail -f /tmp/next.log | grep webhook`

---

## Reglas de Templates de Meta/WhatsApp (31 ene 2026)

### Errores comunes y soluciones:

1. **"Variables can't be at the start or end of the template"**
   - ❌ `{{1}}, tu pedido está listo`
   - ❌ `Tu pedido está en {{3}}.` (punto no es suficiente)
   - ✅ `Hola {{1}}, tu pedido está en {{3}}. Gracias por tu compra.`

2. **"Template name is already used as a sample template"**
   - No usar nombres como `hello_world`, `sample_*`, etc.
   - Usar nombres únicos como `morfx_notificacion`

3. **"Message template language is being deleted"**
   - Esperar 1 minuto después de borrar un template antes de crear uno nuevo con el mismo nombre

4. **INVALID_FORMAT genérico**
   - Puede ser por tildes/acentos - probar sin ellos
   - Puede ser por el header - probar sin header
   - Puede ser por la cuenta - verificar que esté verificada

### Template que funcionó (PENDING en Meta):
```
Nombre: morfx_notificacion
Categoría: UTILITY
Header: (vacío)
Body: Hola, tienes una nueva notificacion de MorfX. Revisa tu cuenta para mas detalles.
```

---

## Tips Generales

- **Siempre reiniciar servidor después de cambios en archivos `'use server'`** - El hot reload no siempre funciona bien
- **Limpiar .next si hay errores de compilación raros:** `rm -rf .next`
- **Los errores de Turbopack con tipos son silenciosos** - Si algo falla sin razón aparente, revisar imports de tipos
- **Sync de templates no es automático** - Usar botón "Sincronizar" o verificar directamente en 360dialog
