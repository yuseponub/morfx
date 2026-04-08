'use client'

/**
 * Expanded renderer for a single SQL query row in the turn timeline.
 *
 * Data source: `TurnDetail['queries'][number]` from the observability
 * repository — fields already camelCase-normalized. Shows the metadata
 * header (table / operation / status / rowCount / duration) plus the
 * three JSON sub-objects that Plan 03's fetch wrapper captures:
 *
 *   - `filters`     — parsed query-string predicates (`id=eq.1`)
 *   - `columns`     — raw `?select=...` string if present
 *   - `requestBody` — JSON body for INSERT/UPDATE/UPSERT/RPC
 *
 * Rendered inside an EventRow after the user clicks to expand; the
 * parent handles the collapsed summary. We render JSON via
 * `@uiw/react-json-view` with theme chosen from next-themes so dark
 * mode looks correct.
 */

import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { useTheme } from 'next-themes'
import type { TurnDetail } from '@/lib/observability/repository'

interface Props {
  query: TurnDetail['queries'][number]
}

export function QueryView({ query }: Props) {
  const { resolvedTheme } = useTheme()
  const jsonStyle = resolvedTheme === 'dark' ? darkTheme : lightTheme

  return (
    <div className="space-y-3 text-xs">
      {/* Header grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <span className="text-muted-foreground">Tabla: </span>
          <span className="font-mono">{query.tableName}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Operacion: </span>
          <span className="font-mono uppercase">{query.operation}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Status: </span>
          <span
            className={`font-mono ${
              query.statusCode >= 400 ? 'text-destructive' : ''
            }`}
          >
            {query.statusCode}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Filas: </span>
          <span className="font-mono">{query.rowCount ?? '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Duracion: </span>
          <span className="font-mono">{query.durationMs}ms</span>
        </div>
      </div>

      {query.error && (
        <div className="p-2 bg-destructive/10 text-destructive rounded">
          {query.error}
        </div>
      )}

      {query.columns && (
        <div>
          <div className="text-muted-foreground mb-1">Columnas</div>
          <div className="font-mono break-all bg-muted/30 rounded p-2">
            {query.columns}
          </div>
        </div>
      )}

      {query.filters && Object.keys(query.filters).length > 0 && (
        <div>
          <div className="text-muted-foreground mb-1">Filtros</div>
          <JsonView
            value={query.filters}
            collapsed={false}
            style={jsonStyle}
            displayDataTypes={false}
            enableClipboard
          />
        </div>
      )}

      {query.requestBody != null && (
        <div>
          <div className="text-muted-foreground mb-1">Request body</div>
          <JsonView
            value={query.requestBody as object}
            collapsed={2}
            style={jsonStyle}
            displayDataTypes={false}
            enableClipboard
          />
        </div>
      )}
    </div>
  )
}
