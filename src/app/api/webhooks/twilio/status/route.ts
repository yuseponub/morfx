import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Twilio Status Callback Endpoint
 * Called by Twilio when SMS delivery status changes.
 * Updates sms_messages with final status, price, and error info.
 *
 * Twilio sends form-encoded data (not JSON).
 * Key fields: MessageSid, MessageStatus, Price, PriceUnit, ErrorCode, ErrorMessage
 *
 * Status progression: queued -> sending -> sent -> delivered
 *                                              -> failed
 *                                              -> undelivered
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const messageSid = formData.get('MessageSid') as string | null
    const messageStatus = formData.get('MessageStatus') as string | null
    const price = formData.get('Price') as string | null
    const priceUnit = formData.get('PriceUnit') as string | null
    const errorCode = formData.get('ErrorCode') as string | null
    const errorMessage = formData.get('ErrorMessage') as string | null

    if (!messageSid) {
      return NextResponse.json({ error: 'Missing MessageSid' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const updateData: Record<string, unknown> = {
      status: messageStatus || 'unknown',
    }

    // Price: Twilio returns negative for outbound, we store absolute value
    if (price) {
      updateData.price = Math.abs(parseFloat(price))
    }
    if (priceUnit) {
      updateData.price_unit = priceUnit
    }
    if (errorCode) {
      updateData.error_code = errorCode
    }
    if (errorMessage) {
      updateData.error_message = errorMessage
    }

    await supabase
      .from('sms_messages')
      .update(updateData)
      .eq('twilio_sid', messageSid)

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[twilio-status-callback] Error:', error)
    // Return 200 to prevent Twilio from retrying on our errors
    return NextResponse.json({ received: true, error: 'Processing failed' })
  }
}
