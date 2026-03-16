// ============================================================================
// SMS Module — Onurix API Client
// Thin wrapper around the Onurix REST API.
// Called exclusively by src/lib/domain/sms.ts.
//
// CRITICAL: Endpoints confirmed from LIVE testing:
//   SEND:   POST /api/v1/sms/send (form-urlencoded body)
//   STATUS: GET  /api/v1/messages-state (query params)
// ============================================================================

import { ONURIX_BASE_URL } from './constants'
import type { OnurixSendResponse, OnurixStatusItem } from './types'

/**
 * Send an SMS via Onurix API.
 * Uses form-urlencoded body (NOT JSON, NOT query params).
 *
 * @param phone - Phone number in 57XXXXXXXXXX format
 * @param message - SMS text content
 * @returns Onurix send response with dispatch ID and credits used
 * @throws Error on non-ok HTTP response
 */
export async function sendOnurixSMS(
  phone: string,
  message: string
): Promise<OnurixSendResponse> {
  const clientId = process.env.ONURIX_CLIENT_ID
  const apiKey = process.env.ONURIX_API_KEY

  if (!clientId || !apiKey) {
    throw new Error('Onurix credentials not configured: ONURIX_CLIENT_ID and ONURIX_API_KEY required')
  }

  const body = new URLSearchParams({
    client: clientId,
    key: apiKey,
    phone,
    sms: message,
  })

  const res = await fetch(`${ONURIX_BASE_URL}/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Onurix send error: ${res.status} ${res.statusText} - ${text}`)
  }

  const data: OnurixSendResponse = await res.json()

  if (data.status !== 1) {
    throw new Error(`Onurix send failed: status=${data.status}, response=${JSON.stringify(data)}`)
  }

  return data
}

/**
 * Check delivery status of a sent SMS via Onurix API.
 * Uses GET with query params.
 *
 * @param dispatchId - The dispatch ID returned from sendOnurixSMS
 * @returns Array of status items (usually 1 element)
 * @throws Error on non-ok HTTP response
 */
export async function checkOnurixStatus(
  dispatchId: string
): Promise<OnurixStatusItem[]> {
  const clientId = process.env.ONURIX_CLIENT_ID
  const apiKey = process.env.ONURIX_API_KEY

  if (!clientId || !apiKey) {
    throw new Error('Onurix credentials not configured: ONURIX_CLIENT_ID and ONURIX_API_KEY required')
  }

  const url = new URL(`${ONURIX_BASE_URL}/messages-state`)
  url.searchParams.set('client', clientId)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('id', dispatchId)

  const res = await fetch(url.toString())

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Onurix status check error: ${res.status} ${res.statusText} - ${text}`)
  }

  return res.json()
}
