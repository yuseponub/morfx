// ============================================================================
// /agentes/content-editor — Agent content editor (RSC entry).
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// Renders the client shell (agent selector + Templates/Conocimiento sub-tabs).
// All data fetching + mutations go through the Plan 05 server actions
// (src/app/actions/agent-content-editor.ts) — no admin DB client in the UI (Regla 3).
// ============================================================================

import { ContentEditorShell } from './_components/ContentEditorShell'

export default function ContentEditorPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Contenido del agente</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edita qué responde el agente (templates) y su base de conocimiento (KB).
          Solo <strong>somnio-sales-v4</strong> es editable; los demás agentes se
          muestran en modo lectura.
        </p>
      </div>

      <ContentEditorShell />
    </div>
  )
}
