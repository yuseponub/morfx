/**
 * Doctores por sede en orden de prioridad.
 * El agente consulta disponibilidad en este orden y retorna todos los slots encontrados.
 */
export const DOCTOR_PRIORITY: Record<string, string[]> = {
  'MEJORAS PUBLICAS': [
    'FRANCISCO ARRIETA JACANAMIJOY',
  ],
  'JUMBO EL BOSQUE': [
    'ANDRES FELIPE VALENCIA BENITEZ',
    'ANDRES RENE ESTUPINAN QUINTERO',
  ],
  'FLORIDABLANCA': [
    'ANDRES FELIPE LOBO SANTAMARIA',
    'ANDRES RENE ESTUPINAN QUINTERO',
  ],
  'CABECERA': [
    'NATALIA ANDREA VASQUEZ SALINAS',
    'SHARON CATALINA BARRERA MARQUEZ',
    'JANNET CARLOTA RODRIGUEZ GARNICA',
    'GLADYS ROCIO JAIMES ARENAS',
  ],
}
