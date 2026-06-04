/**
 * WhatsApp interactive message limits + pure validation helpers (D-05a).
 *
 * The COMPLETE Meta interactive limit set — enforces the checks the sender clamps
 * (meta-whatsapp-sender.ts `.slice`) silently miss: total-rows-across-all-sections <= 10
 * and id-uniqueness (RESEARCH Pitfall 1 + Pitfall 4). Front-runs the clamp with hard
 * errors so the composer blocks invalid payloads BEFORE the server action.
 *
 * PURE module — ZERO project imports (mirrors src/lib/domain/types.ts convention).
 * Spanish error strings are LOCKED by 999.1-UI-SPEC Copywriting Contract.
 */

export const INTERACTIVE_LIMITS = {
  body: 1024, header: 60, footer: 60,
  maxButtons: 3, buttonTitle: 20, buttonId: 256,
  listButtonLabel: 20, maxSections: 10, sectionTitle: 24,
  maxTotalRows: 10, rowTitle: 24, rowDescription: 72, rowId: 200,
} as const

export interface InteractiveValidationError { field: string; message: string }

export function validateButtons(p: { body: string; header?: string; footer?: string;
  buttons: { id: string; title: string }[] }): InteractiveValidationError[] {
  const errs: InteractiveValidationError[] = []
  if (!p.body.trim()) errs.push({ field: 'body', message: 'El cuerpo es obligatorio' })
  if (p.body.length > INTERACTIVE_LIMITS.body) errs.push({ field: 'body', message: `Máx ${INTERACTIVE_LIMITS.body} caracteres` })
  if ((p.header?.length ?? 0) > INTERACTIVE_LIMITS.header) errs.push({ field: 'header', message: `Máx ${INTERACTIVE_LIMITS.header}` })
  if ((p.footer?.length ?? 0) > INTERACTIVE_LIMITS.footer) errs.push({ field: 'footer', message: `Máx ${INTERACTIVE_LIMITS.footer}` })
  if (p.buttons.length < 1) errs.push({ field: 'buttons', message: 'Al menos 1 botón' })
  if (p.buttons.length > INTERACTIVE_LIMITS.maxButtons) errs.push({ field: 'buttons', message: `Máx ${INTERACTIVE_LIMITS.maxButtons} botones` })
  p.buttons.forEach((b, i) => {
    if (!b.title.trim()) errs.push({ field: `button.${i}`, message: 'Título obligatorio' })
    if (b.title.length > INTERACTIVE_LIMITS.buttonTitle) errs.push({ field: `button.${i}`, message: `Máx ${INTERACTIVE_LIMITS.buttonTitle}` })
  })
  const ids = p.buttons.map(b => b.id)
  if (new Set(ids).size !== ids.length) errs.push({ field: 'buttons', message: 'IDs de botón duplicados' })
  return errs
}

export function validateList(p: { body: string; header?: string; footer?: string; buttonLabel: string;
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[] }): InteractiveValidationError[] {
  const errs: InteractiveValidationError[] = []
  if (!p.body.trim()) errs.push({ field: 'body', message: 'El cuerpo es obligatorio' })
  if (p.body.length > INTERACTIVE_LIMITS.body) errs.push({ field: 'body', message: `Máx ${INTERACTIVE_LIMITS.body}` })
  if (!p.buttonLabel.trim()) errs.push({ field: 'buttonLabel', message: 'Etiqueta del botón obligatoria' })
  if (p.buttonLabel.length > INTERACTIVE_LIMITS.listButtonLabel) errs.push({ field: 'buttonLabel', message: `Máx ${INTERACTIVE_LIMITS.listButtonLabel}` })
  if (p.sections.length > INTERACTIVE_LIMITS.maxSections) errs.push({ field: 'sections', message: `Máx ${INTERACTIVE_LIMITS.maxSections} secciones` })
  const totalRows = p.sections.reduce((n, s) => n + s.rows.length, 0)
  if (totalRows < 1) errs.push({ field: 'sections', message: 'Al menos 1 fila' })
  if (totalRows > INTERACTIVE_LIMITS.maxTotalRows) errs.push({ field: 'sections', message: `Máx 10 filas en total` }) // ◄ Pitfall 1
  p.sections.forEach((s, si) => {
    if (s.title.length > INTERACTIVE_LIMITS.sectionTitle) errs.push({ field: `section.${si}`, message: `Título máx ${INTERACTIVE_LIMITS.sectionTitle}` })
    s.rows.forEach((r, ri) => {
      if (!r.title.trim()) errs.push({ field: `row.${si}.${ri}`, message: 'Título obligatorio' })
      if (r.title.length > INTERACTIVE_LIMITS.rowTitle) errs.push({ field: `row.${si}.${ri}`, message: `Máx ${INTERACTIVE_LIMITS.rowTitle}` })
      if ((r.description?.length ?? 0) > INTERACTIVE_LIMITS.rowDescription) errs.push({ field: `row.${si}.${ri}`, message: `Descripción máx ${INTERACTIVE_LIMITS.rowDescription}` })
    })
  })
  const allRowIds = p.sections.flatMap(s => s.rows.map(r => r.id))
  if (new Set(allRowIds).size !== allRowIds.length) errs.push({ field: 'rows', message: 'IDs de fila duplicados' })
  return errs
}
