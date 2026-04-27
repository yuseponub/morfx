---
phase: ui-pipeline-persistence-and-crm-routing
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md
  - .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md
autonomous: false  # human runs the 5 manual QA cases on Vercel preview deploy
requirements_addressed: [PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04, ROUTING-01, ROUTING-02, ROUTING-03]
user_setup: []

must_haves:
  truths:
    - "MANUAL-QA.md existe con los 5 test cases de CONTEXT D-11 detallados, cada uno con: precondicion, pasos exactos, resultado esperado, espacio para PASS/FAIL/notas."
    - "Usuario corrio los 5 test cases en Vercel preview deploy (post Plan 01 + Plan 02 push) en workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) con `ui_dashboard_v2.enabled=true`. Resultados pegados verbatim en MANUAL-QA.md."
    - "Si CUALQUIER test case falla: standalone se PAUSA, se documenta el gap en MANUAL-QA.md, y NO se cierra el standalone hasta que se decida (a) parche en plan adicional, (b) defer a deferred ideas, o (c) revertir."
    - "Si los 5 PASS: LEARNINGS.md existe con el patron documentado: 'URL state via window.history.replaceState avoids RSC re-fetch in Next 16; localStorage scoped por workspace via key prefix; Suspense boundary requirement para useSearchParams en client en prod build de Next 16'."
    - "MANUAL-QA.md y LEARNINGS.md committed en `main` (no push extra requerido — son docs en `.planning/`)."
    - "Test case 4 (no `_rsc` request en click de tab) verificable via DevTools Network panel — el resultado esperado documentado claramente: cero requests con `_rsc=` query param o cero peticiones a `/crm/pedidos` durante la interaccion con tabs (Pitfall 1 mitigation evidence)."
  artifacts:
    - path: ".planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md"
      provides: "5 test cases ejecutables (CONTEXT D-11), resultados pegados por el usuario, decision PASS/FAIL final del standalone."
      contains: "Test Case 1: F5"
    - path: ".planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md"
      provides: "Patron documentado del standalone para reusar en futuros projects: URL state + localStorage hibrido + Suspense + replaceState shallow URL update."
      contains: "window.history.replaceState"
  key_links:
    - from: "MANUAL-QA.md test cases"
      to: "Vercel preview deploy del workspace Somnio (post Plan 01 + Plan 02 push)"
      via: "human runs in browser DevTools + visual inspection"
      pattern: "ui_dashboard_v2"
    - from: "LEARNINGS.md"
      to: "Future standalones / phases que necesiten URL state pattern (Next 16 idiom)"
      via: "documentation reference"
      pattern: "replaceState"
---

<objective>
Wave 2 — Manual QA + LEARNINGS. Captura evidencia humana de que los 7 requirements (PERSIST-01..04 + ROUTING-01..03) funcionan en Vercel preview con Somnio workspace + v2 flag activo. Documenta el patron en LEARNINGS.md para reuso futuro.

Purpose: el codigo de Plan 01 + Plan 02 ya esta en `main` y pusheado a Vercel. Falta validacion humana visual + DevTools (D-11 explicitamente waivea automated tests por ser logica de navegacion + persistencia low-risk). Este plan tambien cierra el standalone capturando learnings.

Output: 2 archivos en `.planning/standalone/ui-pipeline-persistence-and-crm-routing/`:
1. `MANUAL-QA.md` — checklist con resultados PASS/FAIL pegados por el usuario.
2. `LEARNINGS.md` — patron documentado.

**No code changes. No `git push origin main` extra requerido** (los docs en `.planning/` se committean pero no afectan deploy de Vercel).

**CRITICAL — depends_on [01, 02]:** este plan NO arranca hasta que Plan 01 Y Plan 02 hayan pusheado. Vercel necesita ambos commits para que el preview deploy refleje el comportamiento esperado. Si Plan 01 esta pusheado pero Plan 02 no, los test cases ROUTING-01..03 fallaran.

**CRITICAL — workspace de QA:** TODOS los test cases corren en workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) porque es el unico con `ui_dashboard_v2.enabled=true` (verificable via `getIsDashboardV2Enabled(workspaceId)` o consultando `workspaces.settings`). Si el flag no esta activo en Somnio post-deploy, escalar antes de correr QA.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md  # §D-11 (5 test cases listados textualmente — copiar verbatim al MANUAL-QA.md), §D-12 (no DB migrations), §D-13 (Regla 6 spirit)
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md  # §Validation Architecture §Phase Requirements -> Test Map (mapa de los 7 IDs a manual checks), §Common Pitfalls 1 (no `_rsc` request — verificable en DevTools Network)
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/01-PLAN.md  # plan dependiente — confirmar que pusheo
@.planning/standalone/ui-pipeline-persistence-and-crm-routing/02-PLAN.md  # plan dependiente — confirmar que pusheo
@CLAUDE.md  # Regla 0 (GSD complete — no shortcuts en QA), Regla 4 (LEARNINGS al completar fase es OBLIGATORIO)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear MANUAL-QA.md con los 5 test cases detallados (CONTEXT D-11)</name>
  <read_first>
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md §D-11 (5 test cases listados — extraer textualmente)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Validation Architecture §Phase Requirements -> Test Map (lineas 796-810 — mapa de cada Req ID a su check)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Pitfalls 1 (verificacion de `_rsc` request — text claro)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/01-PLAN.md (verificar que el commit hash esta en `01-SUMMARY.md`)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/02-PLAN.md (verificar que el commit hash esta en `02-SUMMARY.md`)
  </read_first>
  <action>
    **Paso 1 — Verificar que Plan 01 y Plan 02 ya pusheraon a `main`:**
    ```bash
    git log --oneline -10 | grep -E 'feat\(crm-pedidos\)|feat\(crm-routing\)'
    ```
    Esperado: 2 commits, uno por cada plan. Si falta alguno, PAUSAR este plan hasta que el dependant haya pusheado.

    Verificar Vercel deploy preview URL (si Vercel CLI/MCP disponible):
    ```bash
    git log -1 --format=%H
    ```
    Pasar el SHA al usuario para que confirme via Vercel dashboard que el deploy paso.

    **Paso 2 — Crear `.planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md`** con el siguiente template literal (D-11 verbatim):

    ```markdown
    # Manual QA — ui-pipeline-persistence-and-crm-routing

    **Standalone:** ui-pipeline-persistence-and-crm-routing
    **Fecha de QA:** <YYYY-MM-DD HH:MM America/Bogota>
    **Tester:** <username>
    **Build base:** Vercel preview deploy de commit <SHA-pegar-de-Plan-01-o-Plan-02>
    **Workspace:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`)
    **Flag activo:** `ui_dashboard_v2.enabled=true` (confirmar antes de correr tests)

    ---

    ## Pre-condiciones

    - [ ] Plan 01 commit pusheado a `main` (commit hash: ___)
    - [ ] Plan 02 commit pusheado a `main` (commit hash: ___)
    - [ ] Vercel preview deploy pasa los checks de build (verde en Vercel dashboard)
    - [ ] Login al workspace Somnio confirmado (cookie `morfx_workspace=a3843b3f-c337-4836-92b5-89c58bb98490`)
    - [ ] `ui_dashboard_v2.enabled=true` confirmado (verificable visitando `/dashboard` y observando layout v2 editorial)

    ---

    ## Test Case 1 (PERSIST-01): F5 mantiene pipeline activo

    **Precondicion:** Estoy en `/crm/pedidos`, viendo el pipeline default (Sales o el primero del workspace).

    **Pasos:**
    1. Click en una pestaña de pipeline secundario (ej. "Logistica" si existe, o cualquier pipeline que NO sea el default).
    2. Observar que el kanban cambia y muestra los stages del nuevo pipeline.
    3. Verificar que la URL en la barra del navegador ahora incluye `?pipeline=<uuid>` (donde uuid es el id del pipeline secundario).
    4. Apretar F5 (o Ctrl+R).

    **Resultado esperado:** El kanban sigue mostrando el pipeline secundario (NO vuelve al default). La URL conserva `?pipeline=<uuid>`.

    **Resultado actual:** [PASS / FAIL]
    **Notas:** ___

    ---

    ## Test Case 2 (PERSIST-02): Share-link funciona

    **Precondicion:** Tengo abierto `/crm/pedidos?pipeline=<uuid>` en una sesion (workspace Somnio). Mi compañero del MISMO workspace abre un browser distinto / incognito.

    **Pasos:**
    1. Copiar la URL completa del browser (incluyendo `?pipeline=<uuid>`).
    2. Pegar la URL en el browser del compañero, asegurando que esta logueado al mismo workspace Somnio.
    3. Esperar a que cargue.

    **Resultado esperado:** El kanban del compañero muestra el mismo pipeline activo que el tuyo. Si el `<uuid>` corresponde a un pipeline que existe en el workspace Somnio, el kanban arranca con ese pipeline (NO con el default).

    **Resultado actual:** [PASS / FAIL]
    **Notas:** ___

    ---

    ## Test Case 3 (PERSIST-03): Last-visit fallback via localStorage

    **Precondicion:** Acabo de switchear a un pipeline secundario en `/crm/pedidos` (ej. "Recompra"). La URL muestra `?pipeline=<uuid-recompra>`.

    **Pasos:**
    1. Verificar en DevTools > Application > Local Storage > `<origin>` que la key `morfx_active_pipeline:a3843b3f-c337-4836-92b5-89c58bb98490` tiene el `<uuid-recompra>` como value.
    2. Navegar fuera (ej. `/whatsapp`).
    3. Volver a `/crm/pedidos` (sin query params — pegar la URL `https://<preview>/crm/pedidos`).

    **Resultado esperado:** El kanban arranca con el pipeline de "Recompra" (no con el default). La URL se actualiza a `/crm/pedidos?pipeline=<uuid-recompra>` automaticamente (history.replaceState — no nueva entrada en browser history).

    **Resultado actual:** [PASS / FAIL]
    **Notas:** ___

    ---

    ## Test Case 4 (PERSIST-04): Click en tab NO dispara `_rsc` request (Pitfall 1 mitigation)

    **Precondicion:** Estoy en `/crm/pedidos`. DevTools abierto, panel Network, filtro `_rsc` o `pedidos`.

    **Pasos:**
    1. Limpiar el panel Network (clear existing logs).
    2. Click en una pestaña de pipeline diferente.
    3. Observar el panel Network durante el click + 2 segundos.

    **Resultado esperado:** CERO requests a `/crm/pedidos?_rsc=...` o cualquier RSC payload fetch. Lo unico que se observa son requests al backend de telemetria si esta activa, pero NUNCA un fetch del page mismo.

    El kanban cambia visualmente (filtra orders por el nuevo pipeline_id) pero el cambio es client-side puro.

    **Resultado actual:** [PASS / FAIL]
    **Notas (especificar exactamente que requests se vieron, si los hubo):** ___

    ---

    ## Test Case 5 (ROUTING-01 + ROUTING-02): Sidebar CRM va a /crm/pedidos + sin item duplicado

    **Precondicion:** Estoy en cualquier pagina del dashboard v2 (ej. `/whatsapp`).

    **Pasos:**
    1. Abrir el sidebar (si esta colapsado).
    2. Buscar la categoria "Operación".
    3. Verificar visualmente los items de esa categoria.
    4. Click en "CRM".

    **Resultado esperado:**
    - **ROUTING-02 visual:** la categoria "Operación" tiene exactamente 5 items, en orden: CRM, WhatsApp, Tareas, Confirmaciones, SMS. NO hay un item separado "Pedidos" entre WhatsApp y Tareas (eliminado D-08).
    - **ROUTING-01:** click en "CRM" lleva directamente a `/crm/pedidos` (la URL final es `/crm/pedidos`, NO `/crm/contactos`).

    **Resultado actual:** [PASS / FAIL — separar ROUTING-01 vs ROUTING-02 si fallan diferente]
    **Notas:** ___

    ---

    ## Verificacion adicional (ROUTING-03 — Regla 6 spirit)

    Esto se verifica via `git diff` automaticamente en Plan 02 Task 3 — no requiere QA visual. Pero si quieres una verificacion extra:

    **Pasos:**
    1. Localmente, correr:
       ```bash
       git diff main^ -- src/components/layout/sidebar.tsx | grep -E '^[+-]' | grep -v '^[+-]{3}' | wc -l
       ```
    2. Esperado: 3-4 lineas cambiadas (1-2 import + 1 deletion linea 146).
    3. Si excede 4, hubo cambio fuera de scope.

    **Resultado actual:** [PASS / FAIL]
    **Lineas cambiadas:** ___

    ---

    ## Decision Final del Standalone

    - [ ] **APPROVED — Los 7 requirements (PERSIST-01..04 + ROUTING-01..03) PASS.** Proceder a Task 2 (LEARNINGS.md).
    - [ ] **REJECTED — Algun test case FAIL.** Listar abajo cuales, y decidir: (a) parche en plan 04 adicional, (b) defer a deferred ideas en CONTEXT.md, o (c) revertir Plan 01/02.

    **Decision:** ___

    **Tester signature + timestamp:** ___
    ```

    **Paso 3 — Pedir al usuario que corra los 5 test cases** en el Vercel preview deploy del workspace Somnio:

    > Por favor:
    > 1. Confirma que los 2 commits (Plan 01 + Plan 02) estan en `main` y que Vercel preview deploy paso (verde en Vercel dashboard).
    > 2. Login al workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) en el preview URL.
    > 3. Confirma que `ui_dashboard_v2.enabled=true` esta activo (visualmente: layout editorial v2 visible en `/dashboard`).
    > 4. Corre los 5 test cases descritos arriba en MANUAL-QA.md.
    > 5. Pega los resultados PASS/FAIL + notas dentro de cada Test Case.
    > 6. Marca la "Decision Final" al final.
    > 7. Si todos PASS: respondeme "QA aprobado" y procedo a Task 2 (LEARNINGS.md).
    > 8. Si algo FAIL: describe el comportamiento observado vs esperado y decidimos juntos parche, defer, o revert.

    **Paso 4 — Esperar el resultado del usuario (no commit hasta que el usuario confirme).**

    **Paso 5 — Una vez el usuario pegue los resultados Y marque la Decision Final:**
    ```bash
    git add .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md
    git commit -m "$(cat <<'EOF'
    docs(ui-pipeline-persistence-and-crm-routing): manual QA results — <APPROVED|REJECTED>

    5 test cases ejecutados en Vercel preview de commits Plan 01 + Plan 02 sobre
    workspace Somnio con ui_dashboard_v2.enabled=true. Resultados pegados verbatim.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    ```

    Si el resultado es APPROVED, proceder a Task 2. Si es REJECTED, escalar al usuario antes de Task 2.
  </action>
  <verify>
    <automated>test -f .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "Test Case 1 (PERSIST-01): F5" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "Test Case 2 (PERSIST-02): Share-link" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "Test Case 3 (PERSIST-03): Last-visit fallback" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "Test Case 4 (PERSIST-04)" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "Test Case 5 (ROUTING-01" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "ROUTING-03" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "_rsc" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "morfx_active_pipeline:a3843b3f-c337-4836-92b5-89c58bb98490" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>grep -q "Decision Final" .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(ui-pipeline-persistence-and-crm-routing): manual QA results"</automated>
    <automated>! grep -q '\[PASS / FAIL\]' .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md || ! grep -q '___$' .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md</automated>
  </verify>
  <acceptance_criteria>
    - `MANUAL-QA.md` existe con los 5 test cases listados (PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04, ROUTING-01+ROUTING-02 combinado en TC5) + verificacion ROUTING-03.
    - Cada test case tiene: Precondicion, Pasos numerados, Resultado esperado, espacio para "Resultado actual" + "Notas".
    - El test case 4 (no `_rsc` request) tiene instrucciones claras para DevTools Network panel.
    - El test case 3 menciona la key exacta `morfx_active_pipeline:a3843b3f-c337-4836-92b5-89c58bb98490`.
    - Existe seccion "Decision Final" con 2 checkboxes (APPROVED / REJECTED) y espacio para tester signature + timestamp.
    - El usuario corrio los 5 test cases en Vercel preview deploy y pego los resultados verbatim.
    - Una de las 2 checkboxes de "Decision Final" esta marcada.
    - Si REJECTED: razones documentadas en notas; siguiente accion (parche / defer / revert) decidida con el usuario antes de Task 2.
    - Commit atomico con mensaje empezando con `docs(ui-pipeline-persistence-and-crm-routing): manual QA results`.
  </acceptance_criteria>
  <done>
    - MANUAL-QA.md committed con resultados reales del usuario.
    - Si APPROVED: avanzar a Task 2.
    - Si REJECTED: pausar standalone, escalar.
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear LEARNINGS.md (solo si Task 1 APPROVED) — Regla 4 + best practices del patron Next 16 URL state</name>
  <read_first>
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md (confirmar Decision Final = APPROVED antes de proceder)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §State of the Art (lineas 736-748 — old vs current approaches)
    - .planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md §Pitfalls 1-6 (lineas 408-449)
    - CLAUDE.md §Regla 4 (LEARNINGS al completar fase)
  </read_first>
  <action>
    **Paso 1 — Si Task 1 Decision Final = APPROVED, proceder. Si REJECTED, ESCALAR al usuario antes de continuar.**

    **Paso 2 — Crear `.planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md`** con el siguiente contenido literal:

    ```markdown
    # LEARNINGS — ui-pipeline-persistence-and-crm-routing

    **Standalone shipped:** <YYYY-MM-DD>
    **Phase commits:**
    - Plan 01 (PERSIST-01..04): `<sha-de-feat(crm-pedidos)>`
    - Plan 02 (ROUTING-01..03): `<sha-de-feat(crm-routing)>`
    - Plan 03 (QA + LEARNINGS): `<sha-de-este-commit>`

    ## Patron documentado: URL state hibrido en Next 16 App Router

    ### Problem

    State de UI que debe sobrevivir a F5, ser shareable via URL, y recordar la
    ultima eleccion del usuario "next visit" — sin pegarle al server cada vez
    que el usuario interactua.

    Caso concreto: pipeline activo en `/crm/pedidos`. Server hace `Promise.all`
    de 4 fetches caros (`getOrders`, `getPipelines`, `getActiveProducts`,
    `getTagsForScope`); ninguno depende del pipeline activo, asi que cambiar
    de pipeline en UI NO debe re-disparar esos fetches.

    ### Solution

    **Stack hibrido URL + localStorage + window.history.replaceState:**

    1. **Server (RSC `page.tsx`):** lee `searchParams: Promise<{...}>` (Next 15+/16
       async idiom), valida contra el array de la fuente de verdad upstream
       (RLS-filtered ya), y resuelve un `defaultPipelineId` que pasa como prop al
       client. Wrap en `<Suspense fallback={null}>` defensivo (Next 16 prerender
       enforcement de `useSearchParams`).

    2. **Client handler (`useCallback`):** estado React + `localStorage.setItem(KEY, value)`
       scoped por workspace + `window.history.replaceState(null, '', new_url)`.
       NO `router.push`/`router.replace` — replaceState integra con Next.js Router
       (per Next 16.2.4 docs) sin re-fetch RSC.

    3. **Client hydration effect (`useEffect` empty deps, one-shot post-mount):**
       solo dispara cuando la URL NO trae query param (= primera visita o
       navegacion desde sidebar). Lee localStorage, valida contra el array,
       hace `setState` + `replaceState`. `eslint-disable-next-line
       react-hooks/exhaustive-deps` documenta intencion.

    ### Why NOT...

    - **`router.replace(url, { scroll: false })`:** dispara RSC re-fetch — para
      pages con `Promise.all` cara, esto es desastroso (loading flicker + server
      load). USAR replaceState.
    - **localStorage en `useState` initializer:** SSR-unsafe (`ReferenceError:
      localStorage is not defined`). SIEMPRE en `useEffect` post-mount.
    - **`searchParams` en deps + `router.replace` adentro:** infinite loop
      verificado en github.com/vercel/next.js/discussions/46616. replaceState
      lo evita porque no cambia la referencia de useSearchParams en el ciclo
      de render que dispara el effect.
    - **Custom `useUrlState` / `usePersistedState` hooks:** zero existing en el
      codebase; el codebase usa inline `useEffect` + try/catch para localStorage
      (existing pattern en orders-view.tsx:434-476). Stay consistent — no
      introducir nueva abstraccion para 1 callsite.
    - **Cookie + server action:** roundtrip per click. localStorage es sync,
      zero-roundtrip, per-device. Per-user-per-device sync via DB es deferido
      (deferred idea D-deferred en CONTEXT.md).
    - **Suspense boundary skip:** Next 16 prod build puede fallar con
      "Missing Suspense boundary with useSearchParams" o degradar la ruta a CSR.
      Wrap defensivo siempre.

    ### Workspace scoping

    `localStorage.setItem('morfx_active_pipeline:' + workspaceId, value)`. Si
    `workspaceId === null`, skip (early return). RAZON: localStorage es
    per-origin, NO per-workspace; usuario con multi-workspace puede ver el
    pipeline X de workspace-A en workspace-B sin scoping → silent leak de
    affordance UI. Validacion contra `pipelines[]` (RLS upstream) cubre el
    caso de pipeline borrado/movido, pero el flicker es evitable con scoping.

    ### Re-usable across the codebase

    Aplicable en cualquier pagina del dashboard donde:
    - Una preferencia client-only debe persistir entre sesiones.
    - El server fetch de la pagina NO depende del valor de la preferencia.
    - El user beneficia de share-link (URL es source of truth) Y "ultima visita"
      (localStorage fallback).

    Ejemplos donde podriamos aplicarlo en el futuro:
    - View mode toggles (kanban / list) — ya lo hacemos con localStorage solo,
      podriamos sumarle URL para shareable views.
    - Filter selections (selectedStageId, selectedTagIds) — actualmente solo
      React state, pero shareable + persistent seria valor.
    - Sort field / direction — actualmente localStorage solo.

    ### Anti-pattern detectado y evitado

    Si en algun futuro standalone aparece la tentacion de un "useUrlState" hook
    custom, recordar: el codebase ya tiene 4+ inline localStorage handlers
    (`orders-view.tsx`, `pipeline-tabs.tsx`) — un nuevo hook agrega review
    burden para zero-call-sites adicionales. Inline el patron y comentalo.

    ### References

    - Next.js 16.2.4 docs: `nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api`
    - Next.js 16 useSearchParams Suspense: `nextjs.org/docs/app/api-reference/functions/use-search-params`
    - GitHub: github.com/vercel/next.js/discussions/46616 (router.replace useEffect loop pitfall)
    - This standalone:
      - `.planning/standalone/ui-pipeline-persistence-and-crm-routing/CONTEXT.md` (decisiones D-01..D-13)
      - `.planning/standalone/ui-pipeline-persistence-and-crm-routing/RESEARCH.md` (pitfalls 1-6 + code examples)
      - `.planning/standalone/ui-pipeline-persistence-and-crm-routing/PATTERNS.md` (analog map vs codebase)

    ## Bug fix collateral: D-13 Regla 6 spirit aplicado fuera de scope canonical

    Aunque Regla 6 (CLAUDE.md) literal aplica solo a agentes en produccion, su
    principio "byte-identical fail-closed para el branch que NO se toca" se
    aplico aqui al sidebar legacy (`navItems[]` lineas 44-122 de sidebar.tsx)
    y a la rama `v2=false` de `crm/page.tsx`. Verificacion automatica via
    `git diff` line count: <= 4 lineas tocadas en sidebar.tsx, <= 12 en
    crm/page.tsx. Pattern validado.

    ## QA evidence

    Ver `.planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md`
    para los 5 test cases ejecutados en Vercel preview de Somnio + resultados
    PASS/FAIL del usuario.
    ```

    **Paso 3 — Reemplazar los placeholders del LEARNINGS.md:**
    - `<YYYY-MM-DD>`: fecha actual de hoy.
    - `<sha-de-feat(crm-pedidos)>`: SHA del commit de Plan 01 (verificable via `git log --oneline | grep "feat(crm-pedidos)"`).
    - `<sha-de-feat(crm-routing)>`: SHA del commit de Plan 02 (verificable via `git log --oneline | grep "feat(crm-routing)"`).
    - `<sha-de-este-commit>`: dejar como `pending` antes del commit; reemplazar con el SHA real DESPUES del commit (en un commit amend opcional o un follow-up).

    Para auto-resolver:
    ```bash
    PLAN01_SHA=$(git log --oneline | grep "feat(crm-pedidos)" | head -1 | awk '{print $1}')
    PLAN02_SHA=$(git log --oneline | grep "feat(crm-routing)" | head -1 | awk '{print $1}')
    DATE_TODAY=$(date +%Y-%m-%d)
    echo "Plan 01 SHA: $PLAN01_SHA"
    echo "Plan 02 SHA: $PLAN02_SHA"
    echo "Today: $DATE_TODAY"
    # Editar LEARNINGS.md sustituyendo los placeholders.
    ```

    **Paso 4 — Commit atomico:**
    ```bash
    git add .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md
    git commit -m "$(cat <<'EOF'
    docs(ui-pipeline-persistence-and-crm-routing): LEARNINGS — patron URL state hibrido Next 16

    Cierra el standalone documentando el patron canonico:
    - Server reads searchParams: Promise<{...}> (Next 15+/16 async)
    - Client handler: state + localStorage scoped + window.history.replaceState
    - Hydration effect: empty deps post-mount, one-shot
    - Suspense wrapper defensivo
    - Scoping localStorage por workspace para evitar leak cross-workspace

    Reusable en futuras paginas del dashboard que necesiten share-link + last-visit
    sin disparar RSC re-fetch.

    Regla 4 satisfecha — LEARNINGS.md committed al cerrar la fase.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    EOF
    )"
    ```

    **Paso 5 — NO push extra requerido.** Los archivos en `.planning/` se sincronizan con el remote junto con cualquier futuro push, pero NO afectan el deploy de Vercel.

    Sin embargo, si el usuario lo prefiere, hacer un push final del trio:
    ```bash
    git push origin main
    ```
  </action>
  <verify>
    <automated>test -f .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md</automated>
    <automated>grep -q "Patron documentado: URL state hibrido en Next 16 App Router" .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md</automated>
    <automated>grep -q "window.history.replaceState" .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md</automated>
    <automated>grep -q "Workspace scoping" .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md</automated>
    <automated>grep -q "Why NOT" .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md</automated>
    <automated>grep -q "Anti-pattern detectado" .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md</automated>
    <automated>! grep -q "<YYYY-MM-DD>" .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md</automated>
    <automated>! grep -q "<sha-de-feat" .planning/standalone/ui-pipeline-persistence-and-crm-routing/LEARNINGS.md</automated>
    <automated>git log -1 --format=%s | grep -qF "docs(ui-pipeline-persistence-and-crm-routing): LEARNINGS"</automated>
    <automated>git log -1 --format=%b | grep -q "Co-Authored-By: Claude"</automated>
  </verify>
  <acceptance_criteria>
    - `LEARNINGS.md` existe en el directorio del standalone.
    - Contiene secciones: Problem, Solution (3-step stack), Why NOT (4 anti-options), Workspace scoping, Re-usable across the codebase, Anti-pattern detectado y evitado, References, QA evidence pointer.
    - Los placeholders `<YYYY-MM-DD>`, `<sha-de-feat(...)>`, etc. estan reemplazados con valores reales (verificable via `! grep`).
    - Los 2 SHAs (Plan 01 + Plan 02) coinciden con los commits reales (auto-extraidos via `git log`).
    - Commit atomico con mensaje empezando con `docs(ui-pipeline-persistence-and-crm-routing): LEARNINGS`.
    - Mensaje incluye `Co-Authored-By: Claude` (per rules).
    - Solo se ejecuta este Task si Task 1 Decision Final = APPROVED.
  </acceptance_criteria>
  <done>
    - LEARNINGS.md documentado, committed, y referencia los SHAs reales de Plans 01 + 02.
    - Standalone cerrado.
  </done>
</task>

</tasks>

<verification>
- MANUAL-QA.md existe con los 5 test cases detallados + resultados pegados por el usuario + Decision Final marcada.
- Si Decision = APPROVED, LEARNINGS.md existe con el patron documentado y referencias a CONTEXT/RESEARCH/PATTERNS + SHAs de los commits de codigo.
- Ambos archivos committed en `main` con mensajes en espanol y Co-Authored-By Claude.
- Ningun cambio de codigo (solo `.planning/` updates).
- Si Decision = REJECTED, standalone PAUSADO antes de Task 2 — escalar al usuario.
</verification>

<success_criteria>
- Los 7 requirements (PERSIST-01..04 + ROUTING-01..03) verificados manualmente en Vercel preview de Somnio.
- Patron de URL state hibrido documentado para reuso futuro (Regla 4 satisfecha).
- Standalone `ui-pipeline-persistence-and-crm-routing` listo para marcar como completed en STATE.md / MEMORY.md.
- Si algun test FAIL, el siguiente paso (parche / defer / revert) esta documentado en MANUAL-QA.md notas.
</success_criteria>

<output>
Despues de completar, crear `.planning/standalone/ui-pipeline-persistence-and-crm-routing/03-SUMMARY.md` documentando:
- Decision Final del MANUAL-QA.md (APPROVED / REJECTED).
- Resumen de PASS/FAIL por test case (5 lineas).
- Si APPROVED: confirmacion de que LEARNINGS.md fue creado y committed con SHAs correctos.
- Si REJECTED: razones, siguiente accion decidida (parche en plan 04 / defer / revert), y propietario de la accion.
- Commit hashes de los 1-2 commits de este plan.
- Confirmacion final: "Standalone ui-pipeline-persistence-and-crm-routing — <SHIPPED | PAUSED>".
</output>
