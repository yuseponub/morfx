---
phase: sms-time-window-by-type
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/sms/constants.ts
  - src/lib/sms/utils.ts
  - src/lib/domain/sms.ts
autonomous: false

must_haves:
  truths:
    - "src/lib/sms/constants.ts exporta TRANSACTIONAL_SOURCES, MARKETING_SOURCES y los types TransactionalSource, MarketingSource, SMSSource"
    - "src/lib/sms/utils.ts exporta isTransactionalSource(source?) : boolean con default permisivo para NULL/undefined"
    - "src/lib/sms/utils.ts exporta isWithinMarketingSMSWindow() (renamed desde isWithinSMSWindow, lógica idéntica)"
    - "isWithinSMSWindow NO existe en ningún archivo de src/"
    - "El guard en src/lib/domain/sms.ts bypasea window check cuando params.source ∈ {automation, domain-call, script, NULL, undefined, unknown}"
    - "El guard en src/lib/domain/sms.ts aplica isWithinMarketingSMSWindow() cuando params.source ∈ {campaign, marketing}"
    - "src/lib/domain/sms.ts emite console.warn cuando el fallback 'domain-call' se dispara por source faltante (Q5)"
    - "npx tsc --noEmit exits 0 en cada commit (no hay estado intermedio build-roto — Pitfall 3 honrado)"
    - "Usuario confirma Vercel deploy status 'Ready' tras push"
  artifacts:
    - path: "src/lib/sms/constants.ts"
      provides: "Taxonomía de sources SMS como constantes + types"
      contains: "TRANSACTIONAL_SOURCES"
    - path: "src/lib/sms/utils.ts"
      provides: "Predicado isTransactionalSource + rename isWithinMarketingSMSWindow"
      contains: "isTransactionalSource"
    - path: "src/lib/domain/sms.ts"
      provides: "Guard source-aware (bypass para transactional, window check solo para marketing) + warn en fallback domain-call"
      contains: "isTransactionalSource(params.source)"
  key_links:
    - from: "src/lib/domain/sms.ts guard"
      to: "isTransactionalSource + isWithinMarketingSMSWindow en src/lib/sms/utils.ts"
      via: "import desde '@/lib/sms/utils'"
      pattern: "isTransactionalSource\\(params\\.source\\)"
    - from: "src/lib/sms/utils.ts isTransactionalSource"
      to: "TRANSACTIONAL_SOURCES en src/lib/sms/constants.ts"
      via: "import desde './constants'"
      pattern: "TRANSACTIONAL_SOURCES"
---

<objective>
Refactorizar el guard de `src/lib/domain/sms.ts` para diferenciar SMS transaccionales (bypass 24/7 — D-01) vs marketing (sujetos a `isWithinMarketingSMSWindow()`). Agregar constantes taxonómicas en `constants.ts`, helper predicado en `utils.ts`, y actualizar import + guard del domain layer.

Propósito: Resolver el bloqueo de SMS transaccionales fuera de ventana (incidente 2026-04-17 21:18). Defender compliance por contrato (DB NOT NULL del Plan 01 + constantes exportadas) en vez de por guard genérico.

Output: 3 archivos TypeScript modificados, 2 commits atómicos (constants; rename+guard+warn), type-check OK en AMBOS commits, código pusheado a Vercel, deploy "Ready" confirmado por usuario.

**Estructura del plan (revisada por checker feedback B-2 + B-4):**
- Task 1: constants.ts (commit atómico independiente — no rompe nada)
- Task 2: utils.ts rename + domain/sms.ts import+guard+warn en UN SOLO commit atómico (Pitfall 3 de RESEARCH — el rename cross-file NO puede dejar el build roto entre commits)
- Task 3: `checkpoint:human-verify` — push + usuario confirma deploy Ready

Depende de Plan 01: la columna `sms_messages.source` DEBE estar NOT NULL en prod antes de que este código llegue a Vercel (Regla 5). El checkpoint del Plan 01 ya garantizó esa precondición.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-time-window-by-type/CONTEXT.md
@.planning/standalone/sms-time-window-by-type/RESEARCH.md
@.planning/standalone/sms-time-window-by-type/01-SUMMARY.md
@src/lib/sms/constants.ts
@src/lib/sms/utils.ts
@src/lib/domain/sms.ts
@src/lib/automations/action-executor.ts
@CLAUDE.md
</context>

<interfaces>
<!-- Contratos relevantes extraídos del codebase actual. El executor NO necesita explorar más. -->

**src/lib/domain/sms.ts (shape actual, líneas 31-42):**
```typescript
export interface SendSMSParams {
  /** Phone number (any Colombian format — will be normalized) */
  phone: string
  /** SMS text content */
  message: string
  /** Origin: 'automation' | 'domain-call' | 'script' */
  source?: string
  /** Link to automation execution for tracking */
  automationExecutionId?: string
  /** Contact name for denormalized display in history */
  contactName?: string
}
```
El campo `source` YA existe — sólo hay que consumirlo en el guard y en el fallback del RPC.

**src/lib/automations/action-executor.ts:1099-1104 (el ÚNICO caller de prod, NO modificar):**
```typescript
const ctx: DomainContext = { workspaceId, source: 'automation' }
const result = await domainSendSMS(ctx, {
  phone: to,
  message: body,
  source: 'automation',
  contactName: context.contactName || undefined,
})
```
Ya setea `source: 'automation'`. Zero changes aquí.

**Separación crítica (pitfall 7 de RESEARCH):**
- `DomainContext.source` (en `src/lib/domain/types.ts`): vocabulario `'server-action'|'tool-handler'|'automation'|'webhook'|'adapter'` — describe quién inició el domain call.
- `SendSMSParams.source`: vocabulario `'automation'|'domain-call'|'script'|'campaign'|'marketing'` — describe origen SMS para guard de horario.
- **NO unificar.** Son taxonomías distintas que comparten nombre de campo.
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Agregar taxonomía TRANSACTIONAL_SOURCES + MARKETING_SOURCES + types a src/lib/sms/constants.ts</name>
  <files>src/lib/sms/constants.ts</files>
  <read_first>
    - .planning/standalone/sms-time-window-by-type/CONTEXT.md §D-01, §specifics
    - .planning/standalone/sms-time-window-by-type/RESEARCH.md §"Pattern 2" y §Example 4 (contenido verbatim)
    - src/lib/sms/constants.ts (estado actual — zero imports, convención establecida)
  </read_first>
  <action>
Reemplazar el contenido actual de `src/lib/sms/constants.ts` agregando la sección "SMS Source Taxonomy" al final. El archivo DEBE seguir siendo zero-imports (convención del header).

Contenido FINAL del archivo (tomado verbatim de RESEARCH.md §Example 4):

```typescript
// ============================================================================
// SMS Module — Constants
// ZERO imports from project (prevents circular dependencies).
// ============================================================================

/** Price per SMS segment in Colombian Pesos */
export const SMS_PRICE_COP = 97

/** Characters per segment for GSM-7 encoding (ASCII only) */
export const SMS_GSM7_SEGMENT_LENGTH = 160

/** Characters per segment for UCS-2 encoding (accents, emojis, special chars) */
export const SMS_UCS2_SEGMENT_LENGTH = 70

/** Onurix API base URL */
export const ONURIX_BASE_URL = 'https://www.onurix.com/api/v1'

// ============================================================================
// SMS Source Taxonomy
// ============================================================================

/**
 * Sources that are inherently transactional — bypass time-window guard (24/7 allowed).
 * Per Colombian CRC Res. 5111/2017: transactional / utility SMS are exempt from schedule.
 *
 * Adding a source here permanently exempts it from marketing-hours enforcement.
 * If a new channel can send marketing, add it to MARKETING_SOURCES instead.
 */
export const TRANSACTIONAL_SOURCES = ['automation', 'domain-call', 'script'] as const

/**
 * Sources that are marketing/commercial — subject to time-window guard.
 * Today: no caller sets these values (campaigns module doesn't exist yet).
 * Future campaign module MUST set source to one of these values by contract (D-02).
 */
export const MARKETING_SOURCES = ['campaign', 'marketing'] as const

export type TransactionalSource = typeof TRANSACTIONAL_SOURCES[number]
export type MarketingSource = typeof MARKETING_SOURCES[number]
export type SMSSource = TransactionalSource | MarketingSource
```

No agregar nada más. NO importar nada. NO exportar constantes per-source individuales (`SOURCE_AUTOMATION`, etc.) — Q3 resolvió dejarlo como readonly arrays por ahora.

Commit atómico en español:
```
feat(sms-source-taxonomy): agregar TRANSACTIONAL_SOURCES + MARKETING_SOURCES

- Define taxonomía canónica de sources SMS como readonly arrays + types
- Base para guard source-aware en domain/sms.ts
- Zero imports (mantiene convención anti-circular)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Verificar con `npx tsc --noEmit` antes del commit — DEBE pasar (este archivo es autocontenido y no depende de utils.ts ni de domain/sms.ts).
  </action>
  <verify>
    <automated>grep -q "TRANSACTIONAL_SOURCES = \['automation', 'domain-call', 'script'\] as const" src/lib/sms/constants.ts && grep -q "MARKETING_SOURCES = \['campaign', 'marketing'\] as const" src/lib/sms/constants.ts && grep -q "export type SMSSource = TransactionalSource | MarketingSource" src/lib/sms/constants.ts && ! grep -q "^import" src/lib/sms/constants.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export const TRANSACTIONAL_SOURCES" src/lib/sms/constants.ts` returns 1
    - `grep -c "'automation', 'domain-call', 'script'" src/lib/sms/constants.ts` returns 1
    - `grep -c "export const MARKETING_SOURCES" src/lib/sms/constants.ts` returns 1
    - `grep -c "'campaign', 'marketing'" src/lib/sms/constants.ts` returns 1
    - `grep -c "export type TransactionalSource" src/lib/sms/constants.ts` returns 1
    - `grep -c "export type MarketingSource" src/lib/sms/constants.ts` returns 1
    - `grep -c "export type SMSSource" src/lib/sms/constants.ts` returns 1
    - `grep -c "^import" src/lib/sms/constants.ts` returns 0 (zero imports preservado)
    - Constantes existentes (SMS_PRICE_COP, SMS_GSM7_SEGMENT_LENGTH, SMS_UCS2_SEGMENT_LENGTH, ONURIX_BASE_URL) siguen presentes sin modificar sus valores
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Constantes de taxonomía SMS + types exportados, zero-import preservado, tsc pasa, commit atómico creado.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Rename atómico cross-file (utils.ts + domain/sms.ts) en UN SOLO commit — honra Pitfall 3</name>
  <files>src/lib/sms/utils.ts, src/lib/domain/sms.ts</files>
  <read_first>
    - .planning/standalone/sms-time-window-by-type/CONTEXT.md §D-01, §D-02, §D-04
    - .planning/standalone/sms-time-window-by-type/RESEARCH.md §"Pattern 1" (guard), §"Pattern 3" (utils), §Example 2 (guard verbatim), §Example 3 (import verbatim), §"Open Questions Q5" (warn en fallback), §Pitfall 1, §Pitfall 3 (MANDATO: rename cross-file en commit único), §Pitfall 7
    - src/lib/sms/utils.ts (estado actual — líneas 52-66 es la función a renombrar; línea 6 es el import a consolidar)
    - src/lib/domain/sms.ts (estado actual — líneas 21-22 imports, 87-93 guard, ~148 fallback p_source en RPC)
    - src/lib/sms/constants.ts (post-Task 1 — TRANSACTIONAL_SOURCES ya exportado)
    - CLAUDE.md §"Regla 3: Domain Layer"
  </read_first>
  <action>
**Pitfall 3 de RESEARCH dice verbatim:** "Atomic commit: rename in `utils.ts` AND update import at `sms.ts:22` AND update the call at `sms.ts:88` in a single commit."

Por lo tanto este task modifica AMBOS archivos, valida `npx tsc --noEmit`, y crea UN SOLO commit. NO commitear parcial. El repo nunca queda en estado build-roto, ni siquiera local.

---

**CAMBIOS EN src/lib/sms/utils.ts**

**CAMBIO 1 — Agregar TRANSACTIONAL_SOURCES al import existente (línea 6):**

BEFORE:
```typescript
import { SMS_GSM7_SEGMENT_LENGTH, SMS_UCS2_SEGMENT_LENGTH } from './constants'
```

AFTER:
```typescript
import {
  SMS_GSM7_SEGMENT_LENGTH,
  SMS_UCS2_SEGMENT_LENGTH,
  TRANSACTIONAL_SOURCES,
} from './constants'
```

**CAMBIO 2 — Renombrar isWithinSMSWindow → isWithinMarketingSMSWindow y agregar isTransactionalSource.**

Reemplazar la función existente (líneas 52-66 actualmente):

BEFORE (líneas 52-66):
```typescript
/**
 * Check if current time is within Colombia SMS sending window.
 * CRC regulation: SMS only between 8 AM and 9 PM Colombia time.
 */
export function isWithinSMSWindow(): boolean {
  const now = new Date()
  const colombiaHour = parseInt(
    now.toLocaleString('en-US', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      hour12: false,
    })
  )
  return colombiaHour >= 8 && colombiaHour < 21
}
```

AFTER (sustituir ese bloque con esto — tomado verbatim de RESEARCH.md §Pattern 3):
```typescript
/**
 * Check whether an SMS source is transactional (bypass time-window guard).
 *
 * Permissive default (D-02): NULL/undefined/unknown sources are treated as transactional
 * so a missing `source` never blocks a legitimate dispatch. Marketing compliance is
 * defended by:
 *  - contract: sms_messages.source is NOT NULL (migration)
 *  - convention: callers must set source explicitly (enforced at code review)
 *
 * @param source - Value of SendSMSParams.source (possibly NULL/undefined).
 * @returns true if the source is transactional OR unknown (permissive); false only for
 *          explicit marketing sources ('campaign' | 'marketing').
 */
export function isTransactionalSource(source?: string | null): boolean {
  if (source == null) return true
  return (TRANSACTIONAL_SOURCES as readonly string[]).includes(source)
}

/**
 * Check if current time is within Colombia marketing-SMS sending window.
 * CRC regulation: marketing SMS only between 8 AM and 9 PM Colombia time.
 *
 * NOTE: This applies ONLY to marketing SMS. Transactional SMS bypass this check
 * via isTransactionalSource(). See standalone sms-time-window-by-type for rationale.
 *
 * NOTE: Current implementation is conservative (daily 8 AM - 9 PM). Actual CRC norm
 * differs by day (L-V 7-9PM, Sáb 8-8PM, Dom/festivos prohibited). Adjustment deferred
 * until campaign module exists.
 */
export function isWithinMarketingSMSWindow(): boolean {
  const now = new Date()
  const colombiaHour = parseInt(
    now.toLocaleString('en-US', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      hour12: false,
    })
  )
  return colombiaHour >= 8 && colombiaHour < 21
}
```

NO dejar el nombre viejo `isWithinSMSWindow` como alias. El rename es completo.

Las funciones `formatColombianPhone` y `calculateSMSSegments` NO se tocan.

---

**CAMBIOS EN src/lib/domain/sms.ts (MISMO commit que utils.ts)**

**CAMBIO 3 — Consolidar import en líneas 21-22:**

BEFORE (líneas 21-22):
```typescript
import { formatColombianPhone } from '@/lib/sms/utils'
import { isWithinSMSWindow } from '@/lib/sms/utils'
```

AFTER (líneas 21-22 — una sola import con 3 símbolos):
```typescript
import {
  formatColombianPhone,
  isWithinMarketingSMSWindow,
  isTransactionalSource,
} from '@/lib/sms/utils'
```

**CAMBIO 4 — Reemplazar guard en líneas 87-93:**

BEFORE (líneas 87-93):
```typescript
    // 2. Check time window
    if (!isWithinSMSWindow()) {
      return {
        success: false,
        error: 'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)',
      }
    }
```

AFTER (sustituir VERBATIM con este bloque — tomado de RESEARCH.md §Example 2):
```typescript
    // 2. Time window check — only applies to marketing SMS per CRC Res. 5111/2017.
    //    Transactional SMS (automation, domain-call, script) are exempt and can be
    //    sent 24/7. See .planning/standalone/sms-time-window-by-type/CONTEXT.md §D-01.
    if (!isTransactionalSource(params.source) && !isWithinMarketingSMSWindow()) {
      return {
        success: false,
        error: 'SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)',
      }
    }
```

El error message se mantiene LITERAL (D-04 + zero UI consumers per RESEARCH §"UI references").

**CAMBIO 5 — Agregar console.warn + effectiveSource antes del RPC (Q5 Pitfall 1).**

Localizar el bloque que empieza en `// 6. Atomic: INSERT sms_messages + UPDATE balance + INSERT transaction` y termina con `.single()`. Insertar DIRECTAMENTE ANTES del `const { data: rpcResult, error: rpcError } = await supabase` las siguientes líneas:

```typescript
    // Q5: warn on fallback so missing source is observable.
    if (!params.source) {
      console.warn('[SMS] source not set, falling back to domain-call', {
        phone: formattedPhone,
      })
    }
    const effectiveSource = params.source || 'domain-call'
```

Luego, DENTRO del objeto pasado a `.rpc('insert_and_deduct_sms_message', {...})`, reemplazar la línea `p_source: params.source || 'domain-call',` por:

```typescript
        p_source: effectiveSource,
```

El resto del objeto RPC queda intacto (p_workspace_id, p_provider_message_id, etc.).

---

**VALIDACIÓN + COMMIT ATÓMICO**

1. Correr `npx tsc --noEmit` — DEBE pasar. Si falla, revisar los 3 cambios; NO commitear estado roto.
2. Confirmar con grep que `isWithinSMSWindow` ya NO existe en `src/`:
   ```bash
   grep -rn "isWithinSMSWindow" src/
   ```
   Debe retornar 0 líneas.
3. Stage los 2 archivos: `git add src/lib/sms/utils.ts src/lib/domain/sms.ts`
4. Commit atómico en español (UN SOLO commit para ambos archivos):
```
refactor(sms-guard): bypass para SMS transaccionales + rename atómico

- utils.ts: agregar isTransactionalSource (default permisivo D-02) + renombrar
  isWithinSMSWindow → isWithinMarketingSMSWindow (lógica idéntica D-04)
- domain/sms.ts: guard source-aware (bypass 24/7 para transactional, window
  check solo para marketing) + import consolidado
- domain/sms.ts: console.warn cuando fallback 'domain-call' se dispara (Q5)
- Rename cross-file en commit único per RESEARCH §Pitfall 3 — evita estado
  build-roto entre commits
- Cierra incidente 2026-04-17 21:18 (SMS transaccional post-ventana)

Co-Authored-By: Claude <noreply@anthropic.com>
```

NO tocar `src/lib/automations/action-executor.ts` — ya setea `source: 'automation'` (verificado en RESEARCH §Call Site Inventory).
NO tocar scripts en `scripts/test-onurix-*.mjs` (RESEARCH §One-off scripts descarta).
NO unificar `DomainContext.source` con `SendSMSParams.source` (Pitfall 7 — taxonomías distintas).
NO agregar test runner (Q4 descarta).
NO pushear todavía — el push es Task 3.
  </action>
  <verify>
    <automated>grep -q "export function isTransactionalSource" src/lib/sms/utils.ts && grep -q "export function isWithinMarketingSMSWindow" src/lib/sms/utils.ts && ! grep -q "export function isWithinSMSWindow" src/lib/sms/utils.ts && grep -q "if (source == null) return true" src/lib/sms/utils.ts && grep -q "isTransactionalSource(params.source)" src/lib/domain/sms.ts && grep -q "isWithinMarketingSMSWindow()" src/lib/domain/sms.ts && ! grep -rq "isWithinSMSWindow" src/ && grep -q "source not set, falling back to domain-call" src/lib/domain/sms.ts && grep -q "effectiveSource = params.source" src/lib/domain/sms.ts && grep -q "p_source: effectiveSource" src/lib/domain/sms.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function isTransactionalSource" src/lib/sms/utils.ts` returns 1
    - `grep -c "export function isWithinMarketingSMSWindow" src/lib/sms/utils.ts` returns 1
    - `grep -c "export function isWithinSMSWindow" src/lib/sms/utils.ts` returns 0 (rename completo, sin alias)
    - `grep -c "TRANSACTIONAL_SOURCES" src/lib/sms/utils.ts` returns 1 (usado en isTransactionalSource)
    - `grep -c "from './constants'" src/lib/sms/utils.ts` returns 1 (import consolidado)
    - `grep -c "if (source == null) return true" src/lib/sms/utils.ts` returns 1 (default permisivo D-02)
    - `grep -c "colombiaHour >= 8 && colombiaHour < 21" src/lib/sms/utils.ts` returns 1 (lógica marketing intacta D-04)
    - Funciones `formatColombianPhone` y `calculateSMSSegments` existen sin cambios de firma
    - `grep -c "isTransactionalSource(params.source)" src/lib/domain/sms.ts` returns 1
    - `grep -c "isWithinMarketingSMSWindow()" src/lib/domain/sms.ts` returns 1
    - `grep -c "if (!isTransactionalSource(params.source) && !isWithinMarketingSMSWindow())" src/lib/domain/sms.ts` returns 1 (guard exacto)
    - `grep -c "SMS no enviado: fuera de horario permitido (8 AM - 9 PM Colombia)" src/lib/domain/sms.ts` returns 1 (error intacto D-04)
    - `grep -c "source not set, falling back to domain-call" src/lib/domain/sms.ts` returns 1 (warn Q5 presente)
    - `grep -q "effectiveSource = params.source" src/lib/domain/sms.ts` exits 0 (variable local creada)
    - `grep -c "p_source: effectiveSource" src/lib/domain/sms.ts` returns 1
    - `grep -c "p_source: params.source" src/lib/domain/sms.ts` returns 0 (reemplazo completo)
    - `grep -c "from '@/lib/sms/utils'" src/lib/domain/sms.ts` returns 1 (import consolidado, NO dos líneas)
    - `grep -rn "isWithinSMSWindow" src/` returns 0 líneas (nombre viejo erradicado GLOBAL)
    - `npx tsc --noEmit` exits 0 DESPUÉS del commit (no hay estado intermedio roto)
    - UN SOLO commit creado con prefijo `refactor(sms-guard)` conteniendo AMBOS archivos (verificar con `git show --stat HEAD` — debe listar utils.ts y domain/sms.ts)
    - `src/lib/automations/action-executor.ts` NO fue modificado (`git diff HEAD~1 -- src/lib/automations/action-executor.ts` vacío)
  </acceptance_criteria>
  <done>Rename cross-file y guard source-aware aplicados en UN SOLO commit atómico. tsc pasa. Repo NUNCA quedó en estado build-roto. Pitfall 3 de RESEARCH honrado.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Push a Vercel + checkpoint humano — usuario confirma deploy "Ready"</name>
  <files>N/A (push + verificación humana en Vercel dashboard)</files>
  <read_first>
    - CLAUDE.md §"Regla 1: Push a Vercel"
    - .planning/standalone/sms-time-window-by-type/01-SUMMARY.md (confirmar que migración Plan 01 ya está aplicada en prod — precondición Regla 5)
  </read_first>
  <what-built>
Task 1 creó la taxonomía en `src/lib/sms/constants.ts` (commit 1).
Task 2 aplicó rename atómico + guard source-aware + warn en fallback en `src/lib/sms/utils.ts` y `src/lib/domain/sms.ts` (commit 2).

Ambos commits existen en la rama main LOCAL. `npx tsc --noEmit` pasó en ambos commits (no hay estado build-roto intermedio — Pitfall 3 honrado).

Falta: push a origin/main (Regla 1) y validación del build en Vercel (solo el dashboard puede confirmar "Ready").
  </what-built>
  <how-to-verify>
PASO 1 — El agente ejecuta el push:

```bash
# Confirmar estado local antes del push
git log --oneline -3
# Debería mostrar (de más nuevo a más viejo):
#   refactor(sms-guard): bypass para SMS transaccionales + rename atómico
#   feat(sms-source-taxonomy): agregar TRANSACTIONAL_SOURCES + MARKETING_SOURCES
#   feat(sms-source-not-null): migración NOT NULL en sms_messages.source

# Push
git push origin main
```

Confirmar que `git log origin/main..HEAD` queda vacío después del push.

PASO 2 — Usuario abre el dashboard de Vercel:
- URL: https://vercel.com/dashboard
- Navegar al proyecto `morfx-new`
- Ir a la pestaña "Deployments"
- Buscar el deployment correspondiente al último commit pusheado (SHA del commit `refactor(sms-guard)`)

PASO 3 — Usuario espera a que el deployment complete (típicamente 2-5 min).

PASO 4 — Usuario reporta el status del deployment:
- Si status = "Ready" (verde) → responder "deploy Ready ✓" para cerrar el checkpoint y proceder al Plan 03.
- Si status = "Error" (rojo) → pegar el log del error. NO cerrar el checkpoint. El plan debe revisarse antes de continuar.
- Si status = "Building" después de 10 min → revisar manualmente logs.

PASO 5 — (Opcional, observabilidad) Usuario puede verificar que no hay errores runtime en Functions logs inmediatamente después del deploy.
  </how-to-verify>
  <acceptance_criteria>
    - `git push origin main` ejecutado exitosamente (exit 0)
    - Usuario confirma explícitamente en el chat: "deploy Ready ✓" (o equivalente indicando status verde en Vercel dashboard)
    - Si el deploy falla: plan debe revisarse; NO cerrar este checkpoint como exitoso
    - Commits pusheados visibles en origin/main (`git log origin/main..HEAD` vacío)
  </acceptance_criteria>
  <resume-signal>
Responder "deploy Ready ✓" cuando el deployment esté en status Ready en Vercel dashboard. Si hay error en el build, pegar el log del error — NO cerrar con "ok" si no está verde.
  </resume-signal>
  <done>Push ejecutado, usuario confirmó Vercel deploy Ready, código del Plan 02 vivo en producción, listo para smoke test del Plan 03.</done>
</task>

</tasks>

<verification>
- 3 archivos TS modificados: constants.ts (taxonomía + types), utils.ts (helper + rename), domain/sms.ts (import + guard + warn)
- `grep -rn "isWithinSMSWindow" src/` returns 0 matches (nombre viejo erradicado)
- `grep -rn "isTransactionalSource" src/` returns ≥ 2 matches (definición en utils + uso en domain)
- `grep -rn "isWithinMarketingSMSWindow" src/` returns ≥ 2 matches (definición en utils + uso en domain)
- `npx tsc --noEmit` exits 0 tras CADA commit (no hay build roto entre commits — Pitfall 3 honrado)
- 2 commits atómicos en main: (a) constants; (b) rename+guard+warn CROSS-FILE
- Vercel deploy status: Ready (confirmado por usuario en checkpoint humano)
- src/lib/automations/action-executor.ts sigue pasando `source: 'automation'` sin cambios
- DomainContext.source y SendSMSParams.source NO fueron unificadas (Pitfall 7 respetado)
</verification>

<success_criteria>
- Código refactorizado y pusheado a Vercel con deploy exitoso confirmado por usuario
- El guard diferencia transactional (24/7) vs marketing (window)
- Fallback `'domain-call'` emite console.warn observabilidad (Q5)
- Ningún símbolo legacy (`isWithinSMSWindow`) queda en src/
- Pitfall 3 de RESEARCH honrado: rename cross-file en commit atómico único, repo nunca en estado build-roto
- Incidente 2026-04-17 21:18 queda cerrable por comportamiento en próxima ventana nocturna
- Listo para smoke test del Plan 03
</success_criteria>

<output>
Después de completar, crear `.planning/standalone/sms-time-window-by-type/02-SUMMARY.md` con:
- Diff summary de los 3 archivos TS (breve)
- Output literal de `npx tsc --noEmit` (debería ser vacío = ok)
- SHA de los 2 commits creados (constants; rename+guard)
- Confirmación explícita del usuario del status Vercel "Ready"
- Cualquier discrepancia con el plan o el research
</output>
</output>
