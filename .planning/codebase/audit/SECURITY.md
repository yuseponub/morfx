# Security Audit Report - MorfX CRM

**Auditor:** Claude Sonnet 4.5
**Date:** 2026-02-09
**Scope:** Authentication, Authorization, Input Validation, API Security, Data Exposure, Webhook Security

---

## Executive Summary

This audit identified **11 security vulnerabilities** across Critical, High, Medium, and Low severity levels. The most significant concerns are:

1. **Critical:** Hardcoded secrets in `.env.local` file
2. **High:** Multiple server actions missing workspace isolation checks
3. **High:** WhatsApp webhook lacks HMAC signature verification
4. **High:** Sandbox API allows unauthenticated LIVE mode execution

---

## Critical Severity

### 1. Hardcoded Secrets in Repository

**File:** `.env.local`
**Lines:** 1-13
**Type:** Secret Exposure

**Vulnerability:**
The `.env.local` file contains production credentials:
- Supabase service role key (bypasses RLS)
- WhatsApp API key
- Webhook verification token
- Owner user ID

While `.gitignore` excludes `.env*` files, the file currently exists in the working directory and may have been committed historically.

**Exploit Scenario:**
1. If `.env.local` was ever committed to git, credentials are permanently in git history
2. Attacker with read access to repository can extract service role key
3. Service role key allows complete database access bypassing all RLS policies
4. WhatsApp API key allows sending messages on behalf of the business

**Recommended Fix:**
```bash
# Check git history
git log --all --full-history -- .env.local

# If found in history, rotate ALL secrets immediately:
# 1. Generate new Supabase service role key (Supabase dashboard)
# 2. Generate new WhatsApp API key (360dialog portal)
# 3. Update WHATSAPP_WEBHOOK_VERIFY_TOKEN
# 4. Update all environment variables in Vercel
# 5. Add to .gitignore (already done)
# 6. Use git-secrets or similar to prevent future commits
```

**Impact:** Complete compromise of application and database

---

## High Severity

### 2. WhatsApp Webhook Missing HMAC Verification

**File:** `src/app/api/webhooks/whatsapp/route.ts`
**Lines:** 47-90
**Type:** Authentication Bypass

**Vulnerability:**
The WhatsApp webhook POST handler does NOT verify HMAC signatures from 360dialog. It only validates:
- Object type is `whatsapp_business_account`
- Phone number ID exists

There is NO cryptographic signature verification to ensure the request actually came from 360dialog.

**Comparison with Shopify webhook:**
The Shopify webhook (line 26-75 in `src/app/api/webhooks/shopify/route.ts`) correctly implements HMAC verification using `verifyShopifyHmac()`.

**Exploit Scenario:**
1. Attacker discovers webhook URL (easy to guess: `/api/webhooks/whatsapp`)
2. Attacker crafts fake WhatsApp message payload
3. Webhook processes fake message as legitimate
4. Could inject spam, trigger agent responses, manipulate conversations
5. Could cause API usage charges through fake inbound messages

**Recommended Fix:**
```typescript
// In src/app/api/webhooks/whatsapp/route.ts

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Get raw body BEFORE parsing
  const rawBody = await request.text()

  // Get signature header from 360dialog
  const signature = request.headers.get('X-360Dialog-Signature')

  if (!signature) {
    console.warn('WhatsApp webhook missing signature')
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  // Verify signature using webhook secret
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET
  const isValid = verifyWhatsAppHmac(rawBody, signature, webhookSecret)

  if (!isValid) {
    console.warn('WhatsApp webhook invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // NOW parse payload
  const payload = JSON.parse(rawBody)

  // ... rest of processing
}

// Create src/lib/whatsapp/hmac.ts
import crypto from 'crypto'

export function verifyWhatsAppHmac(
  body: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body)
  const digest = hmac.digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  )
}
```

**Impact:** Message injection, conversation manipulation, billing fraud

---

### 3. Server Actions Missing Workspace Isolation

**Files:** Multiple server actions
**Type:** Broken Access Control (IDOR)

**Vulnerability:**
Several server actions verify authentication but do NOT verify workspace isolation, allowing users to access/modify resources from OTHER workspaces.

**Affected Actions:**

#### 3a. `src/app/actions/invitations.ts`

**Function:** `removeMember(workspaceId, memberId)`
**Lines:** 207-243

```typescript
export async function removeMember(workspaceId: string, memberId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // MISSING: Verify user has access to workspaceId
  // MISSING: Verify user is admin/owner of workspaceId

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', memberId)
    .eq('workspace_id', workspaceId) // Not enough! RLS doesn't prevent this
```

**Exploit:** User from workspace A can remove members from workspace B by guessing memberIds.

#### 3b. `src/app/actions/invitations.ts`

**Function:** `updateMemberRole(workspaceId, memberId, newRole)`
**Lines:** 245-281

Same issue - no verification that the authenticated user is an admin/owner of the target workspace.

#### 3c. `src/app/actions/invitations.ts`

**Function:** `cancelInvitation(invitationId)`
**Lines:** 101-121

```typescript
export async function cancelInvitation(invitationId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // MISSING: Verify invitation belongs to user's workspace

  const { error } = await supabase
    .from('workspace_invitations')
    .delete()
    .eq('id', invitationId)
```

**Exploit:** User can cancel invitations from any workspace by guessing invitation IDs.

**Recommended Fix Pattern:**
```typescript
export async function removeMember(workspaceId: string, memberId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // FIX: Verify user is admin/owner of this workspace
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'No tienes permisos' }
  }

  // Now proceed with deletion
  // ...
}
```

**Impact:** Cross-workspace data access and modification

---

### 4. Sandbox API Allows Unauthenticated LIVE Mode Execution

**File:** `src/app/api/sandbox/process/route.ts`
**Lines:** 26-70
**Type:** Missing Authentication + Privilege Escalation

**Vulnerability:**
The sandbox API endpoint has NO authentication check and allows LIVE mode CRM agent execution:

```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, state, history, turnNumber, crmAgents, workspaceId, forceIntent } = body

    // NO AUTH CHECK - anyone can call this
    // NO VALIDATION of workspaceId ownership
    // crmAgents can have mode: 'live' which makes REAL database changes

    const result = await engine.processMessage(
      message,
      state,
      history ?? [],
      turnNumber ?? 1,
      crmAgents, // User-supplied, can force LIVE mode
      workspaceId, // User-supplied, can be ANY workspace
      forceIntent
    )
```

**Exploit Scenario:**
1. Attacker discovers `/api/sandbox/process` endpoint
2. Attacker sends POST request with:
   ```json
   {
     "message": "Create order",
     "state": {...},
     "history": [],
     "turnNumber": 1,
     "crmAgents": [{"agentId": "crm-order", "mode": "live"}],
     "workspaceId": "victim-workspace-id"
   }
   ```
3. Request is processed without authentication
4. CRM agent in LIVE mode creates real database records
5. Attacker can inject spam orders, contacts, etc. into any workspace

**Recommended Fix:**
```typescript
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // REQUIRE authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { message, state, history, turnNumber, crmAgents, workspaceId, forceIntent } = body

    // VALIDATE workspace ownership
    if (workspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()

      if (!membership) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        )
      }
    }

    // RESTRICT LIVE mode to authenticated users only
    // Or consider removing LIVE mode from sandbox entirely

    const result = await engine.processMessage(...)
```

**Impact:** Unauthenticated database manipulation, data injection

---

### 5. Super Admin Check Uses Environment Variable Only

**File:** `src/app/actions/super-admin.ts`
**Lines:** 7-18
**Type:** Weak Authorization

**Vulnerability:**
Super admin verification only checks if user ID matches `MORFX_OWNER_USER_ID` environment variable:

```typescript
async function verifySuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const MORFX_OWNER_ID = process.env.MORFX_OWNER_USER_ID
  if (!user || user.id !== MORFX_OWNER_ID) {
    throw new Error('Unauthorized')
  }

  return user
}
```

This is hardcoded to a single user ID. If that user account is compromised, there's no secondary verification.

**Concerns:**
- No database-backed role system
- No audit logging of super admin actions
- No MFA requirement for super admin operations
- Single point of failure (one compromised account = full access)

**Recommended Fix:**
```typescript
// Add database table: super_admins
// Columns: user_id, granted_by, granted_at, requires_mfa, last_verified_at

async function verifySuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Check database for super admin status
  const adminClient = createAdminClient()
  const { data: admin } = await adminClient
    .from('super_admins')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!admin) {
    // Audit log the attempt
    await logSecurityEvent('super_admin_denied', { userId: user.id })
    throw new Error('Unauthorized')
  }

  // Require MFA verification for sensitive operations
  if (admin.requires_mfa) {
    // Verify MFA challenge was completed recently
    const mfaValid = await verifyRecentMFA(user.id)
    if (!mfaValid) {
      throw new Error('MFA verification required')
    }
  }

  // Audit log the access
  await logSecurityEvent('super_admin_access', {
    userId: user.id,
    action: 'verification'
  })

  return user
}
```

**Impact:** Single point of failure for administrative access

---

## Medium Severity

### 6. API Routes Missing Rate Limiting

**Files:**
- `src/app/api/sandbox/process/route.ts`
- `src/app/api/agents/somnio/route.ts`
- `src/app/api/v1/tools/[toolName]/route.ts`

**Type:** Resource Exhaustion / DoS

**Vulnerability:**
None of the API routes implement rate limiting. The tool execution API mentions rate limiting in error handling (line 152-167 in `src/app/api/v1/tools/[toolName]/route.ts`) but doesn't actually enforce it.

**Exploit Scenario:**
1. Attacker floods `/api/sandbox/process` with requests
2. Each request triggers Anthropic API calls (costs money)
3. Could exhaust API quotas or incur large bills
4. No per-IP or per-user limits

**Recommended Fix:**
```typescript
// Use Vercel Edge Config or Upstash Redis for rate limiting
import ratelimit from '@/lib/ratelimit'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'

  const { success } = await ratelimit.limit(ip)
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  // ... rest of handler
}
```

**Impact:** API abuse, billing attacks, service degradation

---

### 7. Inngest Endpoint Has No Authentication

**File:** `src/app/api/inngest/route.ts`
**Lines:** 14-31
**Type:** Missing Authentication

**Vulnerability:**
The Inngest webhook endpoint is publicly accessible:

```typescript
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...agentTimerFunctions,
  ],
})
```

While Inngest SDK may handle signature verification internally, this should be explicitly validated to prevent replay attacks or unauthorized function invocation.

**Recommended Fix:**
```typescript
// Verify Inngest has signature verification enabled
// Check Inngest documentation for webhook signature headers
// Add explicit verification:

import { verifyInngestSignature } from '@/lib/inngest/security'

export async function POST(request: Request) {
  const signature = request.headers.get('X-Inngest-Signature')
  const body = await request.text()

  if (!verifyInngestSignature(body, signature)) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Pass to Inngest serve handler
}
```

**Impact:** Unauthorized background job execution

---

### 8. No Input Sanitization on User-Generated Content

**Files:** Multiple (messages, templates, contacts)
**Type:** Potential XSS

**Vulnerability:**
User-generated content (message text, contact names, notes) is stored without sanitization. While no `dangerouslySetInnerHTML` usage was found, content is likely rendered in React components.

**Example:** `src/app/actions/messages.ts` line 97-150

```typescript
export async function sendMessage(
  conversationId: string,
  text: string // No sanitization
): Promise<ActionResult<{ messageId: string }>> {
  // ... stores directly in database
}
```

**Risk Areas:**
- Message content with `<script>` tags
- Contact names with JavaScript payloads
- Template content with embedded HTML

**Recommended Fix:**
```typescript
import DOMPurify from 'isomorphic-dompurify'

export async function sendMessage(
  conversationId: string,
  text: string
): Promise<ActionResult<{ messageId: string }>> {
  // Sanitize before storage
  const sanitizedText = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [], // Plain text only
    ALLOWED_ATTR: []
  })

  // ... use sanitizedText
}
```

**Alternative:** Use React's built-in XSS protection (it escapes by default) and avoid innerHTML/dangerouslySetInnerHTML.

**Impact:** Cross-site scripting (XSS) if content rendered unsafely

---

### 9. Workspace ID Extracted from Cookie Without Validation

**File:** Multiple server actions (products.ts, orders.ts, contacts.ts)
**Type:** Trust Boundary Violation

**Vulnerability:**
Many server actions extract `workspace_id` from cookies without verifying the user has access:

**Example:** `src/app/actions/products.ts` lines 45-49

```typescript
const cookieStore = await cookies()
const workspaceId = cookieStore.get('morfx_workspace')?.value
if (!workspaceId) {
  return []
}

// Uses workspaceId directly without verifying user membership
const { data: products, error } = await supabase
  .from('products')
  .select('*')
  .eq('workspace_id', workspaceId)
```

**Issue:**
- Cookies are client-controlled
- Attacker can modify `morfx_workspace` cookie to any workspace ID
- While RLS should prevent access, relying solely on RLS is risky

**Recommended Fix:**
```typescript
// Always verify workspace membership first
const cookieStore = await cookies()
const workspaceId = cookieStore.get('morfx_workspace')?.value

if (workspaceId) {
  // Verify user is actually a member
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    // User not a member - clear invalid cookie
    cookieStore.delete('morfx_workspace')
    return []
  }
}
```

**Impact:** Potential access control bypass if RLS misconfigured

---

## Low Severity

### 10. Overly Permissive CORS (Potential)

**Files:** API routes
**Type:** Configuration Issue

**Observation:**
No explicit CORS configuration was found in API routes. Next.js default CORS may be too permissive.

**Recommended Fix:**
Add explicit CORS headers to API routes:

```typescript
// In each API route
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://yourapp.vercel.app'
  ]

  const headers = allowedOrigins.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin }
    : {}

  // ... handle request

  return NextResponse.json(data, { headers })
}
```

**Impact:** Minimal (Next.js handles CORS by default)

---

### 11. Sensitive Data in Error Messages

**Files:** Multiple
**Type:** Information Disclosure

**Vulnerability:**
Some error messages may leak implementation details:

**Example:** `src/app/api/agents/somnio/route.ts` line 195

```typescript
return errorResponse(
  'Internal server error',
  'INTERNAL_ERROR',
  500,
  process.env.NODE_ENV === 'development' ? errorMessage : undefined
)
```

**Issue:** In development mode, full error messages are returned (good for debugging). Ensure production mode doesn't leak stack traces or database errors.

**Recommended Fix:**
```typescript
// Use structured logging instead of returning details
logger.error({ error: errorMessage, stack: error.stack })

return errorResponse(
  'Internal server error',
  'INTERNAL_ERROR',
  500,
  undefined // Never return error details in production
)
```

**Impact:** Information leakage aids further attacks

---

## Positive Security Findings

The following security practices were implemented well:

✅ **Supabase RLS:** Row-Level Security policies are in place (though not audited in detail)
✅ **Shopify HMAC Verification:** Properly implemented with timing-safe comparison
✅ **API Key Hashing:** SHA-256 used for API keys (appropriate for random keys)
✅ **Input Validation:** Zod schemas used for structured validation
✅ **No SQL Injection:** Parameterized queries via Supabase client (no raw SQL found)
✅ **Authentication:** Most server actions check `getUser()` before proceeding
✅ **Deduplication:** WhatsApp message deduplication via WAMID unique constraint

---

## Summary of Findings by Severity

| Severity | Count | Findings |
|----------|-------|----------|
| **Critical** | 1 | Hardcoded secrets in .env.local |
| **High** | 4 | WhatsApp webhook missing HMAC, Server actions missing workspace isolation (3 instances), Sandbox LIVE mode unauthenticated |
| **Medium** | 4 | API rate limiting, Inngest auth, Input sanitization, Cookie validation |
| **Low** | 2 | CORS configuration, Error message leakage |
| **Total** | 11 | |

---

## Remediation Priority

### Immediate (Critical)

1. **Check git history for .env.local** - If found, rotate ALL secrets
2. **Add HMAC verification to WhatsApp webhook** - Prevent message injection
3. **Add authentication to sandbox API** - Prevent LIVE mode abuse

### High Priority (1-2 weeks)

4. **Fix workspace isolation in server actions** - Prevent IDOR attacks
5. **Improve super admin verification** - Add MFA, audit logging
6. **Implement API rate limiting** - Prevent abuse and billing attacks

### Medium Priority (1 month)

7. **Verify Inngest authentication** - Ensure webhook signatures validated
8. **Add input sanitization** - Defense-in-depth against XSS
9. **Validate workspace cookie** - Don't trust client-provided workspace ID

### Low Priority (Ongoing)

10. **Review CORS configuration** - Ensure allowlist is minimal
11. **Review error messages** - Ensure no info leakage in production

---

## Testing Recommendations

1. **Penetration Testing:** Hire external security firm for comprehensive pentest
2. **Automated Scanning:** Use OWASP ZAP or Burp Suite for automated vulnerability scanning
3. **Dependency Scanning:** Use `npm audit` and Snyk for dependency vulnerabilities
4. **Secret Scanning:** Use git-secrets or GitHub secret scanning
5. **Security Headers:** Use securityheaders.com to audit HTTP headers

---

## Additional Recommendations

### General Security Posture

1. **Implement Security Headers:**
   ```typescript
   // In next.config.js
   headers: [
     {
       source: '/(.*)',
       headers: [
         { key: 'X-Frame-Options', value: 'DENY' },
         { key: 'X-Content-Type-Options', value: 'nosniff' },
         { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
         { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' }
       ]
     }
   ]
   ```

2. **Add Security Audit Logging:**
   - Log all super admin actions
   - Log failed authentication attempts
   - Log workspace access changes
   - Retain logs for compliance (6-12 months)

3. **Implement CSP (Content Security Policy):**
   ```typescript
   {
     key: 'Content-Security-Policy',
     value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
   }
   ```

4. **Environment Variable Validation:**
   ```typescript
   // In instrumentation.ts or startup file
   const requiredEnvVars = [
     'NEXT_PUBLIC_SUPABASE_URL',
     'SUPABASE_SERVICE_ROLE_KEY',
     'WHATSAPP_API_KEY',
     'ANTHROPIC_API_KEY'
   ]

   for (const envVar of requiredEnvVars) {
     if (!process.env[envVar]) {
       throw new Error(`Missing required environment variable: ${envVar}`)
     }
   }
   ```

5. **Regular Security Updates:**
   - Run `npm audit fix` weekly
   - Update dependencies monthly
   - Monitor security advisories for Next.js, React, Supabase

---

## Conclusion

The MorfX codebase demonstrates good security awareness in many areas (RLS, parameterized queries, authentication checks). However, several critical gaps exist:

- **Authentication/authorization bypasses** in sandbox and webhook endpoints
- **Workspace isolation failures** allowing cross-tenant data access
- **Secret management** needs immediate attention

Addressing the Critical and High severity findings should be prioritized to prevent potential data breaches and abuse.

**Estimated Remediation Effort:** 40-60 engineering hours

**Re-audit Recommended:** After remediation of Critical/High findings

---

*End of Security Audit Report*
