/**
 * Returns the agent id to display in the turn list / detail header.
 *
 * Prefers `respondingAgentId` (the agent that actually produced the
 * response after webhook-processor routing) over `agentId` (the entry
 * agent resolved from `workspace_agent_config.conversational_agent_id`
 * at turn start).
 *
 * Introduced by standalone phase `agent-forensics-panel` Plan 01
 * (D-10 option B, D-12): the entry agent and the responding agent
 * DIFFER when the webhook-processor routes client contacts to
 * `somnio-recompra-v1` while the workspace config still reports
 * `somnio-v3` as the conversational agent. Before this fix the
 * panel showed `somnio-v3` for every recompra turn (mislabeled).
 *
 * DOM-free on purpose — unit-testable via plain vitest without
 * React Testing Library.
 */
export function getDisplayAgentId(turn: {
  agentId: string
  respondingAgentId?: string | null
}): string {
  return turn.respondingAgentId ?? turn.agentId
}
