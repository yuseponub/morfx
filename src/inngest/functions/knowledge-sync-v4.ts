/**
 * Inngest function — Somnio v4 Knowledge Sync (post-deploy hook).
 *
 * Listen on `somnio-v4/knowledge.sync` event:
 *   - Disparado por Vercel deploy webhook (a configurar en Plan 11) o manualmente
 *     vía `pnpm knowledge:sync` (CLI Plan 11).
 *
 * Flow (D-53):
 *   1. Walk recursivo de `src/lib/agents/somnio-v4/knowledge/**\/*.md`.
 *   2. Per-archivo: `syncKbDoc(filePath, raw)` (Plan 04 — hash-check, embedding regen
 *      solo si body cambió, upsert a `agent_knowledge_base`).
 *   3. Per-archivo: try/catch que NO throw (D-54 — sync fail NO bloquea deploy).
 *   4. Si `fail > 0` → emite evento `pipeline_decision:knowledge_sync_failed`
 *      a `agent_observability_events` (W-05 fix). UI/dashboards subscribe.
 *
 * Regla 6 (Proteger agente en producción) — la function es no-op cuando la
 * `platform_config.somnio_v4_kb_sync_enabled` flag está `false` (default). El
 * operador la habilita cuando v4 esté listo para sincronizar el corpus en prod.
 *
 * Standalone: somnio-sales-v4 / Plan 09 Task 3.
 */

import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import { syncKbDoc } from '@/lib/agents/somnio-v4/knowledge-base/sync'
import { getCollector } from '@/lib/observability'
import { SOMNIO_V4_AGENT_ID } from '@/lib/agents/somnio-v4/config'
import { createAdminClient } from '@/lib/supabase/admin'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const logger = createModuleLogger('somnio-v4-knowledge-sync')

/**
 * Walk recursivo, retorna todas las rutas absolutas de archivos `.md` bajo `dir`.
 * Robust a errores de I/O — saltea directorios/archivos no legibles.
 */
async function walkMd(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir).catch(() => [] as string[])
  for (const name of entries) {
    const full = path.join(dir, name)
    const st = await stat(full).catch(() => null)
    if (!st) continue
    if (st.isDirectory()) {
      out.push(...(await walkMd(full)))
    } else if (st.isFile() && name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Lee `platform_config.somnio_v4_kb_sync_enabled`. Default `false` cuando missing.
 */
async function isKbSyncEnabled(): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('platform_config')
    .select('value')
    .eq('key', 'somnio_v4_kb_sync_enabled')
    .maybeSingle()
  if (!data) return false
  const v: unknown = (data as { value: unknown }).value
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v === 'true'
  return false
}

export const knowledgeSyncV4 = inngest.createFunction(
  {
    id: 'somnio-v4-knowledge-sync',
    name: 'Somnio v4 Knowledge Sync',
    retries: 1,
  },
  { event: 'somnio-v4/knowledge.sync' },
  async ({ step }) => {
    // ┌───────────────────────────────────────────────────────────────────────┐
    // │ GUARD D-01 (standalone ui-agent-content-editor):                        │
    // │   FLIPPEAR `platform_config.somnio_v4_kb_sync_enabled` a ON haría que   │
    // │   esta function SOBRESCRIBA (OVERWRITE / sobrescribir) las ediciones    │
    // │   de la UI con los `.md` (potencialmente viejos) del repo. Desde D-01   │
    // │   la BASE DE DATOS es la FUENTE DE VERDAD del KB de somnio-sales-v4.    │
    // │   MANTENER la flag en FALSE en prod una vez la UI editor esté viva.     │
    // │   (No cambiamos el gating — ya es no-op cuando está off; solo se        │
    // │   documenta el riesgo. El sibling CLI scripts/knowledge-sync.ts tiene   │
    // │   el guard duro --force.)                                               │
    // └───────────────────────────────────────────────────────────────────────┘
    const enabled = await step.run('check-feature-flag', () => isKbSyncEnabled())
    if (!enabled) {
      logger.info('KB sync disabled — function is no-op')
      return { skipped: 'feature_flag_off' as const }
    }

    const KB_ROOT = path.resolve(
      process.cwd(),
      'src/lib/agents/somnio-v4/knowledge',
    )
    const files = await step.run('list-md', () => walkMd(KB_ROOT))

    let ok = 0
    let fail = 0
    const failedFiles: string[] = []

    for (const file of files) {
      try {
        await step.run(`sync-${path.basename(file)}`, async () => {
          const raw = await readFile(file, 'utf8')
          await syncKbDoc(file, raw)
        })
        ok++
      } catch (err) {
        // D-54: per-file failure NO bloquea el deploy — log + continúa.
        logger.error(
          { err: (err as Error).message, file },
          'KB sync per-file failed',
        )
        fail++
        failedFiles.push(path.relative(process.cwd(), file))
      }
    }

    if (fail > 0) {
      // W-05 fix: emitir explícitamente `pipeline_decision:knowledge_sync_failed`
      // a `agent_observability_events`. UI/dashboards pueden subscribirse para
      // mostrar banner de "knowledge stale" al operador.
      await step.run('emit-knowledge-sync-failed', async () => {
        getCollector()?.recordEvent('pipeline_decision', 'knowledge_sync_failed', {
          agent: SOMNIO_V4_AGENT_ID,
          ok,
          fail,
          total: files.length,
          files: failedFiles,
        })
      })
      logger.warn(
        { ok, fail, failedFiles },
        'KB sync completed with failures (knowledge_sync_failed emitted)',
      )
    } else {
      logger.info({ ok }, 'KB sync completed cleanly')
    }

    return { ok, fail, total: files.length }
  },
)

export const knowledgeSyncV4Functions = [knowledgeSyncV4]
