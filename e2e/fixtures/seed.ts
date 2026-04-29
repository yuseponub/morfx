// e2e/fixtures/seed.ts
// Bootstrapped Wave 0 (Plan 01). Body lands in Plan 06 (Wave 5).
// Pattern derived from src/__tests__/integration/crm-bots/reader.test.ts (env-gated).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SeededData {
  workspaceId: string
  pipelineId: string
  stageIds: string[]   // [activo1, activo2, terminal1]
  contactId: string
  orderIds: string[]
}

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !srk) {
    throw new Error('seed requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, srk)
}

export async function seedTestFixture(): Promise<SeededData> {
  // NOT_IMPLEMENTED — Plan 06 fills this body.
  // Will: insert pipeline + 3 stages + contact + 2 orders into TEST_WORKSPACE_ID.
  void admin()
  throw new Error('seed.ts: NOT_IMPLEMENTED — landed in standalone crm-query-tools Plan 06 (Wave 5)')
}

export async function cleanupTestFixture(_seeded: SeededData): Promise<void> {
  // NOT_IMPLEMENTED — Plan 06 fills this body.
  void admin()
  throw new Error('seed.ts: NOT_IMPLEMENTED — landed in standalone crm-query-tools Plan 06 (Wave 5)')
}
