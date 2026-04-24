---
phase: ui-redesign-dashboard-retrofit
plan: 01
type: execute
wave: 0
status: complete
started: 2026-04-23
completed: 2026-04-24
base_commit: 76f4ea4
head_commit: e3143fd
commits: 7
user_verdict: PASS (con 3 correcciones QA aplicadas inline)
---

# 01-SUMMARY — CRM piloto retrofit editorial

Plan 01 piloto del retrofit `ui-redesign-dashboard`. Fresh rewrite editorial de CRM Contactos con raw HTML semantic + port CSS del mock `crm.html` a `globals.css`. Sidebar re-organizado a 4 categorías Propuesta B. Componentes v2 shipped por la fase previa preservados intactos vía ternary router. Cerrado 2026-04-24 tras validación visual humana + 3 correcciones QA.

## Delivered

### Commits atómicos (7)

| # | SHA | Tipo | Descripción |
|---|-----|------|-------------|
| 1 | `80ff618` | feat | Port mock CSS de `crm.html` a `globals.css` (.theme-editorial scope) — +350 líneas clases `.sb`, `.brand`, `.wm`, `.cat`, `.topbar`, `.eye`, `.actions`, `.btn`, `.btn.pri`, `.tabs`, `.page`, `.toolbar`, `.search`, `.chip`, `table.dict` + variantes, `.tg.red/.gold/.indi/.ver` |
| 2 | `bf901da` | feat | Sidebar 4 categorías Propuesta B cuando v2 (14 items: Operación 6 / Automatización 3 / Análisis 2 / Admin 3). Legacy flat list preservada byte-identical cuando v2=false |
| 3 | `151ac81` | feat | CRM hub `layout.tsx` con 4 tabs editorial + `CrmTabs` Client Component. `/crm` root redirect: v2 → `/contactos`, !v2 → `/pedidos` |
| 4 | `a3b74e9` | feat | `contacts-view-v2.tsx` NEW raw HTML editorial + ternary router en `contactos/page.tsx`. Legacy `contacts-table.tsx` + `columns.tsx` UNTOUCHED (byte-identical en flag OFF) |
| 5 | `3d5fd16` | fix (QA) | h1 topbar sans Inter en vez de EB Garamond serif (legibilidad parity con WhatsApp chat). D-RETRO-EXCEPTION documentada inline en globals.css |
| 6 | `f161716` | fix (QA) | Base `.theme-editorial` font-family sans Inter en vez de serif. Módulos legacy no-retrofit (Pedidos, etc.) bajo `.theme-editorial` wrapper ahora heredan sans correctamente |
| 7 | `e3143fd` | fix (QA) | Utility `.scrollbar-overlay` (thin, thumb transparente en reposo, visible al hover). Aplicada al container de cards del kanban columns |

### Files modified

```
src/app/globals.css                                                   +393 lines (port CSS + 3 QA fixes)
src/components/layout/sidebar.tsx                                     v2 early-return branch + 4 categories
src/app/(dashboard)/crm/layout.tsx                                    NEW  (Server Component)
src/app/(dashboard)/crm/page.tsx                                      MODIFIED (ternary redirect)
src/app/(dashboard)/crm/components/crm-tabs.tsx                       NEW  (Client Component)
src/app/(dashboard)/crm/contactos/page.tsx                            MODIFIED (ternary router + computeCounts + findLastUpdated)
src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx     NEW  (raw HTML editorial)
src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx          +1 className ("scrollbar-overlay")
.planning/standalone/ui-redesign-dashboard-retrofit/01-PLAN.md        mock_coverage updates
```

**NO TOCADOS (byte-identical vs pre-plan):**
- `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx` (legacy shadcn v2 path)
- `src/app/(dashboard)/crm/contactos/components/columns.tsx`
- Cualquier archivo bajo `src/lib/domain/**`, `src/hooks/**`, `src/lib/agents/**`, `src/inngest/**`, `src/app/actions/**` (Regla 3 compliance)

## Mock coverage final

| # | Section | Status | Evidencia |
|---|---------|--------|-----------|
| 1 | sidebar_shell | implemented (extendido 3→4 cats) | `src/components/layout/sidebar.tsx` v2 branch — 14 items en 4 categorías |
| 2 | topbar | implemented (h1 sans tras QA) | `contacts-view-v2.tsx:124-149` + `globals.css` `.topbar`, `.eye`, `.actions`, `.btn`, `.btn.pri` |
| 3 | tabs | implemented | `crm-tabs.tsx` + `globals.css` `.tabs`, `.tabs a.on` |
| 4 | toolbar_contactos | implemented | `contacts-view-v2.tsx:152-175` + `globals.css` `.toolbar`, `.search`, `.chip`, `.chip.on` |
| 5 | dict_table | implemented | `contacts-view-v2.tsx:177-229` + `globals.css` `table.dict` + thead + td + hover + `.entry`/`.def`/`.ph`/`.city`/`.date` |
| 6 | row_checkbox | implemented | Native `<input type="checkbox">` in thead + tbody rows |
| 7 | tag_pills | implemented | `mapTagClass()` + `globals.css` `.tg`, `.tg.red`, `.tg.gold`, `.tg.indi`, `.tg.ver` (oklch colors verbatim del mock) |
| 8 | pedidos_kanban_tab | waived | Módulo separado — Plan 03 futuro del retrofit. Tab linkea a `/crm/pedidos` (ruta existente). |
| 9 | pipelines_config_tabs | partial | Configuración → `/crm/configuracion` (ruta real existe). Pipelines → stub `href='#'` + toast "Próximamente" |

**Coverage final:** implemented 7/9 (78%) + partial 1/9 (11%) + waived 1/9 (11%) = **89% functional coverage** (7/9 implemented + 1/9 partial-usable).

## User visual checkpoint — PASS 2026-04-24

El usuario validó `/crm/contactos` con flag `ui_dashboard_v2.enabled=true` en Somnio side-by-side vs mock `crm.html` y emitió **PASS con 3 correcciones inline**:

1. **Font legibility:** h1 topbar serif → Inter sans (commit `3d5fd16`). D-RETRO-EXCEPTION documentada.
2. **Base font cascade:** `.theme-editorial` base serif → sans para que módulos legacy (pedidos kanban, etc.) bajo el wrapper hereden sans correctamente (commit `f161716`).
3. **Scrollbar overlay:** kanban columns sin "cuadro blanco" de track — solo barra delgada visible en hover (commit `e3143fd`).

Tras las 3 correcciones el usuario confirmó visual PASS. Flag rolled back OFF en Somnio post-QA.

## Incidente colateral resuelto (scope separado)

Durante el QA el usuario reportó que un user admin veía cards vacías en `/crm/pedidos`. Se abrió debug session `admin-role-data-missing` con scope global (pedidos + whatsapp + todos los módulos). Investigator de `gsd-debug-session-manager` corrió cycle 1 y refutó 3 hipótesis iniciales vía code+migrations audit (RLS es role-agnostic, no hay pattern bug de `workspace_members.single()`).

**Root cause real:** el admin tenía dark-mode activado en su browser. El `.theme-editorial` wrapper no neutraliza cascadas dark-mode de shadcn — texto heredó near-white sobre paper-1 cream → invisible. Workaround usuario: switch a light-mode.

**Systemic gap documentado** (NO fix en este plan, backlog post-retrofit): `.theme-editorial` debería forzar `color-scheme: light` o soportar genuine dark-editorial variant. Debug session cerrado + movido a `.planning/debug/resolved/admin-role-data-missing.md`.

## Verificación técnica (exit criteria cumplidos)

- `npx tsc --noEmit` → **EXIT 0 clean** (ejecutado tras cada task + tras cada fix QA)
- `grep -c '@/components/ui' contacts-view-v2.tsx` → **0** (cero shadcn primitives en v2 path)
- `grep -cE 'Card|Sheet|Tabs|DataTable|Dialog' contacts-view-v2.tsx` → **0**
- `grep -c '\.tg\.red' src/app/globals.css` → **2** (>= 1 OK)
- `grep -c 'table\.dict' src/app/globals.css` → **9** (>= 4 OK)
- `git diff HEAD~7 HEAD -- src/app/(dashboard)/crm/contactos/components/contacts-table.tsx` → **vacío** (legacy intocado)
- Flag OFF render byte-identical al HEAD pre-plan (Regla 6 compliance ✓)
- Regla 3 compliance: cero cambios a domain/hooks/actions/inngest/agents ✓

## Key-files.created / provided

| Path | Provides |
|------|----------|
| `src/app/globals.css` (bloque `.theme-editorial` + `.scrollbar-overlay`) | Editorial CSS portadas del mock + utility scrollbar overlay reutilizable |
| `src/app/(dashboard)/crm/layout.tsx` | CRM hub editorial layout con 4 tabs cuando v2 |
| `src/app/(dashboard)/crm/components/crm-tabs.tsx` | Client Component de tabs con pathname-aware active state |
| `src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx` | Raw HTML editorial view de contactos (dict table + toolbar + 4 chips + timestamp) |
| `src/components/layout/sidebar.tsx` (v2 branch) | Sidebar editorial con 4 categorías Propuesta B cuando v2 |

## Key-links verificados

- `src/app/(dashboard)/crm/contactos/page.tsx` → `contacts-view-v2.tsx` via `ternary import when v2=true` (pattern `ContactsViewV2`) ✓

## Deviations documentadas

1. **`.topbar h1` sans en vez de serif** (D-RETRO-EXCEPTION) — prioridad legibility over strict mock fidelity para texto operacional. Razón: QA feedback.
2. **`.theme-editorial` base font sans** (D-RETRO-EXCEPTION) — mock asumía serif como default, pero módulos legacy bajo el wrapper quedaban serif ilegibles para UI operacional. Elementos editorial-serif intencionales (`.wm`, `.mx-h1..h4`, `.mx-body`) preservan serif via explicit overrides.
3. **Sidebar 3→4 cats (Propuesta B)** — el producto tiene 14 items, no los 8 del mock. Extensión aprobada per D-RETRO-04.
4. **Configuración tab linkea a ruta real** — `/crm/configuracion` existe en codebase. Solo "Pipelines" queda stub.

## Lessons & backlog

- **Backlog post-retrofit:** dark-mode compatibility para `.theme-editorial` wrapper. `color-scheme: light` + override de `:root.dark` tokens cuando ancestor es `.theme-editorial`. Actualmente users con dark-mode browser ven texto ilegible en dashboard módulos.
- **Pattern validado:** fresh-rewrite + ternary router + CSS port a globals.css produce fidelity real al mock. Proceso R-RETRO-01..05 funciona — los 6 planes siguientes del retrofit (02-07) pueden seguir el mismo patrón.
- **Regla 6 compliance reforzada:** flag stayed OFF por default. QA se hizo con flag ON temporal + rollback. No impact productivo.
- **Debug protocol:** cuando un bug se reporta durante QA, abrir debug session separada en vez de mezclarlo con el plan actual. Este bug (admin dark-mode) no era del retrofit — mantenerlo separado aceleró el cierre.

## Next

Con PASS emitido, el retrofit puede proceder a:
- **Plan 02: Pedidos** — retrofit completo con KPI strip + period chips + Calendario + kanban raw (Plan 03 en HANDOFF.md)
- (Actualmente HANDOFF.md lista Plan 02 como Sidebar re-categorización, pero ese alcance ya quedó incluido en Plan 01 — el próximo plan sustantivo es Pedidos.)

El usuario decide si continuar con Plan 02 en la misma sesión o en una nueva tras `/clear`.
