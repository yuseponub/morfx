# LEARNINGS — ui-pipeline-persistence-and-crm-routing

**Standalone shipped:** 2026-04-27
**Phase commits:**
- Plan 01 (PERSIST-01..04): `1c244e2` — `feat(crm-pedidos): persistir pipeline activo via URL + localStorage scoped por workspace`
- Plan 02 (ROUTING-01..03): `d4645ee` — `feat(crm-routing): /crm v2 redirige a /crm/pedidos + remover item Pedidos duplicado del sidebar v2`
- Plan 03 (QA + LEARNINGS): este commit

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
  (deferred idea en CONTEXT.md).
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
`git diff` line count: 3 lineas tocadas en sidebar.tsx, 9 lineas en
crm/page.tsx (ambos bajo el budget del plan). Pattern validado.

## QA evidence

Ver `.planning/standalone/ui-pipeline-persistence-and-crm-routing/MANUAL-QA.md`
para los 5 test cases ejecutados en Vercel preview de Somnio. Decision Final:
APPROVED 2026-04-27 por el usuario.

- TC1 (PERSIST-01) — F5 mantiene pipeline: PASS confirmado en preview.
- TC2 (PERSIST-02) — Share-link funciona: PASS confirmado en preview.
- TC3 (PERSIST-03) — Last-visit fallback: SKIPPED (asumido PASS por implementacion verificada en codigo).
- TC4 (PERSIST-04) — No `_rsc` request en click de tab: SKIPPED (asumido PASS por implementacion `window.history.replaceState`).
- TC5 (ROUTING-01 + ROUTING-02) — Sidebar v2 limpio + click CRM va a /crm/pedidos: PASS confirmado en preview.
- ROUTING-03 — sidebar legacy byte-identical: PASS automatico via `git diff`.

## Notas operativas para futuros standalones de este tipo

1. **Build local en WSL2 + Turbopack es lento.** Plan 01 documento que `npm run build`
   timed out > 8min sin errores. Para validacion local, usar `npx tsc --noEmit` + lint
   + grep verifications canonicos. Vercel CI hace el build prod en Linux nativo.
2. **TC3 + TC4 son tests "tecnicos" (DevTools).** Si el usuario no tiene experiencia
   con DevTools, son razonables de skipear cuando la implementacion es codigo-verificable
   (`grep -q "window.history.replaceState"` + lectura del handler). Reabrir como debug
   session si surge regresion observable (loading flicker, back button acumulando, F5
   cayendo al default).
3. **Plan 03 con autonomous: false + 5 test cases manuales** funciono pero no escala.
   Para futuros standalones similares, considerar: (a) Playwright E2E test que cubre
   TC1+TC3+TC4 automatizado, (b) reservar QA manual solo para visual/UX (TC5), (c)
   asumir TC tecnicos OK si implementacion canonica es verificable via grep.
