# Plan: Fix Contactos Invisibles Post-Migración (P0)

## Resumen
Implementar paginación server-side + búsqueda server-side en el módulo de contactos para eliminar el límite de 1000 filas de PostgREST. Refactorizar ContactSelector a búsqueda async autónoma.

---

## Tarea 1: Nueva `getContactsPage()` server action

**Archivo:** `src/app/actions/contacts.ts`

**Acción:** Agregar nueva función (NO reemplazar getContacts):

```typescript
export async function getContactsPage(params: {
  page?: number
  pageSize?: number
  search?: string
  tagIds?: string[]
}): Promise<{
  contacts: ContactWithTags[]
  total: number
  page: number
  pageSize: number
}>
```

**Lógica:**
1. Parse params con defaults: page=1, pageSize=50
2. Si tagIds.length > 0: query contact_tags para obtener contactIds filtrados
3. Build query base: `.from('contacts').select('*', { count: 'exact' }).eq('workspace_id', workspaceId)`
4. Si search: `.or(name.ilike.%search%,phone.ilike.%search%)`
5. Si tagIds: `.in('id', filteredContactIds)`
6. `.order('updated_at', { ascending: false }).range(offset, offset + pageSize - 1)`
7. Get tags para los contactos retornados (misma lógica actual)
8. Return { contacts, total: count, page, pageSize }

**Criterio:** Query con 20K contactos retorna página correcta con total exacto.

---

## Tarea 2: Actualizar contactos page con searchParams

**Archivo:** `src/app/(dashboard)/crm/contactos/page.tsx`

**Cambios:**
- Aceptar `searchParams: Promise<{ page?: string, q?: string, tags?: string }>`
- Parsear: page (int), search (string), tagIds (split por coma)
- Llamar `getContactsPage({ page, pageSize: 50, search, tagIds })`
- Pasar a ContactsTable: contacts, tags, customFields, total, page, pageSize, currentSearch, currentTagIds

---

## Tarea 3: Refactorizar ContactsTable para server-side

**Archivo:** `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx`

**Nuevos props:**
```typescript
interface ContactsTableProps {
  contacts: ContactWithTags[]
  tags: Tag[]
  customFields: CustomFieldDefinition[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentTagIds: string[]
}
```

**Cambios:**
1. **Search input:** Debounce 300ms → `router.push(?q=term&page=1)` (reset a page 1)
2. **Tag filter:** Al cambiar → `router.push(?tags=id1,id2&page=1)`
3. **Paginación:** Botones Anterior/Siguiente que cambian `?page=N`
4. **Eliminar:** `filteredContacts` useMemo client-side
5. **DataTable:** Pasar `contacts` directo sin searchColumn/searchValue
6. **Info:** "Mostrando X-Y de Z contactos"

---

## Tarea 4: Mejorar `searchContacts()` para ContactSelector

**Archivo:** `src/app/actions/contacts.ts`

**Cambios:**
- Agregar `city` al select: `.select('id, name, phone, city')`
- Cambiar tipo de retorno a incluir city
- Aumentar default limit a 20
- Agregar función `getRecentContacts()` para carga inicial (últimos 20)

---

## Tarea 5: Refactorizar ContactSelector a búsqueda async

**Archivo:** `src/app/(dashboard)/crm/pedidos/components/contact-selector.tsx`

**Cambios:**
1. Eliminar prop `contacts: ContactWithTags[]`
2. Nuevo state: `searchResults`, `loading`, `debounceRef`
3. Al abrir popover: cargar últimos 20 contactos (getRecentContacts)
4. Al escribir: debounce 200ms → `searchContacts({ search, limit: 20 })`
5. Mostrar loading spinner
6. Mantener `onContactCreated` y `defaultPhone`/`defaultName`
7. Tipo de contactos ahora es `{ id, name, phone, city }` (no necesita full ContactWithTags para el selector)
8. `selectedContact` se busca primero en searchResults, si no está hace getContact(id)

---

## Tarea 6: Eliminar getContacts() del flujo de órdenes

**Archivos:**
- `src/app/(dashboard)/crm/pedidos/components/order-form.tsx` — Eliminar prop `contacts`/`initialContacts`
- `src/app/(dashboard)/crm/pedidos/page.tsx` — Eliminar `getContacts()` del Promise.all
- `src/app/(dashboard)/whatsapp/components/create-order-sheet.tsx` — Eliminar `getContacts()` call y state
- `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` — Eliminar `getContacts()` call y state

---

## Tarea 7: Fix `getExistingPhones()`

**Archivo:** `src/app/actions/contacts.ts`

**Cambio:** Paginar internamente para obtener TODOS los phones:
```typescript
// Loop con .range() hasta agotar resultados
// O usar .limit(100000) como fix pragmático con count check
```

---

## Tarea 8: Verificar + push

- Build sin errores TypeScript
- Verificar que página de contactos carga con paginación
- Verificar que búsqueda encuentra contactos por nombre y teléfono
- Verificar que filtro por tags funciona
- Verificar que ContactSelector busca async
- Verificar que CSV import detecta duplicados correctamente
- Push a Vercel

---

## Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `src/app/actions/contacts.ts` | MODIFICADO: +getContactsPage, +getRecentContacts, mejorar searchContacts, fix getExistingPhones |
| `src/app/(dashboard)/crm/contactos/page.tsx` | MODIFICADO: searchParams + getContactsPage |
| `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx` | MODIFICADO: server-side search/filter/pagination |
| `src/app/(dashboard)/crm/pedidos/components/contact-selector.tsx` | MODIFICADO: async search autónomo |
| `src/app/(dashboard)/crm/pedidos/components/order-form.tsx` | MODIFICADO: eliminar contacts prop |
| `src/app/(dashboard)/crm/pedidos/page.tsx` | MODIFICADO: eliminar getContacts() |
| `src/app/(dashboard)/whatsapp/components/create-order-sheet.tsx` | MODIFICADO: eliminar getContacts() |
| `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` | MODIFICADO: eliminar getContacts() |

## Archivos NO Modificados

- `src/components/ui/data-table.tsx` — Se usa tal cual, paginación es externa
- `src/lib/domain/contacts.ts` — No hay cambios de mutación
- `src/lib/agents/production/webhook-processor.ts` — P1, no P0
