'use client'

// ============================================================================
// FactPicker — read-only catalog panel embedded en el editor.
// Renderea la lista de facts disponibles para el rule_type seleccionado
// (ya pre-filtrada por el editor-client via valid_in_rule_types — W-3 fix).
//
// Ademas se exporta `filterFactsByRuleType` para uso en editor-client.tsx.
// ============================================================================

import type { FactItem } from './ConditionBuilder'

export function filterFactsByRuleType(
  facts: FactItem[],
  ruleType: 'lifecycle_classifier' | 'agent_router',
): FactItem[] {
  return facts.filter((f) => {
    // Si el catalog row no declara `valid_in_rule_types`, lo dejamos visible
    // (compat con rows legacy). Si lo declara, debe incluir el ruleType actual.
    if (!Array.isArray(f.valid_in_rule_types) || f.valid_in_rule_types.length === 0) {
      return true
    }
    return f.valid_in_rule_types.includes(ruleType)
  })
}

interface Props {
  /** Facts ya filtrados por rule_type. Solo render. */
  facts: FactItem[]
}

export function FactPicker({ facts }: Props) {
  if (facts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No hay facts disponibles para este rule_type.
      </p>
    )
  }
  return (
    <ul className="text-xs space-y-2">
      {facts.map((f) => (
        <li key={f.name}>
          <code className="font-mono">{f.name}</code>{' '}
          <span className="text-muted-foreground">({f.return_type})</span>
          {f.description && (
            <p className="text-muted-foreground">{f.description}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
