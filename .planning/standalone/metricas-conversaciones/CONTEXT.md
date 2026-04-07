# Módulo de Métricas de Conversaciones

## Objetivo

Crear un módulo **genérico y reutilizable** (por ahora activo solo en el workspace **GoDentist Valoraciones**) que muestre un dashboard con métricas diarias de conversaciones:

1. **Conversaciones nuevas** del día
2. **Conversaciones reabiertas** del día
3. **Valoraciones agendadas** del día (vía tag `VAL`)

Todo esto con selector temporal, desglose por día y visualización con cards + gráficos.

## Motivación

GoDentist necesita medir el performance de atención al cliente. Específicamente, saber cada día:
- Cuántas oportunidades de venta llegaron (nuevas + reabiertas)
- Cuántas se concretaron en agendamientos de valoración (tasa de conversión implícita)
- Cómo evoluciona esto en el tiempo

El módulo debe ser **genérico** para que en el futuro cualquier workspace pueda activarlo.

---

## Definiciones (decisiones tomadas en discusión)

### Modelo conceptual: "Ventana de silencio" (Modelo B)

Se eligió este modelo sobre alternativas (contacto-puro, ticket-explícito) porque:
- No requiere disciplina operativa extra (no hay que "cerrar" conversaciones)
- Distingue clientes recurrentes de clientes activos
- Alineado con la pregunta de negocio: "¿cuántas oportunidades tuvimos hoy?"

### Conversación NUEVA
Primer mensaje del contacto **en toda su historia** (jamás había escrito antes al workspace).

**Regla estricta:** debe existir al menos **un mensaje INBOUND** del cliente para contar. Si una automatización/template envía un primer mensaje outbound y el cliente nunca responde, NO cuenta como nueva conversación. Esto evita inflar la métrica con intentos de contacto sin respuesta.

### Conversación REABIERTA
Contacto existente que vuelve a escribir tras **N días de silencio** (sin mensajes entrantes en ese periodo).

- **Default:** N = 7 días
- **Configurable** por workspace (tabla de settings del módulo)
- Rationale: una semana sin actividad = oportunidad nueva cuando vuelva

### Valoración AGENDADA
Contacto que tiene aplicado el tag **`VAL`** (ya existe en el workspace GoDentist Valoraciones).

**Reglas del conteo:**
- Se cuenta por el **día en que se aplicó el tag**
- Si se **quita** el tag → deja de contar (métrica retroactiva, baja el número del día)
- **Reaplicar** el tag al mismo contacto es **idempotente** (no cuenta doble)
- Lo puede aplicar un **humano o un bot** (indistinto; a definir operativamente, no afecta al módulo)

---

## Scope del módulo

### Activación
- **Genérico:** el módulo debe ser reutilizable por cualquier workspace
- **Por ahora solo activo** en el workspace "GoDentist Valoraciones"
- Mecanismo de activación: feature flag o flag en workspace settings (a decidir en plan)

### Permisos
- **Todos los usuarios del workspace** pueden verlo (sin restricción por rol)

### UI

**Ubicación:** nueva entrada en el **sidebar** del dashboard.

**Visualización:**
- **Cards** con números grandes para los totales del periodo seleccionado:
  - Conversaciones nuevas
  - Conversaciones reabiertas
  - Valoraciones agendadas
- **Gráfico de evolución por día** (línea o barras) mostrando las 3 métricas a lo largo del tiempo

**Selector temporal:**
- **Default:** Hoy
- **Opciones:** Ayer, Últimos 7 días, Últimos 30 días, **Rango custom (date picker) — incluido desde v1**

**Desglose:**
- **Solo por día** (evolución temporal)
- NO por sucursal (descartado explícitamente)
- NO por agente/usuario
- NO por hora del día

### Actualización de datos — Realtime Híbrido
- **Carga inicial:** al entrar a la página
- **Realtime hybrid:** suscripción Supabase Realtime a `messages` (INSERT) y `contact_tags` (INSERT/DELETE) filtrados por `workspace_id`
- Cuando llega cualquier cambio relevante → **re-ejecutar el RPC completo** y refrescar cards + gráfico
- Latencia objetivo: ~1 segundo (indistinguible de "instantáneo" para un humano)
- NO se hace actualización incremental en cliente (siempre se re-pregunta la verdad al backend)
- Rationale: imposible desincronizar, reutiliza el RPC, simple de implementar

---

## Configuración por workspace

Tabla/mecanismo de settings del módulo con al menos:
- `reopen_window_days` (default 7) — ventana de silencio para considerar "reabierta"
- `scheduled_tag_name` o `scheduled_tag_id` (default `VAL`) — tag que marca valoración agendada
- `enabled` (boolean) — si el módulo está activo en ese workspace

Esto permite que al agregar nuevos workspaces en el futuro, cada uno configure su propia ventana y su propio tag sin tocar código.

**UI de settings:** incluida desde el principio (NO editar JSONB manualmente vía SQL). Los settings se editan desde una pantalla de configuración del módulo accesible para usuarios con permisos.

**Almacenamiento:** se guardan en la columna `workspaces.settings` JSONB existente, bajo la key `conversation_metrics` (siguiendo el patrón de `whatsapp_*`, `hidden_modules`).

---

## Decisiones técnicas (de research)

- **Stack:** recharts 3.7.0 + date-fns 4.1.0 + react-day-picker 9.13.0 + supabase realtime — **todo ya instalado**, cero deps nuevas
- **Backend:** un solo Postgres RPC `get_conversation_metrics(workspace_id, start, end, reopen_days, tag_name)` que devuelve `(day, nuevas, reabiertas, agendadas)` usando una CTE con `LAG()` window function. SECURITY INVOKER para respetar RLS
- **"Primer mensaje" base:** `conversations.created_at` (hay UNIQUE `(workspace_id, phone)`). NO denormalizar `contacts.first_message_at`. Filtrar adicional por existencia de inbound
- **Retroactividad del tag VAL:** gratis. `contact_tags.created_at` existe, borrado es hard-delete, `UNIQUE(contact_id, tag_id)` garantiza idempotencia. NO se necesita tabla de auditoría
- **Patrón frontend:** Server Component inicial + hook cliente con suscripción Realtime + `useTransition` para refresh sin bloqueo
- **Blueprint a clonar:** `src/app/(dashboard)/analytics/` (estructura, server actions, period selector — adaptarlo)
- **Sidebar gate:** extender lógica existente con `settingsKey: 'conversation_metrics.enabled'` además de `hiddenModules`
- **Permisos:** **todos los usuarios** del workspace (NO adminOnly como `analytics`) — esta es una excepción explícita de este módulo

---

## Preguntas abiertas (para research/plan)

1. **Cálculo de "primer mensaje":** ¿cómo calcular eficientemente el primer mensaje histórico de un contacto? ¿Se puede con un índice en `messages.created_at` filtrando por `contact_id`? ¿O conviene denormalizar `first_message_at` en la tabla `contacts`?

2. **Cálculo de "reabierta":** requiere saber, para cada mensaje entrante del día, si hay mensajes previos del mismo contacto en los últimos 7 días. Query con `NOT EXISTS` o window function. Evaluar performance con miles de contactos.

3. **Valoraciones agendadas con retroactividad:** necesitamos el timestamp de cuándo se aplicó el tag. ¿La tabla `contact_tags` tiene `created_at`? ¿Qué pasa cuando se elimina? ¿Hay un `deleted_at` o se borra físicamente? Si se borra físicamente, hay que usar triggers o una tabla de auditoría para soportar la semántica "deja de contar".

4. **Refresh de datos:** ¿polling cliente vs `revalidate` de Next.js vs React Query con `refetchInterval`? Elegir en plan.

5. **Módulo genérico:** ¿cómo se registra en sidebar solo para workspaces con el flag activo? Patrón existente en morfx para features condicionales.

6. **Performance:** con miles de mensajes/contactos, las queries deben ejecutarse en <1s. Evaluar si necesitamos materialización (tabla denormalizada, vista materializada, o cálculo incremental).

---

## NO incluye (fuera de scope)

- Desglose por sucursal (descartado — no hay mecanismo actual para asociar sucursal a contacto)
- Desglose por agente/usuario
- Desglose por hora del día
- Tasa de conversión como métrica separada (por ahora solo los 3 conteos crudos)
- Histórico de cambios de tag (tabla de auditoría para tags) — a menos que sea imprescindible para la semántica "retroactiva"
- Alertas / notificaciones sobre métricas
- Exportar a CSV/Excel
- Comparativas entre periodos ("hoy vs ayer", "esta semana vs la pasada")
- Activación en otros workspaces (por ahora solo GoDentist Valoraciones)

---

## Siguiente paso

`/gsd:research-phase` para investigar:
- Schema actual de `messages`, `contacts`, `contact_tags`
- Patrones existentes de queries agregadas en morfx
- Cómo se registran features/módulos en el sidebar
- Sistema de settings por workspace
- Si `contact_tags` soporta detectar "cuándo se aplicó" y "cuándo se quitó"
