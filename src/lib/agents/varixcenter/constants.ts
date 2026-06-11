/**
 * Varixcenter Appointment Agent — Constants
 *
 * Single source of truth. ZERO imports from other project files.
 * Prevents circular dependencies.
 *
 * Clonado de src/lib/agents/godentist/constants.ts (Standalone agent-varixcenter Wave 1).
 * Cambios: 24 intents del diseño §1, CRITICAL_FIELDS=['nombre','telefono','cedula'] (D-05),
 * festivos clonados (Opción B desacople), sin servicios dentales ni sucursales.
 */

// ============================================================================
// Varixcenter Intents (24 total — diseño §1)
// ============================================================================

export const VARIX_INTENTS = [
  // Informacionales (12)
  'saludo',
  'precio_tratamiento',
  'precio_valoracion',
  'info_tratamiento',
  'info_laser',
  'info_examen_doppler',
  'info_medias',
  'ubicacion',
  'horarios',
  'financiacion',
  'seguros_eps',
  'sintomas_descripcion',

  // Acciones cliente (5)
  'quiero_agendar',
  'datos',
  'seleccion_horario',
  'confirmar',
  'rechazar',

  // Escape (5)
  'asesor',
  'reagendamiento',
  'cancelar_cita',
  'queja',
  'paciente_antiguo',

  // Otros (2)
  'acknowledgment',
  'otro',
] as const

// ============================================================================
// Intent Categories
// ============================================================================

/** Escape intents (diseño §1 Escape) → handoff a humano. 5 total. */
export const ESCAPE_INTENTS: ReadonlySet<string> = new Set([
  'asesor',
  'reagendamiento',
  'cancelar_cita',
  'queja',
  'paciente_antiguo',
])

/** Intents that the response track always answers (informational questions). 12 total. */
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo',
  'precio_tratamiento',
  'precio_valoracion',
  'info_tratamiento',
  'info_laser',
  'info_examen_doppler',
  'info_medias',
  'ubicacion',
  'horarios',
  'financiacion',
  'seguros_eps',
  'sintomas_descripcion',
])

// ============================================================================
// Critical Fields (D-05 — cedula, NO sucursal)
// ============================================================================

/**
 * CRÍTICO (D-05): los 3 campos requeridos para asignar el tag VAL y poder agendar.
 * Exportado para que el VAL guard del runner (Wave 3) lo importe en vez de hardcodear.
 * Difiere de otros agentes de agendamiento (que requieren sucursal) — Varixcenter usa 'cedula'.
 */
export const VARIX_CRITICAL_FIELDS = ['nombre', 'telefono', 'cedula'] as const

/** Alias usado por state.ts (gate datosCriticos). */
export const CRITICAL_FIELDS = VARIX_CRITICAL_FIELDS

/** Etiquetas legibles de los campos pedidos al cliente (camposFaltantes). */
export const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre completo',
  cedula: 'Número de cédula',
  telefono: 'Número de teléfono',
  fecha_preferida: 'Fecha preferida',
}

// ============================================================================
// Área metropolitana (es_foraneo — diseño §2, D-15 no bloquea)
// ============================================================================

/**
 * Ciudades del área metropolitana de Bucaramanga. Una ciudad fuera de este set
 * marca al paciente como `es_foraneo` (activa template `fuera_de_ciudad` como COMP,
 * NO bloquea agendamiento — D-15). Comparación case/acento-insensitive vía normalizeCity.
 */
export const AREA_METRO: ReadonlySet<string> = new Set([
  'bucaramanga',
  'floridablanca',
  'giron',
  'piedecuesta',
])

/** Normaliza una ciudad para comparación: minúsculas + sin acentos + trim. */
export function normalizeCity(ciudad: string): string {
  return ciudad
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * ¿La ciudad está fuera del área metropolitana? (es_foraneo derivado — diseño §2).
 * Si ciudad es null/empty retorna false (no sabemos -> no marcar foráneo). NO bloquea (D-15).
 */
export function isForaneo(ciudad: string | null): boolean {
  if (!ciudad || ciudad.trim() === '') return false
  return !AREA_METRO.has(normalizeCity(ciudad))
}

// ============================================================================
// Action → Template Mapping
// ============================================================================

/** Maps sales track accion to template intents (PLANTILLAS.md). */
export const ACTION_TEMPLATE_MAP: Record<string, string[]> = {
  pedir_datos: ['pedir_datos'],
  pedir_datos_parcial: ['pedir_datos'],
  pedir_fecha: ['pedir_fecha'],
  mostrar_disponibilidad: ['mostrar_disponibilidad'],
  mostrar_confirmacion: ['confirmar_cita'],
  agendar_cita: ['cita_agendada'],
  invitar_agendar: ['invitar_agendar'],
  handoff: ['handoff'],
  no_interesa: ['no_interesa'],
  retoma_datos: ['retoma_datos'],
  retoma_fecha: ['retoma_fecha'],
  retoma_horario: ['retoma_horario'],
  retoma_confirmacion: ['retoma_confirmacion'],
}

// ============================================================================
// State Machine Constants
// ============================================================================

/** Actions that derivePhase considers phase-changing (diseño §5/§7). */
export const SIGNIFICANT_ACTIONS: ReadonlySet<string> = new Set([
  'pedir_datos',
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

export const VARIX_META_PREFIX = '_vx:'

// ============================================================================
// Festivos Colombia 2026 (Ley 51 de 1983 + festivos trasladados a lunes)
// ============================================================================
//
// Opción B (RESEARCH §Don't Hand-Roll): clonamos el Set a varixcenter para
// mantener el agente desacoplado de godentist.

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
 *
 * CRÍTICO (Regla 2 — TZ-safe): la detección de domingo usa Date.UTC + getUTCDay(),
 * NUNCA new Date(fecha).getDay() (que aplicaría el offset local y movería el día).
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

// ============================================================================
// Varixcenter Timer Durations (diseño §6)
// ============================================================================
//
// Niveles (en SEGUNDOS):
// L1 - Esperando datos (nombre/cédula/teléfono)  → 3 min
// L2 - Respondió info, invitar a agendar          → 2 min
// L3 - Esperando fecha/jornada                    → 2 min
// L4 - Esperando selección de slot                → 2 min
// L5 - Esperando confirmación                     → 3 min
// L6 - Ack / silencio                             → 90 seg

export const VARIX_TIMER_DURATIONS: Record<number, number> = {
  1: 180,
  2: 120,
  3: 120,
  4: 120,
  5: 180,
  6: 90,
}
