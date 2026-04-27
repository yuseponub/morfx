'use client'

// ============================================================================
// ConditionBuilder — recursivo all/any/not + leaves.
// Renderea segun shape del JSON de conditions:
//   { all: [...] }       → grupo AND
//   { any: [...] }       → grupo OR
//   { not: <cond> }      → negacion
//   { fact, operator, value } → leaf
//
// Plan 06 Task 3 — sin polish, solo funcional (decision usuario 2026-04-25).
//
// W-3 fix: `facts` recibido ya viene filtrado por valid_in_rule_types desde
// el editor-client (filtrado por rule_type seleccionado).
// ============================================================================

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MultiSelect } from './MultiSelect'

/** Operators whose value is a string[] instead of a single value. */
const MULTI_VALUE_OPERATORS = new Set([
  'in',
  'notIn',
  'arrayContainsAny',
  'arrayContainsAll',
])

const OPERATORS = [
  'equal',
  'notEqual',
  'lessThan',
  'lessThanInclusive',
  'greaterThan',
  'greaterThanInclusive',
  'in',
  'notIn',
  'contains',
  'doesNotContain',
  'daysSinceAtMost',
  'daysSinceAtLeast',
  'tagMatchesPattern',
  'arrayContainsAny',
  'arrayContainsAll',
] as const

export interface FactItem {
  name: string
  return_type: string
  description?: string
  valid_in_rule_types?: string[] | null
}

type AnyCondition =
  | { all: AnyCondition[] }
  | { any: AnyCondition[] }
  | { not: AnyCondition }
  | { fact: string; operator: string; value: unknown }

export interface PipelineOption {
  name: string
  stages: string[]
}

interface Props {
  value: AnyCondition
  onChange: (value: AnyCondition) => void
  facts: FactItem[]
  /** Optional list of tag names — used when fact == 'tags' */
  tags?: string[]
  /** Optional pipelines+stages — drives dropdowns for activeOrderPipeline /
   *  activeOrderStageRaw / activeOrderStage facts. */
  pipelines?: PipelineOption[]
  /** Recursion depth for indentation. */
  depth?: number
}

const ACTIVE_ORDER_STAGE_KINDS = ['preparation', 'transit', 'delivered'] as const

function isLeaf(
  c: AnyCondition,
): c is { fact: string; operator: string; value: unknown } {
  return (
    typeof c === 'object' &&
    c !== null &&
    'fact' in c &&
    'operator' in c &&
    'value' in c
  )
}

function isAll(c: AnyCondition): c is { all: AnyCondition[] } {
  return typeof c === 'object' && c !== null && 'all' in c
}

function isAny(c: AnyCondition): c is { any: AnyCondition[] } {
  return typeof c === 'object' && c !== null && 'any' in c
}

function isNot(c: AnyCondition): c is { not: AnyCondition } {
  return typeof c === 'object' && c !== null && 'not' in c
}

function emptyLeaf(): AnyCondition {
  return { fact: '', operator: 'equal', value: '' }
}

function emptyAll(): AnyCondition {
  return { all: [] }
}

function tryParseValue(raw: string): unknown {
  // Best-effort: numbers, booleans, JSON arrays/objects fall back to raw string.
  const trimmed = raw.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      // fall through
    }
  }
  return raw
}

function valueToInput(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

export function ConditionBuilder({
  value,
  onChange,
  facts,
  tags,
  pipelines,
  depth = 0,
}: Props) {
  const indentStyle = { marginLeft: depth * 12 }

  // ---------------- LEAF ----------------
  if (isLeaf(value)) {
    return (
      <div
        className="rounded border border-muted-foreground/20 p-2 bg-background"
        style={indentStyle}
      >
        <div className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-4">
            <Select
              value={value.fact}
              onValueChange={(v) => onChange({ ...value, fact: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="fact..." />
              </SelectTrigger>
              <SelectContent>
                {facts.map((f) => (
                  <SelectItem key={f.name} value={f.name}>
                    <span className="font-mono">{f.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      ({f.return_type})
                    </span>
                  </SelectItem>
                ))}
                {facts.length === 0 && (
                  <SelectItem value="__none" disabled>
                    No hay facts disponibles para este rule_type
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-3">
            <Select
              value={value.operator}
              onValueChange={(v) => onChange({ ...value, operator: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-4">
            {(() => {
              const isMulti = MULTI_VALUE_OPERATORS.has(value.operator)
              const arr = Array.isArray(value.value) ? (value.value as string[]) : []
              const single = typeof value.value === 'string' ? value.value : ''

              // tags fact
              if (value.fact === 'tags' && tags && tags.length > 0) {
                return isMulti ? (
                  <MultiSelect
                    value={arr}
                    onChange={(next) => onChange({ ...value, value: next })}
                    options={tags}
                    placeholder="Selecciona tags..."
                  />
                ) : (
                  <Select
                    value={single}
                    onValueChange={(v) => onChange({ ...value, value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="tag..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tags.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }

              // activeOrderPipeline fact
              if (value.fact === 'activeOrderPipeline' && pipelines && pipelines.length > 0) {
                const pipelineNames = pipelines.map((p) => p.name)
                return isMulti ? (
                  <MultiSelect
                    value={arr}
                    onChange={(next) => onChange({ ...value, value: next })}
                    options={pipelineNames}
                    placeholder="Selecciona pipelines..."
                  />
                ) : (
                  <Select
                    value={single}
                    onValueChange={(v) => onChange({ ...value, value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="pipeline..." />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }

              // activeOrderStageRaw fact (grouped by pipeline)
              if (value.fact === 'activeOrderStageRaw' && pipelines && pipelines.length > 0) {
                return isMulti ? (
                  <MultiSelect
                    value={arr}
                    onChange={(next) => onChange({ ...value, value: next })}
                    groups={pipelines.map((p) => ({ label: p.name, options: p.stages }))}
                    placeholder="Selecciona stages..."
                  />
                ) : (
                  <Select
                    value={single}
                    onValueChange={(v) => onChange({ ...value, value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="stage..." />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map((p) => (
                        <div key={p.name}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {p.name}
                          </div>
                          {p.stages.map((s) => (
                            <SelectItem
                              key={`${p.name}::${s}`}
                              value={s}
                              className="pl-4"
                            >
                              {s}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }

              // activeOrderStage fact (canonical kinds)
              if (value.fact === 'activeOrderStage') {
                return isMulti ? (
                  <MultiSelect
                    value={arr}
                    onChange={(next) => onChange({ ...value, value: next })}
                    options={[...ACTIVE_ORDER_STAGE_KINDS]}
                    placeholder="Selecciona kinds..."
                  />
                ) : (
                  <Select
                    value={single}
                    onValueChange={(v) => onChange({ ...value, value: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="kind..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTIVE_ORDER_STAGE_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }

              // Fallback: free-text input (for facts without dropdown options)
              return (
                <Input
                  value={valueToInput(value.value)}
                  placeholder="value (JSON, number, bool, string)"
                  onChange={(e) =>
                    onChange({ ...value, value: tryParseValue(e.target.value) })
                  }
                />
              )
            })()}
          </div>
        </div>
      </div>
    )
  }

  // ---------------- ALL ----------------
  if (isAll(value)) {
    return (
      <div
        className="rounded border border-blue-300 p-2 bg-blue-50/40 dark:bg-blue-950/20"
        style={indentStyle}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            ALL (AND)
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ all: [...value.all, emptyLeaf()] })}
          >
            + condicion
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ all: [...value.all, emptyAll()] })}
          >
            + grupo all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ all: [...value.all, { any: [] }] })}
          >
            + grupo any
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ all: [...value.all, { not: emptyLeaf() }] })}
          >
            + not
          </Button>
        </div>
        <div className="space-y-2">
          {value.all.map((child, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <div className="flex-1">
                <ConditionBuilder
                  value={child}
                  onChange={(v) => {
                    const next = [...value.all]
                    next[idx] = v
                    onChange({ all: next })
                  }}
                  facts={facts}
                  tags={tags}
                  pipelines={pipelines}
                  depth={depth + 1}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={() => {
                  const next = value.all.filter((_, i) => i !== idx)
                  onChange({ all: next })
                }}
              >
                X
              </Button>
            </div>
          ))}
          {value.all.length === 0 && (
            <p className="text-xs text-muted-foreground">Grupo vacio.</p>
          )}
        </div>
      </div>
    )
  }

  // ---------------- ANY ----------------
  if (isAny(value)) {
    return (
      <div
        className="rounded border border-amber-300 p-2 bg-amber-50/40 dark:bg-amber-950/20"
        style={indentStyle}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            ANY (OR)
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ any: [...value.any, emptyLeaf()] })}
          >
            + condicion
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ any: [...value.any, emptyAll()] })}
          >
            + grupo all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ any: [...value.any, { any: [] }] })}
          >
            + grupo any
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ any: [...value.any, { not: emptyLeaf() }] })}
          >
            + not
          </Button>
        </div>
        <div className="space-y-2">
          {value.any.map((child, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <div className="flex-1">
                <ConditionBuilder
                  value={child}
                  onChange={(v) => {
                    const next = [...value.any]
                    next[idx] = v
                    onChange({ any: next })
                  }}
                  facts={facts}
                  tags={tags}
                  pipelines={pipelines}
                  depth={depth + 1}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={() => {
                  const next = value.any.filter((_, i) => i !== idx)
                  onChange({ any: next })
                }}
              >
                X
              </Button>
            </div>
          ))}
          {value.any.length === 0 && (
            <p className="text-xs text-muted-foreground">Grupo vacio.</p>
          )}
        </div>
      </div>
    )
  }

  // ---------------- NOT ----------------
  if (isNot(value)) {
    return (
      <div
        className="rounded border border-red-300 p-2 bg-red-50/40 dark:bg-red-950/20"
        style={indentStyle}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-red-700">
            NOT
          </span>
        </div>
        <ConditionBuilder
          value={value.not}
          onChange={(v) => onChange({ not: v })}
          facts={facts}
          tags={tags}
          pipelines={pipelines}
          depth={depth + 1}
        />
      </div>
    )
  }

  // ---------------- FALLBACK ----------------
  return (
    <div className="text-xs text-red-600" style={indentStyle}>
      Forma desconocida en condition tree:{' '}
      <code>{JSON.stringify(value)}</code>
    </div>
  )
}
