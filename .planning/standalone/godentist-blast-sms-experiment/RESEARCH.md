# godentist-blast-sms-experiment - Research

**Researched:** 2026-04-28
**Domain:** Bulk WhatsApp + SMS campaign with A/B experimentation
**Mode:** Implementation (not architectural — 17 D-decisions already locked)
**Confidence:** HIGH

## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01..D-17 in CONTEXT.md. Verbatim summary of the ones that gate implementation:

- **D-01:** Re-enviar a todos sin dedup vs campaña anterior.
- **D-02:** Sin filtro de calidad — solo normalizable Colombian mobile.
- **D-03:** Parser xlsx con `npm i xlsx` (idempotente).
- **D-04:** CSV de bounces final.
- **D-05:** Asignación A/B = sort hash(phone) within daily slice → 900/900 split.
- **D-06:** Tracking en JSON local borrable (no DB schema).
- **D-07:** Métrica = inbound message en 3d.
- **D-08:** SMS sale al mismo tiempo que WA (~2s delay), sin short-circuit.
- **D-09:** Domain layer billing — `sendSMS(ctx, params)` from `src/lib/domain/sms.ts`.
- **D-10:** Texto SMS Opción B con `{nombre}` interpolado, sin acentos, sin emojis.
- **D-11:** Fallback sin nombre si `template + name > 160`.
- **D-12:** `source='campaign'` activa marketing window guard (8AM-9PM Colombia).
- **D-13:** 5 pre-flight checks obligatorios (balance Onurix, balance morfx, is_active, test 5 SMS, template aprobado).
- **D-14:** Cron lun-vie 10:30 (`30 10 * * 1-5`).
- **D-15:** 1 cron run diario.
- **D-16:** Tasa 60/min (`DELAY_MS=1000`).
- **D-17:** Nuevo script `scripts/godentist-blast-experiment.ts`, NO contaminar el existing.

### Claude's Discretion
- Estructura JSON tracking (campos, formato)
- Lib hashing (`crypto.createHash('sha256')`)
- Implementación fallback nombre largo
- Manejo errores Onurix 4xx/5xx
- Logging por run
- Cleanup automático JSON
- Reporte análisis intermedio

### Deferred Ideas (OUT OF SCOPE)
UI super-admin, Inngest queue, tabla `campaign_experiment_assignments`, métrica agendamiento Dentos, sender ID custom, dedup vs campaña anterior, filtros de calidad, tags CRM, SMS retrasado, precarga `?text=`, 2 cron runs/día.

---

## Summary

1. **xlsx@0.18.5 ya está instalado en node_modules** — el `npm i xlsx` de D-03 es no-op. [VERIFIED: `node_modules/xlsx/package.json` exists]
2. **Lista real es 8.832 rows pero solo 8.284 phones únicos normalizables** — 413 duplicates intra-list + 127 inválidos (formato múltiple, foreign, longitud incorrecta). El plan debe asumir ~8.284, NO 8.832. [VERIFIED: read full xlsx in research session]
3. **CRÍTICO — D-10/D-11 ignoran el problema de encoding accents → UCS-2.** 406 nombres en la lista contienen acentos (`Joaquín`, `José`, `María`, `Andrés`) o `Ñ`. Estos al ser interpolados en `Hola {nombre}, ...` vuelven el mensaje UCS-2 (70 chars/segmento) → 2 segmentos → debita $194 COP, no $97 COP. La fórmula de fallback "len > 160" es INSUFICIENTE — debe agregar regex GSM-7 check antes de decidir interpolación. [VERIFIED: `src/lib/sms/utils.ts:51` regex `/^[\x20-\x7E\n\r]*$/`]
4. **D-12 strict marketing source — `source='campaign'` activa el guard 8AM-9PM.** Cron 10:30 cae dentro de ventana ✓. Pero si por algún motivo el run se atrasa después de 9PM (cron miss + retry manual), el guard rejectará TODOS los SMS con error "fuera de horario". [VERIFIED: `src/lib/sms/utils.ts:69` `isTransactionalSource` returns false for `'campaign'`]
5. **Domain `sendSMS` ya tiene balance check pre-send**, falla rápido con error string si saldo insuficiente. NO necesita guard adicional en el script — solo manejar el error. [VERIFIED: `src/lib/domain/sms.ts:122-126`]

**Primary recommendation:** Clonar `godentist-send-scheduled.ts` líneas 1-280 verbatim, agregar parser xlsx + asignación A/B + sendSMS adapter para grupo B. Strip accents en nombre antes de interpolar SMS, conservar acentos en variable WhatsApp template. Pre-flight checks como tarea separada (Plan 01).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Parse xlsx | Local script | — | One-off ETL, no runtime concern |
| WhatsApp template send | 360dialog (external) | Bypass Supabase admin (script) | Pattern del campaña anterior — REGLA 3 excepción tácita |
| Contacts/Conversations/Messages writes | Bypass Supabase admin (script) | — | Same script-bypass pattern (REGLA 3 excepción) |
| SMS send | Domain layer (`sendSMS`) | Onurix client (under domain) | D-09 — billing requires atomic RPC |
| A/B tracking | Local JSON file | — | D-06 — borrable post-estudio |
| Bounce tracking | Local CSV | — | D-04 — entrega a equipo GoDentist |
| Cron scheduling | WSL crontab | — | Pattern del campaña anterior |

---

## Pre-flight Verification Checklist

These are tasks Plan 01 MUST execute and gate the rest of the experiment.

### Pre-flight 1: Saldo Onurix wholesale (admin morfx)
- **Cómo:** Login admin Onurix panel + verificar saldo cuenta. ALT: query Onurix API balance endpoint si existe.
- **Mínimo:** ~$83.000 COP (4.416 SMS × $18.75 + 20% margen). Recargar a $100.000 COP si menor.
- **Si falla:** Standalone abort, recargar primero.
- [ASSUMED] Onurix expone balance via API — verificar en panel manual primero.

### Pre-flight 2: Saldo morfx GoDentist
- **Cómo:** Query `sms_workspace_config.balance_cop WHERE workspace_id='36a74890-aad6-4804-838c-57904b1c9328'`.
- **Mínimo:** $428.352 COP (4.416 SMS × $97). Plan asume todos los SMS son 1 segmento (premisa que requiere accent-strip — ver Pitfalls). Si los nombres con acento se enviaran sin strip, costo real = $428.352 + 406×$97 (extra UCS-2 segment) = $467.734 COP.
- **Recarga:** Admin recarga via `/super-admin/sms` antes del blast.
- **Verificación:** [VERIFIED: `sms_workspace_config` schema at `supabase/migrations/20260316100000_sms_onurix_foundation.sql:10-20`. Column `balance_cop DECIMAL(12,2) NOT NULL DEFAULT 0`].

### Pre-flight 3: `is_active=true` para workspace GoDentist
- **Cómo:** Misma query que Pre-flight 2, columna `is_active`.
- **Si falla:** Activar via super-admin UI o SQL antes del blast.

### Pre-flight 4: Test 5 SMS reales
- **Destinatarios:** Jose + 4 del equipo (números reales, no del experimento).
- **Verificar:**
  - Sender ID renderiza (default Onurix — NO se ha registrado alpha sender custom).
  - Texto llega completo en 1 segmento.
  - Link `wa.me/573016262603` es tappable.
  - Personalización `{nombre}` se renderiza (verificar 5 nombres distintos, idealmente con 1 que tenga acento para confirmar el strip).
- **Costo:** 5 × $18.75 = $93.75 COP wholesale ($485 COP interno). Marginal.

### Pre-flight 5: Template `nuevo_numero` aprobado
- **Cómo:** 360dialog API GET templates (`/v1/configs/templates`) o panel manual + verificar status `APPROVED`.
- **Si PAUSED/REJECTED:** Standalone abort. El blast WA fallaría en masa.
- [ASSUMED] El template sigue aprobado — campaña anterior lo usó hasta 2026-03-28.

### Pre-flight 6 (NUEVO — no en CONTEXT.md): Verificar parse xlsx success rate
- **Cómo:** Ejecutar `parse-godentist-xlsx-2019-2022.ts` ANTES del primer cron run + verificar:
  - Total rows leídos: 8.832 ± expected
  - Phones normalizables: ≥ 8.000 (esperado ~8.705 según research)
  - JSON output válido (`JSON.parse` no falla)
- **Si <8.000 phones válidos:** Investigar antes de empezar — no abortar pero loggear.

### Pre-flight 7 (NUEVO — no en CONTEXT.md): Eliminar crontab anterior
- **Cómo:** `crontab -l` debe mostrar 0 entries de `godentist-send-cron.sh` (mar-sáb 10:30/14:30).
- **Si existe:** Eliminar (NO comentar — eliminar) antes de agregar nueva entry.
- **Why:** Si el wrapper anterior no se elimina, podría dispararse en paralelo y causar concurrent state file corruption (otro JSON, sí, pero el cron host carga ambos = recursos compartidos).

---

## File Reuse Map

Concrete cite-by-line guide for clones.

### `scripts/godentist-send-scheduled.ts` (REUSE ~70%)

| Líneas | Función | Reuse strategy |
|--------|---------|----------------|
| 16-17 | `dotenv.config({ path: ABS_PATH })` | **CLONE VERBATIM** — absolute path is critical for cron context |
| 19-21 | imports (`createClient`, `fs`, `path`) | CLONE VERBATIM — add `import * as XLSX from 'xlsx'` and `import crypto from 'crypto'` |
| 27-39 | CONFIG block (URL, KEY, WORKSPACE_ID, TEMPLATE_NAME, BATCH_SIZE, DELAY_MS, paths) | **CLONE BUT CHANGE** — `BATCH_SIZE=1800`, `DELAY_MS=1000`, new file paths under `godentist/pacientes-data/blast-experiment/` |
| 45 | `supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)` | CLONE VERBATIM |
| 47-53 | `normalizePhone()` | **CLONE VERBATIM** — already battle-tested. The campaign anterior used `digits.length === 12 && digits.startsWith('57')` which is the same pattern in `formatColombianPhone` |
| 55-78 | `send360Template()` | **CLONE VERBATIM** — exact contract with 360dialog working in production |
| 84-105 | `SendState` interface + `loadState/saveState` | **CLONE then EXTEND** — add `dailySlices`, `experiment_progress: {grupo_a_sent, grupo_b_sent, total_sms_sent, total_sms_failed}` |
| 119-133 | Colombia time + Sunday skip | **CLONE then EXTEND** — also skip Saturday (D-14: lun-vie). `if (dayOfWeek === 0 \|\| dayOfWeek === 6) return` |
| 153-156 | get workspace API key | CLONE VERBATIM |
| 163-249 | per-patient loop body | **PARTIAL CLONE** — wrap the body with A/B branch, add SMS call after WA in branch B |
| 175-217 | contact + conversation upsert | **CLONE VERBATIM** — battle-tested 23505 race handling |
| 219-237 | template send + message INSERT | **CLONE VERBATIM** — exact same template `nuevo_numero` |
| 240 | progress log every 100 | KEEP |
| 242 | `setTimeout(r, DELAY_MS)` | **MODIFY** — `DELAY_MS=1000` in new script. For grupo B, the SMS call counts as a step → use 500ms inter-step delay so total=~1s/contact in WA-only and ~2s/contact in WA+SMS |
| 252-272 | state save + log file | CLONE VERBATIM |

### `scripts/godentist-send-cron.sh` (REUSE 100%)

| Líneas | Reuse |
|--------|-------|
| 5 | `cd /mnt/c/Users/Usuario/Proyectos/morfx-new` — CLONE VERBATIM |
| 7-8 | `LOG_DIR + mkdir -p` — CLONE BUT CHANGE path to `godentist/pacientes-data/blast-experiment/logs` |
| 10-11 | `TZ='America/Bogota' date` — CLONE VERBATIM |
| 13-21 | NVM load + npx tsx invocation | CLONE BUT CHANGE script path to `scripts/godentist-blast-experiment.ts` |

**Wrapper output:** `scripts/godentist-blast-experiment-cron.sh` (executable: `chmod +x`).

### `src/lib/domain/sms.ts:sendSMS` (CALL — do NOT modify)

The contract that the new script consumes — already correct.

**Signature** [VERIFIED `src/lib/domain/sms.ts:75`]:
```typescript
async function sendSMS(
  ctx: DomainContext,         // { workspaceId: string, source: string }
  params: SendSMSParams        // { phone, message, source?, automationExecutionId?, contactName? }
): Promise<DomainResult<SendSMSResult>>
```

**Call site shape:**
```typescript
const ctx: DomainContext = {
  workspaceId: '36a74890-aad6-4804-838c-57904b1c9328',
  source: 'script',  // ← DomainContext.source taxonomy (operational)
}
const result = await sendSMS(ctx, {
  phone: normalizedPhone,        // already +57XXXXXXXXXX or 57XXXXXXXXXX — sendSMS re-normalizes
  message: renderedSMSText,      // ASCII-only after accent strip
  source: 'campaign',            // ← SendSMSParams.source taxonomy (regulatory) — D-12
  contactName: fullName,         // for sms_messages denormalization
})
if (!result.success) {
  // result.error is a string — log + record bounce + continue
} else {
  // result.data: { smsMessageId, dispatchId, status: 'sent', segmentsUsed, costCop }
}
```

**Key insight:** The `source` lives at TWO levels with different taxonomies — see LEARNINGS of `sms-time-window-by-type` Pattern 2. Don't unify.

### `src/lib/sms/utils.ts:formatColombianPhone` (DO NOT call directly from script)

`sendSMS` calls it internally on `params.phone`. The script's local `normalizePhone()` (returns `+57X...`) is fine — `formatColombianPhone` strips the `+`.

### `src/lib/sms/utils.ts:calculateSMSSegments` (USE for fallback decision)

[VERIFIED `src/lib/sms/utils.ts:49-54`] Pattern:
```typescript
import { calculateSMSSegments } from '@/lib/sms/utils'  // (note: tsx imports may need relative path fallback)
const segs = calculateSMSSegments(renderedText)
if (segs > 1) {
  // Fall back to no-name template
}
```

But: in the script, prefer **building the rendered text + checking length post-strip** rather than calling `calculateSMSSegments`. Reason: the script is a one-off `npx tsx` outside Next.js — the `@/lib/...` path alias may not resolve. Use a local copy of the GSM-7 regex (3 lines).

---

## Implementation Patterns

### Pattern 1: xlsx Parser (parse-godentist-xlsx-2019-2022.ts)

**What:** Read xlsx → write `pacientes-2019-2022.json` with shape `{nombre, apellido, celular, email, fecha_creacion}`. Idempotent (skip parse if JSON exists).

**Code shape:**
```typescript
import * as XLSX from 'xlsx'
import fs from 'fs'

const XLSX_PATH = '/mnt/c/Users/Usuario/Downloads/PACIENTES ENERO 2019 A DICIEMBRE 2022.xlsx'
const OUTPUT_PATH = '/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json'

if (fs.existsSync(OUTPUT_PATH)) {
  console.log('JSON exists, skip parse'); process.exit(0)
}

const wb = XLSX.readFile(XLSX_PATH)
const sheet = wb.Sheets[wb.SheetNames[0]]            // 'Pacientes' [VERIFIED]
const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

// Map nom1→nombre, ape1→apellido. Headers are LOWERCASE [VERIFIED].
const patients = rows.map(r => ({
  nombre: String(r.nom1 || '').trim(),
  apellido: String(r.ape1 || '').trim(),
  celular: String(r.celular || '').trim(),
  email: r.email ? String(r.email).trim() : '',
  fecha_creacion: String(r.fecha_creacion || ''),  // raw 'M/D/YY' string — never used at runtime
}))

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(patients, null, 2))
console.log(`Parsed ${patients.length} rows`)
```

**Pitfalls:**
- `raw: false` keeps `fecha_creacion` as string `'12/12/19'` (US M/D/YY) — if `raw: true`, xlsx parses to JS Date object that JSON-serializes incorrectly. We never use `fecha_creacion` at runtime so it's just denormalized.
- `defval: null` — empty cells become `null`, not `undefined`. Important for `r.email` check.
- Column headers are lowercase [VERIFIED]: `tipos_documento, documento, nom1, ape1, fch_nac, sexo, celular, email, fecha_creacion`. Do NOT assume `NOM1` uppercase.

### Pattern 2: A/B Hash Split (per CONTEXT.md D-05)

**What:** Within each daily slice of 1.800, sort by `sha256(phone)` → first 900 = grupo A, last 900 = grupo B. Deterministic + exactly 900/900.

**Code shape:**
```typescript
import crypto from 'crypto'

function assignABInSlice(slice: NormalizedPatient[]): {groupA: NormalizedPatient[], groupB: NormalizedPatient[]} {
  const sorted = slice
    .map(p => ({ p, h: crypto.createHash('sha256').update(p.phone).digest('hex') }))
    .sort((x, y) => x.h.localeCompare(y.h))
    .map(x => x.p)
  const half = Math.floor(sorted.length / 2)
  return { groupA: sorted.slice(0, half), groupB: sorted.slice(half) }
}
```

**Pitfalls:**
- For the FINAL day's slice (likely <1.800 because 8.284 / 1.800 = 4.6 days), `Math.floor` gives an even-ish split with potentially 1 phone difference (e.g., 832 → A=416, B=416 ✓; 833 → A=416, B=417). [VERIFIED: see "Open Risks Pre-Plan" #2].
- Hash determinism: `+573165753196` and `573165753196` would hash to different buckets. **Decision:** Hash on the normalized form `+57XXXXXXXXXX` (with `+`). Pick one and document.
- Crypto module is built-in Node, no install needed.
- **Verified empirically in research session:** 1.800 phones → exact 900/900 split with sort-then-slice strategy.

### Pattern 3: SMS Text Personalization with Accent Strip (CRITICAL — extends D-10/D-11)

**The CONTEXT.md miss:** D-11 only checks length. But accents in name (`José`, `María`) flip the entire message to UCS-2 → 2 segments → 2x cost. Must strip accents before interpolation.

**Code shape:**
```typescript
function stripAccents(s: string): string {
  // Removes: á→a, é→e, í→i, ó→o, ú→u, ñ→n, plus uppercase variants
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function isGSM7(s: string): boolean {
  return /^[\x20-\x7E\n\r]*$/.test(s)
}

const SMS_TEMPLATE_PERSONALIZED = (name: string) =>
  `Hola ${name}, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603`

const SMS_TEMPLATE_FALLBACK =
  `Hola, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603`

function buildSMSText(rawName: string): string {
  const safeName = stripAccents(rawName).trim() // 'José' → 'Jose'
  const personalized = SMS_TEMPLATE_PERSONALIZED(safeName)
  // Two-gate fallback: length OR encoding
  if (personalized.length > 160 || !isGSM7(personalized)) {
    return SMS_TEMPLATE_FALLBACK
  }
  return personalized
}
```

**Math validated empirically [VERIFIED in research session]:**
- Template raw length (with `{nombre}` placeholder): 110 chars
- Static overhead (without `{nombre}` 8-char marker): 102 chars
- Max name length for 1 segment: 160 - 102 = **58 chars**
- Max name in dataset: **23 chars** [VERIFIED on 8.832 rows]
- → **Length-based fallback will NEVER fire on this dataset.** Only the encoding-based fallback matters for accented names that escape the strip (none expected — `normalize('NFD')` handles all standard Latin accents).

**Why strip and not fallback:** Stripping `José` → `Jose` keeps personalization (worth keeping for engagement). Fallback to no-name version loses personalization for ~5% of contacts unnecessarily.

**Note on WhatsApp template:** WhatsApp template `{{1}}=nombre` should NOT be accent-stripped. The WA template renders properly as UTF-8 in WhatsApp. Only SMS gets stripped. **Pass `p.nombre` (original) to 360dialog template parameter, pass `stripAccents(p.nombre)` to `sendSMS()`.**

### Pattern 4: Per-patient loop with A/B branching

```typescript
// Pre-compute today's slice + assignments
const todayStart = state.nextOffset
const todayEnd = Math.min(state.nextOffset + DAILY_BATCH_SIZE, allPatients.length)
const slice = allPatients.slice(todayStart, todayEnd)
const { groupA, groupB } = assignABInSlice(slice.map(toNormalized))
const groupBPhones = new Set(groupB.map(p => p.phone))  // O(1) lookup

// Append to assignments JSON BEFORE sending so we can recover on crash
appendAssignments(slice, groupBPhones, today)

for (let i = 0; i < slice.length; i++) {
  const p = slice[i]
  const phone = normalizePhone(p.celular)
  if (!phone) {
    skippedReasons.push({ phone: p.celular, nombre: `${p.nombre} ${p.apellido}`.trim(), razon: 'phone_invalid' })
    continue
  }

  // === WA SEND (both groups) ===
  // ... contact + conversation upsert + send360Template + INSERT messages
  // (clone scheduled.ts:175-237 verbatim)

  await sleep(500)  // half of DELAY_MS to allow group B's SMS within ~1s/contact for group A and ~2s/contact for group B

  // === SMS SEND (group B only) ===
  if (groupBPhones.has(phone)) {
    const smsText = buildSMSText(p.nombre)
    const ctx: DomainContext = { workspaceId: WORKSPACE_ID, source: 'script' }
    const smsResult = await sendSMS(ctx, {
      phone,                 // sendSMS handles the +57 stripping
      message: smsText,
      source: 'campaign',    // ← regulatory taxonomy
      contactName: `${p.nombre} ${p.apellido}`.trim(),
    })
    if (!smsResult.success) {
      smsErrors.push({ phone, nombre: p.nombre, error: smsResult.error || 'unknown' })
    }
    updateAssignmentSMSStatus(phone, smsResult.success ? new Date().toISOString() : null)
  }

  await sleep(500)
}
```

### Pattern 5: Tracking JSON shape (extends D-06)

```typescript
interface AssignmentEntry {
  phone: string                  // +57XXXXXXXXXX
  nombre: string                 // raw, with accents
  group: 'A' | 'B'
  day: number                    // 1, 2, 3...
  date: string                   // 'YYYY-MM-DD' Bogotá
  sent_wa_at: string | null      // ISO timestamp or null if WA failed
  sent_sms_at: string | null     // ISO timestamp; null if group A or SMS failed
  wa_error: string | null
  sms_error: string | null
}

// File: godentist/pacientes-data/blast-experiment/assignments.json
// Append-only — never rewrite. JSON array of AssignmentEntry.
```

**Pattern:** Append to file under `assignments.json` after each batch (not per-message — would slow throughput unnecessarily). Use `JSON.stringify(arr, null, 2)` for human readability.

### Pattern 6: Bounces CSV (D-04)

```typescript
// File: godentist/pacientes-data/blast-experiment/skipped.csv
// Headers: numero,nombre,razon_skip
// Append per-batch
const csvLine = `"${rawPhone}","${name.replace(/"/g, '""')}","${reason}"\n`
fs.appendFileSync(CSV_PATH, csvLine)
// On first write: write header line `numero,nombre,razon_skip\n` if not exists
```

**Reasons taxonomy:**
- `phone_invalid` — `normalizePhone()` returned null
- `phone_foreign` — starts with non-`+57` after normalization (variant of phone_invalid)
- `phone_multiple` — contains `-` separator e.g. `3054560003-3144432013`
- `wa_send_failed` — 360dialog returned error
- `sms_send_failed` — `sendSMS` result.success === false
- `name_empty` — `nom1` is null/empty (none in current dataset, but defensive)

### Pattern 7: dotenv path absolute (CRON CRITICAL)

[VERIFIED `scripts/godentist-send-scheduled.ts:17`] — clone verbatim:
```typescript
import dotenv from 'dotenv'
dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })
```

**Pitfall:** Relative path `'.env.local'` only works when invoked from project root. Cron context invokes wrapper with `cd` first, but defensive absolute path is established pattern in this repo.

---

## Common Pitfalls

### Pitfall 1: Accent in name → UCS-2 doubling cost (CRITICAL — not in CONTEXT.md)

**What goes wrong:** Names like `José`, `María`, `Joaquín`, `Ñuño` interpolated into the SMS template flip the encoding from GSM-7 (160 chars/seg) to UCS-2 (70 chars/seg). The 107-char message becomes 2 segments → debits $194 COP not $97 COP.

**Why it happens:** D-10 says "sin acentos" (template literal) but D-11 fallback only checks length, not encoding. Implicit assumption: names will be ASCII. Real data: 4.6% of names have accents (406 / 8.832).

**How to avoid:** Strip accents from name before interpolating (see Pattern 3). Use `normalize('NFD').replace(/[̀-ͯ]/g, '')`. WhatsApp template parameter (`{{1}}`) keeps original accents — only SMS interpolation strips.

**Warning signs:** `result.data.segmentsUsed > 1` for a contact whose name has Latin accents. Costs DOUBLE for affected contacts.

**Cost impact (worst case):** If accents are not stripped → 406 × $97 extra = **$39.382 COP additional debit + $7.612 COP additional Onurix wholesale**.

### Pitfall 2: Plurality — actual list is 8.284 unique phones, not 8.832 rows

**What goes wrong:** Plan assumes 1.800/day → ~5 days. Actual:
- 8.832 raw rows → 8.705 normalizable phones → **8.284 unique after dedup-within-list** (413 internal duplicates [VERIFIED]).
- Subtract 127 invalid format → final ≈ 8.284 mailable.
- 8.284 / 1.800 = **4.6 days**. The 5th day is a stub of ~684 contacts.

**Why it happens:** xlsx export contains pacientes that visited multiple times in 2019-2022 with same phone but different rows (one per visit/document). The previous campaign script [VERIFIED `godentist-send-scheduled.ts:177-194`] handles this via the `contacts.unique(workspace_id, phone)` constraint that triggers `23505` race-handling — so dupes get skipped. But for THIS script, dedup ALSO matters for the A/B split: if a phone appears twice in the slice, both copies hash to the same bucket and would BOTH go to group A or group B → pollutes the experiment.

**How to avoid:** **Dedup within the parsed JSON BEFORE A/B assignment.** Add to parser:
```typescript
const seen = new Set<string>()
const unique = patients.filter(p => {
  const norm = normalizePhone(p.celular)
  if (!norm || seen.has(norm)) return false
  seen.add(norm); return true
})
```
Document in plan: input list = 8.832 rows, output JSON = 8.284 unique phones.

**Warning signs:** A/B group analysis shows the same phone in both groups (impossible with proper dedup but indicates the bug if observed).

### Pitfall 3: D-12 marketing source guard rejects out-of-window runs

**What goes wrong:** If cron run misses 10:30 (machine off, WSL down, network) and a manual retry happens at 22:00 to "catch up" — the `sendSMS` call rejects with `"SMS no enviado: fuera de horario permitido"` for every group B contact. Only WA goes out → group B becomes equivalent to group A → experiment data corrupted for that day.

**Why it happens:** D-12 explicitly sets `source='campaign'` which triggers `isWithinMarketingSMSWindow()`. Window is 8 AM - 9 PM Colombia [VERIFIED `src/lib/sms/utils.ts:85-95`].

**How to avoid:**
- **Operational:** If a cron run is missed, the catch-up MUST happen between 8 AM and 9 PM the next operational day, not "ASAP at any hour."
- **Defensive code:** Add early check in script — if `colombiaHour < 8 || colombiaHour >= 21`, abort with clear error message. Don't even start the WA blast if SMS half can't run (degrades experiment integrity).

**Warning signs:** Logs show `Sent: 0, Errors: 1800` for SMS portion, but WA portion succeeded. Group B SMS rate < 100% in tracking JSON.

### Pitfall 4: 23505 race condition on contacts/conversations during overlap with prior campaign

**What goes wrong:** The 2019-2022 list overlaps with the 2023-2026 list (D-01: re-enviar). Many contacts and conversations already exist from the prior campaign. The prior script [VERIFIED `scheduled.ts:187-194, 209-217`] handles 23505 with retry-select pattern. Clone this verbatim — DON'T simplify.

**Why it happens:** PostgreSQL unique constraint `contacts(workspace_id, phone)` and `conversations(workspace_id, phone, channel)` raise 23505 on duplicate insert. Without retry-select, the script crashes that contact's iteration.

**How to avoid:** Clone the 23505 retry-select pattern from `scheduled.ts:187-194`. It's idiomatic for this script family.

### Pitfall 5: Cron WSL — relative paths and missing NVM

**What goes wrong:** Cron context runs with minimal env. `npx` may not be on PATH, `tsx` may not be installed, `dotenv.config('.env.local')` fails because `cwd` is `$HOME` not project root.

**How to avoid:** Wrapper `.sh` MUST:
1. `cd /absolute/path/to/morfx-new` first
2. Source NVM: `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"`
3. Use `npx tsx scripts/...` (npx will resolve tsx from local node_modules)
4. Redirect output to log file with `>> "$LOG_FILE" 2>&1`
[VERIFIED `scripts/godentist-send-cron.sh:5,16-19`]

### Pitfall 6: `sendSMS` returns `success=true` even when atomic RPC fails

[VERIFIED `src/lib/domain/sms.ts:176-211`] — if Onurix succeeds but the RPC `insert_and_deduct_sms_message` fails (transient DB issue), the function returns `success=true` with `smsMessageId='unpersisted'`. The SMS WAS DELIVERED but billing record is missing.

**Impact:** Workspace balance NOT debited for that SMS. The audit trail in `sms_messages` is missing the row. Onurix did charge the admin's wholesale account.

**How to avoid:** Defensive — log when `result.data.smsMessageId === 'unpersisted'` to a separate `sms-unpersisted.json` for manual reconciliation. Don't fail the script.

### Pitfall 7: Onurix transient errors don't auto-retry

[VERIFIED `src/lib/sms/client.ts:47-52, 54-56`] — if Onurix returns non-2xx OR `status !== 1`, `sendOnurixSMS()` throws. The domain `sendSMS()` catches in the try/catch (line 240) and returns `{ success: false, error }`. **No retry logic.**

**How to avoid:**
- **Don't add retry inside the loop** (would double-charge if Onurix actually delivered the first attempt).
- **Do log the error** to `sms-errors.csv` for post-mortem.
- The 2.5%-3% expected failure rate from prior campaign [VERIFIED `send-state.json` history: ~1% errors] is the bouncing rate budget.

### Pitfall 8: Skip Saturday explicit (D-14)

The prior `scheduled.ts:130` skips Sundays only. New script must skip BOTH Saturday and Sunday. Cron filter `* * 1-5` is the primary guard, but defense-in-depth:
```typescript
if (dayOfWeek === 0 || dayOfWeek === 6) {
  console.log('Weekend — no se envia. Saliendo.')
  return
}
```

### Pitfall 9: 360dialog rate limiting at 60/min

[ASSUMED] 60/min is well under 360dialog's documented 80 messages/sec rate limit (per template; well within limits). The previous campaign ran 200/min successfully [VERIFIED `send-state.json` shows 1000 sent in 5 min = 200/min, 0 errors]. So 60/min is conservative, no rate limit risk.

### Pitfall 10: GoDentist agent might respond to inbound messages from skip-list contacts

**What goes wrong:** When a paciente from group B receives the SMS and clicks `wa.me/573016262603`, they open WhatsApp → start a conversation. The GoDentist agent (`godentist-agent` running in production) replies. This is INTENDED — it's the experiment outcome — but the planner should be aware: the metric (D-07 inbound 3d) is influenced by the agent's quality. If the agent is broken, both groups' inbound rate drops, masking the SMS lift.

**Pre-flight:** Verify GoDentist agent is responding correctly before the blast (manual test 1 inbound from team).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMS phone normalization | Custom regex parser | `formatColombianPhone(phone)` from `@/lib/sms/utils` (called inside `sendSMS`) | Already battle-tested across 700+ SMS sent. Handles 4 input variants. The script's local `normalizePhone()` is a different layer (E.164 with `+`) — keep both, they serve different APIs |
| SMS segment counting | Custom GSM-7 length math | `calculateSMSSegments(message)` from `@/lib/sms/utils` — OR inline the 3-line regex if `@/` aliases don't resolve in tsx | Provider segment count returned in `result.data.segmentsUsed` is authoritative — use that for billing reconciliation, use ours for fallback decision |
| SMS billing/balance | Direct UPDATE on `sms_workspace_config` | `sendSMS(ctx, params)` — atomic RPC handles all of it | RPC `insert_and_deduct_sms_message` is the only safe path. Direct UPDATE risks race + audit gap |
| Onurix API call | Custom fetch | `sendOnurixSMS()` (called inside `sendSMS`) | Form-urlencoded body + `status:1` check + types — already implemented |
| 360dialog template send | Custom 360dialog client | Clone `send360Template()` from `scheduled.ts:55-78` verbatim | Battle-tested header + payload shape |
| xlsx parsing | csv conversion + custom parsing | `XLSX.readFile() + sheet_to_json()` from `xlsx@0.18.5` (already installed) | Standard, type-safe, handles every Excel quirk |
| Hash-based bucket assignment | Custom hash func, MD5, etc. | `crypto.createHash('sha256')` (built-in Node) | Determinism, well-distributed, no install |
| Accent stripping | Custom replace map | `s.normalize('NFD').replace(/[̀-ͯ]/g, '')` (built-in Unicode) | Handles all Latin diacritics consistently |
| Marketing time window check | Custom hour calc | `isWithinMarketingSMSWindow()` from `@/lib/sms/utils` (called inside `sendSMS`) | Already correct — but for defensive script-level early-exit, inline the check before starting |
| State file persistence | Custom format / sqlite | JSON file + `fs.writeFileSync` | Pattern established, debuggable, version-controllable if needed |

**Key insight:** ~80% of this script is concrete reuse from `godentist-send-scheduled.ts`. The new logic is parser + A/B assignment + `sendSMS` adapter (~150 LoC).

---

## Code Examples

### Example 1: Full SMS render (drop-in)

```typescript
function buildSMSText(rawName: string): string {
  const safeName = rawName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritics
    .trim()
    .split(/\s+/)[0]                    // first word only — D-10 implicit (sample shows "Hola Maria")

  const personalized = `Hola ${safeName}, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603`
  const fallback = `Hola, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603`

  // Two-gate: encoding (defense vs missed-strip) + length
  const isGSM7 = /^[\x20-\x7E\n\r]*$/.test(personalized)
  if (!isGSM7 || personalized.length > 160) {
    return fallback
  }
  return personalized
}
```

**Open question for plan-phase:** Should personalization use first-name-only (`Maria` of `Maria del Carmen`) or full first-name field (`Maria del Carmen`)? CONTEXT.md sample shows just first word. Default to first-word for SMS readability + tighter character budget.

### Example 2: A/B assignment + tracking

```typescript
import crypto from 'crypto'

interface NormalizedPatient {
  phone: string         // +57XXXXXXXXXX
  nombre: string
  apellido: string
  email: string
}

function assignAB(slice: NormalizedPatient[]): {
  groupA: NormalizedPatient[]
  groupB: NormalizedPatient[]
  groupBPhones: Set<string>
} {
  const sorted = slice
    .map(p => ({ p, h: crypto.createHash('sha256').update(p.phone).digest('hex') }))
    .sort((a, b) => a.h.localeCompare(b.h))
    .map(x => x.p)

  const half = Math.floor(sorted.length / 2)
  const groupA = sorted.slice(0, half)
  const groupB = sorted.slice(half)
  return { groupA, groupB, groupBPhones: new Set(groupB.map(p => p.phone)) }
}
```

### Example 3: Pre-flight check assertions

```typescript
async function preflight(): Promise<void> {
  // 3a. Workspace SMS config
  const { data: config } = await supabase
    .from('sms_workspace_config')
    .select('is_active, balance_cop')
    .eq('workspace_id', WORKSPACE_ID)
    .single()
  if (!config?.is_active) throw new Error('SMS workspace not active for GoDentist')
  if (Number(config.balance_cop) < 100_000) {
    throw new Error(`Saldo insuficiente: $${config.balance_cop}. Recarga antes del blast.`)
  }

  // 3b. Time window check (hard abort if outside window)
  const colombiaHour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'America/Bogota', hour: 'numeric', hour12: false,
  }))
  if (colombiaHour < 8 || colombiaHour >= 21) {
    throw new Error(`Fuera ventana SMS: ${colombiaHour}h. Run between 8AM-9PM Colombia.`)
  }
}
```

### Example 4: Cron wrapper (clone of `godentist-send-cron.sh` with new paths)

```bash
#!/bin/bash
# godentist-blast-experiment-cron.sh
cd /mnt/c/Users/Usuario/Proyectos/morfx-new

LOG_DIR="godentist/pacientes-data/blast-experiment/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(TZ='America/Bogota' date '+%Y-%m-%d_%H%M')
LOG_FILE="$LOG_DIR/cron_${TIMESTAMP}.log"

echo "=== Cron started at $(TZ='America/Bogota' date) ===" >> "$LOG_FILE"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

npx tsx scripts/godentist-blast-experiment.ts >> "$LOG_FILE" 2>&1

echo "=== Cron finished at $(TZ='America/Bogota' date) ===" >> "$LOG_FILE"
```

Add executable bit: `chmod +x scripts/godentist-blast-experiment-cron.sh`.

Crontab entry (D-14):
```
30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
```

**Replace** existing entries:
```
# REMOVE these (campaign anterior, already finished):
30 10 * * 2-6 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-send-cron.sh
30 14 * * 2-6 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-send-cron.sh
```

### Example 5: Append-only assignments JSON

```typescript
const ASSIGNMENTS_PATH = path.join(DATA_DIR, 'blast-experiment', 'assignments.json')

function loadAssignments(): AssignmentEntry[] {
  if (!fs.existsSync(ASSIGNMENTS_PATH)) return []
  return JSON.parse(fs.readFileSync(ASSIGNMENTS_PATH, 'utf-8'))
}

function appendAssignments(newEntries: AssignmentEntry[]): void {
  const existing = loadAssignments()
  const combined = [...existing, ...newEntries]
  fs.writeFileSync(ASSIGNMENTS_PATH, JSON.stringify(combined, null, 2))
}
```

### Example 6: Bounce CSV with header guard

```typescript
const SKIPPED_CSV_PATH = path.join(DATA_DIR, 'blast-experiment', 'skipped.csv')

function appendSkipped(numero: string, nombre: string, razon: string): void {
  const isFirst = !fs.existsSync(SKIPPED_CSV_PATH)
  if (isFirst) fs.writeFileSync(SKIPPED_CSV_PATH, 'numero,nombre,razon_skip\n')
  const escaped = (s: string) => `"${s.replace(/"/g, '""')}"`
  fs.appendFileSync(SKIPPED_CSV_PATH, `${escaped(numero)},${escaped(nombre)},${escaped(razon)}\n`)
}
```

---

## Open Risks Pre-Plan

These need resolution before plan-phase locks tasks. Surface to user.

### Risk 1: Saldo morfx GoDentist actual

**Question:** ¿Cuánto saldo tiene `sms_workspace_config.balance_cop` para workspace GoDentist (`36a74890-aad6-4804-838c-57904b1c9328`) HOY?

**If <$428.000 COP:** Plan 01 must include an explicit recharge step + user confirmation BEFORE Plan 02 (blast script).

**Verification SQL:**
```sql
SELECT balance_cop, is_active, total_sms_sent
FROM sms_workspace_config
WHERE workspace_id = '36a74890-aad6-4804-838c-57904b1c9328';
```

**Confidence:** [ASSUMED] — research could not query live DB. Plan 01 must verify.

### Risk 2: Final day partial slice (684 contacts)

**Math:** 8.284 unique mailable phones / 1.800 per day = 4 full days + 1 partial day of 684.

**Question:** Does the script:
- (a) Send 1.800 each of days 1-4, then 684 on day 5 (final partial slice has A/B = 342/342)?
- (b) Re-balance to 1.657/day across 5 days?
- (c) Skip the 5th day and ship 8.000 over 4.45 days?

**Default (recommended):** Option (a) — simplest, deterministic. The 684 final slice still has a clean 50/50 split via the same hash-sort.

### Risk 3: Cleanup date for tracking JSON (D-06)

**Math:** Last batch on day 5 (~5th business day from start). +3 days for inbound metric (D-07) = day 8. Final analysis = day 8-10.

**Question:** Should the plan include an explicit `LEARNINGS.md` task that records the cleanup date and a manual `rm` instruction, or should there be an automated `cleanup-blast-data.ts` script with a date check?

**Default (recommended):** Manual `rm` documented in LEARNINGS — simpler, matches D-06 "borrable" framing. Auto-cleanup is overkill for one-off.

### Risk 4: First-name-only vs full first-name field

**Sample CONTEXT.md D-10:** `Hola {nombre}` with example "Maria" — implies first-name-only.
**Data:** Some entries have full names like `MARIA DEL CARMEN BUSTAMANTE GOMEZ` in `nom1`? Or are last names in `ape1`?

[VERIFIED in research session]: `nom1` is first-name field only (sample: `ADRIANA`, `ERIKA`, `LUIS`). `ape1` is last-name field. Max combined = 23 chars.

**Decision:** Pass `p.nombre` (already first-name field) directly to SMS. No splitting needed. (This was a non-risk — research disambiguated.)

### Risk 5: WhatsApp template `nuevo_numero` quality status

**Question:** ¿El template sigue APPROVED hoy en 360dialog? La campaña anterior envió a 17.149 personas en marzo-abril. Si Meta detectó "block rate" alto, podría estar PAUSED.

**Verification:** Pre-flight 5 (above) — query 360dialog API o panel before run.

**If PAUSED/REJECTED:** Standalone abort. Plan should NOT proceed.

### Risk 6: Inbound message attribution (D-07 metric)

**Question:** ¿Cómo se atribuye un inbound message a la campaña vs un mensaje espontáneo del paciente? El experimento mide "lift" en respuestas, pero un paciente que tenía cita pendiente y escribe el mismo día por casualidad cuenta como "respuesta" en ambos grupos.

**Mitigation:** The metric is COMPARATIVE (group B vs group A). Spontaneous noise is ~equal across groups (random hash-sort assignment) → noise cancels out in the lift calculation. Sample size 4.142/group is high enough.

**No action needed** — the experiment design already controls this.

### Risk 7: Foreign numbers in raw data

[VERIFIED] — sample `+1 (407) 255-0327` in row data. `normalizePhone` rejects (returns null). These count as `phone_invalid` skipped. Should they ALSO be flagged differently in CSV?

**Default (recommended):** Add reason taxonomy `phone_foreign` for any number that has digits but doesn't fit `+57 3XX XXX XXXX`. The CSV gives GoDentist DB-cleanup signal beyond just "bad number."

### Risk 8: Crontab edit affects user's manual schedule

**Question:** User has 2 entries currently for the OLD campaign (mar-sáb 10:30 + 14:30). Both should be REMOVED (campaign already done, offset=17149 = complete). New entry replaces them. Confirm with user BEFORE editing crontab.

**Verification:** `crontab -l` already showed the entries. They are stale (last successful run was 2026-03-28). User should acknowledge removal before plan executes.

---

## Confidence Notes

| Claim | Confidence | Source |
|-------|-----------|--------|
| `xlsx@0.18.5` installed and works | HIGH | [VERIFIED] `node_modules/xlsx/package.json` + ran `XLSX.readFile()` in research session |
| 8.832 raw rows, 8.705 normalizable phones, 8.284 unique | HIGH | [VERIFIED] research session ran full xlsx audit |
| 406 names with accents/Ñ | HIGH | [VERIFIED] regex `/[áéíóúÁÉÍÓÚñÑ]/` over 8.832 rows |
| Max name length = 23 chars (D-11 fallback never triggers on length alone) | HIGH | [VERIFIED] research session computed |
| Accent in name → UCS-2 → 2 segments | HIGH | [VERIFIED] `src/lib/sms/utils.ts:51` regex test on `'Joaquín'` → false → 2 segments |
| `normalize('NFD').replace(...)` strips Latin accents to ASCII | HIGH | [VERIFIED] tested `Joaquín, José, María, Andrés, Ñuño` all produce GSM-7-pass output |
| `sendSMS(ctx, params)` signature | HIGH | [VERIFIED] `src/lib/domain/sms.ts:75` |
| `source='campaign'` activates marketing window guard | HIGH | [VERIFIED] `src/lib/sms/constants.ts:36` + `utils.ts:69` + `domain/sms.ts:93` |
| `formatColombianPhone` accepts `+57X` and strips `+` | HIGH | [VERIFIED] `src/lib/sms/utils.ts:22-42` |
| Hash-sort A/B split gives exact 900/900 | HIGH | [VERIFIED] research session simulated 1.800 phones |
| `crypto.createHash('sha256')` is built-in Node, no install | HIGH | Node stdlib |
| Prior campaign 0 errors / ~1% skip rate at 200/min | HIGH | [VERIFIED] `send-state.json` history + sampled logs |
| `send360Template` contract still valid (template `nuevo_numero` ES, body var `{{1}}`) | MEDIUM | [VERIFIED] code reuse contract from prior script. [ASSUMED] template still approved — Pre-flight 5 |
| Onurix wholesale = $18.75/seg | HIGH | [VERIFIED via CONTEXT.md cross-ref to `sms-module/CONTEXT.md` §"Costo real"] |
| Cron WSL with absolute dotenv path works | HIGH | [VERIFIED] prior campaign ran 17 successful cron runs |
| `isWithinMarketingSMSWindow()` is 8AM-9PM daily (not weekday-aware) | HIGH | [VERIFIED] `src/lib/sms/utils.ts:85-95` |
| `sendSMS` returns success=true on RPC fail (smsMessageId='unpersisted') | HIGH | [VERIFIED] `src/lib/domain/sms.ts:176-211` |
| Saldo current `sms_workspace_config.balance_cop` for GoDentist | LOW | [ASSUMED] — research could not query live DB. Plan 01 verifies. |
| Template `nuevo_numero` status APPROVED today | LOW | [ASSUMED] — pre-flight 5 verifies via 360dialog. |
| Onurix balance API exposes wholesale balance | LOW | [ASSUMED] — manual panel check is the safer pre-flight. |
| 360dialog rate limit ≥ 60/min | MEDIUM | [VERIFIED indirectly] — prior campaign ran 200/min successfully. 60/min is well within. |
| GoDentist agent responding correctly today | LOW | [ASSUMED] — pre-flight test 1 inbound. |
| `1` cron entry replaces 2 (manual user action) | HIGH | [VERIFIED] `crontab -l` showed exactly 2 entries for old campaign. |

---

## Sources

### Primary (HIGH confidence — verified in this session)

- `scripts/godentist-send-scheduled.ts` (full file read) — clone source
- `scripts/godentist-send-cron.sh` (full file read) — wrapper template
- `scripts/godentist-send-nuevo-numero.ts` (full file read) — alt clone source
- `src/lib/domain/sms.ts` (full file read) — sendSMS contract
- `src/lib/sms/client.ts` (full file read) — Onurix client error contract
- `src/lib/sms/utils.ts` (full file read) — phone, segments, time-window
- `src/lib/sms/constants.ts` (full file read) — source taxonomies + price
- `src/lib/sms/types.ts` (full file read) — Onurix response shapes
- `src/lib/domain/types.ts` (full file read) — DomainContext shape
- `src/lib/automations/action-executor.ts:1130-1153` — sendSMS caller pattern
- `supabase/migrations/20260316100000_sms_onurix_foundation.sql:10-20` — sms_workspace_config schema
- `godentist/pacientes-data/all-pacientes.json` (sampled) — JSON output shape reference
- `godentist/pacientes-data/send-state.json` (full file read) — state file shape + history
- `~/Downloads/PACIENTES ENERO 2019 A DICIEMBRE 2022.xlsx` (parsed in session) — source data audit
- `crontab -l` (executed in session) — current cron state
- `.planning/standalone/sms-time-window-by-type/LEARNINGS.md` — source taxonomy lessons

### Secondary (MEDIUM confidence — referenced but not freshly verified)

- `.planning/standalone/sms-module/CONTEXT.md` §"Costo real" — Onurix wholesale rate
- `/home/jose147/.claude/projects/.../onurix_twilio_migration.md` — Onurix env vars (11d old)
- `/home/jose147/.claude/projects/.../sms_colombia_regulation.md` — CRC norm

### Tertiary (LOW confidence — assumptions to verify)

- 360dialog `nuevo_numero` template status — pre-flight 5
- Live `balance_cop` for GoDentist workspace — pre-flight 2
- Onurix admin panel balance — pre-flight 1
- GoDentist agent operational status — pre-flight (manual)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Template `nuevo_numero` is currently APPROVED in 360dialog | Pre-flight 5 | Blast WA fails in masa, experiment aborted |
| A2 | `sms_workspace_config.balance_cop` ≥ $428.000 for GoDentist workspace | Pre-flight 2, Open Risk 1 | sendSMS fails for group B, experiment data corrupted |
| A3 | Onurix admin wholesale balance ≥ $83.000 | Pre-flight 1 | Onurix returns error, all SMS fail |
| A4 | `sms_workspace_config.is_active = true` for GoDentist | Pre-flight 3 | sendSMS fails immediately |
| A5 | Onurix exposes balance via API endpoint | Pre-flight 1 | Manual panel check is fallback |
| A6 | GoDentist agent is responding correctly to inbound today | Pitfall 10 | Metric (D-07 inbound) is biased — both groups equally affected, but absolute rate is lower |
| A7 | Crontab old entries can be safely removed (prior campaign complete) | Open Risk 8 | If not complete, removing breaks unfinished campaign — but `send-state.json` shows offset=17.149/17.149 (complete) |
| A8 | The 360dialog rate limit is ≥ 60/min | Pitfall 9 | Returns 429s, loop slows down (not catastrophic) |

## Validation Architecture

> Skip — `workflow.nyquist_validation` not relevant for one-off campaign script. No automated tests; success is empirical (3-day inbound metric).

## Security Domain

> Minimal — script writes to existing audited tables (`sms_messages`, `contacts`, `messages`). No new attack surface. Onurix credentials and 360dialog API key already in env. Workspace isolation enforced via hardcoded `WORKSPACE_ID` constant — only impacts GoDentist workspace.

## Project Constraints (from CLAUDE.md)

| Rule | Compliance approach |
|------|---------------------|
| REGLA 0 (GSD obligatorio) | Standalone follows discuss → research → plan → execute. ✓ |
| REGLA 3 (Domain layer obligatorio) | SMS goes through domain (D-09). WA/contacts/conversations bypass — accepted exception per existing pattern in `godentist-send-scheduled.ts` (script context, REGLA 3 tácita). |
| REGLA 5 (Migración antes de deploy) | NO aplica — sin schema changes. JSON tracking is local file. |
| REGLA 6 (Proteger agente en producción) | Blast NO interactúa con agente conversacional — solo envía templates. Inbound responses son manejadas por el agente normal — eso ES el experimento. ✓ |

## Metadata

**Confidence breakdown:**
- File reuse map: HIGH — every line cited is from current code
- Implementation patterns: HIGH — derived from current code + tested in research session (xlsx parse, hash split, accent strip)
- Pitfalls: HIGH for code-side, MEDIUM for operational (cron miss, agent state) — the operational ones are unverifiable in research
- Pre-flight checklist: HIGH for definition, LOW for current values (balances, template status) — those are run-time checks
- A/B math: HIGH — empirically verified

**Research date:** 2026-04-28
**Valid until:** 7 days (fast-moving — Onurix balance, template approval status change). 30 days for code shapes (stable).
