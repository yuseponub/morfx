// ============================================================================
// Robot Coordinadora - Application Entry Point
// Starts the Express server on configurable port with graceful shutdown.
// ============================================================================

import { createServer } from './api/server.js'

const PORT = parseInt(process.env.PORT || '3001', 10)

const app = createServer()

app.listen(PORT, () => {
  console.log(`[Robot Coordinadora] Server running on port ${PORT}`)
  console.log(`[Robot Coordinadora] Health check: http://localhost:${PORT}/api/health`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Robot Coordinadora] SIGTERM received, shutting down...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[Robot Coordinadora] SIGINT received, shutting down...')
  process.exit(0)
})
