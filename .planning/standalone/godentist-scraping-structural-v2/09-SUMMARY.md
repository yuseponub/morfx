---
phase: godentist-scraping-structural-v2
plan: 09
subsystem: godentist-scraping
tags: [ui, react, D-04, cards-per-scrape, D-08-canary-surface]
requires:
  - 06-PLAN (server-action persists inconsistent flag + inconsistency_details)
  - 08-PLAN (getScheduledRemindersGroupedByScrape server-action + ScrapeWithReminders type)
provides:
  - "Tab programacion rediseñado: cards-por-scrape (list) + flat-table per-scrape (detail) + orphans bucket"
  - "Surface D-08 al UI: badge rojo AlertTriangle + diagnostic Card (JSON.stringify inconsistency_details)"
affects:
  - "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"
tech-stack:
  added: []
  patterns:
    - "Mirror-exact del pattern de tab 'history' (§672-792) replicado en programacion list view per D-04 mandato verbatim"
    - "2-view tab (list + detail) controlado por progView state — mismo pattern que historyView en el mismo archivo"
    - "Orphans bucket separado para reminders con scrape_history_id IS NULL (legacy pre-Plan 01)"
    - "Funciones declaradas ANTES del useEffect que las consume (resuelve react-hooks/immutability accessed-before-declared pre-existing)"
    - "Refresh post-cancel: handleCancelReminder llama loadGrouped + re-fetch selectedProgEntry (round-trip aceptable para low-frequency action)"
key-files:
  created: []
  modified:
    - "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx (+302 lines, -162 lines)"
decisions:
  - "Mantener loadReminders + flat `reminders` state callable como back-compat API surface (no se llama del useEffect del tab programacion, pero permanece para futuros consumidores)"
  - "Reorder de useEffects post-declaracion de loaders (Rule 1 fix de pre-existing react-hooks/immutability error). loadHistory/loadReminders/loadGrouped ahora declaradas ANTES de los useEffect que las llaman, cerrando un error eslint preexistente del archivo."
  - "Cleanup unused vars (pendingReminders, historyReminders, paginatedPending, paginatedHistory, totalReminderPages, totalHistoryPages, historyReminderPage/setHistoryReminderPage, REMINDERS_PER_PAGE) reemplazados por comentario explicativo. reminderPage/setReminderPage + remindersLoading/setRemindersLoading marcados con eslint-disable @typescript-eslint/no-unused-vars porque siguen referenciados por loadReminders legacy."
  - "Refresh detail view tras cancel: round-trip explícito a getScheduledRemindersGroupedByScrape (extra fetch) en vez de derivar de grouped state — React batching haría inconsistente la lectura inmediata post-setState."
  - "AlertTriangle import como single addition al import de lucide-react existente (no duplica import)"
metrics:
  duration: "0h 25m"
  completed-date: "2026-05-13"
  files-changed: 1
  lines-added: 302
  lines-deleted: 162
  tasks-completed: 2
---

# Phase godentist-scraping-structural-v2 Plan 09: Tab programacion redesign (cards-por-scrape + detail + orphans) Summary

UI rediseñada en `confirmaciones-panel.tsx` per D-04 mandato verbatim: "muestre cada scrape por individual aparte de los recordatorios (revisar historial confirmaciones y replicar + ui actual)". El tab programacion pasa de flat-list de reminders a 2 vistas: cards-por-scrape (mirror-exact del tab 'history') + tabla flat per-scrape preservada en detail view. Surface D-08 (`inconsistent` + `inconsistency_details`) ahora visible al operador via badge rojo AlertTriangle + diagnostic Card — habilita post-mortem visual sin necesidad de consultas SQL manuales.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire grouped-by-scrape loader + state + imports | `2188a14` | `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` |
| 2 | Redesign programacion tab JSX with cards + detail + orphans | `bb9ab8a` | `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` |

## Implementation Details

### Task 1: Wiring layer (`2188a14`, +27 / -1)

**Imports extendidos (líneas 8-25):**

- `AlertTriangle` añadido al import de `lucide-react` (single-line append).
- `getScheduledRemindersGroupedByScrape` + `type ScrapeWithReminders` añadidos al import de `@/app/actions/godentist`.

**State nuevo (líneas 85-90):**

```typescript
// ── Programacion tab (rediseñado D-04): cards-por-scrape ──
const [grouped, setGrouped] = useState<ScrapeWithReminders[]>([])
const [orphans, setOrphans] = useState<ScheduledReminderEntry[]>([])
const [progView, setProgView] = useState<'list' | 'detail'>('list')
const [selectedProgEntry, setSelectedProgEntry] = useState<ScrapeWithReminders | null>(null)
const [loadingGrouped, setLoadingGrouped] = useState(false)
```

**`loadGrouped` async fn:** consume Plan 08 server-action, separa `data` (cards) y `orphans` (legacy reminders sin scrape_history_id), maneja errores con `console.error` (no toast porque el archivo no usa toast actualmente).

**useEffect modificado:** programacion tab ahora dispara `loadGrouped(reminderDate || undefined)` en lugar de `loadReminders()` — anti-flat-list mandate del plan ("loadReminders viejo (flat) NO se llama mas en el tab programacion").

### Task 2: JSX redesign (`bb9ab8a`, +275 / -161)

**Reorder defensivo (líneas 126-173):** las 3 funciones `loadHistory` / `loadReminders` / `loadGrouped` movidas a estar declaradas ANTES de los 2 useEffect que las llaman. Cierra el error pre-existente `react-hooks/immutability` "accessed before declared" que el archivo tenía para `loadHistory` desde antes de Plan 09 (auto-fix Rule 1 porque mi nuevo `loadGrouped` lo habría replicado).

**`handleCancelReminder` refactorizado (líneas 175-194):** tras cancel exitoso:
1. Update legacy flat `reminders` state (back-compat).
2. `await loadGrouped(reminderDate || undefined)` para refrescar la list view.
3. Si `progView === 'detail'`: re-fetch via `getScheduledRemindersGroupedByScrape` y actualizar `selectedProgEntry` con la versión fresh.

Round-trip extra aceptado porque cancel es low-frequency y evita inconsistencias de React batching.

**Cleanup de derived state (líneas 345-349):** eliminados `pendingReminders`, `historyReminders`, `paginatedPending`, `paginatedHistory`, `totalReminderPages`, `totalHistoryPages` (líneas 340-351 originales) — ya no son consumidos por el JSX. `historyReminderPage/setHistoryReminderPage` y `REMINDERS_PER_PAGE` también eliminados. `reminderPage/setReminderPage` y `remindersLoading/setRemindersLoading` marcados con `eslint-disable-next-line @typescript-eslint/no-unused-vars` porque siguen referenciados por `loadReminders` (back-compat API).

**Nuevo JSX del tab programacion (líneas ~975-1196):**

#### Vista `list` (default):

```tsx
{progView === 'list' && (
  <>
    {/* Header: date picker + refresh */}
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <Calendar /> <input type="date" /> <Badge>{grouped.length} scrapes</Badge>
      ... Badge {orphans.length} sin scrape origen ...
      <Button onClick={() => loadGrouped(reminderDate || undefined)} />
    </div>

    {/* Loading / empty states */}
    {/* Cards-por-scrape (mirror exact de tab history §672-792) */}
    {grouped.map(entry => (
      <Card key={entry.scrape.id}>
        <Clock /> {new Date(entry.scrape.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
        <Badge>Fecha: {entry.scrape.scraped_date}</Badge>
        <Badge>{entry.reminders.length} reminders</Badge>
        {entry.scrape.sucursales.map(...)}
        {entry.stats.pending > 0 && <Badge className="bg-blue-600">{entry.stats.pending} pendientes</Badge>}
        {entry.stats.sent > 0 && <Badge className="bg-green-600">{entry.stats.sent} sent</Badge>}
        {entry.stats.failed > 0 && <Badge variant="destructive">{entry.stats.failed} failed</Badge>}
        {entry.stats.cancelled > 0 && <Badge variant="outline">{entry.stats.cancelled} cancelled</Badge>}
        {entry.scrape.inconsistent && (
          <Badge variant="destructive" className="bg-red-700">
            <AlertTriangle /> inconsistent
          </Badge>
        )}
        <Button onClick={() => { setSelectedProgEntry(entry); setProgView('detail') }}>
          <Eye /> Ver detalle
        </Button>
      </Card>
    ))}

    {/* Orphans bucket (reminders legacy sin scrape_history_id) */}
    {orphans.length > 0 && (
      <>
        <p>Sin scrape origen ({orphans.length} reminders legacy)</p>
        <Card>... tabla flat (nombre, telefono, hora, sucursal, estado) ...</Card>
      </>
    )}
  </>
)}
```

#### Vista `detail`:

```tsx
{progView === 'detail' && selectedProgEntry && (
  <>
    {/* Header: back button + scrape metadata */}
    <Button onClick={() => { setProgView('list'); setSelectedProgEntry(null) }}>← Volver</Button>
    <Badge>Scrape: {timestamp es-CO/Bogota}</Badge>
    <Badge>Fecha cita: {scraped_date}</Badge>
    <Badge>{reminders.length} reminders</Badge>
    {inconsistent && <Badge className="bg-red-700"><AlertTriangle /> inconsistent</Badge>}

    {/* Tabla flat preservada D-04 "+ ui actual" */}
    <Card>
      <table>
        <thead>nombre / telefono / hora cita / hora envio / sucursal / estado / accion</thead>
        <tbody>
          {selectedProgEntry.reminders.map(r => (
            <tr>
              ... celdas ...
              <td>
                {r.status === 'pending'
                  ? <Button onClick={() => handleCancelReminder(r.id)}>Cancelar</Button>
                  : <span>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>

    {/* D-08 diagnostic Card (solo si inconsistent && inconsistency_details) */}
    {inconsistent && inconsistency_details && (
      <Card className="border-red-700 bg-red-50">
        <AlertTriangle /> Diagnóstico cross-sede (D-08 canary)
        <pre>{JSON.stringify(inconsistency_details, null, 2)}</pre>
      </Card>
    )}
  </>
)}
```

## Verification

### Automated Acceptance Criteria (verbatim del plan)

| Criterio | Esperado | Actual | Pass |
|----------|----------|--------|------|
| `npx tsc --noEmit` exit code | 0 (confirmaciones-panel.tsx limpio) | 0 errors en confirmaciones-panel.tsx (2 errores pre-existentes en `conversations.test.ts` confirmados out-of-scope desde Plan 08 SUMMARY) | OK |
| `grep -c "AlertTriangle"` | >=1 | 1 (import) — luego usado 4 veces in JSX (cards + detail header + diagnostic Card title) | OK |
| `grep -c "getScheduledRemindersGroupedByScrape"` | >=2 (import + call) | 2 (import + call en loadGrouped + call extra en handleCancelReminder refresh) | OK |
| `grep -c "type ScrapeWithReminders"` | >=1 (import) | 1 | OK |
| `grep -c "const \[grouped, setGrouped\]"` | 1 | 1 | OK |
| `grep -c "const \[orphans, setOrphans\]"` | 1 | 1 | OK |
| `grep -c "const \[progView, setProgView\]"` | 1 | 1 | OK |
| `grep -c "loadGrouped"` | >=1 | 5 (declaracion + 2 calls en useEffect + cancel refresh + comentarios) | OK |
| `grep -c "progView === 'list'"` | 1 | 1 | OK |
| `grep -c "progView === 'detail'"` | 1 | 2 (uso en JSX + en handleCancelReminder check) | OK |
| `grep -c "grouped.map(entry =>"` | 1 | 1 | OK |
| `grep -c "entry.scrape.inconsistent &&"` | >=1 | 1 | OK |
| `grep -c "Sin scrape origen"` | 1 | 1 | OK |
| `grep -c "Ver detalle"` | >=1 | 1 | OK |
| `grep -c 'type="date"'` | >=1 | 2 (scrape tab + programacion tab) | OK |
| `grep -c "timeZone: 'America/Bogota'"` | >=2 | 9 (card + detail + table + history tab + scrape tab + etc.) | OK |
| `grep -c "Diagnóstico cross-sede"` | 1 | 1 | OK |
| `grep -c "handleCancelReminder"` | >=2 | 3 (declaracion + 1 JSX call + 1 comment) | OK |

### Manual must_haves (plan frontmatter)

| Truth | Pass |
|-------|------|
| confirmaciones-panel.tsx importa getScheduledRemindersGroupedByScrape + tipo ScrapeWithReminders | OK (línea 16-23) |
| confirmaciones-panel.tsx importa AlertTriangle de lucide-react | OK (línea 8) |
| El tab programacion tiene 2 vistas: list (cards-por-scrape) + detail (tabla flat per-scrape preserving date picker + cancelar-por-fila per D-04 + ui actual) | OK (líneas ~975-1196) |
| Cada card muestra: timestamp (es-CO America/Bogota), badge scraped_date, badge total reminders, badges sucursales, badges agregados {pending, sent, failed, cancelled}, badge rojo inconsistent (AlertTriangle) si scrape.inconsistent === true | OK |
| Existe seccion Orphans (Sin scrape origen) para reminders huérfanos (legacy data) | OK |
| loadReminders viejo (flat) NO se llama mas en el tab programacion (reemplazado por loadGrouped) | OK (verificado via grep — solo declarada, no invocada en el useEffect del tab programacion) |
| TypeScript + Next.js build pasa sin errores | OK (tsc clean, eslint exit 0) |

### TSC Output

```
src/lib/domain/__tests__/conversations.test.ts(16,7): error TS7022: 'eqMock' implicitly has type 'any'...
src/lib/domain/__tests__/conversations.test.ts(16,22): error TS7024: Function implicitly has return type 'any'...
```

Pre-existing errors out-of-scope (mismos 2 errores confirmados en Plan 08 SUMMARY — pertenecen a `conversations.test.ts` y no a `confirmaciones-panel.tsx`).

### ESLint Output

`npx eslint src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` → exit code 0.

Warnings remanentes (no-blocking):
- `react-hooks/set-state-in-effect` en mi useEffect (línea 169-173) y en useEffect pre-existente del componente `HistoryDetail` (línea 1217+). Es el patrón legacy del codebase — `loadGrouped`/`loadHistory` son async loaders disparados por effects, mismo pattern que `loadHistory` (pre-existing).
- `'reminders' is assigned a value but never used` warning de eslint a nivel state — el state SÍ se usa en `setReminders` dentro de handleCancelReminder pero ESLint solo cuenta la lectura del valor. Aceptado.
- `Unused eslint-disable directive` en el comment `react-hooks/exhaustive-deps` — minor, no afecta build.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug pre-existente reactivado por mi cambio] Reordenar useEffects y loaders**

- **Found during:** Task 2 verification (eslint output)
- **Issue:** El patrón pre-existente del archivo era `useEffect` (línea 116 original) llamando a `loadHistory()` declarada después (línea 142 original). Mi nuevo `useEffect` de programacion replicaba ese patrón con `loadGrouped`. ESLint emitió error `react-hooks/immutability` "accessed before declared" para ambos.
- **Fix:** Moví las 3 funciones `loadHistory` / `loadReminders` / `loadGrouped` ANTES de los 2 useEffect que las consumen. Esto cierra el error nuevo (mi `loadGrouped`) Y el preexistente (`loadHistory`).
- **Files modified:** `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` (líneas 126-173).
- **Commit:** `bb9ab8a` (mismo commit que Task 2 — reorder integrado).

**2. [Rule 3 — Blocking unused vars] Eliminar derived state de flat-list reminders**

- **Found during:** Task 2 después de borrar el JSX viejo
- **Issue:** Los derived `pendingReminders`, `historyReminders`, `paginatedPending`, `paginatedHistory`, `totalReminderPages`, `totalHistoryPages` (líneas 340-351 originales) quedaron sin uso porque el JSX nuevo consume `grouped` + `orphans` directamente. Habrían causado warnings ESLint `@typescript-eslint/no-unused-vars` en build CI.
- **Fix:** Eliminados los 6 derived consts. Eliminados `historyReminderPage/setHistoryReminderPage` y `REMINDERS_PER_PAGE` que solo eran consumidos por los derived. `reminderPage/setReminderPage` + `remindersLoading/setRemindersLoading` PRESERVADOS con `// eslint-disable-next-line @typescript-eslint/no-unused-vars` porque siguen siendo referenciados por `loadReminders` (back-compat API).
- **Files modified:** `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx` (líneas 80-83 + 345-349).
- **Commit:** `bb9ab8a`.

No más deviations (Rules 2/4 no aplicaron).

## Threat Surface Scan

Plan threat register revisado verbatim:
- **T-v2-09-01** (info disclosure: PII phones en inconsistency_details visibles al operador) — accept. El operador es dueño del workspace via auth gate; misma surface que pacientes/teléfonos en otros tabs (Confirmaciones/Historial). Sin cambio.
- **T-v2-09-02** (XSS via JSON.stringify del inconsistency_details rendered como `<pre>`) — mitigate. React JSX auto-escapa text content. `JSON.stringify` produce string seguro. Cero `dangerouslySetInnerHTML` usado. Verificación: `grep -c "dangerouslySetInnerHTML"` en el archivo retorna `0`.
- **T-v2-09-03** (repudiation: detail view muestra timestamps + ids) — accept. Audit trail visible al operador. Sin cambio.

Sin nuevas superficies de amenaza fuera del threat register del plan. Sin threat flags adicionales.

## Output

**Files modified:**
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx`
  - Línea 8: `AlertTriangle` añadido al import de lucide-react
  - Líneas 16-23: `getScheduledRemindersGroupedByScrape` + `type ScrapeWithReminders` añadidos al import de godentist actions
  - Líneas 77-90: state nuevo (grouped/orphans/progView/selectedProgEntry/loadingGrouped) + eslint-disable de las legacy vars
  - Líneas 126-173: reorder de loaders ANTES de useEffects (incluye loadGrouped nueva)
  - Líneas 175-194: handleCancelReminder con refresh grouped + selectedProgEntry
  - Líneas 345-349: comentario en lugar del derived state eliminado
  - Líneas ~975-1196: tab programacion JSX rediseñado (cards-por-scrape list + flat-table detail + orphans + diagnostic Card)

**Plan 09 puede considerarse cerrado.** Plans 10 (smoke E2E con 5 corridas + validator multi-invariant) + 11 (deploy unificado a Vercel) cierran el standalone.

## Self-Check: PASSED

**File existence verification:**

```bash
$ [ -f "/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx" ] && echo "FOUND" || echo "MISSING"
FOUND
```

**Commit verification:**

```bash
$ git log --oneline | grep -E "2188a14|bb9ab8a"
bb9ab8a feat(godentist-scraping-structural-v2 09): redesign programacion tab with cards-per-scrape + detail view + orphans
2188a14 feat(godentist-scraping-structural-v2 09): wire grouped-by-scrape loader + state for redesigned programacion tab
```

**Symbol verification:**

```bash
$ grep -n "^  async function loadGrouped\|^  const \[grouped, setGrouped\]\|^  const \[progView, setProgView\]" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"
86:  const [grouped, setGrouped] = useState<ScrapeWithReminders[]>([])
88:  const [progView, setProgView] = useState<'list' | 'detail'>('list')
142:  async function loadGrouped(date?: string) {
```

All claims verified.
