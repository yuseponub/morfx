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

export const HORARIOS_GENERALES_SEDE: Record<string, { manana: string; tarde: string; sabado_manana: string; sabado_tarde?: string }> = {
  cabecera: { manana: '8:00 AM - 12:30 PM', tarde: '1:30 PM - 6:30 PM', sabado_manana: '8:00 AM - 5:00 PM (jornada continua)' },
  mejoras_publicas: { manana: '8:30 AM - 12:00 PM', tarde: '2:00 PM - 6:30 PM', sabado_manana: '8:00 AM - 12:00 PM' },
  floridablanca: { manana: '8:00 AM - 12:00 PM', tarde: '2:00 PM - 6:00 PM', sabado_manana: '8:00 AM - 12:00 PM' },
  canaveral: { manana: '8:30 AM - 12:00 PM', tarde: '2:00 PM - 6:30 PM', sabado_manana: '8:00 AM - 12:00 PM' },
}

// ============================================================================
// GoDentist Timer Durations
// ============================================================================

// ============================================================================
// Festivos Colombia 2026 (Ley 51 de 1983 + festivos trasladados a lunes)
// ============================================================================

export const FESTIVOS_COLOMBIA_2026: ReadonlySet<string> = new Set([
  '2026-01-01', // Año Nuevo
  '2026-01-12', // Reyes Magos (trasladado)
  '2026-03-23', // San José (trasladado)
  '2026-04-02', // Jueves Santo
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Día del Trabajo
  '2026-05-18', // Ascensión del Señor (trasladado)
  '2026-06-08', // Corpus Christi (trasladado)
  '2026-06-15', // Sagrado Corazón (trasladado)
  '2026-06-29', // San Pedro y San Pablo (trasladado)
  '2026-07-20', // Independencia de Colombia
  '2026-08-07', // Batalla de Boyacá
  '2026-08-17', // Asunción de la Virgen (trasladado)
  '2026-10-12', // Día de la Raza (trasladado)
  '2026-11-02', // Todos los Santos (trasladado)
  '2026-11-16', // Independencia de Cartagena (trasladado)
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
])

/**
 * Check if a YYYY-MM-DD date is a Sunday or Colombian holiday.
 * Returns 'domingo' | 'festivo' | null.
 */
export function isNonWorkingDay(fecha: string): 'domingo' | 'festivo' | null {
  if (FESTIVOS_COLOMBIA_2026.has(fecha)) return 'festivo'
  try {
    const [y, m, d] = fecha.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    if (date.getUTCDay() === 0) return 'domingo'
  } catch { /* ignore */ }
  return null
}

export const GD_TIMER_DURATIONS: Record<string, Record<number, number>> = {
  real:         { 0: 480, 1: 180, 2: 300, 3: 300, 4: 360, 5: 180, 6: 90 },
  rapido:       { 0:  60, 1:  30, 2:  30, 3:  30, 4:  20, 5:  30, 6:  9 },
  instantaneo:  { 0:   2, 1:   2, 2:   2, 3:   2, 4:   1, 5:   2, 6:  1 },
}
