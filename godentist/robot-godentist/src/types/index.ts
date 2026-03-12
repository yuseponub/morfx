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
