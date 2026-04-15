-- Phase 042: Add email to orders for WhatsApp-created orders
-- Permite capturar correo electronico al crear pedido desde WhatsApp (seccion Envio del modal).
-- Tambien habilita que el correo se propague a contacts.email si el contacto no tenia uno (primera captura).
-- Nullable + additive -> zero impacto en codigo existente (Regla 6).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN orders.email IS 'Correo electronico del destinatario del pedido. Capturado al crear pedido desde WhatsApp. Opcional. Snapshot: puede diferir de contacts.email en el tiempo.';

-- Nota: NO se agrega indice por ahora (no hay query que filtre por orders.email).
-- Si en el futuro se necesita, agregar en migracion posterior:
--   CREATE INDEX idx_orders_email ON orders(workspace_id, email) WHERE email IS NOT NULL;
