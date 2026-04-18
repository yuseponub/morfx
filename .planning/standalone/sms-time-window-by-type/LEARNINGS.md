# LEARNINGS — sms-time-window-by-type

**Completado:** 2026-04-17
**Trigger:** Incidente 2026-04-17 21:18 — pipeline logística OFI INTER bloqueado por guard 8AM-9PM genérico.
**Resultado:** SMS transaccionales 24/7; marketing preservado para futuro módulo de campañas.

## Bugs encontrados durante implementación

Ninguno durante la implementación del código. La única sorpresa fue durante el smoke test:
- El SMS transaccional de 22:30 COT **sí pasó el guard** (row existe en `sms_messages`, `provider_state_raw` contiene respuesta de Onurix) — validación empírica del bypass.
- Pero llegó con `status='failed'` por **Error:1081 del carrier** ("Destino inaccesible"), no por horario. Es el mismo issue pre-existente documentado en `.planning/debug/sms-onurix-not-delivered.md`. Fuera de scope de este standalone.

## Patterns aprendidos / confirmados

- **Defensa por contrato + helper permisivo:** NOT NULL en DB + `isTransactionalSource` con default `true` para NULL combina compliance con robustez. El guard no bloquea por datos faltantes, la DB rechaza inserts inválidos.
- **Two source vocabularies, un solo nombre de campo:** `DomainContext.source` (taxonomía operacional: webhook/adapter/server-action) vs `SendSMSParams.source` (taxonomía regulatoria: automation/campaign). NO unificar.
- **Rename atómico cross-file:** helper renombrado en utils + import actualizado en domain en el MISMO commit (Pitfall 3 de RESEARCH). NO commitear parcial; el repo nunca queda en estado build-roto entre commits.
- **Regla 5 en práctica:** migración NOT NULL ANTES que código que depende. Distribution query ejecutada por usuario antes de decidir backfill condicional.
- **Observabilidad del fallback:** `console.warn` en `params.source || 'domain-call'` convierte un silencio defensivo en señal grepeable en logs de Vercel.
- **Smoke test con provider flaky:** cuando el carrier tiene issues persistentes en un número específico (Error:1081 en 573137549286), la PRESENCIA del row en `sms_messages` con `provider_state_raw` no-null es suficiente evidencia de que el guard dejó pasar el SMS. La entrega al handset es ortogonal al scope del guard.

## Decisiones key (de CONTEXT.md, preservadas)

- D-01: source-derived type (sin nuevo param `smsType`)
- D-02: NULL → permissive, defendido por NOT NULL en DB
- D-03: sin checkbox en builder (YAGNI hasta módulo campañas)
- D-04: rename sin ajustar lógica (8AM-9PM preserved)
- D-05: backfill condicional (terminó siendo no-op: null_count=0 pre-apply)

## Scope que NO se tocó (justificación futura)

- Ajuste de `isWithinMarketingSMSWindow` a norma CRC real (L-V 7-9, Sáb 8-8, Dom prohibido) → deferido hasta que exista módulo campañas consumiendo.
- CHECK constraint en `sms_messages.source` → Q2 defer hasta que la taxonomía sea mayor.
- Test runner + unit tests de `isTransactionalSource` → Q4 defer (no existe framework instalado en repo; vitest tests de somnio ya generan 4 errores tsc pre-existentes).
- UI builder checkbox "es marketing" → D-03 YAGNI.
- Actualización a `docs/analysis/04-estado-actual-plataforma.md` → no-op: no existía entry sobre over-blocking de SMS transaccionales a remover. (La sección "Twilio SMS" del doc está outdated — el proyecto ya migró a Onurix — pero es deuda separada, no scope.)

## Cost / context (estimación)

- Plan 01: ~5% context (1 archivo SQL nuevo + checkpoint humano — Supabase Studio)
- Plan 02: ~15% context (3 archivos TS, 2 commits, rename cross-file, verificación grep + tsc)
- Plan 03: ~8% context (smoke test + docs no-op + LEARNINGS)
- Total GSD ejecutado en ~1 sesión reloj con checkpoints humanos (migración + deploy + smoke)

## Archivos modificados

- `supabase/migrations/20260418040000_sms_source_not_null.sql` (nuevo) — commit `fb2df5a`
- `src/lib/sms/constants.ts` (taxonomía + types) — commit `eacf068`
- `src/lib/sms/utils.ts` (helper + rename) — commit `8280065`
- `src/lib/domain/sms.ts` (import + guard + warn) — commit `8280065`
- `docs/analysis/04-estado-actual-plataforma.md` — **no-op** (no había entry afectada)
- `.planning/standalone/sms-time-window-by-type/01-SUMMARY.md` — commit `6d7af78`
- `.planning/standalone/sms-time-window-by-type/02-SUMMARY.md` — commit `6e9aad4`
- `.planning/standalone/sms-time-window-by-type/03-SUMMARY.md` — ver commit de cierre
- `.planning/standalone/sms-time-window-by-type/LEARNINGS.md` — este archivo

## Commits principales

- `fb2df5a` — feat(sms-source-not-null): migración NOT NULL en sms_messages.source
- `eacf068` — feat(sms-source-taxonomy): agregar TRANSACTIONAL_SOURCES + MARKETING_SOURCES
- `8280065` — refactor(sms-guard): bypass para SMS transaccionales + rename atómico cross-file
- `6d7af78` — docs: 01-SUMMARY migración NOT NULL
- `6e9aad4` — docs: 02-SUMMARY guard deployed

## Follow-ups identificados (NO en scope)

- **Error:1081 persistente en 573137549286** — el smoke test confirmó que el issue del carrier es persistente (no transitory). Deja semilla para standalone `sms-refund-on-failure` (billing policy) y para Task C del debug original (test Onurix Error:1081 en número distinto).
- **Row huérfano** `sms_messages.id = a5a7ce83-ef45-4c33-a511-d68b6de86c2e` con `provider_state_raw=NULL` — backfill opcional: `UPDATE sms_messages SET provider_state_raw = 'Error:1081 msg: Destino inaccesible' WHERE id = 'a5a7ce83-ef45-4c33-a511-d68b6de86c2e';`
- **Doc `docs/analysis/04-estado-actual-plataforma.md` sección "Twilio SMS" outdated** — el proyecto migró a Onurix. Tracked en standalone `twilio-to-onurix-migration`.
- **Auditoría 12 archivos Twilio pendientes** → `.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md`
- **Billing refund en fallos SMS** → standalone `sms-refund-on-failure` (P2)
- **Deuda pre-existente: vitest no instalado** — 4 errores tsc en `src/lib/agents/somnio/__tests__/*.test.ts`. Fuera de scope de este standalone.

## Referencias

- Debug que originó el standalone: `.planning/debug/sms-onurix-not-delivered.md`
- CONTEXT: `.planning/standalone/sms-time-window-by-type/CONTEXT.md`
- RESEARCH: `.planning/standalone/sms-time-window-by-type/RESEARCH.md`
- Plan summaries: `01-SUMMARY.md`, `02-SUMMARY.md`, `03-SUMMARY.md`
- Regulación CRC: Resolución 5111/2017 (modif. 5372/2018) + Ley 1581/2012

## Evidencia de cierre empírico

Row del smoke test confirmando bypass del guard:

```json
{
  "id": "8e8f5598-deb5-4355-b85f-be2790907006",
  "created_at": "2026-04-18 03:30:55.121975+00",
  "source": "automation",
  "status": "failed",
  "provider_state_raw": "Error:1081 msg: Destino inaccesible"
}
```

- `created_at` UTC = **2026-04-17 22:30 COT** (post-ventana 8AM-9PM)
- Row EXISTE en `sms_messages` → guard NO bloqueó
- `provider_state_raw` no-null → Onurix fue llamado y retornó respuesta
- `status='failed'` causado por carrier (Error:1081), NO por horario
- Incidente 2026-04-17 21:18 cerrado: el guard ya no bloquea transaccionales post-ventana.
