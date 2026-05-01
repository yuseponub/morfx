// Standalone: somnio-sales-v4
// D-13: agent_id literal locked
// D-23: scope = workspace Somnio exclusivo
// D-24: cero imports desde @/lib/agents/somnio-v3/*

export const SOMNIO_V4_AGENT_ID = 'somnio-sales-v4' as const

// Workspace Somnio (D-23). Hardcoded porque v4 SOLO opera aquí.
export const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490' as const

// La AgentConfig completa (id, name, intentDetector, etc.) se agrega en Plan 06
// cuando state-machine + comprehension estén listos.
