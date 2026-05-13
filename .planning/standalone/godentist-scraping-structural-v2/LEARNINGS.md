# godentist-scraping-structural-v2 — LEARNINGS

**Shipped:** 2026-05-13
**Plans executed:** 11 (Plans 01-11)
**Atomic commits:** ~35 (Plans 01-10) + 6 fixes iter 1-6 (Plan 11 hotfix loop)
**Validation:** 5/5 smoke E2E PASS las 3 invariantes (D-14 + D-15) — `ratio=1.0`, `overlap=0`, `no cross-sede`

## Qué se shipped

**Bug productivo cerrado:** cross-sede contamination en scrapeAppointments del robot godentist Railway. Tres clientes recibieron reminders cross-sede el 11-may y 13-may pese al fix shipped 12-may (standalone `godentist-scraper-table-refresh-guard`).

**Cambios estructurales:**
- **Robot Railway** (`godentist/robot-godentist/`):
  - Paradigm F: `page.goto(APPOINTMENTS_URL)` fresh per sede + `selectSucursalF` + `clickBuscarAndWait` + `clickNextPageWithGuard` + `extractCurrentPageRows`
  - Paradigm A removido del adapter (~355 líneas borradas)
  - 2 nuevos Error classes: `FilterDriftError` + `PaginationStuckError` → HTTP 502 en `server.ts`
  - Dedupe defense-in-depth por `(sucursal|telefono|hora)` al final de `scrapeAppointments`
- **Server-action morfx** (`src/app/actions/godentist.ts`):
  - Feature flag `use_new_godentist_scraping` (D-10 default ON, kill-switch semantics)
  - Dedupe por `(sucursal|telefono|hora)` post-fetch (D-12 — redundante con robot, defense-in-depth)
  - Cross-sede canary detector (D-08) emite Inngest event `godentist/scrape.inconsistent` + persiste `inconsistent=true` flag
  - Downstream gating: `sendConfirmations` + `scheduleReminders` abortan si `scrape.inconsistent=true`
- **Inngest function** (`src/inngest/functions/godentist-scrape-inconsistent.ts`):
  - Receiver de canary events; loguea + escribe a `agent_observability_events`
- **UI tab Programación de Recordatorios** (`src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx`):
  - Cards-por-scrape replicando patrón de Historial Confirmaciones (D-04)
  - Detail view + orphans section + badge `AlertTriangle` rojo si `inconsistent=true`
- **Migrations** (aplicadas a prod ANTES del push — REGLA 5):
  - `20260513120000_godentist_scrape_inconsistent_flag.sql` — 3 columnas (inconsistent + inconsistency_details + total_citas) + partial index
  - `20260513120100_platform_config_use_new_godentist_scraping.sql` — INSERT idempotente

## Bugs encontrados durante ejecución (iter loop Plan 11)

Los **iter 1-5 del Plan 11** revelaron 4 bugs estructurales en paradigm F que **research-phase no detectó** porque corrió con `headless: false` local; producción es `headless: true` en Railway con timing/rendering distinto.

### Bug 1 — ExtJS button selector (iter 1)
- **Sintoma:** Smoke iter 1 → "page.click: Timeout 5000ms waiting for `button:has-text(\"Buscar\")`"
- **Root cause:** ExtJS renderiza botones como `<table class="x-btn">`, NO como `<button>`. CSS selector `button:has-text(...)` solo matchea `<button>` tag, falla en ExtJS.
- **Fix iter 2 (commit `395bed5`):** Replicar el fallback chain del legacy `clickBuscar`: `button:has-text("Buscar")` → `button:has-text("Filtrar")` → `.x-btn:has-text("Buscar")` → ...

### Bug 2 — Combo trigger pattern (iter 1)
- **Sintoma:** Smoke iter 1 → "page.waitForSelector: Timeout 2000ms waiting for `.x-combo-list-item:visible`" (FLO/JUMBO/MEJORAS)
- **Root cause:** ExtJS combos se abren clickeando `.x-form-trigger` (la flechita lateral), NO el `<input>` directamente. Mi paradigm F hacía `page.click(comboInputSelector)` sin trigger.
- **Fix iter 2 (commit `395bed5`):** Replicar `openComboDropdown` del legacy — buscar `.x-form-trigger` primero, fallback al input. Bumped dropdown items timeout 2s → 6s.

### Bug 3 — Buscar button doesn't exist in this view (iter 2)
- **Sintoma:** Iter 2 con fallback chain agregada — TODAVÍA "Buscar button not found" para todas las sedes.
- **Diagnostic instrumentation (iter 3 commit `ac63dde`):** Dump page state INTO error message para inspect.
- **Root cause:** Diag reveló `buscarTexts: []` — la vista `listcitassimple` del portal Dentos **NO tiene visible Buscar button**. Solo "Nueva cita" + icon buttons + pagination toolbar.
- **Fix iter 3 (commit `fd9d285`):** Replicar el Enter-on-`#df_fecha` fallback del legacy. Sin Buscar button, presionar Enter sobre el date field triggerea el search.

### Bug 4 — extractCurrentPageRows column mapping (iter 3)
- **Sintoma:** Iter 3 → data llega pero CORRUPTA: `nombre: "Sin confirmar"` (estado), `estado: ""`. Solo 8 appointments de ~96 esperados.
- **Root cause:** Mi paradigm F usaba **índices fijos** `cells[1]/[3]/[5]/[7]/[9]` para hora/nombre/telefono/doctor/estado. El layout del grid ExtJS en headless prod varía. Cells[3] tenía estado, no nombre.
- **Fix iter 4 (commit `c2ccafc`):** Replicar el approach **heurístico por contenido** del legacy `extractAppointments`:
  - hora detectada por regex `/\d{1,2}:\d{2}\s*(AM|PM)?/`
  - telefono por regex `/\d{10,}/` con normalización CO mobile
  - nombre por filtro alfabético + has-space + NO-estado-keyword
  - estado por keyword match contra `['confirmada', 'cancelada', 'sin confirmar', ...]`
- **Selector cambiado:** `'table tbody tr'` (legacy stable) en vez de `'table.x-grid3-row-table'` (inner cache layer, duplicado en ExtJS DOM).

### Bug 5 — Pagination tolerance insuficiente (iter 3)
- **Sintoma:** Iter 3 smoke 2 → `PaginationStuckError` MEJORAS PUBLICAS at page 2/4.
- **Root cause:** `clickNextPageWithGuard` con `waitForFunction` timeout 5s + 1 retry no aguanta el latency variable de ExtJS en headless prod.
- **Fix iter 4 (commit `c2ccafc`):** timeout 5s → 12s; retry 1 → 2 (1s + 2s pauses); detection signal simplified a `pageInput.value` change only (más reliable que first-row content que puede coincidir entre páginas).

### Bug 6 — Cross-sede leak via grid no-refresh race (iter 4)
- **Sintoma:** Iter 4 — data correcta + paginación reliable, pero validator FAIL con `cross_sede_violations`: 17 phones de CABECERA aparecían como FLO o JUMBO según el smoke.
- **Root cause más insidioso del standalone:** `clickBuscarAndWait` waitForFunction chequeaba que first row tuviera cells[1] y cells[5] populadas — pero la previous CABECERA data **ya tenía** esas cells populadas. waitForFunction retornaba inmediato sin esperar al refresh del grid. `extractCurrentPageRows` leía CABECERA data, tagged como la sede del filter.
- **Fix iter 5 (commit `c952d98`):** **Fingerprint-guard pattern**. Capturar `firstRowFingerprint` BEFORE trigger search, esperar 10s hasta que CAMBIE (signal estructural de grid swap). Si no cambia (CABECERA skip-select o sede empty), timeout gracioso. Defensive settle 500ms → 1500ms.

### Bug 7 — Pagination boundary row duplicate (iter 5)
- **Sintoma:** Iter 5 PASS overlap + cross-sede invariantes, pero ratio CABECERA = 1.015 (67 unique vs 68 total = 1 dup).
- **Root cause:** ExtJS pagination occasionally returns una boundary row dos veces (último row page 1 == primer row page 2).
- **Fix iter 6 (commit `07c02e2`):** Defense-in-depth dedupe al final de `scrapeAppointments` por `(sucursal|telefono|hora)`. Server-action ya tenía D-12 dedupe pero validator chequea raw robot output.

## Decisiones empíricas tomadas durante ejecución

- **DISC-01 confirmado:** Flag name `use_new_godentist_scraping` (snake_case consistency con otros platform_config keys del repo).
- **Issue 3 fix Option A (post-research/pre-execute):** Paradigm A REMOVIDO del adapter en Plan 05. Flag OFF aborta nuevos scrapes con error explícito, NO fallback a `/api/scrape-appointments-legacy` (endpoint nunca creado). Rollback real = `git revert + redeploy`.
- **iter 4-6 timing:** 60s pause entre smokes (30s del plan insuficiente — robot serializa per workspaceId con scrape de ~70s en headless prod).
- **iter 6 dedupe:** Aunque server-action ya dedupea, agregar dedupe en robot evita validator FAIL en raw output + simplifica forensics (smoke JSON refleja exactamente lo que persiste).

## Patterns reusables para futuros standalones

1. **Interface-first task ordering** (Plans 03-04-05): scaffolding inerte → primitivas → wiring. Cada step con tsc gate. Reduce blast radius. **Reusable cuando:** rewrite estructural de módulo grande.

2. **Migration BLOQUEANTE manual per REGLA 5** (Plans 01-02): 2 plans dedicados solo a migration + confirmación verbal del usuario antes de Plans que referencien las columnas. **Reusable cuando:** cualquier feature con schema delta.

3. **Feature flag con default ON + kill-switch semantics** (Plan 02 + Plan 06): `platform_config` row + `getPlatformConfig` helper con cache 30s. Flag OFF aborta con error explícito (NO fallback) — rollback real = git revert. **Reusable cuando:** nuevo paradigma crítico sin path de fallback.

4. **Cross-sede canary como signal-not-workflow** (D-08, Plan 06): inconsistency detection que NUNCA debe disparar bajo paradigm correcto; si dispara = bug nuevo. Bloquea downstream + alerta developer (no operador). **Reusable cuando:** invariantes de negocio críticos donde recovery automático es peor que abortar.

5. **Smoke E2E con N≥5 + 3 invariantes** (Plans 10-11): timing-dependent bugs requieren confianza estadística. **Reusable cuando:** rewrite de scraping/automation que toca pagination/state-transitions.

6. **🆕 Pattern: Diagnostic-instrumentation-in-error-message** (iter 3 commit `ac63dde`): cuando no tienes acceso a Railway logs desde local, embed el page state (URL, title, buttons, regex-matched elements) INTO the error message → aparece en smoke JSON response. Vital para debug iterativo en headless prod sin CLI.

7. **🆕 Pattern: Fingerprint-guard for SPA state transitions** (iter 5 commit `c952d98`): cuando estás esperando un page state transition (filter change, navigation, modal open), capturar fingerprint ANTES + waitForFunction hasta que CAMBIE es más confiable que waitForFunction sobre "element existe con contenido". Las cells/elements pueden tener contenido stale del state anterior.

8. **🆕 Pattern: Heuristic-by-content extraction sobre fixed-index** (iter 4 commit `c2ccafc`): para grids/tables de portales 3rd-party con DOM versionado, identificar fields por **contenido (regex/keyword)** en vez de **posición (cell index)** sobrevive cambios de layout. Indices fijos son brittle; heurísticas son resilient.

## Pitfalls encontrados (research-grade)

- **`headless: false` local NO replica `headless: true` Railway prod.** Tres diferencias estructurales:
  1. ExtJS button selector `button:has-text(...)` falla en headless prod (ExtJS renders as `<table.x-btn>`)
  2. ExtJS combo opens via `.x-form-trigger` click (not input click) en headless prod
  3. ExtJS grid swap timing es más lento + variable en headless prod (10s timeout needed vs 2-5s en local)

  **Lección:** research-phase de cualquier robot Playwright DEBE incluir corrida en `headless: true` contra el mismo endpoint que producción para detectar selector/timing gaps. **No basta validar local headed.**

- **Portal Dentos `listcitassimple` no tiene Buscar button visible** — solo se descubrió via diagnostic instrumentation. Legacy `clickBuscar` siempre usaba el Enter-on-date-field fallback (los 6 button selectors siempre caían al else en prod). Sin diag, asumimos que algún selector matcheaba.

- **Grid refresh race** — incluso con assertFilterIs(hidden input value) ok, los rows VISIBLES pueden ser del state anterior. Hidden input se actualiza primero, grid body después. Fingerprint guard cierra el gap.

- **Pagination duplicates** — ExtJS PagingToolbar puede retornar la boundary row dos veces. Dedupe defense-in-depth es obligatorio para validator pass.

## Costo de tokens / contexto

- **Plans 01-10:** ~6 horas ejecución (parallel agents donde posible). Token estimate: ~150k input + 30k output.
- **Plan 11 iter loop (6 iters):** ~3 horas adicionales debug. Token estimate: ~80k input + 40k output (mucho contexto re-read entre iters).
- **Total standalone:** ~9 horas execution + ~7 horas research/discuss/plan-phase upstream. ~270k input tokens.

## Deuda técnica creada / resuelta

**Resuelta:**
- Bug productivo del 11-may + 13-may (cross-sede contamination + duplicados).
- Smoke E2E validator viejo con 2 invariantes — reemplazado por uno con 3.
- Adapter con paradigm A (1988 líneas) — limpiado a paradigm F (~1700 líneas).
- Research process gap: futuros standalones de robots Playwright requieren validación headless prod.

**Creada:**
- WhatsApp/email notification del canary D-08 quedó TODO V1.1 (analog a bold-upstream-broken).
- Si Godentist agrega una sede nueva: `SEDE_ID_MAP` requiere update manual + commit (no runtime discovery). Item P3.
- Endpoint legacy `/api/scrape-appointments-legacy` no existe — rollback del flag NO fetchea endpoint sino que el server-action retorna error explícito; rollback REAL = `git revert + redeploy`. Documentado en 06-SUMMARY.
- `clickBuscarAndWait` Enter-on-#df_fecha es un kludge — si Dentos cambia el form trigger, este fallback breaks. Backup item P3.

## Next steps potenciales

- **Standalone futuro:** runtime sede discovery fallback con cache (mitigación para "sede nueva sin update manual").
- **Standalone futuro:** WhatsApp/email alertas del canary D-08 (V1.1 del D-08).
- **Standalone futuro:** Cron nightly smoke E2E con alertas si falla (D-14 extension).
- **Standalone futuro:** UI badge "scraping health: OK/WARNING/DEGRADED" basado en histórico de canary fires.
- **Process improvement:** agregar a `gsd-phase-researcher` skill el mandato de incluir headless prod validation cuando el research es sobre Playwright/scraping.

## Referencias

- CONTEXT.md (D-01..D-15 lockeadas)
- RESEARCH.md (paradigm F validated 5/5 invariantes — pero en headless:false local; gap descubierto en Plan 11)
- PATTERNS.md (12 file analogs)
- SUMMARYs 01-SUMMARY a 10-SUMMARY.md (per-plan details)
- Debug original: `.planning/debug/godentist-cross-sede-recurrence.md`
- Standalone previo (parcial fix): `.planning/standalone/godentist-scraper-table-refresh-guard/`
- Smoke JSONs validados: `.planning/standalone/godentist-scraping-structural-v2/smoke-e2e/smoke_1.json..smoke_5.json` (iter 6)
- Hotfix commit chain: `395bed5` (iter 2) → `ac63dde` (iter 3 diag) → `fd9d285` (iter 3 Enter) → `c2ccafc` (iter 4 heuristic+pagination) → `c952d98` (iter 5 fingerprint) → `07c02e2` (iter 6 dedupe)
