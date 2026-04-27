# Standalone: UI Pipeline Persistence + CRM Routing - Context

**Gathered:** 2026-04-27
**Status:** Ready for research + planning
**Origin:** Bug reportado por usuario 2026-04-27 — dos problemas de UX en `/crm/pedidos` (v2 editorial activo en Somnio):
1. Al cambiar a un pipeline secundario (ej. "logística") y recargar (F5), el kanban vuelve al pipeline default — la seleccion no persiste.
2. Click en "CRM" del sidebar v2 lleva a `/crm/contactos` por default; usuario quiere que vaya a `/crm/pedidos`. Ademas hay un sublink "Pedidos" duplicado en el sidebar v2 que debe eliminarse (CRM ya llevaria ahi).

Usuario explicito: "quiero arreglar esto estructuralmente, no como parches".

<domain>
## Phase Boundary

**Scope:** Solo el dashboard editorial v2 (`ui_dashboard_v2.enabled=true` resuelto via `getIsDashboardV2Enabled(workspaceId)` — actualmente activo solo en workspace Somnio `a3843b3f-c337-4836-92b5-89c58bb98490`).

Dos cambios estructurales acoplados por afectar la misma navegacion CRM:

1. **Persistencia del pipeline activo en `/crm/pedidos`** (kanban): la seleccion del usuario debe sobrevivir a F5, navegacion fuera y vuelta a la pagina, y al compartir URL con otro usuario del mismo workspace.

2. **CRM landing + sidebar v2:** click en `CRM` del sidebar lleva directo a `/crm/pedidos` (no a `/crm/contactos`). El sublink "Pedidos" duplicado en `navCategoriesV2` se elimina porque `CRM` ya cumple esa funcion. Contactos sigue accesible via tabs internas del CRM hub (`<CrmTabs/>`).

**Fuera de scope:**
- Sidebar legacy (`v2=false`) — NO se toca. Renderiza byte-identical como hoy. Razon: usuario explicito "TODO ESTO ES PARA EL DISENO QUE ESTA ACTIVO EN EL WORKSPACE DE SOMNIO" (que es v2).
- Cambios al `/crm/contactos`, `/crm/configuracion`, `/crm/productos` — solo la landing redirect del hub `/crm` y el OrdersView del kanban.
- Persistencia per-user en DB (user_preferences). Decision: localStorage por workspace es suficiente — multi-device sync no es requerido.
- Cambios al `pipeline-tabs.tsx` localStorage de pipelines abiertos (`morfx_open_pipelines`). Esa logica se queda igual; agregamos una key NUEVA para el pipeline activo.
- Refactor del data fetch de `/crm/pedidos/page.tsx` mas alla de leer un searchParam adicional.
- Cambios al kanban-board, drag-and-drop, ni a la sheet del pedido.

</domain>

<decisions>
## Implementation Decisions

### Persistencia del pipeline activo

- **D-01:** **URL query param es la source of truth + localStorage como fallback de "ultima visita".** El kanban lee `?pipeline=<uuid>` desde `useSearchParams()` en cada render. Cuando el usuario cambia de pipeline en la UI, se hace `router.replace('/crm/pedidos?pipeline=<id>', { scroll: false })` para actualizar la URL sin recargar. En paralelo se persiste a localStorage `morfx_active_pipeline:<workspaceId>` para que la proxima visita (sin query param) caiga al ultimo elegido. Razon: (a) F5 funciona nativo — la URL no se pierde; (b) shareable y deep-linkable; (c) "ultima visita" se preserva al entrar fresh; (d) no requiere migracion DB ni nuevas tablas.

- **D-02:** **Resolucion en server component (`page.tsx`) para evitar flash inicial.** `OrdersPage` lee `searchParams.pipeline` (Next 15 App Router pasa `searchParams` como prop async) y resuelve el `defaultPipelineId` que pasa a `<OrdersView/>`. Si la URL trae un pipeline valido (existe en `getPipelines()`), se usa ese. Si no (sin query param o uuid invalido), el server resuelve el default via `getOrCreateDefaultPipeline()` como hoy — y el cliente, en `useEffect` de mount, intenta leer localStorage `morfx_active_pipeline:<workspaceId>` y si encuentra un id valido hace `router.replace` con ese pipeline (1 render extra aceptable; flash minimo porque la mayoria de visitas vienen con URL).

- **D-03:** **Validacion contra pipelines del workspace.** Antes de aceptar un `pipeline` query param o un id de localStorage, validar que existe en el array `pipelines` recibido (filtrado ya por workspace via RLS en el domain layer). Si el id viene en URL pero no existe → server resuelve default y NO redirige (el query param invalido se queda colgado, pero la UI muestra el default). Si viene de localStorage y no existe → ignorar y usar default. **Razon:** Regla 3 — workspace isolation; usuario movido entre workspaces no debe ver pipelines de otro workspace por estado stale.

- **D-04:** **Pipeline eliminado: caida silenciosa al default, sin toast.** Confirmado por usuario. La key de localStorage simplemente se sobrescribe la proxima vez que el usuario seleccione algo en la UI; no se hace cleanup proactivo.

- **D-05:** **Key de localStorage scoped por workspace.** Formato: `morfx_active_pipeline:${workspaceId}`. Razon: (a) usuarios con multiples workspaces no se confunden — cada workspace recuerda su propio ultimo pipeline; (b) consistente con el cookie `morfx_workspace` que ya scopa el contexto. El `workspaceId` se obtiene client-side via prop pasada desde el server (la pagina ya lo lee del cookie `morfx_workspace`).

- **D-06:** **`pipeline-tabs.tsx` no se toca.** El localStorage `morfx_open_pipelines` (pestañas abiertas, plural) sigue como esta. Solo agregamos la key nueva `morfx_active_pipeline:<workspaceId>` (singular, activo). Son dos conceptos distintos: cuales tabs estan abiertas vs cual esta activo. Razon: minimal blast radius.

### CRM routing y sidebar v2

- **D-07:** **`/crm` redirect cuando v2=true cambia de `/crm/contactos` → `/crm/pedidos`.** Cambio en `src/app/(dashboard)/crm/page.tsx:22-25`. La rama `v2=false` (legacy) se queda igual: `redirect('/crm/pedidos')` ya iba ahi tambien — pero NO se toca el codigo de la rama legacy (Regla 6 byte-identical). Solo se modifica la rama `if (v2)`.

- **D-08:** **Eliminar `{ href: '/crm/pedidos', label: 'Pedidos', icon: Package }` de `navCategoriesV2[0].items`** (`src/components/layout/sidebar.tsx:146`). Categoria "Operación" queda con: CRM, WhatsApp, Tareas, Confirmaciones, SMS (5 items en vez de 6). El array `navItems` legacy NO se toca — Regla 6 fail-closed.

- **D-09:** **Contactos accesible via `<CrmTabs/>` interno del CRM hub.** `src/app/(dashboard)/crm/components/crm-tabs.tsx` ya tiene Contactos | Pedidos·kanban | Pipelines | Configuración como tabs editoriales. Cuando el usuario aterriza en `/crm/pedidos` desde el sidebar, ve estos tabs arriba (renderizados por `crm/layout.tsx`) y puede cambiar a Contactos sin volver al sidebar. **No se agregan tabs nuevos ni se reordenan los existentes.**

- **D-10:** **No se toca el sidebar legacy** (`navItems[0]` en `sidebar.tsx:46`). Mantiene `{ href: '/crm', label: 'CRM' }` y la rama legacy de redirect (`/crm` → `/crm/pedidos` cuando v2=false) ya cumple lo que el usuario quiere — pero NO se toca por Regla 6. Si en el futuro se desactiva v2 en algun workspace, el sidebar legacy sigue funcionando como hoy.

### Scope y testing

- **D-11:** **Single standalone, no dividir.** Los dos bugs estan acoplados por la navegacion CRM y los archivos afectados son < 5. Tests: validar manualmente en Somnio con flag activo (a) F5 mantiene pipeline activo, (b) compartir URL con `?pipeline=<id>` carga ese pipeline, (c) volver a `/crm/pedidos` sin query param carga el ultimo de localStorage, (d) sidebar v2 ya no muestra "Pedidos" duplicado, (e) click en CRM va directo a `/crm/pedidos`. No se requieren tests automatizados — la logica es de navegacion + persistencia, low risk una vez validado en QA.

- **D-12:** **Regla 5 no aplica** — no hay migraciones DB. Solo cambios de UI client/server components.

- **D-13:** **Regla 6 (proteger agente en produccion) no aplica directamente** — esto no toca agentes. Pero la Regla 6 byte-identical fail-closed para el branch v2=false se respeta: ningun cambio del scope toca codigo que se ejecuta cuando v2=false en otro workspace.

### Claude's Discretion

- Implementacion exacta del `useEffect` de hidratacion (orden de ops, dependencies, cleanup) — Claude decide.
- Si el cambio de pipeline en UI hace `router.replace` (sin scroll up) o `router.push` (con history entry). Default: `replace` para no llenar history.
- Manejo de race condition entre el server-resolved `defaultPipelineId` y el client-resolved de localStorage (caso edge: URL sin query, localStorage tiene id). Default: server siempre arranca con `defaultPipeline` real (de DB), client en mount puede hacer un `router.replace` para hidratar la URL — un re-render aceptable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CRM v2 estructura (sidebar + tabs + redirect)
- `src/components/layout/sidebar.tsx` — `navCategoriesV2[0]` (Operación) en linea 140-151. Eliminar item `Pedidos` (linea 146). NO tocar `navItems` legacy (linea 44-122) ni la rama legacy del render (linea 399+).
- `src/app/(dashboard)/crm/page.tsx` §`if (v2)` — cambiar `redirect('/crm/contactos')` (linea 23) por `redirect('/crm/pedidos')`. Conservar comentario actualizado o reemplazarlo.
- `src/app/(dashboard)/crm/layout.tsx` — Server component que renderiza `<CrmTabs/>` cuando v2=true. NO se toca; solo lectura para confirmar que Contactos sigue accesible via tabs.
- `src/app/(dashboard)/crm/components/crm-tabs.tsx` — Define los 4 tabs editoriales. NO se toca.

### Pipeline persistence
- `src/app/(dashboard)/crm/pedidos/page.tsx` — Server component, leer `searchParams.pipeline` (Next 15 async prop), validar contra `getPipelines()`, pasar `defaultPipelineId` a `<OrdersView/>`. Hoy linea 28 solo lee `getOrCreateDefaultPipeline()`.
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:154-156` — Estado `activePipelineId` actualmente solo React state. Agregar: lectura de URL via `useSearchParams()` (ya importado, linea 4), escritura via `router.replace`, persistencia a localStorage en cambio.
- `src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx:15` — Constante `LOCAL_STORAGE_KEY = 'morfx_open_pipelines'` (pestañas abiertas). NO se toca. La nueva key de pipeline activo vive en `orders-view.tsx`.

### Patrones existentes que reusamos
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:64-66` — Patron localStorage existente para `morfx_orders_view_mode`, `morfx_kanban_sort_field`, `morfx_kanban_sort_dir`. Replicar el mismo estilo (try/catch, validacion contra valores conocidos, fallback silencioso). La nueva key sigue el mismo namespace `morfx_*`.
- `src/lib/auth/dashboard-v2.ts` — `getIsDashboardV2Enabled(workspaceId)` — flag resolver. Solo lectura para entender el patron; no se llama desde codigo nuevo (la layout y la /crm page ya lo resuelven).

### Reglas del proyecto (lectura obligatoria antes de planear)
- `CLAUDE.md` Regla 0 — GSD completo, sin atajos.
- `CLAUDE.md` Regla 1 — Push a Vercel post-cambios.
- `CLAUDE.md` Regla 4 — Actualizar `docs/analysis/04-estado-actual-plataforma.md` si afecta estado de modulo.
- `CLAUDE.md` Regla 6 — Proteger comportamiento legacy. La rama `v2=false` debe quedar byte-identical.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **localStorage pattern:** `orders-view.tsx:64-66` ya define 3 keys (`morfx_orders_view_mode`, `morfx_kanban_sort_field`, `morfx_kanban_sort_dir`) con try/catch silencioso. La nueva key `morfx_active_pipeline:<workspaceId>` sigue el mismo namespace.
- **`useSearchParams()`:** ya importado en `orders-view.tsx:4` (`useRouter, useSearchParams` desde `next/navigation`). Solo se usa para `contact_id` (linea 151). Extender para leer `pipeline`.
- **`router.replace`:** ya disponible via `useRouter()` (linea 140 de orders-view). No requiere import nuevo.
- **`<CrmTabs/>` con tab activo via `usePathname()`:** ya garantiza que cuando el usuario aterriza en `/crm/pedidos`, el tab "Pedidos · kanban" se ilumina y "Contactos" queda accesible con un click. No requiere ningun cambio.

### Established Patterns
- **v2 vs legacy fail-closed (Regla 6):** todos los cambios estructurales del UI v2 se hicieron con `if (v2)` branches que dejan la rama legacy intacta. Aplicar el mismo patron aqui — solo tocar `if (v2)` en `crm/page.tsx` y solo `navCategoriesV2` en `sidebar.tsx`.
- **Workspace-scoped state:** el cookie `morfx_workspace` define el workspace activo; localStorage keys que dependan del workspace deben sufijarse con `:${workspaceId}` para evitar contaminacion cruzada (ya hay precedente conceptual en como el resto del app filtra por workspace).
- **Server → client hydration via prop:** `page.tsx` resuelve `defaultPipelineId` en server, lo pasa a `OrdersView` como prop. Patron consistente — extenderlo: server lee URL `searchParams.pipeline`, valida, y pasa el id resuelto.

### Integration Points
- **`crm/page.tsx:22-25`** — punto unico para cambiar el destino del redirect v2.
- **`sidebar.tsx:146`** — punto unico para eliminar el sublink duplicado.
- **`pedidos/page.tsx:28`** — punto unico para extender la resolucion server-side del pipeline activo (leer `searchParams`).
- **`orders-view.tsx:154-156` + handler `onPipelineChange`** (donde sea que esten en `pipeline-tabs.tsx` o equivalente) — punto unico para escribir URL + localStorage en cada cambio.

</code_context>

<specifics>
## Specific Ideas

- "tu decide que no se generen bugs" (D-01) — usuario delega la eleccion entre URL/localStorage/ambos a Claude con el mandato de prevenir bugs. La decision URL+localStorage hibrido cubre F5 (URL), share-link (URL), y "ultima visita" (localStorage) sin trade-offs.
- "TODO ESTO ES PARA EL DISENO QUE ESTA ACTIVO EN EL WORKSPACE DE SOMNIO" — interpretado como `ui_dashboard_v2.enabled=true`, scope strict v2-only.
- Estructura del CRM tal como esta hoy en v2 (CrmTabs con Contactos | Pedidos | Pipelines | Configuración) — usuario confirmo "como esta en el nuevo diseño". No se reestructura nada de los tabs.

</specifics>

<deferred>
## Deferred Ideas

- **User-level pipeline preference en DB** (`user_preferences` table) — para sync multi-device. No requerido ahora; localStorage es suficiente. Si en algun momento aparece la necesidad, se puede agregar como capa extra encima del esquema URL+localStorage.
- **UI para ver cuales pipelines tiene "abiertos" un usuario** (algo como tabs persistentes cross-device) — fuera de scope, ya hay localStorage que cubre el caso single-device.
- **Tab "Pipelines" funcional** — actualmente comingSoon en `crm-tabs.tsx:48`. No se activa en este standalone.
- **Sidebar legacy v1 cleanup** — el item legacy `{ href: '/crm', label: 'CRM' }` y su flow legacy se quedan tal cual. Si se completa el rollout v2 a todos los workspaces, se podra borrar el branch legacy en un cleanup futuro.

</deferred>

---

*Standalone: ui-pipeline-persistence-and-crm-routing*
*Context gathered: 2026-04-27*
