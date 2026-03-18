// ============================================================================
// POST /api/contact-review/[token]
// Resolves a contact review (merge or ignore) and replays pending templates.
// No auth required — the token itself is the authorization (UUID).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  getContactReviewByToken,
  resolveContactReview,
  sendPendingTemplate,
} from '@/lib/domain/contact-reviews'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Parse and validate action
  let body: { action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { action } = body
  if (!action || !['merge', 'ignore'].includes(action)) {
    return NextResponse.json(
      { error: 'Action must be "merge" or "ignore"' },
      { status: 400 }
    )
  }

  // Check current status before resolving
  const reviewResult = await getContactReviewByToken(token)
  if (!reviewResult.success || !reviewResult.data) {
    return NextResponse.json(
      { error: 'Review not found' },
      { status: 404 }
    )
  }

  const review = reviewResult.data

  if (review.status !== 'pending') {
    return NextResponse.json(
      { error: 'Already resolved', status: review.status },
      { status: 409 }
    )
  }

  // Resolve the review
  const result = await resolveContactReview(token, action as 'merge' | 'ignore')
  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error || 'Resolution failed' },
      { status: 500 }
    )
  }

  // Replay pending templates
  const pendingTemplates = review.pendingTemplates || []
  const templateResults: Array<{ template: string; sent: boolean }> = []

  for (const tmpl of pendingTemplates) {
    try {
      await sendPendingTemplate(review.workspaceId, result.data.contactId, tmpl)
      templateResults.push({ template: tmpl.templateName, sent: true })
    } catch (err) {
      console.error('[contact-review] Failed to send pending template:', err)
      templateResults.push({ template: tmpl.templateName, sent: false })
    }
  }

  return NextResponse.json({
    success: true,
    action,
    contactId: result.data.contactId,
    templatesSent: templateResults,
  })
}
