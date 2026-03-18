-- ============================================================================
-- Delivery Zones Table
-- Maps municipalities to delivery time zones for Somnio agent responses.
-- Municipalities NOT in this table default to '2_4_days' in application code.
-- ============================================================================

-- 1. Create table (global reference, NO workspace_id, NO RLS)
CREATE TABLE delivery_zones (
  id SERIAL PRIMARY KEY,
  municipality_name_normalized TEXT NOT NULL,
  department TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('same_day', 'next_day', '1_3_days')),
  cutoff_hour SMALLINT,        -- only for same_day: 14 = 2:30PM BGA, 9 = 9AM BOG. NULL for others
  cutoff_minutes SMALLINT DEFAULT 0,  -- 30 for BGA (2:30PM), 0 for BOG (9:00AM)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(municipality_name_normalized)
);

-- 2. Index for fast lookup
CREATE INDEX idx_delivery_zones_municipality ON delivery_zones(municipality_name_normalized);

-- 3. Permissions (NO RLS since global reference)
GRANT SELECT ON delivery_zones TO authenticated;
GRANT SELECT ON delivery_zones TO service_role;
GRANT USAGE, SELECT ON SEQUENCE delivery_zones_id_seq TO authenticated, service_role;

-- 4. Seed data
-- ALL names normalized to UPPER CASE, no accents (NFD strip diacritics).

INSERT INTO delivery_zones (municipality_name_normalized, department, zone, cutoff_hour, cutoff_minutes) VALUES

  -- =========================================================================
  -- ZONE: same_day (5 rows)
  -- BGA metro: cutoff 14:30 (2:30PM), BOG: cutoff 9:00 (9AM)
  -- =========================================================================
  ('BUCARAMANGA', 'SANTANDER', 'same_day', 14, 30),
  ('GIRON', 'SANTANDER', 'same_day', 14, 30),
  ('PIEDECUESTA', 'SANTANDER', 'same_day', 14, 30),
  ('FLORIDABLANCA', 'SANTANDER', 'same_day', 14, 30),
  ('BOGOTA', 'CUNDINAMARCA', 'same_day', 9, 0),

  -- =========================================================================
  -- ZONE: next_day (~29 rows)
  -- Big 4 metros + Bogota Sabana
  -- =========================================================================

  -- Medellin metro (10)
  ('MEDELLIN', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('BELLO', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('BARBOSA', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('COPACABANA', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('LA ESTRELLA', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('GIRARDOTA', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('ITAGUI', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('CALDAS', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('SABANETA', 'ANTIOQUIA', 'next_day', NULL, 0),
  ('ENVIGADO', 'ANTIOQUIA', 'next_day', NULL, 0),

  -- Barranquilla metro (5)
  ('BARRANQUILLA', 'ATLANTICO', 'next_day', NULL, 0),
  ('SOLEDAD', 'ATLANTICO', 'next_day', NULL, 0),
  ('MALAMBO', 'ATLANTICO', 'next_day', NULL, 0),
  ('PUERTO COLOMBIA', 'ATLANTICO', 'next_day', NULL, 0),
  ('GALAPA', 'ATLANTICO', 'next_day', NULL, 0),

  -- Cali metro (5)
  ('CALI', 'VALLE DEL CAUCA', 'next_day', NULL, 0),
  ('JAMUNDI', 'VALLE DEL CAUCA', 'next_day', NULL, 0),
  ('YUMBO', 'VALLE DEL CAUCA', 'next_day', NULL, 0),
  ('PALMIRA', 'VALLE DEL CAUCA', 'next_day', NULL, 0),
  ('CANDELARIA', 'VALLE DEL CAUCA', 'next_day', NULL, 0),

  -- Bogota Sabana (9)
  ('SOACHA', 'CUNDINAMARCA', 'next_day', NULL, 0),
  ('CHIA', 'CUNDINAMARCA', 'next_day', NULL, 0),
  ('CAJICA', 'CUNDINAMARCA', 'next_day', NULL, 0),
  ('ZIPAQUIRA', 'CUNDINAMARCA', 'next_day', NULL, 0),
  ('FACATATIVA', 'CUNDINAMARCA', 'next_day', NULL, 0),
  ('FUNZA', 'CUNDINAMARCA', 'next_day', NULL, 0),
  ('MOSQUERA', 'CUNDINAMARCA', 'next_day', NULL, 0),
  ('MADRID', 'CUNDINAMARCA', 'next_day', NULL, 0),
  ('COTA', 'CUNDINAMARCA', 'next_day', NULL, 0),

  -- =========================================================================
  -- ZONE: 1_3_days (~93 rows)
  -- Departmental capitals + metropolitan areas + ciudades intermedias
  -- =========================================================================

  -- Departmental capitals (27)
  ('CUCUTA', 'NORTE DE SANTANDER', '1_3_days', NULL, 0),
  ('PEREIRA', 'RISARALDA', '1_3_days', NULL, 0),
  ('MANIZALES', 'CALDAS', '1_3_days', NULL, 0),
  ('IBAGUE', 'TOLIMA', '1_3_days', NULL, 0),
  ('SANTA MARTA', 'MAGDALENA', '1_3_days', NULL, 0),
  ('VILLAVICENCIO', 'META', '1_3_days', NULL, 0),
  ('PASTO', 'NARINO', '1_3_days', NULL, 0),
  ('MONTERIA', 'CORDOBA', '1_3_days', NULL, 0),
  ('NEIVA', 'HUILA', '1_3_days', NULL, 0),
  ('ARMENIA', 'QUINDIO', '1_3_days', NULL, 0),
  ('POPAYAN', 'CAUCA', '1_3_days', NULL, 0),
  ('VALLEDUPAR', 'CESAR', '1_3_days', NULL, 0),
  ('SINCELEJO', 'SUCRE', '1_3_days', NULL, 0),
  ('TUNJA', 'BOYACA', '1_3_days', NULL, 0),
  ('CARTAGENA', 'BOLIVAR', '1_3_days', NULL, 0),
  ('RIOHACHA', 'LA GUAJIRA', '1_3_days', NULL, 0),
  ('FLORENCIA', 'CAQUETA', '1_3_days', NULL, 0),
  ('QUIBDO', 'CHOCO', '1_3_days', NULL, 0),
  ('YOPAL', 'CASANARE', '1_3_days', NULL, 0),
  ('ARAUCA', 'ARAUCA', '1_3_days', NULL, 0),
  ('MOCOA', 'PUTUMAYO', '1_3_days', NULL, 0),
  ('LETICIA', 'AMAZONAS', '1_3_days', NULL, 0),
  ('INIRIDA', 'GUAINIA', '1_3_days', NULL, 0),
  ('SAN JOSE DEL GUAVIARE', 'GUAVIARE', '1_3_days', NULL, 0),
  ('MITU', 'VAUPES', '1_3_days', NULL, 0),
  ('PUERTO CARRENO', 'VICHADA', '1_3_days', NULL, 0),
  ('SAN ANDRES', 'SAN ANDRES', '1_3_days', NULL, 0),

  -- Metropolitan area members (11)
  ('VILLA DEL ROSARIO', 'NORTE DE SANTANDER', '1_3_days', NULL, 0),
  ('LOS PATIOS', 'NORTE DE SANTANDER', '1_3_days', NULL, 0),
  ('EL ZULIA', 'NORTE DE SANTANDER', '1_3_days', NULL, 0),
  ('SAN CAYETANO', 'NORTE DE SANTANDER', '1_3_days', NULL, 0),
  ('PUERTO SANTANDER', 'NORTE DE SANTANDER', '1_3_days', NULL, 0),
  ('DOSQUEBRADAS', 'RISARALDA', '1_3_days', NULL, 0),
  ('LA VIRGINIA', 'RISARALDA', '1_3_days', NULL, 0),
  ('AGUSTIN CODAZZI', 'CESAR', '1_3_days', NULL, 0),
  ('LA PAZ', 'CESAR', '1_3_days', NULL, 0),
  ('MANAURE BALCON DEL CESAR', 'CESAR', '1_3_days', NULL, 0),
  ('SAN DIEGO', 'CESAR', '1_3_days', NULL, 0),

  -- Ciudades intermedias (~51)
  ('BARRANCABERMEJA', 'SANTANDER', '1_3_days', NULL, 0),
  ('TULUA', 'VALLE DEL CAUCA', '1_3_days', NULL, 0),
  ('BUGA', 'VALLE DEL CAUCA', '1_3_days', NULL, 0),
  ('CARTAGO', 'VALLE DEL CAUCA', '1_3_days', NULL, 0),
  ('TURBO', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('APARTADO', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('SOGAMOSO', 'BOYACA', '1_3_days', NULL, 0),
  ('DUITAMA', 'BOYACA', '1_3_days', NULL, 0),
  ('GIRARDOT', 'CUNDINAMARCA', '1_3_days', NULL, 0),
  ('FUSAGASUGA', 'CUNDINAMARCA', '1_3_days', NULL, 0),
  ('MAGANGUE', 'BOLIVAR', '1_3_days', NULL, 0),
  ('AGUACHICA', 'CESAR', '1_3_days', NULL, 0),
  ('OCANA', 'NORTE DE SANTANDER', '1_3_days', NULL, 0),
  ('BUENAVENTURA', 'VALLE DEL CAUCA', '1_3_days', NULL, 0),
  ('TUMACO', 'NARINO', '1_3_days', NULL, 0),
  ('LORICA', 'CORDOBA', '1_3_days', NULL, 0),
  ('CERETE', 'CORDOBA', '1_3_days', NULL, 0),
  ('SAHAGUN', 'CORDOBA', '1_3_days', NULL, 0),
  ('CIENAGA', 'MAGDALENA', '1_3_days', NULL, 0),
  ('FUNDACION', 'MAGDALENA', '1_3_days', NULL, 0),
  ('MAICAO', 'LA GUAJIRA', '1_3_days', NULL, 0),
  ('CAUCASIA', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('CHIGORODO', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('CAREPA', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('ESPINAL', 'TOLIMA', '1_3_days', NULL, 0),
  ('HONDA', 'TOLIMA', '1_3_days', NULL, 0),
  ('LA DORADA', 'CALDAS', '1_3_days', NULL, 0),
  ('PITALITO', 'HUILA', '1_3_days', NULL, 0),
  ('GARZON', 'HUILA', '1_3_days', NULL, 0),
  ('IPIALES', 'NARINO', '1_3_days', NULL, 0),
  ('TUQUERRES', 'NARINO', '1_3_days', NULL, 0),
  ('CHIQUINQUIRA', 'BOYACA', '1_3_days', NULL, 0),
  ('PAMPLONA', 'NORTE DE SANTANDER', '1_3_days', NULL, 0),
  ('SAN GIL', 'SANTANDER', '1_3_days', NULL, 0),
  ('SOCORRO', 'SANTANDER', '1_3_days', NULL, 0),
  ('MARINILLA', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('RIONEGRO', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('LA CEJA', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('EL CARMEN DE VIBORAL', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('YARUMAL', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('PUERTO BERRIO', 'ANTIOQUIA', '1_3_days', NULL, 0),
  ('ACACIAS', 'META', '1_3_days', NULL, 0),
  ('GRANADA', 'META', '1_3_days', NULL, 0),
  ('SABANALARGA', 'ATLANTICO', '1_3_days', NULL, 0),
  ('TURBACO', 'BOLIVAR', '1_3_days', NULL, 0),
  ('ARJONA', 'BOLIVAR', '1_3_days', NULL, 0),
  ('EL CARMEN DE BOLIVAR', 'BOLIVAR', '1_3_days', NULL, 0),
  ('SAN MARCOS', 'SUCRE', '1_3_days', NULL, 0),
  ('COROZAL', 'SUCRE', '1_3_days', NULL, 0),
  ('SAMPUES', 'SUCRE', '1_3_days', NULL, 0),
  ('CIENAGA DE ORO', 'CORDOBA', '1_3_days', NULL, 0);
