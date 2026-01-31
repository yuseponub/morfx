# Esquema de Base de Datos MorfX

---

## Diagrama ER

```
┌─────────────────┐       ┌─────────────────┐
│   workspaces    │       │     users       │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ name            │       │ email           │
│ slug            │◄──────│ workspace_id(FK)│
│ plan            │       │ role            │
│ created_at      │       │ created_at      │
└────────┬────────┘       └─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐       ┌─────────────────┐
│    contacts     │       │   custom_fields │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ workspace_id(FK)│       │ workspace_id(FK)│
│ phone           │       │ entity_type     │
│ first_name      │       │ field_name      │
│ last_name       │       │ field_type      │
│ email           │       │ options         │
│ tags            │       │ is_required     │
│ custom_fields   │       └─────────────────┘
│ created_at      │
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐       ┌─────────────────┐
│ conversations   │       │    messages     │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ contact_id (FK) │◄──────│ conversation_id │
│ channel         │       │ contact_id (FK) │
│ status          │       │ role            │
│ assigned_to     │       │ content         │
│ last_message_at │       │ metadata        │
└─────────────────┘       │ created_at      │
         │                └─────────────────┘
         │ 1:N
         ▼
┌─────────────────┐       ┌─────────────────┐
│     orders      │       │  order_events   │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │◄──────│ order_id (FK)   │
│ contact_id (FK) │       │ event_type      │
│ workspace_id(FK)│       │ previous_value  │
│ order_number    │       │ new_value       │
│ stage           │       │ user_id         │
│ pipeline        │       │ created_at      │
│ amount          │       └─────────────────┘
│ products        │
│ address         │
│ tracking_number │
│ created_at      │
└─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│   pipelines     │       │     stages      │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │◄──────│ pipeline_id(FK) │
│ workspace_id(FK)│       │ name            │
│ name            │       │ position        │
│ is_default      │       │ color           │
│ created_at      │       │ created_at      │
└─────────────────┘       └─────────────────┘

┌─────────────────────────────────┐
│   successful_conversations      │
│   (Sistema Retroactivo)         │
├─────────────────────────────────┤
│ id (PK)                         │
│ phone                           │
│ messages (JSONB)                │
│ converted (boolean)             │
│ protocol_followed (boolean)     │
│ metadata (JSONB)                │
│ created_at                      │
└─────────────────────────────────┘
```

---

## Definiciones SQL

### Tabla: workspaces

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_workspaces_slug ON workspaces(slug);
```

### Tabla: users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'member',
  avatar_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_workspace ON users(workspace_id);
CREATE INDEX idx_users_email ON users(email);
```

### Tabla: contacts

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  whatsapp_contact_id VARCHAR(100),
  source VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(workspace_id, phone)
);

CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_contacts_email ON contacts(email);
```

### Tabla: conversations

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  channel VARCHAR(50) DEFAULT 'whatsapp',
  status VARCHAR(50) DEFAULT 'active',
  assigned_to UUID REFERENCES users(id),
  bot_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_assigned ON conversations(assigned_to);
```

### Tabla: messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_contact ON messages(contact_id, created_at DESC);
```

### Tabla: pipelines

```sql
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pipelines_workspace ON pipelines(workspace_id);
```

### Tabla: stages

```sql
CREATE TABLE stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  position INTEGER NOT NULL,
  color VARCHAR(20) DEFAULT '#3b82f6',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_stages_pipeline ON stages(pipeline_id, position);
```

### Tabla: orders

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  order_number VARCHAR(50) UNIQUE,
  stage_id UUID REFERENCES stages(id),
  pipeline_id UUID REFERENCES pipelines(id),
  amount DECIMAL(12, 2),
  products JSONB DEFAULT '[]',
  address JSONB DEFAULT '{}',
  tracking_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_workspace ON orders(workspace_id);
CREATE INDEX idx_orders_contact ON orders(contact_id);
CREATE INDEX idx_orders_stage ON orders(stage_id);
CREATE INDEX idx_orders_number ON orders(order_number);
```

### Tabla: order_events

```sql
CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_order_events_order ON order_events(order_id, created_at DESC);
```

### Tabla: custom_fields

```sql
CREATE TABLE custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(100) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  options JSONB DEFAULT '[]',
  is_required BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(workspace_id, entity_type, field_name)
);

CREATE INDEX idx_custom_fields_workspace ON custom_fields(workspace_id, entity_type);
```

### Tabla: successful_conversations (Sistema Retroactivo)

```sql
CREATE TABLE successful_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL,
  messages JSONB NOT NULL,
  converted BOOLEAN DEFAULT false,
  protocol_followed BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_successful_conversations_converted
ON successful_conversations(converted)
WHERE converted = true;

CREATE INDEX idx_successful_conversations_phone
ON successful_conversations(phone);
```

---

## Row Level Security (Supabase)

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;

-- Política: usuarios solo ven datos de su workspace
CREATE POLICY workspace_isolation ON contacts
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM users WHERE id = auth.uid()
    )
  );

-- Aplicar similar política a otras tablas...
```

---

## Triggers Útiles

### Auto-update updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Log order events automáticamente

```sql
CREATE OR REPLACE FUNCTION log_order_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO order_events (order_id, event_type, previous_value, new_value)
    VALUES (
      NEW.id,
      'stage_changed',
      jsonb_build_object('stage_id', OLD.stage_id),
      jsonb_build_object('stage_id', NEW.stage_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_stage_change
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_stage_change();
```

---

*Documento parte del proyecto Modelo IA Distribuida*
