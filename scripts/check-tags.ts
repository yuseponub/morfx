import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      phone,
      profile_name,
      contact_id,
      conversation_tags:conversation_tags(tag:tags(id, name, color))
    `)
    .order('last_message_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(JSON.stringify(data, null, 2))
}
main()
