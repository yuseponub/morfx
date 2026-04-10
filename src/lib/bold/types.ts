// ============================================================================
// BOLD Payment Link Types
// Config stored in integrations table (type='bold'), robot request/response
// ============================================================================

/** Credentials stored in integrations.config (type='bold') */
export interface BoldConfig {
  username: string
  password: string
}

/** Input for creating a payment link via the Railway robot */
export interface CreatePaymentLinkInput {
  username: string
  password: string
  amount: number
  description: string
}

/** Successful response from the robot */
export interface CreatePaymentLinkResponse {
  url: string
}

/** Error returned by the robot or network failure */
export interface BoldRobotError {
  error: string
  details?: string
}
