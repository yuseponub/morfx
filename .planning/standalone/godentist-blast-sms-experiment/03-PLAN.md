---
phase: godentist-blast-sms-experiment
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - scripts/test-blast-sms-5-team.ts
autonomous: false
requirements:
  - D-09
  - D-10
  - D-11
  - D-12
  - D-13.4

must_haves:
  truths:
    - "5 SMS reales enviados a teléfonos del equipo (incluido al menos 1 nombre con acento para validar strip)"
    - "Cada SMS llega en 1 segmento (verificado via result.data.segmentsUsed === 1)"
    - "Texto renderiza completo, link wa.me/573016262603 es tappable, {nombre} se reemplaza correctamente"
    - "Acentos del nombre se han quitado en el SMS (ej. 'José' → 'Jose')"
    - "sendSMS retorna success=true con segmentsUsed=1 para los 5 envíos"
  artifacts:
    - path: "scripts/test-blast-sms-5-team.ts"
      provides: "Script throwaway que envía 5 SMS reales usando sendSMS con la lógica idéntica del blast (accent strip + fallback)"
      min_lines: 80
  key_links:
    - from: "scripts/test-blast-sms-5-team.ts"
      to: "src/lib/domain/sms.ts:sendSMS"
      via: "import + invocación con source='campaign'"
      pattern: "sendSMS\\("
    - from: "scripts/test-blast-sms-5-team.ts"
      to: "src/lib/sms/utils.ts:calculateSMSSegments"
      via: "verificación segmentos pre-send (defensa)"
      pattern: "calculateSMSSegments|segmentsUsed"
---

<objective>
Smoke test pre-blast: enviar 5 SMS reales a números del equipo morfx (Jose + 4 más a confirmar con usuario) usando exactamente la lógica del Plan 04 (accent strip + fallback nombre largo + source='campaign'). Cumple D-13.4 obligatorio antes del primer cron run.

Purpose: Detectar problemas operativos ANTES del blast masivo:
- Sender ID Onurix renderiza correctamente
- Texto llega 1 segmento (no se corta)
- Link `wa.me/573016262603` es tappable y abre WhatsApp con número correcto
- Personalización `{nombre}` se reemplaza
- Acento test (1 nombre con acento) confirma que strip funciona end-to-end
- Verifica que la fila `sms_workspace_config` GoDentist (creada en Plan 02) funciona

Costo: 5 × $97 = $485 COP interno debitados al workspace GoDentist (5 × $18.75 = $93.75 wholesale Onurix).

Output:
- `scripts/test-blast-sms-5-team.ts` (script throwaway, opcional dejar committeado como utility)
- 5 SMS reales en celulares del equipo
- Confirmación humana visual de cada uno

Cumple D-09 (sendSMS), D-10 (texto exacto), D-11 (fallback nombre largo), D-12 (source='campaign'), D-13.4 (test 5 SMS).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-blast-sms-experiment/CONTEXT.md
@.planning/standalone/godentist-blast-sms-experiment/RESEARCH.md
@src/lib/domain/sms.ts
@src/lib/sms/utils.ts
@src/lib/sms/constants.ts
@CLAUDE.md
</context>

<interfaces>
<!-- sendSMS contract — verified src/lib/domain/sms.ts:75-244 -->

```typescript
import { sendSMS } from '@/lib/domain/sms'
import type { DomainContext } from '@/lib/domain/types'

const ctx: DomainContext = {
  workspaceId: '36a74890-aad6-4804-838c-57904b1c9328',
  source: 'script',  // operational taxonomy
}

const result = await sendSMS(ctx, {
  phone: '+573...',          // any colombian format
  message: 'Hola Jose, ...', // ASCII-only after accent strip
  source: 'campaign',         // regulatory taxonomy — D-12 → activates 8AM-9PM guard
  contactName: 'Jose Test',
})

// result type: DomainResult<SendSMSResult>
// success=true: { data: { smsMessageId, dispatchId, status: 'sent', segmentsUsed, costCop } }
// success=false: { error: string }
```

**Two source levels** (CRITICAL — RESEARCH.md File Reuse Map):
- `ctx.source` = `'script'` (operational origin — TRANSACTIONAL_SOURCES would bypass guard, but params.source overrides)
- `params.source` = `'campaign'` (regulatory — MARKETING_SOURCES → activates 8AM-9PM window)
- `params.source` is the one that controls window guard (utils.ts:69-72 returns false for `'campaign'`)
</interfaces>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: Confirmar 5 números de teléfono del equipo</name>
  <decision>Lista de 5 phones reales que recibirán los SMS de prueba</decision>
  <context>
    El test envía SMS reales que cuestan $485 COP al workspace GoDentist y son visibles en los celulares de los destinatarios. NO podemos hardcodear números aleatorios. El usuario debe proveer:

    - Phone 1: Jose (owner del proyecto) — siempre incluido
    - Phone 2-5: 4 números más del equipo morfx o testers de confianza

    Idealmente al menos 1 con un nombre con acento (ej. `José`, `María`, `Andrés`) para validar que el `stripAccents` funciona end-to-end.

    Ningún número debe estar en la lista 2019-2022 (NO usar pacientes reales — son noise para el experimento).
  </context>
  <options>
    <option id="phones-provided">
      <name>Usuario provee 5 phones + nombres ahora</name>
      <pros>Test ejecutable inmediatamente</pros>
      <cons>Requiere input síncrono</cons>
    </option>
    <option id="phones-jose-only">
      <name>Solo phone de Jose × 5 con nombres distintos</name>
      <pros>Datos contenidos a 1 destinatario; barato ($485 al mismo phone)</pros>
      <cons>No valida sender ID en otros equipos / no valida deliverability cross-carrier</cons>
    </option>
  </options>
  <resume-signal>Type "phones: +57XXX1=Nombre1, +57XXX2=Nombre2, ..." con 5 pares; idealmente al menos 1 nombre con acento. O type "jose-only" para opción degradada.</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Crear scripts/test-blast-sms-5-team.ts</name>
  <read_first>
    - src/lib/domain/sms.ts (signature de sendSMS líneas 75-78, gates 100-127)
    - src/lib/sms/utils.ts (líneas 49-54 calculateSMSSegments, 69-72 isTransactionalSource)
    - src/lib/sms/constants.ts (líneas 7 SMS_PRICE_COP, 36 MARKETING_SOURCES)
    - .planning/standalone/godentist-blast-sms-experiment/CONTEXT.md (D-10 texto exacto, D-11 fallback)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (Pattern 3: accent strip, Example 1)
    - scripts/godentist-send-scheduled.ts:16-17 (dotenv pattern)
  </read_first>
  <files>scripts/test-blast-sms-5-team.ts</files>
  <action>
Crear el archivo `scripts/test-blast-sms-5-team.ts` con:

```typescript
/**
 * Test SMS pre-blast — 5 SMS reales a números del equipo morfx.
 * Cumple D-13.4 del standalone godentist-blast-sms-experiment.
 *
 * IMPORTANTE: Este script DEBITA $485 COP del workspace GoDentist.
 * NO ejecutar más de una vez sin razón.
 *
 * Usage: npx tsx scripts/test-blast-sms-5-team.ts
 */
import dotenv from 'dotenv'
dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })

import { sendSMS } from '@/lib/domain/sms'
import { calculateSMSSegments } from '@/lib/sms/utils'
import type { DomainContext } from '@/lib/domain/types'

const WORKSPACE_ID = '36a74890-aad6-4804-838c-57904b1c9328'

// === REPLACE WITH PHONES FROM TASK 1 ===
const TEST_RECIPIENTS: Array<{ phone: string; nombre: string }> = [
  // Ejemplo (será reemplazado en Task 1):
  // { phone: '+573016262603', nombre: 'Jose' },
  // { phone: '+573...', nombre: 'José' },  // ← acento intencional para validar strip
  // { phone: '+573...', nombre: 'María' },
  // { phone: '+573...', nombre: 'Andrés' },
  // { phone: '+573...', nombre: 'Carlos' },
]

// === IDÉNTICO al buildSMSText de Plan 04 (Pattern 3 RESEARCH.md) ===
// CRITICAL: Use Unicode escape ̀-ͯ (combining diacritical marks block)
// instead of literal combining-mark bytes — copy-paste of literal bytes can be
// silently normalized away, producing a regex that matches NOTHING. (RESEARCH.md Pitfall 1)
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function isGSM7(s: string): boolean {
  return /^[\x20-\x7E\n\r]*$/.test(s)
}

function buildSMSText(rawName: string): string {
  const safeName = stripAccents(rawName).trim().split(/\s+/)[0]
  const personalized = `Hola ${safeName}, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603`
  const fallback = `Hola, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603`

  if (!isGSM7(personalized) || personalized.length > 160) {
    return fallback
  }
  return personalized
}

async function main() {
  if (TEST_RECIPIENTS.length !== 5) {
    console.error(`[test-sms] ERROR: TEST_RECIPIENTS debe tener 5 entries, tiene ${TEST_RECIPIENTS.length}.`)
    console.error(`Editar el array dentro de ${__filename} antes de ejecutar.`)
    process.exit(1)
  }

  // Hard guard hora — defensive (Pitfall 3 RESEARCH.md)
  const colombiaHour = parseInt(new Date().toLocaleString('en-US', {
    timeZone: 'America/Bogota', hour: 'numeric', hour12: false,
  }))
  if (colombiaHour < 8 || colombiaHour >= 21) {
    console.error(`[test-sms] Hora ${colombiaHour}h fuera de ventana 8AM-9PM Colombia. Abortando.`)
    process.exit(1)
  }

  console.log(`[test-sms] Enviando 5 SMS reales (costo: $485 COP @ workspace GoDentist)`)
  console.log(`[test-sms] Hora Colombia: ${colombiaHour}h ✓`)
  console.log()

  const ctx: DomainContext = { workspaceId: WORKSPACE_ID, source: 'script' }

  for (let i = 0; i < TEST_RECIPIENTS.length; i++) {
    const r = TEST_RECIPIENTS[i]
    const text = buildSMSText(r.nombre)
    const expectedSegs = calculateSMSSegments(text)

    console.log(`[${i + 1}/5] To: ${r.phone} | Name: ${r.nombre}`)
    console.log(`       Text (${text.length} chars, ~${expectedSegs} seg): ${text}`)

    if (expectedSegs > 1) {
      console.error(`       ⚠ ABORT: ${expectedSegs} segmentos esperados (debe ser 1).`)
      console.error(`       Revisar lógica buildSMSText antes de continuar.`)
      process.exit(1)
    }

    const result = await sendSMS(ctx, {
      phone: r.phone,
      message: text,
      source: 'campaign',  // D-12: regulatory marketing
      contactName: r.nombre,
    })

    if (!result.success) {
      console.error(`       ✗ ERROR: ${result.error}`)
      console.error(`       Abortando — investigar antes de blast masivo.`)
      process.exit(1)
    }

    console.log(`       ✓ Sent — segmentsUsed=${result.data!.segmentsUsed}, costCop=${result.data!.costCop}, dispatchId=${result.data!.dispatchId}`)

    if (result.data!.segmentsUsed > 1) {
      console.warn(`       ⚠ WARNING: Onurix reportó ${result.data!.segmentsUsed} segmentos. Strip de acentos podría no estar funcionando.`)
    }

    // Sleep 1.5s entre tests (no spam Onurix)
    if (i < TEST_RECIPIENTS.length - 1) {
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  console.log()
  console.log(`[test-sms] DONE. 5 SMS enviados. Revisa cada celular y confirma:`)
  console.log(`  1. Llegó el mensaje (vs delivery delay normal Onurix ~10s).`)
  console.log(`  2. {nombre} renderizó correctamente (sin acentos en SMS).`)
  console.log(`  3. Link wa.me/573016262603 es tappable y abre WhatsApp.`)
  console.log(`  4. Sender ID Onurix se ve OK (no número custom).`)
  console.log(`  5. Texto completo, no truncado.`)
}

main().catch(err => {
  console.error('[test-sms] Fatal:', err)
  process.exit(1)
})
```

Decisiones del script:
- **`TEST_RECIPIENTS` array vacío en commit** — el ejecutor edita el array con los 5 phones confirmados en Task 1 ANTES de correr.
- **Hard guard hora (Pitfall 3)**: si está fuera de 8AM-9PM aborta antes de quemar saldo.
- **`calculateSMSSegments` pre-send check**: si la lógica de `buildSMSText` rompe (ej. nombre con caracter raro que evade el strip), aborta antes de mandar.
- **Misma `buildSMSText` que Plan 04**: garantiza que el test refleja el código real del blast — no diverge.
- **Regex `̀-ͯ` Unicode escape (NO literal bytes)**: copy-paste de literal combining-mark bytes en markdown puede normalizarse y quedar regex vacío; el escape Unicode es robusto a copy-paste.
- **`source='campaign'` en params**: replica D-12 — si la ventana o la regla de marketing rompe, también lo veremos en este test.
- **Sleep 1.5s entre tests**: respetuoso con Onurix, no rate-limit.
- **Result.data.segmentsUsed warning**: si Onurix reporta >1 segment a pesar de pre-check OK, hay discrepancia entre nuestra `calculateSMSSegments` y la realidad — flag para investigar.
  </action>
  <verify>
    <automated>test -f scripts/test-blast-sms-5-team.ts && grep -c "buildSMSText" scripts/test-blast-sms-5-team.ts | xargs test 2 -le && grep -c "stripAccents" scripts/test-blast-sms-5-team.ts | xargs test 2 -le && grep -c "source: 'campaign'" scripts/test-blast-sms-5-team.ts | xargs test 1 -le && grep -c "calculateSMSSegments" scripts/test-blast-sms-5-team.ts | xargs test 1 -le && grep -c "colombiaHour" scripts/test-blast-sms-5-team.ts | xargs test 1 -le && grep -c "\\\\u0300" scripts/test-blast-sms-5-team.ts | xargs test 1 -le && node -e "const s='José'.normalize('NFD').replace(/[̀-ͯ]/g,''); if(s!=='Jose')process.exit(1)"</automated>
  </verify>
  <acceptance_criteria>
    - `test -f scripts/test-blast-sms-5-team.ts` returns 0
    - `grep -c "buildSMSText" scripts/test-blast-sms-5-team.ts` returns ≥ 2 (def + use)
    - `grep -c "stripAccents" scripts/test-blast-sms-5-team.ts` returns ≥ 2
    - `grep -c "source: 'campaign'" scripts/test-blast-sms-5-team.ts` returns ≥ 1 (D-12)
    - `grep -c "calculateSMSSegments" scripts/test-blast-sms-5-team.ts` returns ≥ 1
    - `grep -c "colombiaHour" scripts/test-blast-sms-5-team.ts` returns ≥ 1 (hard guard)
    - `grep -c "wa.me/573016262603" scripts/test-blast-sms-5-team.ts` returns ≥ 2 (personalized + fallback)
    - `grep -c "\\u0300" scripts/test-blast-sms-5-team.ts` returns ≥ 1 (Unicode escape used in regex — Pitfall 1 RESEARCH.md)
    - `node -e "const s='José'.normalize('NFD').replace(/[̀-ͯ]/g,''); if(s!=='Jose')process.exit(1)"` returns exit code 0 (behavioral test: stripAccents regex actually works)
  </acceptance_criteria>
  <done>Script de test creado con lógica idéntica a Plan 04. TEST_RECIPIENTS vacío — listo para que el ejecutor edite con los 5 phones confirmados en Task 1.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Editar TEST_RECIPIENTS, ejecutar test, validar 5 SMS</name>
  <what-built>
    Script `scripts/test-blast-sms-5-team.ts` con TEST_RECIPIENTS vacío esperando los 5 phones del Task 1.
  </what-built>
  <how-to-verify>
**Pasos manuales:**

1. Editar `scripts/test-blast-sms-5-team.ts`:
   - Reemplazar el array `TEST_RECIPIENTS` con los 5 phones+nombres confirmados en Task 1.
   - Asegurar al menos 1 nombre con acento (ej. `'José'`).

2. Verificar saldo pre-test:
   ```bash
   # Opcional: query del balance pre-test desde Supabase SQL editor
   SELECT balance_cop FROM sms_workspace_config WHERE workspace_id='36a74890-aad6-4804-838c-57904b1c9328';
   ```
   Esperar: balance_cop ≥ $450.000 (post-Plan 02).

3. Ejecutar el test:
   ```bash
   cd /mnt/c/Users/Usuario/Proyectos/morfx-new
   npx tsx scripts/test-blast-sms-5-team.ts
   ```

4. Esperar a que terminen los 5 envíos (~10 segundos total).

5. **Validar output del script:**
   - 5 líneas con `✓ Sent — segmentsUsed=1, costCop=97, dispatchId=...`
   - 0 líneas con `✗ ERROR` o `⚠ WARNING`

6. **Validar en cada celular receptor (manual):**
   - SMS llegó dentro de ~30 segundos.
   - `{nombre}` se renderizó (ej. "Hola Jose," NO "Hola {nombre},").
   - El nombre con acento se ve sin acento (ej. "Hola Jose," cuando el input fue "José").
   - Link `wa.me/573016262603` es tappable y abre WhatsApp con número GoDentist preseteado.
   - Texto completo, no truncado a la mitad.
   - Sender ID Onurix se ve OK (número genérico Onurix, no número raro).

7. Verificar saldo post-test:
   ```sql
   SELECT balance_cop FROM sms_workspace_config WHERE workspace_id='36a74890-aad6-4804-838c-57904b1c9328';
   ```
   Esperar: balance_cop = ($450.000 inicial - $485) ≈ $449.515.

8. Verificar audit en sms_messages:
   ```sql
   SELECT to_number, segments, cost_cop, status, source, created_at
   FROM sms_messages
   WHERE workspace_id='36a74890-aad6-4804-838c-57904b1c9328'
   ORDER BY created_at DESC LIMIT 5;
   ```
   Esperar: 5 rows con `segments=1`, `cost_cop=97`, `source='campaign'`, `status='sent'`.

Si CUALQUIER validación falla:
- segments != 1 en SQL → strip de acentos NO funcionó end-to-end. Investigar antes de Plan 04.
- SMS no llegó → problema deliverability / Onurix. Investigar antes de blast masivo.
- Link no es tappable → revisar formato del SMS. Posible problema con espacio/coma antes de `https://`.
  </how-to-verify>
  <resume-signal>Type "5/5 ok" si los 5 SMS llegaron, segmentsUsed=1 en todos, link tappable, accents strip OK. Type "blocked: ..." si algo falló.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Script → Onurix API | Real SMS dispatch via domain → Onurix |
| Script → Supabase prod | Audit row insert via RPC |
| Recipient phone | Real human receiving the SMS — must be team-confirmed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-blast-03-01 | Information Disclosure | Phones de equipo en commit history | accept | El script puede mantenerse con TEST_RECIPIENTS vacío post-test (limpiar antes de commit) |
| T-blast-03-02 | DoS | Script ejecutado múltiples veces accidentalmente, drenando saldo | mitigate | Hard guard hora + check `length !== 5`; el costo cap es $485 por run |
| T-blast-03-03 | Spoofing | Mensajes con sender ID inadecuado | mitigate | Validación visual del Sender ID Onurix en cada celular |
</threat_model>

<verification>
- Script existe y tiene la lógica idéntica al Plan 04.
- 5 SMS reales enviados, llegados, validados visualmente.
- Audit en `sms_messages` confirma `segments=1, cost_cop=97, source='campaign'` para los 5.
- Saldo workspace debitado en exactamente $485.
</verification>

<success_criteria>
- 5 SMS reales delivered a celulares del equipo
- 5 rows en `sms_messages` con `segments=1, cost_cop=97, source='campaign'`
- Confirmación humana visual: texto OK, link tappable, accents strip funcionando
- Saldo `sms_workspace_config.balance_cop` = $450.000 - $485 ≈ $449.515
- Si algún SMS no llegó o segments > 1, Plan 04 NO procede hasta investigar
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-blast-sms-experiment/03-SUMMARY.md` registrando:
- 5 phones+nombres usados (anonimizar si es necesario, ej. solo nombres + último 4 digits)
- Output del script (segmentsUsed, costCop por cada uno)
- Confirmación visual por celular (delivered timestamp, sender ID visto, link verificado)
- Saldo pre/post-test
- Cualquier discrepancia entre `calculateSMSSegments` local y `result.data.segmentsUsed` Onurix
</output>
</output>
