# Cleanup Checklist — Standalone godentist-blast-sms-experiment

**Primer cron run:** mié 29 abr 2026 10:30 Bogotá.
**Último batch:** mar 5 may 2026 14:30 Bogotá.
**Cleanup mínimo:** vie 8 may 2026 (= último batch + 3 días ventana D-07).
**Cleanup recomendado:** lun 11 may 2026 (+1 día buffer, después del análisis final del lunes).

## Timeline esperado

| Día calendario | Día experimento | Acción | Esperado |
|----------------|-----------------|--------|----------|
| Mié 29 abr | Día 1 | Cron AM 10:30 + PM 14:30 | 1.800 contactos (450A + 450B AM, 450A + 450B PM) |
| Jue 30 abr | Día 2 | Cron AM + PM | 1.800/día acumulado 3.600 |
| Vie 1 may | Día 3 | Cron AM + PM | acumulado 5.400 |
| Lun 4 may | Día 4 | Cron AM + PM | acumulado 7.200 |
| Mar 5 may | Día 5 (parcial) | Cron AM 900 + PM ~191 (cierra) | acumulado 8.291 ✓ |
| Mié 6 - vie 8 may | Días 6-8 | Ventana D-07 abierta | análisis intermedio diario |
| Vie 8 may | Día 8 | Ventana cerrada para todos | análisis FINAL listo |
| Sáb 9 - dom 10 may | Buffer | Decisión negocio | preparar entrega CSV |
| Lun 11 may | Día 11 | Cleanup post-estudio | ejecutar comandos secciones 5-7 |

## 1. Comandos de análisis intermedio (días 1-8)

Ejecutar desde la primera ventana cerrada (~mié 29 + 3d = sáb 2 may temprano):

```bash
cd /mnt/c/Users/Usuario/Proyectos/morfx-new
npx tsx scripts/analyze-blast-experiment.ts
```

Output esperado: tabla A vs B con `ventana_completa < enviados_wa` (pendientes), modo "ANÁLISIS INTERMEDIO". Repetir diario.

Para más samples:
```bash
npx tsx scripts/analyze-blast-experiment.ts --sample-size 15
```

## 2. Comando de análisis FINAL (vie 8 may o lun 11 may)

```bash
cd /mnt/c/Users/Usuario/Proyectos/morfx-new
npx tsx scripts/analyze-blast-experiment.ts | tee .planning/standalone/godentist-blast-sms-experiment/FINAL-ANALYSIS.txt
```

El script autodetecta modo "ANÁLISIS FINAL" cuando `ventana_completa === enviados_wa` para ambos grupos.

**Veredicto del experimento:**
- ¿`Lift (B vs A)` es positivo y >X%? (umbral lo decide el usuario — referencia general: lift > 20% relevante, > 50% muy claro).
- Si lift es negativo o cercano a 0: SMS no aporta — costo $402k no justificado para futuras campañas.
- Si lift es alto: SMS justifica el costo en futuras campañas tipo `nuevo_numerov2`.

## 3. Entrega CSV bounces al equipo GoDentist (D-04)

Archivos consolidados a entregar:

```bash
echo "numero,nombre,razon_skip,etapa" > /tmp/godentist-bounces-final.csv
tail -n +2 /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv | sed 's/$/,prelist/' >> /tmp/godentist-bounces-final.csv
tail -n +2 /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/skipped.csv | sed 's/$/,blast/' >> /tmp/godentist-bounces-final.csv
wc -l /tmp/godentist-bounces-final.csv
echo "---primeras 5 rows---"
head -5 /tmp/godentist-bounces-final.csv
```

Esperado: ~541 rows del prelist + ~N rows del blast (errors WA + errors SMS) = ~600+ rows totales con columna `etapa` distinguiendo origen.

Entregar `/tmp/godentist-bounces-final.csv` al equipo GoDentist via email/WhatsApp con nota:

> "Adjunto CSV con números que no recibieron el blast (inválidos/duplicados/foreign/multiple/errores send). Útiles para depurar la DB antigua de pacientes 2019-2022. Columna `etapa` distingue si fueron descartados por el parser (`prelist`) o por errores durante el envío (`blast`)."

## 4. Cleanup JSON tracking (D-06)

**SOLO** después de:
- Capturar `FINAL-ANALYSIS.txt` (sección 2)
- Entregar CSV bounces a GoDentist (sección 3)

```bash
# Verificar que el análisis final ya se capturó
ls -la /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-blast-sms-experiment/FINAL-ANALYSIS.txt

# Backup defensivo opcional (anonimizar phones primero si se va a guardar a largo plazo)
# cp /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/assignments.json /tmp/blast-assignments-backup-$(date +%Y%m%d).json

# Cleanup
rm /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment-state.json
rm -rf /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/

# Verificar
ls /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/ 2>&1
# Esperado: "ls: cannot access ...: No such file or directory"
```

NO borrar `pacientes-2019-2022.json` ni `pacientes-2019-2022-skipped-prelist.csv` aún — pueden ser útiles si re-haces el experimento o GoDentist pide auditar más.

## 5. Cleanup parser data (opcional, mucho después)

**WHEN:** Solo si confirmas que NUNCA volverás a usar la lista 2019-2022 (ej. 30+ días post-cleanup principal).

```bash
rm /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json
rm /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv
```

## 6. Crontab cleanup (cuando el experimento termine)

Una vez agotada la lista (`nextOffset >= totalPatients`), el script no hace nada al ejecutarse — solo loggea "Todos los pacientes ya fueron enviados. Saliendo." pero igual consume cron slots y log files.

```bash
crontab -e
# Eliminar las 2 líneas:
# 30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
# 30 14 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
```

Verificar:
```bash
crontab -l | grep -c "godentist-blast-experiment-cron"
# Esperado: 0
```

## 7. Documentar findings en LEARNINGS

Después de todo, escribir `.planning/standalone/godentist-blast-sms-experiment/LEARNINGS.md` con:

- **Lift % final** (B vs A) con sample size y ventana
- **Tasa de respuesta absoluta** de cada grupo
- **Costo total**:
  - SMS interno workspace GoDentist: $97 × #SMS_grupo_B + costo unpersisted
  - Wholesale Onurix: $18.75 × #SMS_grupo_B
- **Calidad de la lista**: % bounces (split prelist + blast errors) — útil para campañas futuras
- **Patterns aprendidos**:
  - SMS personalizado con accent strip — funcionó? ¿algún caso edge?
  - Cadencia 2 runs/día (10:30 + 14:30) — ¿optimo? ¿muchos errores Onurix por velocidad?
  - Inngest 401 en script-context — ¿afectó significantly la métrica? ¿algún SMS unpersisted?
- **Decisiones replicables**:
  - ¿Replicar D-15 override (2 runs/día) en futuras campañas?
  - ¿Replicar D-10 texto "Para agendar tu cita odontologica"?
  - ¿Replicar el formato A/B con this batch_size?

Considerar también actualizar el LEARNINGS global del repo si descubres algo cross-cutting (ej. "SMS marketing window guard funciona en script context", "Inngest delivery-check requiere event key en cron").
