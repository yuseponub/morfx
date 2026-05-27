---
phase: coordinadora-api-integration
plan: 03
type: execute
wave: 1
depends_on: [01, 02]
files_modified:
  - src/lib/carriers/coordinadora/types.ts
  - src/lib/carriers/coordinadora/status-codes.ts
  - src/lib/carriers/coordinadora/tenant.ts
  - src/lib/carriers/coordinadora/__tests__/status-codes.test.ts
  - src/lib/carriers/coordinadora/__tests__/tenant.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Module folder src/lib/carriers/coordinadora/ exists with types, status-codes, tenant resolver"
    - "All 9 official status codes (0,1,2,3,4,5,6,8,9 — NO 7) mapped to labels; unknown → 'DESCONOCIDO'"
    - "Hardcoded NIT 902052328 → Somnio workspace UUID a3843b3f-c337-4836-92b5-89c58bb98490 (V1 single-tenant fallback)"
    - "Unit tests cover known codes, unknown codes, novedad code 801, NIT match/mismatch"
  artifacts:
    - path: "src/lib/carriers/coordinadora/types.ts"
      provides: "TypeScript types for OAuth, cotizar, createGuia, imprimirEtiqueta, PubSub envelope, CoordinadoraEvent variants"
      exports: ["Env", "CotizarRequest", "CotizarResponse", "GuiaEstandarRequest", "GuiaRCERequest", "GuiaResponse", "ImprimirEtiquetaRequest", "ImprimirEtiquetaResponse", "PubSubEnvelope", "CoordinadoraEventWithoutNovedad", "CoordinadoraEventWithNovedad", "CoordinadoraEvent"]
    - path: "src/lib/carriers/coordinadora/status-codes.ts"
      provides: "Status code enum + mapStatusCode + mapNovedadCode pure functions"
      exports: ["COORDINADORA_STATUS_CODES", "CoordinadoraStatusLabel", "mapStatusCode", "COORDINADORA_NOVEDAD_CODES", "mapNovedadCode"]
    - path: "src/lib/carriers/coordinadora/tenant.ts"
      provides: "resolveWorkspaceFromNit pure function (V1 hardcoded Somnio)"
      exports: ["resolveWorkspaceFromNit", "SOMNIO_WORKSPACE_ID", "MORFX_NIT"]
  key_links:
    - from: "src/lib/carriers/coordinadora/types.ts"
      to: "PDFs (Notificacion-push, Cotizador, Guías, Etiquetas)"
      via: "type fields mirror PDF dictionaries verbatim"
      pattern: "matches §Pattern 2 from RESEARCH (CoordinadoraEvent shapes)"
---

<objective>
Create the FOUNDATIONAL files for the Coordinadora module: pure types + status-code enum + multi-tenant resolver. These are dependency-free (no fetch, no DB, no env var reads at import time) and unblock Plans 04 (client.ts), 05 (wrappers), 07 (pub-sub-envelope), 08 (route handler).

Per D-12, D-18, D-20: all three files live in `src/lib/carriers/coordinadora/` (NEW folder, separated from `robot-coordinadora/`).

Per D-09 / Pattern 6: tenant.ts is V1 hardcoded map; V2 will become a DB lookup.

Per D-33: internal folder structure follows RESEARCH §Recommended Project Structure (line 196-221).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.planning/standalone/coordinadora-api-integration/PATTERNS.md
@.planning/standalone/coordinadora-api-integration/reference/Notificacion-push-Tracking-v3.pdf
@.planning/standalone/coordinadora-api-integration/reference/API Cotizador Nacional.pdf
@.planning/standalone/coordinadora-api-integration/reference/Documentacion Creacion de Guía Estándar y RCE.pdf
@.planning/standalone/coordinadora-api-integration/reference/Servicio etiquetas.pdf
@src/lib/carriers/envia-api.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create types.ts with all interfaces from PDFs</name>
  <files>src/lib/carriers/coordinadora/types.ts</files>
  <read_first>
    - src/lib/carriers/envia-api.ts (lines 10-28 — analog inline interface pattern)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 2 (Pub/Sub Envelope) lines 326-408 — exact event interfaces
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 213-244 (types.ts pattern)
    - .planning/standalone/coordinadora-api-integration/reference/Documentacion Creacion de Guía Estándar y RCE.pdf (body fields dictionary 3.1-3.5)
    - .planning/standalone/coordinadora-api-integration/reference/API Cotizador Nacional.pdf (cotizar body + response)
    - .planning/standalone/coordinadora-api-integration/reference/Servicio etiquetas.pdf (etiquetas body + response)
  </read_first>
  <behavior>
    - Type `Env` is exported as `'test' | 'prod'` literal union (NOT a generic string)
    - All interfaces are exported (consumed by client.ts, wrappers, route handler)
    - `CoordinadoraEvent` is a discriminated union of `CoordinadoraEventWithoutNovedad | CoordinadoraEventWithNovedad`
    - Type-only file (no runtime imports, no side effects, no env var reads)
  </behavior>
  <action>
    Create `src/lib/carriers/coordinadora/types.ts` with EXACTLY the following content (combines RESEARCH §Pattern 2 verbatim + PDF-derived shapes for cotizar/guías/etiquetas):

    ```typescript
    /**
     * Coordinadora API — type definitions.
     *
     * Mirrors official PDFs in .planning/standalone/coordinadora-api-integration/reference/:
     *   - API Cotizador Nacional.pdf
     *   - Documentacion Creacion de Guía Estándar y RCE.pdf
     *   - Servicio etiquetas.pdf
     *   - Notificacion-push-Tracking-v3.pdf
     *
     * Standalone: coordinadora-api-integration (D-15, D-33)
     */

    // ---------------------------------------------------------------------------
    // Environment discriminator (D-15)
    // ---------------------------------------------------------------------------
    export type Env = 'test' | 'prod'

    // ---------------------------------------------------------------------------
    // OAuth (D-15) — request is form-urlencoded; response shape per Cotizador PDF
    // ---------------------------------------------------------------------------
    export interface OAuthTokenResponse {
      /** PDF Cotizador uses both keys (PDF typo Pitfall 1). Accept either. */
      access_token?: string
      acces_token?: string
      /** Per PDF: string '3599' (Pitfall 1) — we ignore and hardcode 55min TTL (D-13). */
      expires_in?: string | number
      token_type?: string
    }

    // ---------------------------------------------------------------------------
    // Cotizador Nacional (PDF: API Cotizador Nacional.pdf)
    // ---------------------------------------------------------------------------
    export interface CotizarRequestCO {
      codigoPais: '170'                // Colombia
      ciudadOrigen: string              // DANE code
      ciudadDestino: string             // DANE code
      pesoTotal: number                 // kg
      valorDeclarado: number
      unidades: number
      altoCm?: number
      anchoCm?: number
      largoCm?: number
      tipoCuenta?: string               // env var COORDINADORA_TIPO_CUENTA
      tipoProducto?: string             // env var COORDINADORA_TIPO_PRODUCTO
    }

    /** V2 stub — MX cotization deferred per D-defer "Cotizaciones México". */
    export interface CotizarRequestMX {
      codigoPais: '484'
      codigo_postal_origen: string
      codigo_postal_destino: string
      pesoTotal: number
      valorDeclarado: number
      unidades: number
    }

    export type CotizarRequest = CotizarRequestCO | CotizarRequestMX

    export interface CotizarResponse {
      flete_total: number
      dias_entrega: number
      tipo_trayecto: string
      [key: string]: unknown            // Coordinadora response is loose — preserve unknown fields
    }

    // ---------------------------------------------------------------------------
    // Creación de Guías — Estándar (nivelServicio=1) y RCE (nivelServicio=22)
    // (PDF: Documentacion Creacion de Guía Estándar y RCE.pdf)
    // ---------------------------------------------------------------------------
    export interface GuiaContactoDestinatario {
      nombre: string
      telefono: string
      identificacion?: string
      tipoIdentificacion?: string       // PDF: tipoDocumento catalog deferred per CONTEXT no-scope
    }

    export interface GuiaDireccionDestinatario {
      direccion: string
      ciudad: string                    // DANE code
      departamento?: string
      observaciones?: string
    }

    export interface GuiaProducto {
      descripcion: string
      cantidad: number
      pesoUnitario: number
      valorUnitario: number
    }

    export interface GuiaBase {
      idProceso: string                 // env var COORDINADORA_ID_PROCESO
      divisionCliente: string           // env var COORDINADORA_DIVISION_CLIENTE
      nitCliente: string                // env var COORDINADORA_NIT_CLIENTE
      tipoCuenta: string                // env var COORDINADORA_TIPO_CUENTA
      tipoProducto: string              // env var COORDINADORA_TIPO_PRODUCTO
      destinatario: GuiaContactoDestinatario
      direccion: GuiaDireccionDestinatario
      productos: GuiaProducto[]
      pesoTotal: number
      valorDeclarado: number
      unidades: number
      referencia?: string
    }

    /** Estándar (nivelServicio=1) — no recaudo. PDF page 3. */
    export interface GuiaEstandarRequest extends GuiaBase {
      nivelServicio: 1
    }

    /** RCE = Recaudo Contra Entrega (nivelServicio=22). PDF page 4-5. */
    export interface GuiaRCERequest extends GuiaBase {
      nivelServicio: 22
      valorRecaudar: number             // required for RCE
    }

    export type CreateGuiaRequest = GuiaEstandarRequest | GuiaRCERequest

    export interface GuiaResponse {
      numero_guia: string               // 11 dígitos per Etiquetas PDF
      [key: string]: unknown
    }

    // ---------------------------------------------------------------------------
    // Impresión de etiquetas (PDF: Servicio etiquetas.pdf)
    // ---------------------------------------------------------------------------
    export interface ImprimirEtiquetaRequest {
      /** Per PDF: tipo "55" is the documented value (other tipos discover-on-the-go). */
      tipo_etiqueta: string
      /** Array de números de guía (11 dígitos cada uno). */
      guias: string[]
    }

    export interface ImprimirEtiquetaResponse {
      /** base64-encoded PDF. */
      etiqueta_base64?: string
      [key: string]: unknown
    }

    // ---------------------------------------------------------------------------
    // Webhook Pub/Sub envelope (PDF: Notificacion-push-Tracking-v3.pdf)
    // Verified against Google Cloud Pub/Sub push docs.
    // ---------------------------------------------------------------------------
    export interface PubSubEnvelope {
      message: {
        data: string                    // base64-encoded JSON payload
        messageId?: string
        publishTime?: string             // RFC3339
        attributes?: Record<string, string>
        orderingKey?: string
      }
      subscription?: string
      deliveryAttempt?: number
    }

    /** Without novedad — delivered event example. PDF page 1. */
    export interface CoordinadoraEventWithoutNovedad {
      tracking_number: string           // 11 digits
      referencia: string
      comment: string                    // e.g., "ENTREGADA"
      codigo: string                     // status code as string
      codigo_cliente: string
      fecha: string                      // YYYY-MM-DD
      hora: string                       // HH:MM:SS.microseconds
      anterior: string                   // empty when first event
      referencia_anterior: string        // empty when first event
    }

    /** With novedad — cancellation example. PDF page 2 (adds 4 fields). */
    export interface CoordinadoraEventWithNovedad extends CoordinadoraEventWithoutNovedad {
      codigo_estado: string              // estado actual when novedad fires
      desc_estado: string                // human label
      nit_cliente: string                // NIT for multi-tenant routing (D-09)
      div_cliente: string
      vinculo_guia: string               // optional linked guide (Q4 — persist raw)
    }

    export type CoordinadoraEvent =
      | CoordinadoraEventWithoutNovedad
      | CoordinadoraEventWithNovedad
    ```

    Do NOT add any imports — this is a pure type file. Do NOT use `any`.

    Commit message: `feat(coordinadora-api): add types module mirroring PDFs`
  </action>
  <verify>
    <automated>test -f src/lib/carriers/coordinadora/types.ts &amp;&amp; npx tsc --noEmit src/lib/carriers/coordinadora/types.ts 2&gt;&amp;1 | grep -qE "^$|error TS" &amp;&amp; ! grep -E ": any\b|: any;" src/lib/carriers/coordinadora/types.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/types.ts` exists
    - Exports `Env` as literal union `'test' | 'prod'` (grep `export type Env = 'test' | 'prod'`)
    - Exports `CoordinadoraEvent` (grep `export type CoordinadoraEvent`)
    - Exports `CoordinadoraEventWithoutNovedad`, `CoordinadoraEventWithNovedad`, `PubSubEnvelope`
    - Exports `CotizarRequest` (union of CO + MX), `CotizarResponse`
    - Exports `GuiaEstandarRequest` (`nivelServicio: 1`), `GuiaRCERequest` (`nivelServicio: 22`)
    - Exports `CreateGuiaRequest` (union), `GuiaResponse`
    - Exports `ImprimirEtiquetaRequest`, `ImprimirEtiquetaResponse`
    - Exports `OAuthTokenResponse` with both `access_token?` AND `acces_token?` (Pitfall 1)
    - Contains ZERO `any` type usage (grep returns 0)
    - Contains ZERO runtime imports (grep `^import` returns 0 — pure type file)
    - TypeScript compiles cleanly (npx tsc --noEmit on the file alone has no errors)
  </acceptance_criteria>
  <done>Pure type module created. Downstream files (client, wrappers, route, envelope decoder) can import these types without circular deps or runtime side effects.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create status-codes.ts with enum + mapping functions + Vitest tests</name>
  <files>src/lib/carriers/coordinadora/status-codes.ts, src/lib/carriers/coordinadora/__tests__/status-codes.test.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Code Examples lines 997-1032 (verbatim source)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-18 (lines 71-82 — locked enum)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-20 (lines 87 — descubrir on-the-go for novedades)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pitfall 9 (lines 938-946 — NO code 7)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 249-278 (status-codes pattern)
  </read_first>
  <behavior>
    - `mapStatusCode('0')` → `'GUIA_NO_EXISTE'`
    - `mapStatusCode('6')` → `'ENTREGADA'`
    - `mapStatusCode('7')` → `'DESCONOCIDO'` (Pitfall 9 — no code 7 in spec)
    - `mapStatusCode('999')` → `'DESCONOCIDO'` (unknown code)
    - `mapStatusCode('')` → `'DESCONOCIDO'` (empty)
    - `mapNovedadCode('801')` → `'Pedido Cancelado'`
    - `mapNovedadCode('999')` → `'desconocida (999)'` (D-20 — graceful fallback)
    - All 9 known status codes covered (0,1,2,3,4,5,6,8,9 — NOT 7)
  </behavior>
  <action>
    **First create `src/lib/carriers/coordinadora/__tests__/status-codes.test.ts`** (TDD — write tests first):

    ```typescript
    import { describe, it, expect } from 'vitest'
    import {
      COORDINADORA_STATUS_CODES,
      mapStatusCode,
      mapNovedadCode,
      COORDINADORA_NOVEDAD_CODES,
    } from '../status-codes'

    describe('mapStatusCode (D-18)', () => {
      const KNOWN: Array<[string, string]> = [
        ['0', 'GUIA_NO_EXISTE'],
        ['1', 'A_RECIBIR_POR_COORDINADORA'],
        ['2', 'EN_TERMINAL_ORIGEN'],
        ['3', 'EN_TRANSPORTE'],
        ['4', 'EN_TERMINAL_DESTINO'],
        ['5', 'EN_REPARTO'],
        ['6', 'ENTREGADA'],
        ['8', 'CERRADO_INCIDENCIA'],
        ['9', 'EN_PUNTO_DROP'],
      ]

      it.each(KNOWN)('maps known code %s → %s', (code, label) => {
        expect(mapStatusCode(code)).toBe(label)
      })

      it('returns DESCONOCIDO for code 7 (Pitfall 9 — not in spec)', () => {
        expect(mapStatusCode('7')).toBe('DESCONOCIDO')
      })

      it('returns DESCONOCIDO for unknown codes', () => {
        expect(mapStatusCode('999')).toBe('DESCONOCIDO')
        expect(mapStatusCode('')).toBe('DESCONOCIDO')
        expect(mapStatusCode('abc')).toBe('DESCONOCIDO')
      })

      it('COORDINADORA_STATUS_CODES has exactly 9 entries (no code 7)', () => {
        expect(Object.keys(COORDINADORA_STATUS_CODES)).toHaveLength(9)
        expect(COORDINADORA_STATUS_CODES).not.toHaveProperty('7')
      })
    })

    describe('mapNovedadCode (D-20)', () => {
      it('maps known novedad 801 → Pedido Cancelado', () => {
        expect(mapNovedadCode('801')).toBe('Pedido Cancelado')
      })

      it('returns desconocida-with-code for unknown novedades (graceful fallback)', () => {
        expect(mapNovedadCode('999')).toBe('desconocida (999)')
        expect(mapNovedadCode('')).toBe('desconocida ()')
      })

      it('COORDINADORA_NOVEDAD_CODES has exactly 1 known entry (D-20 discover-on-the-go)', () => {
        expect(Object.keys(COORDINADORA_NOVEDAD_CODES)).toHaveLength(1)
        expect(COORDINADORA_NOVEDAD_CODES['801']).toBe('Pedido Cancelado')
      })
    })
    ```

    **Then create `src/lib/carriers/coordinadora/status-codes.ts`** (verbatim from RESEARCH §Code Examples):

    ```typescript
    /**
     * Coordinadora status code mapping (D-18, D-20).
     * Pure module — no runtime side effects.
     */

    export const COORDINADORA_STATUS_CODES = {
      '0': 'GUIA_NO_EXISTE',
      '1': 'A_RECIBIR_POR_COORDINADORA',
      '2': 'EN_TERMINAL_ORIGEN',
      '3': 'EN_TRANSPORTE',
      '4': 'EN_TERMINAL_DESTINO',
      '5': 'EN_REPARTO',
      '6': 'ENTREGADA',
      // 7 not in spec (Pitfall 9)
      '8': 'CERRADO_INCIDENCIA',
      '9': 'EN_PUNTO_DROP',
    } as const

    export type CoordinadoraStatusLabel =
      typeof COORDINADORA_STATUS_CODES[keyof typeof COORDINADORA_STATUS_CODES]

    export function mapStatusCode(codigo: string): CoordinadoraStatusLabel | 'DESCONOCIDO' {
      return (COORDINADORA_STATUS_CODES as Record<string, CoordinadoraStatusLabel>)[codigo]
        ?? 'DESCONOCIDO'
    }

    /**
     * Known novedad codes (D-20 — extend as Coordinadora reveals more).
     * Unknown novedades stored raw with graceful label fallback.
     */
    export const COORDINADORA_NOVEDAD_CODES: Record<string, string> = {
      '801': 'Pedido Cancelado',
    }

    export function mapNovedadCode(codigo: string): string {
      return COORDINADORA_NOVEDAD_CODES[codigo] ?? `desconocida (${codigo})`
    }
    ```

    Run `npx vitest run src/lib/carriers/coordinadora/__tests__/status-codes.test.ts` — expect all tests green.

    Commit message: `feat(coordinadora-api): add status-codes mapping + tests`
  </action>
  <verify>
    <automated>npx vitest run src/lib/carriers/coordinadora/__tests__/status-codes.test.ts 2&gt;&amp;1 | grep -E "Test Files\s+1 passed|✓"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/status-codes.ts` exists
    - File `src/lib/carriers/coordinadora/__tests__/status-codes.test.ts` exists
    - Exports `COORDINADORA_STATUS_CODES`, `CoordinadoraStatusLabel`, `mapStatusCode`, `COORDINADORA_NOVEDAD_CODES`, `mapNovedadCode`
    - `COORDINADORA_STATUS_CODES` has exactly 9 keys: '0','1','2','3','4','5','6','8','9' (NO '7')
    - Vitest run for `status-codes.test.ts` passes 100%
    - `mapStatusCode('7')` returns `'DESCONOCIDO'` (verified by test)
    - `mapNovedadCode('999')` returns `'desconocida (999)'` (verified by test)
    - No `import` of fs/path/createAdminClient (grep `import.*supabase\|import.*admin` returns 0)
  </acceptance_criteria>
  <done>Status codes mapped + tested. Webhook decoder and downstream Inngest processor can lookup labels.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create tenant.ts with NIT→workspace resolver + Vitest tests</name>
  <files>src/lib/carriers/coordinadora/tenant.ts, src/lib/carriers/coordinadora/__tests__/tenant.test.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 6 lines 771-792 (verbatim source)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-09 (lines 45 — locked logic)
    - .planning/standalone/coordinadora-api-integration/CONTEXT.md §D-01 (line 35 — Somnio workspace UUID)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md §No Analog Found lines 783-787 (justification for hardcoded map)
  </read_first>
  <behavior>
    - `resolveWorkspaceFromNit('902052328')` → `'a3843b3f-c337-4836-92b5-89c58bb98490'` (Somnio)
    - `resolveWorkspaceFromNit(null)` → `'a3843b3f-c337-4836-92b5-89c58bb98490'` (V1 single-tenant fallback — Pattern 6 lines 781-789)
    - `resolveWorkspaceFromNit('999999999')` → `null` (unmatched NIT — webhook handler drops with `no_workspace_match`)
    - `resolveWorkspaceFromNit('')` → `null` (empty string is treated as no-match, NOT as the null fallback — explicit "" means Coordinadora sent a value we don't recognize)
  </behavior>
  <action>
    **First create `src/lib/carriers/coordinadora/__tests__/tenant.test.ts`**:

    ```typescript
    import { describe, it, expect } from 'vitest'
    import { resolveWorkspaceFromNit, SOMNIO_WORKSPACE_ID, MORFX_NIT } from '../tenant'

    describe('resolveWorkspaceFromNit (D-09)', () => {
      it('Somnio workspace UUID is the locked CONTEXT.md D-01 value', () => {
        expect(SOMNIO_WORKSPACE_ID).toBe('a3843b3f-c337-4836-92b5-89c58bb98490')
      })

      it('Morfx NIT is 902052328 (D-15 locked)', () => {
        expect(MORFX_NIT).toBe('902052328')
      })

      it('returns Somnio workspace for Morfx NIT (happy path)', () => {
        expect(resolveWorkspaceFromNit('902052328')).toBe(SOMNIO_WORKSPACE_ID)
      })

      it('returns Somnio fallback for null nit_cliente (PDF page 1 shape — no novedad)', () => {
        // V1 single-tenant fallback: events without novedad don't include nit_cliente.
        // Pattern 6 lines 781-789 — explicit fallback to Somnio.
        expect(resolveWorkspaceFromNit(null)).toBe(SOMNIO_WORKSPACE_ID)
      })

      it('returns null for unmatched NIT (V2 will add mapping table)', () => {
        expect(resolveWorkspaceFromNit('999999999')).toBeNull()
      })

      it('treats empty string as unmatched (NOT as null fallback)', () => {
        // Explicit "" from Coordinadora is a value we don't recognize.
        expect(resolveWorkspaceFromNit('')).toBeNull()
      })
    })
    ```

    **Then create `src/lib/carriers/coordinadora/tenant.ts`** (RESEARCH §Pattern 6 verbatim with explicit constants exported for testing):

    ```typescript
    /**
     * Coordinadora multi-tenant resolver (D-09).
     * V1: hardcoded NIT → workspace_id constant map (single-tenant Somnio).
     * V2: replace with `coordinadora_tenant_mapping` table lookup.
     *
     * Pure function — no env reads, no DB, no side effects.
     */

    /** Somnio workspace UUID (D-01 locked). */
    export const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'

    /** Morfx NIT (D-15 — env var COORDINADORA_NIT_CLIENTE matches this). */
    export const MORFX_NIT = '902052328'

    /** V1 hardcoded mapping. Add entries here for V1 multi-workspace; migrate to DB for V2. */
    const NIT_TO_WORKSPACE: Record<string, string> = {
      [MORFX_NIT]: SOMNIO_WORKSPACE_ID,
    }

    /**
     * Resolve nit_cliente → workspace_id.
     *
     * Returns null for unmatched values (caller should ACK 200 + drop with
     * observability event `webhook_drop_no_match` — D-09).
     *
     * Special case: `null` input falls back to Somnio (events without novedad
     * don't carry nit_cliente per PDF page 1 shape). Empty string is NOT the
     * same — empty string means Coordinadora explicitly sent a blank value,
     * which is a value we don't recognize.
     */
    export function resolveWorkspaceFromNit(nitCliente: string | null): string | null {
      if (nitCliente === null) {
        // V1 single-tenant fallback (Pattern 6 lines 781-789).
        // V2: drop this branch; require nit_cliente always populated.
        return SOMNIO_WORKSPACE_ID
      }
      return NIT_TO_WORKSPACE[nitCliente] ?? null
    }
    ```

    Run `npx vitest run src/lib/carriers/coordinadora/__tests__/tenant.test.ts` — expect all tests green.

    Commit message: `feat(coordinadora-api): add tenant resolver + tests`
  </action>
  <verify>
    <automated>npx vitest run src/lib/carriers/coordinadora/__tests__/tenant.test.ts 2&gt;&amp;1 | grep -E "Test Files\s+1 passed|✓"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/tenant.ts` exists
    - File `src/lib/carriers/coordinadora/__tests__/tenant.test.ts` exists
    - Exports `resolveWorkspaceFromNit`, `SOMNIO_WORKSPACE_ID`, `MORFX_NIT`
    - `SOMNIO_WORKSPACE_ID === 'a3843b3f-c337-4836-92b5-89c58bb98490'` (exact match — grep returns 1)
    - `MORFX_NIT === '902052328'` (exact match — grep returns 1)
    - Vitest run for `tenant.test.ts` passes 100% (all 6 cases)
    - File contains ZERO imports (pure function) — grep `^import` returns 0
    - File contains ZERO env var reads (grep `process\.env` returns 0)
  </acceptance_criteria>
  <done>Multi-tenant resolver implemented with V1 hardcoded Somnio fallback + V2 expansion path documented. Webhook handler can call it directly.</done>
</task>

</tasks>

<verification>
- All 3 files created in `src/lib/carriers/coordinadora/`
- Both Vitest suites pass: `npx vitest run src/lib/carriers/coordinadora/__tests__/`
- `npx tsc --noEmit` clean for the module (verified via Plan 04/05 dependency chain)
</verification>

<success_criteria>
1. `types.ts`, `status-codes.ts`, `tenant.ts` exist with verbatim content from RESEARCH §Pattern 2 + 6 + Code Examples
2. Both test files pass (status-codes 12 tests, tenant 6 tests)
3. No `any` types, no runtime imports in `types.ts`, no env var reads in `tenant.ts`
4. Plans 04, 05, 07, 08 can now import from this module
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/03-SUMMARY.md` documenting:
- Files created (3 source + 2 test)
- Vitest output (paste tail showing pass count)
- Commit SHAs (1 per task)
- Confirmation that types compile clean (`npx tsc --noEmit src/lib/carriers/coordinadora/types.ts`)
</output>
