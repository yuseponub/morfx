/**
 * CRM Agents List API Route
 * Phase 15.6: Sandbox Evolution
 *
 * Returns available CRM agents for the sandbox header dropdown.
 */

import { NextResponse } from 'next/server'
import { crmAgentRegistry } from '@/lib/agents/crm'
import type { CrmAgentState } from '@/lib/sandbox/types'

export async function GET() {
  const agents = crmAgentRegistry.listAgents()

  const crmAgentStates: CrmAgentState[] = agents.map(agent => ({
    agentId: agent.id,
    name: agent.name,
    description: agent.description,
    enabled: false,
    mode: 'dry-run' as const,
  }))

  return NextResponse.json(crmAgentStates)
}
