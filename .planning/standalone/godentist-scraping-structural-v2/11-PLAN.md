---
phase: godentist-scraping-structural-v2
plan: 11
type: execute
wave: 5
depends_on: [01, 02, 03, 04, 05, 06, 07, 08, 09, 10]
files_modified:
  - .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_1.json
  - .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_2.json
  - .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_3.json
  - .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_4.json
  - .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_5.json
  - .planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md
autonomous: false
requirements:
  - D-02
  - D-09
  - D-13
  - D-14
  - D-15

must_haves:
  truths:
    - "El robot Railway esta desplegado con paradigm F (Plans 03-05 pushed via git push origin main)"
    - "El server-action morfx (Vercel) esta desplegado con flag/dedupe/canary (Plans 06-09 pushed)"
    - "5 smokes consecutivos contra Railway /api/scrape-appointments retornan JSON exitoso"
    - "node validate.cjs sobre los 5 smokes retorna exit 0 con 'SMOKE PASS 5/5 files clean'"
    - "platform_config.use_new_godentist_scraping = true en prod (verificado via SELECT)"
    - "Existe .planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md con bugs encontrados durante el standalone, decisiones empiricas, pitfalls hallados"
    - "El standalone esta commiteado en main con mensaje descriptivo + Co-Authored-By Claude"
    - "D-02 (empirical validation in vivo) — los 5 smokes en Task 3 son corridas reales contra el portal Dentos productivo (Railway service Godentist), capturando JSON output como evidencia empirica reproducible. Sin asunciones: cada smoke es un comprobante."
    - "D-13 (RESEARCH-phase bloqueante con evidencia empirica entregada antes de plan-phase) honored y EXTENDIDO en producción — el commit unificado (Task 2) consolida los artefactos research-evidence/ + research-scripts/ + 5 smokes productivos como audit trail completo del rediseño en main."
    - "D-09 (sin cleanup retrospectivo) honored por exclusion — el commit (Task 2) y este plan NO incluyen NINGUN INSERT/UPDATE/DELETE sobre godentist_scrape_history, godentist_scheduled_reminders, ni messages para data historica pre-deploy. El fix aplica de aqui en adelante; data del 11-may + 13-may queda preservada para forensics."
  artifacts:
    - path: ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_1.json"
      provides: "JSON de smoke 1 — raw output del endpoint paradigm F"
    - path: ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_2.json"
      provides: "JSON de smoke 2"
    - path: ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_3.json"
      provides: "JSON de smoke 3"
    - path: ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_4.json"
      provides: "JSON de smoke 4"
    - path: ".planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_5.json"
      provides: "JSON de smoke 5"
    - path: ".planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md"
      provides: "Lessons learned + patterns reusable + cost del standalone"
  key_links:
    - from: "Git push origin main"
      to: "Railway auto-deploy (root: godentist/robot-godentist) + Vercel auto-deploy"
      via: "git push"
      pattern: "git push origin main"
---

<objective>
Cerrar el standalone con:

1. **Commit unificado** de todos los cambios de Plans 01-10 (commit atomico para el standalone completo).
2. **Push a origin/main** que triggerea:
   - Railway auto-deploy del robot godentist (root `godentist/robot-godentist/`) — entrega paradigm F.
   - Vercel auto-deploy del proyecto morfx — entrega server-action + UI.
3. **5 smokes consecutivos** contra Railway endpoint paradigm F (`POST /api/scrape-appointments`). Guardar cada response como `smoke_N.json` en el directorio smoke-e2e/.
4. **Run validator** (`node validate.cjs`) sobre los 5 smokes. Debe pasar 5/5 con las 3 invariantes (D-14 + D-15).
5. **Verificar prod** que `platform_config.use_new_godentist_scraping = true` (sanity check post-deploy).
6. **LEARNINGS.md** con bugs descubiertos, patterns reusables, costo del standalone.

Purpose: Este es el gate final. Si los 5 smokes pasan, el bug productivo del 13-may esta cerrado. Si fallan, el merge se aborta y se vuelve a research/plan (CONTEXT.md D-14 mandata abort si <5/5).

Output: 5 smoke JSONs + LEARNINGS.md + 1 commit + 1 push.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraping-structural-v2/CONTEXT.md
@.planning/standalone/godentist-scraping-structural-v2/RESEARCH.md
@.planning/standalone/godentist-scraping-structural-v2/PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Railway deployment trigger -->
- `git push origin main` desde root del repo morfx auto-deploya Railway (root dir configurado a `godentist/robot-godentist/`).
- Railway project: `2bfb887a-6f5a-4866-8190-070601343233`
- Service: `Godentist`
- Env: `production`

<!-- Vercel deployment trigger -->
- Mismo `git push origin main` auto-deploya Vercel (proyecto morfx).
- Vercel build verifica TypeScript en `npm run build` automaticamente.

<!-- Endpoint smoke E2E -->
- URL: `https://godentist-production.up.railway.app/api/scrape-appointments`
- Method: POST
- Body: `{ "workspaceId": "<workspace-id>", "credentials": { "username": "JROMERO", "password": "123456" }, "targetDate": "YYYY-MM-DD" }`
- targetDate: usar mismo dia (today) o +1 dia para tener data real.

<!-- Validator usage -->
- `cd .planning/standalone/godentist-scraping-structural-v2/smoke-e2e && node validate.cjs`
- Default lee smoke_1.json ... smoke_5.json en el mismo directorio.
- Exit 0 si pasa todo, exit 1 si falla cualquier invariante.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Verificar pre-conditions (todos los archivos creados, tsc pasa, smoke validator runable)</name>

  <read_first>
    - .planning/standalone/godentist-scraping-structural-v2/01-SUMMARY.md a 10-SUMMARY.md (verificar que todos existen)
    - CLAUDE.md REGLA 5 (migrations aplicadas a prod)
  </read_first>

  <files>(verificacion solamente — sin file changes)</files>

  <action>
**Pre-flight checks BEFORE git commit / push:**

1. **Migration aplicada a prod** (Plan 01 + Plan 02 usuario debe haber confirmado):
   ```sql
   -- Run in Supabase Dashboard:
   SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'godentist_scrape_history'
     AND column_name IN ('inconsistent', 'inconsistency_details', 'total_citas');
   -- Expected: 3

   SELECT key, value FROM platform_config WHERE key = 'use_new_godentist_scraping';
   -- Expected: 1 row, value = true
   ```

2. **TypeScript del proyecto morfx pasa:**
   ```bash
   npx tsc --noEmit
   ```
   Esperado: exit 0, sin errores.

3. **TypeScript del robot pasa:**
   ```bash
   cd godentist/robot-godentist && npx tsc --noEmit
   ```
   Esperado: exit 0.

4. **Validator runable:**
   ```bash
   node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs
   # Expected: exits 1 (no smoke files yet) — eso confirma que esta runable
   ```

5. **Todos los SUMMARYs presentes:**
   ```bash
   ls .planning/standalone/godentist-scraping-structural-v2/0*-SUMMARY.md | wc -l
   # Expected: 10 (Plans 01-10 cada uno con su SUMMARY)
   ```

Si CUALQUIERA de los 5 checks falla → DETENER y debuggear. NO continuar a Task 2.
  </action>

  <verify>
    <automated>echo "Check 1: tsc morfx" && npx tsc --noEmit && echo "OK"; echo "Check 2: tsc robot" && cd godentist/robot-godentist && npx tsc --noEmit && cd - && echo "OK"; echo "Check 3: validator runs" && node .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs; if [ $? -eq 1 ]; then echo "OK (expected exit 1 — no smokes yet)"; else echo "WARN: unexpected exit"; fi; echo "Check 4: SUMMARYs"; ls .planning/standalone/godentist-scraping-structural-v2/0*-SUMMARY.md 2>/dev/null | wc -l</automated>
  </verify>

  <acceptance_criteria>
    - tsc morfx pasa exit 0.
    - tsc robot pasa exit 0.
    - validator corre y retorna exit 1 (esperado sin smoke files).
    - 10 SUMMARYs presentes (uno por Plan 01-10).
    - Usuario confirmo migration aplicada (Plans 01-02 ya bloquearon en eso).
  </acceptance_criteria>

  <done>
    Pre-flight checks completos. Listo para commit + push.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Commit unificado del standalone + push a origin/main (triggers Railway + Vercel auto-deploy)</name>

  <read_first>
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md (resumen del scope para el commit message)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md (paradigm F summary)
  </read_first>

  <files>(commit operation — afecta todos los archivos modificados de Plans 01-10)</files>

  <action>
**Step 1 — Verificar el git status:**
```bash
git status
```

Esperado: cambios en al menos:
- `supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql` (Plan 01)
- `supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql` (Plan 02)
- `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (Plans 03-05)
- `godentist/robot-godentist/src/api/server.ts` (Plan 05)
- `godentist/robot-godentist/src/types/index.ts` (Plan 05 si totalCitas se agrego ahi)
- `src/app/actions/godentist.ts` (Plans 06+08)
- `src/inngest/functions/godentist-scrape-inconsistent.ts` (Plan 07 — untracked)
- `src/inngest/events.ts` (Plan 07)
- `src/app/api/inngest/route.ts` (Plan 07)
- `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` (Plan 09)
- `.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs` (Plan 10 — untracked)
- `.planning/standalone/godentist-scraping-structural-v2/*-SUMMARY.md` (Plans 01-10)

**Step 2 — Stage explicit files (NO `git add .` por seguridad de no incluir secrets):**
```bash
git add supabase/migrations/20260513120000_godentist_scrape_inconsistent_flag.sql \
        supabase/migrations/20260513120100_platform_config_use_new_godentist_scraping.sql \
        godentist/robot-godentist/src/adapters/godentist-adapter.ts \
        godentist/robot-godentist/src/api/server.ts \
        src/app/actions/godentist.ts \
        src/inngest/functions/godentist-scrape-inconsistent.ts \
        src/inngest/events.ts \
        src/app/api/inngest/route.ts \
        "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx" \
        .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs \
        .planning/standalone/godentist-scraping-structural-v2/*-SUMMARY.md

# Si types/index.ts del robot tambien cambio:
git add godentist/robot-godentist/src/types/index.ts 2>/dev/null || true
```

**Step 3 — Verificar git diff staged antes de commit:**
```bash
git diff --cached --stat
```

Revisar: ~12-13 archivos staged, sin secrets (.env, credentials.json, etc.).

**Step 4 — Commit con mensaje en espanol + Co-Authored-By Claude:**

```bash
git commit -m "$(cat <<'EOF'
feat(godentist-scraping-structural-v2): rediseno desde 0 con paradigm F + dedupe + canary

Cierra bug productivo recurrente del 13-may (3 clientes recibieron reminders cross-sede pese al fix shipped 12-may en standalone godentist-scraper-table-refresh-guard).

Cambios estructurales:
- Robot godentist (Railway): nuevo paradigm F = page.goto(APPOINTMENTS_URL) fresh per sede + selectSucursalF + clickBuscarAndWait + clickNextPageWithGuard + extractCurrentPageRows. Borrado paradigm A legacy (waitForSucursalRefresh, captureFingerprint, discoverSucursales, extractAllPages, clickNextPage, extractAppointments + 4 module-level symbols). Adapter: 1988 -> ~1700 lineas.
- 2 nuevos Error classes exportados: FilterDriftError + PaginationStuckError -> HTTP 502 en server.ts.
- Server-action morfx: feature flag use_new_godentist_scraping (D-10 default ON, semantica OFF=abort con error explicito — NO fetches legacy endpoint inexistente) + dedupe por (sucursal|telefono|hora) (D-12) + cross-sede canary detector (D-08) con await inngest.send + downstream gating de sendConfirmations/scheduleReminders en flag inconsistent.
- Inngest function nueva godentist-scrape-inconsistent (receiver D-08) + event type + registration en route.ts.
- UI tab Programacion de Recordatorios rediseñado: cards-por-scrape replicando patron tab Historial Confirmaciones (D-04) + detail view + orphans bucket + badge AlertTriangle inconsistent + diagnostic JSON view.
- 2 migrations aplicadas a prod ANTES del push (REGLA 5): 20260513120000 (3 columnas a godentist_scrape_history: inconsistent + inconsistency_details + total_citas) + 20260513120100 (INSERT idempotente platform_config use_new_godentist_scraping=true).

Validacion empirica:
- Paradigm F validado en RESEARCH.md con 8 scripts en research-scripts/ y 5 corridas contra portal real: 5/5 PASS las 3 invariantes (ratio + overlap + cross-sede global) tras dedupe.
- Smoke E2E validator nuevo en .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs con 3 invariantes (D-15) y N=5 default (D-14).

Decisiones lockeadas: D-01..D-15 (CONTEXT.md). Sin cleanup retrospectivo (D-09 honored — no INSERT/UPDATE sobre data historica). Rollback en caliente via UPDATE platform_config solo SI se reintroduce paradigma A en server.ts; en caso contrario rollback = git revert + redeploy (D-10 semantica ajustada).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Step 5 — Push a origin/main:**
```bash
git push origin main
```

Esperado:
- Push exitoso (sin pre-push hook failure).
- Railway dashboard muestra build iniciado en ~5-10s.
- Vercel dashboard muestra deployment iniciado en ~5-10s.

**Step 6 — Esperar deploys (Railway tipicamente 60-120s; Vercel 90-180s):**

```bash
# Wait for Railway deploy to finish
# Manual check: railway logs -s Godentist --tail 50 (looking for "Server listening on port 8080" o equivalente)

# Wait for Vercel deploy
# Manual check: vercel ls (or visit https://vercel.com/<team>/<project>/deployments)
```

**Step 7 — Sanity check post-deploy:**

1. Robot health:
   ```bash
   curl https://godentist-production.up.railway.app/api/health
   # Expected: { "status": "ok", ... }
   ```

2. Robot version (debe tener paradigm F):
   ```bash
   # Railway logs deben mostrar "[GoDentist] scrapeAppointments (paradigm F)" en el proximo scrape
   ```

3. Vercel + flag:
   ```sql
   -- En Supabase Dashboard:
   SELECT key, value FROM platform_config WHERE key = 'use_new_godentist_scraping';
   -- Expected: 1 row, value = true
   ```

Si CUALQUIERA falla → revertir push con `git revert HEAD && git push origin main` y debuggear.
  </action>

  <verify>
    <automated>git log --oneline -1 && git push origin main && echo "Push exitoso. Esperando deploys..." && sleep 90 && curl -s https://godentist-production.up.railway.app/api/health && echo</automated>
  </verify>

  <acceptance_criteria>
    - `git log --oneline -1` muestra el commit con mensaje del standalone.
    - `git push origin main` exit 0.
    - Railway health endpoint retorna 200 con `{"status":"ok"}`.
    - Vercel build pasa (verificable en dashboard manualmente; CLI: `vercel ls` muestra deployment Ready).
    - platform_config.use_new_godentist_scraping = true en prod (SELECT verificado).
  </acceptance_criteria>

  <done>
    Commit + push + deploys exitosos. Robot Railway en paradigm F, Vercel con defensas server-action + UI. Listo para smoke E2E.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Ejecutar 5 smokes consecutivos contra Railway endpoint + correr validator</name>

  <read_first>
    - .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/validate.cjs (entender exit codes)
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md D-14 (N=5 minimum)
    - ~/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/godentist_jumbo_floridablanca_dup_scraping.md (auto-memory entry — confirma godentist workspace UUID)
    - .planning/debug/godentist-cross-sede-recurrence.md (forensics: workspace UUID confirmado en logs Railway pre-fix)
  </read_first>

  <files>
    .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_1.json
    .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_2.json
    .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_3.json
    .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_4.json
    .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_5.json
  </files>

  <action>
**Step 1 — Determinar workspace ID y target date:**

<workspace_traceability>
```bash
# Godentist workspace UUID: 36a74890-aad6-4804-838c-57904b1c9328
# Source: .planning/debug/godentist-cross-sede-recurrence.md (forensics 13-may, logs Railway)
#         + auto-memory godentist_jumbo_floridablanca_dup_scraping.md (root cause 11-may)
# NOTE: This is the godentist workspace (whatsapp + portal Dentos scraping).
# This is NOT GoDentist Valoraciones (f0241182-f79b-4bc6-b0ed-b5f6eb20c514 — different
# sibling agent's workspace, channel=facebook/instagram, scope godentist-fb-ig).
# Confusing them would smoke the wrong portal credentials and produce garbage data.
#
# If unsure at runtime, derive dynamically (preferred over hardcoded if Supabase access available):
#   psql -h <SUPABASE_HOST> -U postgres -d postgres -c \
#     "SELECT id FROM workspaces WHERE name ILIKE 'godentist' AND name NOT ILIKE '%valoraciones%' LIMIT 1"
WORKSPACE_ID="36a74890-aad6-4804-838c-57904b1c9328"
```
</workspace_traceability>

```bash
# Target date: mañana (las citas del portal Dentos no tienen data mas alla de ~1 semana — usar dia que tenga citas reales)
TARGET_DATE=$(date -d "tomorrow" +%Y-%m-%d)
# o un date fijo si la data productiva esta mas concentrada:
# TARGET_DATE="2026-05-14"

echo "Smoking against $WORKSPACE_ID for date $TARGET_DATE"
```

**Step 2 — Correr 5 smokes consecutivos (con pausa de ~30s entre cada uno para evitar 409 active job):**

```bash
cd .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/

for i in 1 2 3 4 5; do
  echo "=== Smoke $i ==="
  curl -s -X POST https://godentist-production.up.railway.app/api/scrape-appointments \
    -H "Content-Type: application/json" \
    -d "{
      \"workspaceId\": \"$WORKSPACE_ID\",
      \"credentials\": { \"username\": \"JROMERO\", \"password\": \"123456\" },
      \"targetDate\": \"$TARGET_DATE\"
    }" | tee smoke_$i.json | head -100
  echo ""
  echo "smoke_$i.json saved ($(stat -c%s smoke_$i.json) bytes)"

  # Pausa para evitar 409 (active job) — el robot serializa scrapes per workspaceId
  if [ $i -lt 5 ]; then
    echo "Pausing 30s before next smoke..."
    sleep 30
  fi
done

cd - >/dev/null
```

**Step 3 — Correr el validator:**

```bash
cd .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/
node validate.cjs
EXIT=$?
cd - >/dev/null

if [ $EXIT -eq 0 ]; then
  echo "✓ SMOKE E2E PASS — 5/5 invariantes correctos. D-14 + D-15 satisfechos."
else
  echo "✗ SMOKE E2E FAIL — alguna invariante violada. REVERT requerido."
  echo "Si FAIL, revertir con: git revert HEAD && git push origin main"
fi
```

**Step 4 — Si SMOKE FAIL, abort path:**

CONTEXT.md D-14: "Si alguna falla, se aborta merge y se vuelve a research o plan."

Acciones:
1. Capturar logs Railway del fallo: `railway logs -s Godentist --since 1h --json > smoke-failure-logs.json`
2. Capturar el smoke JSON que fallo (ya tracked como smoke_N.json).
3. Documentar root cause en `.planning/standalone/godentist-scraping-structural-v2/SMOKE-FAILURE.md`.
4. Decidir: revert o hotfix? Si el bug es en config (no codigo), hotfix. Si es en paradigm F, revert + research adicional.
5. Si revert: `git revert HEAD && git push origin main` — Vercel + Railway vuelven a la version pre-Plan-05.

**Step 5 — Si SMOKE PASS, continuar a Task 4 (LEARNINGS.md).**
  </action>

  <verify>
    <automated>ls -la .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_*.json 2>/dev/null | wc -l && cd .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/ && node validate.cjs; STATUS=$?; cd - >/dev/null; echo "validator exit: $STATUS"; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - 5 archivos smoke_N.json presentes en .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/.
    - Cada archivo es JSON valido con `success: true` y `appointments: [...]` no vacio.
    - `node validate.cjs` retorna exit 0.
    - Output muestra "SMOKE PASS — 5/5 files clean (3 invariants: ratio=1.0, overlap=0, no cross-sede)".
    - Si falla cualquier smoke con HTTP 502 (FilterDriftError / PaginationStuckError) — eso es paradigm F gritando que algo nuevo se rompio; abortar y debuggear.
  </acceptance_criteria>

  <done>
    5 smokes ejecutados y validados. 3 invariantes correctas. Bug productivo cerrado. Standalone shipped.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Verificacion humana — flag prod + inspeccion manual de smoke JSONs + UI del tab Programacion</name>

  <what-built>
    El standalone esta deployado. Robot Railway en paradigm F. Server-action morfx con defensas. UI tab Programacion rediseñado. 5 smokes pasaron validator automatico.
  </what-built>

  <how-to-verify>
    **Usuario verifica manualmente:**

    1. **Sanity SQL en Supabase Dashboard prod:**
       ```sql
       -- Confirmar columnas existen:
       SELECT column_name FROM information_schema.columns
       WHERE table_name='godentist_scrape_history' AND column_name IN ('inconsistent','inconsistency_details','total_citas');
       -- Expected: 3 rows

       -- Confirmar flag activo:
       SELECT key, value FROM platform_config WHERE key = 'use_new_godentist_scraping';
       -- Expected: 1 row con value=true

       -- Confirmar el ultimo scrape persistio total_citas (NUEVO Plan 06):
       SELECT id, scraped_date, total_appointments, total_citas, inconsistent
       FROM godentist_scrape_history
       ORDER BY created_at DESC LIMIT 3;
       -- Expected: total_citas no NULL en scrapes post-deploy. inconsistent=false.
       ```

    2. **Inspeccionar smoke JSONs:**
       ```bash
       cd .planning/standalone/godentist-scraping-structural-v2/smoke-e2e/
       for i in 1 2 3 4 5; do
         echo "=== smoke_$i ==="
         jq '{ date: .date, total: .totalAppointments, totalCitas: .totalCitas, sedesCount: (.appointments | map(.sucursal) | unique | length), errors: (.errors // []) | length }' smoke_$i.json
       done
       ```
       Esperado por cada smoke: `total` = 60-120 (rango productivo godentist), `sedesCount` = 4 (las 4 sedes), `errors` = 0.

    3. **Visitar la UI:**
       - Abrir `https://morfx.app/confirmaciones` con workspace godentist seleccionado.
       - Click tab "Programacion de Recordatorios".
       - Verificar:
         - Se ven cards-por-scrape (no la flat list vieja).
         - Cada card muestra timestamp + badges sedes + badges {pending, sent, ...}.
         - Click "Ver detalle" abre el detail view con tabla flat + boton Volver.
         - Si hay un scrape inconsistent (D-08): badge rojo AlertTriangle visible.
         - Si hay reminders huerfanos: seccion "Sin scrape origen (legacy)" al final.

    4. **Logs Railway (forensics confirmacion):**
       ```bash
       railway logs -s Godentist --tail 200 | grep "scrapeAppointments (paradigm F)\|FilterDriftError\|PaginationStuckError\|D-12 dedupe\|D-08 CROSS-SEDE"
       ```
       Esperado:
       - Al menos 5 "scrapeAppointments (paradigm F)" lines (uno por smoke).
       - 0 FilterDriftError / 0 PaginationStuckError / 0 D-08 CROSS-SEDE (canary NO disparo).
       - Posible: "D-12 dedupe: removed N duplicates" (intermitente per RESEARCH.md, normal).

    5. **Responder en el chat con:**
       - **"OK shipped"** → cerrar standalone.
       - **"Bug visible: <descripcion>"** → debuggear inline o iniciar rollback.
       - **"Necesito tiempo para validar mañana"** → pausa hasta el OK final.
  </how-to-verify>

  <resume-signal>Type "OK shipped" tras verificar todos los puntos. Cualquier hallazgo problematico = pausa para debuggear.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Escribir LEARNINGS.md del standalone</name>

  <read_first>
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md (decisiones lockeadas)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md (paradigms evaluados)
    - .planning/standalone/godentist-scraper-table-refresh-guard/LEARNINGS.md si existe (formato + analog)
    - Todos los SUMMARYs de los Plans 01-10 (bugs encontrados durante ejecucion)
  </read_first>

  <files>.planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md</files>

  <action>
Crear archivo `.planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md` con la siguiente estructura:

```markdown
# godentist-scraping-structural-v2 — LEARNINGS

**Shipped:** YYYY-MM-DD
**Duration:** ~Nh execution (research separado)
**Plans executed:** 11 (01-11)
**Commits:** 1 unificado en main (HEAD <SHA>)
**Validation:** 5/5 smoke E2E PASS las 3 invariantes (D-14 + D-15)

## Que se shipped

(Resumen ejecutivo: paradigm F + dedupe + canary + UI rediseñado + 2 migrations en prod)

## Bugs encontrados durante el standalone

(Si algun gap detectado durante Plan 04/05/06 que no esta en CONTEXT.md original, documentar aqui. Ejemplo: "TypeScript del adapter rechazo XYZ; resuelto con cast as HTMLElement | null". Si todo fue smooth, escribir "Sin bugs nuevos descubiertos.")

## Decisiones empiricas tomadas durante ejecucion

(Cualquier DISC-XX que requirio decisión inline. Ejemplo: DISC-01 nombre del flag se mantuvo `use_new_godentist_scraping` por consistency con otros snake_case del repo. DISC-04 detail view reusa flat table existente como sub-componente vs componente nuevo: se opto por wrappear inline.)

## Patterns reusables para futuros standalones

1. **Interface-first task ordering** (Plans 03-04-05): scaffolding inerte → primitivas → wiring. Cada step con tsc gate. Reduce blast radius. **Reusable cuando:** rewrite estructural de modulo grande.

2. **Migration BLOQUEANTE manual per REGLA 5** (Plans 01-02): 2 plans dedicados solo a migration + confirmacion verbal del usuario antes de Plans que referencien las columnas. **Reusable cuando:** cualquier feature que requiera schema delta.

3. **Feature flag con default ON + rollback caliente via SQL** (Plan 02 + Plan 06): platform_config row + getPlatformConfig helper con cache 30s. Sin redeploy. **Reusable cuando:** nuevo paradigma critico que necesita kill-switch operacional.

4. **Cross-sede canary como signal-not-workflow** (D-08, Plan 06): inconsistency detection que NUNCA debe disparar bajo paradigm correcto; si dispara, signal de bug nuevo. Bloquea downstream + alerta developer (no operador). **Reusable cuando:** invariantes de negocio criticos donde recovery automatico es peor que abortar.

5. **Smoke E2E con N>=5 + 3 invariantes** (Plans 10-11): timing-dependent bugs requieren confianza estadistica. **Reusable cuando:** rewrite de scraping/automation que toca pagination/state-transitions.

## Pitfalls encontrados (RESEARCH-grado)

(Si hubo edge cases nuevos durante implementacion no anticipados en RESEARCH.md, documentar aqui. Ejemplo: "Visible combo input selector cambia entre login fresh y session resumed — se resolvio con walk DOM tree desde #idsucursalgrid parent verbatim del PATTERNS §1.")

## Costo de tokens / contexto

(Estimacion subjetiva: cuantos tokens consumio el standalone? Ayuda a calibrar futuros standalones similares.)

## Deuda tecnica creada / resuelta

**Resuelta:**
- Bug productivo del 11-may + 13-may (cross-sede contamination + duplicados).
- Smoke E2E validator viejo con 2 invariantes — reemplazado por uno con 3.
- Adapter con paradigm A (1988 lineas) — limpiado a paradigm F (~1700 lineas).

**Creada:**
- WhatsApp/email notification del canary D-08 quedo TODO V1.1 (analog a bold-upstream-broken).
- Si Godentist agrega una sede nueva: SEDE_ID_MAP requiere update manual + commit (no runtime discovery). Item P3.
- Endpoint legacy `/api/scrape-appointments-legacy` no existe — rollback del flag NO fetchea endpoint sino que el server-action retorna error explicito; rollback REAL = git revert + redeploy. Documentado en 06-SUMMARY.

## Next steps potenciales

- **Standalone futuro:** runtime sede discovery fallback con cache (mitigation para "sede nueva sin update manual").
- **Standalone futuro:** WhatsApp/email alertas del canary D-08 (V1.1 del D-08).
- **Standalone futuro:** Cron nightly smoke E2E con alertas si falla (D-14 extension).
- **Standalone futuro:** UI badge "scraping health: OK/WARNING/DEGRADED" basado en historico de canary fires.

## Referencias

- CONTEXT.md (D-01..D-15 lockeadas)
- RESEARCH.md (paradigm F evaluado + 8 scripts en research-scripts/)
- PATTERNS.md (12 file analogs)
- SUMMARYs 01-SUMMARY a 10-SUMMARY.md (per-plan details)
- Debug original: .planning/debug/godentist-cross-sede-recurrence.md
- Standalone previo (parcial fix): .planning/standalone/godentist-scraper-table-refresh-guard/
```

**Personalizar:**
- Llenar las secciones con info real del standalone (commits, dates, SHA actual).
- Si Task 4 detecto un bug en human-verify, agregar al "Bugs encontrados" + "Resolved inline" o "Hotfix follow-up".
- Tono: factual, sin marketing. Para Claude futuro que lea el LEARNINGS y aprenda.
  </action>

  <verify>
    <automated>test -f .planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md && wc -l .planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md && grep -c "Patterns reusables\|Pitfalls\|Next steps" .planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md</automated>
  </verify>

  <acceptance_criteria>
    - LEARNINGS.md existe.
    - Al menos 100 lineas (documentacion sustantiva, no skeleton vacio).
    - Contiene secciones: "Que se shipped", "Patterns reusables", "Pitfalls", "Deuda tecnica", "Next steps".
    - Refiere SHA del commit en main.
  </acceptance_criteria>

  <done>
    LEARNINGS.md escrito. Standalone cerrado.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 6: Commit LEARNINGS.md + final summary</name>

  <read_first>
    - .planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md (recien creado)
  </read_first>

  <files>(commit operation)</files>

  <action>
**Step 1 — Stage LEARNINGS.md + push:**

```bash
git add .planning/standalone/godentist-scraping-structural-v2/LEARNINGS.md
git commit -m "$(cat <<'EOF'
docs(godentist-scraping-structural-v2): LEARNINGS.md final del standalone

Documenta:
- Que se shipped (paradigm F + dedupe + canary + UI rediseñado).
- 5 patterns reusables para futuros standalones (interface-first, migration BLOQUEANTE, feature flag con SQL rollback, canary signal-not-workflow, smoke E2E N>=5 + 3 invariantes).
- Pitfalls encontrados durante ejecucion.
- Deuda tecnica resuelta (bug productivo cerrado) y creada (WhatsApp alertas TODO V1.1, runtime sede discovery TODO).
- Next steps potenciales.

Cierra el standalone godentist-scraping-structural-v2 con 5/5 smokes PASS contra Railway paradigm F.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push origin main
```

**Step 2 — Update MEMORY.md:**

Si CLAUDE.md MEMORY.md tiene una entry "in flight" del standalone, actualizarla a "SHIPPED". Si no existe entry, agregar una. Verificar con:
```bash
grep -n "godentist-scraping-structural-v2\|godentist_scraping_structural_v2_in_flight" $HOME/.claude/projects/-mnt-c-Users-Usuario-Proyectos-morfx-new/memory/MEMORY.md 2>/dev/null
```

Si existe, agregar nota inline (no full rewrite — el MEMORY es auto-managed por Claude per project conventions):
- "SHIPPED YYYY-MM-DD con commit <SHA>. Bug productivo cross-sede cerrado. Paradigm F en prod."

**Step 3 — Final status:**

```bash
git log --oneline -3
echo ""
echo "✓ Standalone godentist-scraping-structural-v2 SHIPPED"
echo "✓ Robot Railway: paradigm F"
echo "✓ Vercel: defensas server-action + UI rediseñado"
echo "✓ 5/5 smokes PASS las 3 invariantes"
echo "✓ Flag use_new_godentist_scraping = true en prod"
echo "✓ Rollback path: git revert HEAD del commit del standalone + redeploy (paradigm A no existe en main post-Plan 05; flag OFF retorna error explicito sin fetch fallback)."
```
  </action>

  <verify>
    <automated>git log --oneline -3 && git status</automated>
  </verify>

  <acceptance_criteria>
    - 2 commits del standalone en main (commit principal + LEARNINGS.md).
    - git status clean (sin uncommitted changes).
    - LEARNINGS.md commiteado.
  </acceptance_criteria>

  <done>
    Standalone completo. Tests pass, prod estable, learnings documentados.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Git <-> Railway / Vercel | Auto-deploy on push. Standard CI flow. |
| Local <-> Railway endpoint (smoke) | HTTP POST con credenciales hardcoded JROMERO/123456. Mismo pattern que server-action morfx. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-11-01 | Tampering | git push to main | accept | Branch protection (si configurada) + manual review. |
| T-v2-11-02 | Information disclosure | smoke JSONs con PII (phones de pacientes) commiteados al repo | mitigate | Repo es privado. Los smoke JSONs ya tenian PII en el standalone anterior — mismo nivel de exposicion. Considerar redactar phones a futuro pero NO bloquea V1. |
| T-v2-11-03 | Denial of service | 5 smokes consecutive contra Railway = ~125s de scraping continuo | accept | Robot serializa per workspaceId. No DoS para otros workspaces. |
| T-v2-11-04 | Repudiation | LEARNINGS.md commitea decisiones | accept | Audit trail enriquecido. |
</threat_model>

<verification>
- Pre-flight checks pass (tsc x2 + validator + 10 SUMMARYs).
- Commit + push exitosos.
- Railway + Vercel deploys completos.
- 5/5 smokes PASS validador.
- Usuario confirmo OK shipped.
- LEARNINGS.md commiteado.
</verification>

<success_criteria>
- [ ] Task 1: Pre-flight checks pass.
- [ ] Task 2: Commit unificado + push + deploys exitosos.
- [ ] Task 3: 5/5 smokes PASS validator.
- [ ] Task 4: Usuario verifico SQL + UI + logs Railway + confirmo "OK shipped".
- [ ] Task 5: LEARNINGS.md escrito.
- [ ] Task 6: LEARNINGS.md commiteado + push.
- [ ] Bug productivo del 13-may cerrado.
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/11-SUMMARY.md` con:
- SHAs de los 2 commits (principal + LEARNINGS).
- URLs de deploys (Railway + Vercel).
- Output del validator de los 5 smokes.
- Notas del Task 4 humano (cualquier hallazgo o "all clear").
- Resumen final del standalone: bug cerrado, paradigm F en prod, rollback disponible.
</output>
</content>
