/**
 * GoDentist Appointment Agent — Constants
 *
 * Single source of truth. ZERO imports from other project files.
 * Prevents circular dependencies.
 */

// ============================================================================
// GoDentist Intents (23 total — only REAL client intents)
// ============================================================================

export const GD_INTENTS = [
  // Informational (11)
  'saludo',
  'precio_servicio',
  'valoracion_costo',
  'financiacion',
  'ubicacion',
  'horarios',
  'materiales',
  'menores',
  'seguros_eps',
  'urgencia',
  'garantia',

  // Client actions (6)
  'quiero_agendar',
  'datos',
  'seleccion_sede',
  'seleccion_horario',
  'confirmar',
  'rechazar',

  // Escape (4)
  'asesor',
  'reagendamiento',
  'queja',
  'cancelar_cita',

  // Acknowledgment (1)
  'acknowledgment',

  // Fallback (1)
  'otro',
] as const

// ============================================================================
// Intent Categories
// ============================================================================

export const ESCAPE_INTENTS: ReadonlySet<string> = new Set([
  'asesor',
  'reagendamiento',
  'queja',
  'cancelar_cita',
])

/** Intents that the response track always answers (informational questions). 11 total. */
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo',
  'precio_servicio',
  'valoracion_costo',
  'financiacion',
  'ubicacion',
  'horarios',
  'materiales',
  'menores',
  'seguros_eps',
  'urgencia',
  'garantia',
])

// ============================================================================
// Servicios (23 dental services)
// ============================================================================

export const SERVICIOS = [
  'corona',
  'protesis',
  'alineadores',
  'brackets_convencional',
  'brackets_zafiro',
  'autoligado_clasico',
  'autoligado_pro',
  'autoligado_ceramico',
  'implante',
  'blanqueamiento',
  'limpieza',
  'extraccion_simple',
  'extraccion_juicio',
  'diseno_sonrisa',
  'placa_ronquidos',
  'calza_resina',
  'rehabilitacion',
  'radiografia',
  'endodoncia',
  'carillas',
  'ortopedia_maxilar',
  'ortodoncia_general',
  'otro_servicio',
] as const

// ============================================================================
// Sedes
// ============================================================================

export const SEDES = [
  'cabecera',
  'mejoras_publicas',
  'floridablanca',
  'canaveral',
] as const

/** Aliases that map to canonical sede names */
export const SEDE_ALIASES: Record<string, string> = {
  'jumbo': 'canaveral',
  'bosque': 'canaveral',
  'cañaveral': 'canaveral',
  'centro': 'mejoras_publicas',
}

// ============================================================================
// Critical Fields
// ============================================================================

export const CRITICAL_FIELDS = ['nombre', 'telefono', 'sede_preferida'] as const

// ============================================================================
// Action → Template Mapping
// ============================================================================

/** Maps sales track accion to template intents */
export const ACTION_TEMPLATE_MAP: Record<string, string[]> = {
  pedir_datos: ['pedir_datos'],
  pedir_datos_con_sede: ['pedir_datos_con_sede'],
  pedir_datos_parcial: ['pedir_datos_parcial'],
  pedir_fecha: ['pedir_fecha'],
  mostrar_disponibilidad: ['mostrar_disponibilidad'],
  mostrar_confirmacion: ['confirmar_cita'],
  agendar_cita: ['cita_agendada'],
  invitar_agendar: ['invitar_agendar'],
  handoff: ['handoff'],
  no_interesa: ['no_interesa'],
  retoma_inicial: ['retoma_inicial'],
  retoma_datos: ['retoma_datos'],
  retoma_fecha: ['retoma_fecha'],
  retoma_horario: ['retoma_horario'],
  retoma_confirmacion: ['retoma_confirmacion'],
}

// ============================================================================
// State Machine Constants
// ============================================================================

export const SIGNIFICANT_ACTIONS: ReadonlySet<string> = new Set([
  'pedir_datos',
  'pedir_datos_con_sede',
  'pedir_datos_parcial',
  'pedir_fecha',
  'mostrar_disponibilidad',
  'mostrar_confirmacion',
  'agendar_cita',
  'handoff',
  'no_interesa',
])

/** Actions that schedule an appointment (for shouldScheduleAppointment checks) */
export const SCHEDULE_APPOINTMENT_ACTIONS: ReadonlySet<string> = new Set([
  'agendar_cita',
])

// ============================================================================
// Thresholds
// ============================================================================

export const LOW_CONFIDENCE_THRESHOLD = 80

// ============================================================================
// State Metadata Prefix
// ============================================================================

export const GD_META_PREFIX = '_gd:'

// ============================================================================
// GoDentist Timer Durations
// ============================================================================

/**
 * Timer durations per preset per level (in SECONDS).
 *
 * Levels:
 * 1 - Esperando datos basicos (L1: 3min)
 * 2 - Respondio info, invitar a agendar (L2: 2min)
 * 3 - Esperando fecha (L3: 2min)
 * 4 - Esperando seleccion de horario (L4: 2min)
 * 5 - Esperando confirmacion (L5: 3min)
 * 6 - Ack / silencio (L6: 90s)
 */
// ============================================================================
// Real Schedules per Sede (for 0-slot fallback)
// ============================================================================

export const HORARIOS_GENERALES_SEDE: Record<string, string> = {
  cabecera: 'Lunes a Viernes 8:00am-12:30pm y 1:30pm-6:30pm. Sabados 8:00am-5:00pm jornada continua',
  mejoras_publicas: 'Lunes a Viernes 8:30am-12:00pm y 2:00pm-6:30pm. Sabados 8:00am-12:00pm',
  floridablanca: 'Lunes a Viernes 8:00am-12:00pm y 2:00pm-6:00pm. Sabados 8:00am-12:00pm',
  canaveral: 'Lunes a Viernes 8:30am-12:00pm y 2:00pm-6:30pm. Sabados 8:00am-12:00pm',
}

// ============================================================================
// GoDentist Timer Durations
// ============================================================================

export const GD_TIMER_DURATIONS: Record<string, Record<number, number>> = {
  real:         { 0: 480, 1: 180, 2: 300, 3: 300, 4: 120, 5: 180, 6: 90 },
  rapido:       { 0:  60, 1:  30, 2:  30, 3:  30, 4:  20, 5:  30, 6:  9 },
  instantaneo:  { 0:   2, 1:   2, 2:   2, 3:   2, 4:   1, 5:   2, 6:  1 },
}
