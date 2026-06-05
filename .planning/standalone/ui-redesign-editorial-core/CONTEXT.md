# Standalone: ui-redesign-editorial-core — Context

**Gathered:** 2026-06-05
**Status:** Ready for research/planning

<domain>
## Phase Boundary

Reskin (visual redesign) de **3 content areas** del dashboard al nuevo sistema editorial "paper / Bible / dictionary" entregado por Claude Design (handoff `design_handoff_morfx v2.1`):

1. **WhatsApp · Conversaciones** (`src/app/(dashboard)/whatsapp/**`)
2. **CRM · Contactos** (`src/app/(dashboard)/crm/contactos/**`)
3. **CRM · Pedidos** — tabla + Kanban (`src/app/(dashboard)/crm/pedidos/**`)

\+ el sistema de tokens en `src/app/globals.css` (claro + oscuro).

**Es un RESKIN, no un cambio funcional.** Toda la lógica, datos, server actions, realtime y comportamiento existentes se preservan intactos. Solo cambia el markup (estructura HTML semántica) + clases CSS para que rendericen idénticos a los mocks.

**Fuente de verdad visual:** los mocks HTML del handoff (ver Canonical References). Los mocks mandan sobre cualquier interpretación.

**Objetivo de fidelidad:** ≥95% pixel-match vs mock, verificado con screenshot lado a lado (lección del intento `ui-redesign-dashboard` que quedó en ~35% por reinterpretar en vez de portar verbatim; el retrofit CRM portado verbatim quedó en 89%).
</domain>

<decisions>
## Implementation Decisions

### Tokens / sistema de diseño
- **D-01:** **Big-bang replace** del bloque `.theme-editorial` actual en `globals.css` por el nuevo sistema de `handoff/colors_and_type.css`. NO se mergea token-a-token; se adopta el nuevo sistema como base.
- **D-02:** Incluir **modo oscuro** en esta ronda (claro + oscuro juntos). El handoff trae los overrides `.theme-editorial.dark { … }` + la regla del logo `.theme-editorial.dark .wm img{mix-blend-mode:screen;filter:invert(1) hue-rotate(180deg)}`. (Esto supera la decisión "solo light en v1" del CHANGELOG v2 del handoff — decisión explícita del usuario.)
- **D-03:** Las fuentes ya están cargadas en el repo (EB Garamond / Inter / JetBrains Mono vía `next/font` en `(dashboard)/fonts.ts`). NO hay trabajo de fuentes nuevo — reusar las variables `--font-ebgaramond / --font-inter / --font-jetbrains-mono`.

### Rollout / protección de producción (Regla 6)
- **D-04:** Gating con **feature flag por-workspace, default OFF**, activación manual vía SQL tras QA del usuario — mismo patrón que `ui_inbox_v2.enabled` (rollout per-workspace, sin UI setting).
- **D-05 (RIESGO CRÍTICO a resolver en research):** Conversaciones **ya tiene editorial v2 EN PRODUCCIÓN** bajo `.theme-editorial` (`ui_inbox_v2.enabled=true` en Somnio). Un big-bang replace del bloque `.theme-editorial` (D-01) **regresaría lo que ya funciona** si el nuevo diseño comparte la misma clase/flag. → El nuevo sistema DEBE quedar **aislado** (clase de tema distinta y/o flag nuevo) para que producción actual quede intacta hasta el flip. Research debe definir el mecanismo de aislamiento exacto (clase nueva tipo `.theme-editorial-v3` vs swap de tokens flag-gated). NO se puede tocar el render de Conversaciones v2 live hasta activación explícita.

### Scope / blast radius
- **D-06:** **Sidebar diferido.** El sidebar nuevo del handoff es GLOBAL (afecta los 9 módulos). En esta ronda NO se toca el sidebar — solo el contenido de los 3 content areas. El reskin del sidebar (incluye selector de workspaces 84.6px, logo `<img>`, orden Operación/Automatización/Análisis/Admin) es una ronda follow-up aparte.
- **D-07:** Solo los 3 content areas listados. Los otros 6 mocks (Agentes, Analytics, Automatizaciones, Configuración, Tareas, Landing) quedan deferidos a rondas futuras (ver Deferred).

### Uso de los artefactos del handoff
- **D-08:** Los 16 componentes TSX del handoff (`handoff/src/**`) son **referencia VISUAL**, no drop-in. Usan datos mock. Se portan el markup + clases a los **componentes REALES** preservando el cableado de datos/Supabase/server actions/realtime existente. Esto es lo que evita el gap del 35%.
- **D-09:** Mocks canónicos por pantalla (los `*-editorial.html` / `ui_kits/.../index.html` que el HANDOFF.md §1 designa como destino), NO los `design_handoff_morfx/mocks/*.html` legados (esos conservan `.tg.*` hardcoded). Al portar, reemplazar `.tg.red/.gold/.indi/.ver` legados por las clases oficiales `mx-tag--rubric/gold/indigo/verdigris/ink` construidas con `color-mix` sobre tokens (CHANGELOG §6).

### Claude's Discretion
- Mecánica exacta del aislamiento de tema (D-05) — la decide research/plan con evidencia del código actual.
- Estructura de tareas/olas del plan.
- Cómo mapear `next-themes` (`theme==='dark'`) a la clase `dark` del contenedor raíz del scope nuevo.

### Verificación obligatoria
- **D-10:** Verificación con **screenshot headless lado a lado** (mock vs render real) por pantalla antes de declarar done. Correr el checklist del `HANDOFF.md §5`. Gate de fidelidad ≥95%.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Handoff — guía y reglas
- `.planning/standalone/ui-redesign-editorial-core/handoff/HANDOFF.md` — regla de oro (port verbatim), tabla mock→destino (§1), orden del sidebar (§3, diferido pero referencia), checklist de verificación (§5)
- `.planning/standalone/ui-redesign-editorial-core/handoff/README.md` — fundamentos visuales: paleta, tipografía, espaciado, bordes, sombras, iconografía Lucide 1.5px
- `.planning/standalone/ui-redesign-editorial-core/handoff/design_handoff_morfx/CHANGELOG.md` — decisiones v2/v2.1 (radios, mx-tag oficiales §6, estados loading/empty/error §10, responsive §9)

### Tokens (fuente de verdad del sistema)
- `.planning/standalone/ui-redesign-editorial-core/handoff/colors_and_type.css` — paper/ink/rubric/accent palette, type classes `.mx-*`, rules/ornaments, clases `mx-tag--*`

### Mocks canónicos (fuente de verdad visual) — los 3 content areas
- `.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/conversaciones/index.html` — inbox 3 columnas, burbujas Helvetica Neue, card de pedido
- `.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html` — tabla `dict` de contactos + bloque `<style>` con `.theme-editorial`
- `.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/pedidos/pedidos-editorial.html` — tabla + Kanban (líneas entre stages, sin cajas, cards sueltas, "Sin pedidos")

### TSX de referencia (visual, NO drop-in — D-08)
- `.planning/standalone/ui-redesign-editorial-core/handoff/src/app/(dashboard)/whatsapp/components/*.tsx` (7 componentes)
- `.planning/standalone/ui-redesign-editorial-core/handoff/src/app/(dashboard)/crm/contactos/**` + `crm/pedidos/**`
- `.planning/standalone/ui-redesign-editorial-core/handoff/src/components/contacts/tag-badge.tsx`

### Archivos REALES destino (a reskinear)
- `src/app/globals.css` — bloque `.theme-editorial` (tokens)
- `src/app/(dashboard)/whatsapp/components/**` + `whatsapp/page.tsx`
- `src/app/(dashboard)/crm/contactos/**`
- `src/app/(dashboard)/crm/pedidos/**`
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Fuentes ya cargadas**: `src/app/(dashboard)/fonts.ts` exporta EB Garamond + Inter + JetBrains Mono con las variables `--font-ebgaramond/--font-inter/--font-jetbrains-mono`. Cero trabajo de fuentes nuevo (D-03).
- **`.theme-editorial` ya existe** en `src/app/globals.css` (de redseños previos: ui-redesign-conversaciones + dashboard-retrofit). Tiene tokens paper/ink/rubric, utilidades `.mx-*`, y clases de componentes (`.sb`, `.btn`, `.tg`, `table.dict`, `.tabs`, `.chip`). El big-bang (D-01) lo reemplaza pero hay que aislar del live (D-05).
- **Flag pattern `ui_inbox_v2.enabled`** — rollout per-workspace via SQL ya probado en Somnio. Reusar el patrón (D-04).

### Established Patterns
- Gating de tema via clase en `(dashboard)/layout.tsx` (theme-editorial aplicado condicionalmente). Punto de integración para el flag nuevo.
- `next-themes` controla light/dark globalmente — mapear a la clase `dark` del scope (D-02).
- Componentes WhatsApp/CRM reales ya cableados a Supabase + server actions + realtime — preservar (D-08).

### Integration Points
- `src/app/(dashboard)/layout.tsx` — donde se decide aplicar el theme/flag.
- Tabla de config de workspace (la que controla `ui_inbox_v2.enabled`) — agregar el flag nuevo.

### Riesgos
- **Regla 6 / D-05:** Conversaciones v2 live en Somnio bajo `.theme-editorial`. El aislamiento del nuevo sistema es BLOQUEANTE antes de tocar `globals.css`.
- **Regla 5:** si el flag nuevo vive en una tabla/columna nueva → migración aplicada en prod ANTES de pushear código que la lee.
</code_context>

<specifics>
## Specific Ideas

- Estética: "paper / Bible / dictionary 1950s technical lexicon". Crema cálido, tinta profunda, rojo rúbrica, hairline rules, small-caps, serif-first. Radios ≤4px. Sin gradientes de marca, sin emoji en chrome (solo como data en stage avatars 🥬🍳📦🚚).
- Conversaciones: burbujas en `font-family:'Helvetica Neue'`; card de pedido como card; inbox 3 columnas.
- Pedidos: Kanban con líneas entre stages (sin cajas), cards sueltas, "Sin pedidos" en columnas vacías.
- Copy es-CO, sentence case, em-dash separador, números old-style en prosa / lining en tablas.
</specifics>

<deferred>
## Deferred Ideas

- **Sidebar global nuevo** (selector workspaces 84.6px, logo `<img>`, orden Operación/Automatización/Análisis/Admin, bullets rojos `.cat`) — ronda follow-up; afecta los 9 módulos (D-06).
- **Otros 6 módulos**: Agentes, Analytics, Automatizaciones, Configuración, Tareas, Landing — mocks ya existen en el handoff, rondas futuras (D-07).
- **Texturas de papel** (`--paper-grain` + `--paper-fibers` multiply en body) — el handoff las define; evaluar perf Safari retina antes de aplicar al root (CHANGELOG §7).
- **Estados completos** loading/empty/error tipográficos en los otros módulos (CHANGELOG §10).
</deferred>

---

*Standalone: ui-redesign-editorial-core*
*Context gathered: 2026-06-05*
