import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  process.env[t.slice(0, eq)] = t.slice(eq + 1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const WS_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490';

async function main() {
  // Check custom_field_definitions
  console.log('=== CUSTOM FIELD DEFINITIONS ===');
  const { data, error } = await supabase
    .from('custom_field_definitions')
    .select('*')
    .eq('workspace_id', WS_ID);

  if (error) {
    console.log('Error:', error.message);
    console.log('Code:', error.code);
  } else {
    console.log('Existing definitions:', JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
