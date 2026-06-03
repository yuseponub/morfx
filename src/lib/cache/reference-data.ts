import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Product, PipelineWithStages, PipelineStage } from '@/lib/orders/types'
import type { Tag } from '@/lib/types/database'

/**
 * Next Data Cache wrappers para datos de referencia del workspace (Capa 3, D-07).
 *
 * Patron clonado de src/app/actions/bold.ts (Next Data Cache: fn, keyParts, opts).
 *
 * `workspaceId` se recibe como ARGUMENTO (Pitfall 5: NUNCA leer la cookie del
 * request dentro del callback cacheado — el Next Data Cache prohibe datos
 * dinamicos ahi). El workspaceId joina la cache key, sin fuga cross-workspace.
 *
 * Se usa createAdminClient() dentro del callback: RLS no aplica (no hay cookie en
 * el contexto cacheado); la garantia es el filtro explicito `.eq('workspace_id', ...)`
 * + workspaceId server-derivado (nunca de body) (RESEARCH Example 4).
 *
 * NO cableado a ningun call site en este plan (Plan 03). NO se agrega revalidateTag
 * aun (los puntos de invalidacion se agregan junto al cableado en Plan 03).
 *
 * Correctitud = revalidateTag en mutacion (Plan 03); revalidate: 300 es red de seguridad.
 */

export const getCachedActiveProducts = (workspaceId: string): Promise<Product[]> =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true)
        .order('title', { ascending: true })
      return (data ?? []) as Product[]
    },
    ['active-products', workspaceId],
    { revalidate: 300, tags: [`ref:products:${workspaceId}`] },
  )()

export const getCachedTagsForScope = (
  workspaceId: string,
  scope?: 'whatsapp' | 'orders',
): Promise<Tag[]> =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient()
      let q = supabase
        .from('tags')
        .select('id, name, color, applies_to')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      if (scope === 'whatsapp') q = q.in('applies_to', ['whatsapp', 'both'])
      else if (scope === 'orders') q = q.in('applies_to', ['orders', 'both'])
      const { data } = await q
      return (data ?? []) as Tag[]
    },
    ['tags-scope', workspaceId, scope ?? 'all'],
    { revalidate: 300, tags: [`ref:tags:${workspaceId}`] },
  )()

export const getCachedPipelines = (workspaceId: string): Promise<PipelineWithStages[]> =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('pipelines')
        .select('*, stages:pipeline_stages(*)')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      return ((data ?? []) as PipelineWithStages[]).map((p) => ({
        ...p,
        stages: (p.stages || []).sort(
          (a: PipelineStage, b: PipelineStage) => a.position - b.position,
        ),
      }))
    },
    ['pipelines', workspaceId],
    { revalidate: 300, tags: [`ref:pipelines:${workspaceId}`] },
  )()
