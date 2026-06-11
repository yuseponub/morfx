// ============================================================================
// Agent Catalog — Single source of truth for all registered agents
// ============================================================================

export interface AgentCatalogEntry {
  id: string
  name: string
  description: string
}

/**
 * All agents registered in the system.
 * Used by sandbox header, config panel, and agent-config-slider
 * to populate agent selector dropdowns.
 *
 * Each workspace sees only the agent(s) relevant to its
 * conversational_agent_id in workspace_agent_config.
 */
export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    id: 'somnio-sales-v1',
    name: 'Somnio Sales v1',
    description: 'Agente de ventas para Somnio. Captura datos, ofrece promos y crea ordenes.',
  },
  {
    id: 'somnio-sales-v3',
    name: 'Somnio Sales v3',
    description: 'Agente conversacional v3. Pipeline modular con comprehension, sales-track y response-track.',
  },
  {
    id: 'somnio-sales-v4',
    name: 'Somnio Sales v4',
    description: 'Agente v4 con sub-loop AI SDK + KB pgvector + observation loop (unknown_cases). Sucesor de v3.',
  },
  {
    id: 'godentist',
    name: 'GoDentist Valoraciones',
    description: 'Agente de agendamiento de citas para GoDentist. Agenda valoraciones GRATIS en 4 sedes.',
  },
  {
    id: 'godentist-fb-ig',
    name: 'GoDentist Valoraciones — FB/IG',
    description: 'Sibling de GoDentist para FB Messenger / Instagram Direct. Saludo lead-capture (nombre+celular upfront + Habeas Data inline).',
  },
  {
    id: 'varixcenter',
    name: 'Varixcenter Valoraciones',
    description: 'Agente de agendamiento de valoraciones flebológicas. Slots reales vs varix-clinic. WA + FB + IG.',
  },
]

/**
 * Get catalog entries filtered for a specific workspace.
 * Returns the agent configured for the workspace plus its sibling versions
 * (same product family, e.g. all `somnio-sales-vN`). This lets sandbox QA
 * test newer versions of the same conversational agent without changing
 * the workspace's production conversational_agent_id.
 * Falls back to full catalog if agentId not found (safety net).
 */
export function getAgentsForWorkspace(conversationalAgentId: string | undefined): AgentCatalogEntry[] {
  if (!conversationalAgentId) return AGENT_CATALOG
  // Sibling family — for `somnio-sales-vN`, expose every `somnio-sales-vM`.
  const familyMatch = conversationalAgentId.match(/^(.+)-v\d+$/)
  if (familyMatch) {
    const familyPrefix = familyMatch[1] + '-v'
    const siblings = AGENT_CATALOG.filter(a => a.id.startsWith(familyPrefix))
    if (siblings.length > 0) return siblings
  }
  const match = AGENT_CATALOG.filter(a => a.id === conversationalAgentId)
  return match.length > 0 ? match : AGENT_CATALOG
}

/**
 * Get agent name by ID. Falls back to ID if not found.
 */
export function getAgentName(agentId: string): string {
  return AGENT_CATALOG.find(a => a.id === agentId)?.name ?? agentId
}
