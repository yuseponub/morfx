# Phase 04: Contacts Base - Learnings

**Fecha:** 2026-01-29
**Duración:** ~35 minutos (3 plans: 11 + 17 + 7 min)
**Plans ejecutados:** 3

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| Zod v4 API change | `.errors` no existe en ZodError, ahora es `.issues` | Cambiar a `error.issues` y formatear manualmente | Verificar versión de Zod y API docs antes de usar |
| shadcn Popover missing | Popover no estaba instalado pero era dependencia de CityCombobox | `npx shadcn@latest add popover command` | Siempre verificar dependencias de shadcn antes de crear componentes |
| TanStack Table infinite re-render | Columns array creado inline en render | Crear columns fuera del componente o usar useMemo | NUNCA definir columns inline, siempre memoizar |
| Phone hydration mismatch | Formato diferente server vs client | Formatear solo en client (useMemo) | Phone display siempre client-side only |

### Bugs encontrados en verificación (2026-01-29)

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| **RLS policy violation al crear contacto** | Políticas usaban `auth.jwt() -> 'app_metadata' ->> 'workspace_id'` pero JWT no tiene workspace_id ahí. App usa cookie para workspace. | Cambiar todas las políticas a usar `is_workspace_member(workspace_id)` de Phase 2 | SIEMPRE usar `is_workspace_member()` para RLS, NUNCA JWT app_metadata |
| **Server Actions sin workspace_id** | `contacts.ts` y `tags.ts` no leían workspace_id de la cookie | Agregar `const cookieStore = await cookies(); const workspaceId = cookieStore.get('morfx_workspace')?.value` | Server Actions que insertan datos SIEMPRE deben obtener workspace_id de cookie |
| **CityCombobox requería click** | Usaba Popover+Button como trigger, Tab no permitía escribir directo | Reescribir como Input nativo con dropdown absoluto | Inputs de búsqueda deben ser `<input>` nativo, no Button+Popover |
| **TagFilter oculto sin tags** | Condición `tags.length > 0 &&` ocultaba todo incluyendo botón "Gestionar" | Quitar condición, mostrar siempre el componente | Componentes con acciones de creación deben mostrarse siempre |
| **Nombre no clickeable en tabla** | Columna name solo mostraba texto, sin onClick | Agregar `<button onClick={() => onViewDetail(row.original)}>` | Columnas principales deben ser clickeables para navegación |
| **TagInput mensaje confuso** | "No hay etiquetas disponibles" sin indicar que puede crear | Cambiar a "Escribe para crear una etiqueta" | Mensajes vacíos deben indicar acción posible |
| **TagManager muy apretado** | Colores w-6 h-6 con gap-1.5, difícil seleccionar | Aumentar a w-8 h-8 con gap-3, agregar ring en seleccionado | Color pickers necesitan tamaño mínimo 32px y espaciado generoso |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| createColumns factory function | Static columns array | Necesitábamos inyectar callbacks (onEdit, onDelete) sin re-renders |
| Client-side tag filtering | Server-side con revalidate | MVP con <1000 contactos, evita latencia, más responsive |
| CityCombobox shouldFilter={false} | Default shouldFilter | Queremos limitar a 50 resultados, filtrado manual más eficiente |
| Popover para TagInput (no Emblor) | Emblor library | Emblor complejo de integrar, popover con Command más simple y consistente con shadcn |
| Optimistic updates en TagInput | Wait for server response | UX más fluida, revert on error con toast |
| useMemo para filteredContacts | useEffect + state | useMemo es más simple, recalcula solo cuando dependencies cambian |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| ContactForm | Server Action | FormData types no matching | Crear schema Zod que matchea exactamente FormData structure |
| DataTable | columns.tsx | Type mismatch ContactWithTags | Definir types explícitamente en database.ts |
| TagFilter | ContactsTable | State sync para filtering | Lift state up a ContactsTable, pass down via props |
| PhoneInput | Form validation | Debounce causaba validation delay | isValidating state separado de isValid |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Crear database types primero, luego Server Actions, luego UI
- Schema-first approach (Zod schemas definidos antes de forms)
- Componentes pequeños y enfocados (TagBadge, PhoneInput, CityCombobox)
- Server Components para data fetching, Client Components solo para interactividad
- useMemo para filtered data en tablas grandes

### Lo que NO hacer
- NO definir columns array inline en componente (causa infinite re-render)
- NO formatear phone numbers en Server Components (hydration mismatch)
- NO usar Emblor si no es necesario (shadcn Command es suficiente para autocomplete)
- NO olvidar agregar dependencias shadcn (command, popover, sheet) antes de usarlas
- NO asumir Zod API - verificar versión actual
- **CRÍTICO: NO usar JWT app_metadata para workspace_id en RLS** - El workspace se guarda en cookie, no en JWT
- NO ocultar componentes con acciones de creación cuando la lista está vacía

### Patrones a seguir
- Factory pattern para columns: `createColumns({ onEdit, onDelete })`
- Controlled inputs con debounce para validation-heavy fields
- Optimistic updates con revert pattern: `setTags([...]), try { await action } catch { setTags(prev) }`
- Tag colors: always use `getContrastColor()` para text legibility
- Server Action return format: `{ success: true, data } | { error: { field: ['message'] } }`
- **Workspace ID pattern (CRÍTICO):**
  ```typescript
  // En Server Actions que insertan datos:
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }
  // Luego pasar workspace_id explícitamente en el insert
  ```
- **RLS policy pattern:** Usar `is_workspace_member(workspace_id)` de Phase 2, NO JWT app_metadata

### Comandos útiles
```bash
# Verificar componentes shadcn instalados
ls src/components/ui/

# Agregar componente shadcn faltante
npx shadcn@latest add [component]

# Test phone normalization
node -e "console.log(require('./src/lib/utils/phone').normalizePhone('3001234567'))"

# Verificar TypeScript antes de commit
pnpm tsc --noEmit

# Ver contactos en tabla (requiere migration aplicada)
pnpm dev
# Navigate to http://localhost:3020/crm/contactos
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Server-side pagination | Media | Phase 5 si >1000 contactos |
| Column visibility persistence | Baja | Phase 10 (settings) |
| Tag scopes (module-specific tags) | Media | Phase 5 |
| Keyboard shortcuts en tabla | Baja | Post-MVP |
| Contact search debounce | Baja | Phase 5 si performance issues |

## Notas para el Módulo

Información específica que un agente de documentación de este módulo necesitaría saber:

- **Phone es el identificador único** - Siempre normalizado a E.164 (+573001234567)
- **Tags son globales por workspace** - Un tag creado se puede usar en contactos, pedidos, WhatsApp
- **Contact es el HUB central** - Conecta WhatsApp conversations y Orders
- **Client-side filtering** - useMemo con selectedTagIds, recalcula solo cuando tags o selection cambia
- **createColumns factory** - Importar y llamar con callbacks, no importar columns directamente
- **ContactWithTags type** - Contact + nested tags array from join
- **Server Actions en src/app/actions/** - contacts.ts (10 functions), tags.ts (5 functions)
- **Migrations pendientes** - Aplicar supabase/migrations/20260129000001_contacts_and_tags.sql

### Archivos clave del módulo
```
src/
├── app/(dashboard)/crm/contactos/
│   ├── page.tsx              # Server Component, fetches data
│   ├── [id]/page.tsx         # Contact detail view
│   └── components/
│       ├── contacts-table.tsx    # TanStack Table wrapper
│       ├── columns.tsx           # createColumns factory
│       ├── contact-form.tsx      # React Hook Form + Zod
│       ├── contact-dialog.tsx    # Modal wrapper
│       ├── tag-filter.tsx        # Multi-tag filter
│       ├── tag-manager.tsx       # Tag CRUD Sheet
│       ├── bulk-actions.tsx      # Selected rows toolbar
│       └── empty-state.tsx       # No contacts CTA
├── components/contacts/
│   ├── phone-input.tsx           # Debounced validation
│   ├── city-combobox.tsx         # Colombian cities autocomplete
│   ├── tag-badge.tsx             # Colored pill with optional remove
│   └── tag-input.tsx             # Add/remove tags with autocomplete
├── app/actions/
│   ├── contacts.ts               # getContacts, createContact, etc.
│   └── tags.ts                   # getTags, createTag, etc.
├── lib/
│   ├── utils/phone.ts            # normalizePhone, formatPhoneDisplay
│   ├── data/colombia-cities.ts   # ~100 cities for autocomplete
│   └── data/tag-colors.ts        # 10 colors + getContrastColor
└── components/ui/
    └── data-table.tsx            # Generic TanStack Table wrapper

supabase/migrations/
└── 20260129000001_contacts_and_tags.sql  # Tables + RLS + triggers
```

---
*Generado al completar Phase 04. Input para entrenamiento de agentes de documentación.*
