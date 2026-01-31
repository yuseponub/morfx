/**
 * Colombian cities and municipalities dataset
 * Includes major cities and municipalities organized by department
 * Format suitable for autocomplete/select components
 */

export interface ColombiaCity {
  value: string // Unique identifier (lowercased, normalized)
  label: string // Display name
  department: string // Department name
}

/**
 * Colombian cities and municipalities
 * Sorted alphabetically by label
 * Source: Colombian administrative divisions
 */
export const colombiaCities: ColombiaCity[] = [
  // Amazonas
  { value: 'leticia', label: 'Leticia', department: 'Amazonas' },

  // Antioquia
  { value: 'apartado', label: 'Apartado', department: 'Antioquia' },
  { value: 'bello', label: 'Bello', department: 'Antioquia' },
  { value: 'caldas-antioquia', label: 'Caldas', department: 'Antioquia' },
  { value: 'caucasia', label: 'Caucasia', department: 'Antioquia' },
  { value: 'copacabana', label: 'Copacabana', department: 'Antioquia' },
  { value: 'envigado', label: 'Envigado', department: 'Antioquia' },
  { value: 'itagui', label: 'Itagui', department: 'Antioquia' },
  { value: 'la-ceja', label: 'La Ceja', department: 'Antioquia' },
  { value: 'la-estrella', label: 'La Estrella', department: 'Antioquia' },
  { value: 'marinilla', label: 'Marinilla', department: 'Antioquia' },
  { value: 'medellin', label: 'Medellin', department: 'Antioquia' },
  { value: 'rionegro', label: 'Rionegro', department: 'Antioquia' },
  { value: 'sabaneta', label: 'Sabaneta', department: 'Antioquia' },
  { value: 'turbo', label: 'Turbo', department: 'Antioquia' },

  // Arauca
  { value: 'arauca', label: 'Arauca', department: 'Arauca' },

  // Atlantico
  { value: 'barranquilla', label: 'Barranquilla', department: 'Atlantico' },
  { value: 'malambo', label: 'Malambo', department: 'Atlantico' },
  { value: 'puerto-colombia', label: 'Puerto Colombia', department: 'Atlantico' },
  { value: 'soledad', label: 'Soledad', department: 'Atlantico' },

  // Bogota D.C.
  { value: 'bogota', label: 'Bogota D.C.', department: 'Bogota D.C.' },

  // Bolivar
  { value: 'cartagena', label: 'Cartagena', department: 'Bolivar' },
  { value: 'magangue', label: 'Magangue', department: 'Bolivar' },
  { value: 'turbaco', label: 'Turbaco', department: 'Bolivar' },

  // Boyaca
  { value: 'chiquinquira', label: 'Chiquinquira', department: 'Boyaca' },
  { value: 'duitama', label: 'Duitama', department: 'Boyaca' },
  { value: 'sogamoso', label: 'Sogamoso', department: 'Boyaca' },
  { value: 'tunja', label: 'Tunja', department: 'Boyaca' },

  // Caldas
  { value: 'la-dorada', label: 'La Dorada', department: 'Caldas' },
  { value: 'manizales', label: 'Manizales', department: 'Caldas' },
  { value: 'villamaria', label: 'Villamaria', department: 'Caldas' },

  // Caqueta
  { value: 'florencia', label: 'Florencia', department: 'Caqueta' },

  // Casanare
  { value: 'yopal', label: 'Yopal', department: 'Casanare' },

  // Cauca
  { value: 'popayan', label: 'Popayan', department: 'Cauca' },
  { value: 'santander-de-quilichao', label: 'Santander de Quilichao', department: 'Cauca' },

  // Cesar
  { value: 'aguachica', label: 'Aguachica', department: 'Cesar' },
  { value: 'valledupar', label: 'Valledupar', department: 'Cesar' },

  // Choco
  { value: 'quibdo', label: 'Quibdo', department: 'Choco' },

  // Cordoba
  { value: 'cerete', label: 'Cerete', department: 'Cordoba' },
  { value: 'lorica', label: 'Lorica', department: 'Cordoba' },
  { value: 'monteria', label: 'Monteria', department: 'Cordoba' },
  { value: 'sahagun', label: 'Sahagun', department: 'Cordoba' },

  // Cundinamarca
  { value: 'chia', label: 'Chia', department: 'Cundinamarca' },
  { value: 'cota', label: 'Cota', department: 'Cundinamarca' },
  { value: 'facatativa', label: 'Facatativa', department: 'Cundinamarca' },
  { value: 'funza', label: 'Funza', department: 'Cundinamarca' },
  { value: 'fusagasuga', label: 'Fusagasuga', department: 'Cundinamarca' },
  { value: 'girardot', label: 'Girardot', department: 'Cundinamarca' },
  { value: 'la-calera', label: 'La Calera', department: 'Cundinamarca' },
  { value: 'madrid', label: 'Madrid', department: 'Cundinamarca' },
  { value: 'mosquera', label: 'Mosquera', department: 'Cundinamarca' },
  { value: 'soacha', label: 'Soacha', department: 'Cundinamarca' },
  { value: 'zipaquira', label: 'Zipaquira', department: 'Cundinamarca' },

  // Guainia
  { value: 'inirida', label: 'Inirida', department: 'Guainia' },

  // Guaviare
  { value: 'san-jose-del-guaviare', label: 'San Jose del Guaviare', department: 'Guaviare' },

  // Huila
  { value: 'garzon', label: 'Garzon', department: 'Huila' },
  { value: 'neiva', label: 'Neiva', department: 'Huila' },
  { value: 'pitalito', label: 'Pitalito', department: 'Huila' },

  // La Guajira
  { value: 'maicao', label: 'Maicao', department: 'La Guajira' },
  { value: 'riohacha', label: 'Riohacha', department: 'La Guajira' },

  // Magdalena
  { value: 'cienaga', label: 'Cienaga', department: 'Magdalena' },
  { value: 'santa-marta', label: 'Santa Marta', department: 'Magdalena' },

  // Meta
  { value: 'acacias', label: 'Acacias', department: 'Meta' },
  { value: 'granada-meta', label: 'Granada', department: 'Meta' },
  { value: 'villavicencio', label: 'Villavicencio', department: 'Meta' },

  // Narino
  { value: 'ipiales', label: 'Ipiales', department: 'Narino' },
  { value: 'pasto', label: 'Pasto', department: 'Narino' },
  { value: 'tumaco', label: 'Tumaco', department: 'Narino' },

  // Norte de Santander
  { value: 'cucuta', label: 'Cucuta', department: 'Norte de Santander' },
  { value: 'ocana', label: 'Ocana', department: 'Norte de Santander' },
  { value: 'pamplona', label: 'Pamplona', department: 'Norte de Santander' },

  // Putumayo
  { value: 'mocoa', label: 'Mocoa', department: 'Putumayo' },
  { value: 'puerto-asis', label: 'Puerto Asis', department: 'Putumayo' },

  // Quindio
  { value: 'armenia', label: 'Armenia', department: 'Quindio' },
  { value: 'calarca', label: 'Calarca', department: 'Quindio' },

  // Risaralda
  { value: 'dosquebradas', label: 'Dosquebradas', department: 'Risaralda' },
  { value: 'pereira', label: 'Pereira', department: 'Risaralda' },
  { value: 'santa-rosa-de-cabal', label: 'Santa Rosa de Cabal', department: 'Risaralda' },

  // San Andres y Providencia
  { value: 'san-andres', label: 'San Andres', department: 'San Andres y Providencia' },

  // Santander
  { value: 'barrancabermeja', label: 'Barrancabermeja', department: 'Santander' },
  { value: 'bucaramanga', label: 'Bucaramanga', department: 'Santander' },
  { value: 'floridablanca', label: 'Floridablanca', department: 'Santander' },
  { value: 'giron', label: 'Giron', department: 'Santander' },
  { value: 'piedecuesta', label: 'Piedecuesta', department: 'Santander' },
  { value: 'san-gil', label: 'San Gil', department: 'Santander' },

  // Sucre
  { value: 'corozal', label: 'Corozal', department: 'Sucre' },
  { value: 'sincelejo', label: 'Sincelejo', department: 'Sucre' },

  // Tolima
  { value: 'espinal', label: 'Espinal', department: 'Tolima' },
  { value: 'ibague', label: 'Ibague', department: 'Tolima' },

  // Valle del Cauca
  { value: 'buenaventura', label: 'Buenaventura', department: 'Valle del Cauca' },
  { value: 'buga', label: 'Buga', department: 'Valle del Cauca' },
  { value: 'cali', label: 'Cali', department: 'Valle del Cauca' },
  { value: 'cartago', label: 'Cartago', department: 'Valle del Cauca' },
  { value: 'jamundi', label: 'Jamundi', department: 'Valle del Cauca' },
  { value: 'palmira', label: 'Palmira', department: 'Valle del Cauca' },
  { value: 'tulua', label: 'Tulua', department: 'Valle del Cauca' },
  { value: 'yumbo', label: 'Yumbo', department: 'Valle del Cauca' },

  // Vaupes
  { value: 'mitu', label: 'Mitu', department: 'Vaupes' },

  // Vichada
  { value: 'puerto-carreno', label: 'Puerto Carreno', department: 'Vichada' },
].sort((a, b) => a.label.localeCompare(b.label, 'es'))

/**
 * Search cities by partial match on label or department
 *
 * @param query - Search query string
 * @param limit - Maximum number of results (default 10)
 * @returns Filtered cities matching the query
 */
export function searchCities(query: string, limit = 10): ColombiaCity[] {
  if (!query || query.length < 1) {
    return colombiaCities.slice(0, limit)
  }

  const normalized = query.toLowerCase().trim()

  return colombiaCities
    .filter(
      (city) =>
        city.label.toLowerCase().includes(normalized) ||
        city.department.toLowerCase().includes(normalized)
    )
    .slice(0, limit)
}

/**
 * Get a city by its value (slug)
 *
 * @param value - City value/slug
 * @returns City object or undefined
 */
export function getCityByValue(value: string): ColombiaCity | undefined {
  return colombiaCities.find((city) => city.value === value)
}

/**
 * Get all cities in a department
 *
 * @param department - Department name
 * @returns Cities in that department
 */
export function getCitiesByDepartment(department: string): ColombiaCity[] {
  return colombiaCities.filter(
    (city) => city.department.toLowerCase() === department.toLowerCase()
  )
}
