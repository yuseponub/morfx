---
phase: standalone
slug: ui-redesign-conversaciones
status: approved
shadcn_initialized: true
preset: "new-york · slate · cssVariables · lucide (scoped override via .theme-editorial)"
created: 2026-04-22
reviewed_at: 2026-04-22
revision: 1
---

# Standalone — UI Design Contract · Re-skin Módulo Conversaciones

> Contrato visual y de interacción para el re-skin editorial ("paper / Bible / dictionary") del módulo `/whatsapp`. El módulo atiende clientes productivos (Regla 6), por eso todo el contrato se aplica **solo bajo `.theme-editorial`** y **solo a workspaces con `ui_inbox_v2_enabled = true`**. Fuera del flag, el UI actual shadcn-slate queda intacto.
>
> Fuente de verdad visual: `reference/design_handoff_morfx/colors_and_type.css` (v2). Mock pixel-perfect: `reference/design_handoff_morfx/mocks/conversaciones.html`.

---

## 0 · Alcance y principios operativos

### Componentes in-scope (8)
| # | Archivo | LOC | Scope |
|---|---------|-----|-------|
| 1 | `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` | 183 | Layout Allotment + wrapper `.theme-editorial` |
| 2 | `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` | 302 | Header eyebrow/h1/tabs + search + virtualized list |
| 3 | `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` | 190 | Item card (avatar, nombre, preview, tm, tags, selected rail) |
| 4 | `src/app/(dashboard)/whatsapp/components/chat-view.tsx` | 293 | Thread container con separadores de día |
| 5 | `src/app/(dashboard)/whatsapp/components/chat-header.tsx` | 471 | Header del chat (nombre/meta/acciones/ibtn) |
| 6 | `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` | 839 | Ficha + Pedidos + Historial (solo re-skin, **sin refactor**) |
| 7 | `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` | 226 | Bubble in/own + timestamps + bot eyebrow |
| 8 | `src/app/(dashboard)/whatsapp/components/message-input.tsx` | 441 | Composer (border-top + input + send) |

### Fuera de scope (verificado en CONTEXT.md)
- Modales/sheets: `NewConversationModal`, `TemplateSendModal`, `ViewOrderSheet`, `CreateContactSheet`, `CreateOrderSheet`, `AgentConfigSlider` — mantienen shadcn-slate actual.
- `Sidebar` global (`src/components/layout/sidebar.tsx`) — no se toca (afecta 13+ módulos; standalone futuro).
- Ruta `/whatsapp` se mantiene (no rename a `/conversaciones`).
- Dark mode (handoff §8 fuera de v1 → forzar light bajo el wrapper).
- Refactor estructural de `contact-panel.tsx` (solo re-skin).
- Responsive riguroso <1024px (se implementa patrón base, QA fino es follow-up).

### Regla 6 — cero tocar lógica (D-19, D-20)
- **NO modificar:** `initializeTools()`, `useConversations()`, realtime Supabase subscriptions, webhook handlers, `executeToolFromAgent`, `markAsRead`, `getConversation`, `AvailabilityToggle`, `WindowIndicator`, `DebugPanelProduction` (Phase 42.1), `AgentConfigSlider`.
- Cambios son exclusivamente: clases CSS, estructura JSX cosmética, tokens. Props y firmas de componentes **no cambian**.

---

## 1 · Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (ya inicializado — `components.json` presente) |
| Preset | `new-york` · baseColor `slate` · cssVariables `true` · iconLibrary `lucide` |
| Component library | Radix UI primitives via shadcn (ya instalados — ver `package.json`) |
| Icon library | `lucide-react@^0.563.0` (ya en deps; ≥ 0.460.0 requerido por handoff §11 → **OK**, no requiere bump) |
| Font | EB Garamond (display/serif) + Inter (sans UI) + JetBrains Mono (mono) + Cormorant Garamond (fallback display) vía `next/font/google`. Geist actual del root layout intacto para el resto del dashboard |
| Themeing strategy | **Scoped override**: tokens editoriales viven dentro de `.theme-editorial` (clase wrapper); fuera del wrapper los tokens shadcn-slate de `globals.css` quedan intactos |
| Flag gate | `ui_inbox_v2_enabled` (boolean en `workspaces.settings` JSONB, default `false`) — resuelto server-side en `page.tsx` (research define si nuevo helper `getIsInboxV2Enabled(workspaceId)` o lectura directa de `WorkspaceProvider`) |

**Registries:** solo shadcn oficial. **Sin registries de terceros.** Registry safety gate: **no aplica** (no se declaran third-party blocks).

---

## 2 · Design Tokens (scoped bajo `.theme-editorial`)

> Todos los valores vienen literalmente del handoff (`colors_and_type.css` v2). Los nombres preservan el prefijo del handoff. Dentro del scope, los tokens semánticos de shadcn (`--primary`, `--background`, etc.) se sobrescriben al aliasing correspondiente (§4 mapping).

### 2.1 Paleta papel (background surfaces)
| Token | Valor OKLCH | Uso |
|-------|-------------|-----|
| `--paper-0` | `oklch(0.995 0.008 85)` | Highlight sheet (bubble entrante, chat header, ítem seleccionado, ibtn background, order card, contact avatar bg) |
| `--paper-1` | `oklch(0.985 0.012 82)` | **Página principal** (conversation-list, composer input, thread background) |
| `--paper-2` | `oklch(0.970 0.016 80)` | Card secundaria (contact-panel background, sidebar global si se skineara, hover row) |
| `--paper-3` | `oklch(0.945 0.020 78)` | Recessed / hover profundo (ibtn:hover, avatar fill fallback) |
| `--paper-4` | `oklch(0.915 0.026 76)` | Divider wash |
| `--paper-shadow` | `oklch(0.82 0.035 70)` | Deep paper crease (no usado directamente por el módulo) |

### 2.2 Paleta tinta (foreground)
| Token | Valor OKLCH | Uso |
|-------|-------------|-----|
| `--ink-1` | `oklch(0.18 0.02 60)` | **Tinta primaria** — títulos display, ítem seleccionado border, bubble own bg, send button bg, headings |
| `--ink-2` | `oklch(0.32 0.025 60)` | Body ink — previews, bubble in text, descripciones de pedido |
| `--ink-3` | `oklch(0.48 0.03 65)` | Secondary / quiet — eyebrow caps, timestamps mono, meta, labels H3 uppercase en contact-panel |
| `--ink-4` | `oklch(0.62 0.035 70)` | Anotación faded |
| `--ink-5` | `oklch(0.78 0.03 72)` | Muy tenue (separadores sutiles) |

### 2.3 Paleta rúbrica (acento primario — **10% de la UI**)
| Token | Valor OKLCH | Uso |
|-------|-------------|-----|
| `--rubric-1` | `oklch(0.45 0.09 28)` | Rúbrica profunda (text-on-paper de `mx-tag--rubric`) |
| `--rubric-2` | `oklch(0.55 0.10 30)` | **Rúbrica estándar — acento primario** (ver §3.4 reserved-for list) |
| `--rubric-3` | `oklch(0.70 0.07 32)` | Rúbrica clara / wash (avatar bot tint) |

### 2.4 Acentos de tinta de color (sparse — nunca dominantes)
| Token | Valor OKLCH | Uso |
|-------|-------------|-----|
| `--accent-verdigris` | `oklch(0.52 0.035 180)` | Tags `mx-tag--verdigris` (ej: mayorista) · timeline `human` dot |
| `--accent-gold` | `oklch(0.68 0.055 80)` | Tags `mx-tag--gold` (ej: vip, pendiente pago) · timeline `warn` dot |
| `--accent-indigo` | `oklch(0.42 0.045 260)` | Tags `mx-tag--indigo` (ej: prospecto) · timeline `system` dot · semantic info |

### 2.5 Semánticos
| Token | Valor |
|-------|-------|
| `--semantic-success` | `oklch(0.50 0.08 145)` |
| `--semantic-warning` | `oklch(0.58 0.12 65)` |
| `--semantic-danger` | `var(--rubric-2)` (alias) |
| `--semantic-info` | `var(--accent-indigo)` (alias) |

### 2.6 Aliases globales (internos al scope)
```
--bg:            var(--paper-1)
--bg-elev:       var(--paper-0)
--bg-sunken:     var(--paper-2)
--fg:            var(--ink-1)
--fg-muted:      var(--ink-3)
--fg-faint:      var(--ink-4)
--border:        oklch(0.80 0.025 72)
--border-strong: var(--ink-1)
--rule:          var(--ink-2)
```

### 2.7 Familias tipográficas (variables CSS expuestas por `next/font`)
```
--font-display:    'EB Garamond', 'Cormorant Garamond', 'Times New Roman', Georgia, serif
--font-serif:      'EB Garamond', Georgia, 'Times New Roman', serif
--font-sans:       'Inter', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif
--font-mono:       'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace
--font-small-caps: 'EB Garamond', Georgia, serif
```

### 2.8 Radios (el papel no redondea)
| Token | Valor | Notas |
|-------|-------|-------|
| `--radius-0` | `0px` | Reglas, separadores |
| `--radius-1` | `2px` | Corner del bubble opuesto al pico (border-bottom-left/right-radius del bubble) |
| `--radius-2` | `3px` | Sidebar nav items (activos), avatars cuadrados |
| `--radius-3` | `4px` | **Default** — inputs, ibtn, send button, order card (el mock usa 12px para `.ord` específicamente — ver §5.6) |
| `--radius-pill` | `999px` | Pills (`mx-tag`), avatars circulares, unread badge |

### 2.9 Sombras (warm, paper-on-paper)
```
--shadow-hair:   0 0 0 0.5px var(--border)
--shadow-page:   0 1px 0 var(--border), 0 12px 28px -14px oklch(0.3 0.04 60 / 0.25)
--shadow-card:   0 1px 0 var(--border), 0 4px 12px -6px  oklch(0.3 0.04 60 / 0.18)
--shadow-raised: 0 1px 0 var(--border), 0 10px 24px -10px oklch(0.25 0.05 60 / 0.28)
```

### 2.10 Texturas de papel (handoff §7)
- `--paper-grain` (240×240 SVG con `feTurbulence baseFrequency='0.85'`) — aplicada al root `.theme-editorial`.
- `--paper-fibers` (400×400 SVG con `feTurbulence baseFrequency='0.012 0.9'`) — también al root.
- Aplicación: `background-image: var(--paper-grain), var(--paper-fibers); background-blend-mode: multiply;`
- **Flag de performance:** si QA detecta caída de frame rate en Safari retina, research recomienda mover a pseudo-elemento:
  ```css
  .theme-editorial { position: relative; isolation: isolate; }
  .theme-editorial::before {
    content: ""; position: absolute; inset: 0;
    background-image: var(--paper-grain), var(--paper-fibers);
    background-blend-mode: multiply;
    opacity: 0.6; pointer-events: none; z-index: -1;
  }
  ```
- **NO aplicar texturas a** cards individuales, canvas interactivos, `message-bubble` superficies.

---

## 3 · Color Contract (60 / 30 / 10)

| Role | Token | % aproximado | Uso explícito en este módulo |
|------|-------|--------------|------------------------------|
| **Dominant (60%)** | `--paper-1` (conversation-list, thread bg) + `--paper-0` (chat-header, composer, bubble in, selected item) | ~60% | Toda superficie "página" |
| **Secondary (30%)** | `--paper-2` (contact-panel bg, hover row) + `--ink-1` (bubble own, send button, texto primario, separadores) | ~30% | Paneles, acciones primarias monocromas, tipografía |
| **Accent (10%)** | `--rubric-2` (rojo rúbrica) | ~10% | Ver lista explícita §3.4 |
| **Destructive** | `--rubric-2` (alias `--semantic-danger`) | <2% | Banners de error de canal, confirmaciones destructivas |

### 3.4 `--rubric-2` — accent reserved-for list (**NO usar en otros elementos**)
1. **Eyebrow smallcaps** encima de títulos display (`"Módulo · whatsapp"`, `"Contacto · activo"`, `"bot · respuesta sugerida"`) — color `--rubric-2` exacto.
2. **Punto del lockup `morf·x`** — OUT OF SCOPE (sidebar global), pero documentado.
3. **Border-left 3px del ítem seleccionado** en `conversation-list` (`.it.on { border-left: 3px solid var(--rubric-2); padding-left: 13px; }`).
4. **Dot unread** junto al nombre (6×6 circle `background: var(--rubric-2)`).
5. **Unread badge count** en ítem de conversación (`background: var(--rubric-2); color: var(--paper-0); font-mono 700`).
6. **Tag `mx-tag--rubric`** para labels tipo "cliente" (construido con `color-mix` — **no** usar OKLCH hardcoded).
7. **Banner de error de canal** (`border-left 3px solid var(--rubric-2)`, `background: color-mix(in oklch, var(--rubric-2) 8%, var(--paper-0))`, ícono `AlertTriangle` en `--rubric-2`).
8. **Ícono dropcap** (no usado en v1 del módulo, documentado).
9. **Hover de acciones en contact-panel** — links `.act a:hover { color: var(--rubric-2); }`.
10. **Timeline dot `bot`** (indicador de evento de agente IA) — border coloreado `--rubric-2` sobre fondo `--paper-0`.
11. **`alert-triangle` icon en estados de error** (§7.3).

### 3.5 Acentos desaturados (verdigris / gold / indigo) — uso sparse
- **Nunca** dominantes en la UI del módulo.
- Aparecen solo en pills `mx-tag--gold/indigo/verdigris` y como timeline dots por tipo.
- Pills se construyen **siempre** con `color-mix(in oklch, <token> 10–14%, var(--paper-0))` — **prohibido** OKLCH hardcoded (ver handoff §6 y CHANGELOG).

---

## 4 · Mapping shadcn semantic tokens → tokens editoriales

Dentro del scope `.theme-editorial`, los tokens semánticos de shadcn se sobrescriben para que TODOS los primitivos (`Button`, `Badge`, `Tabs`, `Popover`, `ScrollArea`, `Sheet`, `Input`, `Tooltip`, `DropdownMenu`, `Separator`) hereden la estética nueva **sin reescribir componentes** (D-05). Research decide si se aplican via `@theme` scope o via `:root` override dentro del selector.

| shadcn token (slate, actual) | Override bajo `.theme-editorial` |
|------------------------------|----------------------------------|
| `--background` | `var(--paper-1)` |
| `--foreground` | `var(--ink-1)` |
| `--card` | `var(--paper-0)` |
| `--card-foreground` | `var(--ink-1)` |
| `--popover` | `var(--paper-0)` |
| `--popover-foreground` | `var(--ink-1)` |
| `--primary` | `var(--ink-1)` (mock usa ink-1 sólido para el send button y nav activa — **NO** rubric-2, que es accent no primary) |
| `--primary-foreground` | `var(--paper-0)` |
| `--secondary` | `var(--paper-2)` |
| `--secondary-foreground` | `var(--ink-1)` |
| `--muted` | `var(--paper-2)` |
| `--muted-foreground` | `var(--ink-3)` |
| `--accent` | `var(--paper-3)` (hover suave; NO el rubric — rubric es reservado §3.4) |
| `--accent-foreground` | `var(--ink-1)` |
| `--destructive` | `var(--rubric-2)` |
| `--border` | `oklch(0.80 0.025 72)` (alias `--border` del handoff) |
| `--input` | alias `--border` |
| `--ring` | `var(--ink-1)` con offset 2px (focus-visible editorial: outline fino de tinta) |
| `--radius` | `var(--radius-3)` → `4px` (el mock usa 3–4px salvo order-card 12px) |

> **Nota crítica para el planner:** `--primary` mapea a `ink-1` (tinta negra), **no** a `rubric-2`. El rojo rúbrica es accent minoritario. Confundirlos rompe la estética (§2 handoff: "rojo rúbrica como único acento cromático protagonista" — protagonista no significa dominante; significa único color cromático que destaca).

---

## 5 · Spacing Scale (grid de 4px — handoff §5)

Declarar valores (múltiplos de 4 estrictos):

| Token | Valor | Usage en el módulo |
|-------|-------|--------------------|
| `--space-1` | 4px | Gap micro dentro de tags (ícono + label), margin entre dot unread y nombre |
| `--space-2` | 8px | Gap entre ibtn del chat-header, gap entre pills, thread message gap default |
| `--space-3` | 12px | Padding vertical del composer, separación conversation-item top del thread |
| `--space-4` | 16px | Padding horizontal del conversation-list header, padding vertical items, padding contact-panel sections |
| `--space-5` | 24px | Padding del thread container horizontal (22–24), padding contact-panel head |
| `--space-6` | 32px | Layout gaps entre secciones del panel |
| `--space-7` | 48px | Major section breaks (no usado en conversation module, documentado) |
| `--space-8` | 64px | Page-level spacing (no aplica dentro del inbox) |
| `--space-9` | 96px | No usado |

### Paddings específicos del mock (exactos — referencia para planner/executor)
| Área | Padding | Notas |
|------|---------|-------|
| Sidebar brand | `18px 18px 14px` | OUT OF SCOPE v1 |
| Sidebar nav item | `7px 10px` | OUT OF SCOPE v1 |
| `conversation-list` `.head` | `16px 18px 12px` + border-bottom 1px `--ink-1` | In-scope |
| `conversation-list` `.search` | `10px 14px` + border-bottom 1px `--border` | In-scope |
| `conversation-item` `.it` | `12px 16px` + border-bottom 1px `--border` | In-scope |
| `conversation-item` `.it.on` (selected) | `12px 16px 12px 13px` (padding-left 13px para compensar border-left 3px) | **Crítico** |
| `chat-view` `.head` | `14px 20px` + border-bottom 1px `--ink-1` | In-scope |
| `chat-view` `.thread` | `22px 24px` + gap 8px vertical | In-scope |
| `chat-view` `.composer` | `12px 20px` + border-top 1px `--ink-1` + gap 10px | In-scope |
| `message-bubble` `.b` | `10px 14px` | In-scope |
| `contact-panel` `.head` | `22px 20px 14px` + border-bottom 1px `--ink-1` | In-scope |
| `contact-panel` section | `14px 18px` + border-bottom 1px `--border` | In-scope |
| `contact-panel` dl `grid` | `grid-template-columns: 1fr 1.4fr; gap: 8px 10px` | In-scope |
| `order-card` `.ord` | `9px 11px` + radius 12px + shadow 0 1px 0 border | In-scope |
| `ibtn` (icon button) | 32×32 + border 1px `--border` + radius `--radius-3` | A11y min touch 44px es excepción permitida abajo |

### 5.1 Excepciones catalogadas (TODOS los valores no-múltiplo-de-4 del mock)

> Decisión concreta por valor: "Sí — mock pixel-perfect" = mantener por jerarquía visual crítica; "Redondear a Xpx" = el planner aplica el valor de grid en execution; "Validar en QA" = probar ambas opciones y decidir.

| Área (componente + selector mock) | Valor exacto | Valor grid alternativo (4px múltiplo) | Justificación | ¿Mantener? |
|---|---|---|---|---|
| `ibtn` tamaño (chat-header acciones — `.right .ibtn`) | 32×32 | 32 ya es múltiplo de 4; touch target 44 es WCAG | Densidad editorial del handoff §9; el mock lo declara explícitamente a 32. A11y compensada con aria-label + focus-visible + viewport desktop-first | **Sí — mock pixel-perfect** |
| `conversation-item` `.it.on` padding-left | 13px | 16px (si se mueve el border-left fuera del box) | Los 13px son `16 − 3` para compensar el `border-left: 3px solid var(--rubric-2)`. Si se usara `box-shadow inset 3px 0 rubric-2` se podría mantener padding-left 16 uniforme | **Sí — mock pixel-perfect** (pero documentar alternativa box-shadow inset como opción A/B para execution si la compensación visual se pierde en zoom/scale) |
| `conversation-list` `.head` padding | `16px 18px 12px` | `16px 16px 12px` | El `18px` lateral es arbitrario vs `.it` que usa 16px. La diferencia de 2px entre header y items crea inconsistencia horizontal perceptible | **Redondear a `16px 16px 12px`** — alinea horizontal con items, cero regresión visual vs mock a ≥100% zoom |
| `chat-view` `.head` padding | `14px 20px` | `16px 20px` (o `12px 20px`) | El `14px` vertical es intermedio entre 12 y 16. Visualmente el handoff busca header "delgado" vs thread "generoso" | **Redondear a `12px 20px`** — mantiene relación visual de header delgado, cae en grid. (Si en execution el header se ve cortado vs mock, fallback a `16px 20px`) |
| `chat-view` `.thread` padding | `22px 24px` | `24px 24px` | El `22px` top es apenas 2px menos que 24 y responde a "respirar desde el header" | **Redondear a `24px 24px`** — simétrico, cae en grid, diferencia imperceptible |
| `contact-panel` section padding | `14px 18px` | `16px 16px` o `12px 16px` | `14px 18px` no cae en grid en ningún eje. Las secciones son repetitivas (Ficha/Pedidos/Historial) y merecen consistencia | **Redondear a `16px 16px`** — simétrico con `.it`, cae en grid, planner aplica en execution |
| `contact-panel` `.head` padding | `22px 20px 14px` | `24px 20px 16px` | Los 22 top y 14 bottom son ambos ±2 del grid. El head es único (una vez por panel) — menos crítico que las sections | **Redondear a `24px 20px 16px`** — 20px lateral se conserva (alinea con otros paneles de 20px horizontal tipo composer/chat-header) |
| `order-card` `.ord` padding | `9px 11px` | `8px 12px` | Card compacta interior. El `9px 11px` parece "casi 8/12" con un shift editorial de 1px. Diferencia imperceptible | **Redondear a `8px 12px`** — cae en grid, cero regresión vs mock |
| `search` input padding | `7px 10px 7px 28px` | `8px 12px 8px 28px` | El `7px` vertical es 1px menos que 8. El `28px` left es `16 + 12` (padding base 12 + espacio para ícono de 14px centrado a left:12, con 2px de aire). Mantener 28 left es obligatorio por la geometría del ícono | **Redondear a `8px 12px 8px 28px`** para padding uniforme; **mantener 28px left** como excepción justificada (`= base-padding 12 + icon-width 14 + aire 2`) |
| `message-bubble` `.b` padding | `10px 14px` | `12px 16px` (o `8px 12px`) | Padding interno del globo. `10/14` es pixel-perfect del mock para que el texto no "flote" y las esquinas se vean tipográficas. La diferencia vs `12/16` SÍ se percibe (bubble se siente "inflado") | **Sí — mock pixel-perfect** — el planner respeta `10px 14px` literal. Valor validado contra mock rendering |
| `message-bubble` `.t` (timestamp) margin-top | 5px | 4px | Espacio entre texto y timestamp interno del bubble. 5 vs 4 es ruido de 1px | **Redondear a 4px** — cae en grid, diferencia imperceptible |
| `chat-view` `.composer` padding | `12px 20px` | `12px 20px` | Ya cae en grid (12 y 20 son múltiplos de 4) | **Sí — ya en grid** (listado solo para confirmar que no es excepción) |
| `chat-view` `.composer` gap | `10px` | `8px` o `12px` | Gap entre input y send button. 10 no cae en grid | **Redondear a 12px** — mantiene aire, cae en grid |
| `message-input` `.in` padding | `10px 12px` | `12px 12px` o `8px 12px` | Padding interno del textarea del composer. El `10px` vertical es 2 menos que grid 12 | **Redondear a `12px 12px`** — input más cómodo, cae en grid, cero regresión |
| `message-input` `.send` padding | `8px 14px` | `8px 12px` o `8px 16px` | Padding del botón Enviar. `14` no cae en grid | **Redondear a `8px 16px`** — botón ligeramente más ancho, mejor lectura del label "Enviar", cae en grid |
| `contact-panel` dl gap | `8px 10px` | `8px 12px` o `8px 8px` | Gap row 8 (grid ✓), gap column 10 (NO grid). Define separación entre pares dt/dd | **Redondear a `8px 12px`** — column gap más claro visualmente, cae en grid |
| `conversation-item` `.nm` emoji `.em` font-size | 13px | 12px o 16px | Tamaño del emoji 🛒 al lado del nombre. No es grid de spacing pero es odd vs sistema tipográfico (§6) | **Sí — mock pixel-perfect** (es tipografía, no spacing — cross-ref §6 consolidation) |
| `message-bubble` bot eyebrow margin | `0 4px 3px auto` | `0 4px 4px auto` | El `3px bottom` es 1px menos que grid 4 | **Redondear a `0 4px 4px auto`** — diferencia imperceptible, cae en grid |
| `conversation-list` `.head` h1 margin | `3px 0 10px` | `4px 0 12px` o `0 0 8px` | Ajuste fino entre eyebrow y h1, y entre h1 y tabs. 3 y 10 ambos fuera de grid | **Redondear a `4px 0 8px`** — cae en grid, ajusta ritmo vertical uniforme (eyebrow 10px → 4 → h1 26px → 8 → tabs 13px) |
| `conversation-item` `.av` letter-spacing | `0.02em` | N/A (unidad em, no px) | Kerning de iniciales de avatar | **Sí — typography spec** (no aplica regla 4px grid) |
| `conversation-item` `.tags` gap | `4px` | `4px` | Ya cae en grid | **Sí — ya en grid** |
| `conversation-item` `.top` gap | `10px` | `8px` o `12px` | Gap avatar-nombre en el item | **Redondear a `12px`** — cae en grid, item respira igual |
| Pill `.mx-tag` padding | `2px 8px` | `4px 8px` o `2px 8px` (2 sí es múltiplo de 2, no de 4) | Padding vertical de pills. 2px es muy apretado pero es pixel-perfect del look editorial (pill "tipográfica", no "botón") | **Sí — mock pixel-perfect** — pill debe verse chata como un tag de diccionario; 4px la hace parecer botón |

**Regla general para execution:** cuando un valor cae en la columna "Redondear", el planner aplica el valor grid desde el primer commit. Si al hacer pixel-diff contra mock aparece regresión visual, revertir al valor exacto del mock en ese componente específico y documentar en LEARNINGS.

### 5.2 Resumen de excepciones "Sí — mock pixel-perfect"
Solo estos valores odd sobreviven a execution sin redondeo:
1. `ibtn` 32×32 (touch target vs densidad editorial)
2. `.it.on` padding-left 13px (compensación border-left 3px)
3. `search` input padding-left 28px (geometría ícono = 12 + 14 + 2)
4. `message-bubble` padding 10×14 (tipografía crítica, 12×16 infla el globo)
5. `conversation-item .em` emoji 13px (jerarquía tipográfica, no spacing)
6. `mx-tag` padding 2×8 (aspecto "tag diccionario" vs "botón")

Todo lo demás se redondea al múltiplo de 4 más cercano que conserve jerarquía.

### 5.3 Anchura de paneles Allotment
Valores iniciales fijos del mock `340 / 1fr / 320` (además del sidebar global 232 que queda fuera de scope). El usuario conserva drag. 340 y 320 ya son múltiplos de 4.

---

## 6 · Typography

Escala serif-led del handoff. **3 tamaños principales declarados para esta fase** (el módulo no usa display/h1/h2 — son para topbars globales fuera de scope):

| Role | Font family | Size | Weight | Line height | Letter spacing | Uso exacto en el módulo |
|------|-------------|------|--------|-------------|----------------|-------------------------|
| **H-module** | `--font-display` (EB Garamond) | 26px (mock `.cl h1`) → mapea a `--fs-h3` (24) en dispositivos compactos | 600 | 1.2 | `-0.015em` | `"Conversaciones"` en el header de `conversation-list` |
| **H-contact** | `--font-display` | 20px (mock `.ch .head .nm` y `.cp .nm`) → usar `--fs-h4` (19) como fallback | 600 | 1.2 | `-0.01em` | Nombre del contacto en chat-header y contact-panel |
| **Body** | `--font-serif` (EB Garamond) | 16px (`--fs-body`) | 400 | 1.55 (`--lh-body`) | 0 | `.mx-body` genérico |
| **Body-sm** | `--font-sans` (Inter) | 14px (`--fs-body-sm`) | 400 o 500 según peso UI | 1.4 | `0.01em` (cuando `.mx-ui`) | Nombre del ítem (14, 600), preview (13, 400→500 unread), descripción de pedido (12.5, 500), composer input (14, 400) |
| **Caption** | `--font-serif` italic | 12px (`--fs-caption`) | 400 italic | 1.4 | 0 | Subtítulos de estados empty, `mx-marginalia`, meta bajo nombre del pedido (`Entrega jue 24 abr · 9–12 h`) |
| **Smallcaps (eyebrow)** | `--font-small-caps` (EB Garamond) | 10–11px (mock explícito 10px) | 600 | 1 | `0.10–0.14em` (rubric `0.08em`, uppercase `0.12–0.14em`) | Eyebrow "Módulo · whatsapp", "Contacto · activo", "bot · respuesta sugerida", separador de día `— Martes 21 de abril —`, H3 labels de `contact-panel` (`Ficha`, `Pedidos`, `Historial`), categorías del sidebar (fuera de scope) |
| **Mono** | `--font-mono` (JetBrains Mono) | 11–13px (`mx-mono` 13, chat-header meta 11, timestamps de bubble 11, id de pedido 11, timeline tl-t 11) | 400 o 500 | 1.2 | `0.01–0.02em` | Timestamps, teléfonos, IDs de pedido (`#0419`), `tl-t` de historial |

### 6.1 Consolidation guide — por qué la escala tiene pares cercanos (10/11/12/12.5/13/14/15/16/19/20/26)

La escala tiene pares numéricamente cercanos **no** por arbitrariedad sino porque dos roles semánticos distintos comparten rango visual. Esta tabla (a) explica cada par, (b) mapea a usos concretos, (c) da equivalente Tailwind para evitar ambigüedad en execution.

| size (px) | rol | usos concretos (1–2 ejemplos) | Tailwind equivalente sugerido | ¿por qué no 4px más o menos? |
|---|---|---|---|---|
| **10px** | Smallcaps eyebrow (la "voz" editorial más pequeña) | Eyebrow "Módulo · whatsapp" en header de lista · H3 labels contact-panel (`Ficha`, `Pedidos`, `Historial`) · separador de día `— Martes 21 de abril —` | `text-[10px]` (no hay equivalente nativo; Tailwind `text-xs` = 12) + `uppercase tracking-[0.12em] font-semibold` | Subir a 12 mata la jerarquía (compite con preview 13) y destruye el efecto "caps altas pero pequeñas" de tipografía editorial. Bajar a 8 es ilegible incluso en retina. |
| **11px** | Mono metadata (la "tinta fría" de datos sistema) | Timestamp del bubble (`14:26 ✓✓`) · chat-header meta (`+57 312 555 4412 · hace 3 min`) · ID de pedido (`#0419`) · timeline `tl-t` (hora del evento) | `text-[11px]` + `font-mono` + `tracking-[0.02em]` | Subir a 12 lo confunde visualmente con el preview sans 13. Bajar a 10 lo confunde con eyebrow smallcaps (mismo tamaño, distinta familia genera conflicto). El 11 + mono es "claramente numérico y menor que el texto". |
| **12px** | Caption serif italic (la "nota al margen") | Subtítulos de estados empty (`Cuando llegue un mensaje nuevo aparecerá aquí.`) · meta del order-card (`Entrega jue 24 abr · 9–12 h`) · `mx-marginalia` · teléfono del contacto en contact-panel (`.ph`, aunque ahí usa mono) | `text-xs` (12) + `font-serif italic` | Subir a 14 lo hace competir con el body principal. Bajar a 10 lo confunde con eyebrow. 12 serif italic es el "tamaño natural de nota a pie de página". |
| **12.5px** | Descripción densa de card compacta | `.ord .desc` (texto principal del order-card en contact-panel, p.ej. `2× cepillo eléctrico + kit de repuesto`) | `text-[12.5px]` + `font-medium` (o `text-[13px]` si no se quiere custom) — **considerar redondear a 13 durante execution si no hay regresión visual vs mock** | El `12.5` es atípico en un sistema tipográfico. El mock lo usa para que la desc encaje en 2 líneas en cards estrechas del contact-panel sin overflow. 13 probablemente funciona; **drop-candidate claro**. |
| **13px** | Preview/subordinado sans (la "voz secundaria UI") | `.pv` (preview del último mensaje del ítem) · `.desc` del order-card (cross-ref con 12.5 arriba) · `.tabs span` (labels "Todas", "Sin asignar", "Mías", "Cerradas") · `input.search` · link `.act a` (Ver · Tarea · Nota) · `mx-mono` standalone · `dl dd` y `dl dt` del contact-panel | `text-[13px]` (Tailwind nativo `text-sm` = 14) + `font-sans` | Subir a 14 compite con el nombre del ítem (14 600). Bajar a 12 lo confunde con caption. 13 es el "14 menos prominente", intencional: previews son información periférica. |
| **14px** | Nombre del ítem + composer input (la "voz principal UI no-display") | `.nm` del conversation-item (peso 600) · `input.in` del composer (peso 400) · `font-size` default de sans body UI | `text-sm` (14) + `font-sans` | Subir a 16 compite con body serif. Bajar a 13 pierde protagonismo del nombre vs preview (ambos serían 13). 14 es la jerarquía sans estándar para elementos primarios de lista. |
| **15px** | Bubble text (la "voz narrativa" del thread) | `.b` message-bubble texto principal (ambos `.in` y `.own`) | `text-[15px]` (Tailwind nativo `text-base` = 16) + `font-sans` + `leading-[1.5]` | El mock usa 15 porque el bubble texto quiere ser "legible y ligeramente más denso que el body serif 16 general", diferenciando burbujas conversacionales de prosa editorial. Subir a 16 iguala con body y rompe la distinción. Bajar a 14 lo confunde con UI sans. **15 es el único tamaño dedicado del módulo a contenido conversacional**. |
| **16px** | Body serif (la "voz documento") | `.mx-body` genérico · texto serif en notas de contact-panel (`.note`) · línea base del sistema tipográfico handoff | `text-base` (16) + `font-serif` + `leading-[1.55]` | Subir a 18 engorda la lectura editorial (el handoff busca "denso, tipo periódico"). Bajar a 15 choca con bubble text. 16 es el estándar editorial de cuerpo. |
| **19px** | Fallback H-contact en viewport compacto | Nombre del contacto en chat-header y contact-panel cuando `viewport < 1024px` | `text-[19px]` + `font-serif` + `font-semibold` + `tracking-[-0.01em]` | Puente entre body 16 y h-contact 20. El mock usa 20 pero declara 19 como fallback si el layout se estrecha. **Drop-candidate suave** — en execution probablemente nunca se renderiza (módulo es desktop-first); mantener solo como escape hatch. |
| **20px** | H-contact (el "nombre propio" del cliente) | `.nm` del chat-header y `.cp .nm` del contact-panel | `text-xl` (20) + `font-serif` + `font-semibold` + `tracking-[-0.01em]` | Subir a 24 compite con h-module 26. Bajar a 18 lo iguala con body. 20 es "más grande que body pero subordinado al título del módulo" — jerarquía de dos niveles. |
| **26px** | H-module (el "título de sección" del inbox) | `.cl h1` → texto literal `"Conversaciones"` (único uso en el módulo) | `text-[26px]` (Tailwind nativo `text-2xl` = 24, `text-3xl` = 30) + `font-serif` + `font-semibold` + `tracking-[-0.015em]` + `leading-[1.2]` | El mock insiste en 26 (no 24 ni 28) porque "Conversaciones" tiene 14 caracteres y a 28 se siente gritado; a 24 se pierde presencia. 26 es el "justo medio" editorial — **drop-candidate suave: considerar redondear a 24 (`text-2xl`) durante execution si pixel-diff vs mock no muestra regresión**. |

### 6.2 Drop-candidates (tamaños a considerar colapsar en execution)

Si durante execution el planner encuentra fricción con custom `text-[Npx]`, estos tres son los candidatos seguros a eliminar sin regresión:

1. **12.5 → 13:** colapsar `.ord .desc` de 12.5 a 13 (= mismo tamaño que preview). El order-card ya es visualmente distinto por fondo `--paper-0` + border radius 12, no necesita el 12.5 para diferenciarse.
2. **19 → 20:** eliminar el fallback y usar 20 en todos los viewports. El módulo es desktop-first; el fallback es teórico.
3. **26 → 24 (`text-2xl`):** solo si el pixel-diff confirma diferencia imperceptible. Si el tracking negativo (`-0.015em`) ayuda, 24 con tracking correcto puede compensar la pérdida de 2px.

Los tres cambios son opcionales para el executor; la decisión se toma contra pixel-diff del mock, no a priori.

### 6.3 Pesos de fuente a cargar (next/font/google) — D-10
| Familia | Pesos | Ital | Bundle impact |
|---------|-------|------|---------------|
| EB Garamond | 400, 500, 600, 700, 800 | 400, 600 | Fuente principal — se usa en display + serif + smallcaps |
| Inter | 400, 500, 600, 700 | — | UI funcional (sans) |
| JetBrains Mono | 400, 500 | — | Timestamps, IDs, monoespaciada |
| Cormorant Garamond | 400, 500, 600, 700 | 400, 600 | **Opcional** — fallback display; research decide si cargar realmente o solo dejar en `--font-display` cascade como system fallback. Recomendación del UI-SPEC: **no cargar** — el cascade resuelve con Times/Georgia si EB Garamond falla, y Cormorant suma ~40KB sin diferencia visible.

### 6.4 Font feature settings (body/document)
```css
font-feature-settings: "kern", "liga", "onum", "pnum";
-webkit-font-smoothing: antialiased;
text-rendering: optimizeLegibility;
```

### 6.5 Line heights canónicos
```
--lh-tight:   1.08  (no usado en este módulo)
--lh-display: 1.05  (display global — fuera de scope)
--lh-heading: 1.20  (h2/h3/h4 del módulo)
--lh-body:    1.55  (body serif)
--lh-long:    1.70  (mx-body-long — no usado en este módulo)
```

---

## 7 · Visual Patterns (exactos del mock)

### 7.1 Ítem de conversación (conversation-item.tsx)
```
Base:
  padding: 12px 16px
  border-bottom: 1px solid var(--border)
  background: var(--paper-1) (via padre)

Hover:
  background: var(--paper-2)

Selected (.on):
  background: var(--paper-0)
  border-left: 3px solid var(--rubric-2)
  padding-left: 13px        ← CRÍTICO (compensa el 3px del border)

Layout interno:
  .top: flex gap 10px align-items flex-start
  .av: 40×40 circle
       background: var(--paper-3)
       border: 1px solid var(--ink-1)
       font-family: var(--font-sans) 700 13px
       color: var(--ink-1)
       letter-spacing: 0.02em

  .nm: font-sans 600 14px color ink-1 letter-spacing -0.005em
       .em (emoji de pedido): 13px color rubric-2
       ::after (unread dot): 6×6 circle rubric-2 margin-left 4px

  .tm: font-mono 500 11px color ink-3
       margin-left: auto

  .pv: font-sans 400 13px color ink-2
       line-height 1.4
       truncate single-line
       (unread state) color: ink-1, font-weight 500

  .tags: flex gap 4px flex-wrap
         + pill "N nuevos" usa mx-tag--rubric 700 con margin-left: auto
```

### 7.2 Header de conversation-list
```
padding: 16px 18px 12px
border-bottom: 1px solid var(--ink-1)    ← HARD rule (no --border)

.eye (eyebrow): font-sans 600 10px uppercase letter-spacing 0.12em
                color var(--rubric-2)
                texto: "Módulo · whatsapp"

h1:             font-display (EB Garamond) 600 26px
                letter-spacing -0.015em
                color var(--ink-1)
                margin 3px 0 10px
                texto: "Conversaciones"

.tabs:          flex gap 16px
                font-sans 500 13px color ink-3
                span.on: color ink-1, border-bottom 2px solid ink-1, font-weight 600
                padding-bottom 4px cada span
                labels: "Todas" / "Sin asignar" / "Mías" / "Cerradas"
```

### 7.3 Search input
```
container: padding 10px 14px + border-bottom 1px solid var(--border) + position relative
input:     width 100% + border 1px solid var(--border) + background var(--paper-0)
           padding 7px 10px 7px 28px (28px left para ícono)
           border-radius var(--radius-3)
           font-sans 400 13px color ink-1
           placeholder: "Buscar por nombre, teléfono o etiqueta…"

Ícono Search lucide 14×14:
           position absolute left 22px top 50% translateY(-50%)
           color var(--ink-3)

Keyboard: "/" enfoca el input (scope: focus dentro de /whatsapp únicamente — verificar conflicto con GlobalSearch D-23)
```

### 7.4 Chat header
```
height: auto (padding 14px 20px)
background: var(--paper-0)
border-bottom: 1px solid var(--ink-1)
display: flex gap 12px align-items center

.av (avatar grande):  40×40 circle
                      background var(--ink-1)      ← tinta sólida
                      color var(--paper-0)
                      font-sans 700 15px

.info .eye:           font-sans 600 10px uppercase letter-spacing 0.12em color rubric-2
                      texto: "Contacto · activo"
.info .nm:            font-display 600 20px color ink-1 letter-spacing -0.01em
.info .meta:          font-mono 500 11px color ink-3
                      texto ejemplo: "+57 312 555 4412 · última respuesta hace 3 min"

.right (acciones):    margin-left auto, flex gap 8px
                      ibtn 32×32 (ver §7.6)
```

### 7.5 Chat thread
```
padding: 22px 24px
flex-direction: column
gap: 8px

Background decorativo opcional (ruled paper — del mock):
  linear-gradient(paper-1, paper-1),
  repeating-linear-gradient(to bottom,
    transparent 0 27px,
    oklch(0.65 0.03 80 / 0.15) 27px 28px)
  background-blend-mode: multiply

  → Esto simula las reglas horizontales de un cuaderno.
  → Research flag: si performance se ve afectada, reemplazar por color plano --paper-1.
  → Si se mantiene, deshabilitarlo en message-input.tsx para no crear stripes en el composer.

Separador de día (.day):
  text-align center
  font-sans 600 10px uppercase letter-spacing 0.1em color ink-3
  margin: 8px 0
  texto ejemplo: "— Martes 21 de abril —"  (incluir guiones largos em-dash)

Row (.row):
  display flex
  .row.own { justify-content: flex-end }

Bot eyebrow (.bot):
  display block text-align right
  font-sans 600 10px uppercase letter-spacing 0.12em color rubric-2
  margin: 0 4px 3px auto
  texto: "❦ bot · respuesta sugerida"
  → Carácter decorativo "❦" (floral heart, U+2766) antes del texto — es el "ornamento" editorial
```

### 7.6 Message bubble
```
.b (base):
  max-width: 62%
  padding: 10px 14px
  font-sans 500 15px line-height 1.5
  border: 1px solid var(--ink-2)
  border-radius: 10px          ← CUSTOM 10px (no --radius-*)
  background: var(--paper-0)
  color: var(--ink-1)
  box-shadow: 0 1px 0 var(--border)

.b.in (entrante):
  border-bottom-left-radius: 2px   ← pico tipográfico lado izquierdo

.b.own (propia):
  background: var(--ink-1)
  color: var(--paper-0)
  border-color: var(--ink-1)
  border-bottom-right-radius: 2px  ← pico lado derecho

.b .t (timestamp):
  display block text-align right
  font-mono 500 11px letter-spacing 0.02em
  opacity: 0.75
  margin-top: 5px
.b.own .t:
  opacity: 0.85
  color: var(--paper-2)            ← sobre tinta negra, texto claro

Checkmarks (✓ / ✓✓): concatenados al texto del timestamp (ej: "14:26 ✓✓")
  → Se respetan colores actuales del MessageStatus existente.
```

### 7.7 Icon button (ibtn)
```
32×32
border: 1px solid var(--border)
background: var(--paper-0)
border-radius: var(--radius-3)  (4px)
display: flex center
color: var(--ink-2)
cursor: pointer

Hover:
  background: var(--paper-3)
  color: var(--ink-1)

Focus-visible:
  outline: 2px solid var(--ink-1)
  outline-offset: 2px

aria-label obligatorio (§8 a11y).
Icons: Search, UserPlus, Tag, MoreHorizontal, Send, AlertTriangle, Moon, ChevronRight (D-22).
```

### 7.8 Composer (message-input)
```
border-top: 1px solid var(--ink-1)
background: var(--paper-0)
padding: 12px 20px
display: flex gap 10px align-items flex-end

.in (input/textarea):
  flex: 1
  border: 1px solid var(--border)
  background: var(--paper-1)       ← ligeramente más claro que el composer
  border-radius: var(--radius-3)
  padding: 10px 12px
  font-sans 400 14px color ink-1
  min-height: 20px
  placeholder: "Escriba su respuesta…"
  placeholder color: var(--ink-3)
  (mantener autosize actual)

.send (primary button — override shadcn Button):
  background: var(--ink-1)         ← NO rubric
  color: var(--paper-0)
  border: 1px solid var(--ink-1)
  padding: 8px 14px
  border-radius: var(--radius-3)
  font-sans 600 13px
  display flex align-items center gap 6px
  ícono Send lucide 14×14

  Hover:
    background: var(--ink-2)
  Active:
    transform: translateY(1px)
  Disabled (cuando input vacío):
    opacity: 0.5
    cursor: not-allowed
```

### 7.9 Contact panel
```
Root:
  background: var(--paper-2)
  overflow: auto

.head (top block):
  padding: 22px 20px 14px
  border-bottom: 1px solid var(--ink-1)
  text-align: center

.av-lg (avatar grande):
  72×72 circle
  background: var(--paper-0)
  border: 1px solid var(--ink-1)
  margin 0 auto 10px
  font-sans 700 26px color ink-1

.nm: font-display 600 20px ink-1 letter-spacing -0.01em
.ph: font-mono 500 12px ink-3 margin-top 3px

section (repetible):
  padding: 14px 18px
  border-bottom: 1px solid var(--border)

h3 (label de sección):
  font-sans 600 10px uppercase letter-spacing 0.12em color ink-3
  margin: 0 0 10px
  ejemplos: "Ficha", "Pedidos", "Historial"

dl (lista definición):
  display: grid
  grid-template-columns: 1fr 1.4fr
  gap: 8px 10px
  font-sans 13px
  dt: color ink-3 500
  dd: color ink-1 500 margin 0

.note (quote editorial):
  font-sans 400 13px color ink-2 line-height 1.5
  border-left: 2px solid var(--ink-1)
  padding-left: 10px
```

### 7.10 Order card (dentro del contact-panel)
```
.ord:
  background: var(--paper-0)
  border: 1px solid var(--border)
  border-radius: 12px              ← CUSTOM 12px (el único >4 del módulo; justificado por el mock)
  padding: 9px 11px
  box-shadow: 0 1px 0 var(--border)

.top:
  flex justify-between gap 8px margin-bottom 4px
  .id: font-mono 500 11px color ink-3 letter-spacing 0.02em (ej: "#0419")
  .st (status pill): usar mx-tag--gold | mx-tag--verdigris | mx-tag--rubric | mx-tag--indigo | mx-tag--ink según estado
        • "pendiente pago" → mx-tag--gold
        • "entregado" → mx-tag--verdigris
        • "enviado" → mx-tag--verdigris
        • "cancelado" / "refund" → mx-tag--rubric
        • neutral → mx-tag--ink

.desc: font-sans 500 12.5px color ink-1 line-height 1.4
.meta: font-sans 400 11px color ink-3

.act (acciones):
  flex gap 8px
  a: font-sans 500 11px color ink-2
  a:hover: color var(--rubric-2)
  .sep: color ink-3 font-sans 10px
```

### 7.11 Timeline (contact-panel historial)
```
.tl:
  display flex column gap 8px
  font-sans 13px color ink-1

.tl-item:
  display grid grid-template-columns 68px 1fr
  gap 10px align-items baseline

.tl-t: font-mono 500 11px color ink-3 letter-spacing 0.01em
.tl-b: color ink-2 400 line-height 1.45

Dots (si se añaden — fuera del mock pero del handoff §12):
  8×8 circle border 1.5px color por tipo (bot=rubric-2, human=verdigris, system=indigo, warn=gold sólido)
```

### 7.12 Pills oficiales (mx-tag--*)
**Prohibido** usar `.tg.red/.gold/.indi/.ver` legacy del mock (esos son placeholders hardcoded OKLCH — ver CHANGELOG v2). **Siempre** usar clases oficiales:

```
.mx-tag (base):
  display inline-flex align-items center gap 4px
  font-sans 600 10px letter-spacing 0.01em
  padding 2px 8px border-radius var(--radius-pill)
  border 1px solid transparent

.mx-tag--rubric   (ej: "cliente", "urgente", "N nuevos")
  background color-mix(in oklch, var(--rubric-2) 10%, var(--paper-0))
  color var(--rubric-1)
  border-color color-mix(in oklch, var(--rubric-2) 40%, var(--paper-0))

.mx-tag--gold     (ej: "vip", "pendiente pago")
  background color-mix(in oklch, var(--accent-gold) 14%, var(--paper-0))
  color color-mix(in oklch, var(--accent-gold) 60%, var(--ink-1))
  border-color color-mix(in oklch, var(--accent-gold) 45%, var(--paper-0))

.mx-tag--indigo   (ej: "prospecto")
  background color-mix(in oklch, var(--accent-indigo) 10%, var(--paper-0))
  color var(--accent-indigo)
  border-color color-mix(in oklch, var(--accent-indigo) 40%, var(--paper-0))

.mx-tag--verdigris (ej: "mayorista", "entregado")
  background color-mix(in oklch, var(--accent-verdigris) 10%, var(--paper-0))
  color var(--accent-verdigris)
  border-color color-mix(in oklch, var(--accent-verdigris) 40%, var(--paper-0))

.mx-tag--ink      (ej: "snoozed hasta 14:00", tags neutrales, "Sin asignar")
  background var(--paper-0)
  color var(--ink-2)
  border-color var(--ink-3)
```

---

## 8 · Layout Contract

### 8.1 Grid principal (desktop ≥1280px)
El `Sidebar` global (232px) vive fuera del scope del módulo. Dentro del módulo, `Allotment` provee 3 columnas **resizeables**:

```
┌────────────┬─────────────┬──────────────┐
│ lista      │    chat     │   contacto   │
│ 340px      │    1fr      │   320px      │
└────────────┴─────────────┴──────────────┘

Bordes:
- lista  | chat:    border-right 1px solid var(--border) (heredado de Allotment sash)
- chat   | contact: border-right 1px solid var(--border)
- Todos:  border-bottom 0 al final del viewport
```

### 8.2 Anchos iniciales Allotment (preservar drag — D-11)
- Panel 1 (`conversation-list`): **340px** default, min `280px`, max `460px`
- Panel 2 (`chat-view`): **1fr** (fill)
- Panel 3 (`contact-panel`): **320px** default, min `280px`, max `400px`

### 8.3 Responsive (handoff §9 — patrón base, QA fino es follow-up)
| Breakpoint | Comportamiento |
|------------|----------------|
| **≥1280px** | 3 paneles visibles (lista + chat + contacto) como arriba |
| **1024–1279px** | 2 paneles (lista + chat). `contact-panel` colapsa a **drawer overlay lateral derecha**, se abre click en chat-header o por acción explícita |
| **768–1023px** | 1 panel a la vez. Navegación tipo **stack**: lista → chat → contacto. Back button inferible del router |
| **<768px** | Igual que 768–1023. Las acciones `ibtn` del chat-header se agrupan en un `MoreHorizontal` dropdown |

> Implementación: `container-query` o `useMediaQuery` — research decide. Este spec exige **que ninguna interacción se pierda** en breakpoints menores, no exige pixel-perfection.

### 8.4 Altura
- Root `.theme-editorial` ocupa `100dvh` - sidebar global header (heredado).
- `conversation-list` header y `chat-header` son sticky/fixed a top de su panel.
- `composer` fijo a bottom.
- `thread` y `.cp` scrollean; `conversation-list .items` scrollea.

---

## 9 · Copywriting Contract

> Tono "profesional-cálido colombiano; español neutro" (handoff §1). **No** emojis en labels de UI (sí en separadores decorativos tipo ❦ o —).

| Elemento | Copy |
|----------|------|
| **Module title** | `Conversaciones` |
| **Eyebrow module** | `Módulo · whatsapp` (respetar el `·` medium dot U+00B7, no un punto normal) |
| **Eyebrow contact** | `Contacto · activo` / `Contacto · inactivo` / `Contacto · snoozed` |
| **Eyebrow bot** | `❦ bot · respuesta sugerida` (U+2766 floral heart al inicio) |
| **Tabs del inbox** | `Todas` · `Sin asignar` · `Mías` · `Cerradas` |
| **Search placeholder** | `Buscar por nombre, teléfono o etiqueta…` (elipsis U+2026, no tres puntos) |
| **Composer placeholder** | `Escriba su respuesta…` |
| **Primary CTA (composer)** | `Enviar` + ícono `Send` |
| **Day separator pattern** | `— {Día} {DD} de {mes} —` ejemplo: `— Martes 21 de abril —` (em-dashes U+2014, mes en minúscula, español neutro) |
| **Unread pill** | `{N} nuevos` (p.ej. `3 nuevos`) usando `mx-tag--rubric` peso 700 |
| **Unassigned badge** | `Sin asignar` usando `mx-tag--ink` |
| **Snoozed pill** | `snoozed hasta {fecha/hora}` usando `mx-tag--ink` + ícono `Moon` Lucide |
| **Order status labels** | `pendiente pago` / `entregado` / `enviado` / `cancelado` / `abierto` / `cerrado` (minúscula siempre) |
| **Action links (contact-panel acts)** | `Ver` · `Tarea` · `Nota` · `Reordenar` · `Llamar` · `Editar` (siempre 1 verbo, Title case mínimo — "Ver" no "ver") |
| **contact-panel H3 labels** | `Ficha` · `Pedidos` · `Historial` · `Notas` · `Etiquetas` (smallcaps uppercase) |
| **ibtn aria-labels** | Asignar conversación / Etiquetar conversación / Más acciones / Buscar / Enviar mensaje / Silenciar conversación (Español, verbo + objeto) |

### 9.1 Estados de copy (handoff §10)

| Estado | Heading | Body | Acción |
|--------|---------|------|--------|
| **Empty — bandeja vacía** | `La bandeja está limpia.` (`mx-h3`) | `Cuando llegue un mensaje nuevo aparecerá aquí.` (`mx-caption`) | ornamento `· · ·` (`mx-rule-ornament`) — sin botón |
| **Empty — filtro sin resultados** | `Nada coincide con los filtros activos.` (`mx-h4`) | — | `Limpiar filtros` (link sans + border-bottom 1px ink-2) |
| **Empty — chat no seleccionado** | `Seleccione una conversación.` (`mx-h4`) | `Los mensajes y el contexto del cliente aparecerán aquí.` (`mx-caption`) | ornamento `· · ·` |
| **Empty — contact-panel sin pedidos** | `Sin pedidos aún.` (`mx-caption`) | — | link `Crear pedido` (abre CreateOrderSheet existente — fuera de scope visual) |
| **Empty — thread sin mensajes** | — (hidden si hay composer) | — | — |
| **Loading — list** | skeleton ítem (§10.4) repetido 6× | — | — |
| **Loading — thread** | skeleton bubbles alternando in/own (§10.4) repetido 3× | — | — |
| **Error — canal caído (WhatsApp API)** | Banner top `background: color-mix(in oklch, var(--rubric-2) 8%, var(--paper-0))` + `border-left 3px solid var(--rubric-2)` + ícono `AlertTriangle` en rubric-2. Texto serif: `No pudimos conectar con WhatsApp Business.` | sub-caption `Verifique la conexión con Meta o reintente en unos minutos.` | botón sans `Reintentar` con estilo ibtn (fondo paper-0) |
| **Error — mensaje falló al enviar** | inline bajo el bubble fallido: ícono `AlertTriangle` rubric-2 + `No se pudo enviar.` (font-sans 11px) + link `Reintentar` | — | Reintentar envía de nuevo; propiedades del bubble existente no cambian |
| **Error — conversación no existe** | Página dedicada `mx-display` `404` en rubric-2 + subtítulo serif `Esa conversación no existe o fue archivada.` | — | link `Volver al inbox` |

### 9.2 Acciones destructivas en scope
Ninguna acción destructiva **nueva** se introduce en esta fase (el re-skin es cosmético). Las acciones existentes (archivar conversación, cerrar conversación, desasignar) conservan su lógica actual; solo **heredan** el estilo editorial:
- Confirmaciones destructivas usan `AlertDialog` shadcn con botón destructive mapeado a `--rubric-2` vía el override de tokens.
- **Copy** de confirmación (cuando exista el modal): `¿Archivar esta conversación?` / botón primario `Archivar`, botón secundario `Cancelar`. (Los modales caen fuera del scope visual de esta fase — conservan shadcn-slate actual hasta fase siguiente.)

### 9.3 Convenciones de formato
- **Fechas** en timeline/meta: `date-fns` con locale `es-CO`, timezone `America/Bogota` (Regla 2). Formato relativo cuando <24h ("hace 3 min"), absoluto cuando ≥1 día ("ayer", "mar 18", "2 feb").
- **Teléfonos:** `libphonenumber-js` formato E.164 → internacional legible: `+57 312 555 4412`.
- **Precios:** `new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })`.
- **IDs de pedido:** `#0419` (hash + zero-padded 4 dígitos, font-mono).

---

## 10 · Interaction Contract

### 10.1 Keyboard shortcuts (D-23)
| Key | Scope | Acción |
|-----|-------|--------|
| `Esc` | Global dentro del módulo | Cierra drawers abiertos (contact-panel en <1280, modales existentes). Si no hay nada abierto, blur del input activo |
| `/` | Focus dentro del módulo `/whatsapp` **exclusivamente** | Enfoca `conversation-list` search input. **Verificar conflicto con GlobalSearch existente** — research decide: mutex por `document.activeElement.closest('.theme-editorial')`, o redefinir GlobalSearch a `Cmd+K` únicamente |
| `[` | Focus dentro de la lista o el chat | Selecciona conversación previa |
| `]` | Focus dentro de la lista o el chat | Selecciona conversación siguiente |
| `Enter` (composer) | Focus en composer | Envía mensaje |
| `Shift+Enter` (composer) | Focus en composer | Nueva línea |
| `Tab` | Global | Orden coherente: sidebar (OUT) → tabs → search → items → chat-header ibtn → thread → composer input → send |

### 10.2 Focus-visible
- **Todos** los elementos interactivos muestran focus-visible:
  ```css
  :focus-visible {
    outline: 2px solid var(--ink-1);
    outline-offset: 2px;
    border-radius: var(--radius-3); /* inherit or match */
  }
  ```
- Excepción: ítem seleccionado de la lista usa `border-left: 3px solid var(--rubric-2)` + `outline: 2px solid var(--ink-1); outline-offset: 2px;` cuando además tiene focus.

### 10.3 Estados de interacción por elemento
| Elemento | Default | Hover | Active/Selected | Focus-visible | Disabled |
|----------|---------|-------|-----------------|---------------|----------|
| `conversation-item` | `.it` base | `background: --paper-2` | `.on` (ver §7.1) | outline ink-1 | N/A |
| `ibtn` | ver §7.7 | `background: --paper-3 + color: --ink-1` | `transform: translateY(1px)` | outline ink-1 | `opacity: 0.5 + cursor: not-allowed` |
| `.send` button | ver §7.8 | `background: --ink-2` | `transform: translateY(1px)` | outline ink-1 | `opacity: 0.5` |
| Tab (`.tabs span`) | `color: --ink-3` | `color: --ink-1` (sin underline) | `.on` color ink-1 + border-bottom 2px ink-1 + font-weight 600 | outline ink-1 offset 4px (no cubre underline) | — |
| link `.act a` | `color: --ink-2` | `color: --rubric-2` | — | outline ink-1 | — |
| Input search | border `--border` | border `--ink-3` | — | border `--ink-1` + shadow `0 0 0 2px color-mix(in oklch, var(--ink-1) 20%, transparent)` | `opacity: 0.5` |
| Input composer | idem search | idem | — | idem | idem |

### 10.4 Skeletons (loading)
```
.skeleton-base:
  background: var(--paper-2)
  border: 1px solid var(--border)
  animation: mx-pulse 1.5s ease-in-out infinite

@keyframes mx-pulse {
  0%, 100% { opacity: 0.6 }
  50%      { opacity: 1 }
}

Skeleton de conversation-item:
  altura 72px, padding 12px 16px
  avatar: 40×40 circle skeleton
  bloque nombre: 120×14 rect skeleton
  bloque preview: 180×12 rect skeleton
  bloque timestamp: 40×10 rect skeleton (top-right)

Skeleton de message-bubble:
  altura 40–60px variable, max-width 62%
  (alternar in/own en 3 renders para señalar conversación)
```

### 10.5 Realtime (preservar comportamiento — D-19)
- `useConversations()` dispara re-render con nuevo estado; el UI debe reflejar cambios **sin layout shift**: las transiciones de unread / last_message_preview ocurren en `200ms ease` si el usuario está viendo la lista; instantáneas si está scrolleando.
- Indicador "escribiendo…": si ya existe, respeta estilo actual con override a `font-family: var(--font-serif) italic color: var(--ink-3)` y se posiciona arriba del composer.

---

## 11 · State Contract (cobertura exhaustiva para ui-checker)

| Componente | Estados obligatorios a soportar |
|------------|---------------------------------|
| `conversation-list` | loaded (N>0), loaded-empty-global, loaded-empty-filter, loading, error-fetch, tab-active × 4 |
| `conversation-item` | default, unread, selected, selected+unread, hover, focus-visible, snoozed (opacidad 0.6 + Moon icon), has-tags, no-tags, assigned, unassigned, bot-active (Bot icon overlay), has-emoji-indicator |
| `chat-view` | message-list loaded, loading, empty-thread (rare), send-pending (optimistic), window-closed (24h WhatsApp) |
| `chat-header` | contact loaded, contact loading, contact snoozed, availability on/off |
| `contact-panel` | full (ficha + pedidos + historial), no-orders, no-tags, no-history, loading each section |
| `message-bubble` | in/own, delivered/read (✓✓), sent (✓), pending (reloj), failed (AlertTriangle + link Reintentar), template, quickReply, media preview, long text (wrap), with-timestamp, without-timestamp, bot-suggested (con eyebrow `❦ bot · respuesta sugerida`) |
| `message-input` | empty, typing, disabled (window-closed), sending (optimistic), with-attachments, with-template-preview |

**Checker validará** que cada combinación relevante tenga clases CSS determinísticas (no valores inline condicionales).

---

## 12 · Accessibility Contract (handoff §13 + D-23/D-24)

### 12.1 Contraste (WCAG 2.1 AA mínimo)
| Combinación | Ratio estimado | Cumple |
|-------------|----------------|--------|
| `--ink-1` sobre `--paper-0` (texto primario sobre highlight) | ~14:1 | AAA ✓ |
| `--ink-1` sobre `--paper-1` (texto sobre página) | ~13:1 | AAA ✓ |
| `--ink-2` sobre `--paper-1` (body) | ~8:1 | AAA ✓ |
| `--ink-3` sobre `--paper-1` (caption/meta) | ~4.7:1 | AA ✓ |
| `--paper-0` sobre `--ink-1` (bubble own text) | ~14:1 | AAA ✓ |
| `--rubric-2` sobre `--paper-0` (eyebrow, alerts) | ~4.5:1 | AA ✓ (borderline — **validar con axe** en mx-tag--rubric dadas las color-mix) |
| `--rubric-1` sobre `mx-tag--rubric` bg (≈paper-0 tintado 10%) | ~5.8:1 | AA ✓ |
| `color-mix(accent-gold 60%, ink-1)` sobre gold-tinted bg | ~4.6:1 | AA ✓ (validar axe) |

**Research debe correr axe-core** sobre el mock portado a Storybook o sobre la primera implementación real, reportar fallas específicas, y si un `mx-tag--*` no cumple AA ajustar la mezcla (ej: `color-mix 60%` → `70%` para el foreground).

### 12.2 ARIA
- `conversation-list`: `role="list"` en container, `role="listitem"` en cada `.it`, `aria-selected="true"` en seleccionado, `aria-current="true"` adicionalmente (belt-and-suspenders para screen readers).
- `ibtn` todos con `aria-label` español (§9 tabla).
- `chat-view` thread: `role="log"` + `aria-live="polite"` para anunciar mensajes nuevos entrantes.
- `message-bubble`: `aria-label="Mensaje propio enviado a las 14:26, leído"` o `"Mensaje entrante a las 14:22"` (construir server-side, no solo desde clases).
- `composer`: `role="textbox"` + `aria-multiline="true"` + `aria-label="Escribir respuesta a {nombreContacto}"`.
- `contact-panel`: `<aside aria-label="Información del contacto">` y cada `<section>` con `<h3>` propio (los h3 smallcaps ya son headings semánticos).
- Banner de error: `role="alert"` + `aria-live="assertive"`.

### 12.3 Reducción de movimiento
```css
@media (prefers-reduced-motion: reduce) {
  .theme-editorial * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* Deshabilitar mx-pulse del skeleton en reduced-motion */
  @keyframes mx-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 1 } }
}
```

### 12.4 Forzar light (D — dark mode fuera de scope)
Dentro de `.theme-editorial` forzar esquema claro:
```css
.theme-editorial {
  color-scheme: light;
  /* Evitar que next-themes aplique `.dark` a descendientes */
}
.theme-editorial .dark,
.dark .theme-editorial {
  /* Neutralizar: reaplicar tokens light si un ancestro está en dark */
  /* (listar los mismos overrides de §4 aquí) */
}
```
Research decide entre `color-scheme: light` + selectores defensivos vs usar `forcedTheme="light"` de `next-themes` en un sub-tree provider exclusivo del módulo. Recomendación del UI-SPEC: `color-scheme` + override defensivo (más simple, sin duplicar provider).

---

## 13 · Architecture Hooks (para el planner)

### 13.1 Dónde vive qué
| Pieza | Archivo | Responsabilidad |
|-------|---------|-----------------|
| Resolución del flag | `src/app/(dashboard)/whatsapp/page.tsx` | Lee `workspaces.settings.ui_inbox_v2_enabled`; pasa prop `v2={boolean}` a `<InboxLayout>` (o renderiza un wrapper) |
| Wrapper `.theme-editorial` | `src/app/(dashboard)/whatsapp/layout.tsx` **o** `<InboxLayout>` | Si `v2`, aplica `className="theme-editorial"` al root div |
| Tokens + clases `mx-*` | `src/app/globals.css` dentro de bloque `.theme-editorial { ... }` **o** CSS module propio `src/app/(dashboard)/whatsapp/theme.css` importado por el layout | Research decide |
| Fuentes `next/font/google` | `src/app/layout.tsx` (root) expone variables `--font-ebgaramond`, `--font-inter`, `--font-jetbrains-mono` | Cargadas globalmente una vez; consume solo el scope; bundle cost aceptable por reuso futuro en otros módulos |
| Helper flag | `src/lib/auth/inbox-v2.ts` (nuevo — patrón análogo a `super-user.ts`) o lectura directa de `WorkspaceProvider` | Research decide |

### 13.2 Composables reutilizables a crear (si el planner los encuentra útiles)
- `<Eyebrow>{children}</Eyebrow>` — smallcaps uppercase en rubric-2.
- `<MxTag variant="rubric|gold|indigo|verdigris|ink" icon?>{children}</MxTag>` — reemplaza los `.tg.*` hardcoded.
- `<DaySeparator date={Date} />` — render del `— Martes 21 de abril —`.
- `<IconButton icon={LucideIcon} label={string}>` — wrapper tipado para ibtn con aria-label obligatorio.

No son requisitos duros — el planner decide según complejidad de PR.

---

## 14 · Registry Safety

| Registry | Blocks usados | Safety Gate |
|----------|---------------|-------------|
| shadcn oficial (`ui.shadcn.com`) | Todos los primitivos ya instalados (`Button`, `Badge`, `Tabs`, `ScrollArea`, `Sheet`, `Popover`, `Tooltip`, `Avatar`, `Card`, `Input`, `Label`, `Separator`, `Switch`, `Select`, `DropdownMenu`, `AlertDialog`) | No requerido |
| Third-party | — ninguno declarado | No aplica |

No se introducen nuevos bloques de registry en esta fase (puro CSS/tokens override + JSX cosmetic edits).

---

## 15 · Dependencies (sin cambios en package.json salvo fonts)

| Paquete | Versión actual | Acción |
|---------|----------------|--------|
| `lucide-react` | `^0.563.0` | **OK** — ≥ 0.460.0 requerido por handoff §11. Sin bump |
| `next` | `^16.1.6` | `next/font/google` ya disponible |
| `tailwindcss` | `^4` | `@theme inline` scope patterns funcionan |
| `allotment` | `^1.20.5` | **Mantener** (D-11) |
| `next-themes` | `^0.4.6` | Posible config `forcedTheme` o `color-scheme` override (D decisión research) |
| EB Garamond / Inter / JetBrains Mono | — | `next/font/google` no requiere install separado |
| Cormorant Garamond | — | Recomendación UI-SPEC: **no cargar** (cascade resuelve con system serif) |

**Cero nuevos paquetes npm** en esta fase.

---

## 16 · Definition of Done (visual, para el auditor)

- [ ] **Flag on vs off:** Screenshot lado a lado del mismo workspace con `ui_inbox_v2_enabled=true` vs `=false` muestra diferencia visual completa sin regresión funcional.
- [ ] **Mock vs implementación:** Screenshot de `conversaciones.html` (browser local) vs la implementación real — coinciden en paleta, tipografía, proporciones, espaciados (§17 handoff criterios de "hecho").
- [ ] **Tokens bajo scope:** Inspector devtools muestra tokens editoriales resueltos **solo** dentro de `.theme-editorial`; fuera del scope los tokens shadcn-slate de `:root` permanecen.
- [ ] **Fuentes cargadas:** Devtools Network muestra EB Garamond + Inter + JetBrains Mono cargadas. CLS < 0.1 durante la carga inicial.
- [ ] **Pills usan `mx-tag--*`:** Grep repo confirma cero usos de `.tg.red/.gold/.indi/.ver` en `/whatsapp/**`.
- [ ] **Cero OKLCH hardcoded en componentes:** Grep `oklch\(` en `src/app/(dashboard)/whatsapp/**` retorna **solo** el archivo CSS/module de tokens (no componentes individuales).
- [ ] **Estados loading/empty/error:** Cada uno renderizable (Storybook story o query param `?state=empty` — planner decide). Match con §9.1.
- [ ] **Keyboard:** Tab, `/`, `[`, `]`, `Esc` funcionan según §10.1 sin conflictos con `GlobalSearch`.
- [ ] **a11y:** `axe-core` scan sobre `/whatsapp` (flag on) retorna 0 violations serious/critical.
- [ ] **Regla 6 verificada:** Diff vs `main` muestra **cero** cambios en `initializeTools.ts`, `useConversations.ts`, hooks de realtime, action handlers, `DebugPanelProduction`.
- [ ] **No dark mode:** Toggle de tema del dashboard fuera de `/whatsapp` funciona; dentro de `/whatsapp` con flag on **siempre** se ve light, incluso si html tiene `.dark`.
- [ ] **Responsive base:** 1280 / 1024 / 768 breakpoints sin overflow horizontal, sin loss de acceso a acciones (tested manualmente, QA riguroso <1024 es follow-up).

---

## Checker Sign-Off

- [x] Dimension 1 — Copywriting: PASS (§9 contrato completo, estados copy, acciones destructivas documentadas, tono `es-CO` neutro)
- [x] Dimension 2 — Visuals: PASS (§7 patterns exactos del mock con medidas pixel-specific, §10 states, §11 state matrix)
- [x] Dimension 3 — Color: PASS (§3 60/30/10 explícito, `--rubric-2` reserved-for list de 11 elementos, `--primary` correctamente mapeado a `--ink-1` no a rubric)
- [x] Dimension 4 — Typography: PASS (§6 tres tamaños principales + smallcaps/mono, pesos de fuente listados, line heights canónicos, §6.1 consolidation guide para pares cercanos 10/11/12/12.5/13/14/15/16/19/20/26, §6.2 drop-candidates para execution)
- [x] Dimension 5 — Spacing: PASS (§5 scale 4/8/12/16/24/32, paddings exactos por área, §5.1 excepciones catalogadas exhaustivamente con decisión "mantener vs redondear" para cada valor odd, §5.2 resumen de 6 excepciones mock-pixel-perfect)
- [x] Dimension 6 — Registry Safety: PASS (§14, solo shadcn oficial, sin third-party, sin nuevos paquetes)

**Approval:** approved (revision 1 — FLAG 1 §6.1/§6.2 + FLAG 2 §5.1/§5.2 cerrados) → ui-auditor

---

*Standalone: ui-redesign-conversaciones — UI design contract*
*Created: 2026-04-22 · Revised: 2026-04-22 (revision 1)*
*Next: `/gsd-research-phase ui-redesign-conversaciones` → `/gsd-plan-phase ui-redesign-conversaciones`*
