-- Historial de scrapes y envíos de confirmaciones GoDentist
CREATE TABLE godentist_scrape_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scraped_date TEXT NOT NULL,           -- fecha scrapeada YYYY-MM-DD
  sucursales TEXT[] NOT NULL,           -- sucursales scrapeadas
  appointments JSONB NOT NULL,          -- array de citas [{nombre, telefono, hora, sucursal, estado}]
  total_appointments INT NOT NULL DEFAULT 0,
  send_results JSONB DEFAULT NULL,      -- null = no enviado aún, {sent, failed, excluded, details[]}
  sent_at TIMESTAMPTZ DEFAULT NULL,     -- cuando se enviaron los mensajes
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_godentist_history_workspace ON godentist_scrape_history(workspace_id);
CREATE INDEX idx_godentist_history_date ON godentist_scrape_history(workspace_id, scraped_date);
