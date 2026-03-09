/**
 * Legacy Timer Level Definitions
 *
 * Extracted from ingest-timer.ts (quick-013) for production agent-timers.ts.
 * The sandbox no longer uses these — it's now a pure countdown that sends
 * systemEvents to the pipeline. Production agent-timers.ts still needs
 * evaluate/buildAction until it's also migrated to the pipeline pattern.
 *
 * @deprecated Will be removed when production timers migrate to systemEvent pipeline
 */

import type { TimerEvalContext, TimerLevelConfig } from './types'
import { TIMER_MINIMUM_FIELDS } from '@/lib/agents/somnio/constants'

/**
 * All fields tracked by the timer system.
 * 8 fields = TIMER_MINIMUM_FIELDS + barrio, correo.
 */
export const TIMER_ALL_FIELDS = [
  ...TIMER_MINIMUM_FIELDS,
  'barrio',
  'correo',
] as const

/**
 * Human-readable labels for field names in Spanish.
 */
export const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre completo',
  apellido: 'Apellido',
  telefono: 'Numero de telefono',
  direccion: 'Direccion completa',
  ciudad: 'Ciudad o municipio',
  departamento: 'Departamento',
  barrio: 'Barrio',
  correo: 'Correo electronico',
}

/**
 * 5 timer levels evaluated in order 0-4. First match wins.
 */
export const TIMER_LEVELS: TimerLevelConfig[] = [
  {
    id: 0,
    name: 'Sin datos',
    defaultDurationS: 600,
    evaluate: (ctx: TimerEvalContext): boolean =>
      (ctx.currentMode === 'collecting_data' || ctx.currentMode === 'captura' || ctx.currentMode === 'captura_inter') && ctx.totalFields === 0,
    buildAction: () => ({
      type: 'send_message',
      message: 'Quedamos pendientes a tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla',
    }),
  },
  {
    id: 1,
    name: 'Datos parciales',
    defaultDurationS: 360,
    evaluate: (ctx: TimerEvalContext): boolean => {
      if (ctx.currentMode !== 'collecting_data' && ctx.currentMode !== 'captura' && ctx.currentMode !== 'captura_inter') return false
      if (ctx.totalFields === 0) return false
      const hasAllMinimum = TIMER_MINIMUM_FIELDS.every((f) => ctx.fieldsCollected.includes(f))
      return !hasAllMinimum
    },
    buildAction: (ctx: TimerEvalContext) => {
      const missing = TIMER_ALL_FIELDS.filter((f) => !ctx.fieldsCollected.includes(f))
        .map((f) => `- ${FIELD_LABELS[f]}`)
      return {
        type: 'send_message',
        message: `Para poder despachar tu producto nos faltaria:\n${missing.join('\n')}\nQuedamos pendientes`,
      }
    },
  },
  {
    id: 2,
    name: 'Datos minimos',
    defaultDurationS: 120,
    evaluate: (ctx: TimerEvalContext): boolean => {
      if (ctx.currentMode !== 'collecting_data' && ctx.currentMode !== 'captura' && ctx.currentMode !== 'captura_inter') return false
      return TIMER_MINIMUM_FIELDS.every((f) => ctx.fieldsCollected.includes(f))
    },
    buildAction: () => ({
      type: 'transition_mode',
      targetMode: 'ofrecer_promos',
    }),
  },
  {
    id: 3,
    name: 'Promos sin respuesta',
    defaultDurationS: 600,
    evaluate: (ctx: TimerEvalContext): boolean =>
      (ctx.currentMode === 'ofrecer_promos' || ctx.currentMode === 'promos') && !ctx.packSeleccionado,
    buildAction: () => ({
      type: 'create_order',
      message: 'Quedamos pendientes a la promocion que desees para poder despachar tu orden',
      orderConfig: { valor: 0 },
    }),
  },
  {
    id: 4,
    name: 'Pack sin confirmar',
    defaultDurationS: 600,
    evaluate: (ctx: TimerEvalContext): boolean =>
      (ctx.currentMode === 'resumen' || ctx.currentMode === 'confirmacion') && !!ctx.packSeleccionado,
    buildAction: (ctx: TimerEvalContext) => ({
      type: 'create_order',
      message: 'Quedamos pendientes a la confirmacion de tu compra para poder despachar tu orden',
      orderConfig: { valor: 0, pack: ctx.packSeleccionado ?? undefined },
    }),
  },
]
