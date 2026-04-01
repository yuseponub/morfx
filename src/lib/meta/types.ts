// ============================================================================
// Meta Graph API Types
// Error handling, credential types, and channel definitions
// ============================================================================

// ----------------------------------------------------------------------------
// Raw Meta API error response shape
// ----------------------------------------------------------------------------

export interface MetaApiError {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
    type?: string
  }
}

// ----------------------------------------------------------------------------
// Typed error class with Meta error code helpers
// ----------------------------------------------------------------------------

export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly errorSubcode?: number,
    public readonly httpStatus?: number,
    public readonly fbtraceId?: string
  ) {
    super(message)
    this.name = 'MetaGraphApiError'
  }

  /** Auth token expired or invalid (OAuthException) */
  get isAuthError(): boolean {
    return this.httpStatus === 401 || this.code === 190
  }

  /** Rate limit exceeded (too many calls or message throughput) */
  get isRateLimitError(): boolean {
    return this.httpStatus === 429 || this.code === 4 || this.code === 80007
  }

  /** Missing permission for the requested operation */
  get isPermissionError(): boolean {
    return this.code === 10 || this.code === 200
  }
}

// ----------------------------------------------------------------------------
// Credential types
// ----------------------------------------------------------------------------

export interface MetaCredentials {
  accessToken: string
  wabaId: string | null
  phoneNumberId: string | null
  phoneNumber: string | null
  pageId: string | null
  igAccountId: string | null
  businessId: string | null
  workspaceId: string
}

export type MetaChannel = 'whatsapp' | 'facebook' | 'instagram'
