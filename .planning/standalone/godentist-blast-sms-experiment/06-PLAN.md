---
phase: godentist-blast-sms-experiment
plan: 06
type: execute
wave: 5
depends_on: [01, 02, 03, 04, 05]
files_modified:
  - scripts/analyze-blast-experiment.ts
  - .planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md
autonomous: true
requirements:
  - D-04
  - D-06
  - D-07

must_haves:
  truths:
    - "Existe scripts/analyze-blast-experiment.ts que joinea blast-experiment/assignments.json con messages table (direction='inbound', ventana 3 días post-WA, workspace GoDentist)"
    - "El script computa tasa de respuesta por grupo: |inbound_in_3d ∩ groupA| / |groupA| vs |inbound_in_3d ∩ groupB| / |groupB|"
    - "El script imprime sample de inbound messages (primer N de cada grupo, primeros 200 chars)"
    - "El script puede ejecutarse intermedio (cualquier día después del primer batch) o final (3+ días post último batch)"
    - "Existe documento 06-cleanup-checklist.md con: fecha esperada cleanup JSON tracking + comando rm + entrega CSV bounces a GoDentist"
  artifacts:
    - path: "scripts/analyze-blast-experiment.ts"
      provides: "Análisis comparativo grupo A vs grupo B basado en inbound messages 3d post-WA"
      min_lines: 120
    - path: ".planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md"
      provides: "Checklist de cleanup post-estudio + comandos exactos"
      min_lines: 30
  key_links:
    - from: "scripts/analyze-blast-experiment.ts"
      to: "godentist/pacientes-data/blast-experiment/assignments.json"
      via: "fs.readFileSync"
      pattern: "assignments\\.json"
    - from: "scripts/analyze-blast-experiment.ts"
      to: "messages table (workspace GoDentist)"
      via: "supabase query con direction='inbound' + timestamp filters"
      pattern: "direction.*inbound"
---

<objective>
Cerrar el experimento con tooling de análisis + plan de cleanup. Crear `scripts/analyze-blast-experiment.ts` que cuantifica la métrica clave (D-07 inbound message en 3 días post-WA) comparando grupo A vs grupo B, y documentar el cleanup post-estudio (D-06: JSON tracking borrable después del análisis final, D-04: entrega CSV bounces a GoDentist).

Purpose:
- D-07: Computar la métrica del experimento (tasa de inbound 3d) — tanto análisis intermedio diario como análisis final post-estudio.
- D-06: Documentar fecha esperada de cleanup del JSON tracking (último batch + 3 días + 1 día buffer).
- D-04: Documentar entrega del CSV de bounces consolidado al equipo GoDentist.

Output:
- `scripts/analyze-blast-experiment.ts` (~150 LoC)
- `06-cleanup-checklist.md` con fechas y comandos exactos

Cumple D-04 (entrega CSV), D-06 (cleanup JSON), D-07 (métrica inbound 3d).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-blast-sms-experiment/CONTEXT.md
@.planning/standalone/godentist-blast-sms-experiment/RESEARCH.md
@scripts/godentist-blast-experiment.ts
@scripts/godentist-send-scheduled.ts
@CLAUDE.md
</context>

<interfaces>
AssignmentEntry shape (de Plan 04):

```typescript
interface AssignmentEntry {
  phone: string                  // +57XXXXXXXXXX (con +)
  nombre: string
  group: 'A' | 'B'
  day: number
  date: string                   // YYYY-MM-DD Bogotá
  sent_wa_at: string | null      // ISO timestamp
  sent_sms_at: string | null
  wa_error: string | null
  sms_error: string | null
}
```

messages table relevant cols (verified scheduled.ts:227-232):
- `messages.workspace_id`, `messages.conversation_id`, `messages.direction` ('inbound' | 'outbound')
- `messages.timestamp` (ISO timestamp), `messages.content` (jsonb)
- `conversations.workspace_id`, `conversations.phone`

Métrica D-07: Binaria por paciente — `respondio = true` si EXISTE algún inbound en ventana de 3 días desde `sent_wa_at`. La tasa por grupo = `count(respondio=true) / count(group)`. Lift = (rate_B - rate_A) / rate_A.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear scripts/analyze-blast-experiment.ts</name>
  <read_first>
    - .planning/standalone/godentist-blast-sms-experiment/CONTEXT.md (D-07 métrica inbound 3d, D-06 análisis intermedio + final)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (Risk 6 attribution noise mitigation: A vs B comparativo cancela noise)
    - scripts/godentist-blast-experiment.ts (AssignmentEntry shape + paths)
    - scripts/godentist-send-scheduled.ts (líneas 16-17 dotenv pattern, 19-20 supabase client)
  </read_first>
  <files>scripts/analyze-blast-experiment.ts</files>
  <action>
Crear el archivo `scripts/analyze-blast-experiment.ts` con el siguiente contenido. NO usar bloques markdown anidados — escribir el código TypeScript completo dentro del archivo:

Archivo a crear (estructura exacta):

1. Header doc-comment explicando propósito, modos (intermedio/final), idempotencia, usage.
2. Imports: `dotenv`, `createClient` (supabase), `fs`, `path`.
3. Constants: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `WORKSPACE_ID = '36a74890-aad6-4804-838c-57904b1c9328'`, `ASSIGNMENTS_FILE` (path absoluto `/mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/assignments.json`).
4. Crear cliente: `const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)`.
5. `interface AssignmentEntry` (idéntica al shape definido en Plan 04).
6. CLI args helper: `getArg(name, defaultVal)` que parsea `--name value` de `process.argv`. Variables: `SAMPLE_SIZE = parseInt(getArg('sample-size', '5'))`, `MIN_WINDOW_HOURS = parseInt(getArg('min-window-hours', '72'))`.
7. `interface AnalysisResult { total, enviados_wa, ventana_completa, inbound_3d, rate }`.
8. `async function checkInboundIn3d(phone, sentWaAt)`:
   - Calcula `windowEnd = new Date(sentWaAt + 3*24*60*60*1000)`.
   - Query `conversations` filtrando `workspace_id`, `phone`, `channel='whatsapp'` para obtener `id`s.
   - Si no hay conversation, return `{ hasInbound: false, sample: null }`.
   - Query `messages` con `conversation_id IN (convIds)`, `direction='inbound'`, `timestamp >= sentWaAt`, `timestamp <= windowEnd`, `order by timestamp ASC`, `limit 1`.
   - Return `{ hasInbound: msgs.length > 0, sample: msgs[0] || null }`.
9. `async function analyzeGroup(entries, groupLabel)`:
   - Itera entries, skipea los que tienen `sent_wa_at === null`.
   - Para cada uno con sent_wa_at != null: incrementa `enviados_wa`. Si `hoursElapsed >= MIN_WINDOW_HOURS`, incrementa `ventana_completa` y llama `checkInboundIn3d`. Si retorna hasInbound, incrementa `inbound_3d` y agrega a `samples` hasta `SAMPLE_SIZE`.
   - Progress log cada 100 iteraciones.
   - Calcula `result.rate = inbound_3d / ventana_completa` (0 si ventana_completa=0).
   - Return `{ ...result, samples }`.
10. `async function main()`:
    - Si `ASSIGNMENTS_FILE` no existe: error + exit 1.
    - Lee assignments JSON.
    - Imprime header con totales.
    - Filtra `groupA = assignments.filter(a => a.group === 'A')` y `groupB`.
    - Llama `analyzeGroup(groupA, 'A')` y `analyzeGroup(groupB, 'B')`.
    - Imprime tabla comparativa: total, enviados_wa, ventana_completa, inbound_3d, rate (%) para A y B.
    - Si `resA.rate > 0`: calcula `lift = ((resB.rate - resA.rate) / resA.rate) * 100` con sign + warning si <100/grupo.
    - Imprime sample inbound de A y B (primeros SAMPLE_SIZE).
    - Modo final autodetectado: si `ventana_completa === enviados_wa` para ambos grupos, imprime "Análisis FINAL". Sino imprime "Análisis INTERMEDIO — pendientes A=X, B=Y".
11. `main().catch(err => { console.error('Fatal:', err); process.exit(1) })`.

Detalles técnicos clave:
- Usar `dotenv.config({ path: '/mnt/c/Users/Usuario/Proyectos/morfx-new/.env.local' })` (path absoluto para consistencia con scheduled.ts:16-17, aunque este script no se ejecuta vía cron).
- `phone` se guarda con `+` en assignments.json (Plan 04). Las `conversations` también lo tienen con `+` (vía scheduled.ts:178 + 207). Pasar el phone con `+` directo a la query.
- Solo lee, NO muta — idempotente.
- Sample size CLI flag para control: `--sample-size 10`.
- Sample warning si <100/grupo en ventana completa: imprime "(⚠ Sample size <100/grupo — análisis intermedio. Esperar más datos para significancia.)".

Decisiones del script:
- Métrica binaria por paciente (D-07): "tiene al menos 1 inbound en 3d" — no contamos múltiples mensajes (ruido cero por design).
- Filtro `ventana_completa`: solo cuenta pacientes cuya ventana de 3d ya cerró (now >= sent_wa_at + 72h). Para análisis intermedio, este número es < total enviados.
- Lift como (B - A) / A: standard A/B test reporting.
- Sample de inbounds para sanity-check: permite ver si las respuestas tienen sentido (ej. "Hola quiero cita" vs spam).
- Modo intermedio vs final autodetectado.
  </action>
  <verify>
    <automated>test -f scripts/analyze-blast-experiment.ts && grep -c "direction" scripts/analyze-blast-experiment.ts | xargs -I{} test {} -ge 1 && grep -c "inbound" scripts/analyze-blast-experiment.ts | xargs -I{} test {} -ge 2 && grep -c "assignments.json" scripts/analyze-blast-experiment.ts | xargs -I{} test {} -ge 1 && grep -c "MIN_WINDOW_HOURS" scripts/analyze-blast-experiment.ts | xargs -I{} test {} -ge 2 && grep -c "Group A" scripts/analyze-blast-experiment.ts | xargs -I{} test {} -ge 1 && grep -c "Lift" scripts/analyze-blast-experiment.ts | xargs -I{} test {} -ge 1</automated>
  </verify>
  <acceptance_criteria>
    - `test -f scripts/analyze-blast-experiment.ts` returns 0
    - `grep -c "direction" scripts/analyze-blast-experiment.ts` returns ≥ 1 (filter inbound)
    - `grep -c "inbound" scripts/analyze-blast-experiment.ts` returns ≥ 2 (filter + variable name)
    - `grep -c "assignments.json" scripts/analyze-blast-experiment.ts` returns ≥ 1
    - `grep -c "MIN_WINDOW_HOURS" scripts/analyze-blast-experiment.ts` returns ≥ 2 (declaration + use)
    - `grep -c "36a74890-aad6-4804-838c-57904b1c9328" scripts/analyze-blast-experiment.ts` returns ≥ 1 (workspace hardcoded)
    - `grep -c "Lift" scripts/analyze-blast-experiment.ts` returns ≥ 1
    - `grep -c "Group A" scripts/analyze-blast-experiment.ts` returns ≥ 1
    - `grep -c "interface AssignmentEntry" scripts/analyze-blast-experiment.ts` returns ≥ 1 (typed access)
    - LoC del archivo ≥ 120 (`wc -l scripts/analyze-blast-experiment.ts` returns ≥ 120)
  </acceptance_criteria>
  <done>Script de análisis creado, lee assignments.json + queries inbound 3d, calcula lift A vs B, imprime samples, soporta modo intermedio y final.</done>
</task>

<task type="auto">
  <name>Task 2: Crear documento de cleanup checklist</name>
  <read_first>
    - .planning/standalone/godentist-blast-sms-experiment/CONTEXT.md (D-04 entrega CSV, D-06 cleanup JSON post-3d-último-batch)
    - .planning/standalone/godentist-blast-sms-experiment/RESEARCH.md (Open Risk 3: cleanup date math)
  </read_first>
  <files>.planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md</files>
  <action>
Crear el archivo `.planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md` con la siguiente estructura. Escribir contenido markdown plano, sin bloques anidados:

Sección 1: "Cleanup Checklist — Standalone godentist-blast-sms-experiment"
- Subtitle con fecha esperada del primer cron run + 5 días = último batch + 3 días ventana D-07 = fecha cleanup mínima.

Sección 2: "Timeline esperado"
- Tabla con columnas: Día, Acción, Esperado.
  - Día 1 (lun): Primer cron run lun-vie 10:30 — 1.800 contactos
  - Día 2-4 (mar-jue): cron runs adicionales — 1.800/día
  - Día 5 (vie): cron run final — 1.084 contactos (últimos)
  - Día 5-9 (lun-vie semana 2): ventana D-07 abierta — análisis intermedio diario
  - Día 9-10: ventana D-07 cerrada para todos los pacientes — análisis FINAL listo
  - Día 10-11: cleanup post-estudio

Sección 3: "Comandos de análisis intermedio (días 1-9)"
- Bloque de comando: `cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsx scripts/analyze-blast-experiment.ts`
- Output esperado: análisis intermedio con pendientes ventana > 0.

Sección 4: "Comando de análisis final (día 9-10)"
- Mismo comando, pero ahora reporta "Análisis FINAL" autodetectado.
- Capturar el output completo (pipe a archivo): `npx tsx scripts/analyze-blast-experiment.ts | tee .planning/standalone/godentist-blast-sms-experiment/FINAL-ANALYSIS.txt`
- Decidir veredicto: "El SMS adicional aumenta la tasa de respuesta? lift > X% es relevante" (criterio depende del usuario).

Sección 5: "Entrega CSV bounces al equipo GoDentist (D-04)"
- Archivos a entregar (consolidados):
  - `godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv` (rows descartadas en parser — Plan 01)
  - `godentist/pacientes-data/blast-experiment/skipped.csv` (rows skipeadas durante el blast — Plan 04)
- Comando para consolidar en un solo CSV (manual):
  ```
  echo "numero,nombre,razon_skip,etapa" > /tmp/godentist-bounces-final.csv
  tail -n +2 godentist/pacientes-data/pacientes-2019-2022-skipped-prelist.csv | sed 's/$/,prelist/' >> /tmp/godentist-bounces-final.csv
  tail -n +2 godentist/pacientes-data/blast-experiment/skipped.csv | sed 's/$/,blast/' >> /tmp/godentist-bounces-final.csv
  wc -l /tmp/godentist-bounces-final.csv
  ```
- Entregar `/tmp/godentist-bounces-final.csv` al equipo GoDentist via email/WhatsApp con nota:
  "Adjunto CSV con números que no recibieron el blast (inválidos/duplicados). Útiles para depurar la DB antigua de pacientes 2019-2022."

Sección 6: "Cleanup JSON tracking (D-06)"
- WHEN: SOLO después de capturar el FINAL-ANALYSIS.txt y entregar el CSV de bounces.
- WHY: D-06 — JSON tracking es borrable post-estudio, no debe persistir como datos PII en el repo.
- COMANDOS:
  ```
  # Verificar que el análisis final ya se capturó
  ls -la .planning/standalone/godentist-blast-sms-experiment/FINAL-ANALYSIS.txt

  # Backup defensivo opcional (anonimizar phones primero si se va a guardar)
  # cp godentist/pacientes-data/blast-experiment/assignments.json /tmp/blast-assignments-backup-$(date +%Y%m%d).json

  # Cleanup
  rm /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment-state.json
  rm -rf /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/

  # Verificar
  ls /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/blast-experiment/ 2>&1
  # Esperado: "ls: cannot access ...: No such file or directory"
  ```
- NO borrar `pacientes-2019-2022.json` ni `pacientes-2019-2022-skipped-prelist.csv` aún — esos pueden ser útiles si re-haces el experimento o GoDentist pide auditar más.

Sección 7: "Cleanup parser data (opcional, mucho después)"
- WHEN: Solo si confirmas que NUNCA volverás a usar la lista 2019-2022 (ej. 30+ días post-cleanup principal).
- COMANDO: `rm /mnt/c/Users/Usuario/Proyectos/morfx-new/godentist/pacientes-data/pacientes-2019-2022.json`

Sección 8: "Crontab cleanup (cuando el experimento termine)"
- Una vez agotada la lista (`nextOffset >= totalPatients`), el script no hace nada al ejecutarse.
- Eliminar la entry del crontab para no tener cron jobs no-op corriendo:
  ```
  crontab -e
  # Eliminar la línea:
  # 30 10 * * 1-5 /mnt/c/Users/Usuario/Proyectos/morfx-new/scripts/godentist-blast-experiment-cron.sh
  ```
- Verificar: `crontab -l | grep -c "godentist-blast-experiment-cron"` debe retornar 0.

Sección 9: "Documentar findings en LEARNINGS"
- Después de todo: actualizar `LEARNINGS.md` global y/o crear `.planning/standalone/godentist-blast-sms-experiment/LEARNINGS.md` con:
  - Lift % final (B vs A)
  - Tasa de respuesta absoluta de cada grupo
  - Costo total ($97 × #SMS_grupo_B + costo unpersisted)
  - Patterns aprendidos para futuros experimentos
  - Calidad de la lista (% bounces — útil para campañas futuras)
  </action>
  <verify>
    <automated>test -f .planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md && grep -c "blast-experiment-state.json" .planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md | xargs -I{} test {} -ge 1 && grep -c "rm " .planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md | xargs -I{} test {} -ge 2 && grep -c "FINAL-ANALYSIS" .planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md | xargs -I{} test {} -ge 1 && grep -c "skipped" .planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md | xargs -I{} test {} -ge 2</automated>
  </verify>
  <acceptance_criteria>
    - Documento existe en `.planning/standalone/godentist-blast-sms-experiment/06-cleanup-checklist.md`
    - `grep -c "blast-experiment-state.json" ...` returns ≥ 1 (cleanup target)
    - `grep -c "rm " ...` returns ≥ 2 (state file + dir)
    - `grep -c "FINAL-ANALYSIS" ...` returns ≥ 1 (capture before cleanup)
    - `grep -c "skipped" ...` returns ≥ 2 (prelist + blast CSV consolidation)
    - `grep -c "crontab" ...` returns ≥ 1 (post-experiment crontab cleanup)
    - `grep -c "LEARNINGS" ...` returns ≥ 1 (final findings)
    - LoC ≥ 30 (`wc -l ...` returns ≥ 30)
  </acceptance_criteria>
  <done>Documento checklist completo con timeline, comandos exactos para análisis, entrega CSV, cleanup JSON, cleanup crontab y LEARNINGS final.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| analyze script → Supabase prod | Read-only queries via service-role client |
| Cleanup commands → local FS | Manual rm — destructivo, requiere confirmación |
| CSV entrega → equipo GoDentist | Email/WhatsApp manual fuera de sistema |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-blast-06-01 | Information Disclosure | assignments.json contiene phones + nombres en plain text | mitigate | D-06: cleanup obligatorio post-análisis. Documentado en checklist. |
| T-blast-06-02 | Tampering | Cleanup ejecutado antes de capturar análisis final | mitigate | Checklist sección 6 condition: SOLO después de FINAL-ANALYSIS.txt — verificación previa al rm |
| T-blast-06-03 | Information Disclosure | CSV bounces enviado a GoDentist contiene phones inválidos | accept | Phones inválidos no son PII actionable; el destinatario es el dueño legítimo de los datos (GoDentist) |
| T-blast-06-04 | Repudiation | analyze script puede manipular resultados | mitigate | Solo lee — no muta. Idempotente. Capturar output con `tee` evita re-runs con datos diferentes |
</threat_model>

<verification>
- analyze-blast-experiment.ts existe con queries inbound + lift calculation.
- 06-cleanup-checklist.md existe con timeline, comandos, condiciones de cleanup.
- Ambos archivos pasan los grep checks.
</verification>

<success_criteria>
- `scripts/analyze-blast-experiment.ts` ejecutable produce análisis A vs B con lift y samples
- `06-cleanup-checklist.md` documenta: análisis intermedio, análisis final, entrega CSV, cleanup JSON, cleanup crontab, LEARNINGS
- Usuario tiene path claro desde "primer cron run" hasta "experimento completamente cerrado y limpio"
</success_criteria>

<output>
After completion, create `.planning/standalone/godentist-blast-sms-experiment/06-SUMMARY.md` registrando:
- Confirmación de creación de los 2 archivos
- Línea-clave del análisis script (función `checkInboundIn3d`, lift calculation)
- Fecha esperada del primer análisis intermedio (día 1 + 3 días = día 4)
- Fecha esperada del análisis final (día 5 + 3 días + 1 buffer = día 9)
- Recordatorio que después del análisis final hay que: (a) entregar CSV a GoDentist, (b) borrar JSON tracking, (c) limpiar crontab, (d) escribir LEARNINGS.md
</output>
</output>
