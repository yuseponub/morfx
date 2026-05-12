---
phase: godentist-scraper-table-refresh-guard
plan: 05
type: execute
wave: 4
depends_on:
  - "01"
  - "02"
  - "03"
  - "04"
files_modified: []
autonomous: false
requirements:
  - REQ-04

must_haves:
  truths:
    - "El robot Railway service Godentist tiene un deploy SUCCESS posterior al commit que cierra Plan 04"
    - "GET https://godentist-production.up.railway.app/api/health retorna {status:'ok',...}"
    - "3 scrapes consecutivos multi-sucursal contra portal Dentos real producen JSON con ratio=1.0 por sede y overlap=0 entre todos los pares de sedes"
    - "Un scrape single-sucursal (regression check) sigue funcionando correctamente sin contaminacion"
    - "Los logs Railway tras los 3 scrapes contienen >=12 lineas grep-ables 'Table refresh confirmed for' (4 sedes x 3 corridas)"
  artifacts:
    - path: ".planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/smoke_1.json"
      provides: "JSON output del primer scrape consecutivo"
    - path: ".planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/smoke_2.json"
      provides: "JSON output del segundo scrape consecutivo"
    - path: ".planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/smoke_3.json"
      provides: "JSON output del tercer scrape consecutivo"
    - path: ".planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/smoke_single.json"
      provides: "JSON output del regression check single-sucursal"
    - path: ".planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs"
      provides: "Node script de validacion numerica (ratio + overlap)"
  key_links:
    - from: "git push origin main"
      to: "Railway service Godentist auto-deploy"
      via: "Railway webhook on push, root dir /godentist/robot-godentist"
      pattern: "Deploy SUCCESS via Railway dashboard"
    - from: "validate.cjs script"
      to: "smoke_1.json + smoke_2.json + smoke_3.json"
      via: "fs.readFileSync + JSON.parse"
      pattern: "process.exit(allPassed ? 0 : 1)"
---

<objective>
Cerrar el standalone con prueba empirica:

1. **Push a `origin main`** para triggear Railway auto-deploy del servicio Godentist (root dir `/godentist/robot-godentist`).
2. **Verificar deploy SUCCESS** (Railway dashboard) + health check `/api/health` retorna `ok`.
3. **3 scrapes consecutivos multi-sucursal** contra portal Dentos real para una fecha futura con citas en >=2 sedes distintas.
4. **Validacion numerica** con script Node: cada uno de los 3 JSON outputs cumple `ratio=1.0` por sede + `overlap=0` entre todos los pares de sedes (REQ-04).
5. **Regression check single-sucursal**: 1 scrape con `sucursales=["JUMBO EL BOSQUE"]` para confirmar que single-sede sigue funcionando sin regresion.
6. **Verificar logs Railway**: `>=12` lineas `Table refresh confirmed for` (4 sedes x 3 corridas) + 0 lineas `Table refresh FAILED`.

Purpose: Sin esta validacion no hay evidencia de que el fix funciona en el portal real. El bug del 11-may era timing-dependent (1 de 6 scrapes fallo). 3 corridas consecutivas limpias dan confianza estadistica minima — si reapareciera el bug en el N+1 scrape se reabre standalone follow-up.

Output: 4 archivos JSON capturados en `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/` + 1 script Node de validacion + 1 SUMMARY documentando resultado.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraper-table-refresh-guard/SPEC.md
@.planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md
@.planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md
@.planning/standalone/godentist-scraper-table-refresh-guard/01-SUMMARY.md
@.planning/standalone/godentist-scraper-table-refresh-guard/02-SUMMARY.md
@.planning/standalone/godentist-scraper-table-refresh-guard/03-SUMMARY.md
@.planning/standalone/godentist-scraper-table-refresh-guard/04-SUMMARY.md

<interfaces>
<!-- Railway service config (CONTEXT.md): -->
- Project: `2bfb887a-6f5a-4866-8190-070601343233`
- Service: `Godentist`
- Env: `production`
- Root directory: `/godentist/robot-godentist`
- Auto-deploy on push to `origin main`
- Base URL: `https://godentist-production.up.railway.app`
- Endpoints relevantes: `GET /api/health`, `POST /api/scrape-appointments`

<!-- Credenciales Dentos (CONTEXT.md): -->
- Username: `JROMERO`
- Password: `123456`
- Workspace ID: `36a74890-aad6-4804-838c-57904b1c9328` (godentist workspace)
- Portal: https://godentist.dentos.co
- Sucursales: `CABECERA`, `FLORIDABLANCA`, `JUMBO EL BOSQUE`, `MEJORAS PUBLICAS`

<!-- Script de validacion (RESEARCH.md "Smoke E2E Recipe"): -->
Validacion: ratio_total_por_sede / unicos_por_sede = 1.0 + interseccion (phone,hora) entre cualquier par de sedes = 0.
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Push a Railway + verificar deploy SUCCESS</name>

  <read_first>
    - .planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md (Smoke E2E Recipe — Step 1)
    - CLAUDE.md (Regla 1 push a Vercel NO aplica al robot — Railway tiene auto-deploy)
  </read_first>

  <what-built>
    Plans 01-04 modificaron 2 archivos:
    - `godentist/robot-godentist/src/adapters/godentist-adapter.ts` — primitivas (Fingerprint, fingerprintsEqual, SedeRefreshFailedError, constantes) + captureFingerprint + waitForSucursalRefresh + wire del loop scrapeAppointments + re-throw selectivo del catch.
    - `godentist/robot-godentist/src/api/server.ts` — import extendido + branch HTTP 502 en el catch del scrape handler.
  </what-built>

  <how-to-verify>
    1. Confirmar que `git status` muestra los archivos modificados solo en `godentist/robot-godentist/src/`. Si hay otros archivos `M` que no son parte del scope, hacer stash o revisar antes de push (no romper Regla 4 del proyecto).
    2. Confirmar que existen los commits atomicos de Plans 01-04 (debio crearse 1 commit por plan):
       ```
       git log --oneline -10
       ```
       Esperado: ver mensajes en espanol mencionando "table-refresh guard" / "captureFingerprint" / "wire scrapeAppointments" / "HTTP 502 mapping".
    3. Push al remoto:
       ```
       git push origin main
       ```
    4. Railway detecta el push y triggea auto-deploy del servicio Godentist. Esperar ~2-3 minutos.
    5. Verificar deploy SUCCESS:
       - Opcion A: dashboard Railway → project `2bfb887a-6f5a-4866-8190-070601343233` → servicio `Godentist` → ultimo deploy status `SUCCESS`.
       - Opcion B: health check directo:
         ```
         curl -s https://godentist-production.up.railway.app/api/health
         ```
         Esperado: `{"status":"ok","uptime":<number>,"timestamp":"<ISO>"}`.
    6. Si deploy FAILED:
       - Revisar logs Railway: `railway logs -s Godentist --tail 100` (si Railway CLI disponible) o dashboard logs view.
       - Buscar errores de TypeScript/build. Si los hay, el `tsc --noEmit` que pasaba localmente debio detectarlos — posible mismatch en Node version o config Railway. Reportar al operador antes de continuar.
  </how-to-verify>

  <resume-signal>
    El operador escribe "deploy-ok" cuando el deploy esta SUCCESS y `/api/health` retorna `ok`. Si deploy FAIL, el operador escribe "deploy-fail" + paste de logs Railway relevantes; Claude debe diagnosticar antes de continuar (probable rollback del commit problematico + fix + re-push).
  </resume-signal>

  <acceptance_criteria>
    - `git push origin main` retorna sin errores.
    - Railway deploy del servicio Godentist tiene status `SUCCESS` (verificacion dashboard o CLI).
    - `curl -s https://godentist-production.up.railway.app/api/health | jq -r .status` retorna `ok`.
    - El operador escribio `deploy-ok` para continuar.
  </acceptance_criteria>

  <done>
    Nuevo robot deployed a Railway. Health check verde. Listo para correr smoke E2E.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear script de validacion validate.cjs</name>

  <read_first>
    - .planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md (Step 3 — script Node verbatim del recipe)
  </read_first>

  <files>.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs</files>

  <action>
Crear el archivo `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs` (CommonJS .cjs para evitar issues con `type: module` en el repo). Es un script Node standalone que parsea los 3 JSON outputs del smoke E2E y valida ratio + overlap.

Verificar que el directorio padre existe primero:

    ls -la /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/

Si `smoke-e2e/` no existe, crearlo:

    mkdir -p /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e

Contenido verbatim del script:

```javascript
#!/usr/bin/env node
// Smoke E2E validator for godentist-scraper-table-refresh-guard standalone.
// Usage:
//   node validate.cjs  (defaults to ./smoke_1.json, ./smoke_2.json, ./smoke_3.json)
//   node validate.cjs path1.json path2.json path3.json
//
// Pass criteria (per SPEC Acceptance):
//   - ratio (total / unique) per sede === 1.0 for every sede in every file
//   - overlap (phone+hora intersection) === 0 between every pair of sedes in every file
// Exit code 0 if pass, 1 if fail.

const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const dir = __dirname
const files = args.length > 0
  ? args
  : [path.join(dir, 'smoke_1.json'), path.join(dir, 'smoke_2.json'), path.join(dir, 'smoke_3.json')]

let allPassed = true

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`FAIL ${file}: file not found`)
    allPassed = false
    continue
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    console.log(`FAIL ${file}: invalid JSON (${err.message})`)
    allPassed = false
    continue
  }

  if (!data.success || !Array.isArray(data.appointments)) {
    console.log(`FAIL ${file}: not a success response (success=${data.success})`)
    if (data.error) console.log(`  error: ${data.error}`)
    allPassed = false
    continue
  }

  const apps = data.appointments

  // Group by sucursal
  const bySede = {}
  for (const a of apps) {
    const key = a.sucursal || '<no-sede>'
    if (!bySede[key]) bySede[key] = []
    bySede[key].push(`${a.telefono}|${a.hora}`)
  }

  // Ratio per sede
  const ratios = {}
  for (const [sede, keys] of Object.entries(bySede)) {
    const unique = new Set(keys).size
    ratios[sede] = { total: keys.length, unique, ratio: keys.length / unique }
  }

  // Overlap pairwise
  const sedes = Object.keys(bySede)
  const overlaps = []
  for (let i = 0; i < sedes.length; i++) {
    for (let j = i + 1; j < sedes.length; j++) {
      const a = new Set(bySede[sedes[i]])
      const b = new Set(bySede[sedes[j]])
      const inter = [...a].filter(x => b.has(x))
      overlaps.push({ pair: `${sedes[i]} x ${sedes[j]}`, intersection: inter.length, samples: inter.slice(0, 3) })
    }
  }

  const ratiosBad = Object.entries(ratios).filter(([_, r]) => r.ratio !== 1)
  const overlapsBad = overlaps.filter(o => o.intersection !== 0)
  const pass = ratiosBad.length === 0 && overlapsBad.length === 0

  console.log(`${pass ? 'PASS' : 'FAIL'} ${path.basename(file)}`)
  console.log(`  date: ${data.date}, totalAppointments: ${apps.length}, sedes: ${sedes.join(', ')}`)
  console.log(`  ratios: ${JSON.stringify(ratios)}`)
  if (overlapsBad.length > 0) {
    console.log(`  overlaps_bad: ${JSON.stringify(overlapsBad)}`)
  }

  if (!pass) allPassed = false
}

console.log('')
if (allPassed) {
  console.log('SMOKE PASS — all files clean (ratio=1.0 per sede, overlap=0 between sedes)')
  process.exit(0)
} else {
  console.log('SMOKE FAIL — review JSON files above')
  process.exit(1)
}
```

Hacer ejecutable:

    chmod +x /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs

Probar que el script arranca (con archivos inexistentes deberia retornar exit 1 con mensajes "file not found"):

    cd /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e
    node validate.cjs

Esperado: 3 lineas "FAIL ... file not found" + "SMOKE FAIL" + exit 1. Esto confirma que el script funciona; los archivos reales se generan en Task 3.
  </action>

  <verify>
    <automated>test -f /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs && cd /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e && node validate.cjs; echo "exit=$?"</automated>
  </verify>

  <acceptance_criteria>
    - `test -f .planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs` retorna exit 0.
    - El script parsea correctamente sin syntax errors: `node -c validate.cjs` retorna exit 0.
    - Ejecutar sin archivos JSON retorna exit 1 y mensajes "file not found" (comportamiento esperado pre-Task-3).
    - El script puede tomar argumentos opcionales (paths a 3 archivos) o usar defaults (`./smoke_{1,2,3}.json`).
  </acceptance_criteria>

  <done>
    Script validador creado en `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/validate.cjs`. Ejecutable. Pre-test (sin archivos) confirma que el script funciona.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Ejecutar 3 scrapes consecutivos + 1 regression single-sucursal + validar con script</name>

  <read_first>
    - .planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md (Smoke E2E Recipe — Step 2, 3, 5)
    - .planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md (D-11)
    - SPEC.md (Acceptance Criteria — 7 bullets que se validan aqui)
  </read_first>

  <what-built>
    Robot Railway deployed con guard table-refresh + script validador local listo.
  </what-built>

  <how-to-verify>
    1. Elegir TARGET_DATE: una fecha futura (1-7 dias a partir de hoy) con citas en >=2 sedes. El operador puede verificar visualmente en el portal Dentos antes de correr. Si dudoso, usar el dia laboral siguiente (consultar horarios sedes en `LEARNINGS.md` del proyecto). Default razonable: D+2 dias habiles.

    2. Cambiar al directorio del smoke:

        cd /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e

    3. Ejecutar las 3 corridas consecutivas (anclaje en variable TARGET_DATE — sustituir por la fecha real):

        export TARGET_DATE="YYYY-MM-DD"  # operador rellena

        for i in 1 2 3; do
          echo ">>> Corrida $i comenzando..."
          curl -s --max-time 300 -X POST "https://godentist-production.up.railway.app/api/scrape-appointments" \
            -H "Content-Type: application/json" \
            -d "{\"workspaceId\":\"36a74890-aad6-4804-838c-57904b1c9328\",\"credentials\":{\"username\":\"JROMERO\",\"password\":\"123456\"},\"sucursales\":[\"CABECERA\",\"FLORIDABLANCA\",\"JUMBO EL BOSQUE\",\"MEJORAS PUBLICAS\"],\"targetDate\":\"${TARGET_DATE}\"}" \
            > smoke_${i}.json
          echo ">>> Corrida $i completed: $(jq -r '.totalAppointments' smoke_${i}.json) appointments"
          sleep 5
        done

    4. Validar con el script:

        node validate.cjs

        Esperado: 3 lineas `PASS smoke_X.json` + linea final `SMOKE PASS` + exit 0.

    5. Regression check single-sucursal:

        curl -s --max-time 300 -X POST "https://godentist-production.up.railway.app/api/scrape-appointments" \
          -H "Content-Type: application/json" \
          -d "{\"workspaceId\":\"36a74890-aad6-4804-838c-57904b1c9328\",\"credentials\":{\"username\":\"JROMERO\",\"password\":\"123456\"},\"sucursales\":[\"JUMBO EL BOSQUE\"],\"targetDate\":\"${TARGET_DATE}\"}" \
          > smoke_single.json

        node validate.cjs smoke_single.json

        Esperado: `PASS smoke_single.json` (overlap N/A porque solo 1 sede, pero ratio=1.0 debe cumplirse) + exit 0.

    6. Verificar logs Railway:

        # Si Railway CLI disponible:
        railway logs -s Godentist --tail 300 | grep "Table refresh"
        # O via dashboard: Railway → Godentist service → logs view, filtrar por "Table refresh"

        Esperado:
        - >=12 lineas `[GoDentist] Table refresh confirmed for {sede} after attempt 1: prev=... → curr=...` (4 sedes x 3 corridas = 12 minimo).
        - +3 lineas adicionales del single-sucursal (1 sede x 1 corrida).
        - 0 lineas `Table refresh failed for` (intermediate retry) — si aparece alguna es OK si el corrida final fue successful, indicar al operador para review pero no es bloqueante.
        - 0 lineas `Table refresh FAILED for` (uppercase, indicando abort total) — si aparece alguna, el smoke fallo y hay que investigar.

    7. Si TODO PASS:
       - Confirmar al operador que el standalone esta listo para cerrar.
       - El operador puede triggear los reminders de la fecha futura para validacion downstream.

    8. Si ALGO FAIL:
       - Si validate.cjs reporta `overlap_bad` o `ratios_bad`: el guard tuvo un caso edge no anticipado. Capturar `railway logs -s Godentist` completo + los 3 smoke_*.json + abrir investigacion.
       - Si HTTP 502 con `code: sede_refresh_failed`: el guard funciono correctamente pero el portal Dentos no refrescaba consistente para alguna sede. Capturar el body 502 + railway logs y reportar — puede ser bug del portal (out of scope, abrir standalone follow-up si recurrente) o sintoma que requiere bump del timeout (`SUCURSAL_REFRESH_TIMEOUT_MS = 12000`).
       - Si HTTP 500: el robot tuvo error interno no relacionado al guard. Capturar para diagnostico.
  </how-to-verify>

  <resume-signal>
    El operador escribe "smoke-pass" cuando los 3 scrapes + regression check pasan validate.cjs con exit 0 y logs Railway muestran las lineas `Table refresh confirmed` esperadas. Si fail, "smoke-fail" + paste de outputs (validate.cjs output + railway logs grep) para diagnostico.
  </resume-signal>

  <acceptance_criteria>
    - Existen los 4 archivos: `smoke_1.json`, `smoke_2.json`, `smoke_3.json`, `smoke_single.json` en `smoke-e2e/`.
    - `cd .planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e && node validate.cjs` retorna exit 0 con "SMOKE PASS".
    - `node validate.cjs smoke_single.json` retorna exit 0 (regression single-sucursal limpio).
    - Logs Railway muestran >=15 lineas `Table refresh confirmed for` (12 del multi + 3 del single).
    - 0 lineas `Table refresh FAILED for` en logs Railway del smoke window.
    - El operador escribio `smoke-pass`.
  </acceptance_criteria>

  <done>
    REQ-04 satisfecho con evidencia empirica. 3 scrapes consecutivos + 1 regression single, todos limpios. Robot productivo deja de contaminar JSONs cross-sede. Standalone listo para LEARNINGS.md final.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Crear SUMMARY del plan 05 + agregar nota a auto-memory + actualizar deuda tecnica</name>

  <read_first>
    - .planning/standalone/godentist-scraper-table-refresh-guard/SPEC.md (Acceptance Criteria — para checklist en SUMMARY)
    - .planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/smoke_1.json (numeros reales del scrape para citar en SUMMARY)
    - CLAUDE.md (Regla 4 — docs actualizadas)
  </read_first>

  <files>.planning/standalone/godentist-scraper-table-refresh-guard/05-SUMMARY.md</files>

  <action>
Crear `.planning/standalone/godentist-scraper-table-refresh-guard/05-SUMMARY.md` documentando:

1. **Resultado smoke E2E:**
   - Fecha de la corrida (en Bogota TZ).
   - TARGET_DATE usado.
   - Output verbatim de `node validate.cjs` con los 3 archivos (incluir los `ratios` por sede tal cual los retorno el script).
   - Output verbatim del regression check single-sucursal.
   - Conteo de lineas `Table refresh confirmed` capturadas en Railway logs.
   - Conteo de lineas `Table refresh FAILED` (idealmente 0).

2. **Checklist de Acceptance Criteria SPEC.md (los 7 bullets):**
   - Marcar cada uno con [x] PASS / [ ] FAIL + evidencia (path al JSON o linea de log).

3. **Conclusion + next steps:**
   - Si todo PASS: standalone listo para cerrar (LEARNINGS.md a documentar siguiente).
   - Notar en auto-memory `$HOME/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/` una linea breve referenciando el cierre del bug del 11-may. Path concreto: appendear/crear `godentist_scraper_refresh_guard.md` con resumen 5 lineas (segun convencion observada en MEMORY.md del proyecto que ya tiene `godentist_jumbo_floridablanca_dup_scraping.md` como reference activa del bug a cerrar).

4. **Deuda tecnica resuelta:**
   - Si en `docs/analysis/04-estado-actual-plataforma.md` hay seccion del modulo godentist robot con el bug 2026-05-11 listado como activo, removerlo o marcarlo resuelto (Regla 4 del proyecto: docs sincronizadas con codigo).

NOTA: este task NO commitea cambios — el commit final del standalone se hace al cerrar con LEARNINGS.md (siguiente comando manual del operador). Este task solo escribe los archivos.

Estructura sugerida del SUMMARY:

```markdown
# 05-SUMMARY — Smoke E2E validation

**Plan:** 05 (Wave 4, autonomous: false)
**Status:** PASS / FAIL
**Date:** YYYY-MM-DD HH:MM Bogota

## Smoke E2E Run

**TARGET_DATE:** YYYY-MM-DD
**Sucursales:** CABECERA, FLORIDABLANCA, JUMBO EL BOSQUE, MEJORAS PUBLICAS
**Robot URL:** https://godentist-production.up.railway.app

### validate.cjs output (3 multi-sucursal corridas)

```
<paste verbatim>
```

### validate.cjs output (1 single-sucursal regression)

```
<paste verbatim>
```

### Railway logs

- `Table refresh confirmed for` count: N
- `Table refresh failed for` count (intermediate retry): N
- `Table refresh FAILED for` count (abort): N

## Acceptance Criteria (SPEC.md)

- [x/[ ]] JSON multi-sucursal sin `(phone,hora)` repetidos entre sedes — evidencia: ...
- [x/[ ]] JSON multi-sucursal sin `(phone,hora)` repetidos dentro de la misma sede — evidencia: ...
- ... (resto de los 7 bullets)

## Conclusion

...

## Auto-memory update

Anadida nota a `~/.claude/projects/.../memory/godentist_scraper_refresh_guard.md`.
```
  </action>

  <verify>
    <automated>test -f /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/05-SUMMARY.md && grep -c "Smoke E2E" /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/05-SUMMARY.md</automated>
  </verify>

  <acceptance_criteria>
    - `.planning/standalone/godentist-scraper-table-refresh-guard/05-SUMMARY.md` existe.
    - Contiene seccion "Smoke E2E Run" con output real (no placeholder).
    - Contiene checklist de los 7 Acceptance Criteria de SPEC.md.
    - Documenta el conteo de lineas `Table refresh` en logs Railway.
    - Si todo PASS, registra una linea en `~/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/` o referencia en MEMORY.md indicando "GoDentist scraper table-refresh guard shipped YYYY-MM-DD — closes bug 2026-05-11".
  </acceptance_criteria>

  <done>
    SUMMARY documentado con evidencia empirica del smoke E2E. Auto-memory actualizada. Standalone listo para LEARNINGS.md y cierre.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local CLI (Claude) ↔ Railway HTTPS endpoint | curl con credentials del portal en el body (workspace + JROMERO/123456). Credenciales se envian sobre TLS, no se logguean en CI/CD. |
| Local CLI ↔ Local filesystem (.planning/) | Script + JSON outputs se guardan localmente para evidencia. Los JSON contienen datos personales (phones, nombres) de pacientes GoDentist — no commitear al repo publico. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-grd-05-01 | Information disclosure | `smoke_*.json` contienen datos personales de pacientes (phone + hora + nombre) | mitigate | Los archivos viven en `.planning/standalone/.../smoke-e2e/` que es local del operador. **NO commitear los JSON al repo** (anadir a `.gitignore` si aun no esta). El SUMMARY documenta solo conteos agregados (ratio, overlap, totalAppointments), NO los nombres/phones individuales. |
| T-grd-05-02 | Tampering | El smoke E2E corre contra el portal Dentos real — los `selectSucursal` y `clickBuscar` mutan el state del session del operador en el portal | accept | El robot crea su propia session de Playwright (storage session aislada). El operador no esta logueado simultaneamente al portal mientras el smoke corre, por defecto. Si lo estuviera, max impact es session expiration prematura — recuperable con re-login manual. |
| T-grd-05-03 | Repudiation | Logs Railway tienen retencion limitada (~7 dias plan free); si bug reaparece despues no hay forensics | mitigate | El SUMMARY captura los conteos clave en .planning/ que viven en el repo. Si bug reaparece, el primer paso del nuevo standalone consulta este SUMMARY para baseline. Logs Railway son secundarios; primary evidence es el SUMMARY + JSON files locales. |
| T-grd-05-04 | Denial of service | 3 scrapes consecutivos consumen CPU/RAM del Railway service Godentist (~30-60s cada uno) | accept | Ese uso es el normal del robot — el sintoma seria que otros scrapes concurrentes del workspace fallarian con HTTP 409 `Another scraping job is in progress`. Aceptable para una ventana de 5min del smoke. |
| T-grd-05-05 | Information disclosure | El TARGET_DATE para el smoke debe ser fecha real con citas — el operador podria filtrar por error logs del scrape en publico | accept | El operador es el unico con acceso al portal y al dashboard Railway. No hay publicacion externa del smoke. SPEC.md aceptance criteria 6 explicita "fecha futura con citas en >=2 sedes distintas". |
| T-grd-05-06 | Tampering | Si el smoke E2E falla por bug en el portal Dentos (out of scope), el operador podria erroneamente bumpear timeout sin entender el sintoma | mitigate | `How to verify` step 8 explicitamente discrimina: HTTP 502 con `code: sede_refresh_failed` = guard funciono pero portal no refresca → diagnosticar (potencial bump timeout en estandalone follow-up); validate.cjs reporta `overlap_bad` = guard tuvo edge case no anticipado (bug en este standalone). |
</threat_model>

<verification>
- Deploy SUCCESS verificado en Railway dashboard o via health check.
- Script `validate.cjs` ejecutable y funcionando.
- 4 JSON files presentes en `.planning/standalone/.../smoke-e2e/`.
- `validate.cjs` retorna exit 0 con "SMOKE PASS" para los 3 multi-sucursal corridas.
- `validate.cjs smoke_single.json` retorna exit 0 para el regression.
- Logs Railway: >=15 lineas `Table refresh confirmed` total, 0 lineas `FAILED for`.
- SUMMARY 05 documentado con evidencia.
</verification>

<success_criteria>
- [ ] Deploy Railway SUCCESS + `/api/health` OK.
- [ ] validate.cjs script creado y funcional.
- [ ] 3 scrapes consecutivos multi-sucursal capturados como JSON.
- [ ] 1 regression check single-sucursal capturado.
- [ ] validate.cjs reporta `SMOKE PASS` (exit 0) en ambas validaciones.
- [ ] Logs Railway muestran >=15 lineas `Table refresh confirmed for` y 0 lineas `Table refresh FAILED for`.
- [ ] 05-SUMMARY.md documentado con evidencia real.
- [ ] Auto-memory + docs/analysis/ actualizadas si aplica (Regla 4).
</success_criteria>

<output>
Tras completar este plan:
1. Crear `.planning/standalone/godentist-scraper-table-refresh-guard/05-SUMMARY.md` con evidencia smoke E2E.
2. NO commitear los JSON files del smoke al repo (anadir `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/smoke_*.json` a `.gitignore` si no esta).
3. SI commitear: `validate.cjs` (script reusable), `05-SUMMARY.md` (evidencia agregada sin PII), `05-PLAN.md`.
4. Comando manual siguiente del operador: `LEARNINGS.md` del standalone para documentar patterns reusables (Regla 0 GSD).
</output>
