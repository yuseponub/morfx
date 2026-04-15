/**
 * Pipeline name (case-sensitive, exact match) where recompra orders MUST land.
 * Quick task 043 — restringe recompra a un unico pipeline destino conocido.
 *
 * Vive aqui (no en src/lib/domain/orders.ts) para poder importarse desde
 * Client Components sin arrastrar el admin client instrumentado (node:async_hooks).
 */
export const RECOMPRA_PIPELINE_NAME = 'Ventas Somnio Standard' as const
