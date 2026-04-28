---
phase: godentist-blast-sms-experiment
plan: 05
type: execute
wave: 4
depends_on: [01, 02, 03, 04]
files_modified:
  - .planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md
autonomous: false
requirements:
  - D-14
  - D-15

must_haves:
  truths:
    - "Single-batch dry-run de godentist-blast-experiment.ts ejecutado contra una lista reducida (10-15 phones del equipo + voluntarios)"
    - "Output del dry-run muestra A/B split funcionando, WA enviados a todos, SMS solo a grupo B"
    - "blast-experiment-state.json, assignments.json, skipped.csv generados con shape correcto"
    - "Crontab final tiene EXACTAMENTE 2 entries de godentist-blast-experiment-cron.sh (lun-vie 10:30 + 14:30)"
    - "Crontab tiene 0 entries de godentist-send-cron.sh (las 2 viejas eliminadas)"
    - "Crontab muestra exit code 0 al final (`crontab -l` no error)"
  artifacts:
    - path: ".planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md"
      provides: "Documentación step-by-step del swap del crontab + verificación post-swap"
      min_lines: 40
  key_links:
    - from: "crontab"
      to: "scripts/godentist-blast-experiment-cron.sh"
      via: "cron entries 30 10 * * 1-5 + 30 14 * * 1-5"
      pattern: "godentist-blast-experiment-cron"
---

<objective>
Validar end-to-end el script del Plan 04 con un dry-run controlado a una lista pequeña (10-15 phones del equipo morfx + voluntarios), luego hacer el swap del crontab: eliminar las 2 entries viejas (`godentist-send-cron.sh` mar-sáb 10:30 y 14:30 — campaña anterior completada) y agregar las 2 nuevas entries (`godentist-blast-experiment-cron.sh` lun-vie 10:30 + 14:30, post-D-15 override 2026-04-28).

Purpose: Defense en producción. El blast masivo arranca con el primer cron run lun-vie 10:30 después de este plan. Si hay bugs (path, env, A/B split mal calculado, sendSMS error), los detectamos en el dry-run controlado de 10-15 phones, NO en producción de 1.800.

Output:
- Documentación del swap en `.planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md`
- Single-batch dry-run ejecutado, validado
- Crontab actualizado en producción WSL del usuario

Cumple D-14 (`30 10 * * 1-5` + `30 14 * * 1-5`) + D-15 (2 cron runs/día — override 2026-04-28). Limpia las entries viejas de campaña anterior (NO comentar — eliminar, RESEARCH.md Pre-flight 7).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-blast-sms-experiment/CONTEXT.md
@.planning/standalone/godentist-blast-sms-experiment/RESEARCH.md
@scripts/godentist-blast-experiment.ts
@scripts/godentist-blast-experiment-cron.sh
@CLAUDE.md
</context>

<interfaces>
<!-- Crontab BEFORE swap (verified RESEARCH.md + CONTEXT.md D-14): -->
<!--
30 10 * * 2-6 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-send-cron.sh
30 14 * * 2-6 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-send-cron.sh
-->

<!-- Crontab AFTER swap (target): -->
<!--
30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
-->

<!-- Cron field reference: -->
<!-- min hour day-of-month month day-of-week command -->
<!-- 30 = minute, 10 = hour, * * = any day/month, 1-5 = Mon-Fri -->
</interfaces>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Single-batch dry-run con lista reducida (10-15 phones)</name>
  <what-built>
    `scripts/godentist-blast-experiment.ts` (Plan 04) listo para ejecutar contra `godentist/pacientes-data/pacientes-2019-2022.json`. Antes del primer cron run masivo, validar end-to-end con una lista reducida.
  </what-built>
  <how-to-verify>
**Estrategia de dry-run:**

El script lee `pacientes-2019-2022.json` (8.284 entries — Plan 01 output). Para un dry-run controlado:

**Opción A (recomendada): Crear archivo de test temporal**

1. Backup del JSON real:
   ```bash
   cp /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json \
      /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json.real
   ```

2. Crear lista de test con 10-15 phones del equipo + voluntarios. Editar el JSON:
   ```bash
   # Reemplazar el JSON con lista de 10-15 phones del equipo
   # ESTOS NÚMEROS DEBEN SER:
   # - Del equipo morfx (Jose + 4-9 testers)
   # - O voluntarios pacientes pre-confirmados (texteados antes para que sepan)
   # - NO números aleatorios de la lista 2019-2022
   ```

   Ejemplo de shape (cada test pacient):
   ```json
   [
     {"nombre":"Jose","apellido":"Test","celular":"+573...","email":"","fecha_creacion":"01/01/22"},
     {"nombre":"María","apellido":"Test","celular":"+573...","email":"","fecha_creacion":"01/01/22"},
     ...
   ]
   ```

3. Resetear state file (si existe de runs previos):
   ```bash
   rm -f /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment-state.json
   rm -rf /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/
   ```

4. Ejecutar el script:
   ```bash
   cd /mnt/c/Users/Usuario/Proyectos/morfx-new
   npx tsx scripts/godentist-blast-experiment.ts
   ```

5. **Validaciones del output:**
   - Header logs muestran `=== GoDentist Blast Experiment ===` con día/hora correctos
   - Skip Saturday/Sunday no se dispara (estamos lun-vie)
   - Hard guard hora no se dispara (estamos 8AM-9PM)
   - Slice = 10-15 (igual a la lista de test)
   - Día del experimento: 1
   - Group A: ~5-7, Group B: ~5-7 (split aproximado por hash)
   - Loop ejecuta sin crash, progress logs visibles

6. **Validar archivos generados:**
   ```bash
   # State file
   cat /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment-state.json
   # Debe mostrar: nextOffset=10-15, history[0] con día, experiment_progress con counts coherentes

   # Assignments JSON
   cat /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/assignments.json
   # Debe ser array de 10-15 entries con shape AssignmentEntry,
   # mitad con group:'A' (sent_sms_at=null), mitad con group:'B' (sent_sms_at=ISO)

   # Skipped CSV (debe estar empty si todos los phones eran válidos)
   cat /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/skipped.csv 2>/dev/null
   # Si hay entries, son phones inválidos en la lista de test

   # Logs
   ls /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/logs/
   # Debe haber 1 archivo cron_YYYY-MM-DD_HHMM.log
   ```

7. **Validaciones en celulares:**
   - Grupo A: solo recibe el WA template `nuevo_numerov2` (no SMS)
   - Grupo B: recibe WA template + SMS ~2s después
   - Verificar `result.data.segmentsUsed === 1` para todos los SMS (revisar logs)

8. **Validar audit DB:**
   ```sql
   -- Mensajes WA enviados
   SELECT COUNT(*) FROM messages
   WHERE workspace_id='36a74890-aad6-4804-838c-57904b1c9328'
     AND template_name='nuevo_numerov2'
     AND created_at >= NOW() - INTERVAL '10 minutes';
   -- Esperado: 10-15

   -- SMS enviados (solo grupo B)
   SELECT COUNT(*), SUM(segments), SUM(cost_cop) FROM sms_messages
   WHERE workspace_id='36a74890-aad6-4804-838c-57904b1c9328'
     AND source='campaign'
     AND created_at >= NOW() - INTERVAL '10 minutes';
   -- Esperado: count = 5-7 (grupo B), segments = 5-7 (todos 1 seg), cost_cop = 5-7 × $97
   ```

9. **Restaurar JSON real:**
   ```bash
   mv /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json.real \
      /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json
   ```

10. **Resetear state file** (importante — sino el próximo cron run pensará que ya envió 10-15 del experimento real):
    ```bash
    rm /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment-state.json
    rm -rf /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/
    ```
    Esto deja el environment limpio para el primer cron run real con offset=0.

**Si CUALQUIER validación falla:**
- WA no llega → revisar API key 360dialog en `workspaces.settings`
- SMS error → revisar saldo workspace (Plan 02), Onurix wholesale (Plan 01 manual), texto SMS
- Split A/B sin balance (e.g., 0/15 o 14/1) → bug en `assignAB` — investigar antes de continuar
- Phones invalid en CSV cuando deberían ser válidos → bug en `normalizePhone` — investigar
- STOP: no proceder a Task 2 hasta resolver
  </how-to-verify>
  <resume-signal>Type "dry-run ok" si los 10-15 SMS/WA llegaron, A/B split fue ~50/50, archivos shape correcto, audit DB confirmó, y restauraste el JSON real + reseteaste state. Type "blocked: ..." si algo falló.</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Crear documento de instrucciones del crontab swap</name>
  <read_first>
    - .planning/standalone/godentist-blast-sms-experiment/CONTEXT.md (D-14 verificación 2 entries actuales)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (Pre-flight 7 + Open Risk 8)
    - scripts/godentist-blast-experiment-cron.sh (path absoluto del wrapper nuevo)
  </read_first>
  <files>.planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md</files>
  <action>
Crear el archivo de instrucciones `.planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md` con:

```markdown
# Crontab Swap Instructions — Standalone godentist-blast-sms-experiment Plan 05

## Objetivo

Reemplazar las 2 entries viejas del crontab WSL (campaña anterior `nuevo_numero` 2023-2026, completada el 2026-03-28) con 2 entries nuevas del experimento A/B (post-D-15 override 2026-04-28: 2 runs/día, 900 contactos cada uno).

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
- **ELIMINAR** (NO comentar — eliminar la línea entera):
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

Comando único de verificación:

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
- Si hoy es lun-vie y son <10:30 Bogotá: ejecutará HOY a las 10:30.
- Si hoy es lun-vie y son ≥10:30 Bogotá: ejecutará mañana a las 10:30.
- Si hoy es sáb/dom: ejecutará el lunes a las 10:30.

Monitorear en tiempo real durante el primer run:
```bash
tail -f /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/logs/cron_$(TZ='America/Bogota' date '+%Y-%m-%d')_*.log
```

## Verificación post-primer-día (después de los 2 cron runs del día 1: 10:30 + 14:30)

Ejecutar Plan 06 (analyze-blast-experiment.ts) al final del primer día para ver:
- 1.800 contactos procesados (2 runs × 900)
- ~900 grupo A + ~900 grupo B (cada run: 450/450, daily aggregate 900/900)
- ~900 SMS enviados con cost_cop=$87.300 debitados al workspace
- Saldo workspace post-día-1 ≈ $450.000 - $87.300 - $485 (test del Plan 03) = $362.215
```

Decisiones del documento:
- **Backup defensivo** del crontab antes de editar — restauración fácil.
- **NO comentar las entries viejas** (RESEARCH.md Pre-flight 7): eliminar, NO comentar. Comentadas seguirían contando si alguna automatización busca con grep.
- **Comandos de verificación específicos con counts esperados**: 0 de godentist-send-cron.sh, 1 de godentist-blast-experiment-cron.sh.
- **Sección "Si algo sale mal"** con restore command listo.
- **Próximos pasos** con tail -f para monitoreo del primer cron run.
  </action>
  <verify>
    <automated>test -f .planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md && grep -c "godentist-blast-experiment-cron.sh" .planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md | xargs test 3 -le && grep -c "30 10 \* \* 1-5" .planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md | xargs test 1 -le && grep -c "crontab-backup-pre-blast-experiment" .planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md | xargs test 1 -le</automated>
  </verify>
  <acceptance_criteria>
    - Documento existe en `.planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md`
    - `grep -c "godentist-blast-experiment-cron.sh" ...` returns ≥ 3 (referenced multiple times)
    - `grep -c "30 10 \* \* 1-5" ...` returns ≥ 1 (target cron entry shown)
    - `grep -c "crontab-backup-pre-blast-experiment" ...` returns ≥ 1 (backup step)
    - `grep -c "ELIMINAR" ...` returns ≥ 1 (clear instruction)
    - Document includes verification commands with expected counts
  </acceptance_criteria>
  <done>Documento step-by-step del crontab swap creado. Ready para que el usuario lo siga manualmente.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Ejecutar el crontab swap manualmente</name>
  <what-built>
    Documento `.planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md` con pasos exactos para hacer el swap.
  </what-built>
  <how-to-verify>
**Pasos manuales (sigue el documento creado en Task 2):**

1. Leer `.planning/standalone/godentist-blast-sms-experiment/05-crontab-swap-instructions.md`
2. Ejecutar todos los pasos ahí descritos:
   - Backup
   - `crontab -e`
   - Eliminar las 2 entries viejas (NO comentar)
   - Agregar la nueva entry única
   - Guardar y salir
3. Ejecutar el bloque de verificación:
   ```bash
   echo "=== Total entries de godentist-send-cron.sh (esperado: 0) ==="
   crontab -l | grep -c "godentist-send-cron.sh"
   echo "=== Total entries de godentist-blast-experiment-cron.sh (esperado: 2) ==="
   crontab -l | grep -c "godentist-blast-experiment-cron.sh"
   echo "=== Crontab completo ==="
   crontab -l
   ```
4. **Validar resultados:**
   - Primer count: `0` (las 2 entries viejas eliminadas)
   - Segundo count: `1` (la nueva entry presente)
   - El crontab completo muestra la entry `30 10 * * 1-5 /mnt/.../godentist-blast-experiment-cron.sh`

5. **Pre-validar que el wrapper sea executable y funcione:**
   ```bash
   /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
   ```

   Esto va a invocar el script — pero como ya se reseteó el state file en Task 1 (paso 10), va a procesar el primer batch real (900 phones por run). **NO ejecutar este pre-validación si todavía no son las 10:30 (o 14:30) del día deseado para empezar el blast** — sino estarías arrancando el experimento HOY antes de tiempo.

   Alternativa para validar wrapper sin disparar el blast: simplemente verificar que el archivo es ejecutable y muestra `Blast cron started` en el log:
   ```bash
   test -x /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh && echo "executable OK"
   bash -n /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh && echo "syntax OK"
   ```

6. Si todo OK: **el experimento arranca solo en el próximo día hábil 10:30 Bogotá.**
  </how-to-verify>
  <resume-signal>Type "swap done: <paste output of `crontab -l | grep godentist`>" so the cron state is recorded in conversation evidence. The output should show ONLY the 2 new lines `30 10 * * 1-5 .../godentist-blast-experiment-cron.sh` y `30 14 * * 1-5 .../godentist-blast-experiment-cron.sh` (las 2 antiguas `godentist-send-cron.sh` ausentes). Type "blocked: ..." if the swap failed or if old entries remain.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User shell → crontab | Direct edit via `crontab -e`; backup mitigates risk |
| Cron daemon → script | Wrapper sources NVM; permissions bit on .sh |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-blast-05-01 | Tampering | crontab edit error breaks other cron jobs | mitigate | Backup pre-edit + restore command documented |
| T-blast-05-02 | DoS | El script anterior corre en paralelo con el nuevo (concurrency state file) | mitigate | Las 2 entries viejas eliminadas; usan state files distintos también (defense-in-depth) |
| T-blast-05-03 | Information Disclosure | Dry-run envía SMS a non-team phones | accept | Lista de test es 10-15 phones manuales del usuario; documentado como su responsabilidad |
| T-blast-05-04 | Elevation of Privilege | Cron ejecuta con permisos del usuario WSL | accept | Standard cron model; el usuario WSL es Jose (single-user box) |
</threat_model>

<verification>
- Dry-run con 10-15 phones ejecutado; A/B split, WA, SMS, archivos validados.
- JSON real restaurado; state file reseteado para offset=0.
- Crontab muestra: 0 entries de godentist-send-cron.sh + 2 entries de godentist-blast-experiment-cron.sh (10:30 + 14:30).
- Wrapper ejecutable con syntax OK.
</verification>

<success_criteria>
- 10-15 SMS/WA dry-run delivered y validados via DB audit
- Crontab clean: 2 entries viejas eliminadas, 2 entries nuevas agregadas (10:30 + 14:30)
- `pacientes-2019-2022.json` real restaurado
- `blast-experiment-state.json` ausente / con `nextOffset=0` (sino el primer cron real saltaría a offset=10-15)
- Próximo cron run sucederá automáticamente lun-vie 10:30 Bogotá (luego 14:30, repitiendo lun-vie hasta agotar 8.291 contactos)
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-blast-sms-experiment/05-SUMMARY.md` registrando:
- Resultado del dry-run (cuántos WA, cuántos SMS, A/B split observado, errors si hubo)
- Output del `crontab -l` final
- Confirmación que JSON real está restaurado
- Confirmación que state file está reseteado
- Fecha esperada del primer cron run automático
- Comando de monitoreo para el primer cron run (`tail -f` del log)
</output>
</output>
