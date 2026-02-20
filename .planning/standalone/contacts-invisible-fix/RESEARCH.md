# Research: Contactos Invisibles Post-Migración (P0)

## Problema Confirmado

### Bug 1: Límite 1000 filas PostgREST
- `getContacts()` en `contacts.ts:74-77` no tiene `.limit()` ni `.range()`
- PostgREST default = 1000 filas
- Con 20,009 contactos migrados, 19,009 son INVISIBLES
- Búsqueda es client-side (TanStack Table `getFilteredRowModel`) sobre esos 1000

### Bug 2: Contactos fantasma por webhook
- `webhook-processor.ts:329-377` `autoCreateContact()` recrea contactos eliminados
- UNIQUE constraint impide creación manual → "Ya existe" pero invisible
- Esto es P1 — no se aborda en este fix

## Consumidores Afectados

| Archivo | Llamada | Impacto |
|---------|---------|---------|
| `crm/contactos/page.tsx:8` | `getContacts()` | Lista principal |
| `crm/pedidos/page.tsx:20` | `getContacts()` | Selector de contacto en órdenes |
| `whatsapp/create-order-sheet.tsx:68` | `getContacts()` | Crear orden desde WA |
| `whatsapp/view-order-sheet.tsx:99` | `getContacts()` | Ver/editar orden desde WA |
| `contacts.ts:616-619` | `getExistingPhones()` | CSV import dedup |

## Patrones Existentes en el Codebase

### Paginación Server-Side (offset-based)
**Precedente: `getExecutionHistory()` en `automations.ts:443-523`**
- Pattern: `offset = (page - 1) * pageSize` → `.range(offset, offset + pageSize - 1)`
- Returns: `{ data, total, page, pageSize }`
- UI: `execution-history.tsx:250-275` con botones Anterior/Siguiente
- URL params: `automatizaciones/historial?page=2&status=failed`

**Precedente: `contactList` tool handler en `tools/handlers/crm/index.ts:450-585`**
- Ya implementa paginación de contactos con `.range()` + count
- Filtra por tags server-side (resolve tagNames → tagIds → contact_tags → filter)

### Búsqueda Server-Side
**`searchContacts()` en `contacts.ts:126-162`**
- Ya existe, usa `.or(name.ilike, phone.ilike)`
- Retorna solo `{ id, name, phone }` — falta city para display en ContactSelector
- Limit default: 10

### URL SearchParams en Pages
**Precedente: `automatizaciones/historial/page.tsx:4-16`**
- `searchParams: Promise<{ page?, status?, automationId? }>`
- Parsea y pasa a server action

### Debounce Pattern
**Precedente: `quick-reply-autocomplete.tsx:41,89-95`**
- `useRef<NodeJS.Timeout>` + clearTimeout + setTimeout(150ms)

### DataTable
- NO tiene `getPaginationRowModel`
- Solo: `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`
- Paginación se maneja FUERA del componente (como en execution-history)

## Decisiones de Diseño

### Paginación: offset-based con URL params
- Consistente con execution-history
- Back/forward del browser funciona
- URLs compartibles

### Búsqueda: server-side con debounce en URL params
- Debounce 300ms en el input → router.push con ?q=term
- Server action filtra con ilike
- No más getFilteredRowModel client-side

### Tag filter: server-side
- tagIds en URL como ?tags=id1,id2
- Server query: contact_tags.tag_id in tagIds → filter contacts

### ContactSelector: async search autónomo
- Eliminar prop `contacts`
- Usar `searchContacts()` con debounce
- Componente se auto-gestiona
