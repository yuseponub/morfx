'use client'

// ============================================================================
// AgentSelector — content-editor agent dropdown + read-only badge.
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// D-04: lists ALL 7 agents (5 from the shared AGENT_CATALOG + 2 extra Somnio
//       agents that are NOT registered in the shared catalog).
// D-02 / Regla 6: ONLY somnio-sales-v4 is editable. Every other agent renders a
//       prominent "PRODUCCIÓN — solo lectura" badge and disabled inputs.
//
// CRITICAL (Regla 6 / no production-UI regression): the shared
// src/lib/agents/agent-catalog.ts is imported READ-ONLY here. config-panel.tsx
// and agent-config-slider.tsx iterate AGENT_CATALOG.map() DIRECTLY (no
// getAgentsForWorkspace filter), so any entry added to the shared array would
// surface as a selectable conversational agent in EVERY workspace's config UI
// (including GoDentist). The two extra Somnio agents therefore live ONLY in this
// content-editor-LOCAL CONTENT_EDITOR_AGENTS constant — the shared catalog is
// never mutated.
// ============================================================================

import { AGENT_CATALOG, type AgentCatalogEntry } from '@/lib/agents/agent-catalog'

/**
 * content-editor-LOCAL agent list — does NOT mutate the shared catalog.
 * The two extra Somnio agents (ids copied verbatim from CLAUDE.md) only exist
 * here so the editability gate (`agentId === 'somnio-sales-v4'`) and the Plan 05
 * actions' agentId routing stay correct.
 */
export const CONTENT_EDITOR_AGENTS: readonly AgentCatalogEntry[] = [
  ...AGENT_CATALOG,
  {
    id: 'somnio-recompra-v1',
    name: 'Somnio Recompra',
    description: 'Agente de recompra/reagendamiento ELIXIR DEL SUEÑO (WhatsApp).',
  },
  {
    id: 'somnio-sales-v3-pw-confirmation',
    name: 'Somnio Sales v3 — Post-Compra',
    description: 'Confirmación post-compra (pipeline Ventas Somnio Standard).',
  },
] as const

/** The single editable agent (D-02 / Regla 6). */
export const EDITABLE_AGENT_ID = 'somnio-sales-v4'

interface Props {
  selectedAgentId: string
  onChange: (agentId: string) => void
}

export function AgentSelector({ selectedAgentId, onChange }: Props) {
  const editable = selectedAgentId === EDITABLE_AGENT_ID
  const selected = CONTENT_EDITOR_AGENTS.find((a) => a.id === selectedAgentId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="content-editor-agent"
          className="text-sm font-medium text-foreground"
        >
          Agente
        </label>
        <select
          id="content-editor-agent"
          aria-label="Agente"
          role="combobox"
          className="min-w-[280px] rounded-md border px-3 py-2 bg-background text-sm"
          value={selectedAgentId}
          onChange={(e) => onChange(e.target.value)}
        >
          {CONTENT_EDITOR_AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {editable ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            EDITABLE
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300">
            PRODUCCIÓN — solo lectura
          </span>
        )}
      </div>

      {selected && (
        <p className="text-sm text-muted-foreground max-w-2xl">{selected.description}</p>
      )}

      {!editable && (
        <p className="text-xs text-amber-700 max-w-2xl">
          Este agente está en producción. Solo <strong>somnio-sales-v4</strong> es
          editable desde esta pantalla (Regla 6 / D-02). Los demás se muestran en
          modo lectura para que entiendas su comportamiento.
        </p>
      )}
    </div>
  )
}
