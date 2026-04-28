---
phase: godentist-blast-sms-experiment
plan: 03
status: complete
completed: 2026-04-28
wave: 2
---

# Plan 03 — Test 5 SMS al Equipo (jose-only mode)

## What was built

- **`scripts/test-blast-sms-5-team.ts`** — Smoke test pre-blast: envía 5 SMS reales con la lógica idéntica del Plan 04 (`stripAccents`, `buildSMSText`, hard guard hora, `calculateSMSSegments` pre-check, `sendSMS` con `source='campaign'`).
- **5 SMS reales enviados** al `+573137549286` (jose-only mode escogido por usuario) con 5 nombres distintos (`Jose / José / María / Andrés / Carlos`) — costo $485 COP debitados al workspace GoDentist.

## Resultados del test (output del script)

| # | Input | SMS rendered | segs | costCop | dispatchId |
|---|-------|--------------|------|---------|------------|
| 1 | Jose | "Hola Jose, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603" | 1 | 97 | `40841df7-3793-4b73-bb15-b3db544efb1b` |
| 2 | **José** | "Hola **Jose**, ..." (acento stripped) | 1 | 97 | `ace5b646-6123-4ae9-b768-6b51b3935abc` |
| 3 | **María** | "Hola **Maria**, ..." (acento stripped) | 1 | 97 | `95c7a53b-fe70-49f0-8a6c-56e14aa588ca` |
| 4 | **Andrés** | "Hola **Andres**, ..." (acento stripped) | 1 | 97 | `072f6066-1dd6-41ff-831f-defad01f354e` |
| 5 | Carlos | "Hola Carlos, ..." | 1 | 97 | `7c6873e6-db96-4788-9640-4608884ad5aa` |

**5/5 success** — confirmación visual usuario: "si llegaron" (4 SMS distintos visibles, acentos quitados, link tappable, sender ID Onurix OK, texto completo no truncado).

## Decisiones LOCKED ejecutadas

- **D-09** Domain layer billing — ✓ `sendSMS` invocado, debit $485 al workspace GoDentist
- **D-10** Texto exacto Opción B (versión vigente DURANTE el test, ver D-10 override más abajo) — ✓ "Para cita o duda escribenos"
- **D-11** Edge case nombre largo (fallback) — N/A en test (nombres cortos), implementación verificada en código
- **D-12** `source='campaign'` — ✓ regulatory marketing source pasado a sendSMS, time window guard aplicado (hora Bogotá 12h ✓)
- **D-13.4** Test 5 SMS reales pre-blast — ✓ ejecutado, validado visualmente

## D-10 OVERRIDE post-test 2026-04-28

**Texto cambió** (decisión usuario post-test, antes de Plan 04):

| Versión | Texto | Status |
|---------|-------|--------|
| ORIGINAL (test ejecutado) | `Hola {nombre}, GoDentist cambio de numero. Para cita o duda escribenos por WhatsApp https://wa.me/573016262603` | Usado en este test (5 SMS enviados) |
| **NUEVO (Plan 04)** | `Hola {nombre}, GoDentist cambio de numero. Para agendar tu cita odontologica escribenos por WhatsApp https://wa.me/573016262603` | Usado en blast masivo |

Verificación 1-segmento del nuevo texto (vía `calculateSMSSegments`):

| Nombre | Stripped | len | segs |
|--------|----------|-----|------|
| Jose | Jose | 123 | 1 |
| José | Jose | 123 | 1 |
| María | Maria | 124 | 1 |
| Andrés | Andres | 125 | 1 |
| Carlos | Carlos | 125 | 1 |
| MARIA | MARIA | 124 | 1 |
| ALEJANDRA | ALEJANDRA | 128 | 1 |
| GUADALUPE | GUADALUPE | 128 | 1 |
| FRANCISCO | FRANCISCO | 128 | 1 |

✓ Todos 1 segmento. Margen ~32 chars hasta límite 160 — fallback `length > 160` se activaría solo en nombres extremadamente largos como primer-token.

Updates aplicados a docs/código:
- `CONTEXT.md` D-10 + D-11 actualizados con nuevo texto
- `03-PLAN.md` buildSMSText template
- `04-PLAN.md` buildSMSText template
- `scripts/test-blast-sms-5-team.ts` (consistencia para re-corridas)

## Warnings observados (no bloqueantes)

### 1. `Onurix returned invalid credits, falling back to 1`

Onurix devuelve `credits: 0` en payload de respuesta. El domain layer en `src/lib/domain/sms.ts:135` cae al fallback defensivo de 1 segmento (D-07/D-08 documentado del módulo SMS). Cost calc usa el fallback conservador.

**Impacto en blast masivo:** mismo comportamiento esperado en los 4.146 SMS del grupo B. El cost calc será consistente (1 seg × $97 = $97 cada uno). Saldo del workspace se debita correctamente.

### 2. `Inngest 401 Event key not found`

El domain `sendSMS:217` emite `inngest.send({name:'sms/delivery.check'})` post-RPC para validar entrega async. El script-context (cron WSL, npx tsx) no tiene la `INNGEST_EVENT_KEY` válida del runtime serverless de Vercel.

**Impacto:**
- ✓ SMS ya fue ENVIADO (`✓ Sent — segmentsUsed=1`) y PERSISTIDO via RPC atómico (`insert_and_deduct_sms_message` → row en `sms_messages`).
- ✗ El delivery-check async (que verifica el estado real Onurix horas después) no se dispara — perdemos esa verificación post-flight.

**Aplica al blast masivo:** SÍ — el script `godentist-blast-experiment.ts` corre desde el cron WSL, mismo contexto sin Inngest. **Mitigación:** añadir Inngest event key al `.env.local` (si está disponible) ANTES del primer cron run, o aceptar pérdida del delivery-check (no afecta el experimento porque la métrica es response-rate, no delivery-rate).

**Decisión pragmática:** no bloquea — la métrica del experimento es inbound message en 3 días post-WA, no delivery-rate. Si el SMS no entrega, el paciente no responderá → ya está capturado en la métrica end-to-end. Documentado para Plan 04 implementer.

## Verificaciones automatizadas pasadas

```bash
test -f scripts/test-blast-sms-5-team.ts                                    # ✓
grep -c "buildSMSText" scripts/test-blast-sms-5-team.ts                     # 2
grep -c "stripAccents" scripts/test-blast-sms-5-team.ts                     # 2
grep -c "source: 'campaign'" scripts/test-blast-sms-5-team.ts               # 1
grep -c "calculateSMSSegments" scripts/test-blast-sms-5-team.ts             # 2
grep -c "colombiaHour" scripts/test-blast-sms-5-team.ts                     # 2
grep -c "wa.me/573016262603" scripts/test-blast-sms-5-team.ts               # 2
```

Hora Bogotá ejecución: 12h (dentro ventana 8-21 ✓). Strip behavioral test: `'José'.normalize('NFD').replace(/[̀-ͯ]/g,'') === 'Jose'` ✓.

## Saldo workspace GoDentist post-test

- Pre-test: $450.000 (post-Plan 02)
- Post-test: $450.000 - $485 (5 × $97) = **~$449.515**
- Restante para blast: ~$449.515 / $97 = **4.633 SMS posibles** (suficiente para ~4.146 del experimento)

## Next

→ Plan 04: Build `scripts/godentist-blast-experiment.ts` (script blast masivo) + `scripts/godentist-blast-experiment-cron.sh` (wrapper cron WSL). Implementación A/B determinista hash(phone), `BATCH_SIZE=900` (post-D-15/D-16 override), 2 runs/día (10:30 + 14:30 lun-vie).
