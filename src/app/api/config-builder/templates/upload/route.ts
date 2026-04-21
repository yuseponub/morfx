// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 03
// Upload endpoint para imagenes de header de templates.
//
// Flujo (D-10, D-11, D-12):
//   1. Auth (usuario logueado)
//   2. Workspace (cookie morfx_workspace)
//   3. Membership (workspace_members filtrado por workspace_id + user_id)
//   4. Validacion de archivo: MIME ∈ {image/jpeg, image/png}, size ≤ 5 MB
//   5. Upload al bucket `whatsapp-media` con path `templates/{workspaceId}/{timestamp}_{safeName}`
//   6. Return { storagePath, publicUrl, mimeType } — el frontend lo pasa a submitTemplate
//
// La imagen se queda en Supabase Storage; el domain la descarga y la sube a
// 360 Dialog via resumable API al momento de crear el template.
// ============================================================================

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png'] as const

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2. Workspace
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return new Response('No workspace selected', { status: 400 })

  // 3. Membership
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return new Response('Forbidden', { status: 403 })

  // 4. File
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return Response.json({ error: 'file field required' }, { status: 400 })

  if (!ALLOWED_MIMES.includes(file.type as (typeof ALLOWED_MIMES)[number])) {
    return Response.json(
      { error: `MIME no soportado: ${file.type}. Solo image/jpeg o image/png.` },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      {
        error: `Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximo 5 MB.`,
      },
      { status: 400 },
    )
  }

  // 5. Upload
  const timestamp = Date.now()
  const safeName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `templates/${workspaceId}/${timestamp}_${safeName}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage
    .from('whatsapp-media')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (upErr) {
    return Response.json(
      { error: `Error subiendo a storage: ${upErr.message}` },
      { status: 500 },
    )
  }

  const { data: pub } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(storagePath)

  return Response.json({
    storagePath,
    publicUrl: pub.publicUrl,
    mimeType: file.type,
  })
}
