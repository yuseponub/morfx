---
phase: somnio-v4-crm-subloop
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/domain/contacts.ts
  - src/lib/domain/__tests__/resolve-or-create-contact.test.ts
requirements: [D-24]
autonomous: true
must_haves:
  truths:
    - "Existe resolveOrCreateContact(ctx, params) en domain que compone searchContacts(phone)->createContact"
    - "Si el contacto existe por telefono, lo retorna SIN crear duplicado"
    - "Si no existe, lo crea via createContact (mismo path Regla 3, createAdminClient solo en domain)"
    - "Retorna un contactId UUID utilizable por crm-mutation-tools.createOrder"
  artifacts:
    - path: "src/lib/domain/contacts.ts"
      provides: "export async function resolveOrCreateContact"
      contains: "export async function resolveOrCreateContact"
    - path: "src/lib/domain/__tests__/resolve-or-create-contact.test.ts"
      provides: "tests resolve-existing + create-new + invalid-phone"
      contains: "resolveOrCreateContact"
  key_links:
    - from: "resolveOrCreateContact"
      to: "searchContacts + createContact"
      via: "compose find-then-create"
      pattern: "searchContacts|createContact"
---

<objective>
Resolver el BLOCKER de Pitfall 2 / D-24: `crm-mutation-tools.createOrder` requiere `contactId`
(UUID) + `pipelineId` (UUID), pero el agente v4 trabaja con telefono/nombre (strings). Hoy el
runner resuelve el contacto via `OrderCreator.findOrCreateContact` (tool-handler path) que D-06
ELIMINA. NO existe un `resolveOrCreateContact` en el domain layer.

Este plan crea `resolveOrCreateContact(ctx, params)` en `src/lib/domain/contacts.ts` componiendo
las funciones domain existentes: `searchContacts(phone)` (encuentra) -> si no hay match,
`createContact(...)` (crea). Ambas ya viven en domain (Regla-3-clean: `createAdminClient` solo en
domain). El resultado da el `contactId` UUID que el sub-loop (Plan 05) pasa a `createOrder`.

Purpose: cerrar el camino critico de createOrder sin replicar OrderCreator (que D-06 borra). Output:
un helper domain reutilizable, find-or-create idempotente por telefono.

NOTA Regla 6: este es un AGREGADO al domain compartido (nueva funcion exportada, 0 modificaciones a
funciones existentes). El blast radius es nulo: ningun agente lo consume hasta el Plan 05/06. Las
funciones que compone (searchContacts/createContact) NO se modifican. Es aditivo, Regla-6-safe.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-crm-subloop/CONTEXT.md
@.planning/standalone/somnio-v4-crm-subloop/RESEARCH.md

<interfaces>
<!-- Contratos verbatim de domain/contacts.ts. NO explorar. -->

`createContact(ctx: DomainContext, params: CreateContactParams): Promise<DomainResult<CreateContactResult>>`
(contacts.ts:95). Normaliza phone via normalizePhone; inserta { workspace_id (de ctx), name, phone,
email, address, city, department }; retorna { id, name, phone, email, city, department, address }.
Retorna `{ success:false, error:'Numero de telefono invalido' }` si phone no normaliza.

`searchContacts(ctx: DomainContext, params: SearchContactsParams): Promise<DomainResult<ContactListItem[]>>`
(contacts.ts:539). params.query (string); busca por phone/email/name ILIKE; retorna lista
{ id, name, phone, email, created_at }. Filtra archived por defecto.

DomainContext (domain/types): { workspaceId, source }. DomainResult<T> = { success:true, data:T } |
{ success:false, error:string }.

normalizePhone existe en domain (usada por createContact) — para comparar el match exacto por telefono.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: resolveOrCreateContact en domain/contacts.ts + tests</name>
  <files>src/lib/domain/contacts.ts, src/lib/domain/__tests__/resolve-or-create-contact.test.ts</files>
  <read_first>
    src/lib/domain/contacts.ts (createContact :95-..., searchContacts :539-..., normalizePhone)
    src/lib/domain/types.ts (DomainContext, DomainResult)
    RESEARCH.md Pitfall 2 + Open Question 1 (D-24)
  </read_first>
  <behavior>
    - Test "resolve existing": searchContacts retorna un contacto cuyo phone normalizado === phone de entrada -> resolveOrCreateContact retorna ese id SIN llamar createContact (assert createContact spy NO llamado).
    - Test "create new": searchContacts retorna [] (o ningun match exacto por telefono) -> resolveOrCreateContact llama createContact y retorna el nuevo id.
    - Test "invalid phone": phone que no normaliza -> retorna { success:false, error } (propaga el error de createContact). NO crasha.
    - Test "match por telefono exacto, no por nombre/email parcial": searchContacts puede retornar
      contactos por ILIKE de nombre/email; resolveOrCreateContact SOLO acepta un match cuyo phone
      normalizado coincide exactamente (evita reusar un contacto equivocado).
  </behavior>
  <action>
    En `src/lib/domain/contacts.ts` agregar (al final, aditivo):
    `export async function resolveOrCreateContact(ctx: DomainContext, params: { phone: string; name?:
    string; email?: string; address?: string; city?: string; department?: string }): Promise<
    DomainResult<{ contactId: string; created: boolean }>>`:
    1. Normalizar el phone de entrada con `normalizePhone(params.phone)`; si null -> retornar
       `{ success:false, error:'Numero de telefono invalido' }`.
    2. Llamar `searchContacts(ctx, { query: normalizedPhone, limit: 10 })`. Si success y la lista tiene
       un contacto cuyo `normalizePhone(c.phone) === normalizedPhone` (match EXACTO por telefono, NO
       parcial) -> retornar `{ success:true, data:{ contactId: c.id, created:false } }`.
    3. Si no hay match exacto -> llamar `createContact(ctx, { name: params.name ?? params.phone, phone:
       params.phone, email: params.email, address: params.address, city: params.city, department:
       params.department })`. Si success -> `{ success:true, data:{ contactId: result.data.id, created:true } }`.
       Si falla -> propagar `{ success:false, error: result.error }`.
    Comentar D-24 + Pitfall 2: este helper reemplaza OrderCreator.findOrCreateContact (deleted by D-06)
    con un path 100% domain-layer (Regla 3). Match exacto por telefono evita reusar contacto erroneo.
    NO modificar createContact ni searchContacts.

    CREAR `src/lib/domain/__tests__/resolve-or-create-contact.test.ts` con los 4 tests del behavior.
    Mockear createContact/searchContacts (o el supabase admin client) segun el patron de tests
    existentes en `src/lib/domain/__tests__/` (leer un test vecino para el patron de mock de Supabase).
  </action>
  <acceptance_criteria>
    - `grep -n "export async function resolveOrCreateContact" src/lib/domain/contacts.ts` retorna 1 match.
    - `grep -n "searchContacts\|createContact" src/lib/domain/contacts.ts` muestra que resolveOrCreateContact los invoca (composicion, no reimplementacion del insert).
    - `grep -n "normalizePhone" src/lib/domain/contacts.ts` confirma el match exacto por telefono dentro de resolveOrCreateContact.
    - `npx vitest run src/lib/domain/__tests__/resolve-or-create-contact.test.ts` -> 4 tests verdes.
    - `git diff src/lib/domain/contacts.ts | grep -E "^-" | grep -vE "^---" | grep -E "createContact|searchContacts"` retorna VACIO (NO se borraron/modificaron lineas de las funciones existentes — cambio puramente aditivo).
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/domain/__tests__/resolve-or-create-contact.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>resolveOrCreateContact compone searchContacts+createContact; match exacto por telefono; create solo si no existe; invalid phone manejado; 4 tests verdes; cambio aditivo (funciones existentes intactas).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| LLM/orchestrator phone string → domain contact | input no confiable, debe normalizarse/validarse |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cnt-01 | Tampering (contacto duplicado por telefono) | resolveOrCreateContact | mitigate | match EXACTO por normalizePhone antes de crear (no reusa por nombre/email parcial) |
| T-cnt-02 | Information Disclosure (cross-workspace) | searchContacts/createContact | mitigate | ctx.workspaceId filtra ambas funciones domain (Regla 3) |
| T-cnt-03 | Validation (phone invalido) | normalizePhone | mitigate | fail con error string antes de tocar DB |
</threat_model>

<verification>
- `npx vitest run src/lib/domain/__tests__/resolve-or-create-contact.test.ts` verde.
- Greps de acceptance pasan (aditivo, composicion, match exacto).
- `npx tsc --noEmit` sin errores nuevos en domain/contacts.
</verification>

<success_criteria>
resolveOrCreateContact existe en domain, find-or-create idempotente por telefono exacto, Regla-3-clean
(createAdminClient solo en createContact existente), aditivo (Regla-6-safe), tests verdes.
</success_criteria>

<output>
Crear `.planning/standalone/somnio-v4-crm-subloop/03-SUMMARY.md`.
Commit: `feat(v4-crm-subloop): resolveOrCreateContact domain helper (D-24) — find-or-create por telefono`
</output>
