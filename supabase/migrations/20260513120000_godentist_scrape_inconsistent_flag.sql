-- godentist-scraping-structural-v2: D-08 cross-sede canary columns + D-15 audit total_citas
--
-- Per CONTEXT.md D-08: scrapeAppointments (server-action) detecta cuando un (phone, fecha)
-- aparece en >1 sede dentro del mismo scrape — esto significa que el paradigma F tiene
-- una grieta (D-07 invariante violado). El scrape se persiste con flag inconsistent=true,
-- los flujos downstream (sendConfirmations + scheduleReminders) abortan, y se emite un
-- Inngest event 'godentist/scrape.inconsistent' que loguea el incidente para alertar al
-- developer (NO al operador — D-08 mandato).
--
-- Per CONTEXT.md D-15 / RESEARCH.md Wave 0: total_citas adicional para audit comparativo
-- con el toolbar "Total de citas: N" del portal Dentos (sanity check post-scrape).
--
-- Per CLAUDE.md REGLA 5: este archivo DEBE aplicarse a producción ANTES de pushear
-- código que referencia las nuevas columnas. El standalone tiene un paso BLOQUEANTE
-- manual que pausa hasta confirmación explícita del usuario.

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS inconsistent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS inconsistency_details JSONB DEFAULT NULL;

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS total_citas INTEGER DEFAULT NULL;

-- Index parcial para D-08 list view (find recent inconsistent scrapes per workspace).
-- Patrón replicado de 20260312100000_godentist_scheduled_reminders.sql line 26-27
-- (`WHERE status = 'pending'`). Inconsistent scrapes son raros en prod → full index
-- desperdiciaría espacio.
CREATE INDEX IF NOT EXISTS idx_godentist_history_inconsistent
  ON godentist_scrape_history(workspace_id, created_at DESC)
  WHERE inconsistent = true;

COMMENT ON COLUMN godentist_scrape_history.inconsistent IS
  'D-08 cross-sede canary flag. true cuando scrapeAppointments detectó (phone, fecha) en >1 sede. Bloquea sendConfirmations/scheduleReminders.';

COMMENT ON COLUMN godentist_scrape_history.inconsistency_details IS
  'D-08 forensics JSONB: { crossSedePhones: [{ phone, sedes: [] }], detectedAt: ISO, totalAppointments }';

COMMENT ON COLUMN godentist_scrape_history.total_citas IS
  'D-15 audit: total citas parseado del toolbar Dentos "Total de citas: N" (sanity vs total_appointments).';
