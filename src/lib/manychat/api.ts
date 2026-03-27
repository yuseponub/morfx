// ============================================================================
// ManyChat API Client
// Sends messages to Facebook Messenger / Instagram subscribers via
// ManyChat's sendContent API using the dynamic block v2 format.
// ============================================================================

const MANYCHAT_API_URL = 'https://api.manychat.com'

/** ManyChat uses /fb/ for Messenger and /ig/ for Instagram */
export type ManyChatChannel = 'fb' | 'ig'

export interface ManyChatResponse {
  status: string
  data?: unknown
}

export interface ManyChatSubscriberInfo {
  id: number
  name: string
  first_name: string
  last_name: string
  profile_pic: string
  gender: string
  locale: string
}

/**
 * Build JSON body with subscriber_id as a raw integer (no Number() conversion).
 * Facebook PSIDs can exceed Number.MAX_SAFE_INTEGER, so we manually construct
 * the JSON string to preserve the exact integer value.
 */
function buildSendContentBody(subscriberId: string, data: object): string {
  const dataJson = JSON.stringify(data)
  return `{"subscriber_id":${subscriberId},"data":${dataJson}}`
}

/**
 * Send a text message to a ManyChat subscriber.
 */
export async function sendText(
  apiKey: string,
  subscriberId: string,
  text: string,
  channel: ManyChatChannel = 'fb'
): Promise<ManyChatResponse> {
  const response = await fetch(`${MANYCHAT_API_URL}/${channel}/sending/sendContent`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: buildSendContentBody(subscriberId, {
      version: 'v2',
      content: {
        messages: [{ type: 'text', text }],
        actions: [],
        quick_replies: [],
      },
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`ManyChat API error: ${response.status} - ${JSON.stringify(data)}`)
  }

  return data as ManyChatResponse
}

/**
 * Send an image message to a ManyChat subscriber.
 */
export async function sendImage(
  apiKey: string,
  subscriberId: string,
  imageUrl: string,
  channel: ManyChatChannel = 'fb'
): Promise<ManyChatResponse> {
  const response = await fetch(`${MANYCHAT_API_URL}/${channel}/sending/sendContent`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: buildSendContentBody(subscriberId, {
      version: 'v2',
      content: {
        messages: [{ type: 'image', url: imageUrl, buttons: [] }],
        actions: [],
        quick_replies: [],
      },
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`ManyChat API error: ${response.status} - ${JSON.stringify(data)}`)
  }

  return data as ManyChatResponse
}

/**
 * Get subscriber information from ManyChat.
 */
export async function getSubscriberInfo(
  apiKey: string,
  subscriberId: string
): Promise<ManyChatSubscriberInfo> {
  const response = await fetch(
    `${MANYCHAT_API_URL}/fb/subscriber/getInfo?subscriber_id=${subscriberId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(`ManyChat API error: ${response.status} - ${JSON.stringify(data)}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any).data as ManyChatSubscriberInfo
}
