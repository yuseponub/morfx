# AUDITORÍA DE PARIDAD — UI Editorial v3 vs UI anterior (legacy/v2)

**Fecha:** 2026-06-11
**Método:** 4 agentes de exploración en paralelo (Inbox WhatsApp, CRM Contactos, CRM Pedidos, Shell/Navegación), comparando rama por rama el markup legacy/v2 vs el markup v3 (`ui_editorial_v3` / `.theme-editorial-v3`). Un gap = capacidad con punto de entrada en el UI viejo sin equivalente en el render v3 (aunque el handler/estado exista).
**Disparador:** El filtro de etiquetas del inbox quedó escondido bajo el rediseño (ya resuelto en quick task `260611-clj`, commit `5c358db1`). Esta auditoría busca todos los casos análogos.

> Los números de línea son evidencia al momento de la auditoría — verificar al implementar cada fix.

---

## RESUMEN EJECUTIVO

| Superficie | Paridad estimada | Gaps críticos | Gaps medios | Gaps menores |
|---|---|---|---|---|
| Inbox WhatsApp | ~95% | 1 | 1 | 1 |
| CRM Contactos | ~60-70% | 3 | 2 | 6 |
| CRM Pedidos | ~85% | 2 | 4 | 2 |
| Shell/Navegación | — | 1 (móvil) | 3 | 3 |

**Patrón sistémico:** lo compartido entre ramas (dialogs, sheets, forms, handlers) está al 100%; lo re-escrito como markup nuevo (tablas, chips de filtros, cards de kanban, navs hardcodeadas) es donde se perdió funcionalidad. Mismo patrón P-1..P-5 documentado en `ui-redesign-dashboard/UI-REVIEW.md`.

---

## TIER 1 — CRÍTICOS (bloquean operación diaria si v3 se activa)

### C-1. CRM Contactos: sin acciones de fila (editar / eliminar)
- La tabla v3 (`table.dict`) no tiene menú de acciones. Legacy: dropdown con Ver detalles / Editar / Eliminar (`columns.tsx:283-314`). En v3 solo el nombre es link a detalle.
- Workaround actual: entrar a la página de detalle para todo.
- Fix: dropdown de fila en la tabla v3 reutilizando los handlers existentes (`onEdit`/`onDelete` ya viven en `contacts-table.tsx`).

### C-2. CRM Contactos: filtro de tags reducido a 4 tabs hardcodeadas
- v3 solo ofrece Todos/Clientes/Leads/Mayoristas (`contacts-table.tsx:311-356`). Legacy: `<TagFilter>` multi-select con cualquier tag del workspace (`contacts-table.tsx:569-574`).
- Workspaces con tags propios (ej. "VIP") no pueden filtrar. Mismo bug-class que el filtro del inbox.
- Fix: portar `TagFilter` (o popover equivalente al del inbox v3) a la toolbar v3.

### C-3. CRM Contactos: gestor de etiquetas inaccesible
- `<TagManager>` está montado en v3 (`contacts-table.tsx:527-531`) pero `setTagManagerOpen` nunca se dispara — el botón "Gestionar etiquetas" vivía dentro de `TagFilter` que v3 no renderiza.
- Fix: botón/entrada en la toolbar v3 (1 línea de wiring; el sheet ya existe).

### C-4. CRM Pedidos: badge de error de duplicado de productos ausente en card v3
- `kanban-card.tsx:323-445` (legacy: popover + AlertTriangle para pedidos duplicados sin productos — feature del standalone `crm-duplicate-order-products-integrity`, caso Doralba). La card v3 no lo renderiza.
- Riesgo de negocio real: pedidos con total incorrecto pasan invisibles.

### C-5. CRM Pedidos: avisos de límite WIP ausentes en kanban v3
- Legacy: badge color-coded `4/10` + banner rojo en columnas over-limit (`kanban-column.tsx:312-320, 366-371`). v3: contador simple sin info WIP.
- Fix barato: concatenar `/{wipLimit}` al contador `.c` + clase de warning.

### C-6. Shell móvil v3: 9 módulos inaccesibles
- `mobile-nav.tsx:18-44` (v3) hardcodea 5 items: CRM, WhatsApp, Automatizaciones, Agentes, Settings. Sin enlace móvil: **SMS, Tareas, Comandos, Analytics, Métricas, Confirmaciones, Equipo, Configuración, Sandbox**.
- El sidebar desktop v3 sí los tiene todos (usa `navCategoriesV2`).
- Fix: derivar mobile-nav v3 de `navCategoriesV2` (con los mismos filtros adminOnly/settingsKey) en vez de array hardcodeado.

### C-7. Inbox: filtros "Sin asignar" y "Sin respuesta" perdidos
- Legacy/v2: `InboxFilters` con 6 estados (`conversation-list.tsx:501`). Chips v3: solo Todas/Sin leer/Mías/Agente IA/Cerradas (`:293-335`).
- Fix: 2 chips más reutilizando la lógica de filtro existente.

---

## TIER 2 — MEDIOS (degradación funcional notable)

| # | Superficie | Gap | Evidencia | Nota |
|---|---|---|---|---|
| M-1 | Inbox | Toggle de ordenamiento (last_customer_message ↔ last_message) sin UI en v3 — estado existe, botón no | `conversation-list.tsx:509-512` (legacy) | chip o icono en la fila de filtros |
| M-2 | Contactos | Sin ordenamiento de columnas en tabla v3 (nombre/ciudad/depto/fecha) | `columns.tsx:150-271` vs `table.dict` | headers v3 sin botones sort |
| M-3 | Contactos | Columnas Dirección y Departamento no visibles en v3 (8→6 columnas) | `columns.tsx:183-193, 220-235` | info disponible solo en detalle |
| M-4 | Pedidos | Reordenar etapas: drag handle visual eliminado en v3 (listeners existen, affordance no) | `kanban-column.tsx:286-299` | usuario no sabe que puede arrastrar |
| M-5 | Pedidos | Tracking number no visible en card v3 (sí en sheet) | `kanban-card.tsx:460-467` | |
| M-6 | Pedidos | Filtro de tags: solo primeros 4 visibles como chips en toolbar v3; legacy mostraba todos vía popover | `orders-view.tsx:1003-1021` vs `:1229-1294` | añadir chip "Más…" o popover |
| M-7 | Pedidos | Empty state v3 cae al markup LEGACY (`if (v3 && !isEmpty)` en `orders-view.tsx:920` → con 0 pedidos renderiza la rama vieja) | verificado 2026-06-11 | funcional pero inconsistencia visual dentro del shell v3 |
| M-8 | Shell | Global search presente en sidebar v2, ausente en sidebar v3 | `sidebar.tsx:470` (v2) vs rama v3 | ¿intencional por mock? confirmar |
| M-9 | Shell | Theme toggle solo en topbars de los 3 módulos v3 (D-07); en módulos no rediseñados el toggle queda en el header legacy | `sidebar.tsx:250-251` | aceptable mientras existan módulos sin reskin |

---

## TIER 3 — MENORES (visual / nice-to-have)

- Pedidos: dots de tipo de producto (P/W/RECO/C) en card (`kanban-card.tsx:290-305`); badge "Cerrado" en columna (`kanban-column.tsx:323-326`).
- Inbox: atajo Escape para cerrar panel en <1280px (`inbox-layout.tsx:179-197` legacy; v3 sin handler).
- Shell: fuente del nombre en user menu (v3 sans vs v2 serif — ¿regresión?); badge color `--viv-red` (v3) vs `--rubric-2` (v2) — confirmar intención; mobile-nav v3 `fixed top-3 left-3 z-50` puede solapar contenido.
- Shell: dualidad `/configuracion` vs `/settings` (ambas rutas viven; sidebar v3 enlaza `/configuracion` como principal) — decidir merge o convivencia.

---

## SIN GAPS (verificado OK / compartido)

- **Inbox:** chat-header (18 features incl. BOLD, GoDentist, asignación, archivar, debug), contact-panel completo, composer (templates, adjuntos, interactivos, quick replies), burbujas, day separator, atajos `/` `[` `]`, item de conversación completo.
- **Pedidos:** OrderSheet, OrderForm, bulk actions (delete/move/edit/export), recompra, drag&drop de pedidos, realtime, fuzzy search, pipeline tabs, persistencia de pipeline.
- **Contactos:** búsqueda, paginación, CSV import/export completo, bulk actions, dialogs create/edit, formulario.
- **Shell desktop:** sidebar v3 enlaza los 14 módulos con badges de tareas/automatizaciones.

## FUERA DE SCOPE DEL REDISEÑO (diferidos por diseño, no son gaps)

Módulos sin reskin v3 (siguen con UI legacy + header viejo, accesibles desde sidebar v3): SMS, Tareas, Comandos, Automatizaciones, Analytics, Métricas, Sandbox, Agentes, Confirmaciones, Settings/Configuración. Documentado como diferido en `ui-redesign-editorial-shell/CONTEXT.md`.

---

## PLAN SUGERIDO (waves)

1. ✅ **Wave 1 — Contactos CRUD + tags (C-1, C-2, C-3):** SHIPPED 2026-06-11, quick task `260611-w1a` (commits `a2f7ea0b`, `c8c0c9d2`).
2. ✅ **Wave 2 — Pedidos kanban (C-4, C-5, M-4, M-5, M-7):** SHIPPED 2026-06-11, quick task `260611-w2b` (commits `f3f70799`, `a3e6b5ac`, `ba77ca62`).
3. ✅ **Wave 3 — Inbox + nav móvil (C-6, C-7, M-1):** SHIPPED 2026-06-11, quick task `260611-w3c` (commits `95b71090`, `f3c2fd04`, `ea1fbae6`). `navCategoriesV2` extraída a `src/components/layout/nav-items.ts`.
4. ⬜ **Wave 4 — pulido (M-2, M-3, M-6, M-8, Tier 3):** PENDIENTE — sort de columnas Contactos, columnas Dirección/Departamento, tags >4 en Pedidos, search global sidebar (decisión de diseño), fuente user menu, Escape inbox.

**Los 7 críticos están cerrados.** Pendiente QA visual del usuario con el flag ON en un workspace de prueba.

---

# SEGUNDA PASADA — AUDITORÍA COMPLETA DE NAVEGACIÓN Y FLAGS (2026-06-11 PM)

**Disparador:** el usuario reportó que el builder IA de templates (`/configuracion/whatsapp/templates/builder`) era inaccesible en v3. La primera pasada solo comparó ramas de markup en las 3 superficies rediseñadas — no el **grafo de navegación**. Segunda pasada: 4 agentes (click-graph completo, diff /settings vs /configuracion, 10 módulos sin rediseñar bajo shell v3, branches del flag v2).

## Hallazgo estructural

La página `/settings` (hub de 13 cards, enlazada por el sidebar legacy) es el "índice escondido" de la UI vieja: contenía links hardcodeados que el árbol `/configuracion` (el que enlaza el sidebar v3) nunca replicó. Toda ruta cuyo único inbound link viviera ahí quedó huérfana en v3.

## Rutas huérfanas encontradas y cerradas (3/3)

| Ruta | Único acceso previo | Fix | Commit |
|---|---|---|---|
| `/configuracion/whatsapp/templates/builder` (builder IA) | card en `/settings` | botón "Crear con IA" en templates + card en hub WhatsApp | `30b773df` |
| `/settings/workspace/roles` | card en `/settings` | item "Roles y permisos" en `/configuracion` (Workspace) | `9c5da1fa` |
| `/crm/productos` | card en `/settings` | tab "Productos" en CRM tabs | `9c5da1fa` |

## Resto del click-graph: OK

Las ~40 rutas restantes del dashboard son alcanzables en v3 (sidebar 14 items → hubs → subpáginas). `/settings` queda accesible solo vía user-menu (aceptable; considerar deprecación a futuro). Dead code detectado: `/agentes/somnio-v4/unknown-cases` (0 inbound links — revisar si es WIP).

## Módulos sin rediseñar bajo shell v3: SIN regresiones

Los 10 módulos (tareas, confirmaciones, sms, automatizaciones, agentes, comandos, analytics, métricas, sandbox) tienen **0 ramas de flags** — renderizan idéntico con v3 ON/OFF. El `<Header>` legacy nunca se montó en el dashboard (solo marketing), así que no se pierde chrome. Portales (Dialog/Sheet) seguros: los tokens shadcn (`--background` etc.) se remapean dentro de `.theme-editorial-v3` y los portales a body heredan sin romper. Badges tasks/automations idénticos.

## GlobalSearch (M-8, precisado)

El botón de búsqueda global solo se renderiza en el sidebar legacy y v2; el sidebar v3 lo omite. **Ctrl/Cmd+K sigue funcionando globalmente** (`use-global-search.ts` binding en window) — pérdida de descubribilidad, no de funcionalidad. Decisión de diseño pendiente: chip/icono de búsqueda en sidebar v3 o topbars.

## Flag `ui_dashboard_v2` (capa v2 previa): deuda documentada

- `ContactsViewV2` (rama v2 de Contactos, piloto retrofit) es **esencialmente read-only**: search/paginación/CSV/bulk/row-actions son stubs visuales. Solo afecta workspaces con `ui_dashboard_v2=true` + `ui_editorial_v3=false` (el flag v2 fue rolled-back tras QA 2026-04-24 — verificar que ningún workspace prod lo tenga ON). Recomendación: deprecar la rama v2 de contactos en favor de v3 en vez de completarla.
- `/configuracion` rama v2: mismos 9 items que legacy (sin pérdida; solo hover effects).
- Inventario de flags UI en `workspaces.settings`: `ui_inbox_v2`, `ui_dashboard_v2`, `ui_editorial_v3`, `conversation_metrics`, `hidden_modules`.

## Limpieza sugerida (backlog)

- Quitar cards "Contactos"/"Productos" de `/settings` (son módulos de datos, no settings).
- Tab "Pipelines" en CRM tabs sigue comingSoon (`#` + toast) aunque `/crm/configuracion/pipelines` existe — cablear o quitar.
- Decidir destino de `/settings` hub (redirect a `/configuracion`?).
- `/agentes/somnio-v4/unknown-cases`: confirmar WIP o borrar.

Cada wave es ejecutable como quick task o standalone corto; todos los cambios son aditivos a la rama v3 (Regla 6: legacy/v2 intactos). El flag `ui_editorial_v3` sigue OFF por defecto, así que se puede iterar sin riesgo en producción.
