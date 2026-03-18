---
phase: v3-tiempo-entrega
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260317200000_delivery_zones.sql
  - supabase/migrations/20260317200001_tiempo_entrega_templates.sql
autonomous: true

must_haves:
  truths:
    - "delivery_zones table exists with ~180 municipalities mapped to 4 zones"
    - "Templates exist for tiempo_entrega_sin_ciudad, tiempo_entrega_same_day, tiempo_entrega_next_day, tiempo_entrega_1_3_days, tiempo_entrega_2_4_days"
    - "Templates exist for confirmacion_orden_same_day and confirmacion_orden_transportadora (CORE + COMPLEMENTARIA each)"
    - "same_day municipalities have correct cutoff_hour values (14 for BGA metro, 9 for BOG)"
  artifacts:
    - path: "supabase/migrations/20260317200000_delivery_zones.sql"
      provides: "delivery_zones table + seed data"
      contains: "CREATE TABLE delivery_zones"
    - path: "supabase/migrations/20260317200001_tiempo_entrega_templates.sql"
      provides: "agent_templates for tiempo_entrega + personalized confirmacion_orden"
      contains: "tiempo_entrega"
  key_links:
    - from: "delivery_zones table"
      to: "dane_municipalities"
      via: "municipality names normalized same way"
      pattern: "municipality_name_normalized"
---

<objective>
Create the delivery_zones table with municipality-to-zone seed data and all agent_templates for tiempo_entrega responses + personalized confirmacion_orden variants.

Purpose: The database layer must exist before the agent code can look up zones or render templates.
Output: Two SQL migrations ready to be applied to production.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-tiempo-entrega/CONTEXT.md
@.planning/standalone/v3-tiempo-entrega/RESEARCH.md
@supabase/migrations/20260315150000_v3_independent_templates.sql
@supabase/migrations/20260222000000_dane_municipalities.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create delivery_zones table + seed data migration</name>
  <files>supabase/migrations/20260317200000_delivery_zones.sql</files>
  <action>
Create the delivery_zones table and seed it with municipality data for zones same_day, next_day, and 1_3_days. Municipalities NOT in this table default to 2_4_days (no row needed).

Table schema:
```sql
CREATE TABLE delivery_zones (
  id SERIAL PRIMARY KEY,
  municipality_name_normalized TEXT NOT NULL,
  department TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('same_day', 'next_day', '1_3_days')),
  cutoff_hour SMALLINT,  -- only for same_day: 14 = 2:30PM BGA, 9 = 9AM BOG. NULL for others
  cutoff_minutes SMALLINT DEFAULT 0,  -- 30 for BGA (2:30PM), 0 for BOG (9:00AM)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(municipality_name_normalized)
);
```

Normalization rule: ALL CAPS, no accents (NFD strip diacritics). Examples: BUCARAMANGA, BOGOTA, MEDELLIN, CUCUTA.

Seed data (use the RESEARCH.md lists verbatim):

**same_day (5 rows):**
- BUCARAMANGA (Santander, cutoff_hour=14, cutoff_minutes=30)
- GIRON (Santander, cutoff_hour=14, cutoff_minutes=30)
- PIEDECUESTA (Santander, cutoff_hour=14, cutoff_minutes=30)
- FLORIDABLANCA (Santander, cutoff_hour=14, cutoff_minutes=30)
- BOGOTA (Cundinamarca, cutoff_hour=9, cutoff_minutes=0)

**next_day (~25 rows):** All municipalities from RESEARCH.md "Zone: next_day" section:
- Medellin metro: MEDELLIN, BELLO, BARBOSA, COPACABANA, LA ESTRELLA, GIRARDOTA, ITAGUI, CALDAS, SABANETA, ENVIGADO
- Barranquilla metro: BARRANQUILLA, SOLEDAD, MALAMBO, PUERTO COLOMBIA, GALAPA
- Cali metro: CALI, JAMUNDI, YUMBO, PALMIRA, CANDELARIA
- Bogota Sabana: SOACHA, CHIA, CAJICA, ZIPAQUIRA, FACATATIVA, FUNZA, MOSQUERA, MADRID, COTA

**1_3_days (~100+ rows):** All municipalities from RESEARCH.md sections:
- 27 remaining departmental capitals (CUCUTA, PEREIRA, MANIZALES, IBAGUE, SANTA MARTA, VILLAVICENCIO, PASTO, MONTERIA, NEIVA, ARMENIA, POPAYAN, VALLEDUPAR, SINCELEJO, TUNJA, CARTAGENA, RIOHACHA, FLORENCIA, QUIBDO, YOPAL, ARAUCA, MOCOA, LETICIA, INIRIDA, SAN JOSE DEL GUAVIARE, MITU, PUERTO CARRENO, SAN ANDRES)
- Metro area members: Villa del Rosario, Los Patios, El Zulia, San Cayetano, Puerto Santander, Dosquebradas, La Virginia, Agustin Codazzi, La Paz, Manaure Balcon del Cesar, San Diego
- All ~45 ciudades intermedias from RESEARCH.md (Barrancabermeja, Tulua, Buga, Cartago, Turbo, Apartado, Sogamoso, Duitama, Girardot, Fusagasuga, Magangue, Aguachica, Ocana, Buenaventura, Tumaco, Lorica, Cerete, Sahagun, Cienaga, Fundacion, Maicao, Caucasia, Chigorodo, Carepa, Espinal, Honda, La Dorada, Pitalito, Garzon, Ipiales, Tuquerres, Chiquinquira, Pamplona, San Gil, Socorro, Marinilla, Rionegro, La Ceja, El Carmen de Viboral, Yarumal, Puerto Berrio, Acacias, Granada, Sabanalarga, Turbaco, Arjona, El Carmen de Bolivar, San Marcos, Corozal, Sampues, Cienaga de Oro)

ALL names normalized to UPPER CASE, no accents (e.g., CUCUTA not Cucuta, BOGOTA not Bogota).

Add index: `CREATE INDEX idx_delivery_zones_municipality ON delivery_zones(municipality_name_normalized);`

Do NOT include 2_4_days rows -- any city not found defaults to 2_4_days in the lookup function.
  </action>
  <verify>
Count rows: should be ~5 (same_day) + ~25 (next_day) + ~90 (1_3_days) = ~120+ total rows.
Verify unique constraint on municipality_name_normalized.
Verify cutoff_hour is only set for same_day rows.
Grep for zone values: only 'same_day', 'next_day', '1_3_days' should appear.
  </verify>
  <done>delivery_zones table migration exists with all municipality seed data, correct zones, cutoff hours, and index.</done>
</task>

<task type="auto">
  <name>Task 2: Create tiempo_entrega + personalized confirmacion_orden templates migration</name>
  <files>supabase/migrations/20260317200001_tiempo_entrega_templates.sql</files>
  <action>
Create a migration that inserts agent_templates for:

**1. tiempo_entrega response templates (5 intent variants):**

Intent `tiempo_entrega_sin_ciudad` (CORE, orden 0, delay 0):
- "En que municipio te encuentras? El tiempo de entrega depende de tu ubicacion 📍"

Intent `tiempo_entrega_same_day` (CORE, orden 0, delay 0):
- "Tu pedido estaria llegando a {{ciudad}} {{tiempo_estimado}} 🚀 Nuestro domiciliario se comunicara contigo para la entrega"

Intent `tiempo_entrega_next_day` (CORE, orden 0, delay 0):
- "Tu pedido estaria llegando a {{ciudad}} al dia siguiente de ser despachado 🚚"

Intent `tiempo_entrega_1_3_days` (CORE, orden 0, delay 0):
- "Tu pedido estaria llegando a {{ciudad}} en 1-3 dias habiles 🚚"

Intent `tiempo_entrega_2_4_days` (CORE, orden 0, delay 0):
- "Tu pedido estaria llegando a {{ciudad}} en 2-4 dias habiles 🚚"

All with: agent_id='somnio-sales-v3', workspace_id=NULL, visit_type='primera_vez', content_type='texto'.

**2. Personalized confirmacion_orden templates (replace current generic ones):**

First, DELETE the existing confirmacion_orden templates:
```sql
DELETE FROM agent_templates WHERE agent_id = 'somnio-sales-v3' AND intent = 'confirmacion_orden';
```

Then insert new variants:

Intent `confirmacion_orden_same_day` (2 templates):
- CORE (orden 0, delay 0): "Perfecto! Tu pedido llega {{tiempo_estimado}} ✅ Nuestro domiciliario se comunicara contigo para la entrega"
- COMPLEMENTARIA (orden 1, delay 3): "Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba ✅💴"

Intent `confirmacion_orden_transportadora` (2 templates):
- CORE (orden 0, delay 0): "Perfecto! Tu pedido estaria llegando en {{tiempo_estimado}} ✅ Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto"
- COMPLEMENTARIA (orden 1, delay 3): "Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba ✅💴"

All with agent_id='somnio-sales-v3', workspace_id=NULL, visit_type='primera_vez', content_type='texto'.

IMPORTANT: Use gen_random_uuid() for all IDs. Match the exact INSERT format from the existing migration 20260315150000_v3_independent_templates.sql.
  </action>
  <verify>
Count: 5 tiempo_entrega templates + 4 confirmacion_orden templates (2 same_day + 2 transportadora) = 9 total new inserts.
Verify the DELETE removes old confirmacion_orden rows.
Verify all templates use {{variable}} syntax where needed (ciudad, tiempo_estimado).
Verify delay_s values: 0 for CORE, 3 for COMPLEMENTARIA.
  </verify>
  <done>Templates migration exists with all 9 templates, old confirmacion_orden deleted and replaced with zone-personalized variants.</done>
</task>

</tasks>

<verification>
- Both migration files exist and have valid SQL syntax
- delivery_zones has ~120+ rows across 3 zones (same_day, next_day, 1_3_days)
- Templates cover all 5 tiempo_entrega variants + 2 confirmacion_orden variants (each with CORE + COMPLEMENTARIA)
- Cutoff hours correct: 14/30 for BGA metro, 9/0 for BOG
- All municipality names are UPPER CASE, no accents
</verification>

<success_criteria>
Two migration files ready to apply. delivery_zones table with ~120+ seeded municipalities. 9 new agent_templates. Old confirmacion_orden templates removed and replaced.
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-tiempo-entrega/01-SUMMARY.md`

IMPORTANT: After creating the migrations, PAUSE and ask the user to apply them in production BEFORE pushing any code that depends on them (Rule 5: Migration Before Deploy).
</output>
