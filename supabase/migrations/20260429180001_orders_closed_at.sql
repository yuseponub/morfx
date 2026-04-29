-- Standalone crm-mutation-tools — Wave 0 (D-11 Resolution A).
-- Adds soft-close column for orders distinct from archived_at.
-- Semantics:
--   closed_at = pedido finalizado/entregado/cancelado por flujo de negocio (sigue visible en histórico)
--   archived_at = soft-delete (oculto del UI por defecto)
-- Both fields are independent. Tool closeOrder toggles closed_at; archiveOrder toggles archived_at.
-- Regla 2: timezone('America/Bogota', NOW()) for any default timestamp use.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL;

-- Partial index for Kanban filter ("show only open" filters WHERE closed_at IS NULL fast).
CREATE INDEX IF NOT EXISTS idx_orders_closed_at_not_null
  ON public.orders(closed_at)
  WHERE closed_at IS NOT NULL;

COMMENT ON COLUMN public.orders.closed_at IS
  'Pedido cerrado por flujo de negocio (entregado/cancelado). NULL = abierto. Independent of archived_at. Set via domain.closeOrder. Standalone crm-mutation-tools D-11.';
