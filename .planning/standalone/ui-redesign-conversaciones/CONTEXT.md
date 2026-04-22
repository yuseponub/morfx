# Standalone: UI Redesign — Conversaciones (Módulo 1) - Context

**Gathered:** 2026-04-22
**Status:** Ready for UI-SPEC + research + planning
**Origin:** Handoff de diseño `design_handoff_morfx v2` (Claude Design) — re-skin del módulo 1 Conversaciones a la estética "paper / Bible / dictionary". Zip original en `/mnt/c/Users/Usuario/Downloads/morfx Design System (1).zip`; extraído y versionado en `reference/design_handoff_morfx/`.

<domain>
## Phase Boundary

Re-skineo visual del módulo Conversaciones (`src/app/(dashboard)/whatsapp/**`) — 8 componentes principales — a la estética editorial paper/Bible/dictionary definida en `reference/design_handoff_morfx/colors_and_type.css` v2, adaptándolo al stack existente (Next 15 + Tailwind v4 + shadcn new-york + Geist→EB Garamond/Inter/JetBrains Mono).

**Detrás del flag `ui_inbox_v2_enabled` por workspace** (Regla 6) — el agente WhatsApp en producción atiende clientes reales; la UI nueva solo aplica a workspaces con el flag activo. Workspaces sin el flag ven el UI actual sin cambios.

**Componentes in-scope (8):**
- `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` (183 LOC)
- `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` (302 LOC)
- `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` (190 LOC)
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx` (293 LOC)
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` (471 LOC)
- `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` (839 LOC) — re-skin puro, **no** refactor estructural
- `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` (226 LOC)
- `src/app/(dashboard)/whatsapp/components/message-input.tsx` (441 LOC)

**Fuera de scope:**
- Modales/sheets: `NewConversationModal`, `TemplateSendModal`, `ViewOrderSheet`, `CreateContactSheet`, `CreateOrderSheet`, `AgentConfigSlider` (look actual; fase futura si se decide)
- Otros módulos del handoff (Tareas, Pedidos, CRM, Agentes, Automatizaciones, Analytics, Configuración) — se abordan en standalones separados posteriores
- Sidebar global (`src/components/layout/sidebar.tsx`): aunque el mock la incluye, el re-skin de la sidebar es global (afecta TODOS los módulos del dashboard); queda fuera hasta que se aborden todos los módulos del handoff
- Dark mode (handoff §8 — explícitamente fuera de scope v1 del design system)
- Renombre de la ruta `/whatsapp` → `/conversaciones`: el slug interno del módulo es `whatsapp` en domain, DB tables, webhooks; renombrar es churn. El sidebar ya muestra "WhatsApp" como label; el eyebrow en el mock dice "Módulo · whatsapp" — consistente.
- Refactor estructural de `contact-panel.tsx` (839 LOC): solo re-skin visual
- Cambios en lógica de agente, hooks, realtime, initializeTools safety, debug-panel-production
- Responsive <1280 detallado: el handoff §9 lo especifica; se implementa patrón base pero pruebas responsive rigurosas <1024 quedan para fase posterior

</domain>

<decisions>
## Implementation Decisions

### Feature flag (Regla 6 — proteger agente productivo)

- **D-01:** Flag por workspace `ui_inbox_v2_enabled` en `workspaces.settings` JSONB. Default `false`. Flip manual vía SQL UPDATE o UI admin (scope futuro). Mismo patrón que `conversation_metrics.enabled` y flags de Phase 42.1. Razón: permite activar primero en workspace de pruebas, después en clientes uno a uno; rollback = UPDATE; aislado por workspace (no riesgo cruzado).
- **D-02:** La decisión del flag se resuelve server-side en `src/app/(dashboard)/whatsapp/page.tsx` leyendo `WorkspaceProvider` (o helper análogo a `getIsSuperUser`). Si `false`, renderiza el `<InboxLayout>` actual tal cual. Si `true`, renderiza la variante v2 (misma API, distinto estilo/estructura).
- **D-03:** Cero regresión garantizada: plan final incluye test manual lado a lado con flag on/off en el workspace del usuario (`morfx-dev` o equivalente) antes de merge.

### Token architecture

- **D-04:** Tokens paper/ink/rubric **scoped** dentro de una clase wrapper `.theme-editorial` aplicada al root del layout de `/whatsapp` solo cuando el flag está activo. Fuera de esa ruta, los tokens shadcn slate del proyecto quedan intactos.
- **D-05:** Dentro de `.theme-editorial`, sobrescribir los tokens semánticos shadcn (`--primary`, `--background`, `--foreground`, `--card`, `--border`, `--muted`, `--accent`, `--destructive`, `--radius`, etc.) con los valores paper/ink/rubric correspondientes. Esto hace que TODOS los primitivos shadcn usados dentro del wrapper (Button, Badge, Tabs, Popover, ScrollArea, Sheet, etc.) hereden la estética nueva **sin reescribir componentes**. Mapping exacto lo define research.
- **D-06:** Se añaden además los tokens custom del handoff (`--paper-0..4`, `--ink-1..5`, `--rubric-1..3`, `--accent-verdigris/gold/indigo`, `--font-display/serif/sans/mono`, `--fs-*`, `--space-*`, `--radius-0..pill`, `--paper-grain`, `--paper-fibers`) **idénticos al CSS del handoff** dentro del scope `.theme-editorial`.
- **D-07:** Las clases utilitarias oficiales del handoff (`mx-display`, `mx-h1..h4`, `mx-body`, `mx-smallcaps`, `mx-rubric`, `mx-mono`, `mx-rule*`, `mx-tag--rubric/gold/indigo/verdigris/ink`) se exponen globalmente en `src/app/globals.css` (gated bajo `.theme-editorial` selector para no contaminar otros módulos) o como CSS module propio de `/whatsapp`. Research decide dónde aterrizan.
- **D-08:** Texturas de papel (`--paper-grain`, `--paper-fibers`): se aplican al root `.theme-editorial` con `background-blend-mode: multiply`. Nota handoff §7: si performance baja en Safari retina, mover a `::before` con `opacity: 0.6` + `pointer-events: none`. Research flag esto.

### Tipografía

- **D-09:** Añadir fuentes vía `next/font/google` en `src/app/layout.tsx` (raíz) o en el layout de `/whatsapp` si el bundle no justifica cargarlas globalmente. Variables: `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono`, `--font-cormorant-garamond` (fallback display). Dentro de `.theme-editorial`, los `--font-display/serif/sans/mono` apuntan a esas variables. Geist actual (resto del dashboard) intacto.
- **D-10:** Pesos mínimos a cargar: EB Garamond 400/500/600/700/800 + italic 400/600 (handoff usa italic en `mx-caption` y `mx-marginalia`); Inter 400/500/600/700; JetBrains Mono 400/500. Research confirma pesos exactos vs `next/font` subset.

### Layout y estructura

- **D-11:** Mantener `Allotment` (resize de paneles). Tamaños iniciales alineados al mock: sidebar del dashboard (global, ya existe 232px vía `Sidebar`), lista conversaciones 340px, chat 1fr, panel contacto 320px. Operadores conservan la capacidad de drag (zero UX regression).
- **D-12:** El brand lockup `morf·x` (EB Garamond 800, punto en `--rubric-2`) NO se añade al sidebar en esta fase — la sidebar global es out-of-scope. Se añadirá cuando se re-skinee la sidebar global en fase posterior del rediseño. El mock lo muestra porque es hi-fi, pero nuestro `<InboxLayout>` vive debajo de la sidebar global existente.
- **D-13:** Topbar interno del módulo (eyebrow "Módulo · whatsapp" + título display "Conversaciones" + tabs Todas/Sin asignar/Mías/Cerradas): se integra al header existente de `conversation-list.tsx`. Los tabs actuales (filtros) se re-skineen al estilo del mock (underline 2px ink-1 en activo).

### Estados (loading / empty / error / snoozed) — handoff §10

- **D-14:** Loading: skeleton con bordes 1px `--border` + fondo `--paper-2`, animación `pulse` (opacidad 0.6→1→0.6, 1.5s ease-in-out infinite), mismas proporciones que items reales. Aplica a conversation-list y thread.
- **D-15:** Empty (bandeja vacía): `mx-h3` "La bandeja está limpia." + `mx-caption` "Cuando llegue un mensaje nuevo aparecerá aquí." + `mx-rule-ornament` decorativa (`· · ·`). Sin ilustración.
- **D-16:** Empty (filtro sin resultados): `mx-h4` "Nada coincide con los filtros activos." + botón sans "Limpiar filtros" estilo link con borde inferior 1px.
- **D-17:** Error (canal caído, WhatsApp API down): banner top del panel con `background: color-mix(in oklch, var(--rubric-2) 8%, var(--paper-0))`, `border-left: 3px solid var(--rubric-2)`, ícono `AlertTriangle` en `--rubric-2`, texto serif + botón sans "Reintentar".
- **D-18:** Conversación `snoozed`: item en lista con opacidad 0.6 + ícono `Moon` Lucide junto al timestamp mono. Pill `mx-tag--ink` con label "snoozed hasta {fecha}".

### Realtime y lógica (NO tocar)

- **D-19:** Regla 6 estricta: `initializeTools()` safety net, `useConversations()` hook, realtime Supabase subscriptions, webhook handlers, `executeToolFromAgent`, `markAsRead`, `getConversation`, `AvailabilityToggle`, `WindowIndicator`, `DebugPanelProduction` (Phase 42.1), `AgentConfigSlider` — cero modificaciones lógicas. Solo re-skin visual de su contenedor si está in-scope.
- **D-20:** Bubbles del thread (`message-bubble.tsx`): solo cambian estilos visuales. Propiedades como `direction`, `status`, `mediaPreview`, `templateMetadata`, `quickReplyButtons` se respetan — los nuevos estilos deben soportarlas todas sin regresión.

### Iconografía

- **D-21:** Mantener `lucide-react` (ya está en deps). Research verifica la versión exacta instalada y si hay que fijar en `package.json` (handoff §11 recomienda `0.460.0` o la estable al momento). Si la versión actual es ≥ 0.460.0 stable, dejarla; si es `latest`/unstable, fijar.
- **D-22:** Íconos del mock a mapear: `Search`, `UserPlus`, `Tag`, `MoreHorizontal`, `Send`, `AlertTriangle`, `Moon`, `ChevronRight` (caret para inspectors). Los del sidebar global ya existen.

### Accesibilidad (handoff §13)

- **D-23:** Keyboard navigation: `Esc` cierra panels/drawers, `/` enfoca búsqueda de la lista, `[`/`]` navegan conversaciones previa/siguiente, Tab order coherente, focus-visible siempre. El shortcut `/` ya existe global (`GlobalSearch`) — verificar conflicto y ajustar scope (solo cuando focus está dentro del módulo).
- **D-24:** Todos los botones `ibtn` (32×32) tienen `aria-label` en español. Contraste WCAG AA mínimo entre texto y fondo (paper-0 sobre ink-1 cumple; validar pills con `color-mix`).

### Claude's Discretion

Areas donde el usuario delega a Claude por defecto:
- Pesos exactos de Google Fonts vs tamaño de bundle (investigado en research)
- Estrategia exacta de carga de fuentes: `next/font/google` en root layout vs en `(dashboard)/whatsapp/layout.tsx`
- Mapping fino entre tokens shadcn (`--primary`, `--accent`, `--ring`, etc.) y tokens del handoff (`--ink-1`, `--rubric-2`, etc.) dentro de `.theme-editorial`
- CSS modules vs global classes para las utilitarias `mx-*` (globals.css gated por selector `.theme-editorial` vs CSS module local)
- Cómo exponer los campos OKLCH al `@theme` de Tailwind v4 (research decide si `@theme` o `:root` + inline tokens)
- Arquitectura del feature flag server-side: helper nuevo (`getIsInboxV2Enabled(workspaceId)`) vs lectura directa de `WorkspaceProvider`
- Si conviene introducir un componente `<Brand />` aunque la sidebar esté fuera de scope (para el topbar interno del módulo — aunque según D-13 el topbar lo lleva conversation-list, no requiere Brand hasta que se ataque sidebar global)

</decisions>

<specifics>
## Specific Ideas

- **Fuente de verdad visual:** `reference/design_handoff_morfx/colors_and_type.css` v2 — no README. Confirmado en CHANGELOG v2 del handoff.
- **Mocks de referencia:** `reference/design_handoff_morfx/mocks/conversaciones.html` como comparación pixel-perfect. Abrir en navegador local al implementar cada componente.
- **Vista ejemplo del mock:** layout 4-col (sidebar / lista / chat / contacto), thread con separador `— Martes 21 de abril —` en smallcaps, bubbles in con fondo `paper-0` + borde `ink-2`, bubbles own con fondo `ink-1` + texto `paper-0`, radius 10px con corner 2px, timestamp mono.
- **Eyebrow pattern:** etiquetas `mx-smallcaps` en rubric-2 encima de títulos display (ej: "Módulo · whatsapp" + "Conversaciones" / "Contacto · activo" + "Juan Carlos Pérez").
- **Pill selected (conversación activa):** `background: paper-0; border-left: 3px solid rubric-2; padding-left: 13px`.
- **Composer del mock:** border-top 1px ink-1, fondo paper-0, input bordered con paper-1 interior, botón send ink-1 solid con texto paper-0.
- **Estados "bot · respuesta sugerida"** en mock: label `mx-smallcaps` rubric-2 sobre bubble own — traducir a nuestro indicador de respuesta sugerida por agente IA (ya existe lógica; solo adaptar visual).

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Handoff de diseño (fuente de verdad visual)
- `.planning/standalone/ui-redesign-conversaciones/reference/design_handoff_morfx/README.md` — v2 consolidado (18 secciones). §2 estética, §5 tokens, §6 clases oficiales, §7 texturas, §8 dark mode, §9 responsive, §10 estados, §11 Lucide, §13 comportamiento/a11y, §17 DoD.
- `.planning/standalone/ui-redesign-conversaciones/reference/design_handoff_morfx/CHANGELOG.md` — qué cambió v1→v2, especialmente el fix de tipografía (EB Garamond, no Instrument Serif).
- `.planning/standalone/ui-redesign-conversaciones/reference/design_handoff_morfx/colors_and_type.css` — tokens OKLCH + `@font-face` + utilitarias `mx-*` + clases `mx-tag--*` (fuente de verdad; README se ajusta al CSS si hay conflicto).
- `.planning/standalone/ui-redesign-conversaciones/reference/design_handoff_morfx/mocks/conversaciones.html` — mock hi-fi pixel-perfect del módulo 1. Abrir en browser al implementar.

### Código actual del módulo (8 componentes in-scope)
- `src/app/(dashboard)/whatsapp/page.tsx` — decisión del flag va aquí (D-02).
- `src/app/(dashboard)/whatsapp/layout.tsx` — root del módulo; wrapper `.theme-editorial` va aquí o en page.tsx (research decide).
- `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` — layout 3-col con Allotment.
- `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` — lista + header con tabs + search.
- `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` — item card (avatar, nombre, preview, tm, pills).
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx` — thread container.
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` — header del chat con nombre, meta, acciones.
- `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` — panel contexto cliente (más grande, 839 LOC; solo re-skin).
- `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` — bubble individual.
- `src/app/(dashboard)/whatsapp/components/message-input.tsx` — composer.

### Stack y tokens existentes
- `src/app/globals.css` — Tailwind v4 `@theme inline` con tokens shadcn actuales. Los tokens del handoff NO reemplazan los existentes; se scopean bajo `.theme-editorial` (D-04).
- `src/app/layout.tsx` — root; ahí se cargan fuentes Geist hoy y se añaden EB Garamond/Inter/JetBrains Mono en D-09.
- `components.json` — shadcn config (`new-york`, baseColor slate, cssVariables, lucide).
- `src/components/layout/sidebar.tsx` — sidebar global del dashboard (out-of-scope; referencia para saber qué NO tocar).

### Reglas del proyecto
- `CLAUDE.md` Regla 0 — GSD completo obligatorio.
- `CLAUDE.md` Regla 6 — proteger agente en producción (motiva D-01 feature flag).
- `.claude/rules/code-changes.md` — bloqueante: sin PLAN aprobado no se edita código.

### Patrones análogos en el repo
- `src/lib/auth/super-user.ts` + `getIsSuperUser()` — patrón server-side para leer flags del workspace; `getIsInboxV2Enabled()` lo imita.
- Phase 42.1 debug-panel-production — ejemplo de feature gate server-side que no rompe Regla 6.
- `conversation_metrics.enabled` en `workspaces.settings` (sidebar.tsx `settingsKey`) — patrón exacto para `ui_inbox_v2_enabled`.

### Consultas externas para research
- Tailwind v4 `@theme` con múltiples scopes condicionales (la comunidad tiene patterns para sub-temas sin `dark:` variant).
- shadcn `new-york` token override dentro de un contenedor (hay issues en shadcn/ui sobre esto).
- `next/font/google` con 4 familias + peso subsetting — research bundle size.
- Lucide `0.460.0` vs versión actual en `package.json`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Shadcn primitives completos** (`src/components/ui/*`): Button, Badge, Tabs, ScrollArea, Sheet, Dialog, Popover, Tooltip, Avatar, Card, Input, Label, Timeline, Separator, Switch, Select, DropdownMenu, Checkbox, Table. Todos re-skineables vía override de tokens dentro de `.theme-editorial` (D-05).
- **`Allotment`** ya instalado y usado en `inbox-layout.tsx` — se mantiene (D-11).
- **`useConversations()` hook**, realtime subscriptions, `markAsRead`, `getConversation` server action — intactos (D-19).
- **`cn()` util** (`@/lib/utils`) — disponible para combinar clases condicionales incluyendo `.theme-editorial`.
- **Dashboard `Sidebar`** — no se toca; el re-skin visual del chrome global queda out-of-scope.

### Established Patterns
- **Server components como entry point**, client components para interactividad — `page.tsx` server → `<InboxLayout>` client.
- **Feature gating server-side** vía `workspaces.settings` JSONB con `settingsKey: 'namespace.key'` (ver `sidebar.tsx` NavItem). Reutilizar.
- **`next-themes` con `disableTransitionOnChange`** — el dashboard soporta dark/light, pero D-D queremos forzar light dentro de `.theme-editorial` (research: ¿añadir `forcedTheme` o `data-theme="light"` al wrapper?).
- **Tailwind v4 `@theme inline`** en globals.css para mapear CSS vars → Tailwind utilities. Patrón para añadir paper/ink/rubric.

### Integration Points
- `src/app/(dashboard)/whatsapp/page.tsx` — punto de decisión del flag (D-02); resuelve `WorkspaceProvider` + `getIsInboxV2Enabled()` y pasa `v2={true|false}` a `<InboxLayout>` o renderiza distintos árboles.
- `src/app/(dashboard)/whatsapp/layout.tsx` — 11 LOC hoy; aquí o en `page.tsx` se aplica `<div className="theme-editorial">` wrapper.
- `src/app/globals.css` — se añade bloque `.theme-editorial { ... }` con tokens del handoff + clases `mx-*` gated por ese selector.
- `src/app/layout.tsx` — se añaden fuentes `next/font/google` con variables CSS que las `.theme-editorial` consume.

</code_context>

<deferred>
## Deferred Ideas

Ideas que aparecieron durante el análisis pero pertenecen a otras fases / standalones:

- **Re-skin sidebar global + topbar global del dashboard** al estilo editorial. Necesario para que el mock se vea 100% fiel (incluye lockup `morf·x`), pero afecta los 13+ módulos del dashboard. Se aborda como standalone propio (`ui-redesign-dashboard-chrome`) después de validar el módulo 1.
- **Módulos 2–8 del handoff** (Tareas, Pedidos, CRM, Agentes, Automatizaciones, Analytics, Configuración): cada uno como standalone propio siguiendo el orden del handoff §4. Pueden reutilizar `.theme-editorial` wrapper una vez exista.
- **Rollout del flag `ui_inbox_v2_enabled` a clientes productivos**: después de QA lado a lado, activarlo workspace por workspace con Marlon. No es parte de esta fase (la fase entrega el código + flag; la activación es operativa).
- **Dark mode editorial**: requiere ronda de diseño específica (handoff §8). No se toca.
- **UI admin para flipear flags de workspace**: hoy se hace vía SQL. Standalone futuro.
- **Brand component `<Brand />`**: se introducirá cuando se ataque sidebar/topbar globales, no ahora.
- **Re-skin de modales y sheets internos** (`NewConversationModal`, `TemplateSendModal`, `ViewOrderSheet`, `CreateOrderSheet`, `CreateContactSheet`, `AgentConfigSlider`): fase de seguimiento (`ui-redesign-conversaciones-modales`) una vez aprobado el re-skin base.
- **Refactor estructural de `contact-panel.tsx`** (839 LOC): rompe SRP; valdría la pena dividir en subcomponentes. No se toca en esta fase para minimizar riesgo.
- **Responsive exhaustivo <1024px** con drawer-stack (§9 handoff): implementamos el patrón base (breakpoints + colapso), pero QA riguroso y ajustes finos quedan para follow-up.
- **Performance de texturas SVG en Safari retina**: si research indica problemas, moverlo a `::before` queda documentado pero se implementa inicialmente con el patrón simple del handoff. Si aparece regresión en QA, se ajusta.
- **Storybook**: no existe hoy; añadirlo para documentar las variantes editoriales sería valioso pero está out-of-scope.

</deferred>

---

*Standalone: ui-redesign-conversaciones*
*Context gathered: 2026-04-22*
*Next: `/gsd-ui-phase ui-redesign-conversaciones` → `/gsd-research-phase ui-redesign-conversaciones` → `/gsd-plan-phase ui-redesign-conversaciones`*
