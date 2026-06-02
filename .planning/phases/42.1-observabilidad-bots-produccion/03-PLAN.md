---
phase: 42.1-observabilidad-bots-produccion
plan: 03
type: execute
wave: 2
depends_on: [02]
files_modified:
  - src/lib/observability/fetch-wrapper.ts
  - src/lib/supabase/admin.ts
autonomous: true

must_haves:
  truths:
    - "Existe makeObservableFetch(originalFetch, kind) que wrappea fetch y captura queries cuando hay collector activo"
    - "createAdminClient() retorna cliente instrumentado (usa makeObservableFetch)"
    - "createRawAdminClient() existe y retorna cliente NO instrumentado (anti-recursion)"
    - "Cuando feature flag OFF y no hay collector en ALS, createAdminClient() se comporta EXACTAMENTE como antes (zero overhead, zero captura)"
    - "El parser de URLs PostgREST extrae tabla, operacion, filtros y columnas correctamente"
    - "Ningun archivo existente se rompe — domain layer sigue funcionando transparentemente"
  artifacts:
    - path: "src/lib/observability/fetch-wrapper.ts"
      provides: "makeObservableFetch factory + parsePostgrestUrl helper"
      contains: "makeObservableFetch"
    - path: "src/lib/supabase/admin.ts"
      provides: "createAdminClient (instrumentado) + createRawAdminClient (raw)"
      contains: "createRawAdminClient"
  key_links:
    - from: "src/lib/supabase/admin.ts"
      to: "src/lib/observability/fetch-wrapper.ts"
      via: "import makeObservableFetch → global.fetch option"
      pattern: "makeObservableFetch\\(fetch, 'supabase'\\)"
---

<objective>
Implementar el wrapper universal de fetch y conectarlo al cliente Supabase admin. Crear tambien `createRawAdminClient()` no instrumentado para evitar recursion infinita cuando el propio collector escribe sus eventos.

Purpose: Captura automatica y transparente de TODAS las queries SQL del pipeline sin tocar domain layer (Decision B del context, Pattern 2 + Pitfall 1 del research).
Output: Cualquier `createAdminClient()` que se ejecute dentro de `runWithCollector()` emitira eventos de query al collector.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-02-SUMMARY.md
@src/lib/supabase/admin.ts
@src/lib/observability/index.ts
@src/lib/observability/collector.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implementar fetch-wrapper.ts con parser PostgREST</name>
  <files>src/lib/observability/fetch-wrapper.ts</files>
  <action>
Crear `src/lib/observability/fetch-wrapper.ts` segun el research (seccion "Code Examples" → "Parse PostgREST URL" y seccion Pattern 2):

1. Tipo `FetchKind = 'supabase' | 'anthropic'`.

2. Funcion `parsePostgrestUrl(url, method, body)` que retorna `{ tableName, operation, filters, columns, requestBody }`:
   - Usa `new URL(url)` — no regex sobre query strings.
   - Pathname match: `/rest/v1/(rpc\/)?([^/?]+)` → detecta RPC vs tabla normal.
   - Operation map: GET→select, POST→insert, PATCH→update, DELETE→delete, rpc→rpc, else→unknown.
   - `filters` es `Record<string, string>` — iterar `searchParams`, separar `select` como `columns`, el resto como filters.
   - `requestBody`: si `body` es string, `JSON.parse` con catch fallback al string crudo; si no, null.

3. Funcion `makeObservableFetch(originalFetch: typeof fetch = fetch, kind: FetchKind): typeof fetch`:
   - Retorna una closure async `(input, init) => Promise<Response>`.
   - PRIMER CHECK (fast path no-op): `const collector = getCollector(); if (!collector) return originalFetch(input, init)` — cero overhead cuando no hay contexto.
   - Medir inicio con `performance.now()`.
   - Extraer url segun tipo: `typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url)`.
   - `try { response = await originalFetch(input, init); duration = performance.now() - start;`
     - Si `kind === 'supabase'`: parse url, llamar `collector.recordQuery(parsed, duration, response.status, rowCountFromContentRange(response), undefined)`. Parsear `Content-Range` header si existe: formato `0-9/100` → rowCount 100.
     - Si `kind === 'anthropic'`: clonar response (`response.clone()`) para leer body sin consumirlo. **OJO:** aqui NO llamamos recordAiCall directo — eso requiere el request body del Anthropic SDK que es JSON. Por ahora dejamos esta rama como STUB que llama `collector.recordEvent('ai_call_raw', ...)` para que Plan 04 la reemplace con la captura completa. Comentar claramente: `// TODO(plan-04): replace with full recordAiCall including prompt version resolution`.
   - `catch (err)`: `collector.recordError({ kind, url, method, error: err, durationMs })` y re-throw.

4. Helper interno `rowCountFromContentRange(response: Response): number | undefined`:
   - Lee header `content-range` (formato PostgREST: `<start>-<end>/<total>`).
   - Si total es `*` retorna undefined; si es numero, lo parsea; si no existe header, undefined.

5. Importar `getCollector` desde `./context` (NO desde `./index` para evitar ciclos).
  </action>
  <verify>
- `npx tsc --noEmit src/lib/observability/fetch-wrapper.ts` compila sin errores
- Unit smoke test manual (scratch): llamar `makeObservableFetch(fetch, 'supabase')(new Request('https://x.supabase.co/rest/v1/users?select=id,name&status=eq.active'))` sin collector activo → retorna response sin tocar collector
- `parsePostgrestUrl('https://x/rest/v1/users?select=id&id=eq.1', 'GET', null)` retorna `{ tableName: 'users', operation: 'select', filters: { id: 'eq.1' }, columns: 'id', requestBody: null }`
  </verify>
  <done>
Fetch wrapper funcional en modo Supabase, stub para Anthropic (Plan 04 lo completa), fast-path no-op cuando no hay collector.
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor admin.ts — createAdminClient instrumentado + createRawAdminClient</name>
  <files>src/lib/supabase/admin.ts</files>
  <action>
Modificar `src/lib/supabase/admin.ts` segun seccion "Pattern 2" y "Pitfall 1" del research:

1. LEER primero el archivo actual para entender sus exports y uso de env vars.

2. Refactor a la siguiente estructura:

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { makeObservableFetch } from '@/lib/observability/fetch-wrapper'

// Internal helper — NEVER instrumented
function createBaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // NO fetch override here
    },
  )
}

/**
 * Admin client CON instrumentation de observabilidad.
 * Cuando no hay collector activo en AsyncLocalStorage, el wrapper hace
 * fast-path al fetch original → zero overhead.
 * Este es el export DEFAULT que usa todo el codigo del repo.
 */
export function createAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: makeObservableFetch(fetch, 'supabase') },
    },
  )
}

/**
 * Admin client SIN instrumentation. USO EXCLUSIVO del modulo de observabilidad
 * internamente (flush, repository, purge cron) para evitar recursion infinita.
 * NO usar desde domain layer, server actions, tool handlers ni webhooks.
 */
export function createRawAdminClient(): SupabaseClient {
  return createBaseClient()
}
```

3. Preservar exactamente los mismos valores de auth options que el original. Si el archivo actual tiene logica adicional (headers custom, db schema), preservarla en ambas variantes.

4. Verificar que ningun otro archivo del repo rompe. Grep por `from '@/lib/supabase/admin'` — los consumidores usan `createAdminClient` con mismo signature, asi que no requieren cambios.

IMPORTANTE: este cambio es load-bearing — toca el path de TODA mutacion del repo. Con feature flag OFF, el comportamiento debe ser identico al actual (fast-path del wrapper).
  </action>
  <verify>
- `npx tsc --noEmit` pasa en todo el repo
- `npm run build` (Next build) pasa sin errores
- `grep -r "createRawAdminClient" src/ | wc -l` → solo 1 match (el export en admin.ts, por ahora)
- Smoke test manual: `OBSERVABILITY_ENABLED` unset, ejecutar un server action random que usa createAdminClient → debe funcionar identico a antes
  </verify>
  <done>
createAdminClient() sigue funcionando para todos los consumidores existentes con overhead cero cuando flag OFF. createRawAdminClient() disponible para uso interno del modulo de observabilidad.
  </done>
</task>

</tasks>

<verification>
- Build de Next 16 pasa (tsc + next build)
- tests existentes del repo pasan
- Modificacion retro-compatible 100% — ningun archivo fuera de src/lib/observability y src/lib/supabase/admin.ts fue tocado
</verification>

<success_criteria>
Cualquier query ejecutada DENTRO de un `runWithCollector(...)` sera capturada automaticamente como ObservabilityQuery. Fuera de ese contexto, cero overhead.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-03-SUMMARY.md` con: diff conceptual de admin.ts, ejemplo de captura, warning sobre createRawAdminClient.
</output>
