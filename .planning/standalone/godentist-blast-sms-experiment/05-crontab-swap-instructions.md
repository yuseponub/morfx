# Crontab Swap Instructions — Standalone godentist-blast-sms-experiment Plan 05

## Objetivo

Reemplazar las 2 entries viejas del crontab WSL (campaña anterior `nuevo_numero` 2023-2026, completada el 2026-03-28) con 2 entries nuevas del experimento A/B (post-D-15 override 2026-04-28: 2 runs/día — 10:30 + 14:30 — con 900 contactos cada uno).

## Estado actual del crontab (verificado 2026-04-28)

```
30 10 * * 2-6 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-send-cron.sh
30 14 * * 2-6 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-send-cron.sh
```

(mar-sáb 10:30 y 14:30 — apuntan a `godentist-send-cron.sh` que es la campaña anterior).

## Estado target del crontab

```
30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
30 14 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
```

(lun-vie 10:30 + 14:30 — apuntan a `godentist-blast-experiment-cron.sh` que es el experimento nuevo).

## Cambios

| Aspecto | Antes | Después |
|---------|-------|---------|
| Frecuencia | 2x/día (10:30 + 14:30) | 2x/día (10:30 + 14:30) — **D-15 override 2026-04-28** |
| Días | mar-sáb (`2-6`) | lun-vie (`1-5`) — **D-14** |
| Script | godentist-send-cron.sh | godentist-blast-experiment-cron.sh — **D-17** |
| Batch size por run | 1.000 | 900 (= 1.800/día total — **D-16 override 2026-04-28**) |
| Total entries | 2 | 2 |

## Pasos

### 1. Snapshot del crontab actual (backup defensivo)

```bash
crontab -l > ~/crontab-backup-pre-blast-experiment-$(date +%Y%m%d_%H%M).txt
```

Verificar el backup:
```bash
ls -la ~/crontab-backup-pre-blast-experiment-*.txt
cat ~/crontab-backup-pre-blast-experiment-*.txt
```

### 2. Editar el crontab

```bash
crontab -e
```

(abre `vim` o `nano` según `$EDITOR`).

Acciones en el editor:

- **ELIMINAR** (NO comentar — eliminar las líneas enteras):
  ```
  30 10 * * 2-6 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-send-cron.sh
  30 14 * * 2-6 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-send-cron.sh
  ```

- **AGREGAR** (2 líneas nuevas al final del crontab — D-15 override 2026-04-28):
  ```
  30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
  30 14 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
  ```

Guardar y salir:
- vim: `:wq`
- nano: `Ctrl+O`, Enter, `Ctrl+X`

### 3. Verificar el crontab post-edit

```bash
echo "=== Total entries de godentist-send-cron.sh (esperado: 0) ==="
crontab -l | grep -c "godentist-send-cron.sh"

echo "=== Total entries de godentist-blast-experiment-cron.sh (esperado: 2) ==="
crontab -l | grep -c "godentist-blast-experiment-cron.sh"

echo "=== Crontab completo ==="
crontab -l
```

### 4. Resultado esperado

```
=== Total entries de godentist-send-cron.sh (esperado: 0) ===
0
=== Total entries de godentist-blast-experiment-cron.sh (esperado: 2) ===
2
=== Crontab completo ===
30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
30 14 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
```

(Puede haber otras entries de otros proyectos — solo nos importan estas dos counts).

## Si algo sale mal — restaurar

```bash
crontab ~/crontab-backup-pre-blast-experiment-XXXX.txt
crontab -l   # verificar restauración
```

## Próximos pasos

Una vez validado el crontab:
- El primer cron run sucederá en el próximo día hábil a las 10:30 Bogotá.
- Si hoy es lun-vie y son <10:30 Bogotá: ejecutará HOY a las 10:30 (luego 14:30).
- Si hoy es lun-vie y son ≥10:30 Bogotá pero <14:30: ejecutará HOY a las 14:30 (900 phones AM perdidos — pero el script avanza offset desde 0 → 900, no 0 → 1.800, así que solo perdemos el AM de hoy).
- Si hoy es lun-vie y son ≥14:30 Bogotá: ejecutará MAÑANA a las 10:30.

Hoy es mar 28 abr 2026, ya pasaron las 10:30 y las 14:30. **Primer batch real: mié 29 abr 10:30 Bogotá** (900 contactos), seguido por mié 29 abr 14:30 (otros 900).

## Monitoreo del primer cron run

```bash
tail -f /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/logs/cron_$(TZ='America/Bogota' date '+%Y-%m-%d')_*.log
```

(reemplazar la fecha si quieres ver runs específicos).

## Verificación post-primer-día (mié 29 abr 22h tras 2 runs 10:30 + 14:30)

Después de los 2 cron runs del día 1, ejecutar Plan 06 (`scripts/analyze-blast-experiment.ts`) para ver:
- 1.800 contactos procesados (2 runs × 900)
- ~900 grupo A + ~900 grupo B (cada run: 450/450 hash split, daily aggregate 900/900)
- ~900 SMS enviados con cost_cop=$87.300 debitados al workspace
- Saldo workspace post-día-1 ≈ $450.000 - $87.300 - $485 (Plan 03 test) = $362.215
