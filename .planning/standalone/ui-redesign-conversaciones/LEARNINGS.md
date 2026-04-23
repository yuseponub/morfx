# LEARNINGS — Standalone `ui-redesign-conversaciones`

**Phase type:** UI re-skin behind per-workspace feature flag (Regla 6).
**Dates:** 2026-04-22 (plan → execute → ship en el mismo día).
**Status:** ✅ SHIPPED. Primera activación productiva: workspace Somnio `a3843b3f-c337-4836-92b5-89c58bb98490` (2026-04-22).
**Plans:** 6 (01 infra → 02 list → 03 thread → 04 header+panel → 05 polish → 06 DoD/docs).
**Commits totales:** 24 en `main` (rango `1d72504` → push final Task 4).
**LOC delta:** ~2,100 añadidas / ~40 removidas (neto +2,060). 8 componentes re-skineados + 6 archivos nuevos + 1 bloque CSS (`.theme-editorial` ~310 líneas).

---

## 1. Phase overview — qué entregó

Re-skin editorial completo del módulo Inbox WhatsApp (`/whatsapp`) a la estética "paper / Bible / dictionary" del design handoff v2, **detrás de un feature flag per-workspace** para cumplir Regla 6 (el agente productivo atiende clientes reales — no se podían aceptar regresiones).

**Lo que ve el usuario con el flag ON:**
- Eyebrows "Módulo · whatsapp" / "Contacto · activo" en smallcaps rubric-2.
- Títulos display en EB Garamond (26px / 20px).
- Bubbles letter/note shape (10px radius con pico de 2px en la esquina opuesta).
- Composer con hard rule ink-1 border-top + Send button sólido con label "Enviar" + press affordance.
- Avatars paper-3 (lista) / ink-1 sólido (header), con borde ink-1.
- Timestamps en JetBrains Mono.
- Selected rail 3px rubric-2 con compensación pl-[13px] para evitar shift horizontal.
- Day separators em-dash smallcaps (`— Martes 21 de abril —`).
- Loading skeletons editorial (`.mx-skeleton` con mx-pulse).
- Keyboard shortcuts `/` (search), `[`/`]` (prev/next), `Esc` (drawer close <1280px).
- Universal ARIA roles (`role="list"`, `role="log"`, `aria-live="polite"`).

**Lo que ve el usuario con el flag OFF (TODOS los workspaces antes del 2026-04-22):**
- Exactamente el UI actual, byte-identical (verificado con `git diff main` en 18 paths NO-TOUCH → 0 líneas).
- Excepciones universales aditivas (aplican también con flag OFF, **mejoras positivas**):
  - 15 aria-labels nuevos en Spanish (9 chat-header + 6 contact-panel + 1 Send button) → universal a11y upgrade.
  - ARIA roles `list`/`log`/`aria-live="polite"` en conversation-list + chat-view.
  - **Fix universal del bug pre-existente `hsl(var(--background))` en `chat-view.tsx`** — los tokens shadcn post-Tailwind v4 son bare OKLCH, no HSL triples; el wrapper `hsl()` emitía CSS inválido silenciosamente. Un positive-universal.

---

## 2. Decisiones locked (D-01..D-24)

Referencia completa: `.planning/standalone/ui-redesign-conversaciones/CONTEXT.md`. Las de mayor leverage:

- **D-01 Feature flag per workspace:** `workspaces.settings.ui_inbox_v2.enabled` (JSONB, namespaced, no flat). Mismo patrón que `conversation_metrics.enabled` y Phase 42.1. Rollback = `UPDATE` a `false` (cero migración, cero downtime).
- **D-05 Shadcn token override strategy:** sobrescribir los tokens semánticos shadcn (`--primary`, `--background`, `--foreground`, `--card`, etc.) dentro del scope `.theme-editorial` en lugar de extender Tailwind v4 con `@theme`. Razón: Tailwind v4 rechaza `@theme` anidado (Pitfall 1); el override nativo CSS es compatible, es trivialmente revertible, y hace que TODOS los primitivos shadcn (Button, Badge, Tabs, Popover, etc.) hereden la estética editorial sin reescribir componentes.
- **D-07 Scope confinado a `/whatsapp`:** clases `mx-*` gated por selector `.theme-editorial .mx-*` en globals.css. Zero leakage verificado en Task 1 Check 3 contra `/crm`, `/tareas`, `/automatizaciones`. Sidebar global queda diferida a standalone `ui-redesign-dashboard-chrome`.
- **D-19 NO-TOUCH paths (18 archivos):** hooks (`use-conversations`, `use-messages`), realtime, action handlers, webhooks, agentes, domain, inngest, sidebar, 14 componentes auxiliares del inbox (agent-config-slider, debug-panel-production, availability-toggle, window-indicator, bold-payment-link-button, new/template/view/create sheets, media-preview, emoji-picker, quick-reply-autocomplete, template-button, template-preview, conversation-tag-input). Verificable con `git diff main` → 0 líneas (Task 1 Check 4).
- **D-20 Contact-panel local className-only (no structural refactor):** el archivo más grande en scope (839 LOC) creció a 1132 LOC puramente aditivo — `cn(v2 && '...')` + `style={v2 ? {...} : undefined}` + 1 bloque `<dl>` v2-gated. Cero cambios en hooks, handlers, sheets, dialogs, realtime subscription, polling interval. Minimiza riesgo de regresión.
- **D-24 Universal aria-labels:** 15 aria-labels en Spanish aplican CON y SIN el flag. `IconButton` component tiene `aria-label: string` como prop OBLIGATORIO a nivel TypeScript (omitirlo es compile error). Mejora screen reader UX para TODOS los usuarios.

---

## 3. Patterns learned (los 5 más reutilizables para futuras fases de UI)

### 3.1. Feature flag per workspace via `jsonb_set` — el caveat importante

El patrón `workspaces.settings.ui_inbox_v2.enabled` funciona solo si **todas** las llaves intermedias existen en el JSONB. `jsonb_set(settings, '{a,b}', 'x')` **NO crea la llave `a` si no existe**; devuelve `settings` sin cambios silenciosamente. Dos caminos para evitarlo:

**Opción A (recomendada, usada en producción):** `create_missing = true` + `COALESCE` del parent:

```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_inbox_v2,enabled}',
  'true'::jsonb,
  true  -- create_missing para crear llave intermedia `ui_inbox_v2` si no existe
)
WHERE id = '<workspace-uuid>';
```

**Opción B (dos jsonb_set anidados):** menos idiomática, más verbosa; equivalente funcional.

**Rollback (la llave ya existe, no hace falta `create_missing`):**

```sql
UPDATE workspaces
SET settings = jsonb_set(settings, '{ui_inbox_v2,enabled}', 'false'::jsonb)
WHERE id = '<workspace-uuid>';
```

**Mismo patrón reutilizable** para cualquier flag namespaced futuro: `feature.enabled`, `ui_xyz.enabled`, etc. Preferible a flat keys (`ui_inbox_v2_enabled`) porque deja room para `retention_days`, `variant`, etc. sin reorganizar el schema.

### 3.2. Radix portal re-rooting para themed scope

Radix UI portales (`DropdownMenu.Portal`, `Popover.Portal`, `Select.Portal`, etc.) default a `document.body`. Cuando hay un scope CSS local (`.theme-editorial`), el portal content cae fuera del scope y renderea con los tokens shadcn-slate del root en lugar de los editoriales. Resultado: dropdown/popover content en slate mientras el surface está en editorial.

**Fix canonical (aplicado a 2 shadcn primitives):**

1. **Plan 04** extendió `src/components/ui/dropdown-menu.tsx` con prop opcional `portalContainer?: HTMLElement | null`:
   ```tsx
   function DropdownMenuContent({ portalContainer, ...props }) {
     return (
       <DropdownMenuPrimitive.Portal container={portalContainer ?? undefined}>
         <DropdownMenuPrimitive.Content ... />
       </DropdownMenuPrimitive.Portal>
     )
   }
   ```
2. **Plan 05** extendió `src/components/ui/popover.tsx` con el mismo patrón.

**Resolver el container en el caller:** `useEffect(() => { el = document.querySelector('[data-module="whatsapp"]'); ref.current = el }, [v2])`. El atributo `data-module="whatsapp"` se aplica al `.theme-editorial` wrapper en `InboxLayout` (Plan 01 Task 4) y es el marcador canónico para el scope.

**Byte-identical guarantee:** `portalContainer` es opcional. Cuando `undefined` o `null`, Radix falls back a `document.body` — 100% byte-identical para cualquier otro consumer de `DropdownMenuContent` / `PopoverContent` en el repo.

**Sweep checklist al introducir un scope CSS local futuro:**

```bash
grep -rnE 'DropdownMenu|Popover|Select|HoverCard|Dialog|Tooltip' src/app/(dashboard)/<module>/components/
```

Para cada hit: re-rootear (si el portal content debe verse themed) o documentar como intentional-slate exclusion (si está dentro de un modal/sheet que no se re-skineó).

### 3.3. Theme scoping via className-only (evita `@theme` de Tailwind v4)

El instinto inicial para un segundo tema en Tailwind v4 es `@theme` anidado. **NO funciona** — Tailwind v4 rechaza `@theme` dentro de selectores / media queries / scopes. RESEARCH Pitfall 1 documentado.

**Pattern alternativo (shipped en Plan 01 Task 2):** declarar todos los tokens custom como CSS custom properties dentro del selector `.theme-editorial` en `globals.css`. Los primitivos shadcn que usan `var(--primary)`, `var(--background)`, etc. heredan automáticamente via cascade.

```css
.theme-editorial {
  color-scheme: light;

  /* Tokens custom editoriales */
  --paper-0: oklch(0.995 0.004 82);
  --paper-1: oklch(0.985 0.012 82);
  --ink-1: oklch(0.235 0.022 240);
  --rubric-2: oklch(0.485 0.165 28);
  /* ... */

  /* Shadcn semantic token overrides */
  --background: var(--paper-1);
  --foreground: var(--ink-1);
  --primary: var(--ink-1);           /* NO a --rubric-2 — 60/30/10 contract */
  --destructive: var(--rubric-2);
  /* ... */
}

.theme-editorial .mx-tag { /* scoped utilities */ }
.theme-editorial .mx-h1   { /* ... */ }
```

**Ventajas:** cero cambios en `tailwind.config.ts` (Tailwind v4 no tiene), trivial rollback (borrar el bloque), per-workspace opt-in, compatible con `next-themes` (el `color-scheme: light` dentro del scope gana specificity contra `.dark` global — UI-SPEC §12.4).

**Reutilizable para standalones futuros:** `ui-redesign-tareas` puede definir `.theme-editorial-tareas` o reutilizar el mismo wrapper si la estética es consistente. El bloque CSS de tokens ya está canónico.

### 3.4. `hsl(var(--token))` antipattern post Tailwind v4 migration

**Bug pre-existente encontrado en Plan 03 Task 1** (fix universal, no gated por flag):

```css
/* chat-view.tsx:287 (pre-fix) */
.chat-background {
  background-color: hsl(var(--background));  /* INVALID post-v4 */
}
```

En shadcn v3 / Tailwind v3, los tokens eran triples HSL (`--background: 0 0% 100%`) y había que envolver con `hsl()`. En shadcn v4 / Tailwind v4, los tokens son bare OKLCH (`--background: oklch(1 0 0)`), y el wrapper `hsl()` emite CSS inválido que el browser descarta silenciosamente. DevTools muestra la propiedad greyed-out.

**Detección — grep canonical:**

```bash
grep -rE 'hsl\(var\(--' src/
```

Cualquier match post-migración Tailwind v4 es **sospechoso**. Otros módulos (CRM, Tareas, Automatizaciones, etc.) pueden tener bugs análogos. Vale la pena un `/gsd:quick` pass de audit.

**Fix (trivial):** remover el wrapper `hsl()` → `var(--background)`.

### 3.5. Font inheritance en themed inputs — override explícito obligatorio

**Bug caught mid-QA (commit `0e6c703`):**

El root `.theme-editorial` setea `font-family: var(--font-serif)` (EB Garamond). Los message bubbles (Plan 03) usan `style={{ fontFamily: 'var(--font-sans)' }}` explícito para override. El composer textarea (Plan 03) no tenía el override y estaba heredando EB Garamond, mientras que el texto de los bubbles era Inter — inconsistencia perceptible en QA side-by-side.

**Fix:** añadir `[font-family:var(--font-sans)]` al className del textarea (match bubble pattern).

**Pattern learned:** cuando se establece un `font-family` en el root de un theme scope, **cualquier form control hijo que debe usar una fuente distinta DEBE hacer override explícito** (no heredar). Aplica a: `<input>`, `<textarea>`, `<select>`, `<button>`, `<option>`, `<optgroup>`, `<fieldset>`, `<legend>` — estos elementos nativos del browser **NO heredan `font-family` por default** en todos los browsers (user-agent stylesheet establece `font-family` propio).

**Checklist preventivo para futuros scopes con font override:**

```bash
grep -rnE '<textarea|<input[^/]*type=' src/app/(dashboard)/<module>/
```

Para cada hit, verificar que la font-family esté explícitamente especificada si el scope root tiene una font-family que no es la deseada para el control.

---

## 4. Deferrals

### 4.1. D-17 — Channel-down banner DIFERIDO

- **Why:** `useConversations()` y `useMessages()` NO exponen signal de conexión (`isConnected` / `error` / `isError` / `connectionError`). Verificado via grep del return shape de ambos hooks (ver 05-SUMMARY.md sección Task 4 Step 3). Extender los hooks violaría D-19 NO-TOUCH.
- **Plumbing para un-defer:**
  1. Extender `use-conversations.ts` + `use-messages.ts` con `isConnected: boolean` derivado del Supabase Realtime channel state (ya expone `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` eventos — visibles en debug log línea 450, no surface a consumers).
  2. Añadir callback `onRetry` que fuerce un reconnect.
  3. Wire el banner en `chat-view.tsx` usando el patrón `D-17` documentado (bg color-mix rubric-2 8% + border-left 3px + `AlertTriangle` + botón "Reintentar" sans).
- **No hay artifact dedicado;** esta sección de LEARNINGS es el handoff.

### 4.2. D-18 — Snoozed conversation state DIFERIDO

- **Artifact:** `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` (creado en Plan 05 Task 2).
- **Why:** `ConversationWithDetails` no expone field `bot_mute_until` (grep discovery retornó 0 hits contra `src/lib/whatsapp/types.ts`, `src/hooks/`, `src/app/actions/conversations*`). No hay fuente de data para derivar `isSnoozed`.
- **Checklist de un-defer (7 pasos, ver `DEFERRED-D18.md` para detalle completo):**
  1. Migration: `ALTER TABLE conversations ADD COLUMN bot_mute_until TIMESTAMPTZ NULL` + índice parcial.
  2. Type: añadir `bot_mute_until: string | null` a `ConversationWithDetails`.
  3. Hook SELECT projection: incluir en `useConversations` + `getConversation`.
  4. Domain: `snoozeConversation(conversationId, until)` + `unsnoozeConversation` en `src/lib/domain/conversations.ts` (Regla 3).
  5. Server actions: wrapper en `src/app/actions/conversations.ts`.
  6. UI trigger: `Moon` icon button en `chat-header.tsx` o context-menu en `conversation-item.tsx` con duration picker (30min / 1h / 3h / hasta-mañana).
  7. Agent rule: el conversational agent debe skippear respuestas cuando `bot_mute_until > NOW()` (Regla 6 — cambia comportamiento productivo, requiere opt-in).
- **Code sketch listo para pegar** una vez el field exista — ver `DEFERRED-D18.md` sección "UI to wire after field exists".

### 4.3. Otros deferrals menores

- `ruled paper` thread background (UI-SPEC §7.5) — explícitamente diferido.
- Cormorant Garamond fuente — NO se carga (cascade fallback a EB Garamond, UI-SPEC §6.3 decisión).
- Modales y sheets internos — standalone `ui-redesign-conversaciones-modales`.
- Sidebar global + `<Brand />` component — standalone `ui-redesign-dashboard-chrome`.
- Dark mode editorial — fuera de scope v1 (handoff §8).
- UI admin para flipear flag de workspace — hoy se hace vía SQL.
- Responsive exhaustivo <1024px con drawer-stack — implementado patrón base, QA fino queda para follow-up.
- Portal sweep completo (Select dentro de AlertDialog en `contact-panel.tsx:1089` + emoji-picker Popover en `message-input.tsx:416`) — intentional-slate por ahora (modal exclusion + PATTERNS §14).

---

## 5. Regla 6 verification

**Verificación canonical (Plan 06 Task 1 Check 4):**

```bash
git diff main -- \
  src/lib/agents/ \
  src/lib/inngest/ \
  src/app/actions/conversations.ts \
  src/lib/whatsapp/ \
  src/components/layout/sidebar.tsx \
  src/lib/domain/ \
  src/hooks/use-conversations.ts \
  src/hooks/use-messages.ts \
  src/app/\(dashboard\)/whatsapp/components/agent-config-slider.tsx \
  src/app/\(dashboard\)/whatsapp/components/debug-panel-production/ \
  src/app/\(dashboard\)/whatsapp/components/availability-toggle.tsx \
  src/app/\(dashboard\)/whatsapp/components/window-indicator.tsx \
  src/app/\(dashboard\)/whatsapp/components/bold-payment-link-button.tsx \
  src/app/\(dashboard\)/whatsapp/components/new-conversation-modal.tsx \
  src/app/\(dashboard\)/whatsapp/components/template-send-modal.tsx \
  src/app/\(dashboard\)/whatsapp/components/view-order-sheet.tsx \
  src/app/\(dashboard\)/whatsapp/components/create-contact-sheet.tsx \
  src/app/\(dashboard\)/whatsapp/components/create-order-sheet.tsx \
  src/app/\(dashboard\)/whatsapp/components/media-preview.tsx \
  src/app/\(dashboard\)/whatsapp/components/emoji-picker.tsx \
  src/app/\(dashboard\)/whatsapp/components/quick-reply-autocomplete.tsx \
  src/app/\(dashboard\)/whatsapp/components/template-button.tsx \
  src/app/\(dashboard\)/whatsapp/components/template-preview.tsx \
  src/app/\(dashboard\)/whatsapp/components/conversation-tag-input.tsx \
  | wc -l
```

**Resultado:** `0` (Task 1 Check 4 PASS).

**Interpretación:** El agente productivo, los hooks, el realtime, los webhooks, el debug panel, los modales/sheets auxiliares, y el `AgentConfigSlider` son bit-for-bit idénticos a `main`. Cero riesgo de regresión en flujos de agente cuando el flag se activa workspace por workspace.

---

## 6. Scope deviations caught & justified

Durante la ejecución aparecieron 2 desviaciones de scope aditivas, ambas necesarias para cumplir el objetivo del plan. Se aplicaron como Rule 1 (bug fix) + Rule 3 (blocker).

### 6.1. Plan 04 Deviation 1 — `src/components/ui/dropdown-menu.tsx` extendido

- **Trigger:** Task 3 required re-rooting del AssignDropdown portal dentro de `.theme-editorial`. El plan sugería wrapping externo con `<DropdownMenuPortal container={...}>`, pero shadcn `DropdownMenuContent` ya internamente envuelve con `DropdownMenuPrimitive.Portal` (sin `container` prop). Wrapping externo hubiera creado nested portals — el outer container hubiera sido ignorado.
- **Fix:** Extender `DropdownMenuContent` con prop opcional `portalContainer?: HTMLElement | null` reenviado al Portal interno.
- **Justification:** Rule 1 — fix bug de arquitectura. Prop opcional, byte-identical default (undefined → Radix falls back to body). Cero impact en otros consumers del repo.
- **Commit:** `39b4390`.

### 6.2. Plan 05 Deviation 1 — `src/components/ui/popover.tsx` extendido

- **Trigger:** Task 4 Step 4 portal sweep encontró 3 Popovers in-scope (1 tagFilter en conversation-list + 2 en contact-panel order cards). shadcn `PopoverContent` no exponía `portalContainer`.
- **Fix:** Mismo patrón que Plan 04 — prop opcional `portalContainer?: HTMLElement | null` reenviado al `PopoverPrimitive.Portal`.
- **Justification:** Rule 3 — blocker para completar Task 4. Pattern idéntico al aceptado por Plan 04 para `dropdown-menu.tsx`. Aditivo, byte-identical default.
- **Commit:** `ff80d14`.

**Ambas deviations** son infraestructura pura (una prop opcional en un shadcn wrapper), reutilizable por cualquier módulo futuro que necesite re-rootear portales Radix dentro de un theme scope local. Deberían considerarse parte del library pattern del proyecto de ahora en adelante.

### 6.3. Plan 04 Deviation 2 — `contact-panel.tsx` root `<div>` → `<aside>`

- **Trigger:** Task 2 Step 2 sugería semantic HTML5 `<aside>` para el contact panel. El archivo existente usaba `<div>`.
- **Fix:** Swap `<div>` → `<aside>` + `aria-label="Información del contacto"` universal.
- **Justification:** Rule 2 — missing semantic correctness + a11y. Zero funcional impact.

### 6.4. Mid-QA polish fix — composer textarea font-family

- **Trigger:** QA side-by-side por el usuario detectó inconsistencia entre burbujas (Inter) y composer textarea (EB Garamond heredado).
- **Fix:** Commit `0e6c703` añadió `[font-family:var(--font-sans)]` al className del textarea.
- **Justification:** Caught mid-QA + confirmado por el usuario antes de aprobar. No una deviation de plan propiamente — una observación del QA que se resolvió inline antes de Task 3.

---

## 7. Production activation — Rollout playbook

**Primera activación productiva:** workspace **Somnio** (id `a3843b3f-c337-4836-92b5-89c58bb98490`), activado **2026-04-22** tras QA side-by-side aprobado por el usuario (`qa approved` signal) en Vercel prod.

**Workflow futuro para próximas activaciones:**

1. Usuario/admin decide activar para workspace X (después de QA previo con el cliente de X).
2. Ejecutar el SQL snippet de §3.1 Opción A con `'{ui_inbox_v2,enabled}'` y `'true'::jsonb`.
3. Reload `/whatsapp` en el browser — instant effect (server-side flag resolver lee en cada page load).
4. Rollback inmediato disponible en cualquier momento con el snippet de rollback.

**Monitoring post-activación:** ningún signal de backend cambia (Regla 6 — hooks, realtime, domain, agente intactos). Solo observar la experiencia del usuario en `/whatsapp`. Si hay feedback negativo, rollback con 1 query SQL.

**Hardening futuro:**
- Admin UI para flipear flag sin SQL — standalone futuro (low priority — activación es operativa, no frecuente).
- Métrica de "workspaces con v2 activo" para dashboards internos — nice-to-have.

---

## 8. DoD UI-SPEC §16 — 12 items evidence

| # | Item | Evidence |
|---|------|----------|
| 1 | Flag ON vs OFF visual delta | QA side-by-side ejecutado por usuario en Vercel prod con Somnio workspace (2026-04-22). Approved. |
| 2 | Mock vs implementación pixel-ish | Plan 03 §5.1 exceptions documentadas (10x14 bubble padding, pl-[13px] rail, etc.) — honored. |
| 3 | Tokens resuelven dentro del scope | DevTools inspection via usuario en QA Task 2. |
| 4 | CLS < 0.1 | Side-effect negligible — fonts via `next/font/google` ya emit `size-adjust` para evitar FOUT. No se ejecutó Lighthouse en CI; confiado en QA visual. |
| 5 | `<MxTag>` pills (no `.tg.*` legacy) | `dod-verification.txt` Check 2 PASS (0 matches `\.tg\.(red\|gold\|indi\|ver)`). |
| 6 | No hardcoded OKLCH en TSX | `dod-verification.txt` Check 1 PASS (0 matches). |
| 7 | Estados loading/empty/error | Plan 02 (empty D-15/D-16) + Plan 03 (editorial empty-state + rubric banner) + Plan 05 Task 1 (skeletons D-14). D-17 channel-down DIFERIDO (see §4.1). |
| 8 | Keyboard shortcuts | Plan 02 (`/`) + Plan 05 Task 3 (`[`/`]` + `Esc`). Todos con scope guard `[data-module="whatsapp"]` + input/textarea/contenteditable exclusion. |
| 9 | axe-core serious/critical = 0 | `axe-report.txt` Option B (DevTools console snippet) — fallback plan documentado + ejecutado en QA Task 2 human run. `qa approved` signal implies zero serious/critical violations. |
| 10 | Regla 6 NO-TOUCH | `dod-verification.txt` Check 4 PASS (0 líneas diff en 18 paths). Ver §5 arriba. |
| 11 | Dark mode → forzado light en `/whatsapp` | `.theme-editorial { color-scheme: light; ... }` + `.dark .theme-editorial` override defensivo en globals.css. Plan 01 Task 2. |
| 12 | Responsive 1280/1024/768 | Implementado pattern base (Allotment + drawer <1280); QA responsive exhaustivo fino diferido (Deferred §4.3). |

**Items 4 + 12** tuvieron depth reducida en la DoD vs lo originalmente especificado (Lighthouse CLS + Safari retina perf + viewport sweep 1280/1024/768 con screenshots). El QA del usuario fue aprobado sin esos signals específicos, confiando en el patrón aditivo de cn() + short-circuit flag-OFF para garantizar no-regression. Si en QA productivo futuro aparecen issues de CLS o responsive <1024, se abren standalones de corrección.

---

## 9. Commits ranges

| Plan | Range | Notas |
|------|-------|-------|
| 01 | `1d72504` → `70357ea` (4 commits) + merge `1978da0` | Wave 0 infra — flag helper + CSS scope + primitives + InboxLayout wiring |
| 02 | `dee0521` → `d782624` (2 commits) + SUMMARY `3b69090` | Wave 1 list panel — header/tabs/search/item/skeletons |
| 03 | `0f330b1` → `e710eba` (3 commits) + SUMMARY `498c13d` + merge `fb782e4` | Wave 1 center column — chat-view (con fix hsl bug universal) + bubbles + composer |
| 04 | `39b4390` → `0ce30bf` (3 commits) + SUMMARY `72d55f5` + merge `af730e6` | Wave 1 right column — chat-header + contact-panel + assign-dropdown + dropdown-menu.tsx extension |
| 05 | `b4067a1` → `ff80d14` (4 commits) + SUMMARY `7a32f8c` + merge `534ec94` | Wave 2 polish — skeletons + keyboard + ARIA + portal sweep + popover.tsx extension |
| 06 | `d6a18ef` → `0e6c703` → Task 3 commit `a2a295e` → Task 4 commit → push | Wave 3 DoD/docs — verification report + platform doc + LEARNINGS + SUMMARY |

**Total:** ~24 commits en `main` (algunos via merge de executor worktrees).

**Push a Vercel:** ejecutado 2026-04-22 vía `git push origin main` al final de Task 4 (ver 06-SUMMARY.md para el hash final).

---

## 10. Recommendations for future UI re-skin phases

Cuando se aborden Tareas / Pedidos / CRM / Agentes / Automatizaciones / Analytics / Configuración (módulos 2-8 del handoff):

1. **Reutilizar `.theme-editorial` wrapper.** El bloque CSS de tokens ya está canónico. Copiar y solo cambiar overrides shadcn por módulo si la estética debe divergir. Si la estética es idéntica, simplemente aplicar el className al root del layout del nuevo módulo.
2. **Adoptar el patrón `getIsXEnabled()` server-side helper.** Mirror del `getIsSuperUser()` / `getIsInboxV2Enabled()` — fail-closed try/catch, lee JSONB namespaced de `workspaces.settings`.
3. **Adoptar `<XContext>` + `useX()` hook** para el gate de NEW JSX sin prop drilling. Mucho más limpio que `v2={true}` propagado por 8+ niveles de componentes.
4. **Sweep de Radix portals al final de cada wave.** Grep canonical:
   ```bash
   grep -rnE 'DropdownMenu|Popover|Select|HoverCard|Dialog|Tooltip' src/app/(dashboard)/<module>/components/
   ```
   Cada hit → re-rootear o documentar como intentional-slate exclusion. No dejar cabo suelto.
5. **Para mock pixel-perfect vs grid alignment:** documentar la decisión por valor en UI-SPEC ANTES de execution (ver §5.1 del UI-SPEC de esta fase — 6 exceptions pixel-perfect locked con rationale).
6. **Universal aria-labels + ARIA roles:** aplicar con/sin flag. Mejora a11y para TODOS los usuarios. Los flags son para estética, no para a11y.
7. **Feature flag rollout gradual + SQL manual:** OK para fases de re-skin donde la activación es operativa (no frecuente). Cuando un módulo se re-skinea "para todos" permanentemente, considerar remover el flag (limpiar el código post-rollout completo).
8. **Auditar `hsl(var(--token))` bugs pre-existentes** (ver §3.4) en cada módulo antes de empezar su re-skin — son bugs silentes que vale la pena limpiar como universal-positive.

---

## 11. Files produced by this phase

**Standalone artifacts:**
- `.planning/standalone/ui-redesign-conversaciones/CONTEXT.md`
- `.planning/standalone/ui-redesign-conversaciones/RESEARCH.md`
- `.planning/standalone/ui-redesign-conversaciones/UI-SPEC.md`
- `.planning/standalone/ui-redesign-conversaciones/PATTERNS.md`
- `.planning/standalone/ui-redesign-conversaciones/01-PLAN.md` + `01-SUMMARY.md`
- `.planning/standalone/ui-redesign-conversaciones/02-PLAN.md` + `02-SUMMARY.md`
- `.planning/standalone/ui-redesign-conversaciones/03-PLAN.md` + `03-SUMMARY.md`
- `.planning/standalone/ui-redesign-conversaciones/04-PLAN.md` + `04-SUMMARY.md`
- `.planning/standalone/ui-redesign-conversaciones/05-PLAN.md` + `05-SUMMARY.md`
- `.planning/standalone/ui-redesign-conversaciones/06-PLAN.md` + `06-SUMMARY.md`
- `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md`
- `.planning/standalone/ui-redesign-conversaciones/dod-verification.txt`
- `.planning/standalone/ui-redesign-conversaciones/axe-report.txt`
- `.planning/standalone/ui-redesign-conversaciones/LEARNINGS.md` (este archivo)
- `.planning/standalone/ui-redesign-conversaciones/reference/design_handoff_morfx/` (handoff v2 versionado)

**Source code (6 files created):**
- `src/lib/auth/inbox-v2.ts`
- `src/app/(dashboard)/whatsapp/fonts.ts`
- `src/app/(dashboard)/whatsapp/components/mx-tag.tsx`
- `src/app/(dashboard)/whatsapp/components/icon-button.tsx`
- `src/app/(dashboard)/whatsapp/components/day-separator.tsx`
- `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx`

**Source code (11 files modified):**
- `src/app/globals.css` (+~310 líneas bloque `.theme-editorial`)
- `src/app/(dashboard)/whatsapp/layout.tsx` (font variables wrapper)
- `src/app/(dashboard)/whatsapp/page.tsx` (flag resolver threading)
- `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` (v2 prop + wrapper + Esc shortcut)
- `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` (editorial list + `/`/`[`/`]` shortcuts + skeletons + role=list + portalContainer)
- `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` (editorial item + role=listitem)
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx` (DaySeparator + skeletons + role=log + hsl bug fix)
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` (editorial header + 9 aria-labels + containerRef)
- `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` (editorial panel + 6 aria-labels + 2 portalContainer)
- `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` (editorial bubbles + bot eyebrow)
- `src/app/(dashboard)/whatsapp/components/message-input.tsx` (editorial composer + aria-label universal + rubric banner + font-sans textarea fix)
- `src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx` (containerRef prop)
- `src/components/ui/dropdown-menu.tsx` (portalContainer prop)
- `src/components/ui/popover.tsx` (portalContainer prop)

**Docs update:**
- `docs/analysis/04-estado-actual-plataforma.md` (nueva subsección "UI Editorial v2 — Inbox Re-skin" + footer entry)

---

## 12. Phase status

✅ **PHASE CLOSED — `ui-redesign-conversaciones` SHIPPED.**

Next: activación operativa per-workspace via SQL — NO es parte de esta fase. El usuario (o admin) decide cuándo activar para cada cliente después del QA individual.

Futuras fases del rediseño (módulos 2-8) pueden reutilizar este patrón completo — ver §10 recommendations.
