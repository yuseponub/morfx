/**
 * Retake Template API Route
 * Returns the hola "deseas adquirir" template content for silence retake.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()

  // Find the hola template that contains "deseas adquirir" (the product pitch with image)
  const { data: templates } = await supabase
    .from('agent_templates')
    .select('content, content_type')
    .eq('agent_id', 'somnio-sales-v1')
    .eq('intent', 'hola')
    .eq('visit_type', 'primera_vez')
    .order('orden', { ascending: true })

  if (!templates || templates.length === 0) {
    return NextResponse.json({ content: null })
  }

  // Find the template with "deseas adquirir" (could be text or image type)
  const retakeTemplate = templates.find((t: { content: string; content_type: string }) =>
    t.content.toLowerCase().includes('deseas adquirir')
  )

  if (!retakeTemplate) {
    return NextResponse.json({ content: null })
  }

  return NextResponse.json({ content: retakeTemplate.content, contentType: retakeTemplate.content_type })
}
