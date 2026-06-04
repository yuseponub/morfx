import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const suffixes = ['20c514','b98490','1c9328','37198f']
  const { data, error } = await sb.from('workspaces').select('id, name').order('name')
  if (error) { console.log('ERR', error.message); return }
  if (!data) { console.log('no ws'); return }
  console.log('Workspaces con trafico reciente:')
  for (const w of data) {
    const sfx = String(w.id).slice(-6)
    if (suffixes.includes(sfx)) console.log(`  ${sfx}  ${w.name}  (${w.id})`)
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
