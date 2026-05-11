---
phase: shopify-dev-dashboard-oauth
plan: 02
title: Domain layer integrations (Regla 3 — D-10)
wave: 1
depends_on: [1]
files_modified:
  - src/lib/domain/integrations.ts
  - src/lib/domain/index.ts
  - src/lib/shopify/types.ts
autonomous: true
estimated_minutes: 40
requirements_addressed: []
must_haves:
  truths:
    - "Existe `src/lib/domain/integrations.ts` con `upsertShopifyIntegration`, `getShopifyIntegration`, `deleteShopifyIntegration` exportadas"
    - "Cada función acepta `DomainContext` como primer parámetro y retorna `DomainResult<T>`"
    - "Cada query filtra por `ctx.workspaceId` (verificable por grep `eq('workspace_id', ctx.workspaceId)`)"
    - "`upsertShopifyIntegration` preserva `default_pipeline_id`, `default_stage_id`, `enable_fuzzy_matching`, `product_matching`, `auto_sync_orders` del config existente al re-conectar"
    - "El barrel `src/lib/domain/index.ts` re-exporta `./integrations`"
    - "`ShopifyConfig` type opcionalmente incluye `granted_scope?: string` (Open Question 8 de RESEARCH)"
  artifacts:
    - path: "src/lib/domain/integrations.ts"
      provides: "Single source of truth para mutaciones en tabla integrations type='shopify'"
      min_lines: 80
      exports: ["upsertShopifyIntegration", "getShopifyIntegration", "deleteShopifyIntegration", "UpsertShopifyIntegrationParams"]
    - path: "src/lib/domain/index.ts"
      provides: "Barrel export"
      contains: "export * from './integrations'"
    - path: "src/lib/shopify/types.ts"
      provides: "Updated ShopifyConfig with granted_scope optional field"
      contains: "granted_scope?:"
  key_links:
    - from: "src/lib/domain/integrations.ts"
      to: "src/lib/supabase/admin.ts → createAdminClient"
      via: "import { createAdminClient } from '@/lib/supabase/admin'"
      pattern: "createAdminClient\\(\\)"
    - from: "src/lib/domain/integrations.ts"
      to: "src/lib/domain/types.ts → DomainContext + DomainResult"
      via: "import type { DomainContext, DomainResult } from './types'"
      pattern: "DomainContext|DomainResult"
---

<objective>
Crear `src/lib/domain/integrations.ts` como el único lugar donde se mutan filas de `integrations` con `type='shopify'` (Regla 3 CLAUDE.md, D-10). 3 funciones: `upsertShopifyIntegration`, `getShopifyIntegration`, `deleteShopifyIntegration`. Update `ShopifyConfig` type con `granted_scope?: string` opcional. Update barrel.

Purpose: aislar la BD del callback OAuth y del server action delete. Sin esto, el callback estaría obligado a importar `createAdminClient` directo — violación verificable de Regla 3.

Output: Domain layer listo. Plan 03 (oauth.ts) corre en PARALELO con este — son independientes. Plan 05 (callback) y Plan 06 (refactor delete) los consumen en Wave 2.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-dev-dashboard-oauth/CONTEXT.md
@.planning/standalone/shopify-dev-dashboard-oauth/RESEARCH.md
@.planning/standalone/shopify-dev-dashboard-oauth/PATTERNS.md
@.planning/standalone/shopify-dev-dashboard-oauth/01-SUMMARY.md
@CLAUDE.md
@src/lib/domain/types.ts
@src/lib/domain/whatsapp-templates.ts
@src/lib/domain/tags.ts
@src/lib/domain/index.ts
@src/lib/shopify/types.ts
@src/app/actions/shopify.ts

<interfaces>
<!-- Contracts the executor must implement against. Extracted from existing code. -->

From `src/lib/domain/types.ts:15-40`:
```typescript
export interface DomainContext {
  workspaceId: string
  source: string  // 'server-action' | 'webhook' | etc.
  cascadeDepth?: number
  actorId?: string | null
  actorLabel?: string | null
  triggerEvent?: string | null
}

export interface DomainResult<T = void> {
  success: boolean
  data?: T
  error?: string
}
```

From `src/lib/shopify/types.ts` (verify exact shape during execution — these are the fields we know exist; preserve all the rest):
```typescript
// EXISTING shape (do NOT remove fields)
export interface ShopifyConfig {
  shop_domain: string
  access_token: string
  api_secret: string
  default_pipeline_id: string
  default_stage_id: string
  enable_fuzzy_matching?: boolean
  product_matching?: 'sku' | 'title'
  auto_sync_orders?: boolean
  // NEW (this plan): granted_scope?: string  ← add
}

export interface ShopifyIntegration {
  id: string
  workspace_id: string
  type: 'shopify'
  name: string
  config: ShopifyConfig
  is_active: boolean
  created_at: string
  updated_at: string
}
```

From `src/app/actions/shopify.ts:238-300` (the legacy save path — read to understand the existing config-preservation pattern):
```typescript
const { data: existing } = await adminSupabase
  .from('integrations')
  .select('id, config')
  .eq('workspace_id', workspaceId)
  .eq('type', 'shopify')
  .single()

const existingConfig = existing?.config as Record<string, unknown> | undefined
// ... preserve auto_sync_orders ...
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add `granted_scope?: string` to ShopifyConfig type</name>
  <files>src/lib/shopify/types.ts</files>
  <read_first>
    - `src/lib/shopify/types.ts` (full file — small, read once)
    - RESEARCH.md §Open Question 8 (líneas 1091-1097): "Persist granted scope for drift detection? — Yes — store `grantedScope` in `integrations.config.granted_scope`. Two benefits: future drift detection + audit/debug. Optional field, default `undefined` for legacy integrations."
    - CONTEXT.md D-09 (storage del token sin cambios — esto es compatible: agregar campo opcional al JSONB no requiere migración)
  </read_first>
  <action>
    Editar `src/lib/shopify/types.ts`:

    1. Localizar la interface `ShopifyConfig`.
    2. Agregar al final de los campos (después de `product_matching` o `auto_sync_orders`, preservando orden actual):
       ```typescript
       /** Comma-separated scope granted by Shopify at OAuth time. Persisted for future drift detection (RESEARCH Open Question 8). Undefined for legacy `shpat_` integrations. */
       granted_scope?: string
       ```

    3. **NO cambiar** otros campos. **NO remover** ningún campo (D-11: legacy integrations siguen funcionando).

    4. Cualquier consumer existente (`shopify-form.tsx`, `connection-test.ts`, etc.) compila sin cambios porque el campo es opcional.

    Decisión D referenciada: D-09 (mismo storage, JSONB sin migración) + Open Question 8 (per RESEARCH discretion).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -E "shopify/types|ShopifyConfig" | head -20 || echo "OK: no TS errors related to ShopifyConfig"</automated>
    <automated>grep -E "granted_scope\?:" src/lib/shopify/types.ts</automated>
  </verify>
  <done>
    - `ShopifyConfig` tiene `granted_scope?: string` (opcional)
    - `npx tsc --noEmit` no introduce nuevos errores en archivos que importen `ShopifyConfig`
    - Resto de campos intactos
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear `src/lib/domain/integrations.ts` con upsert + get + delete</name>
  <files>src/lib/domain/integrations.ts</files>
  <read_first>
    - PATTERNS.md §"`src/lib/domain/integrations.ts` (service, CRUD)" — sección completa con el header pattern, imports pattern, error-handling idiom
    - `src/lib/domain/whatsapp-templates.ts:1-180` — analog canónico (header style + imports + upsert con config preservation)
    - `src/lib/domain/tags.ts:61-160` — error-handling idiom (líneas 88-94)
    - `src/lib/domain/types.ts:15-40` — DomainContext + DomainResult shapes (NO redefinir)
    - RESEARCH.md §Code Examples §Example 8 (líneas 861-962) — implementación canónica, **seguir verbatim** ajustando los nombres a la convención del proyecto (`success`/`error` envelope, no `ok`)
    - CONTEXT.md D-10 (Regla 3 — Domain Layer), D-09 (mismo storage)
    - CLAUDE.md Regla 3
  </read_first>
  <action>
    Crear `src/lib/domain/integrations.ts` con esta estructura literal (puedes copiar verbatim de RESEARCH Example 8 con los ajustes listados abajo):

    1. **Header comment** (estilo `whatsapp-templates.ts:1-21`):
       ```typescript
       // ============================================================================
       // Domain Layer — Shopify Integrations (Standalone shopify-dev-dashboard-oauth, D-10)
       // Single source of truth for mutations on `integrations` WHERE type='shopify' (Regla 3 CLAUDE.md).
       //
       // Pattern:
       //   1. createAdminClient() (bypasses RLS)
       //   2. Read existing row by (workspace_id, type='shopify') to preserve config
       //      fields the OAuth callback should NOT overwrite (pipeline_id, stage_id,
       //      product_matching, enable_fuzzy_matching, auto_sync_orders, granted_scope)
       //   3. INSERT or UPDATE based on existence
       //   4. Return DomainResult<ShopifyIntegration>
       //
       // Callers:
       //   - src/app/api/integrations/shopify/oauth/callback/route.ts (Wave 2, Plan 05)
       //   - src/app/actions/shopify.ts (Wave 3, Plan 06 — refactored delete path)
       // ============================================================================
       ```

    2. **Imports** (copiar idioma de `whatsapp-templates.ts:23-33`):
       ```typescript
       import { createAdminClient } from '@/lib/supabase/admin'
       import type { DomainContext, DomainResult } from './types'
       import type { ShopifyConfig, ShopifyIntegration } from '@/lib/shopify/types'
       ```

    3. **`UpsertShopifyIntegrationParams` interface** + **`upsertShopifyIntegration`** (copy RESEARCH Example 8 líneas 868-934):
       - Acepta `ctx: DomainContext` como 1er param.
       - Lee row existente filtrando por `workspace_id` + `type='shopify'` (preserva pipeline_id, stage_id, enable_fuzzy_matching, product_matching, auto_sync_orders, granted_scope).
       - NEW: si `params.grantedScope` viene definido, lo escribe; si no, preserva el del existente.
       - Si existe → UPDATE name + config + updated_at; si no → INSERT con `is_active: true`.
       - Retorna `DomainResult<ShopifyIntegration>` en envelope `{ success, error?, data? }`.
       - Try/catch externo retorna `{ success: false, error }` — **nunca throws** (idioma del domain layer).

       **Importante (preserve granted_scope):** en `existingConfig`, agregar:
       ```typescript
       const config: ShopifyConfig = {
         shop_domain: params.shopDomain,
         access_token: params.accessToken,
         api_secret: params.apiSecret,
         default_pipeline_id: existingConfig.default_pipeline_id ?? '',
         default_stage_id: existingConfig.default_stage_id ?? '',
         enable_fuzzy_matching: existingConfig.enable_fuzzy_matching ?? false,
         product_matching: existingConfig.product_matching ?? 'sku',
         ...(existingConfig.auto_sync_orders !== undefined && { auto_sync_orders: existingConfig.auto_sync_orders }),
         ...(params.grantedScope !== undefined && { granted_scope: params.grantedScope }),  // ← NEW
       }
       ```

    4. **`getShopifyIntegration`** (copy RESEARCH Example 8 líneas 936-948):
       - `ctx: DomainContext` → `DomainResult<ShopifyIntegration | null>`
       - `.maybeSingle()` (no `.single()`) para evitar error cuando no existe.

    5. **`deleteShopifyIntegration`** (copy RESEARCH Example 8 líneas 950-961):
       - `ctx: DomainContext` → `DomainResult<void>`
       - DELETE filtrando por `workspace_id` + `type='shopify'`.

    **NO incluir** logging adicional; el caller (callback route, server action) loguea según contexto.

    **No usar throws.** Cualquier error se captura y se retorna como `{ success: false, error: message }`.

    Decisión D referenciada: D-10 (este archivo materializa Regla 3) + D-02 (UNIQUE(workspace_id, type='shopify') ya está en BD, no se duplica filtro).
  </action>
  <verify>
    <automated>test -f src/lib/domain/integrations.ts && echo "EXISTS"</automated>
    <automated>grep -E "^export async function (upsertShopifyIntegration|getShopifyIntegration|deleteShopifyIntegration)" src/lib/domain/integrations.ts | wc -l</automated>
    <automated>grep -c "ctx\.workspaceId" src/lib/domain/integrations.ts</automated>
    <automated>grep -c "createAdminClient" src/lib/domain/integrations.ts</automated>
    <automated>grep -c "DomainContext\|DomainResult" src/lib/domain/integrations.ts</automated>
    <automated>npx tsc --noEmit src/lib/domain/integrations.ts 2>&1 | head -20</automated>
  </verify>
  <done>
    - 3 funciones exportadas (`upsertShopifyIntegration`, `getShopifyIntegration`, `deleteShopifyIntegration`)
    - Cada query filtra por `ctx.workspaceId` (grep retorna >= 3)
    - `createAdminClient` importado y usado (grep retorna >= 1)
    - `DomainContext` y `DomainResult` importados como type-only
    - Type-check (`npx tsc --noEmit`) sin errores en este archivo
    - **Nunca throws** — todos los errores capturados a `DomainResult.error`
    - `granted_scope` se preserva en upserts si no viene en params
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Add `export * from './integrations'` al barrel + commit</name>
  <files>src/lib/domain/index.ts</files>
  <read_first>
    - `src/lib/domain/index.ts` (full file)
    - PATTERNS.md §"`src/lib/domain/integrations.ts`" §"Adaptation note — barrel export" (línea 176)
  </read_first>
  <action>
    1. Editar `src/lib/domain/index.ts`:
       - Agregar la línea (siguiendo el estilo de comentario de otras entradas — algunas tienen `// Standalone xyz`):
         ```typescript
         // Standalone shopify-dev-dashboard-oauth (D-10)
         export * from './integrations'
         ```
       - Insertarla al final de las re-exports (o en orden alfabético si ese es el orden actual — leer primero el archivo y decidir consistencia).

    2. Verificar que no hay export collision con otros barrels:
       ```bash
       grep -rn "export.*upsertShopifyIntegration\|export.*deleteShopifyIntegration\|export.*getShopifyIntegration" src/lib/domain/ | grep -v "integrations.ts"
       # esperado: 0 matches
       ```

    3. **Commit atómico (Regla 1 CLAUDE.md):**
       ```bash
       git add src/lib/domain/integrations.ts src/lib/domain/index.ts src/lib/shopify/types.ts
       git commit -m "$(cat <<'EOF'
       feat(shopify-oauth 02): domain layer integrations (Regla 3, D-10)

       - src/lib/domain/integrations.ts NEW: upsert/get/delete con DomainContext + DomainResult
       - ShopifyConfig.granted_scope?: string para drift detection futura (RESEARCH Q8)
       - barrel re-export

       Plan 02/Wave 1. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       EOF
       )"
       ```
       NO push aún — el orchestrator decide cuándo pushear.
  </action>
  <verify>
    <automated>grep "export \* from './integrations'" src/lib/domain/index.ts</automated>
    <automated>git log --oneline -1 | grep -E "feat\(shopify-oauth 02\)"</automated>
  </verify>
  <done>
    - Barrel re-export presente
    - Commit creado con mensaje convencional en español
    - No push (orchestrator se encarga después de checker)
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Caller (route handler / server action) → domain function | Caller debe pasar `ctx.workspaceId` ya validado (state JWT o cookie+Owner check) |
| Domain function → DB (admin client, bypass RLS) | Trust crítico: si caller pasa workspaceId equivocado, mutaría tabla incorrecta |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-shopify-oauth-05 | E (Elevation) | Cross-workspace token write si caller pasa workspaceId errado | mitigate | `ctx.workspaceId` siempre del state JWT (verificado en callback) o cookie+Owner check (server action); domain layer NO valida — confía en caller |
| T-shopify-oauth-06 | I (Information disclosure) | `access_token` en logs del domain | mitigate | Domain layer no loguea; caller que loguee debe scrubear `token: '<redacted>'` (responsabilidad del Plan 05/06) |
| T-shopify-oauth-07 | T (Tampering) | Caller bypassea domain via `adminSupabase.from('integrations').upsert()` directo | mitigate | Validación grep-verificable en Plan 05 + Plan 06: 0 matches de `from\('integrations'\)\.(insert\|update\|upsert\|delete)` fuera de este archivo |
</threat_model>

<verification>
Al final del plan, validar Regla 3 globalmente:

```bash
# Regla 3 enforcement: solo este archivo puede mutar tabla integrations.
# (Plan 05/06 hereditarán esta verificación cuando refactoricen sus llamadas.)
grep -rn "from('integrations')\.\(insert\|update\|upsert\|delete\)" src/ \
  --include='*.ts' --include='*.tsx' | grep -v 'src/lib/domain/integrations.ts'
# Esperado AHORA: matches en src/app/actions/shopify.ts:NNN (legacy save + delete) — eso lo refactoriza Plan 06
# Esperado POST-Plan-06: 0 matches
```

Smoke test imports:
```bash
npx tsx -e "
import { upsertShopifyIntegration, getShopifyIntegration, deleteShopifyIntegration } from './src/lib/domain/integrations'
console.log(typeof upsertShopifyIntegration, typeof getShopifyIntegration, typeof deleteShopifyIntegration)
"
# esperado: function function function
```
</verification>

<success_criteria>
- [ ] `src/lib/domain/integrations.ts` existe con 3 funciones públicas
- [ ] Cada función acepta `DomainContext` y retorna `DomainResult`
- [ ] Cada query filtra por `ctx.workspaceId` (no se confía en el caller para filtrar)
- [ ] `upsertShopifyIntegration` preserva `default_pipeline_id`, `default_stage_id`, `enable_fuzzy_matching`, `product_matching`, `auto_sync_orders`, `granted_scope` del config existente
- [ ] `granted_scope?: string` agregado a `ShopifyConfig` (Open Question 8)
- [ ] Barrel `src/lib/domain/index.ts` re-exporta
- [ ] TypeScript compila sin errores nuevos en archivos tocados
- [ ] Commit atómico creado con mensaje en español + Co-Authored-By Claude
- [ ] **NUNCA throws** — todos los errores → `DomainResult.error`
- [ ] **NO migración** creada (D-09: schema actual sirve sin cambios)
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/shopify-dev-dashboard-oauth/02-SUMMARY.md` con:
- Líneas exactas de cada función creada
- Resultado de los grep gates de Regla 3
- Nota explícita: "Regla 3 todavía con matches en `src/app/actions/shopify.ts` — Plan 06 los limpia"
- Hand-off claro para Plan 04 (server action) y Plan 05 (callback): qué imports usar y con qué `source` taxonomy (`'server-action'` para Plan 04, `'webhook'` o `'oauth-callback'` para Plan 05 — escoger en Plan 05).
</output>
