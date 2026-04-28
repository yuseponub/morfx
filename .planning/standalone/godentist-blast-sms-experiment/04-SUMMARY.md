---
phase: godentist-blast-sms-experiment
plan: 04
status: complete
completed: 2026-04-28
wave: 3
---

# Plan 04 — Blast Script + Cron Wrapper

## What was built

- **`scripts/godentist-blast-experiment.ts`** (~440 LoC) — Script principal del blast masivo. Clon estructural de `godentist-send-scheduled.ts` extendido con A/B split + sendSMS para grupo B (D-17: archivo NUEVO, NO modifica el original).
- **`scripts/godentist-blast-experiment-cron.sh`** — Wrapper bash para crontab WSL (NVM load + tsx invoke + log redirect a `blast-experiment/logs/cron_YYYY-MM-DD_HHMM.log`).

Ambos archivos NO mutan ningún DB schema ni tocan el script anterior. Listos para Plan 05 (dry-run + crontab swap).

## Estructura del script principal

| Sección | Líneas | Función |
|---------|--------|---------|
| CONFIG | 1-65 | Env, workspace, template name, BATCH_SIZE=900, paths |
| SUPABASE + 360DIALOG | 66-100 | `normalizePhone`, `send360Template` (clones verbatim) |
| SMS RENDER | 101-130 | `stripAccents`, `isGSM7`, `buildSMSText` (D-10/D-11 override texto) |
| A/B HASH SPLIT | 131-160 | `assignAB` (SHA-256 sort + half split) |
| STATE FILE | 161-200 | `loadState` / `saveState` con `experiment_progress` |
| ASSIGNMENTS | 201-220 | `loadAssignments` / `saveAssignments` (append-only JSON) |
| SKIPPED CSV | 221-235 | `appendSkipped` con escape correcto |
| MAIN | 236-440 | Hard guards (día + hora) → load slice → A/B split → loop WA+SMS → state update + log |

## Decisiones LOCKED ejecutadas

- **D-04** Reporte CSV de bounces — ✓ `appendSkipped` con razones taxonómicas (`phone_invalid`, `wa_send_failed`, `sms_send_failed`)
- **D-05** A/B determinista hash(phone) — ✓ `assignAB` SHA-256 + sort + half (per-run split: 450A + 450B con BATCH_SIZE=900)
- **D-06** Tracking en JSON local — ✓ `state` (offset+history+experiment_progress) + `assignments.json` (append-only AssignmentEntry[]) + `skipped.csv`
- **D-08** SMS ~500ms post WA en mismo loop — ✓ `SMS_INTRA_DELAY_MS=500` entre WA y SMS para grupo B
- **D-09** Domain layer billing — ✓ `sendSMS(ctx, params)` con workspace GoDentist
- **D-10** Texto SMS (post-override 2026-04-28) — ✓ `Hola {nombre}, GoDentist cambio de numero. Para agendar tu cita odontologica escribenos por WhatsApp https://wa.me/573016262603`
- **D-11** Edge case nombre largo — ✓ Two-gate fallback (`!isGSM7(personalized)` || `length > 160`)
- **D-12** `source: 'campaign'` en params — ✓ activa marketing window guard
- **D-14** Saturday + Sunday skip — ✓ `dayOfWeek === 0 || dayOfWeek === 6` defense-in-depth
- **D-15 (override)** 2 cron runs/día — ✓ wrapper se invoca 2x/día via crontab Plan 05
- **D-16 (override)** BATCH_SIZE=900, DELAY_MS=1000 — ✓
- **D-17** Script aparte, NO contamina scheduled.ts — ✓ `git diff scripts/godentist-send-scheduled.ts` vacío

## Verificaciones automatizadas pasadas

```
sendSMS                       : 3 (≥2 ✓)
stripAccents                  : 2 (≥2 ✓)
source: 'campaign'            : 1 (≥1 ✓)
source: 'script'              : 1 (≥1 ✓) — operational ctx taxonomy
DomainContext                 : 2 (≥2 ✓)
BATCH_SIZE = 900              : 1 (≥1 ✓) — post-D-16 override
DELAY_MS = 1000               : 1 (≥1 ✓)
createHash('sha256')          : 1 (≥1 ✓)
dayOfWeek === 6               : 1 (≥1 ✓)
colombiaHour < 8              : 1 (≥1 ✓)
wa.me/573016262603            : 2 (≥2 ✓) personalized + fallback
blast-experiment-state.json   : 2 (≥1 ✓)
assignments.json              : 2 (≥1 ✓)
skipped.csv                   : 2 (≥1 ✓)
experiment_progress           : 8 (≥3 ✓)
```

Behavioral test: `'José'.normalize('NFD').replace(/[̀-ͯ]/g,'') === 'Jose'` ✓ PASS.

Wrapper bash:
```
godentist-blast-experiment.ts : 1 (≥1 ✓)
blast-experiment/logs         : 2 (≥1 ✓)
NVM_DIR                       : 2 (≥1 ✓) Pitfall 5 covered
godentist-send-scheduled.ts   : 0 (=0 ✓) no apunta al script anterior
test -x ...                   : ✓ executable bit set
bash -n ...                   : syntax OK
```

## Deviations vs acceptance criteria

**3 menciones a `godentist-send-scheduled.ts` en el script principal** (espera 0 según criterio estricto). Son referencias en comentarios:
- `// CLONE VERBATIM from godentist-send-scheduled.ts:47-53` (normalizePhone)
- `// CLONE VERBATIM from godentist-send-scheduled.ts:55-78` (send360Template)
- `// CLONE scheduled.ts:175-237` (WA contact/conversation/messages flow)

**Razón de la deviation:** trazabilidad — futuros mantenedores ven exactamente qué partes son clones verbatim del script anterior. La INTENCIÓN de D-17 ("no toca el existing") está satisfecha:
- `git diff scripts/godentist-send-scheduled.ts` empty → byte-for-byte sin cambios.
- `scripts/godentist-blast-experiment.ts` vive en archivo aparte.

Deviation documentada y justificada — no bloquea Plan 05.

## Limitación conocida (Inngest delivery-check)

El script corre desde cron WSL (script-context, sin INNGEST_EVENT_KEY válido del runtime serverless). El `inngest.send({name:'sms/delivery.check'})` post-RPC en `src/lib/domain/sms.ts:217` falla con 401 — pero el SMS ya fue **enviado** y **persistido** via RPC atómico antes de ese punto.

**Impacto:** perdemos el delivery-check async (que verifica el estado real Onurix horas después). NO afecta el experimento — la métrica del estudio es **inbound message en 3 días post-WA** (D-07), no delivery-rate.

**Verificado en Plan 03 test 5 SMS** con el mismo error 401 — los 5 SMS llegaron correctamente al celular del usuario.

## Files que modifica el script en producción (audit trail)

Cada run del cron escribe a:

**Local FS:**
- `godentist/pacientes-data/blast-experiment-state.json` (offset + history + progress)
- `godentist/pacientes-data/blast-experiment/assignments.json` (append-only)
- `godentist/pacientes-data/blast-experiment/skipped.csv` (append-only)
- `godentist/pacientes-data/blast-experiment/logs/cron_YYYY-MM-DD_HHMM.log`

**Supabase prod (workspace GoDentist):**
- `contacts` INSERT/SELECT (idempotente via 23505 retry pattern)
- `conversations` INSERT/SELECT (idempotente igual)
- `messages` INSERT (1 row per WA template send, `template_name='nuevo_numerov2'`)
- `sms_messages` INSERT vía RPC `insert_and_deduct_sms_message` (1 row per group B SMS, `source='campaign'`)
- `sms_workspace_config` UPDATE balance via RPC (debit $97/SMS al workspace GoDentist)
- `sms_transactions` INSERT vía RPC (audit ledger)

## Next

→ Plan 05: Dry-run del script con lista pequeña (10-15 phones del equipo) ANTES de producción + swap del crontab WSL (eliminar 2 entries `godentist-send-cron.sh` mar-sáb + agregar 2 entries `godentist-blast-experiment-cron.sh` lun-vie 10:30 + 14:30).

Para arrancar el experimento mañana mié 29 abril 10:30, Plan 05 debe cerrar HOY mar 28 abril.
