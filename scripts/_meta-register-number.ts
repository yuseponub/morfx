// One-off smoke: register the Embedded-Signup number on Cloud API (Phase 38).
// Decrypts the stored BISUAT, calls POST /{phone_number_id}/register with a NEW
// 6-digit 2SV PIN, then reads back the number status. NOT app code — operational.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '../src/lib/meta/token'

const PHONE_NUMBER_ID = '1134593926408063'
const WORKSPACE_ID = '4b5d84dd-1b46-4e8c-8acf-3869c037198f'
const API = 'https://graph.facebook.com/v22.0'

// Fixed PIN we set + must REMEMBER (this becomes the number's new 2SV PIN).
const NEW_PIN = process.env.REGISTER_PIN || '601947'

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await sb
    .from('workspace_meta_accounts')
    .select('access_token_encrypted, waba_id, phone_number_id, is_active')
    .eq('workspace_id', WORKSPACE_ID)
    .eq('phone_number_id', PHONE_NUMBER_ID)
    .single()

  if (error || !data) {
    console.error('ROW NOT FOUND:', error?.message)
    process.exit(1)
  }

  const bisuat = decryptToken(data.access_token_encrypted)
  console.log('decrypt OK — token prefix:', bisuat.slice(0, 10) + '…', 'len:', bisuat.length)
  console.log('waba_id:', data.waba_id, 'phone_number_id:', data.phone_number_id)

  // --- status BEFORE ---
  const before = await fetch(
    `${API}/${PHONE_NUMBER_ID}?fields=status,platform_type,code_verification_status,verified_name,display_phone_number`,
    { headers: { Authorization: `Bearer ${bisuat}` } }
  ).then((r) => r.json())
  console.log('\nSTATUS BEFORE:', JSON.stringify(before, null, 2))

  // --- register ---
  console.log(`\nregistering with PIN ${NEW_PIN} …`)
  const reg = await fetch(`${API}/${PHONE_NUMBER_ID}/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bisuat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin: NEW_PIN }),
  })
  const regBody = await reg.json()
  console.log('REGISTER RESPONSE:', reg.status, JSON.stringify(regBody, null, 2))

  // --- status AFTER ---
  const after = await fetch(
    `${API}/${PHONE_NUMBER_ID}?fields=status,platform_type,code_verification_status,verified_name,display_phone_number`,
    { headers: { Authorization: `Bearer ${bisuat}` } }
  ).then((r) => r.json())
  console.log('\nSTATUS AFTER:', JSON.stringify(after, null, 2))
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
