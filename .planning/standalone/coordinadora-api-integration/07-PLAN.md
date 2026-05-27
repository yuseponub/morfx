---
phase: coordinadora-api-integration
plan: 07
type: execute
wave: 2
depends_on: [03]
files_modified:
  - src/lib/carriers/coordinadora/pub-sub-envelope.ts
  - src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts
  - src/lib/carriers/coordinadora/index.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "isPubSubEnvelope returns true for valid {message:{data:'<b64>'}} and false otherwise"
    - "decodePubSubPayload returns parsed CoordinadoraEvent on valid base64+JSON+shape"
    - "decodePubSubPayload returns null on base64 decode failure, JSON parse failure, missing required field"
    - "isEventWithNovedad type-guard discriminates the union on presence of codigo_estado"
    - "Fixtures from real PDF examples (page 1 entregada, page 2 novedad cancelada) decode correctly"
  artifacts:
    - path: "src/lib/carriers/coordinadora/pub-sub-envelope.ts"
      provides: "Pub/Sub envelope type-guard + base64-JSON decoder + novedad-event type-guard"
      exports: ["isPubSubEnvelope", "decodePubSubPayload", "isEventWithNovedad"]
    - path: "src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts"
      provides: "Vitest suite with PDF page 1 + page 2 fixtures + malformed-input cases"
  key_links:
    - from: "pub-sub-envelope.ts"
      to: "types.ts (Plan 03 — PubSubEnvelope, CoordinadoraEvent, CoordinadoraEventWithNovedad)"
      via: "import type-only"
      pattern: "no runtime imports outside Node Buffer"
---

<objective>
Implement the Pub/Sub envelope type-guard + base64-JSON decoder + event-variant discriminator. This module is consumed by the webhook route handler (Plan 08) to validate inbound Coordinadora webhooks.

Per D-10: defense relies on strict envelope shape validation (no HMAC). This module enforces that.

Per RESEARCH §Pattern 2 lines 326-408: implementation is VERBATIM from the spec. Tests use fixtures derived from `Notificacion-push-Tracking-v3.pdf` page 1 (entregada — no novedad) + page 2 (cancelada — with novedad).

Also extend `src/lib/carriers/coordinadora/index.ts` (created in Plan 05) to re-export the new functions.
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
@src/lib/carriers/coordinadora/types.ts

<interfaces>
From src/lib/carriers/coordinadora/types.ts (Plan 03):

```typescript
export interface PubSubEnvelope {
  message: {
    data: string
    messageId?: string
    publishTime?: string
    attributes?: Record<string, string>
    orderingKey?: string
  }
  subscription?: string
  deliveryAttempt?: number
}

export interface CoordinadoraEventWithoutNovedad {
  tracking_number: string
  referencia: string
  comment: string
  codigo: string
  codigo_cliente: string
  fecha: string
  hora: string
  anterior: string
  referencia_anterior: string
}

export interface CoordinadoraEventWithNovedad extends CoordinadoraEventWithoutNovedad {
  codigo_estado: string
  desc_estado: string
  nit_cliente: string
  div_cliente: string
  vinculo_guia: string
}

export type CoordinadoraEvent = CoordinadoraEventWithoutNovedad | CoordinadoraEventWithNovedad
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write pub-sub-envelope.test.ts with PDF fixtures (RED)</name>
  <files>src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 2 lines 326-408 (canonical implementation)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 282-326 (decoder pattern)
    - .planning/standalone/coordinadora-api-integration/reference/Notificacion-push-Tracking-v3.pdf (page 1 entregada fixture + page 2 novedad cancelada fixture)
  </read_first>
  <behavior>
    - Test 1: valid envelope with PDF page 1 payload (entregada, no novedad) → decode returns event with comment='ENTREGADA'
    - Test 2: valid envelope with PDF page 2 payload (novedad cancelada) → decode returns event with codigo_estado, desc_estado, nit_cliente
    - Test 3: isEventWithNovedad discriminates correctly (page 1 → false, page 2 → true)
    - Test 4: missing `message` key → isPubSubEnvelope false
    - Test 5: `message.data` not a string → isPubSubEnvelope false
    - Test 6: `message.data` empty string → isPubSubEnvelope false
    - Test 7: base64 decode failure → decodePubSubPayload null
    - Test 8: invalid JSON inside base64 → decodePubSubPayload null
    - Test 9: missing required field (no tracking_number) → decodePubSubPayload null
    - Test 10: extra/unknown fields preserved (forward-compatible)
  </behavior>
  <action>
    Create `src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts`:

    ```ts
    import { describe, it, expect } from 'vitest'
    import {
      isPubSubEnvelope,
      decodePubSubPayload,
      isEventWithNovedad,
    } from '../pub-sub-envelope'
    import type { CoordinadoraEventWithNovedad } from '../types'

    // ---------------------------------------------------------------------------
    // Fixtures from .planning/standalone/coordinadora-api-integration/reference/Notificacion-push-Tracking-v3.pdf
    // ---------------------------------------------------------------------------

    /** PDF page 1: ENTREGADA (no novedad). */
    const PAYLOAD_ENTREGADA = {
      tracking_number: '12345678901',
      referencia: 'AA1',
      comment: 'ENTREGADA',
      codigo: '6',
      codigo_cliente: 'CLI-001',
      fecha: '2026-05-26',
      hora: '13:51:43.456818',
      anterior: '',
      referencia_anterior: '',
    }

    /** PDF page 2: Pedido Cancelado (novedad 801, estado actual 5 = EN REPARTO). */
    const PAYLOAD_NOVEDAD_CANCELADA = {
      tracking_number: '12345678902',
      referencia: 'AA2',
      comment: 'Pedido Cancelado',
      codigo: '801',
      codigo_cliente: 'CLI-001',
      fecha: '2026-05-26',
      hora: '14:22:11.789012',
      anterior: '5',
      referencia_anterior: 'AA1',
      codigo_estado: '5',
      desc_estado: 'EN REPARTO',
      nit_cliente: '902052328',
      div_cliente: '01',
      vinculo_guia: '',
    }

    function envelopeFor(payload: unknown): { message: { data: string; messageId: string } } {
      return {
        message: {
          data: Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64'),
          messageId: 'mid-test-' + Math.random().toString(36).slice(2, 8),
        },
      }
    }

    describe('isPubSubEnvelope (D-10 strict shape validation)', () => {
      it('accepts canonical envelope with non-empty data', () => {
        expect(isPubSubEnvelope(envelopeFor(PAYLOAD_ENTREGADA))).toBe(true)
      })

      it('rejects missing message', () => {
        expect(isPubSubEnvelope({})).toBe(false)
        expect(isPubSubEnvelope({ msg: { data: 'abc' } })).toBe(false)
      })

      it('rejects message.data not a string', () => {
        expect(isPubSubEnvelope({ message: { data: 123 } })).toBe(false)
        expect(isPubSubEnvelope({ message: { data: null } })).toBe(false)
      })

      it('rejects empty message.data', () => {
        expect(isPubSubEnvelope({ message: { data: '' } })).toBe(false)
      })

      it('rejects null / non-object input', () => {
        expect(isPubSubEnvelope(null)).toBe(false)
        expect(isPubSubEnvelope('string')).toBe(false)
        expect(isPubSubEnvelope(42)).toBe(false)
      })
    })

    describe('decodePubSubPayload — PDF fixtures', () => {
      it('decodes PDF page 1 ENTREGADA (no novedad)', () => {
        const decoded = decodePubSubPayload(envelopeFor(PAYLOAD_ENTREGADA))
        expect(decoded).not.toBeNull()
        expect(decoded?.tracking_number).toBe('12345678901')
        expect(decoded?.comment).toBe('ENTREGADA')
        expect(decoded?.codigo).toBe('6')
      })

      it('decodes PDF page 2 Pedido Cancelado (with novedad)', () => {
        const decoded = decodePubSubPayload(envelopeFor(PAYLOAD_NOVEDAD_CANCELADA))
        expect(decoded).not.toBeNull()
        const novedad = decoded as CoordinadoraEventWithNovedad
        expect(novedad.codigo).toBe('801')
        expect(novedad.codigo_estado).toBe('5')
        expect(novedad.desc_estado).toBe('EN REPARTO')
        expect(novedad.nit_cliente).toBe('902052328')
        expect(novedad.vinculo_guia).toBe('')
      })

      it('preserves extra/unknown fields (forward-compatible)', () => {
        const decoded = decodePubSubPayload(envelopeFor({
          ...PAYLOAD_ENTREGADA,
          futuro_campo_x: 'preservado',
        }))
        expect(decoded).not.toBeNull()
        expect((decoded as Record<string, unknown>).futuro_campo_x).toBe('preservado')
      })
    })

    describe('decodePubSubPayload — error cases', () => {
      it('returns null on invalid base64', () => {
        expect(decodePubSubPayload({ message: { data: '!!!not-base64!!!@@@' } } as never)).toBeNull()
        // Most invalid base64 in Buffer.from is lenient, so we test with an obviously bad JSON-after-decode case
        expect(decodePubSubPayload({ message: { data: Buffer.from('not-json{').toString('base64') } } as never)).toBeNull()
      })

      it('returns null when decoded JSON is not an object', () => {
        const arr = Buffer.from(JSON.stringify(['array', 'instead', 'of', 'object'])).toString('base64')
        expect(decodePubSubPayload({ message: { data: arr } } as never)).toBeNull()
        const str = Buffer.from(JSON.stringify('just-a-string')).toString('base64')
        expect(decodePubSubPayload({ message: { data: str } } as never)).toBeNull()
      })

      it('returns null when required field tracking_number is missing', () => {
        const { tracking_number, ...rest } = PAYLOAD_ENTREGADA
        void tracking_number
        expect(decodePubSubPayload(envelopeFor(rest))).toBeNull()
      })

      it('returns null when required field codigo is missing', () => {
        const { codigo, ...rest } = PAYLOAD_ENTREGADA
        void codigo
        expect(decodePubSubPayload(envelopeFor(rest))).toBeNull()
      })

      it('returns null when required field fecha is missing', () => {
        const { fecha, ...rest } = PAYLOAD_ENTREGADA
        void fecha
        expect(decodePubSubPayload(envelopeFor(rest))).toBeNull()
      })

      it('returns null when required field hora is missing', () => {
        const { hora, ...rest } = PAYLOAD_ENTREGADA
        void hora
        expect(decodePubSubPayload(envelopeFor(rest))).toBeNull()
      })
    })

    describe('isEventWithNovedad (discriminator)', () => {
      it('returns false for PDF page 1 (no codigo_estado)', () => {
        const decoded = decodePubSubPayload(envelopeFor(PAYLOAD_ENTREGADA))!
        expect(isEventWithNovedad(decoded)).toBe(false)
      })

      it('returns true for PDF page 2 (with codigo_estado)', () => {
        const decoded = decodePubSubPayload(envelopeFor(PAYLOAD_NOVEDAD_CANCELADA))!
        expect(isEventWithNovedad(decoded)).toBe(true)
      })
    })
    ```

    Save the file. Tests will fail until Task 2.

    Commit message: `test(coordinadora-api): add pub-sub-envelope test suite with PDF fixtures (RED)`
  </action>
  <verify>
    <automated>test -f src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts &amp;&amp; grep -c "  it(" src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts | awk '{ exit ($1 &gt;= 10 ? 0 : 1) }'</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts` exists
    - Contains 10+ `it(` cases
    - Fixtures `PAYLOAD_ENTREGADA` and `PAYLOAD_NOVEDAD_CANCELADA` defined
    - File committed (RED — pub-sub-envelope.ts doesn't exist yet)
  </acceptance_criteria>
  <done>PDF-derived fixture tests committed. Task 2 implements module to GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create pub-sub-envelope.ts (GREEN)</name>
  <files>src/lib/carriers/coordinadora/pub-sub-envelope.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 2 lines 326-408 (verbatim canonical)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 282-326 (decoder pattern)
    - src/lib/carriers/coordinadora/types.ts (Plan 03 — PubSubEnvelope + CoordinadoraEvent imports)
    - src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts (Task 1 — assertions)
  </read_first>
  <behavior>
    - Pure functions: no DB, no fetch, no env vars
    - isPubSubEnvelope: type-guard, returns boolean
    - decodePubSubPayload: try/catch around Buffer.from + JSON.parse, returns CoordinadoraEvent | null
    - isEventWithNovedad: type-guard discriminating on presence of codigo_estado as string
  </behavior>
  <action>
    Create `src/lib/carriers/coordinadora/pub-sub-envelope.ts` with VERBATIM content from RESEARCH §Pattern 2:

    ```ts
    /**
     * Google Cloud Pub/Sub push envelope validation + decode.
     *
     * Source: Coordinadora's webhook is delivered as a Pub/Sub push envelope.
     * Reference: .planning/standalone/coordinadora-api-integration/reference/Notificacion-push-Tracking-v3.pdf
     *
     * Pure module — no fetch, no DB, no env reads (D-10 defense via strict shape).
     */

    import type {
      PubSubEnvelope,
      CoordinadoraEvent,
      CoordinadoraEventWithNovedad,
    } from './types'

    /**
     * Type-guard: verify the value is a Pub/Sub push envelope.
     *
     * Pub/Sub envelope shape: { message: { data: <base64-string>, ... }, subscription?, ... }
     * data must be a non-empty string.
     */
    export function isPubSubEnvelope(value: unknown): value is PubSubEnvelope {
      if (typeof value !== 'object' || value === null) return false
      const v = value as Record<string, unknown>
      if (typeof v.message !== 'object' || v.message === null) return false
      const m = v.message as Record<string, unknown>
      return typeof m.data === 'string' && m.data.length > 0
    }

    /**
     * Decode a Pub/Sub envelope into a CoordinadoraEvent.
     *
     * Returns null when:
     *   - base64 decode fails
     *   - JSON parse fails
     *   - decoded value isn't an object
     *   - any required field (tracking_number, codigo, fecha, hora) is missing or not a string
     *
     * Caller (route handler) treats null as ACK + drop (Pub/Sub at-least-once means
     * eternal redelivery of a malformed message is undesirable).
     */
    export function decodePubSubPayload(envelope: PubSubEnvelope): CoordinadoraEvent | null {
      let rawJson: string
      try {
        rawJson = Buffer.from(envelope.message.data, 'base64').toString('utf-8')
      } catch {
        return null
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rawJson)
      } catch {
        return null
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null
      }

      const p = parsed as Record<string, unknown>
      if (
        typeof p.tracking_number !== 'string' ||
        typeof p.codigo !== 'string' ||
        typeof p.fecha !== 'string' ||
        typeof p.hora !== 'string'
      ) {
        return null
      }

      return parsed as CoordinadoraEvent
    }

    /**
     * Discriminator type-guard.
     *
     * Events with novedad (PDF page 2 shape) have `codigo_estado` populated.
     * Events without novedad (PDF page 1 shape) do not have `codigo_estado`.
     */
    export function isEventWithNovedad(
      e: CoordinadoraEvent,
    ): e is CoordinadoraEventWithNovedad {
      return (
        'codigo_estado' in e &&
        typeof (e as CoordinadoraEventWithNovedad).codigo_estado === 'string'
      )
    }
    ```

    Run `npx vitest run src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts` — expect 10+ tests green.

    Commit message: `feat(coordinadora-api): add pub-sub-envelope decoder (GREEN)`
  </action>
  <verify>
    <automated>npx vitest run src/lib/carriers/coordinadora/__tests__/pub-sub-envelope.test.ts 2&gt;&amp;1 | tail -8 | grep -E "Test Files\s+1 passed"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/pub-sub-envelope.ts` exists
    - Exports `isPubSubEnvelope`, `decodePubSubPayload`, `isEventWithNovedad`
    - All 10+ test cases pass
    - Zero runtime imports outside Node `Buffer` (grep `^import` returns only type-only imports from `./types`)
    - Zero `any` types
  </acceptance_criteria>
  <done>Pub/Sub envelope decoder implemented + tested with PDF fixtures. Webhook route handler (Plan 08) can import and use these.</done>
</task>

<task type="auto">
  <name>Task 3: Extend src/lib/carriers/coordinadora/index.ts barrel</name>
  <files>src/lib/carriers/coordinadora/index.ts</files>
  <read_first>
    - src/lib/carriers/coordinadora/index.ts (Plan 05 — current state)
    - src/lib/carriers/coordinadora/pub-sub-envelope.ts (Task 2 — what to re-export)
  </read_first>
  <action>
    Edit `src/lib/carriers/coordinadora/index.ts` and add this re-export block (place it after the existing exports, before the type re-export block):

    ```ts
    // Pub/Sub envelope helpers (Plan 07)
    export {
      isPubSubEnvelope,
      decodePubSubPayload,
      isEventWithNovedad,
    } from './pub-sub-envelope'
    ```

    Verify the full barrel still compiles: `npx tsc --noEmit` — no errors on this file.

    Commit message: `feat(coordinadora-api): re-export pub-sub-envelope helpers from barrel`
  </action>
  <verify>
    <automated>grep -c "isPubSubEnvelope\|decodePubSubPayload\|isEventWithNovedad" src/lib/carriers/coordinadora/index.ts | awk '{ exit ($1 &gt;= 3 ? 0 : 1) }'</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/carriers/coordinadora/index.ts` re-exports the 3 helpers
    - Downstream consumers can `import { isPubSubEnvelope, decodePubSubPayload, isEventWithNovedad } from '@/lib/carriers/coordinadora'`
    - Barrel still compiles clean
  </acceptance_criteria>
  <done>Barrel updated. Plan 08 route handler can import everything from the module root.</done>
</task>

</tasks>

<verification>
- Full coordinadora `__tests__/` suite passes (status-codes + tenant + client-token-cache + wrappers + pub-sub-envelope ≈ 40+ tests)
- `npx tsc --noEmit` clean
</verification>

<success_criteria>
1. `pub-sub-envelope.ts` + test file + barrel update committed (3 commits)
2. PDF fixtures (page 1 + page 2) decode correctly
3. All error cases return null gracefully
4. Forward-compatible (extra fields preserved)
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/07-SUMMARY.md` documenting:
- Files created (pub-sub-envelope.ts + test + barrel update)
- Vitest pass count (full coordinadora module suite)
- Commit SHAs (3)
- Note: PDF fixtures are synthesized from PDF examples; real Pub/Sub messages will be validated in Wave 3 smoke 1
</output>
