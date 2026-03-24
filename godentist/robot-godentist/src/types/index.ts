// ── Credentials ──
export interface Credentials {
  username: string
  password: string
}

// ── Appointment data scraped from the portal ──
export interface Appointment {
  nombre: string
  telefono: string
  hora: string
  sucursal: string
  estado: string
}

// ── Request / Response contracts ──
export interface ScrapeAppointmentsRequest {
  workspaceId: string
  credentials: Credentials
  sucursales?: string[]  // Filter: only scrape these sucursales (if omitted, scrape all)
  targetDate?: string    // YYYY-MM-DD format: scrape this specific date (if omitted, next working day)
}

export interface ScrapeAppointmentsResponse {
  success: boolean
  date: string            // YYYY-MM-DD of the scraped day
  totalAppointments: number
  appointments: Appointment[]
  errors?: string[]
}

export interface HealthResponse {
  status: 'ok'
  uptime: number
  timestamp: string
}

// ── Confirm Appointment ──
export interface ConfirmAppointmentRequest {
  workspaceId: string
  credentials: Credentials
  patientName: string    // Full name to search in grid (case-insensitive match)
  date: string           // DD-MM-YYYY format for the date filter
  sucursal: string       // Sucursal name to select in combo
}

export interface ConfirmAppointmentResponse {
  success: boolean
  patientName: string
  previousEstado?: string
  newEstado?: string
  error?: string
  screenshots: string[]  // List of screenshot filenames taken during process
}

// ── Check Availability ──
export interface CheckAvailabilityRequest {
  workspaceId: string
  credentials: Credentials
  date: string        // YYYY-MM-DD — fecha que busca el cliente
  sucursal: string    // Nombre de la sucursal (CABECERA, FLORIDABLANCA, etc.)
}

export interface AvailabilitySlot {
  doctor: string          // Nombre del doctor
  horaInicio: string      // "8:00 AM"
  horaFin: string         // "12:00 PM"
  jornada: 'manana' | 'tarde'  // Antes de 12pm = mañana, después = tarde
}

export interface CheckAvailabilityResponse {
  success: boolean
  date: string        // YYYY-MM-DD
  sucursal: string
  slots: AvailabilitySlot[]
  summary: {
    manana: string[]   // ["8:00 AM - 12:00 PM (Dr. Vasquez)"]
    tarde: string[]    // ["2:00 PM - 6:00 PM (Dr. Barrera)"]
  }
  errors?: string[]
  screenshots: string[]
}
