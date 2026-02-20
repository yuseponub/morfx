/**
 * Quick verification of counts for the cleanup math
 */
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
const PIPELINE_VENTAS = 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8';

async function main() {
  // Count ventas with bigin_id
  const { count: withBigin } = await supabase
    .from('orders').select('*', { count: 'exact', head: true })
    .eq('workspace_id', WS_ID).eq('pipeline_id', PIPELINE_VENTAS)
    .not('custom_fields->>bigin_id', 'is', null);

  // Count ventas without bigin_id
  const { count: withoutBigin } = await supabase
    .from('orders').select('*', { count: 'exact', head: true })
    .eq('workspace_id', WS_ID).eq('pipeline_id', PIPELINE_VENTAS)
    .is('custom_fields->>bigin_id', null);

  // Count distinct bigin_ids (need to fetch all and count unique)
  const all: string[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('orders').select('custom_fields')
      .eq('workspace_id', WS_ID).eq('pipeline_id', PIPELINE_VENTAS)
      .not('custom_fields->>bigin_id', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const d of data) all.push(d.custom_fields?.bigin_id);
    offset += data.length;
    if (data.length < 1000) break;
  }

  const unique = new Set(all);

  console.log('=== VENTAS PIPELINE COUNTS ===');
  console.log(`  With bigin_id: ${withBigin}`);
  console.log(`  Without bigin_id: ${withoutBigin}`);
  console.log(`  Total: ${(withBigin || 0) + (withoutBigin || 0)}`);
  console.log(`  Unique bigin_ids: ${unique.size}`);
  console.log(`  Duplicate bigin_ids: ${all.length - unique.size}`);
  console.log(`\nAfter cleanup:`);
  console.log(`  Ventas = ${unique.size} (unique bigin) + ${withoutBigin} (no bigin) = ${unique.size + (withoutBigin || 0)}`);
  console.log(`  Deleted = ${all.length - unique.size}`);

  // Also check what the expected migration count was
  // ventas from order-groups (24,195) + standalone (1,959) = 26,154
  // But 1,959 were duplicated
  console.log(`\n  Expected unique bigin ventas: 24,195 (groups) + 1,959 (standalone) = 26,154`);
  console.log(`  But 1,959 standalone were ALSO in groups = 24,195 unique bigin_ids`);
  console.log(`  Hmm, that would mean unique = 24,195. Let's see: ${unique.size}`);
}

main().catch(console.error);
