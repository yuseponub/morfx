/**
 * Next.js Instrumentation Hook
 *
 * This file is automatically loaded by Next.js on server startup.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use this to initialize the Tool Registry once at startup,
 * rather than lazy-loading on first request.
 */

export async function register() {
  // Only run on server (not edge runtime for middleware)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import to avoid issues with client bundles
    const { initializeTools } = await import('@/lib/tools/init')

    console.log('[instrumentation] Initializing tool registry...')
    initializeTools()
    console.log('[instrumentation] Tool registry initialized')
  }
}
