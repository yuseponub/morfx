# Phase 21: DB + Domain Foundation - Research

**Researched:** 2026-02-20
**Domain:** Supabase schema design + domain layer for Colombian logistics (DANE municipalities, Coordinadora coverage, carrier configs, robot job tracking)
**Confidence:** HIGH

## Summary

This phase is a data infrastructure phase with zero new dependencies. Everything uses the existing stack: Supabase (PostgreSQL) for schema/data, TypeScript domain layer for mutations, and Inngest events for async robot communication. The research focused on four areas: (1) the DANE DIVIPOLA municipality coding system for Colombia, (2) Coordinadora's city format and matching strategy, (3) schema design patterns already established in the codebase, and (4) job tracking patterns for robot batch operations.

The codebase has 37 existing migrations following a consistent pattern: `CREATE TABLE` with UUIDs, `workspace_id` FKs, RLS policies using `is_workspace_member()`, `timezone('America/Bogota', NOW())` defaults, and `update_updated_at_column()` triggers. The domain layer has 11 existing modules following an identical pattern: `createAdminClient()`, workspace-scoped queries, `DomainResult<T>` returns, and automation trigger emission. This phase extends both patterns with zero architectural changes.

The Coordinadora city data file contains exactly 1,488 lines (1,489 with potential final newline) covering 36 unique department abbreviations. There are 105 city names that appear in multiple departments (e.g., ALBANIA exists in ANT, CAQ, GUAJ), making department disambiguation critical. The data also includes Mexican cities (CMX, MEX departments) which Coordinadora covers for cross-border shipping.

**Primary recommendation:** Follow the exact same migration/domain patterns already in use. The municipalities table is a global reference table (no workspace_id), coverage tables link municipalities to carriers, carrier_configs is workspace-scoped with encrypted credentials, and robot_jobs/robot_job_items track batch executions per workspace.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase (PostgreSQL) | Existing | Database + RLS | Already in stack, 37 migrations |
| @supabase/supabase-js | Existing | DB client (admin + user) | Already in stack |
| TypeScript domain layer | src/lib/domain/ | Mutation gateway | Established pattern, 11 modules |
| Inngest | 3.51.0 | Async event bus for robot comms | Already in stack, events.ts pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pgcrypto (extension) | Built-in | UUID generation | Already enabled via gen_random_uuid() |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQL seed migration | TypeScript seed script | Migration is simpler, runs once via `supabase db push`, no extra tooling |
| JSONB for carrier creds | Separate columns | Separate columns are simpler to type-check and query; JSONB adds unnecessary flexibility for 2 fields (user+password) |
| Separate COD table | Boolean column on coverage | Separate approach more flexible for future carriers, but boolean column on coverage is simpler and sufficient for v3.0 |

**Installation:**
```bash
# No new dependencies needed. Zero npm install.
```

## Architecture Patterns

### Recommended Project Structure
```
supabase/
  migrations/
    20260222000000_dane_municipalities.sql      # DATA-01: DANE municipalities table + seed
    20260222000001_coordinadora_coverage.sql     # DATA-02: Coverage + COD table + seed
    20260222000002_carrier_configs.sql           # DATA-03: Workspace carrier credentials
    20260222000003_robot_jobs.sql                # DATA-04: Job tracking tables
src/lib/domain/
    robot-jobs.ts          # Domain functions for robot job mutations
    carrier-coverage.ts    # Domain functions for city validation + coverage queries
    carrier-configs.ts     # Domain functions for carrier config CRUD
    index.ts               # Updated barrel exports
src/inngest/
    events.ts              # Updated with robot job events
```

### Pattern 1: Global Reference Table (municipalities)
**What:** The `dane_municipalities` table is NOT workspace-scoped. It's a global reference dataset shared by all workspaces (like country codes or currency tables). This is different from all other tables in the codebase which are workspace-scoped.
**When to use:** When data is the same for all workspaces (DANE codes don't change per workspace).
**Example:**
```sql
-- Source: Codebase pattern analysis
CREATE TABLE dane_municipalities (
  id SERIAL PRIMARY KEY,
  dane_code CHAR(5) NOT NULL UNIQUE,
  department_code CHAR(2) NOT NULL,
  department_name TEXT NOT NULL,
  municipality_name TEXT NOT NULL,
  -- Normalized search fields (uppercase, no accents)
  municipality_name_normalized TEXT NOT NULL,
  department_name_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- NO RLS needed (global reference data, read-only)
-- NO workspace_id (shared across workspaces)
-- Grant read-only to authenticated users
GRANT SELECT ON dane_municipalities TO authenticated;
GRANT SELECT ON dane_municipalities TO service_role;
```

### Pattern 2: Carrier Coverage with Coordinadora Format
**What:** The `carrier_coverage` table links Coordinadora's city format to DANE municipalities, storing the exact string format Coordinadora expects.
**When to use:** For city validation before robot submission.
**Example:**
```sql
-- Source: Codebase pattern analysis + Coordinadora data
CREATE TABLE carrier_coverage (
  id SERIAL PRIMARY KEY,
  carrier TEXT NOT NULL DEFAULT 'coordinadora',
  -- Coordinadora's exact city format: "CIUDAD (DEPTO_ABREV)"
  city_coordinadora TEXT NOT NULL,
  -- Parsed components for matching
  city_name TEXT NOT NULL,
  department_abbrev TEXT NOT NULL,
  -- Link to DANE municipality (nullable - not all Coordinadora cities map to DANE)
  dane_municipality_id INTEGER REFERENCES dane_municipalities(id),
  -- COD support
  supports_cod BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(carrier, city_coordinadora)
);

-- NO RLS, NO workspace_id (global reference)
CREATE INDEX idx_carrier_coverage_lookup ON carrier_coverage(carrier, city_name, department_abbrev);
CREATE INDEX idx_carrier_coverage_cod ON carrier_coverage(carrier, supports_cod) WHERE is_active = true;
```

### Pattern 3: Workspace-Scoped Config Table (carrier_configs)
**What:** Per-workspace carrier credentials. Follows the exact pattern of `client_activation_config` — workspace_id as PRIMARY KEY.
**When to use:** For workspace-specific settings like carrier portal credentials.
**Example:**
```sql
-- Source: client_activation_config pattern from 20260221000000_client_activation_badge.sql
CREATE TABLE carrier_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL DEFAULT 'coordinadora',
  -- Portal credentials (stored as text, encrypted at app layer if needed)
  portal_username TEXT,
  portal_password TEXT,
  -- Pickup address (optional override)
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, carrier)
);
```

### Pattern 4: Robot Job Tracking (parent/child)
**What:** Two tables: `robot_jobs` (batch-level) and `robot_job_items` (per-order) with state machines.
**When to use:** Tracking batch robot executions with per-order granularity.
**Example:**
```sql
-- Source: Codebase pattern analysis (orders + automation_executions)
CREATE TABLE robot_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL DEFAULT 'coordinadora',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_items INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  -- Idempotency
  idempotency_key TEXT,
  -- Metadata
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, idempotency_key)
);

CREATE TABLE robot_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES robot_jobs(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'error')),
  -- Coordinadora result
  tracking_number TEXT,           -- # pedido Coordinadora (NOT guia)
  -- City validation result
  validated_city TEXT,            -- The exact Coordinadora city string used
  -- Values sent to robot
  value_sent JSONB,              -- Snapshot of PedidoInput sent to robot
  -- Error tracking
  error_type TEXT CHECK (error_type IN ('validation', 'portal', 'timeout', 'unknown')),
  error_message TEXT,
  -- Retry support
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(job_id, order_id)
);
```

### Pattern 5: Domain Function with DomainResult
**What:** All domain functions follow the same signature: `(ctx: DomainContext, params: T) => Promise<DomainResult<R>>`
**When to use:** Every mutation in the domain layer.
**Example:**
```typescript
// Source: Existing domain layer pattern (orders.ts, contacts.ts)
export async function updateJobItemResult(
  ctx: DomainContext,
  params: UpdateJobItemResultParams
): Promise<DomainResult<UpdateJobItemResultResult>> {
  const supabase = createAdminClient()

  try {
    // 1. Validate workspace ownership via job
    const { data: item } = await supabase
      .from('robot_job_items')
      .select('id, job_id, order_id, robot_jobs!inner(workspace_id)')
      .eq('id', params.itemId)
      .single()

    if (!item || (item.robot_jobs as any).workspace_id !== ctx.workspaceId) {
      return { success: false, error: 'Item no encontrado' }
    }

    // 2. Update item status
    // 3. If success: update order tracking_number via domain
    // 4. Update job counters
    // 5. Emit automation triggers

    return { success: true, data: { itemId: params.itemId } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
```

### Anti-Patterns to Avoid
- **Direct Supabase writes from API routes/webhooks:** Always go through domain layer. The robot callback endpoint must call domain functions, not write to DB directly.
- **Workspace-scoping municipalities:** DANE data is global. Don't add workspace_id to reference tables.
- **Storing passwords in plaintext without noting it:** For v3.0, plain text in DB is acceptable (portal credentials, not payment data), but the column comment should note this is not encrypted.
- **RLS on reference tables:** Global reference data (municipalities, coverage) should NOT have RLS. Only workspace-scoped tables get RLS.
- **Multiple sources of truth for city validation:** The carrier_coverage table IS the source of truth. Don't duplicate validation logic in TypeScript.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text normalization (accents) | Custom regex per use | Shared `normalizeText()` util | Already exists in robot codebase: `.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()` |
| Department name mapping | Hardcoded map in each file | Database table / constant | The robot already has MAPEO_DEPARTAMENTOS with 35+ entries; put it in DB or shared constant |
| Idempotency keys | Manual string concatenation | Deterministic hash function | Use `${workspaceId}-${timestamp}-${orderIds.sort().join(',')}` or similar |
| Job status aggregation | Application-level counting | SQL aggregation via domain | Let PostgreSQL count success/error items, don't maintain separate counters manually |
| City validation | String matching in app code | SQL query against carrier_coverage | Database is the source of truth, not a TypeScript lookup |

**Key insight:** The main complexity in this phase is data modeling, not code. Most of the work is SQL migrations and seed data. The domain functions are straightforward CRUD following established patterns.

## Common Pitfalls

### Pitfall 1: DANE Municipality Count Mismatch
**What goes wrong:** Colombia has 1,122 official municipalities but Coordinadora covers 1,489 "cities" including veredas, corregimientos, and Mexican cities.
**Why it happens:** Coordinadora's "city" concept is broader than DANE's "municipality." Not every Coordinadora city has a DANE code.
**How to avoid:** Make `dane_municipality_id` nullable on the coverage table. Match what can be matched, leave the rest as coverage-only entries.
**Warning signs:** Exact match count between DANE and Coordinadora tables.

### Pitfall 2: Duplicate City Names (105 duplicates)
**What goes wrong:** Looking up "ALBANIA" without department context returns 3 matches (ANT, CAQ, GUAJ). Orders submitted to wrong city.
**Why it happens:** City names repeat across Colombia's 32+ departments.
**How to avoid:** Always require department for city resolution. The lookup function must take both city AND department, build `CITY (DEPT_ABBREV)`, and do exact match.
**Warning signs:** Any city lookup function that doesn't take department as a parameter.

### Pitfall 3: Department Abbreviation Mapping
**What goes wrong:** Order has `shipping_department = "Cundinamarca"` but Coordinadora expects `C/MARCA`. No match found, order rejected.
**Why it happens:** Orders store full department names; Coordinadora uses custom abbreviations (not standard ISO).
**How to avoid:** Create a `department_mapping` lookup (either table or constant) with ALL known variants: full name, common abbreviations, DANE name, Coordinadora abbreviation. The robot already has 35+ entries in MAPEO_DEPARTAMENTOS.
**Warning signs:** Department mapping that doesn't handle edge cases like "BOGOTA D.C." -> "C/MARCA", "NORTE DE SANTANDER" -> "N/STDER".

### Pitfall 4: Trailing Whitespace in Coordinadora Data
**What goes wrong:** Data contains entries like `CALARCA (QDIO) ` with trailing space. Exact match fails.
**Why it happens:** Copy-paste from Coordinadora portal introduces whitespace.
**How to avoid:** Trim ALL data during seed migration. Normalize before INSERT.
**Warning signs:** Failed matches for cities that visually look correct.

### Pitfall 5: Robot Job Items Missing Workspace Scoping
**What goes wrong:** `robot_job_items` doesn't have `workspace_id`, so queries require JOIN to `robot_jobs` to check workspace ownership.
**Why it happens:** Normalization — items belong to jobs which belong to workspaces.
**How to avoid:** This is actually correct design. BUT the domain layer must always JOIN through `robot_jobs` to verify workspace. Alternatively, denormalize `workspace_id` onto items for simpler queries (like `order_products` follows `order_id`).
**Warning signs:** Direct queries to `robot_job_items` without workspace verification.

### Pitfall 6: Concurrent Robot Jobs
**What goes wrong:** Two operators submit the same orders simultaneously. Double-processing occurs.
**Why it happens:** No idempotency protection.
**How to avoid:** `idempotency_key` on `robot_jobs` with UNIQUE constraint. Check for existing pending/processing job with same orders before creating new job. Per-order lock via UNIQUE(job_id, order_id) constraint.
**Warning signs:** Duplicate order submissions showing in robot_job_items.

### Pitfall 7: Mexican Cities in Coordinadora Data
**What goes wrong:** Coordinadora data includes cities in CMX (Ciudad de Mexico) and MEX (Estado de Mexico). These won't have DANE codes.
**Why it happens:** Coordinadora covers cross-border shipping to Mexico.
**How to avoid:** Allow `dane_municipality_id` to be NULL on coverage. These are valid coverage entries without DANE mapping.
**Warning signs:** Seed migration failing because it requires DANE match for all Coordinadora cities.

## Code Examples

### City Validation Domain Function
```typescript
// Source: Established domain pattern + Coordinadora matching logic
export interface ValidateCityParams {
  city: string
  department: string
  carrier?: string
}

export interface ValidateCityResult {
  isValid: boolean
  coordinadoraCity: string | null  // e.g., "MEDELLIN (ANT)"
  supportsCod: boolean
}

export async function validateCity(
  ctx: DomainContext,
  params: ValidateCityParams
): Promise<DomainResult<ValidateCityResult>> {
  const supabase = createAdminClient()
  const carrier = params.carrier || 'coordinadora'

  try {
    // Normalize inputs
    const normalizedCity = normalizeText(params.city)
    const deptAbbrev = mapDepartmentToAbbrev(params.department)

    if (!deptAbbrev) {
      return {
        success: true,
        data: { isValid: false, coordinadoraCity: null, supportsCod: false }
      }
    }

    // Exact match: CITY (DEPT_ABBREV)
    const { data: coverage } = await supabase
      .from('carrier_coverage')
      .select('city_coordinadora, supports_cod')
      .eq('carrier', carrier)
      .eq('city_name', normalizedCity)
      .eq('department_abbrev', deptAbbrev)
      .eq('is_active', true)
      .single()

    if (!coverage) {
      return {
        success: true,
        data: { isValid: false, coordinadoraCity: null, supportsCod: false }
      }
    }

    return {
      success: true,
      data: {
        isValid: true,
        coordinadoraCity: coverage.city_coordinadora,
        supportsCod: coverage.supports_cod,
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
```

### Text Normalization Utility
```typescript
// Source: Robot codebase normalization pattern
/**
 * Normalize text for city/department matching:
 * - Uppercase
 * - Remove diacritics (accents)
 * - Trim whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}
```

### Department Abbreviation Mapping
```typescript
// Source: Robot's MAPEO_DEPARTAMENTOS (35+ entries)
// Store as a constant (not a table) since it rarely changes
export const DEPARTMENT_ABBREVIATIONS: Record<string, string> = {
  'AMAZONAS': 'AMAZ',
  'ANTIOQUIA': 'ANT',
  'ARAUCA': 'ARAU',
  'ATLANTICO': 'ATL',
  'BOGOTA': 'C/MARCA',
  'BOGOTA D.C.': 'C/MARCA',
  'BOGOTA, D.C.': 'C/MARCA',
  'DISTRITO CAPITAL': 'C/MARCA',
  'BOLIVAR': 'BOL',
  'BOYACA': 'BOY',
  'CALDAS': 'CDAS',
  'CAQUETA': 'CAQ',
  'CASANARE': 'C/NARE',
  'CAUCA': 'CAU',
  'CESAR': 'CES',
  'CHOCO': 'CHOCO',
  'CORDOBA': 'CORD',
  'CUNDINAMARCA': 'C/MARCA',
  'GUAINIA': 'GUAI',
  'GUAVIARE': 'G/VIARE',
  'GUAJIRA': 'GUAJ',
  'LA GUAJIRA': 'GUAJ',
  'HUILA': 'HLA',
  'MAGDALENA': 'MG/LENA',
  'META': 'META',
  'NARINO': 'NAR',
  'NARIÑO': 'NAR',
  'NORTE DE SANTANDER': 'N/STDER',
  'PUTUMAYO': 'P/MAYO',
  'QUINDIO': 'QDIO',
  'RISARALDA': 'RS',
  'SAN ANDRES': 'S/ANDRES',
  'SAN ANDRES Y PROVIDENCIA': 'S/ANDRES',
  'SANTANDER': 'STDER',
  'SUCRE': 'SUCRE',
  'TOLIMA': 'TOL',
  'VALLE DEL CAUCA': 'VALLE',
  'VALLE': 'VALLE',
  'VAUPES': 'V/PES',
  'VICHADA': 'VICH',
  // Mexican departments (Coordinadora cross-border)
  'CIUDAD DE MEXICO': 'CMX',
  'ESTADO DE MEXICO': 'MEX',
}

/**
 * Map a department name (full or variant) to Coordinadora abbreviation.
 * Returns null if no mapping found.
 */
export function mapDepartmentToAbbrev(department: string): string | null {
  const normalized = normalizeText(department)
  return DEPARTMENT_ABBREVIATIONS[normalized] || null
}
```

### Robot Job Creation Domain Function
```typescript
// Source: Established domain pattern
export interface CreateRobotJobParams {
  carrier: string
  orderIds: string[]
  idempotencyKey?: string
}

export interface CreateRobotJobResult {
  jobId: string
  itemCount: number
}

export async function createRobotJob(
  ctx: DomainContext,
  params: CreateRobotJobParams
): Promise<DomainResult<CreateRobotJobResult>> {
  const supabase = createAdminClient()

  try {
    // Check idempotency: existing pending/processing job with same key
    if (params.idempotencyKey) {
      const { data: existing } = await supabase
        .from('robot_jobs')
        .select('id, status')
        .eq('workspace_id', ctx.workspaceId)
        .eq('idempotency_key', params.idempotencyKey)
        .in('status', ['pending', 'processing'])
        .single()

      if (existing) {
        return { success: false, error: `Ya existe un job activo para este lote (${existing.id})` }
      }
    }

    // Verify all orders belong to workspace
    const { data: orders } = await supabase
      .from('orders')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .in('id', params.orderIds)

    if (!orders || orders.length !== params.orderIds.length) {
      return { success: false, error: 'Algunos pedidos no pertenecen a este workspace' }
    }

    // Create job
    const { data: job, error: jobError } = await supabase
      .from('robot_jobs')
      .insert({
        workspace_id: ctx.workspaceId,
        carrier: params.carrier,
        total_items: params.orderIds.length,
        idempotency_key: params.idempotencyKey || null,
      })
      .select('id')
      .single()

    if (jobError || !job) {
      return { success: false, error: `Error al crear job: ${jobError?.message}` }
    }

    // Create items
    const items = params.orderIds.map(orderId => ({
      job_id: job.id,
      order_id: orderId,
    }))

    const { error: itemsError } = await supabase
      .from('robot_job_items')
      .insert(items)

    if (itemsError) {
      // Rollback job
      await supabase.from('robot_jobs').delete().eq('id', job.id)
      return { success: false, error: `Error al crear items: ${itemsError.message}` }
    }

    return {
      success: true,
      data: { jobId: job.id, itemCount: params.orderIds.length }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
```

### Inngest Event Types for Robot Communication
```typescript
// Source: Established Inngest event pattern from events.ts
// Robot events to add to AllAgentEvents

export type RobotEvents = {
  // Sent by MorfX to trigger robot (via Inngest or HTTP)
  'robot/job.submitted': {
    data: {
      jobId: string
      workspaceId: string
      carrier: string
      credentials: {
        username: string
        password: string
      }
      orders: Array<{
        itemId: string
        orderId: string
        pedidoInput: PedidoInput
      }>
    }
  }

  // Received from robot callback when item completes
  'robot/item.completed': {
    data: {
      jobId: string
      itemId: string
      workspaceId: string
      status: 'success' | 'error'
      trackingNumber?: string
      errorType?: 'validation' | 'portal' | 'timeout' | 'unknown'
      errorMessage?: string
    }
  }

  // Received from robot callback when entire job completes
  'robot/job.completed': {
    data: {
      jobId: string
      workspaceId: string
      successCount: number
      errorCount: number
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded city matching in robot | Database-driven carrier_coverage table | This phase | City validation decoupled from robot, queryable, updatable without code deploy |
| Robot manages own state | MorfX tracks via robot_jobs/robot_job_items | This phase | Centralized status, retry support, audit trail |
| No DANE standardization | dane_municipalities reference table | This phase | Foundation for any Colombian carrier integration |

**Deprecated/outdated:**
- Robot's internal `MAPEO_DEPARTAMENTOS`: Will be mirrored as a TypeScript constant in MorfX (`src/lib/logistics/constants.ts`). Robot keeps its own copy for standalone operation.
- Robot's internal `ciudadesCoordinadora` set: Will be replaced by DB query in MorfX. Robot still uses its local copy.

## Open Questions

1. **DANE-to-Coordinadora matching accuracy**
   - What we know: DANE has 1,122 official municipalities. Coordinadora has 1,489 "cities" including sub-municipal areas, veredas, and Mexican cities.
   - What's unclear: Exact match rate between the two datasets. Some Coordinadora entries may not map to any DANE code (e.g., "EL DOCE (ANT)" is not a municipality).
   - Recommendation: Seed both tables independently. Create a mapping script that tries to match by normalized name + department. Leave unmatched Coordinadora entries with NULL dane_municipality_id. The matching can be refined later.

2. **COD (Contraentrega) city list**
   - What we know: ~1,181 cities support COD. The user mentioned this as a separate list.
   - What's unclear: Whether the COD list is a subset of the main cities list, or if it has different entries.
   - Recommendation: Add `supports_cod BOOLEAN` to the coverage table. If the COD list is provided, update the flag. If not provided yet, default to false and update when available.

3. **Credential encryption**
   - What we know: Carrier configs store portal username/password. Not payment data.
   - What's unclear: Whether encryption is needed for v3.0 or deferred.
   - Recommendation: Store as plaintext in v3.0 (like WhatsApp tokens are stored today). Add column comments noting this. Encryption is a v4.0+ concern.

4. **Robot event communication direction**
   - What we know: Robot runs on Railway (Docker), communicates via Inngest events + HTTP callbacks.
   - What's unclear: Whether the robot will consume Inngest events directly or if MorfX sends HTTP to robot and robot calls back.
   - Recommendation: Design the DB schema to support both patterns. The domain layer processes results regardless of delivery mechanism. The exact communication protocol is Phase 23 (Robot Service) scope.

## Sources

### Primary (HIGH confidence)
- Existing codebase: 37 SQL migrations analyzed for patterns
- Existing codebase: 11 domain layer modules analyzed for function signatures
- Existing codebase: `src/inngest/events.ts` for event type patterns
- Existing codebase: `src/lib/automations/trigger-emitter.ts` for trigger emission patterns
- Coordinadora city data file: `.planning/phases/21-db-domain-foundation/data/ciudades-coordinadora.txt` (1,489 entries)

### Secondary (MEDIUM confidence)
- [DANE DIVIPOLA Open Data](https://www.datos.gov.co/Mapas-Nacionales/DIVIPOLA-C-digos-municipios/gdxc-w37w) - Municipality codes CSV (5-digit format: 2-digit dept + 3-digit municipality)
- [DANE Geoportal DIVIPOLA Download](https://geoportal.dane.gov.co/descargas/divipola/DIVIPOLA_Municipios.xlsx) - Official XLSX with Codigo Departamento, Nombre Departamento, Codigo Municipio, Nombre Municipio, Tipo, Longitud, Latitud
- [DANE DIVIPOLA Definition](https://www.dane.gov.co/index.php/sistema-estadistico-nacional-sen/normas-y-estandares/nomenclaturas-y-clasificaciones/nomenclaturas/codificacion-de-la-division-politica-administrativa-de-colombia-divipola) - Official nomenclature description

### Tertiary (LOW confidence)
- None. All findings verified against codebase or official sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses only existing stack, zero new dependencies
- Architecture: HIGH - Follows 37 existing migration patterns and 11 domain module patterns exactly
- Pitfalls: HIGH - Analyzed actual Coordinadora data (105 duplicate names, 36 dept abbreviations, trailing whitespace, Mexican cities) and existing codebase patterns
- DANE data: MEDIUM - Official sources verified but exact download/seed strategy depends on data format available at implementation time

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable - reference data and established patterns)
