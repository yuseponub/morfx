# Stack Tecnológico MorfX

---

## Frontend

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Next.js | 14+ | Framework principal (App Router) |
| React | 18+ | UI library |
| TypeScript | 5+ | Type safety |
| Tailwind CSS | 3+ | Estilos |
| Shadcn/ui | latest | Componentes UI |
| Zustand / Jotai | latest | State management ligero |
| React Query | 5+ | Data fetching + cache |
| Socket.io-client | 4+ | Real-time updates |

---

## Backend

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Next.js API Routes | 14+ | API para MVP |
| tRPC / NestJS | - | API robusta (post-MVP) |
| PostgreSQL | 13+ | Base de datos principal |
| Prisma | 5+ | ORM |
| Zod | 3+ | Validación |
| NextAuth.js | 5+ | Autenticación |

---

## Infraestructura

| Servicio | Propósito | Costo Estimado |
|----------|-----------|----------------|
| Vercel | Hosting + CI/CD | $0-20/mes |
| Supabase | DB + Auth + Realtime | $0-25/mes |
| n8n (self-hosted) | Workflows | $0 (ya existe) |
| 360Dialog / Callbell | WhatsApp API | $50-150/mes |
| Resend | Emails transaccionales | $0-20/mes |
| Uploadthing | Manejo de archivos | $0-10/mes |

---

## Herramientas de Desarrollo AI

| Herramienta | Propósito | Costo |
|-------------|-----------|-------|
| v0 (Vercel) | Generación UI | $20/mes |
| Cursor Pro | Desarrollo iterativo | $20/mes |
| Claude Code | Integraciones + DevOps | $50-100/mes |

---

## Esquema de Base de Datos

### Tabla: contacts (CRM Core)

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  phone VARCHAR UNIQUE NOT NULL,
  first_name VARCHAR,
  last_name VARCHAR,
  email VARCHAR,
  tags TEXT[],
  custom_fields JSONB,
  whatsapp_contact_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: orders (Lifecycle tracking)

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  order_number VARCHAR UNIQUE,
  contact_id UUID REFERENCES contacts(id),
  stage VARCHAR,
  pipeline VARCHAR,
  amount DECIMAL,
  products JSONB,
  address JSONB,
  tracking_number VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: order_events (Audit log)

```sql
CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  event_type VARCHAR,
  previous_value JSONB,
  new_value JSONB,
  user_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: conversations (WhatsApp history)

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  channel VARCHAR,
  status VARCHAR,
  assigned_to VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP
);
```

### Tabla: messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  contact_id UUID REFERENCES contacts(id),
  role VARCHAR,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: workspaces (Multi-tenant)

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR,
  slug VARCHAR UNIQUE,
  plan VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: pipelines

```sql
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  name VARCHAR,
  is_default BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: stages

```sql
CREATE TABLE stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID REFERENCES pipelines(id),
  name VARCHAR,
  position INTEGER,
  color VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla: custom_fields

```sql
CREATE TABLE custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  entity_type VARCHAR,
  field_name VARCHAR,
  field_type VARCHAR,
  options JSONB,
  is_required BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Índices Recomendados

```sql
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_contact ON messages(contact_id, created_at DESC);
CREATE INDEX idx_orders_contact ON orders(contact_id);
CREATE INDEX idx_orders_stage ON orders(stage);
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
```

---

## Costos Estimados

### Herramientas de Desarrollo (mensual)

| Item | Costo |
|------|-------|
| Cursor Pro | $20 |
| Claude API | $50-100 |
| v0 (Vercel) | $20 |
| **Total** | **$90-140** |

### Infraestructura MVP (~100 usuarios)

| Item | Costo |
|------|-------|
| Vercel Pro | $0-20 |
| Supabase Pro | $0-25 |
| WhatsApp API | $50-150 |
| n8n | $0 |
| Resend | $0-20 |
| **Total** | **$50-215** |

### Escalamiento (1000+ usuarios)

| Item | Costo |
|------|-------|
| Supabase | $100-500 |
| Vercel | $50-200 |
| WhatsApp API | $200-1000 |
| **Total** | **$350-1700** |

---

*Documento parte del proyecto Modelo IA Distribuida*
