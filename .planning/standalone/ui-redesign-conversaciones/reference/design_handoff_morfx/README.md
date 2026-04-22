# Handoff: morfx — Plataforma de ventas conversacionales

> **Para Claude Code:** Este paquete contiene **8 mockups hi-fi en HTML** que definen la dirección visual y de UX para morfx. Tu trabajo es **recrear estos diseños dentro del codebase del proyecto** (que ya existe), adaptándolos a su stack, librería de componentes y convenciones actuales. **No copies el HTML al árbol de producción** — úsalo como referencia visual.

---

## 0 · Qué hacer primero (Claude Code)

Antes de escribir código:

1. **Abre la raíz del proyecto y detecta el stack**. Revisa `package.json`, `tsconfig.json`, `tailwind.config.*`, `components.json` (shadcn), `app/` vs `pages/` (Next), `src/routes` (Remix/SvelteKit), etc. Identifica framework, router, sistema de estilos, librería de componentes, librería de íconos, carga de fuentes, estado, cliente HTTP / ORM / backend.
2. **Lista archivos existentes relacionados** con los módulos a implementar.
3. **Lee `colors_and_type.css`** (incluido en este paquete) para entender los tokens. Decide cómo mapearlos (Tailwind v4 `@theme`, Tailwind v3 `theme.extend`, CSS Modules / vanilla, o sobrescritura de tokens de shadcn).
4. **Propón un plan** al usuario antes de implementar.
5. Implementa **módulo por módulo**, en el orden indicado.

---

## 1 · Contexto del producto

**morfx** es una plataforma SaaS colombiana para e-commerce y retail que automatiza ventas y atención al cliente por WhatsApp usando agentes IA. Integra:
- **Canales**: WhatsApp Business API (principal), Instagram DM, correo
- **E-commerce**: Shopify, WooCommerce, VTEX, catálogo propio
- **Logística**: Coordinadora, Servientrega, TCC, Interrapidísimo
- **Pagos**: Bold, Wompi, PSE, Mercado Pago
- **Agentes IA**: Valentina (post-venta), Santiago (ventas), Claudia (NPS/seguimiento)

El sistema combina **automatización por IA** con **intervención humana** cuando los guardrails lo requieren. Los agentes crean **tareas** para humanos cuando no pueden resolver algo.

Tono: profesional-cálido colombiano; español neutro.

---

## 2 · Estética · "paper / Bible / dictionary"

La identidad visual de morfx es **editorial de papel impreso**: el texto como objeto tipográfico, la jerarquía resuelta por tipografía serif y reglas finas, la paleta cálida y baja en croma, acentos rojos como **rúbricas** (como las iniciales en tinta roja de un manuscrito), reglas simples y dobles, y texturas sutiles de grano de papel.

**NO es** "swiss newspaper" ni "editorial + terminal" ni un dashboard tecno. Es un **diccionario / libro antiguo reimaginado como SaaS**: composición densa, serif como voz principal, sans-serif solo para UI funcional, monoespaciada para datos, rojo rúbrica como único acento cromático protagonista.

Principios:
- **Tipografía serif lidera**: títulos, body, citas → EB Garamond.
- **Sans solo para UI**: botones, labels, chips, tabs → Inter.
- **Mono para datos, IDs, timestamps** → JetBrains Mono.
- **Rojo rúbrica** (`--rubric-2`) como acento primario — no cinco colores compitiendo.
- **Acentos desaturados** (verdigris, gold, indigo) usados como "tinta de color", sparse.
- **Reglas finas de 1px** como elemento compositivo; reglas dobles (`mx-rule-double`) para jerarquía.
- **Sombras planas y cálidas** (`shadow-page`, `shadow-card`) — nunca neón, glow ni glassmorphism.
- **Texturas de papel**: `--paper-grain` (fibras) y `--paper-fibers` aplicadas en `multiply` sobre fondos grandes (ver §7).

---

## 3 · Fidelidad

**Hi-fi.** Los mocks son referencia pixel-perfect para jerarquía visual, escalas tipográficas, paleta exacta, espaciados y comportamiento de filtros / tabs / paneles.

**Adaptación esperada:**
- Usa los **componentes primitivos existentes** en el proyecto.
- Integra los módulos nuevos dentro del **chrome existente** (si ya hay sidebar/topbar).
- Reemplaza **datos mock** por llamadas reales; si aún no hay endpoints, deja fixtures tipados con `TODO: conectar con API`.
- Iconografía: Lucide en los mocks. Si el proyecto usa otra librería, mapea 1:1 por significado.

**No negociable:** paleta, tipografía, proporciones, jerarquía, estética paper/dictionary.

---

## 4 · Módulos incluidos (8)

| # | Módulo | Archivo | Vistas/estados incluidos en el HTML | Vistas/estados faltantes (TODO Claude Code) |
|---|---|---|---|---|
| 1 | **Conversaciones** (WhatsApp) | `mocks/conversaciones.html` | Inbox con lista, conversación activa, panel de contexto del cliente, pedido vinculado, timeline del CRM | Estado vacío (sin conversaciones), loading (skeleton), error de canal, estado "snoozed", vista responsive <1280px |
| 2 | **Tareas** | `mocks/tareas.html` | Kanban 4 columnas + toggle vista lista + detalle lateral con timeline y checklist | Tareas con múltiples asignados, subtareas anidadas, crear-tarea modal, filtros avanzados |
| 3 | **Pedidos** | `mocks/pedidos.html` | Tabla con filtros, detalle lateral, estado logístico/pago | Pedidos cancelados, refunds, tracking en mapa, bulk actions |
| 4 | **CRM** | `mocks/crm.html` | Contactos + empresas, detalle con historial unificado | Merge de duplicados, import CSV, segmentos dinámicos |
| 5 | **Agentes** | `mocks/agentes.html` | Lista de agentes, editor de prompt, guardrails, tools, knowledge base | Playground de prueba, métricas por agente, versioning |
| 6 | **Automatizaciones** | `mocks/automatizaciones.html` | Canvas de flujo editable, nodos, inspector, lista lateral | Galería de plantillas, modo debug, historial de ejecuciones |
| 7 | **Analytics** | `mocks/analytics.html` | Dashboard de métricas principales | Custom reports, export, comparación de periodos |
| 8 | **Configuración** | `mocks/configuracion.html` | Ajustes generales, integraciones, usuarios y roles | Billing, audit log, webhooks, API keys |

**Orden sugerido de implementación:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.

---

## 5 · Design tokens — fuente de verdad en `colors_and_type.css`

**Siempre consultar el CSS.** Valores clave resumidos aquí para referencia rápida:

### Paleta (OKLCH)
```
--paper-0  oklch(0.995 0.008 85)   highlight
--paper-1  oklch(0.985 0.012 82)   página principal
--paper-2  oklch(0.970 0.016 80)   card / secundaria
--paper-3  oklch(0.945 0.020 78)   hover / hundida
--paper-4  oklch(0.915 0.026 76)   divider

--ink-1    oklch(0.18 0.02 60)     tinta primaria
--ink-2    oklch(0.32 0.025 60)    body
--ink-3    oklch(0.48 0.03 65)     secundaria / quiet
--ink-4    oklch(0.62 0.035 70)    anotación
--ink-5    oklch(0.78 0.03 72)     muy tenue

--rubric-1 oklch(0.45 0.09 28)     rúbrica profunda
--rubric-2 oklch(0.55 0.10 30)     rúbrica estándar (acento primario)
--rubric-3 oklch(0.70 0.07 32)     rúbrica clara / wash

--accent-verdigris oklch(0.52 0.035 180)
--accent-gold      oklch(0.68 0.055 80)
--accent-indigo    oklch(0.42 0.045 260)

--semantic-success oklch(0.50 0.08 145)
--semantic-warning oklch(0.58 0.12 65)
--semantic-danger  = var(--rubric-2)
--semantic-info    = var(--accent-indigo)
```

### Tipografía
```
--font-display    'EB Garamond', 'Cormorant Garamond', 'Times New Roman', Georgia, serif
--font-serif      'EB Garamond', Georgia, 'Times New Roman', serif
--font-sans       'Inter', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif
--font-mono       'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace
--font-small-caps 'EB Garamond', Georgia, serif
```

### Escala de tamaños
```
--fs-display 64  --fs-h1 44  --fs-h2 32  --fs-h3 24  --fs-h4 19
--fs-body 16  --fs-body-sm 14  --fs-caption 12  --fs-micro 11
```

### Espaciado (grid 4)
```
--space-1 4  --space-2 8  --space-3 12  --space-4 16
--space-5 24  --space-6 32  --space-7 48  --space-8 64  --space-9 96
```

### Radios (pequeños — el papel no redondea)
```
--radius-0 0  --radius-1 2  --radius-2 3  --radius-3 4 (default)  --radius-pill 999
```

### Sombras
```
--shadow-hair    0 0 0 0.5px var(--border)
--shadow-page    0 1px 0 var(--border), 0 12px 28px -14px …   (documento sobre escritorio)
--shadow-card    0 1px 0 var(--border), 0 4px 12px -6px …     (card plana)
--shadow-raised  0 1px 0 var(--border), 0 10px 24px -10px …   (modal / overlay)
```

---

## 6 · Clases utilitarias oficiales

Definidas en `colors_and_type.css`. **Usarlas en vez de re-inventar estilos ad-hoc:**

### Tipografía
`mx-display` · `mx-h1` · `mx-h2` · `mx-h3` · `mx-h4` · `mx-body` · `mx-body-long` · `mx-caption` · `mx-smallcaps` · `mx-rubric` · `mx-marginalia` · `mx-ui` · `mx-mono` · `mx-dropcap`

### Reglas
`mx-rule` (1px) · `mx-rule-double` (doble) · `mx-rule-thick` (3px) · `mx-rule-ornament` (ornamental con letter-spacing)

### Tags / pills  ⚠ añadidas en esta revisión para reemplazar `.tg.red/.gold/.indi/.ver` hardcoded
`mx-tag` (base) · `mx-tag--rubric` · `mx-tag--gold` · `mx-tag--indigo` · `mx-tag--verdigris` · `mx-tag--ink`

Todas están construidas con `color-mix(in oklch, <token> N%, var(--paper-0))` sobre los tokens `--rubric-*` / `--accent-*`. **No usar valores OKLCH hardcoded en componentes nuevos.** Los mocks `conversaciones.html` y `crm.html` todavía contienen `.tg.red/.gold/.indi/.ver` locales (por legado de cuando se exploraron los colores); al portar, reemplazar por `mx-tag--*`.

---

## 7 · Texturas de papel — cuándo aplicarlas

`--paper-grain` y `--paper-fibers` son **SVG inline con ruido** definidos en `:root`. Se aplican a través de la clase `mx-doc`:

```css
.mx-doc {
  background: var(--bg);
  background-image: var(--paper-grain), var(--paper-fibers);
  background-blend-mode: multiply;
}
```

**Uso recomendado:**
- Aplicar `mx-doc` al `<body>` o al contenedor root del shell de la app. Da el "peso" del papel.
- **No** aplicarlo a cards individuales, paneles o superficies pequeñas — se satura visualmente.
- **No** aplicarlo a superficies con mucho texto denso en sans o mono — la textura puede reducir la legibilidad.
- En canvas interactivos (editor de flujos, gráficas) omitir textura: el tejido visual complejo ya lleva suficiente ruido.

**Si al implementar notas que el performance baja** (Safari en retina puede tener problemas con SVG de ruido como background-image repetido): moverlo a un `::before` posicionado absoluto con `opacity: 0.6` y `pointer-events: none`.

---

## 8 · Dark mode

**No existe en esta versión.** La estética "paper / Bible / dictionary" está construida alrededor de fondos cálidos y baja croma — invertirla a dark requiere rediseño deliberado (no basta con swap de tokens) porque los conceptos "tinta sobre pergamino" y "rúbrica roja" dejan de funcionar.

**Decisión para Claude Code:**
- La versión 1 es **solo light**.
- Si el proyecto actual tiene sistema de dark mode, **no incluir morfx en el toggle aún**. Asegurarse que los módulos nuevos rendericen con el tema light forzado.
- Agendar dark mode como ítem separado post-lanzamiento; requerirá ronda de diseño propia.

---

## 9 · Responsive — breakpoints y comportamiento

Los mocks están diseñados a **1440px**. Comportamiento esperado:

| Breakpoint | Comportamiento |
|---|---|
| **≥ 1440px** | Layout completo como en los mocks: sidebar 232px + workspace + panel lateral (360–420px). |
| **1280–1439px** | Sidebar 232px. Panel lateral conserva ancho pero columnas internas del workspace se aprietan. |
| **1024–1279px** | Sidebar **colapsa a 56px** (solo íconos; label on hover). Panel lateral derecho se vuelve overlay (`position: fixed`) con backdrop tenue. |
| **768–1023px** | Sidebar oculta; hamburger menu en topbar que abre drawer izquierdo. Workspace a ancho completo. Panel lateral como drawer derecho. |
| **< 768px** | Solo vistas primarias (lista/inbox). Detalle navega a ruta propia en vez de drawer. Tablas colapsan a cards. Kanban se vuelve acordeón de columnas apiladas. |

**Para Conversaciones específicamente** (3 columnas en desktop):
- `≥ 1280px`: lista + chat + contexto visibles.
- `1024–1279px`: lista + chat; contexto como drawer que sale de la derecha al click en el header del cliente.
- `< 1024px`: solo una columna a la vez; navegación tipo stack (lista → chat → contexto).

---

## 10 · Estados (loading / empty / error)

Los mocks no los incluyen explícitamente. Patrón obligatorio para **Conversaciones** (a replicar en los demás):

### Loading
Skeleton con bordes de 1px en `var(--border)` + fondo `var(--paper-2)`, animación `pulse` sutil (opacidad 0.6 → 1 → 0.6, 1.5s ease-in-out infinite). Respetar las mismas proporciones y paddings que el contenido real.

### Empty (bandeja vacía)
- Contenedor centrado vertical.
- `mx-h3` con texto: "La bandeja está limpia."
- `mx-caption` con subtítulo: "Cuando llegue un mensaje nuevo aparecerá aquí."
- Regla `mx-rule-ornament` decorativa (ej: `· · ·`) sobre el bloque.
- Sin ilustración: la estética es tipográfica.

### Empty (filtro sin resultados)
- `mx-h4`: "Nada coincide con los filtros activos."
- Botón sans "Limpiar filtros" estilo texto con borde inferior 1px.

### Error (canal caído, WhatsApp API no responde)
- Banner en el top del panel afectado.
- Fondo `color-mix(in oklch, var(--rubric-2) 8%, var(--paper-0))`, borde izquierdo `3px solid var(--rubric-2)`.
- Ícono Lucide `alert-triangle` en `var(--rubric-2)`.
- Texto serif: "No pudimos conectar con WhatsApp Business." + acción sans: "Reintentar".

### Error (tarea no encontrada / ruta inválida)
Página dedicada con `mx-display` "404" en rúbrica y subtítulo serif. Link a inicio.

---

## 11 · Iconografía · Lucide con versión fijada

Los mocks cargan `https://unpkg.com/lucide@latest` (drift indeseable).

**En implementación fijar a versión específica:**
- npm: `lucide-react@0.460.0` (o la última estable al momento de implementar — verificar en `package.json` del proyecto si ya está).
- Si debe cargarse vía CDN en algún entorno: `https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js`.

**No usar `@latest` nunca en producción.**

---

## 12 · Patrones de UI reutilizables (abstraer a componentes)

### Layout app
- **Sidebar** 232px, fondo `--paper-2`, brand lockup `morf·x` arriba (Instrument Serif/EB Garamond 800, punto en `--rubric-2`), navegación por categorías, badges mono a la derecha.
- **Topbar**: eyebrow (`mx-smallcaps`) + título `mx-h1` (display serif) + acciones. Botón primario rojo "Nueva X".
- **Tabs** bajo topbar: vistas guardadas + chips de filtros.
- **Workspace** grid `1fr <panel-lateral>` (panel varía por módulo).

### Cards / items
- `border: 1px solid var(--ink-1)` + `box-shadow: 0 1px 0 var(--ink-1)` (shadow-card / shadow-page según elevación).
- Franja de prioridad 3px `border-left` (`--rubric-2` urgent / `--accent-gold` high / `--accent-indigo` med / `--ink-4` low).
- Header: ID mono + badge tipo a la derecha.
- Footer: avatares encadenados (`margin-left: -4px`) + asignado + SLA.

### Avatares
Círculo 22–28px, fondo `--paper-3`, borde `--paper-0` 1.5px, iniciales en **serif display bold**. Variante `.bot` para agentes IA: fondo tintado rubric, borde rubric, color rubric.

### Pills de estado
Usar `mx-tag--rubric` / `--gold` / `--indigo` / `--verdigris` / `--ink`.

### Timeline (Tareas, Pedidos, Conversaciones)
Línea vertical 1px a la izquierda. Dots 8×8px con borde coloreado por tipo: `bot` (rubric), `human` (verdigris), `system` (indigo), `warn` (gold sólido). Citas en serif italic con `border-left: 2px solid var(--rubric-2)` sobre `--paper-2`.

### Inspector desplegable
`<details open>` + `<summary>` como header clickeable, caret Lucide rotando 90°, título `mx-smallcaps` + meta mono, cuerpo con padding 0 20px 16px.

### Kanban (Tareas)
4 columnas con header sticky, swatch 10×10, título `mx-smallcaps`, contador mono. Add button en cada header.

---

## 13 · Comportamiento / interacciones

- **Navegación**: sidebar compartida; rutas `/conversaciones`, `/tareas`, `/pedidos`, `/crm`, `/agentes`, `/automatizaciones`, `/analytics`, `/configuracion`. Item activo: fondo `--paper-0` + borde `--ink-1` + sombra plana.
- **Tabs** de vistas guardadas: cambian filtro activo sin recargar; contador mono a la derecha.
- **Selección list → detalle**: click puebla panel derecho. Estado seleccionado `outline: 2px solid var(--rubric-2)` con `outline-offset: 2px` o fila tintada en tablas. Persistir en URL (`?id=T-1482`).
- **View toggles** (kanban/lista, tarjetas/lista): botones unidos, activo en `--ink-1` con texto `--paper-0`.
- **Escalamientos**: guardrail → agente crea tarea → mensaje al cliente ("Un miembro del equipo te responde en breve") → humano ve tarea con contexto completo. El timeline en Tareas muestra esta cadena.
- **Tiempo real**: WebSocket / SSE si el backend lo soporta; si no, polling 5–10s.
- **Keyboard**: Esc cierra drawers/paneles; `/` enfoca búsqueda; `[` y `]` navegan items en listas; tab order coherente; focus visible siempre.

---

## 14 · Schemas tentativos

```ts
type Task = {
  id: string              // T-1482
  title: string
  excerpt: string
  type: 'escalada_agente' | 'ventas' | 'operaciones' | 'manual' | 'esperando_cliente'
  priority: 'urgent' | 'high' | 'med' | 'low'
  status: 'pending' | 'progress' | 'waiting' | 'resolved'
  assignee: User | null
  origin: { agent?: Agent; conversationId?: string }
  customer: Contact
  order?: Order
  slaDueAt: Date | null
  labels: string[]
  checklist: ChecklistItem[]
  timeline: TimelineEvent[]
  createdAt: Date
  updatedAt: Date
}

type Conversation = {
  id: string
  channel: 'whatsapp' | 'instagram' | 'email'
  contact: Contact
  lastMessageAt: Date
  unread: number
  assignedTo: User | Agent | null
  status: 'open' | 'pending' | 'resolved' | 'snoozed'
  messages: Message[]
  labels: string[]
}

type Order = {
  id: string
  shop: 'shopify' | 'woo' | 'vtex' | 'propio'
  customerId: string
  total: { amount: number; currency: 'COP' }
  paymentStatus: 'paid' | 'pending' | 'failed' | 'refunded'
  fulfillmentStatus: 'pending' | 'processing' | 'shipped' | 'delivered' | 'returned'
  carrier?: 'coordinadora' | 'servientrega' | 'tcc' | 'interrapidisimo'
  trackingCode?: string
  items: OrderItem[]
  events: OrderEvent[]
}
```

---

## 15 · Assets

- **Fuentes**: Google Fonts — EB Garamond (incluye itálica), Cormorant Garamond (fallback display), Inter (400/500/600/700), JetBrains Mono (400/500). En Next.js usa `next/font/google`. `@import` del CSS es aceptable para vanilla; **mejor self-host o `next/font`** para producción.
- **Iconos**: Lucide, versión fijada (§11).
- **Imágenes**: Sin imágenes reales en mocks — solo avatares con iniciales en CSS. Mantener ese patrón salvo que el proyecto ya tenga avatares reales.
- **Logo**: Lockup `morf·x` tipográfico puro (EB Garamond 800, punto en `--rubric-2`). Componente `<Brand />`, no imagen.
- **Texturas**: `--paper-grain` y `--paper-fibers` ya son SVG inline en el CSS. No hay archivos externos.

---

## 16 · Archivos en este paquete

```
design_handoff_morfx/
├── README.md                       ← este archivo
├── CHANGELOG.md                    ← cambios respecto a la versión anterior del handoff
├── colors_and_type.css             ← tokens + @font-face + utilitarias (fuente de verdad)
└── mocks/
    ├── conversaciones.html         ← prioridad 1
    ├── tareas.html                 ← prioridad 2
    ├── pedidos.html
    ├── crm.html
    ├── agentes.html
    ├── automatizaciones.html
    ├── analytics.html
    └── configuracion.html
```

Cada `.html` carga `../colors_and_type.css` y Lucide (CDN @latest solo para visualización; fijar en implementación).

---

## 17 · Criterios de "hecho" por módulo

- [ ] Estructura (sidebar, topbar, tabs, workspace) matchea el mock.
- [ ] Tipografía, color, espaciado coinciden visualmente al comparar lado a lado.
- [ ] Interacciones clave funcionan con datos reales o fixtures tipados.
- [ ] Estados loading/empty/error implementados según §10.
- [ ] Responsive con breakpoints de §9.
- [ ] Sin `console.error` ni warnings de accesibilidad graves.
- [ ] Keyboard-navigable (tab order, focus visible, Esc cierra paneles).
- [ ] Usa los primitivos del codebase.
- [ ] Tags usan `mx-tag--*`, no OKLCH hardcoded.
- [ ] Lucide con versión fijada, no `@latest`.

---

## 18 · Preguntas para el usuario antes de empezar

Si algo de esto no está claro en el codebase, **pregunta antes de asumir**:

1. ¿Hay convención de rutas (`/app/...` vs `/src/pages/...`)?
2. ¿Cuál módulo prefieren ver funcionando primero?
3. ¿Feature flags / gates para release progresivo?
4. ¿i18n? (los mocks están en español — ¿hardcoded o extraído?)
5. ¿Storybook para documentar componentes nuevos?
6. ¿Tests a pasar / añadir?
7. ¿Monorepo? ¿En qué package va esto?

---

**Fin del handoff.** — claude.ai design
