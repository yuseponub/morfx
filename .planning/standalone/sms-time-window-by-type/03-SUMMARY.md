# 03-SUMMARY — Smoke test + LEARNINGS (cierre del standalone)

**Completado:** 2026-04-17 22:35 COT

## Smoke test (Task 1) — PASS

**Evidencia empírica del row post-ventana:**

```json
{
  "id": "8e8f5598-deb5-4355-b85f-be2790907006",
  "created_at": "2026-04-18 03:30:55.121975+00",   // = 2026-04-17 22:30 COT
  "source": "automation",
  "status": "failed",
  "provider_state_raw": "Error:1081 msg: Destino inaccesible"
}
```

**Razonamiento del PASS:**
- El row EXISTE en `sms_messages` → el código llegó hasta el RPC `insert_and_deduct_sms_message`, lo cual ocurre DESPUÉS del guard de horario y DESPUÉS de la llamada a Onurix. Si el guard hubiera bloqueado, no habría row.
- `provider_state_raw="Error:1081 msg: Destino inaccesible"` → Onurix fue llamado y retornó respuesta del carrier.
- `status='failed'` viene del carrier (Error:1081 = Destino inaccesible), NO por "fuera de horario permitido". Es el mismo issue pre-existente documentado en `.planning/debug/sms-onurix-not-delivered.md`.
- **Hora Colombia del envío: 22:30 COT** (fuera del rango 8AM-9PM, confirmación del bypass).

**Comparación con comportamiento pre-fix:**
- Antes: el SMS de 21:18 del 17/04 fue bloqueado por el guard antes de reach Onurix (fallido con mensaje "fuera de horario permitido").
- Después: SMS de 22:30 del 17/04 alcanzó Onurix correctamente. El fallo actual viene del provider, fuera de scope.

**Conclusión:** Incidente 2026-04-17 21:18 cerrado empíricamente por comportamiento. Entrega al handset es issue separado del carrier.

## Task 2 — docs/analysis/04-estado-actual-plataforma.md: NO-OP

Ejecutados los greps del plan:
- `SMS sobre-bloquea transaccionales` → 0 matches
- `isWithinSMSWindow` → 0 matches
- `8 AM - 9 PM`, `horario permitido`, `bloqueo nocturno`, `over-block` → 0 matches
- `ventana` aparece solo en contexto WhatsApp 24h y Inngest overdue cron, no SMS

No existía entry sobre el over-blocking de SMS transaccionales que haya que eliminar. El archivo NO fue modificado.

**Deuda adyacente descubierta (fuera de scope):** la sección "Twilio SMS" (línea 333-337) está outdated — el proyecto ya migró a Onurix. Follow-up tracked en `.planning/standalone/twilio-to-onurix-migration/AUDIT-MANDATE.md`.

## Task 3 — LEARNINGS.md creado

Ruta: `.planning/standalone/sms-time-window-by-type/LEARNINGS.md`

Secciones completas con datos reales (placeholders del template reemplazados):
- Bugs encontrados: ninguno en implementación; Error:1081 del carrier documentado como out-of-scope observation.
- Patterns confirmados: defensa por contrato, two-vocabularies, rename atómico cross-file, observabilidad de fallback, smoke test con provider flaky.
- Decisiones D-01..D-05 referenciadas.
- Scope no-tocado justificado.
- Cost estimado por plan.
- Archivos y commits con SHAs reales.
- Follow-ups identificados (carrier issue, orphan row, Twilio doc outdated, billing policy, vitest deuda).
- Evidencia empírica de cierre (row JSON del smoke test).

## Sorpresas / follow-ups nuevos

1. **Error:1081 persistente en 573137549286:** el smoke test confirmó que el issue del carrier NO es transitory en este número específico (falló tanto el 21:18 como el 22:30). Task C del debug original puede cerrarse como "persistente, no transitorio" con evidencia de este SMS.

2. **`docs/analysis/04-estado-actual-plataforma.md` sección "Twilio SMS" outdated:** el código ya migró a Onurix (desde migración `20260316100000_sms_onurix_foundation.sql`). No toca este standalone, pero deja semilla.

3. **Smoke test sin handset exitoso:** dado el Error:1081 persistente en el número del usuario, no tenemos evidencia de handset-delivery exitosa post-21:00. PERO el guard bypass es el único scope de este standalone, y eso sí quedó validado. Un smoke test exitoso de handset requeriría un número de prueba distinto — se puede hacer cuando sea útil, fuera de scope.

## Truths verificados (Plan 03)

- Smoke test confirma bypass del guard (row existe con `source='automation'`, `created_at` post-21:00 COT, `provider_state_raw` no-null) ✓
- `sms_messages` row tiene `source='automation'` ✓
- LEARNINGS.md creado con secciones mínimas + placeholders reemplazados ✓
- docs/analysis/04 no fue modificado (no-op documentado) ✓
- Deuda técnica relacionada al over-blocking: no existía en docs — no había nada que remover ✓

## Listo para cierre

- Standalone `sms-time-window-by-type` cerrado.
- Incidente 2026-04-17 21:18 resuelto por comportamiento observable en prod.
- Follow-ups identificados, cada uno tracked en standalone/debug apropiado.
