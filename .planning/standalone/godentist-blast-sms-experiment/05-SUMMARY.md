---
phase: godentist-blast-sms-experiment
plan: 05
status: complete
completed: 2026-04-28
wave: 4
---

# Plan 05 — Dry-Run Skip + Crontab Swap

## What was built

- **`.planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md`** — Documento step-by-step del swap (backup defensivo, eliminar las 2 entries viejas, agregar las 2 nuevas, verificación, restore).
- **Crontab WSL swappped en producción** — Plan ejecutado por orquestador con backup defensivo + apply via stdin pipe + verificación post-swap.

## Decisión: Dry-run SKIPPED (Opción A)

Decisión usuario 2026-04-28: skipear el dry-run de 10-15 phones. Razonamiento:
- Plan 03 ya validó SMS path end-to-end (5/5 SMS reales delivered, segments=1, accent strip OK)
- Plan 02 confirmó balance del workspace ($450k, gates de sendSMS pasarán)
- Plan 04 pasó 16 grep checks + behavioral test stripAccents
- El único componente no-tested end-to-end es el WA template send con `nuevo_numerov2` via 360dialog API key — riesgo aceptado
- Beneficio neto del dry-run no compensa el costo (~$485 + DB pollution + 30 min)

**Si el primer cron run mañana descubre un bug del WA template** (ej. API key no autorizada para `nuevo_numerov2`, template name typo, components malformed):
- Mitigación: el script tiene try/catch per-phone y `appendSkipped(phone, name, 'wa_send_failed')` para errores
- Recovery: usuario detiene el cron (`crontab -e` → comentar entries) + investiga + ajusta + restart
- Cost cap si el bug causa 100% fail: $0 (solo errores, no SMS sent porque grupo B requiere WA success previo)

## Crontab swap ejecutado

### Backup defensivo
```
~/crontab-backup-pre-blast-experiment-20260428_1516.txt
```
Contenido: las 2 entries viejas de `godentist-send-cron.sh` (mar-sáb 10:30 + 14:30, comentarios `#` originales preservados).

### Crontab nuevo aplicado
```
# GoDentist Blast Experiment A/B (godentist-blast-sms-experiment standalone, 2026-04-28)
# 10:30 AM Colombia - Lun a Vie (D-14, D-15 override 2026-04-28: 2 runs/dia)
30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
# 2:30 PM Colombia - Lun a Vie
30 14 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
```

### Verificación post-swap
```
=== Total entries de godentist-send-cron.sh (esperado: 0) ===
0
=== Total entries de godentist-blast-experiment-cron.sh (esperado: 2) ===
2
```

✓ Las 2 entries viejas eliminadas (no comentadas — eliminadas).
✓ Las 2 entries nuevas presentes (lun-vie 10:30 + 14:30).

### State files clean

```bash
ls godentist/pacientes-data/blast-experiment-state.json    # No such file ✓
ls godentist/pacientes-data/blast-experiment/              # No such file ✓
```

→ Primer cron run mañana arrancará con `nextOffset=0`, sin pollution de runs previos.

## Decisiones LOCKED ejecutadas

- **D-14** (lun-vie) — ✓ ambas entries `* * 1-5`
- **D-15 (override)** 2 runs/día — ✓ 10:30 + 14:30
- **D-17** Apuntar al script nuevo — ✓ `godentist-blast-experiment-cron.sh` (NO `godentist-send-cron.sh`)

## Restore command (si algo falla mañana)

```bash
crontab ~/crontab-backup-pre-blast-experiment-20260428_1516.txt
crontab -l   # verificar restauración a las 2 entries viejas
```

(El script viejo `godentist-send-cron.sh` está sin cambios y la campaña anterior ya cerró 2026-03-28, así que el restore deja crontab en estado idle — no dispararía nada útil pero tampoco rompe.)

## Próximo cron run programado

**Mié 29 abril 2026, 10:30 Bogotá** — primer batch real:
- Slice 0-900 de `pacientes-2019-2022.json` (8.291 únicos)
- A/B split: 450 grupo A (solo WA) + 450 grupo B (WA + SMS)
- Costo estimado SMS run AM: 450 × $97 = **$43.650 COP** debitados al workspace GoDentist
- Wholesale Onurix: 450 × $18.75 = **$8.437 COP**
- Duración estimada: ~22 min (10:30 → 10:52)

**Mié 29 abril 2026, 14:30 Bogotá** — segundo batch del día 1:
- Slice 900-1800
- Mismo split + costos

**Total día 1:** 1.800 contactos, 900 SMS, ~$87.300 COP debitados.

## Monitoreo del primer cron run

```bash
tail -f /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/logs/cron_2026-04-29_*.log
```

(El directorio `blast-experiment/logs/` se crea cuando dispare el primer cron — `mkdir -p` está en el wrapper).

## Calendario completo del experimento

| Día | Run AM (10:30) | Run PM (14:30) | Acumulado |
|-----|----------------|----------------|-----------|
| Mié 29 abr | 900 contactos | 900 contactos | 1.800 |
| Jue 30 abr | 900 | 900 | 3.600 |
| Vie 1 may | 900 | 900 | 5.400 |
| Lun 4 may | 900 | 900 | 7.200 |
| Mar 5 may | 900 (cierra 8.100) | 191 (cierra 8.291) | 8.291 ✓ |

**Análisis intermedio diario:** Plan 06 `analyze-blast-experiment.ts` puede ejecutarse después de cada run para ver progreso.
**Análisis final:** vie 8 may (3 días post-último-batch — ventana D-07 de respuesta).

## Next

→ Plan 06: build `scripts/analyze-blast-experiment.ts` + `06-cleanup-checklist.md` (autonomous). Puede armarse hoy o después del primer batch del experimento.
