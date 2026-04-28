---
phase: godentist-blast-sms-experiment
plan: 06
status: complete
completed: 2026-04-28
wave: 5
---

# Plan 06 — Analyzer A/B + Cleanup Checklist

## What was built

- **`scripts/analyze-blast-experiment.ts`** (245 LoC) — Script de análisis A/B que joinea `assignments.json` con `messages` table de prod (workspace GoDentist) para computar la métrica D-07 (inbound message en 3d post-WA).
  - Modo autodetectado: INTERMEDIO (ventana 3d aún no cerrada) vs FINAL (ventana cerrada para 100%).
  - CLI flags: `--sample-size N` (default 5), `--min-window-hours H` (default 72).
  - Tabla comparativa: `total | enviados_wa | ventana_completa | inbound_3d | rate` para grupo A y B.
  - Lift calculation: `(rate_B - rate_A) / rate_A * 100` con warning si <100/grupo (sample size insuficiente).
  - Sample inbound preview (200 chars) por grupo para sanity check de respuestas.
  - Idempotente — solo lee, no muta DB ni FS.
- **`.planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md`** (140 LoC) — Checklist post-experimento con:
  - Timeline calendario completo (mié 29 abr → mar 5 may envíos + ventana 3d → vie 8 may análisis final)
  - Comandos exactos para análisis intermedio + final + entrega CSV bounces + cleanup JSON + cleanup crontab + LEARNINGS

## Función clave del analyzer

```typescript
async function checkInboundIn3d(phone: string, sentWaAt: string): Promise<InboundCheckResult> {
  const sentMs = new Date(sentWaAt).getTime()
  const windowEnd = new Date(sentMs + 3 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Get conversation IDs (GoDentist + WhatsApp + this phone)
  const { data: convs } = await supabase
    .from('conversations').select('id')
    .eq('workspace_id', WORKSPACE_ID).eq('phone', phone).eq('channel', 'whatsapp')
  if (!convs || convs.length === 0) return { hasInbound: false, sample: null }

  // 2. Look for inbound in 3d window
  const { data: msgs } = await supabase
    .from('messages').select('content, timestamp')
    .in('conversation_id', convs.map(c => c.id))
    .eq('direction', 'inbound')
    .gte('timestamp', sentWaAt).lte('timestamp', windowEnd)
    .order('timestamp', { ascending: true }).limit(1)

  return { hasInbound: msgs?.length > 0, sample: msgs?.[0] || null }
}
```

Lift cálculo:
```typescript
const lift = ((resB.rate - resA.rate) / resA.rate) * 100
```

## Decisiones LOCKED ejecutadas

- **D-04** Entrega CSV bounces a GoDentist — ✓ documentado en sección 3 del cleanup checklist con comando consolidador (`prelist.csv` + `blast/skipped.csv` con columna `etapa`)
- **D-06** Cleanup JSON tracking post-estudio — ✓ documentado en sección 4 con `rm` precondicionado a `FINAL-ANALYSIS.txt` capturado
- **D-07** Métrica inbound message en 3d post-WA — ✓ implementada en `checkInboundIn3d` (filtros `direction='inbound'` + `timestamp >= sent_wa_at` + `timestamp <= sent_wa_at + 72h`)

## Verificaciones automatizadas pasadas

**Analyzer (Task 1):**
- `direction`: 1 (≥1 ✓ — filter inbound)
- `inbound`: 10 (≥2 ✓ — filter + variable + samples)
- `assignments.json`: 2 (≥1 ✓)
- `MIN_WINDOW_HOURS`: 3 (≥2 ✓ — declaration + arg + use)
- workspace_id: 1 (≥1 ✓)
- `Lift`: 2 (≥1 ✓ — header + log)
- `Group A`: 5 (≥1 ✓ — multiple log lines)
- `interface AssignmentEntry`: 1 (≥1 ✓ — typed access)
- LoC: 245 (≥120 ✓)

**Cleanup checklist (Task 2):**
- `blast-experiment-state.json`: 1 (≥1 ✓ — cleanup target)
- `rm `: 4 (≥2 ✓ — state file + dir + parser data + crontab cleanup commands)
- `FINAL-ANALYSIS`: 3 (≥1 ✓ — capture before cleanup)
- `skipped`: 4 (≥2 ✓ — prelist + blast CSVs)
- `crontab`: 2 (≥1 ✓ — post-experiment cleanup)
- `LEARNINGS`: 3 (≥1 ✓ — final findings section)
- LoC: 140 (≥30 ✓)

## Fechas clave (calendario completo)

| Evento | Fecha | Acción |
|--------|-------|--------|
| Primer batch real | mié 29 abr 10:30 | Cron AM (450A + 450B) |
| Primer análisis intermedio posible | sáb 2 may | `analyze-blast-experiment.ts` ventana cerrada del día 1 |
| Último batch | mar 5 may 14:30 | Cron PM cierra (~191 últimos) |
| Análisis FINAL listo | vie 8 may | Ventana 3d cerrada para 100% |
| Cleanup recomendado | lun 11 may | rm JSON tracking + entrega CSV + LEARNINGS |
| Cleanup crontab | lun 11 may o cuando agote | Eliminar las 2 entries cron |

## Recordatorio post-experimento

Después del análisis final (vie 8 may), las 4 acciones obligatorias:

1. **Capturar análisis** → `npx tsx scripts/analyze-blast-experiment.ts | tee FINAL-ANALYSIS.txt`
2. **Entregar CSV bounces** a GoDentist (sección 3 del cleanup checklist)
3. **Borrar JSON tracking** (sección 4) — D-06 obligatorio
4. **Limpiar crontab** + escribir `LEARNINGS.md` con lift, costo total, patterns

## Limitaciones del analyzer

- **Phones con `+` o sin `+`**: el script asume el shape del Plan 04 (phone con `+`). Si por alguna razón cron Plan 04 escribió phones sin `+`, el query `eq('phone', ...)` no matchea. Mitigación: el shape está locked por `normalizePhone()` que siempre retorna `+57XXXXXXXXXX`.
- **Conversaciones múltiples por phone**: si un paciente tiene 2 conversations distintas (raro pero posible — bug histórico de pre-`unique` constraint), el `.in('conversation_id', convIds)` cubre ambas. ✓
- **Inbound antes de sent_wa_at**: edge case si el paciente respondió a una conversación previa en el mismo día de envío. El filtro `timestamp >= sent_wa_at` lo excluye correctamente (atribuye solo a respuestas POST blast). ✓
- **Quiebre Inngest delivery-check**: documentado en Plan 04 SUMMARY — no afecta el analyzer porque la métrica se basa en `messages.direction='inbound'` real (no en `sms_messages.status` async).

## Phase godentist-blast-sms-experiment — STATUS: 100% ready for production

Los 6 plans están closed:

| Plan | Wave | Estado | Commit |
|------|------|--------|--------|
| 01 — parser xlsx + pre-flight | 0 | ✓ shipped | `2928517` |
| 02 — SQL sms_workspace_config | 1 | ✓ applied prod | `642bc98` |
| 03 — test 5 SMS al equipo | 2 | ✓ verified | `77618d9` |
| 04 — blast script + cron wrapper | 3 | ✓ shipped | `de11110` |
| 05 — crontab swap | 4 | ✓ swapped | `2ece2cd` |
| 06 — analyzer + cleanup | 5 | ✓ shipped | (este commit) |

**Próximo trigger:** mié 29 abr 2026, 10:30 Bogotá (cron WSL automático). Sin acción humana requerida hasta el análisis intermedio del sáb 2 may.
