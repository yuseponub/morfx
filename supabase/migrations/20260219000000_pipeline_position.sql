-- Add position column to pipelines for drag & drop reordering
ALTER TABLE pipelines ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Set initial positions based on current order (default first, then alphabetical)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY workspace_id
    ORDER BY is_default DESC, name ASC
  ) - 1 AS pos
  FROM pipelines
)
UPDATE pipelines SET position = ranked.pos
FROM ranked WHERE pipelines.id = ranked.id;
