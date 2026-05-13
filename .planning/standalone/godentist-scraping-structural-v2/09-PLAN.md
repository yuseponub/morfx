---
phase: godentist-scraping-structural-v2
plan: 09
type: execute
wave: 4
depends_on: [08]
files_modified:
  - src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx
autonomous: true
requirements:
  - D-04

must_haves:
  truths:
    - "confirmaciones-panel.tsx importa getScheduledRemindersGroupedByScrape + tipo ScrapeWithReminders desde @/app/actions/godentist"
    - "confirmaciones-panel.tsx importa AlertTriangle de lucide-react (para badge inconsistent)"
    - "El tab programacion tiene 2 vistas: list (cards-por-scrape) + detail (tabla flat per-scrape preserving date picker + cancelar-por-fila per D-04 + ui actual)"
    - "Cada card muestra: timestamp del scrape (es-CO America/Bogota), badge scraped_date, badge total reminders, badges sucursales, badges agregados {pending, sent, failed, cancelled}, badge rojo inconsistent (AlertTriangle) si scrape.inconsistent === true"
    - "Existe seccion Orphans (Sin scrape origen) para reminders huerfanos (legacy data)"
    - "loadReminders viejo (flat) NO se llama mas en el tab programacion (reemplazado por loadGrouped)"
    - "TypeScript + Next.js build pasa sin errores"
  artifacts:
    - path: "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"
      provides: "Tab programacion rediseñado con cards-por-scrape + detail view + orphans bucket"
      contains:
        - "getScheduledRemindersGroupedByScrape"
        - "ScrapeWithReminders"
        - "AlertTriangle"
        - "setGrouped"
        - "setOrphans"
        - "setProgView"
        - "scrape.inconsistent"
        - "Sin scrape origen"
  key_links:
    - from: "confirmaciones-panel.tsx tab programacion (rediseñado)"
      to: "getScheduledRemindersGroupedByScrape server action (Plan 08)"
      via: "import + call en useEffect"
      pattern: "await getScheduledRemindersGroupedByScrape"
    - from: "Card inconsistent badge"
      to: "scrape.inconsistent column (Plan 01 migration + Plan 06 server-action write)"
      via: "props read from ScrapeWithReminders.scrape.inconsistent"
      pattern: "scrape.inconsistent"
---

<objective>
Rediseñar el tab "programacion" en `confirmaciones-panel.tsx` (lineas 798-880+) de flat-list a cards-por-scrape replicando el patron del tab "Historial Confirmaciones" (lineas 680-792). CONTEXT.md D-04 mandato verbatim del usuario:

> "muestre cada scrape por individual aparte de los recordatorios (revisar historial confirmaciones y replicar + ui actual)"

El "+ ui actual" es preservar dentro del detail-view: date picker + tabla flat actual + cancelar-por-fila.

Estructura del rediseno:
- **Vista list (default):** cards-por-scrape (mirror exacto del patron history tab §704-756), cada card con timestamp + badge fecha + badge total + badges sucursales + badges stats (pending/sent/failed/cancelled) + badge rojo `AlertTriangle inconsistent` si D-08 disparo + boton "Ver detalle".
- **Vista detail:** tabla flat actual (preserved per D-04 "+ ui actual") con date picker + cancelar-por-fila. Header con boton "Volver" al list view.
- **Seccion Orphans:** "Sin scrape origen (legacy)" para reminders con `scrape_history_id IS NULL`.

Purpose: Habilitar post-mortem visual sin SQL. CONTEXT.md cita literalmente: "el #2 no lo voy a hacer manual malparido" — el usuario rechaza ir a SQL para diagnosticar; necesita UI.

Output: ~150 lineas modificadas/agregadas en confirmaciones-panel.tsx. El tab programacion pasa de ~80 lineas flat a ~220 lineas con 2 vistas. Sin commit todavia.
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
<!-- Plan 08 exports -->
- `import { getScheduledRemindersGroupedByScrape, type ScrapeWithReminders, type ScheduledReminderEntry } from '@/app/actions/godentist'`

<!-- Existing tab history pattern (lines 672-792) — MIRROR EXACT per D-04 -->
<!-- Cards-loop structure: -->
```tsx
{historyEntries.map(entry => (
  <Card key={entry.id} className="hover:bg-muted/30 transition-colors">
    <CardContent className="pt-4 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {new Date(entry.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
            </span>
          </div>
          <Badge variant="secondary">Fecha: {entry.scraped_date}</Badge>
          <Badge variant="outline">{entry.total_appointments} citas</Badge>
          {/* etc */}
        </div>
        <Button variant="outline" size="sm" onClick={() => ...}>
          <Eye className="mr-1 h-3 w-3" /> Ver
        </Button>
      </div>
    </CardContent>
  </Card>
))}
```

<!-- Existing tab programacion structure (lines 798-880+, current — to be REDISEÑADO) -->
- Date picker (line 807-812 approx) — PRESERVE inside detail view
- Section "Pendientes" with flat table (nombre/telefono/hora_cita/hora_envio/sucursal/cancel) — PRESERVE as detail-view body
- Section "Historial enviados" (presumably below) — PRESERVE inside detail view OR include in stats agregados

<!-- loadReminders state pattern (lines 122-140 current) -->
```typescript
const [reminders, setReminders] = useState<ScheduledReminderEntry[]>([])
const loadReminders = async (date: string) => {
  setLoading(true)
  const result = await getScheduledReminders(date)
  if (result.error) toast.error(result.error)
  else setReminders(result.data || [])
  setLoading(false)
}
```

<!-- handleCancelReminder existing (preserve inside detail view) -->
<!-- cancellingId state (preserve) -->

<!-- Existing imports to extend -->
```typescript
import { Loader2, Clock, Eye, RotateCcw, Calendar } from 'lucide-react'
// ADD AlertTriangle for inconsistent badge
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extender imports y agregar state para el rediseño del tab programacion</name>

  <read_first>
    - src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx lineas 1-50 (imports completos)
    - src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx lineas 60-140 (state declarations + loadReminders + handleCancelReminder)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §7 (snippet verbatim)
  </read_first>

  <files>src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx</files>

  <action>
**Cambio 1 — Imports (line ~5-15):**

Localizar la linea de import desde `lucide-react`. Agregar `AlertTriangle`:
```typescript
import { Loader2, Clock, Eye, RotateCcw, Calendar, AlertTriangle } from 'lucide-react'
```

Localizar la linea de import desde `@/app/actions/godentist`. Agregar las 2 exports nuevas:
```typescript
import {
  // ...existing imports (e.g. getScheduledReminders, scrapeAppointments, sendConfirmations, etc.),
  getScheduledRemindersGroupedByScrape,
  type ScrapeWithReminders,
} from '@/app/actions/godentist'
```

NOTA: si ya hay un `import type { ScheduledReminderEntry }` separado, mantenerlo. Si no, ScheduledReminderEntry debe estar en el mismo import.

**Cambio 2 — State declarations (cerca de linea 60-72 donde estan las existentes):**

Insertar despues del state de `reminders` existente:
```typescript
// ── Programacion tab (rediseñado D-04): cards-por-scrape ──
const [grouped, setGrouped] = useState<ScrapeWithReminders[]>([])
const [orphans, setOrphans] = useState<ScheduledReminderEntry[]>([])
const [progView, setProgView] = useState<'list' | 'detail'>('list')
const [selectedProgEntry, setSelectedProgEntry] = useState<ScrapeWithReminders | null>(null)
const [loadingGrouped, setLoadingGrouped] = useState(false)
```

**Cambio 3 — Nueva funcion loadGrouped (cerca de loadReminders existente):**

Insertar despues del existing `loadReminders`:
```typescript
const loadGrouped = async (date?: string) => {
  setLoadingGrouped(true)
  const result = await getScheduledRemindersGroupedByScrape(date || undefined)
  if (result.error) {
    toast.error(result.error)
    setGrouped([])
    setOrphans([])
  } else {
    setGrouped(result.data || [])
    setOrphans(result.orphans || [])
  }
  setLoadingGrouped(false)
}
```

**Cambio 4 — useEffect (o equivalente) para cargar al cambiar a tab programacion:**

Localizar el useEffect que activa loadReminders cuando `activeTab === 'programacion'` (probable cerca de linea 110-150). Reemplazar la llamada a `loadReminders(reminderDate)` por `loadGrouped(reminderDate)` cuando el tab activo es programacion.

**Style notes:**
- Indent matchea el resto del archivo (probablemente 2 espacios).
- Punto y coma final (consistente con el archivo).
- State names en camelCase.
  </action>

  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | tee /tmp/tsc-09-1.log | head -20; STATUS=$?; grep -c "AlertTriangle" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "getScheduledRemindersGroupedByScrape" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "ScrapeWithReminders" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "setGrouped\|setOrphans\|setProgView\|setSelectedProgEntry" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "loadGrouped" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `npx tsc --noEmit` retorna exit code 0.
    - `grep -c "AlertTriangle" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna al menos `1` (import).
    - `grep -c "getScheduledRemindersGroupedByScrape" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna al menos `2` (import + call).
    - `grep -c "type ScrapeWithReminders" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna al menos `1` (import).
    - State declarations presentes: `grep -c "const \[grouped, setGrouped\]" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` = 1 AND `grep -c "const \[orphans, setOrphans\]" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` = 1 AND `grep -c "const \[progView, setProgView\]" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` = 1.
    - loadGrouped funcion presente: `grep -c "const loadGrouped = async" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna `1`.
  </acceptance_criteria>

  <done>
    Imports + state + loadGrouped agregados. tsc pasa. El tab UI aun no esta rediseñado (Task 2 lo hace) pero el cableado esta listo.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Rediseñar el JSX del tab programacion con cards-por-scrape + detail view + orphans</name>

  <read_first>
    - src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx lineas 672-792 (tab history — pattern MIRROR EXACT)
    - src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx lineas 798-880+ (tab programacion actual — para preservar table flat dentro del detail view)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §7 (snippet completo del rediseño)
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md D-04 (mandato literal + "+ ui actual")
  </read_first>

  <files>src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx</files>

  <action>
**Localizar el JSX del tab programacion** (busque `activeTab === 'programacion'` o equivalente, probable linea ~798-880+). El contenido actual es:
- Date picker
- Section "Pendientes" tabla flat
- Section "Historial enviados" tabla flat

**Reemplazar el contenido del bloque del tab programacion con la siguiente estructura de 2 vistas:**

```tsx
{activeTab === 'programacion' && (
  <div className="space-y-4">
    {progView === 'list' && (
      <>
        {/* Header: refresh + date picker preserved per D-04 "+ ui actual" */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={reminderDate}
              onChange={e => { setReminderDate(e.target.value); loadGrouped(e.target.value) }}
              className="border rounded px-2 py-1 text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => loadGrouped(reminderDate)} disabled={loadingGrouped}>
              {loadingGrouped ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* Cards-por-scrape — MIRROR EXACT of history tab pattern */}
        {loadingGrouped && grouped.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Cargando scrapes...
          </div>
        ) : grouped.length === 0 && orphans.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay reminders programados para esta fecha.
          </div>
        ) : (
          <>
            {grouped.map(entry => (
              <Card key={entry.scrape.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {new Date(entry.scrape.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                        </span>
                      </div>
                      <Badge variant="secondary">Fecha: {entry.scrape.scraped_date}</Badge>
                      <Badge variant="outline">{entry.reminders.length} reminders</Badge>
                      <div className="flex gap-1">
                        {entry.scrape.sucursales.map(s => (
                          <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                      {entry.stats.pending > 0 && <Badge variant="default" className="bg-blue-600">{entry.stats.pending} pendientes</Badge>}
                      {entry.stats.sent > 0 && <Badge variant="default" className="bg-green-600">{entry.stats.sent} sent</Badge>}
                      {entry.stats.failed > 0 && <Badge variant="destructive">{entry.stats.failed} failed</Badge>}
                      {entry.stats.cancelled > 0 && <Badge variant="outline">{entry.stats.cancelled} cancelled</Badge>}
                      {entry.scrape.inconsistent && (
                        <Badge variant="destructive" className="bg-red-700">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          inconsistent
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSelectedProgEntry(entry); setProgView('detail') }}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        Ver detalle
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Orphans bucket: reminders sin scrape origen (legacy data pre-Plan 01) */}
            {orphans.length > 0 && (
              <>
                <div className="mt-6 pt-4 border-t">
                  <p className="text-sm font-medium text-muted-foreground">Sin scrape origen ({orphans.length} reminders legacy)</p>
                </div>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2">Nombre</th>
                            <th className="py-2">Teléfono</th>
                            <th className="py-2">Hora cita</th>
                            <th className="py-2">Sucursal</th>
                            <th className="py-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orphans.map(r => (
                            <tr key={r.id} className="border-b">
                              <td className="py-2">{r.nombre}</td>
                              <td className="py-2">{r.telefono}</td>
                              <td className="py-2">{r.hora_cita}</td>
                              <td className="py-2">{r.sucursal}</td>
                              <td className="py-2">{r.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </>
    )}

    {progView === 'detail' && selectedProgEntry && (
      <>
        {/* Detail view header: back button + scrape metadata */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <Button variant="outline" size="sm" onClick={() => { setProgView('list'); setSelectedProgEntry(null) }}>
            ← Volver
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">Scrape: {new Date(selectedProgEntry.scrape.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</Badge>
            <Badge variant="outline">Fecha cita: {selectedProgEntry.scrape.scraped_date}</Badge>
            <Badge variant="outline">{selectedProgEntry.reminders.length} reminders</Badge>
            {selectedProgEntry.scrape.inconsistent && (
              <Badge variant="destructive" className="bg-red-700">
                <AlertTriangle className="h-3 w-3 mr-1" />
                inconsistent
              </Badge>
            )}
          </div>
        </div>

        {/* Detail view body: tabla flat (preserves D-04 "+ ui actual") */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Nombre</th>
                    <th className="py-2">Teléfono</th>
                    <th className="py-2">Hora cita</th>
                    <th className="py-2">Hora envío</th>
                    <th className="py-2">Sucursal</th>
                    <th className="py-2">Estado</th>
                    <th className="py-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProgEntry.reminders.map(r => (
                    <tr key={r.id} className="border-b">
                      <td className="py-2">{r.nombre}</td>
                      <td className="py-2">{r.telefono}</td>
                      <td className="py-2">{r.hora_cita}</td>
                      <td className="py-2">{new Date(r.scheduled_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="py-2">{r.sucursal}</td>
                      <td className="py-2">{r.status}</td>
                      <td className="py-2">
                        {r.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={cancellingId === r.id}
                            onClick={() => handleCancelReminder(r.id)}
                          >
                            {cancellingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Cancelar'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Inconsistency details (D-08) if applicable */}
        {selectedProgEntry.scrape.inconsistent && selectedProgEntry.scrape.inconsistency_details && (
          <Card className="border-red-700 bg-red-50 dark:bg-red-950/20">
            <CardHeader>
              <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Diagnóstico cross-sede (D-08 canary)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(selectedProgEntry.scrape.inconsistency_details, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </>
    )}
  </div>
)}
```

**IMPORTANTE — handleCancelReminder refresh:**

Tras un cancel exitoso, el detail-view debe refrescar el grouped state. Localizar `handleCancelReminder` existente y, despues del SET en la tabla cancelled (o donde sea que se actualice el state), agregar:
```typescript
// Refresh grouped after cancel
await loadGrouped(reminderDate)
// Si esta en detail view, refresh selectedProgEntry desde el grouped recargado
if (progView === 'detail' && selectedProgEntry) {
  const refreshed = grouped.find(g => g.scrape.id === selectedProgEntry.scrape.id)
  if (refreshed) setSelectedProgEntry(refreshed)
}
```

NOTA: la llamada async despues del setState del grouped puede tener race con el selectedProgEntry refresh — se acepta como trade-off menor (toast.success ya provee feedback inmediato; refresh de grouped es eventual). Si afecta UX, refactor a loadGroupedAndUpdateSelected helper.

**Eliminar:**
- El bloque viejo del tab programacion (las 2 secciones "Pendientes" + "Historial enviados" flat tables). Se reemplazan por la estructura de arriba.
- El useState `reminders` SOLO si no se usa en otros tabs (verificar con grep antes de eliminar). Probable que se mantenga para compatibilidad si otros tabs lo usan.

**Style notes:**
- Indent del archivo (probable 2 espacios; JSX 2 espacios).
- Tailwind classes verbatim del history tab pattern.
- toLocaleString('es-CO', { timeZone: 'America/Bogota' }) obligatorio (CLAUDE.md REGLA 2).
- `lucide-react` icons consistentes con el resto del file.
  </action>

  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | tee /tmp/tsc-09-2.log | head -30; STATUS=$?; grep -c "progView === 'list'" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "progView === 'detail'" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "entry.scrape.inconsistent" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "Sin scrape origen" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "Ver detalle" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; grep -c "Diagnóstico cross-sede" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `npx tsc --noEmit` retorna exit code 0.
    - List view existe: `grep -c "progView === 'list'" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna `1`.
    - Detail view existe: `grep -c "progView === 'detail'" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna `1`.
    - Cards map por scrape: `grep -c "grouped.map(entry =>" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna `1`.
    - Inconsistent badge presente: `grep -c "entry.scrape.inconsistent &&" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna al menos `1`.
    - Orphans section presente: `grep -c "Sin scrape origen" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna `1`.
    - "Ver detalle" button: `grep -c "Ver detalle" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna al menos `1`.
    - Date picker preservado dentro del list view: `grep -c "type=\"date\"" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna al menos `1`.
    - America/Bogota tz: `grep -c "timeZone: 'America/Bogota'" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna al menos `2` (card + detail).
    - inconsistency_details rendered: `grep -c "Diagnóstico cross-sede" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna `1`.
    - handleCancelReminder preserved: `grep -c "handleCancelReminder" "src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx"` retorna al menos `2` (declaracion + call inside detail).
  </acceptance_criteria>

  <done>
    Tab programacion rediseñado con cards-por-scrape (list) + tabla flat preservada (detail) + orphans bucket + inconsistency diagnóstico view. tsc pasa.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| UI client <-> Server action | Llamada existente a Plan 08 getScheduledRemindersGroupedByScrape. Sin nueva HTTP surface. |
| UI client <-> Browser | Sin cookies nuevas. Sin localStorage. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-09-01 | Information disclosure | inconsistency_details JSONB visible al operador (PII: phones) | accept | Operador es el dueno del workspace. Misma surface que pacientes en otros tabs (Confirmaciones/Historial). |
| T-v2-09-02 | Cross-site scripting | JSON.stringify del inconsistency_details rendered como <pre> | mitigate | React JSX auto-escapa text content. JSON.stringify produce string seguro. Sin dangerouslySetInnerHTML. |
| T-v2-09-03 | Repudiation | Detail view muestra timestamps + ids | accept | Audit trail visible al operador. Aceptable. |
</threat_model>

<verification>
- npx tsc --noEmit pasa.
- next build pasa (verificacion local opcional: `npm run build`).
- Tab programacion tiene 2 vistas + orphans + inconsistency diagnostic.
- Cards mirror exact del history tab pattern (D-04).
- America/Bogota TZ en todos los timestamps (REGLA 2).
</verification>

<success_criteria>
- [ ] Task 1: Imports + state + loadGrouped agregados.
- [ ] Task 2: Tab programacion rediseñado con cards + detail + orphans.
- [ ] tsc --noEmit pasa.
- [ ] Sin push a Vercel todavia (push unificado en Plan 11).
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/09-SUMMARY.md` con:
- Lista de cambios en confirmaciones-panel.tsx.
- Linea ranges de las nuevas vistas (list/detail).
- Output tsc --noEmit.
- Screenshot opcional de cómo se ve el tab (si npm run dev funcional).
- Nota: "Plans 10+11 (smoke E2E + deploy) cierran el standalone."
</output>
</content>
</invoke>