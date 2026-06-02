---
phase: 42.1-observabilidad-bots-produccion
plan: 08
type: execute
wave: 4
depends_on: [01, 03]
files_modified:
  - src/inngest/functions/observability-purge.ts
  - src/app/api/inngest/route.ts
autonomous: true

must_haves:
  truths:
    - "Existe cron Inngest 'observability-purge' programado a las 03:00 TZ=America/Bogota"
    - "Cada ejecucion del cron: (1) crea la particion del mes siguiente si no existe, (2) dropea particiones con suffix YYYYMM mas viejo que cutoff (now - 30 dias)"
    - "El cron esta registrado en /api/inngest/route.ts junto a los otros functions"
    - "El cron usa createAdminClient (o raw — ambos sirven aqui) para llamar las RPC del schema"
    - "El cron loguea via pino los partitions creados/dropeados"
  artifacts:
    - path: "src/inngest/functions/observability-purge.ts"
      provides: "Cron diario que maneja partitions"
      contains: "create_observability_partition"
    - path: "src/app/api/inngest/route.ts"
      provides: "Registro de observabilityPurgeCron en el array serve"
  key_links:
    - from: "src/inngest/functions/observability-purge.ts"
      to: "agent_observability_* tables (via RPC)"
      via: "supabase.rpc('create_observability_partition', ...) + supabase.rpc('drop_observability_partitions_older_than', ...)"
      pattern: "rpc\\('(create_observability_partition|drop_observability_partitions_older_than)'"
---

<objective>
Crear el cron Inngest diario que gestiona las particiones de las 4 tablas particionadas: crea el mes siguiente con antelacion y dropea cualquier particion con datos mas viejos que 30 dias. Clonar el patron exacto de `src/inngest/functions/close-stale-sessions.ts` (Phase 42).

Purpose: Retencion automatica de 30 dias sin intervencion manual (Decision #3 del context, Pattern DROP PARTITION vs DELETE del research).
Output: Cron registrado y funcional. Las tablas nunca acumulan >2 meses de datos en steady state.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-01-SUMMARY.md
@src/inngest/functions/close-stale-sessions.ts
@src/app/api/inngest/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear observability-purge cron + registrarlo</name>
  <files>
src/inngest/functions/observability-purge.ts
src/app/api/inngest/route.ts
  </files>
  <action>
1. LEER `src/inngest/functions/close-stale-sessions.ts` para entender el patron exacto (imports, signatures, createModuleLogger, estructura de steps).

2. Crear `src/inngest/functions/observability-purge.ts` siguiendo el ejemplo del research (seccion "Code Examples" → "Daily purge cron") adaptado al patron de close-stale-sessions:

```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('observability-purge')

export const observabilityPurgeCron = inngest.createFunction(
  {
    id: 'observability-purge',
    name: 'Observability Partition Purge',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 3 * * *' }, // 03:00 Bogota (1 hora despues de close-stale-sessions)
  async ({ step }) => {
    // Step 1: create next-month partition if missing
    const createdFor = await step.run('ensure-next-month-partition', async () => {
      const supabase = createAdminClient()
      const next = new Date()
      next.setMonth(next.getMonth() + 1)
      next.setDate(1)
      const targetMonth = next.toISOString().slice(0, 10) // 'YYYY-MM-01'
      const { error } = await supabase.rpc('create_observability_partition', { target_month: targetMonth })
      if (error) {
        logger.error({ err: error, targetMonth }, 'failed to create next-month partition')
        throw error
      }
      logger.info({ targetMonth }, 'ensured next-month partition exists')
      return targetMonth
    })

    // Step 2: drop partitions older than 30 days
    const dropped = await step.run('drop-old-partitions', async () => {
      const supabase = createAdminClient()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      cutoff.setDate(1) // cutoff to start of month 30+ days ago
      const cutoffIso = cutoff.toISOString().slice(0, 10)
      const { data, error } = await supabase.rpc('drop_observability_partitions_older_than', { cutoff: cutoffIso })
      if (error) {
        logger.error({ err: error, cutoff: cutoffIso }, 'failed to drop old partitions')
        throw error
      }
      logger.info({ cutoff: cutoffIso, dropped: data }, 'dropped old partitions')
      return data
    })

    return { createdFor, dropped }
  },
)
```

3. Registrar en `src/app/api/inngest/route.ts`:
   - LEER el archivo para encontrar el array passed to `serve({ client, functions: [...] })`.
   - Importar: `import { observabilityPurgeCron } from '@/inngest/functions/observability-purge'`.
   - Agregar `observabilityPurgeCron` al array de `functions`.

4. Smoke check: `npm run build` pasa, el nuevo cron aparece en la lista de inngest functions al arrancar `inngest dev` local (si esta disponible).

**IMPORTANTE:** Este cron es seguro de activar incluso con feature flag OFF — opera sobre las tablas del schema directamente via RPC y no depende del collector. Cuando no hay datos (porque nadie esta escribiendo), la particion mes-actual tiene 0 rows y drop_old no encuentra particiones que dropear. Inofensivo.
  </action>
  <verify>
- Build pasa
- `grep "observabilityPurgeCron" src/app/api/inngest/route.ts` → 1 match en registro
- `grep "cron:" src/inngest/functions/observability-purge.ts` → cron string con `TZ=America/Bogota` y `0 3 * * *`
- Comparar estructura con close-stale-sessions.ts — patrones equivalentes
- Probar local: `curl -X POST http://localhost:3020/api/inngest` o via Inngest dev UI ejecuta el cron manualmente → los 2 steps corren sin error (con schema aplicado en dev; si no hay schema en dev, aceptable omitir este check)
  </verify>
  <done>
Cron registrado. Se ejecutara automaticamente en produccion una vez deployado (no requiere activacion manual, pero es idempotente cuando feature flag OFF).
  </done>
</task>

</tasks>

<verification>
- Build pasa
- Cron registrado en /api/inngest/route.ts
- Estructura identica a close-stale-sessions.ts
- Inofensivo con feature flag OFF
</verification>

<success_criteria>
Tras deploy, Inngest ejecutara el cron cada dia a las 03:00 Bogota. La retencion de 30 dias se garantiza automaticamente. Creacion proactiva del mes siguiente evita que el dia 1 del nuevo mes falle por falta de particion.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-08-SUMMARY.md` con: schedule, steps, comportamiento con flag OFF, verificacion contra patron close-stale-sessions.
</output>
