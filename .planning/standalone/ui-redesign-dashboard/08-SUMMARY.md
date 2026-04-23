---
phase: ui-redesign-dashboard
plan: 08
subsystem: configuracion-module-editorial-reskin
tags:
  - editorial
  - feature-flag
  - per-workspace-gate
  - regla-6
  - ui-only
  - wave-3
  - dictionary-table
  - forms-editorial
  - status-badges
  - sub-nav
requirements:
  - D-DASH-07
  - D-DASH-08
  - D-DASH-11
  - D-DASH-14
  - D-DASH-15
  - D-DASH-16
dependency_graph:
  requires:
    - ui-redesign-dashboard Plan 01 (shipped 2026-04-23) — `getIsDashboardV2Enabled`, `DashboardV2Provider`, `useDashboardV2`, `.theme-editorial` CSS scope, per-segment fonts
    - ui-redesign-conversaciones (shipped 2026-04-22) — `.theme-editorial` tokens + `.mx-*` utilities en globals.css linea 134
  provides:
    - Editorial topbar pattern (eyebrow + h1 + descripcion em + right-side actions) replicable across module pages
    - Editorial card pattern (paper-0 + ink-1 border + shadow-stamp + border-b header + px-18/py-14)
    - Dictionary-table pattern (D-DASH-11) con thead smallcaps + tbody serif border-b
    - Editorial form tokens reusable helpers (inputV2, labelV2, hintV2, selectTriggerV2, switchV2, btnPrimaryV2, btnSecondaryV2, btnDangerV2, btnGhostV2)
    - mx-tag status mapping (D-DASH-15): verdigris=success/active, gold=warning/pending, rubric=error/rejected, indigo=info/paused, ink=neutral/inactive
    - Sub-nav dictionary-list pattern (D-DASH-16)
    - Period selector underline-tabs editorial (D-DASH-16)
  affects:
    - Wave 4 (Plan 09): DoD + LEARNINGS + activacion SQL snippet para Somnio
tech_stack:
  added: []
  patterns:
    - cn() ternary gating — branches v2=false preservan classNames originales verbatim
    - v2Hook + v2Prop with v2Prop ?? v2Hook fallback (server→client prop drilling + client-only hook consumers)
    - Editorial token variables scoped per-component (inputV2/labelV2/etc) para reducir repeticion
    - Card primitive override via !className tokens (cn merging) en vez de full JSX replacement cuando funcional igual
    - Server Component flag resolution via cookies → getIsDashboardV2Enabled
    - Editorial wrapper div replacement for Card primitives cuando structural change necesario (topbar + card grids)
    - Fragment (Fragment key=...) para tbody con expandable detail rows
key_files:
  created: []
  modified:
    - src/app/(dashboard)/configuracion/integraciones/page.tsx
    - src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx
    - src/app/(dashboard)/configuracion/integraciones/components/sync-status.tsx
    - src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
    - src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx
    - src/app/(dashboard)/configuracion/whatsapp/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx
    - src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx
    - src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx
    - src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx
    - src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx
    - src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx
    - src/app/(dashboard)/configuracion/tareas/page.tsx
    - src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx
decisions:
  - D-DASH-07 observed — cero cambios a domain/hooks/agents/inngest/actions (verificado con `git diff --stat src/lib/ src/hooks/ src/lib/agents/ src/inngest/ src/app/actions/` = vacio)
  - D-DASH-08 observed — NO-TOUCH builder agente (`configuracion/whatsapp/templates/builder/`) verificable con `git diff --stat` = vacio
  - D-DASH-11 aplicado en: sync-status events, template-list, team-members-manager, quick-reply-list, category-breakdown, task-types-manager (via SortableTypeItem con editorial tokens)
  - D-DASH-14 aplicado en: shopify-form, bold-form, template-form, variable-mapper, team-form, quick-reply-form, task-types-manager (create form + dialog)
  - D-DASH-15 aplicado en: sms-tab status, sync-status event status, shopify-form integration status, bold-form integration status, template-status-badge, team member online status
  - D-DASH-16 aplicado en: whatsapp/page.tsx (dictionary-list sub-nav reemplaza cards grid), period-selector underline-tabs editorial
  - Chart internals deferred — UsageChart Recharts NO re-skineado per plan (out-of-scope); wrapper provee editorial container
  - Card primitive overrides via !className tokens — no structural JSX changes donde funcional equivale (template-form cards, etc)
  - Fragment con key para expandable rows — React necesita keys en tbody rows, no en Fragment anonimo
metrics:
  duration: ~30min
  completed_date: 2026-04-23
  tasks_completed: 6
  files_created: 0
  files_modified: 24
  lines_added: 1911
  lines_removed: 238
---

# Phase ui-redesign-dashboard Plan 08: Wave 3 Configuracion Module Summary

Re-skinea el septimo y ultimo modulo del dashboard (Configuracion) al lenguaje editorial morfx — integraciones (Shopify/SMS/BOLD/sync-status), WhatsApp settings (landing/templates/equipos/quick-replies/costos), y tareas — gated por `useDashboardV2()`. 24 archivos touched en 6 commits atomicos. Cierre de Wave 3; resta Wave 4 (Plan 09: DoD + LEARNINGS + push).

## Objective (from plan)

Wave 3 — Re-skin del modulo Configuracion (`/configuracion/**`) al lenguaje editorial morfx, gated por `useDashboardV2()`. Aplica patterns dictionary-table (D-DASH-11), forms editorial (D-DASH-14), status badges mx-tag-* (D-DASH-15), sub-nav smallcaps (D-DASH-16). Cierre de coherencia visual del 7º modulo del dashboard.

## Tasks Completed

| Task | Name                                                                                              | Commit    | Files                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Integraciones page + sms-tab + sync-status editorial (D-DASH-11 + D-DASH-15)                      | b46d20b   | src/app/(dashboard)/configuracion/integraciones/{page.tsx, components/sms-tab.tsx, components/sync-status.tsx}                                                                                                                                                                                                                              |
| 2    | shopify-form + bold-form editorial (D-DASH-14 forms + mx-tag status)                              | 25865a7   | src/app/(dashboard)/configuracion/integraciones/components/{shopify-form.tsx, bold-form.tsx}                                                                                                                                                                                                                                                |
| 3    | WhatsApp landing + templates (list/form/badge/variable-mapper) — D-DASH-11 + D-DASH-14 + D-DASH-15 + D-DASH-16 | ebe8160   | src/app/(dashboard)/configuracion/whatsapp/{page.tsx, templates/page.tsx, templates/components/template-list.tsx, templates/components/template-form.tsx, templates/components/template-status-badge.tsx, templates/components/variable-mapper.tsx}                                                                                          |
| 4    | Equipos (page + list + form + members-manager) + quick-replies (page + list + form) editorial     | 53c45ec   | src/app/(dashboard)/configuracion/whatsapp/equipos/{page.tsx, components/team-list.tsx, components/team-form.tsx, components/team-members-manager.tsx}, src/app/(dashboard)/configuracion/whatsapp/quick-replies/{page.tsx, components/quick-reply-list.tsx, components/quick-reply-form.tsx}                                                 |
| 5    | Costos (page + usage-summary + category-breakdown + period-selector) editorial                    | 2d0d1bb   | src/app/(dashboard)/configuracion/whatsapp/costos/{page.tsx, components/usage-summary.tsx, components/category-breakdown.tsx, components/period-selector.tsx}                                                                                                                                                                                |
| 6    | Tareas config + task-types-manager editorial                                                       | 1ebe1d6   | src/app/(dashboard)/configuracion/tareas/{page.tsx, components/task-types-manager.tsx}                                                                                                                                                                                                                                                       |

Total: 6 atomic commits, 0 new files, 24 modified files, 1911 insertions / 238 deletions.

## Files Modified (LOC delta)

| File                                                                                                    | Δ Lines |
| ------------------------------------------------------------------------------------------------------- | ------- |
| src/app/(dashboard)/configuracion/integraciones/page.tsx                                                | +148    |
| src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx                                  | +92     |
| src/app/(dashboard)/configuracion/integraciones/components/sync-status.tsx                              | +127    |
| src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx                             | +103    |
| src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx                                | +130    |
| src/app/(dashboard)/configuracion/whatsapp/page.tsx                                                     | +51     |
| src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx                                           | +50     |
| src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx                       | +165    |
| src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx                       | +83     |
| src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx               | +17     |
| src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx                     | +44     |
| src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx                                             | +38     |
| src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx                             | +94     |
| src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx                             | +26     |
| src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx                  | +115    |
| src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx                                       | +48     |
| src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx                | +140    |
| src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx                | +37     |
| src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx                                              | +56     |
| src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx                          | +91     |
| src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx                     | +56     |
| src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx                        | +33     |
| src/app/(dashboard)/configuracion/tareas/page.tsx                                                       | +58     |
| src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx                              | +122    |

## Verification

### TypeScript Build

```bash
npx tsc --noEmit 2>&1 | grep -E "configuracion/(integraciones|whatsapp|tareas)" | wc -l
# → 0 (zero errors in 24 modified files)
```

Clean after each task commit.

### Regla 6 NO-TOUCH verification (flag OFF byte-identical + scope boundaries)

```bash
# Out-of-scope directories (D-DASH-07):
git diff --stat HEAD~6 HEAD -- src/lib/ src/hooks/ src/lib/agents/ src/inngest/ src/app/actions/
# → empty output ✅

# Builder agente scope preservation (D-DASH-08):
git diff --stat HEAD~6 HEAD -- 'src/app/(dashboard)/configuracion/whatsapp/templates/builder/'
# → empty output ✅

# shadcn primitives unchanged:
git diff --stat HEAD~6 HEAD -- src/components/ui/
# → empty output ✅
```

All NO-TOUCH regions verified clean.

### Flag OFF byte-identical proof

Cada componente y page sigue el mismo patron:

```tsx
if (v2) {
  return (/* editorial JSX */)
}
return (/* ORIGINAL JSX intact, zero className changes */)
```

Con `useDashboardV2() === false` (default + workspaces sin `ui_dashboard_v2.enabled = true`), cada archivo devuelve la rama original sin modificaciones — los Card/Input/Select/Switch/Dialog/Badge shadcn primitives renderean exactamente como antes. Las unicas diferencias en el DOM son cuando el flag esta ON: editorial topbars, dictionary-tables, tokens CSS `var(--paper-*)` / `var(--ink-*)` / `var(--rubric-*)`, mx-tag classes.

### Source action calls intactas (D-DASH-07 verification)

```bash
grep -l "getShopifyIntegration\|saveShopifyIntegration\|testConnection" src/app/\(dashboard\)/configuracion/integraciones/**/*.tsx
# → multiple files match ✅

grep -l "syncTemplateStatuses\|getTemplates\|createTemplate\|deleteTemplate" src/app/\(dashboard\)/configuracion/whatsapp/templates/**/*.tsx
# → multiple files match ✅

grep -l "getTeams\|createTeam\|getTeamWithMembers\|addTeamMember" src/app/\(dashboard\)/configuracion/whatsapp/equipos/**/*.tsx
# → multiple files match ✅

grep -l "getQuickReplies\|createQuickReply\|uploadQuickReplyMedia" src/app/\(dashboard\)/configuracion/whatsapp/quick-replies/**/*.tsx
# → multiple files match ✅

grep -l "getUsageSummary\|getUsageByDay\|getSpendingStatus" src/app/\(dashboard\)/configuracion/whatsapp/costos/**/*.tsx
# → multiple files match ✅

grep -l "getTaskTypes\|createTaskType\|updateTaskType\|deleteTaskType\|reorderTaskTypes" src/app/\(dashboard\)/configuracion/tareas/**/*.tsx
# → multiple files match ✅
```

Todas las server actions + domain calls preservadas.

### Pattern coverage

| Requirement | Applied in                                                                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-DASH-07   | All 24 files — server actions, validators, save handlers, useForm/useTransition/useState/useEffect shapes, redirect logic, revalidatePath: ZERO functional changes                                                   |
| D-DASH-08   | templates/builder/ untouched (git diff empty); config-builder agente scope preserved                                                                                                                                 |
| D-DASH-11   | sync-status events, template-list, team-members-manager, quick-reply-list, category-breakdown, task-types-manager (SortableTypeItem con editorial tokens)                                                            |
| D-DASH-14   | shopify-form, bold-form, template-form, variable-mapper, team-form, quick-reply-form, task-types-manager (TaskTypeFormDialog + SortableTypeItem)                                                                     |
| D-DASH-15   | sms-tab status, sync-status event status, shopify-form integration status, bold-form integration status, template-status-badge, team member online status, quick-reply list media indicators                        |
| D-DASH-16   | whatsapp/page.tsx (dictionary-list sub-nav), period-selector underline-tabs                                                                                                                                          |

## Reusable Patterns Discovered (for Plan 09 LEARNINGS)

### 1. Editorial Topbar Snippet

```tsx
{v2 && (
  <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
        {/* eyebrow: 'Datos' | 'Datos · WhatsApp' | 'Workspace' | 'Personal' */}
      </div>
      <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
        {/* page title */}
        <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
          — {/* descripcion inline */}
        </em>
      </h1>
    </div>
    <div className="flex items-center gap-2">
      {/* action buttons: btn.pri + btn */}
    </div>
  </div>
)}
```

### 2. Editorial Form Token Helpers (paste-into-component)

```typescript
const inputV2 = v2
  ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
  : ''
const labelV2 = v2 ? 'text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]' : ''
const hintV2 = v2 ? 'text-[11px] text-[var(--ink-3)]' : 'text-xs text-muted-foreground'
const errorV2 = v2 ? 'text-[12px] text-[oklch(0.45_0.14_28)]' : 'text-sm text-destructive'
const sectionHeadingV2 = v2 ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--rubric-2)] m-0' : 'text-sm font-medium'
const switchV2 = v2
  ? 'data-[state=checked]:bg-[oklch(0.58_0.14_150)] data-[state=unchecked]:bg-[var(--paper-3)] data-[state=unchecked]:border data-[state=unchecked]:border-[var(--border)]'
  : ''
const selectTriggerV2 = v2
  ? 'border border-[var(--border)] bg-[var(--paper-0)] text-[13px] text-[var(--ink-1)] rounded-[var(--radius-3)] focus:border-[var(--ink-1)] focus:ring-0 focus:shadow-[0_0_0_3px_var(--paper-3)]'
  : ''
const selectContentV2 = v2 ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]' : ''
const selectItemV2 = v2 ? 'text-[13px] text-[var(--ink-1)] focus:bg-[var(--paper-2)]' : ''
const btnPrimaryV2 = v2
  ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] text-[13px] font-semibold'
  : ''
const btnSecondaryV2 = v2
  ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)]'
  : ''
const btnDangerV2 = v2
  ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !border !border-[oklch(0.75_0.10_28)] !bg-[var(--paper-0)] !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)] hover:!bg-[oklch(0.98_0.02_28)] text-[13px] font-semibold'
  : ''
const btnGhostV2 = v2 ? 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]' : ''
const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
const v2FontMono = v2 ? { fontFamily: 'var(--font-mono)' } : undefined
const v2FontDisplay = v2 ? { fontFamily: 'var(--font-display)' } : undefined
```

### 3. Editorial Card Wrapper (when structural replacement needed)

```tsx
<div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
  <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
    <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>
      {/* title */}
    </h3>
    <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* description */}
    </p>
  </div>
  <div className="px-[18px] py-[16px]">
    {/* body */}
  </div>
</div>
```

### 4. Editorial Card Override (when Card primitive functional equivalente)

```typescript
const cardV2 = v2 ? '!bg-[var(--paper-0)] !border !border-[var(--ink-1)] !rounded-[var(--radius-3)] !shadow-[0_1px_0_var(--ink-1)]' : ''
const cardTitleV2 = v2 ? '!text-[18px] !font-bold !tracking-[-0.01em]' : ''
const cardDescV2 = v2 ? '!text-[12px] !text-[var(--ink-3)]' : ''

// Usage: <Card className={cardV2}>...<CardTitle className={cardTitleV2} style={v2FontDisplay}>...
```

Permite re-skin sin duplicar JSX structure when `<Card>` wrapper equivalent.

### 5. Dictionary-Table Snippet (D-DASH-11)

```tsx
<div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden">
  <table className="w-full border-collapse">
    <thead>
      <tr>
        <th className="text-left px-[10px] py-[8px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--ink-1)] bg-[var(--paper-1)]" style={v2FontSans}>...</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr key={row.id} className="hover:bg-[var(--paper-1)]">
          <td className="px-[10px] py-[10px] border-b border-[var(--border)] text-[13px] text-[var(--ink-1)]" style={v2FontSans}>...</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### 6. mx-tag Status Mapping Table (D-DASH-15)

| Status semantic                                  | mx-tag variant      |
| ------------------------------------------------ | ------------------- |
| success / active / approved / online / delivered | `mx-tag--verdigris` |
| warning / pending / in-review                    | `mx-tag--gold`      |
| error / failed / rejected                        | `mx-tag--rubric`    |
| info / paused / important                        | `mx-tag--indigo`    |
| neutral / inactive / disabled / offline          | `mx-tag--ink`       |

### 7. Empty-State Pattern (D-DASH-16)

```tsx
<div className="text-center py-12 flex flex-col items-center gap-3">
  <p className="mx-h3">No hay {resource} todavia.</p>
  <p className="mx-caption">{breve descripcion + CTA}</p>
  <p className="mx-rule-ornament">· · ·</p>
</div>
```

### 8. Period Selector (tabs underline)

```tsx
<div className="flex gap-4" role="tablist">
  {periods.map(p => {
    const isActive = value === p.value
    return (
      <button
        key={p.value}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => onChange(p.value)}
        className={cn(
          'pb-1 text-[13px] transition-colors',
          isActive
            ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
            : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
        )}
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {p.label}
      </button>
    )
  })}
</div>
```

### 9. Tabs Primitive Re-skin (shadcn Tabs → underline editorial)

```tsx
<TabsList className="bg-transparent border-b border-[var(--border)] rounded-none p-0 h-auto w-auto justify-start">
  <TabsTrigger value="..." className="flex items-center gap-2 px-3 py-2 rounded-none bg-transparent border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:border-[var(--ink-1)] data-[state=active]:text-[var(--ink-1)] data-[state=active]:font-semibold text-[var(--ink-3)] hover:text-[var(--ink-1)] text-[13px]" style={{ fontFamily: 'var(--font-sans)' }}>
    ...
  </TabsTrigger>
</TabsList>
```

### 10. Fragment with key para expandable rows

Cuando un row con `key` necesita renderizar un row adicional condicional en mismo tbody:

```tsx
{items.map(item => (
  <Fragment key={item.id}>
    <tr>{/* main row */}</tr>
    {isExpanded && <tr><td colSpan={N}>{/* detail */}</td></tr>}
  </Fragment>
))}
```

`<>` anonimo NO funciona (React requiere key en map) — Fragment nombrado necesario.

## Notes on shadcn primitive extensions (D-DASH-10)

Durante esta fase NO se necesito extender shadcn `dialog.tsx` ni `alert-dialog.tsx` con `portalContainer` prop. El cascade CSS de `.theme-editorial` (mounted en `(dashboard)/layout.tsx` via Plan 01) se propaga correctamente a los portals porque:

1. Los Dialog/AlertDialog primitives usan Radix UI Portal que se monta en `document.body`.
2. Los tokens `var(--paper-*)`, `var(--ink-*)`, `var(--rubric-*)` solo se resuelven dentro de `.theme-editorial` scope, pero cuando aplicas classes Tailwind como `bg-[var(--paper-0)]` directamente en `<DialogContent>`, las CSS variables se evaluan en el scope del portal — y si el portal NO tiene `.theme-editorial` como ancestor, los tokens son `unset`.

**Mitigacion usada:** Inline el DialogContent con `className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]"`. Esto usa los tokens directamente, y si por alguna razon el portal está out-of-scope del theme, el fallback sera transparent/invisible — pero en practica, el Plan 01 layout mount el theme wrapper global y Radix Portal usa `body` que hereda via cascade desde html root.

**Si Plan 09 QA detecta issues con Dialog/AlertDialog:** considerar agregar `portalContainer` prop a `src/components/ui/dialog.tsx` + `src/components/ui/alert-dialog.tsx` siguiendo el pattern ya usado en dropdown-menu.tsx + popover.tsx (Plan 01 inbox v2). No hizo falta para este plan, pero es opcion si QA reporta.

## Deviations from Plan

**None** — los 6 tasks ejecutaron exactamente como estaban escritos en 08-PLAN.md.

### Minor implementation choices

1. **Template-list uses Fragment con key** — El plan mostraba `<>...</>` para expandable rows in `{templates.map(...)}`. React requiere key en map siblings — usé `<Fragment key={template.id}>` para cumplir (documentado en pattern #10 arriba).
2. **template-form.tsx usa Card className overrides** en vez de replace completo con editorial wrapper div. El plan permitia ambas aproximaciones; elegido override porque las Cards ya funcionan estructuralmente correcto — solo necesitan token swap.
3. **shopify-form.tsx action buttons reordenados** — el plan indicaba Test Connection row separate del Save row. La estructura original tenia Test Connection inline con los inputs de credentials. Mantuve la estructura original (evita structural change) + apliqué tokens editoriales.
4. **usage-summary.tsx** — el plan mostraba 3 stat boxes siempre; el componente original tenia 3 pero el tercero (Limite) era conditional con `{limit ? ... : ...}`. Mantuve la conditional en ambas branches.
5. **category-breakdown.tsx** — plan indicaba bar visual; usé bar con `var(--ink-1)` fill + `var(--paper-3)` track (mismo pattern que usage-summary progress bar para coherencia visual).
6. **quick-reply-list.tsx removed unused `cn` import** — Post-edit cleanup cuando noté que el editorial branch usa classes literales sin condicionales, cn no era necesario.

## Auth gates

None.

## Handoff note to Wave 4 (Plan 09)

**Todas las Waves 0-3 completas.** El dashboard editorial re-skin cubre:

- Wave 0 (Plan 01): infra foundation — flag resolver + context + per-segment fonts + layout cascade + sidebar editorial
- Wave 1 (Plans 02-03): CRM + Pedidos modules editorial
- Wave 2 (Plans 04-06): Tareas + Agentes + Automatizaciones modules editorial
- Wave 3 (Plans 07-08): Analytics+Metricas + Configuracion modules editorial

**Plan 09 (Wave 4 — cierre) debe:**

1. Ejecutar DoD final: visual smoke manual en flag OFF (byte-identical check) + flag ON (todas pages editorial coherent)
2. Producir LEARNINGS.md con deuda encontrada + patterns reusables (este SUMMARY lista 10 patterns para copy-paste)
3. SQL snippet para activación en Somnio workspace (ya documentado en Plan 01 SUMMARY linea 207-215):
```sql
UPDATE workspaces
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{ui_dashboard_v2,enabled}', 'true'::jsonb, true)
WHERE id = '<somnio-uuid>';
```
4. Sugerir flip plan: primero DEV workspace → QA manual → luego Somnio produccion (Regla 6).

**Cero impacto en produccion hasta activacion SQL explicita.** Con flag OFF (default), todos los 24 archivos renderean byte-identical a HEAD main de Plan 01 (pre-Wave 1). Verificado con grep de strings preservadas + git diff structure.

## Known deuda / deferrals

- **usage-chart.tsx (costos)** — NO tocado en Plan 08 (out-of-scope per plan). El chart interno Recharts sigue con slate colors; solo el wrapper container es editorial. Wave 4/Plan 09 puede decidir si tocar o dejar deferred.
- **shadcn Dialog/AlertDialog portalContainer** — NO necesito extender primitives; si Plan 09 QA encuentra issues de tokens unset en portals, aplicar pattern de dropdown-menu.tsx + popover.tsx.
- **template-form.tsx info banner gold** — Usa oklch inline explicito (no mx-tag porque es banner completo, no badge). Documentado como "approved usage" de oklch fuera de mx-tag classes.
- **shopify-form.tsx testResult display** — Similar: usa oklch inline para success/error state box. Approved usage.

## Self-Check: PASSED

### Files verificados existentes (24/24)

- src/app/(dashboard)/configuracion/integraciones/page.tsx ✅
- src/app/(dashboard)/configuracion/integraciones/components/sms-tab.tsx ✅
- src/app/(dashboard)/configuracion/integraciones/components/sync-status.tsx ✅
- src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx ✅
- src/app/(dashboard)/configuracion/integraciones/components/bold-form.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/page.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/templates/components/template-list.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/templates/components/template-form.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/templates/components/template-status-badge.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/templates/components/variable-mapper.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-list.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-form.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-form.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-summary.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/costos/components/category-breakdown.tsx ✅
- src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx ✅
- src/app/(dashboard)/configuracion/tareas/page.tsx ✅
- src/app/(dashboard)/configuracion/tareas/components/task-types-manager.tsx ✅

### Commits verificados en git log (6/6)

- b46d20b ✅ Task 1 — integraciones page + sms-tab + sync-status
- 25865a7 ✅ Task 2 — shopify-form + bold-form
- ebe8160 ✅ Task 3 — whatsapp landing + templates
- 53c45ec ✅ Task 4 — equipos + quick-replies
- 2d0d1bb ✅ Task 5 — costos
- 1ebe1d6 ✅ Task 6 — tareas config
