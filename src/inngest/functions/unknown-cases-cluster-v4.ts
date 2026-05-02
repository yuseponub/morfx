/**
 * Inngest cron — Somnio v4 Unknown Cases Clustering.
 *
 * Diariamente 4:00 AM Bogota, llama `clusterUnknownCases()` (wrapper de SQL
 * function `cluster_unknown_cases` shipped por Plan 02) para asignar cluster_id
 * a las filas `pending` que alcanzaron 10+ vecinos similares en ventana 30 días
 * (D-06).
 *
 * Regla 6 (Proteger agente en producción) — el cron es no-op por defecto:
 *   - Gated por `platform_config.somnio_v4_kb_sync_enabled` (default `false`).
 *   - Si la flag está `false` (o ausente), retorna `{ skipped: 'feature_flag_off' }`
 *     sin tocar la DB.
 *   - El operador habilita el cron flipando la flag manualmente cuando v4 esté
 *     listo para empezar a producir clusters (post-flip Plan 13).
 *
 * Standalone: somnio-sales-v4 / Plan 09 Task 2.
 */

import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import { clusterUnknownCases } from '@/lib/agents/somnio-v4/unknown-cases/cluster'
import { SOMNIO_WORKSPACE_ID } from '@/lib/agents/somnio-v4/config'
import { createAdminClient } from '@/lib/supabase/admin'

const logger = createModuleLogger('somnio-v4-unknown-cases-cluster')

/**
 * Lee `platform_config.somnio_v4_kb_sync_enabled`. Default `false` cuando missing.
 *
 * (Reusa la misma flag que knowledge-sync-v4 — el operador habilita ambos
 *  observation-loop crons con un único toggle manual cuando v4 esté listo.)
 */
async function isObservationLoopEnabled(): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('platform_config')
    .select('value')
    .eq('key', 'somnio_v4_kb_sync_enabled')
    .maybeSingle()
  if (!data) return false
  // platform_config.value can be a JSONB boolean or string — normalize.
  const v: unknown = (data as { value: unknown }).value
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v === 'true'
  return false
}

export const unknownCasesClusterV4 = inngest.createFunction(
  {
    id: 'somnio-v4-unknown-cases-cluster',
    name: 'Somnio v4 Unknown Cases Clustering',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 4 * * *' },
  async ({ step }) => {
    const enabled = await step.run('check-feature-flag', () =>
      isObservationLoopEnabled(),
    )
    if (!enabled) {
      logger.info('Observation loop disabled — cron is no-op')
      return { skipped: 'feature_flag_off' as const }
    }

    const result = await step.run('cluster', () =>
      clusterUnknownCases(SOMNIO_WORKSPACE_ID),
    )
    logger.info(result, 'Clustering complete')
    return result
  },
)

export const unknownCasesClusterV4Functions = [unknownCasesClusterV4]
