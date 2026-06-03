'use server'

import { getRequestAuth } from '@/lib/auth/request-auth'
import { getOrder, getPipelines } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { getTagsForScope } from '@/app/actions/tags'
import { getOrderNotes } from '@/app/actions/order-notes'

/**
 * Capa 2 (D-06): UNA Server Action que reemplaza las 5 Server Actions que
 * view-order-sheet.tsx disparaba desde el cliente y que Next.js SERIALIZA
 * (la React Action queue procesa de a una, aun en paralelo del lado cliente).
 *
 * Aqui el agrupado SI paraleliza porque corre dentro de un solo proceso Node
 * (un solo request server-side, no la cola de Actions del cliente).
 *
 * Como las 5 actions ya usan getRequestAuth() (cacheado por request via React
 * cache() tras Plan 02), comparten UNA sola resolucion de auth dentro de este
 * unico request — el costo de auth se paga 1 vez aunque cada action lo invoque.
 *
 * Retorna null cuando no hay auth/workspace — el caller limpia como antes.
 */
export async function getOrderDetailBundle(orderId: string) {
  const auth = await getRequestAuth()
  if (!auth) return null

  const [order, pipelines, products, tags, notes] = await Promise.all([
    getOrder(orderId),
    getPipelines(),
    getActiveProducts(),
    getTagsForScope('orders'),
    getOrderNotes(orderId),
  ])
  return { order, pipelines, products, tags, notes }
}
