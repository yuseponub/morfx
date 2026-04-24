-- Schema relevante para el módulo Pedidos (extraído de migraciones Supabase)
-- Solo CREATE TABLE: policies, triggers, indexes, funciones omitidos.

-- Source: supabase/migrations/20260129000003_orders_foundation.sql
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, name)
);

-- Source: supabase/migrations/20260129000003_orders_foundation.sql
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,  -- NULL = unlimited
  is_closed BOOLEAN DEFAULT false,  -- True for terminal stages like "Ganado", "Perdido"
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(pipeline_id, position)
);

-- Source: supabase/migrations/20260129000003_orders_foundation.sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE RESTRICT,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  total_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
  closing_date DATE,
  description TEXT,
  carrier TEXT,           -- Transportadora (Coordinadora, Interrapidisimo, etc.)
  tracking_number TEXT,   -- Numero de guia
  linked_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,  -- For linked returns
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Source: supabase/migrations/20260129000003_orders_foundation.sql
CREATE TABLE order_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,                -- Snapshot at order time
  title TEXT NOT NULL,              -- Snapshot at order time
  unit_price DECIMAL(12, 2) NOT NULL,  -- Snapshot at order time
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Source: supabase/migrations/20260129000003_orders_foundation.sql
CREATE TABLE order_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(order_id, tag_id)
);

-- Source: supabase/migrations/20260203000002_order_states.sql
CREATE TABLE order_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, position)
);

-- Source: supabase/migrations/20260225000000_order_notes.sql
CREATE TABLE order_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

-- Source: supabase/migrations/20260410000003_order_carrier_events.sql
CREATE TABLE order_carrier_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  guia TEXT NOT NULL,
  carrier TEXT NOT NULL DEFAULT 'envia',
  estado TEXT NOT NULL,
  cod_estado INTEGER NOT NULL,
  novedades JSONB DEFAULT '[]',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);
