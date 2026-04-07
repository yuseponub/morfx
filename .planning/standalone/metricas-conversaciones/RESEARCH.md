# Módulo de Métricas de Conversaciones — Research

**Researched:** 2026-04-06
**Domain:** Next.js 15 dashboard + Supabase aggregate queries + Recharts
**Confidence:** HIGH (codebase patterns directly reusable)

## Summary

Morfx ya tiene un módulo de analytics (`src/app/(dashboard)/analytics/`) que es un **blueprint 1:1** para este phase: misma estructura (page server component → view client component → period-selector → metric-cards → recharts chart → server actions en `src/app/actions/analytics.ts`). El nuevo módulo debe clonar ese patrón, renombrándolo y sustituyendo las queries de `orders` por queries sobre `messages` + `contact_tags`.

Los hallazgos críticos del schema:

- `contact_tags` tiene `created_at` (timestamp de aplicación) pero **borrado es hard-delete** sin audit. La semántica "quitar tag decrementa retroactivamente" **se cumple sola**: si la fila no existe, no cuenta — no necesitamos tabla de auditoría.
- Existe `conversations.last_customer_message_at` (ya usado como sort key en inbox) y hay índice compuesto `(workspace_id, last_customer_message_at DESC)`. Esto es clave pero NO es "primer mensaje". Para "primer mensaje" no hay denormalización; se calcula con `conversations.created_at` (el trigger de webhook crea la conversación la primera vez que llega un mensaje desde un teléfono nuevo → `conversations.created_at` ≈ first inbound timestamp del contacto en ese workspace).
- `workspaces.settings` es JSONB ya existente. Ya hay precedente de per-workspace flags (`hidden_modules`, `whatsapp_phone_number_id`). Agregaremos un sub-objeto `conversation_metrics: { enabled, reopen_window_days, scheduled_tag_name }`.
- Stack de gráficos ya instalado: **recharts 3.7.0**. Date utils: **date-fns 4.1.0** con `eachDayOfInterval`, `format`, `startOfDay`, `subDays`. Date picker: **react-day-picker 9.13.0** (para custom range).
- NO hay React Query ni SWR en el proyecto. El patrón oficial morfx es **Server Component para carga inicial + `useTransition` + Server Actions en cambio de período**. Para el "refresh periódico cada X min" el patrón correcto es un `useEffect` con `setInterval` que invoca las server actions (igual que `handlePeriodChange`).

**Primary recommendation:** Clonar `src/app/(dashboard)/analytics/` → `src/app/(dashboard)/metricas/`, reemplazando las queries de `orders` por 3 funciones en `src/app/actions/metricas-conversaciones.ts`. Sidebar gateado por `workspace.settings.conversation_metrics?.enabled === true`. Sin nuevas tablas de auditoría. Sin nuevos índices obligatorios (los existentes cubren las queries).

## Standard Stack

### Core (todo YA instalado)

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| Next.js | 16.1.6 (App Router) | Framework, server components, server actions | Ya es el stack morfx |
| React | 19.2.3 | UI + `useTransition` | Ya es el stack morfx |
| Supabase JS | @supabase/supabase-js 2.93 + @supabase/ssr 0.8 | Queries server-side con cookie-based auth | Ya es el stack morfx |
| recharts | 3.7.0 | Chart de evolución por día | Ya usado en `analytics/components/sales-chart.tsx` |
| date-fns | 4.1.0 | Rango de fechas, formato día, `eachDayOfInterval` | Ya usado en `actions/analytics.ts` |
| react-day-picker | 9.13.0 | Date range custom (feature futura, opcional en v1) | Ya instalado; shadcn DateRangePicker lo envuelve |
| lucide-react | 0.563 | Iconos sidebar (nuevo item) | Ya usado |
| Radix UI + shadcn | — | Card, Button, Tabs ya disponibles | Ya usado |
| Tailwind v4 | — | Estilos | Ya usado |

### Supporting

| Library | Versión | Purpose |
|---|---|---|
| `@/components/ui/card` | local | Cards de métricas — ya existe |
| `src/lib/supabase/server.ts` → `createClient()` | local | Cliente Supabase con RLS por workspace (via cookie `morfx_workspace`) |
| `src/lib/supabase/admin.ts` → `createAdminClient()` | local | Cliente bypass-RLS (NO usar aquí: esto es read scoped a workspace del usuario) |

### Alternatives Considered (RECHAZADOS)

| Instead of | Could Use | Por qué NO |
|---|---|---|
| Server actions + useTransition | React Query con refetchInterval | No está instalado, agregar dependencia solo para este módulo es overkill |
| Server actions + useTransition | SWR | No está instalado, mismo argumento |
| Server actions + useTransition | Next.js `revalidate` tag + `router.refresh()` | Más complejo para refresh silencioso periódico; `useTransition` es el patrón morfx |
| recharts | Tremor / visx / Chart.js | Ya tienes recharts, sin razón para cambiar |
| Tabla de auditoría `contact_tag_history` | Triggers + tabla nueva | No se necesita: hard-delete + conteo por `WHERE exists` en `contact_tags` da retroactividad gratis |
| Denormalizar `contacts.first_message_at` | Trigger ON INSERT messages | Ya tenemos `conversations.created_at` indexado que sirve como proxy exacto |

**Instalación:** ninguna. Cero dependencias nuevas.

## Architecture Patterns

### Estructura de archivos (CLONA `analytics/`)

```
src/app/(dashboard)/metricas/
├── page.tsx                        # Server component: auth check, lee settings.conversation_metrics.enabled, carga inicial
└── components/
    ├── metricas-view.tsx           # Client component: useState + useTransition + setInterval
    ├── metric-cards.tsx            # 3 cards (Nuevas, Reabiertas, Agendadas)
    ├── period-selector.tsx         # Hoy / Ayer / 7d / 30d / Custom
    └── evolution-chart.tsx         # Recharts: 3 líneas (o 3 areas stacked) por día

src/app/actions/metricas-conversaciones.ts   # Server actions
  - getConversationMetrics(period)   → totales + breakdown por día (los 3)
  - (opcional) getMetricsSettings()  → lee workspaces.settings.conversation_metrics

src/lib/metricas-conversaciones/
  └── types.ts                       # Period, DailyMetric, MetricTotals, MetricsSettings

src/components/layout/sidebar.tsx    # AGREGAR un nav item con condicional por workspace.settings.conversation_metrics.enabled
```

### Pattern 1: Server Component carga inicial + Client View con useTransition

**What:** El page server component hace la primera carga (default = "today"). Pasa props iniciales al view client component que maneja cambios de período con `useTransition` + server actions.

**When to use:** Para cualquier dashboard en morfx. Es el patrón oficial ya en producción (`analytics/page.tsx`).

**Example (basado en `src/app/(dashboard)/analytics/page.tsx` y `analytics-view.tsx`):**

```typescript
// page.tsx
export default async function MetricasPage() {
  const supabase = await createClient()
  const workspaceId = (await cookies()).get('morfx_workspace')?.value
  if (!workspaceId) redirect('/crm/pedidos')

  // Role check: todos los usuarios (sin restricción por rol según CONTEXT.md)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Gate por settings.conversation_metrics.enabled
  const { data: ws } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  const enabled = (ws?.settings as any)?.conversation_metrics?.enabled === true
  if (!enabled) redirect('/crm/pedidos')

  const initial = await getConversationMetrics('today')

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6">
        <h1 className="text-2xl font-bold">Métricas de conversaciones</h1>
        <MetricasView initial={initial} />
      </div>
    </div>
  )
}
```

```typescript
// metricas-view.tsx (client)
'use client'
export function MetricasView({ initial }: { initial: MetricsPayload }) {
  const [period, setPeriod] = useState<Period>('today')
  const [data, setData] = useState(initial)
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback((p: Period) => {
    startTransition(async () => {
      setData(await getConversationMetrics(p))
    })
  }, [])

  // Refresh periódico (decisión en plan: 3 minutos sugerido)
  useEffect(() => {
    const id = setInterval(() => refresh(period), 3 * 60 * 1000)
    return () => clearInterval(id)
  }, [period, refresh])

  return (
    <div className="space-y-6">
      <PeriodSelector value={period} onChange={(p) => { setPeriod(p); refresh(p) }} disabled={isPending} />
      <MetricCards data={data.totals} loading={isPending} />
      <EvolutionChart data={data.daily} loading={isPending} />
    </div>
  )
}
```

### Pattern 2: Aggregate queries en `src/app/actions/*.ts` (no en domain)

**What:** CLAUDE.md dice "todas las mutaciones pasan por `src/lib/domain/`". Las **lecturas agregadas** viven en server actions bajo `src/app/actions/` (precedente directo: `src/app/actions/analytics.ts`). No forzar esto en domain layer.

**Evidencia:** `src/app/actions/analytics.ts` usa `createClient()` (no `createAdminClient()`) y filtra por `workspace_id` manualmente (aunque RLS también lo haría — defensa en profundidad).

### Pattern 3: Sidebar con gating condicional por workspace settings

**What:** El `sidebar.tsx` ya filtra `navItems` con dos mecanismos: `adminOnly` y `hiddenModules` (leído de `currentWorkspace.settings.hidden_modules`). Reusar el mismo patrón.

**Implementación:** Agregar nuevo `NavItem` con flag opcional `settingsKey?: string` y extender el filtro:

```typescript
// En navItems[]
{
  href: '/metricas',
  label: 'Métricas',
  icon: TrendingUp, // lucide-react
  settingsKey: 'conversation_metrics.enabled', // NEW
},
```

```typescript
// En filteredNavItems filter
const settings = currentWorkspace?.settings as Record<string, any> | null
const filteredNavItems = navItems.filter(item => {
  if (item.adminOnly && !isManager) return false
  if (hiddenModules?.includes(item.href)) return false
  if (item.settingsKey) {
    const [ns, key] = item.settingsKey.split('.')
    if (!settings?.[ns]?.[key]) return false
  }
  return true
})
```

### Anti-Patterns to Avoid

- **NO crear `src/lib/domain/metricas.ts`:** es read-only aggregation, viola el propósito del domain layer (mutaciones + triggers). Precedente: `actions/analytics.ts` NO pasa por domain.
- **NO usar `createAdminClient()`** en las server actions de lectura: usar `createClient()` que respeta RLS del usuario autenticado.
- **NO hacer JOIN entre tablas con 500k+ filas en cliente:** llevar los agregados a Postgres (GROUP BY por día con `date_trunc`).
- **NO hardcodear zona horaria** en JS: `date-fns` opera en local time. Usar `startOfDay()` sobre un `Date` convertido con `toLocaleString('sv-SE', { timeZone: 'America/Bogota' })` o pasar strings ISO a Postgres y hacer `date_trunc('day', timestamp AT TIME ZONE 'America/Bogota')` server-side. El proyecto ya tiene esta regla en `CLAUDE.md` regla 2.
- **NO usar realtime subscriptions:** CONTEXT.md es explícito "NO tiempo real". Polling con `setInterval`.
- **NO crear tabla de auditoría de tags:** innecesario (ver Don't Hand-Roll).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Gráfico de líneas por día | Custom SVG / canvas | **recharts** `<LineChart>` o `<BarChart>` ya en package.json | Ya se usa en `sales-chart.tsx`, mismo patrón |
| Iteración de días en rango | Loop manual con `new Date()` | **date-fns** `eachDayOfInterval({start, end})` | Ya en uso |
| Date range picker custom | Dialog + calendarios | **react-day-picker** v9 (mode="range") | Ya instalado; dejar para v1.1 si "custom range" se difiere |
| Audit log de tags (para retroactividad) | Triggers + tabla history | **Nada** — hard-delete de `contact_tags` + conteo con `WHERE exists` da retroactividad automática | La métrica se recalcula desde estado actual en cada query |
| Denormalizar `contacts.first_message_at` | Trigger BEFORE INSERT messages | **`conversations.created_at`** ya es first-contact timestamp (inmutable, indexado por `(workspace_id, last_message_at DESC)`) | Cada conversación se crea cuando entra el primer mensaje desde un teléfono nuevo |
| Cliente HTTP para polling | `fetch` + `useEffect` + estado manual | **Server Action + useTransition + setInterval** | Patrón morfx oficial (`analytics-view.tsx`) |
| Per-workspace settings storage | Nueva tabla `module_settings` | **`workspaces.settings` JSONB** existente + key `conversation_metrics` | Ya hay precedente (`hidden_modules`, `whatsapp_*`) |
| Feature flag condicional en sidebar | Env var o hardcode | **`workspaces.settings.conversation_metrics.enabled`** + patrón `hiddenModules` existente | Patrón ya en prod |

**Key insight:** El 80% del trabajo ya existe. El phase es fundamentalmente "clonar analytics y cambiar las queries".

## Schema Findings

### `messages` (migration 20260130000002)
- `id`, `conversation_id`, `workspace_id`
- **`direction TEXT CHECK ('inbound' | 'outbound')`** ← filtro crítico
- `timestamp TIMESTAMPTZ` (hora del mensaje real) + `created_at TIMESTAMPTZ` (cuando se insertó)
- Default de timestamps: `timezone('America/Bogota', NOW())`
- **Índices:** `(conversation_id, timestamp DESC)`, `(workspace_id)`, `(conversation_id, direction)`
- No hay índice directo por `(workspace_id, timestamp, direction)` — agregar si profiling lo exige (no antes).

### `conversations` (migration 20260130000002)
- `id`, `workspace_id`, `contact_id` (nullable), `phone`
- **`last_customer_message_at TIMESTAMPTZ`** ← clave para "reabierta"
- **`created_at TIMESTAMPTZ`** ← clave para "nueva" (primer mensaje ever del contacto en workspace)
- **Unique:** `(workspace_id, phone)` → 1 conversación por teléfono por workspace, garantiza que `created_at` es "primer contacto histórico"
- **Índices compuestos existentes:** `(workspace_id, last_customer_message_at DESC NULLS LAST)`, `(workspace_id, last_message_at DESC NULLS LAST)`, `(workspace_id, status, last_customer_message_at DESC NULLS LAST)`

### `contacts` (migration 20260129000001)
- `id`, `workspace_id`, `name`, `phone`
- `created_at`, `updated_at` — OJO: `contacts.created_at` NO es "primer mensaje" necesariamente (un contacto puede crearse por importación antes del primer mensaje). Preferir `conversations.created_at`.

### `contact_tags` (migration 20260129000001) — **DECISIVO**
- `id`, `contact_id`, `tag_id`
- **`created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())`** ← sí existe
- **Unique `(contact_id, tag_id)`** → reaplicar es idempotente por DB constraint (además `assignTag` en `domain/tags.ts` ya maneja error 23505 como éxito)
- **Borrado: hard-delete.** `domain/tags.ts::removeTag` hace `DELETE` directo (línea 204-209). No hay soft-delete, no hay `deleted_at`.
- Índices: `(contact_id)`, `(tag_id)`
- Realtime publication activa (migration 20260317100000), irrelevante para nosotros

**Implicación crítica:** La semántica "si quitas el tag deja de contar retroactivamente" **se cumple gratis** porque el conteo se hace en cada query sobre el estado actual de `contact_tags`. No necesitamos tabla de historia.

### `tags` (migration 20260129000001)
- `id`, `workspace_id`, `name`, `color`, `created_at`
- **Unique `(workspace_id, name)`** → `VAL` es un tag por workspace
- Buscar por name: `WHERE workspace_id = X AND name = 'VAL'`

### `workspaces.settings` (migration 20260306000000)
- **`settings JSONB DEFAULT '{}'`** — ya existe
- Precedente de keys: `whatsapp_phone_number_id`, `whatsapp_api_key`, `hidden_modules`
- Lugar correcto para `conversation_metrics: { enabled, reopen_window_days, scheduled_tag_name }`

## Recommended Approach: Las 3 queries

Las 3 métricas tienen que devolver **dos cosas**: total del periodo y breakdown por día (para el chart). Recomiendo **una sola server action** `getConversationMetrics(period)` que devuelve `{ totals, daily }` para cargar todo en 1 round-trip.

### Métrica 1: Conversaciones NUEVAS

**Definición:** Contacto cuyo primer mensaje ever en el workspace cae dentro del rango.

**Approach:** Usar `conversations.created_at` (inmutable, 1 por `(workspace_id, phone)`).

```sql
-- Total
SELECT COUNT(*) AS total
FROM conversations
WHERE workspace_id = $1
  AND created_at >= $2  -- start (inclusive, Bogota)
  AND created_at <  $3; -- end+1day (exclusive)

-- Breakdown por día
SELECT
  date_trunc('day', created_at AT TIME ZONE 'America/Bogota')::date AS day,
  COUNT(*) AS nuevas
FROM conversations
WHERE workspace_id = $1
  AND created_at >= $2
  AND created_at <  $3
GROUP BY 1
ORDER BY 1;
```

Supabase JS:
```typescript
const { data } = await supabase
  .from('conversations')
  .select('created_at')
  .eq('workspace_id', workspaceId)
  .gte('created_at', start.toISOString())
  .lt('created_at', endExclusive.toISOString())
```
Luego agrupar en JS con `date-fns` `format(d, 'yyyy-MM-dd')` (patrón ya en uso en `analytics.ts` líneas 86-100). Para volúmenes hasta ~10k conversaciones/periodo esto es suficiente. Si crece, migrar a RPC Postgres.

**Índice:** No existe `(workspace_id, created_at)` específico. Sin embargo, `idx_conversations_workspace` lo cubre razonablemente para workspaces pequeños. **Recomendación:** agregar `CREATE INDEX idx_conversations_workspace_created ON conversations(workspace_id, created_at DESC)` como tarea en el plan (migración ligera, sin locks gracias a `CONCURRENTLY`).

**Caveat:** `conversations` puede crearse también al enviar mensaje outbound primero (webhook POST template). Revisar: si la conversación la crea el agente (outbound first), ¿cuenta como "nueva conversación" cuando el cliente responde? Según CONTEXT.md "primer mensaje del contacto en toda su historia" → sólo mensajes del **cliente**. Si esto importa en la práctica, usar esta versión más estricta:

```sql
-- "Nuevas" = primer mensaje inbound del contacto en el workspace
SELECT date_trunc('day', first_in AT TIME ZONE 'America/Bogota')::date AS day, COUNT(*)
FROM (
  SELECT conversation_id, MIN(timestamp) AS first_in
  FROM messages
  WHERE workspace_id = $1 AND direction = 'inbound'
  GROUP BY conversation_id
) t
WHERE first_in >= $2 AND first_in < $3
GROUP BY 1;
```
Esto recorre TODOS los mensajes inbound del workspace — pesado. Para evitarlo, preferir `conversations.created_at` y verificar en la primera ejecución con datos reales de GoDentist si la diferencia importa. **Recomendación:** v1 usa `conversations.created_at`; documentar el caveat en LEARNINGS.

### Métrica 2: Conversaciones REABIERTAS

**Definición:** Contacto existente escribe (inbound) dentro del rango, habiendo tenido >= N días de silencio antes (default 7, configurable).

**Approach (Postgres NOT EXISTS):**

```sql
-- Conteo por día de "reopens": inbound messages cuyo inbound inmediatamente previo en esa conversación fue hace >= N días
WITH reopens AS (
  SELECT
    m.id,
    m.conversation_id,
    m.timestamp,
    LAG(m.timestamp) OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp) AS prev_in
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.workspace_id = $1
    AND m.direction = 'inbound'
    AND m.timestamp >= $2 - INTERVAL '${N} days'  -- cushion: incluir último previo anterior al rango
    AND m.timestamp <  $3
)
SELECT
  date_trunc('day', timestamp AT TIME ZONE 'America/Bogota')::date AS day,
  COUNT(*) FILTER (
    WHERE prev_in IS NOT NULL
      AND timestamp - prev_in >= INTERVAL '${N} days'
      AND timestamp >= $2
      AND timestamp <  $3
  ) AS reabiertas
FROM reopens
GROUP BY 1
ORDER BY 1;
```

**Nota importante:** `prev_in IS NULL` = primer mensaje del contacto = caso "nueva", NO "reabierta". Por eso filtramos `prev_in IS NOT NULL`.

**Implementación en Supabase JS:** esto requiere **Postgres RPC** (`CREATE OR REPLACE FUNCTION get_conversation_metrics(...)`) porque window functions no son triviales con el query builder. **Recomendación:** crear UNA migration que defina `get_conversation_metrics(p_workspace_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_reopen_days INT, p_tag_id UUID)` devolviendo `TABLE(day DATE, nuevas INT, reabiertas INT, agendadas INT)`. Una sola llamada para las 3 métricas.

**Alternativa sin RPC (JS-side):** traer `(conversation_id, timestamp)` de todos los inbound del rango **+ margen de N días antes** y calcular `prev_in` en JS. Más tráfico pero cero migraciones. Aceptable si volumen < 5k mensajes/mes. **Recomendación v1:** empezar con RPC Postgres — es más rápido, correcto y encapsula la lógica.

### Métrica 3: VALORACIONES AGENDADAS

**Definición:** `contact_tags` rows donde `tag_id = (tag 'VAL' del workspace)` y `created_at` cae en el rango.

```sql
-- Total + daily
SELECT
  date_trunc('day', ct.created_at AT TIME ZONE 'America/Bogota')::date AS day,
  COUNT(*) AS agendadas
FROM contact_tags ct
JOIN tags t ON t.id = ct.tag_id
JOIN contacts c ON c.id = ct.contact_id
WHERE t.workspace_id = $1
  AND c.workspace_id = $1  -- defensa en profundidad
  AND t.name = $settingsTagName  -- default 'VAL'
  AND ct.created_at >= $2
  AND ct.created_at <  $3
GROUP BY 1
ORDER BY 1;
```

**Retroactividad:** automática. Si el usuario hoy quita el tag de un contacto que lo recibió ayer, la fila desaparece y mañana al consultar el conteo de ayer baja en 1. ✓

**Idempotencia:** garantizada por `UNIQUE(contact_id, tag_id)`. Reaplicar el mismo tag falla con 23505, no inserta segunda fila. ✓

**Humano vs bot:** irrelevante para la métrica; ambos usan `domain/tags.ts::assignTag` → mismo INSERT.

**Índice:** ya existe `idx_contact_tags_tag ON contact_tags(tag_id)`. Filtrar primero por `tag_id` (buscando el tag 'VAL' una vez) luego por `created_at`. Excelente performance incluso con millones de rows.

### Schema aditivo propuesto (una sola migration)

```sql
-- 20260406000000_conversation_metrics_module.sql

-- Index para métrica "nuevas" (opcional pero barato)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_workspace_created
  ON conversations(workspace_id, created_at DESC);

-- RPC con las 3 métricas en una sola llamada
CREATE OR REPLACE FUNCTION get_conversation_metrics(
  p_workspace_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_reopen_days INT DEFAULT 7,
  p_tag_name TEXT DEFAULT 'VAL'
) RETURNS TABLE (
  day DATE,
  nuevas INT,
  reabiertas INT,
  agendadas INT
)
LANGUAGE sql
SECURITY INVOKER -- respeta RLS del usuario que llama
AS $$
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', p_start AT TIME ZONE 'America/Bogota'),
      date_trunc('day', p_end   AT TIME ZONE 'America/Bogota'),
      INTERVAL '1 day'
    )::date AS day
  ),
  nuevas_q AS (
    SELECT date_trunc('day', created_at AT TIME ZONE 'America/Bogota')::date AS day,
           COUNT(*)::int AS n
    FROM conversations
    WHERE workspace_id = p_workspace_id
      AND created_at >= p_start AND created_at < p_end
    GROUP BY 1
  ),
  msg_win AS (
    SELECT m.conversation_id, m.timestamp,
           LAG(m.timestamp) OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp) AS prev_in
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.workspace_id = p_workspace_id
      AND m.direction = 'inbound'
      AND m.timestamp >= p_start - (p_reopen_days || ' days')::interval
      AND m.timestamp <  p_end
  ),
  reabiertas_q AS (
    SELECT date_trunc('day', timestamp AT TIME ZONE 'America/Bogota')::date AS day,
           COUNT(*)::int AS n
    FROM msg_win
    WHERE prev_in IS NOT NULL
      AND timestamp - prev_in >= (p_reopen_days || ' days')::interval
      AND timestamp >= p_start AND timestamp < p_end
    GROUP BY 1
  ),
  tag_row AS (
    SELECT id FROM tags WHERE workspace_id = p_workspace_id AND name = p_tag_name LIMIT 1
  ),
  agendadas_q AS (
    SELECT date_trunc('day', ct.created_at AT TIME ZONE 'America/Bogota')::date AS day,
           COUNT(*)::int AS n
    FROM contact_tags ct
    WHERE ct.tag_id = (SELECT id FROM tag_row)
      AND ct.created_at >= p_start AND ct.created_at < p_end
    GROUP BY 1
  )
  SELECT d.day,
         COALESCE(n.n, 0) AS nuevas,
         COALESCE(r.n, 0) AS reabiertas,
         COALESCE(a.n, 0) AS agendadas
  FROM days d
  LEFT JOIN nuevas_q    n ON n.day = d.day
  LEFT JOIN reabiertas_q r ON r.day = d.day
  LEFT JOIN agendadas_q  a ON a.day = d.day
  ORDER BY d.day;
$$;

GRANT EXECUTE ON FUNCTION get_conversation_metrics TO authenticated;
```

**Ventajas:** 1 round-trip, lógica centralizada, RLS respetada via `SECURITY INVOKER`, fácil de cambiar N y tag sin deploy.

**Uso desde server action:**
```typescript
const { data, error } = await supabase.rpc('get_conversation_metrics', {
  p_workspace_id: workspaceId,
  p_start: start.toISOString(),
  p_end: end.toISOString(),
  p_reopen_days: settings.reopen_window_days ?? 7,
  p_tag_name: settings.scheduled_tag_name ?? 'VAL',
})
```

Luego totales se suman en JS (o con otra CTE, trivial).

## Common Pitfalls

### Pitfall 1: Zona horaria Bogotá

**What goes wrong:** El chart dice "6 nuevas el martes" pero en realidad 2 de esas llegaron a las 23:30 del lunes UTC.
**Why:** JS `startOfDay()` usa hora local del server (Vercel = UTC). `date_trunc('day', ts)` en Postgres también usa UTC.
**How to avoid:** Usar `date_trunc('day', ts AT TIME ZONE 'America/Bogota')` en TODA query de agregación. Regla 2 de CLAUDE.md.

### Pitfall 2: Rango inclusivo/exclusivo

**What goes wrong:** Doble conteo del último día o se pierde el último día.
**Why:** `lte('created_at', endOfDay)` con `endOfDay = 23:59:59.999` pierde eventos a las 23:59:59.9999.
**How to avoid:** Usar siempre `[start, endExclusive)` donde `endExclusive = startOfDay(tomorrow)`. Postgres `>=` y `<`.

### Pitfall 3: "Reabierta" = `prev_in IS NULL` → cuenta como reabierta en lugar de nueva

**What goes wrong:** Primer mensaje ever del contacto se clasifica como "reabierta" al hacer `timestamp - prev_in` sin chequear NULL.
**Why:** `LAG()` devuelve NULL para la primera fila.
**How to avoid:** `WHERE prev_in IS NOT NULL` explícito (y si está en el rango, aparece como "nueva" vía la otra métrica).

### Pitfall 4: Outbound primero crea conversación

**What goes wrong:** Un template outbound abre la conversación antes de que el cliente escriba. `conversations.created_at` = fecha del outbound. Si luego el cliente responde al día siguiente, se registra como "nueva" el día del outbound (incorrecto: ese día no hubo inbound).
**Why:** `conversations` es unique por teléfono + workspace; `created_at` del row es el primer evento, no el primer inbound.
**How to avoid v1:** Aceptar el caveat, documentar en LEARNINGS. **v1.1:** cambiar a la versión MIN(inbound) si se demuestra que importa. Alternativamente, en el RPC filtrar solo conversaciones cuyo MIN(messages.timestamp WHERE direction='inbound') cae en el rango.

### Pitfall 5: Polling con `setInterval` dispara refetch incluso con pestaña oculta

**What goes wrong:** Desperdicio de queries al DB cuando el usuario no está mirando.
**How to avoid:** Envolver el refetch con `if (!document.hidden) refresh(period)`. O usar `visibilitychange` event para refrescar al volver a la pestaña + `setInterval` solo cuando visible.

### Pitfall 6: RLS bloquea el RPC

**What goes wrong:** RPC devuelve 0 filas porque `SECURITY INVOKER` ejecuta las subqueries bajo el user actual cuya membresía al workspace no coincide.
**How to avoid:** Verificar que el user está en el workspace (ya lo hace la cookie `morfx_workspace`) y que las policies existentes permiten SELECT sobre `conversations`, `messages`, `contact_tags`, `tags`. Ya verificado: todas tienen `is_workspace_member()` policy.

### Pitfall 7: `setInterval` no se limpia

**What goes wrong:** Memory leaks y queries fantasma después de navegar fuera.
**How to avoid:** Siempre `return () => clearInterval(id)` en el `useEffect`.

### Pitfall 8: Tabla `messages` es enorme

**What goes wrong:** La query de reabiertas escanea toda la historia con el cushion de N días.
**How to avoid:** El WHERE `c.workspace_id = X AND m.timestamp >= start - 7d` con el índice `idx_messages_conversation (conversation_id, timestamp DESC)` y el filtro por `c.workspace_id` debería forzar index scan razonable. Si degrada: agregar `CREATE INDEX idx_messages_workspace_direction_timestamp ON messages(workspace_id, direction, timestamp DESC)` como tarea de optimización (no en v1).

## Code Examples

### Ejemplo de server action completo (plantilla)

```typescript
// src/app/actions/metricas-conversaciones.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { startOfDay, subDays, endOfDay, format, eachDayOfInterval, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

export type Period = 'today' | 'yesterday' | '7days' | '30days' | { start: string; end: string }

export interface DailyMetric { date: string; label: string; nuevas: number; reabiertas: number; agendadas: number }
export interface MetricTotals { nuevas: number; reabiertas: number; agendadas: number }
export interface MetricsPayload { totals: MetricTotals; daily: DailyMetric[] }

function getRange(p: Period): { start: Date; endExclusive: Date } {
  const now = new Date()
  if (typeof p === 'object') {
    return { start: startOfDay(new Date(p.start)), endExclusive: addDays(startOfDay(new Date(p.end)), 1) }
  }
  switch (p) {
    case 'today':     return { start: startOfDay(now), endExclusive: addDays(startOfDay(now), 1) }
    case 'yesterday': return { start: startOfDay(subDays(now, 1)), endExclusive: startOfDay(now) }
    case '7days':     return { start: startOfDay(subDays(now, 6)), endExclusive: addDays(startOfDay(now), 1) }
    case '30days':    return { start: startOfDay(subDays(now, 29)), endExclusive: addDays(startOfDay(now), 1) }
  }
}

export async function getConversationMetrics(period: Period): Promise<MetricsPayload> {
  const supabase = await createClient()
  const workspaceId = (await cookies()).get('morfx_workspace')?.value
  if (!workspaceId) return { totals: { nuevas: 0, reabiertas: 0, agendadas: 0 }, daily: [] }

  // Lee settings del workspace
  const { data: ws } = await supabase.from('workspaces').select('settings').eq('id', workspaceId).single()
  const cfg = (ws?.settings as any)?.conversation_metrics ?? {}
  const reopenDays: number = cfg.reopen_window_days ?? 7
  const tagName: string = cfg.scheduled_tag_name ?? 'VAL'

  const { start, endExclusive } = getRange(period)

  const { data, error } = await supabase.rpc('get_conversation_metrics', {
    p_workspace_id: workspaceId,
    p_start: start.toISOString(),
    p_end: endExclusive.toISOString(),
    p_reopen_days: reopenDays,
    p_tag_name: tagName,
  })

  if (error || !data) return { totals: { nuevas: 0, reabiertas: 0, agendadas: 0 }, daily: [] }

  const daily: DailyMetric[] = data.map((r: any) => ({
    date: r.day,
    label: format(new Date(r.day), 'EEE d', { locale: es }),
    nuevas: r.nuevas,
    reabiertas: r.reabiertas,
    agendadas: r.agendadas,
  }))
  const totals = daily.reduce(
    (acc, r) => ({ nuevas: acc.nuevas + r.nuevas, reabiertas: acc.reabiertas + r.reabiertas, agendadas: acc.agendadas + r.agendadas }),
    { nuevas: 0, reabiertas: 0, agendadas: 0 }
  )
  return { totals, daily }
}
```

### Ejemplo de evolution-chart (3 líneas)

```typescript
// components/evolution-chart.tsx
'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import type { DailyMetric } from '@/lib/metricas-conversaciones/types'

export function EvolutionChart({ data, loading }: { data: DailyMetric[], loading?: boolean }) {
  if (loading) return <Card><CardContent><div className="h-[300px] bg-muted animate-pulse rounded" /></CardContent></Card>
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Evolución por día</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="nuevas"     name="Nuevas"     stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="reabiertas" name="Reabiertas" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="agendadas"  name="Agendadas"  stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
```

## Open Questions Resolved (las 6 del CONTEXT)

### 1. Cálculo de "primer mensaje" eficiente

**Respuesta:** Usar `conversations.created_at`. Hay UNIQUE `(workspace_id, phone)` así que el row se crea solo una vez por contacto-workspace. Agregar `idx_conversations_workspace_created` (barato, `CONCURRENTLY`). NO denormalizar en `contacts`. **Caveat:** si outbound-first crea la conversación antes del primer inbound, la fecha es imprecisa — aceptar en v1, documentar, revaluar con datos reales.

### 2. Cálculo de "reabierta"

**Respuesta:** Window function `LAG()` sobre inbound messages agrupados por `conversation_id`, con cushion de N días antes del `start`. Implementar en **Postgres RPC** (`get_conversation_metrics`) porque el query builder de Supabase JS no soporta window functions ergonómicamente. Performance: OK con índice existente `idx_messages_conversation (conversation_id, timestamp DESC)` para workspaces pequeños/medianos. Monitorear.

### 3. Valoraciones con retroactividad

**Respuesta:** `contact_tags.created_at` existe. Borrado es hard-delete. **Semántica retroactiva se cumple gratis:** el query siempre recalcula sobre estado actual. Reaplicar es idempotente por UNIQUE constraint. **NO necesitamos tabla de auditoría.** Esta es la respuesta más importante del research: elimina el mayor riesgo de complejidad.

### 4. Refresh de datos

**Respuesta:** **Server Component initial load + `useTransition` + server actions + `setInterval` con check `document.hidden`.** Patrón morfx oficial. Intervalo sugerido: **3 minutos** (balance entre frescura y carga DB). NO React Query, NO SWR, NO realtime.

### 5. Registro condicional en sidebar

**Respuesta:** Extender `src/components/layout/sidebar.tsx` con un campo opcional `settingsKey` en el type `NavItem` y el filtro correspondiente. Leer de `currentWorkspace.settings.conversation_metrics.enabled`. Activación en GoDentist Valoraciones = `UPDATE workspaces SET settings = jsonb_set(settings, '{conversation_metrics,enabled}', 'true') WHERE id = ...` (manual una vez o por UI de admin futura).

### 6. Performance

**Respuesta:** Con RPC Postgres + índices existentes, las 3 queries en <200ms para workspaces con <100k mensajes. Si degrada: (a) agregar `idx_messages_workspace_direction_timestamp`, (b) materializar en vista `metrics_daily` refrescada por cron Inngest. **v1: sin materialización.** Medir primero.

## Settings Schema (para CONTEXT → PLAN)

```jsonc
// workspaces.settings (JSONB)
{
  "conversation_metrics": {
    "enabled": true,                // sidebar gate
    "reopen_window_days": 7,         // N días de silencio para "reabierta"
    "scheduled_tag_name": "VAL"      // tag que cuenta como "agendada"
  }
  // ...otros keys existentes
}
```

Activar en GoDentist Valoraciones:

```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{conversation_metrics}',
  '{"enabled": true, "reopen_window_days": 7, "scheduled_tag_name": "VAL"}'::jsonb
)
WHERE id = '<GoDentist Valoraciones workspace_id>';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Tabla de audit manual para retroactividad | Recalculate from current state + hard-delete | Siempre que la métrica no requiera "estado en tiempo T pasado" | Elimina triggers, migraciones, y bugs de sync |
| Queries con window functions desde client SDK | Postgres RPC (`CREATE FUNCTION`) | Supabase JS v2 | Más rápido, más seguro (RLS via SECURITY INVOKER), encapsulación |
| React Query / SWR para polling | `useTransition` + `setInterval` | Next 15 App Router + React 19 | Cero dependencias extra, SSR-friendly, patrón morfx oficial |

## Open Questions (residuales para plan)

1. **Intervalo de refresh exacto:** 3 min propuesto, confirmar con usuario en plan.
2. **Outbound-first conversations:** ¿afecta la métrica en la práctica? Verificar con datos reales. Si afecta, migrar a MIN(inbound) en v1.1.
3. **Custom date range en v1:** ¿es scope de v1 o se difiere? react-day-picker ya instalado, pero agrega complejidad UI. **Recomendación:** v1 = Hoy/Ayer/7d/30d. Custom range en v1.1.
4. **UI de settings del módulo:** ¿cómo cambia un admin el `reopen_window_days` o el tag name? ¿Se hace via SQL manual por ahora, o se agrega una sección en `/settings`? **Recomendación v1:** SQL manual (ya hay precedente con otros settings), UI en v1.1.
5. **Rol de acceso:** CONTEXT dice "todos los usuarios", pero analytics actual es `adminOnly`. Confirmar en plan que incluimos/excluimos agentes. **Recomendación:** respetar CONTEXT (todos).

## Sources

### Primary (HIGH confidence) — codebase morfx
- `supabase/migrations/20260129000001_contacts_and_tags.sql` — schema `contacts`, `tags`, `contact_tags` (incluye `created_at`)
- `supabase/migrations/20260130000002_whatsapp_conversations.sql` — schema `conversations`, `messages`, `direction`, `last_customer_message_at`
- `supabase/migrations/20260306000000_workspace_settings_column.sql` — `workspaces.settings JSONB`
- `supabase/migrations/20260305000000_idx_customer_message_sort.sql` — índice en `last_customer_message_at`
- `supabase/migrations/20260319100000_composite_indexes_conversations.sql` — índices compuestos de conversations
- `supabase/migrations/20260317100000_contact_tags_realtime.sql` — confirma que contact_tags no tiene columnas extra
- `src/app/(dashboard)/analytics/page.tsx` + `components/analytics-view.tsx` + `components/sales-chart.tsx` + `components/period-selector.tsx` — patrón de referencia 1:1
- `src/app/actions/analytics.ts` — patrón de server actions con date-fns + Supabase server client
- `src/components/layout/sidebar.tsx` — patrón de navItems con filtrado por rol + `hidden_modules` de settings
- `src/lib/domain/tags.ts` líneas 60-213 — confirma hard-delete de contact_tags y manejo idempotente de UNIQUE 23505
- `package.json` — versiones exactas de recharts, date-fns, react-day-picker (todas ya instaladas)

### Secondary
- CLAUDE.md reglas 2 (timezone) y 3 (domain layer)

### Tertiary
- Ninguno (toda la investigación resolvió con evidencia directa del codebase)

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — todo ya instalado y ya usado en `analytics/`
- Architecture: **HIGH** — clonar patrón existente, cero decisiones nuevas
- Schema findings: **HIGH** — leídas las migrations directamente
- Query approach: **HIGH** para agendadas y nuevas; **MEDIUM** para reabiertas (window function no probada en este workspace, puede necesitar ajuste de índices si volumen crece)
- Pitfalls: **HIGH** — documentados desde código y reglas existentes

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stack morfx estable, schema estable)
