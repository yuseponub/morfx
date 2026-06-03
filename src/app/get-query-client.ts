import { isServer, QueryClient } from '@tanstack/react-query'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, gcTime: 5 * 60_000 } },
  })
}

let browserQueryClient: QueryClient | undefined

/**
 * QueryClient singleton (Pitfall 6).
 * - Server: always a fresh client per request (no cross-request leakage).
 * - Browser: reuse a single client so the cache survives re-renders.
 */
export function getQueryClient() {
  if (isServer) return makeQueryClient()
  return (browserQueryClient ??= makeQueryClient())
}
