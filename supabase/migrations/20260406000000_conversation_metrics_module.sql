-- ============================================================================
-- Metricas de Conversaciones - RPC get_conversation_metrics + supporting index
-- ============================================================================
--
-- Purpose: Single backend entry point for the Metricas de Conversaciones module.
-- Centraliza el calculo de 3 metricas por dia:
--   - nuevas:     conversaciones con PRIMER mensaje INBOUND dentro del rango
--                 (STRICT definition: outbound-first conversations do NOT count)
--   - reabiertas: mensajes inbound donde el inbound previo ocurrio hace
--                 >= p_reopen_days (default 7). LAG() window function.
--   - agendadas:  contact_tags con tag = p_tag_name (default 'VAL') creadas
--                 dentro del rango. Eliminar la etiqueta decrementa el conteo
--                 automaticamente (el row desaparece de contact_tags).
--
-- Timezone: TODAS las agregaciones por dia usan America/Bogota (UTC-5).
--           El rango [p_start, p_end) es half-open en timestamptz.
--
-- Security: SECURITY INVOKER -> respeta RLS existente (is_workspace_member).
--           El caller debe pertenecer al workspace o ser service_role.
--
-- WHY strict nueva: una plantilla outbound saliente a la que el cliente nunca
--   responde NO debe inflar la metrica de "conversaciones nuevas". La primera
--   senal de interes del cliente (inbound) define el inicio real.
--
-- WHY no CONCURRENTLY: Supabase CLI corre migraciones en transaccion; CREATE
--   INDEX CONCURRENTLY es incompatible con transacciones.
--
-- Referenced plan: .planning/standalone/metricas-conversaciones/01-PLAN.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Supporting index: acelera el filtro por workspace en conversations y el
-- ordenamiento por created_at (usado tambien por otras queries del inbox).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_created
  ON conversations(workspace_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- RPC: get_conversation_metrics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_conversation_metrics(
  p_workspace_id UUID,
  p_start        TIMESTAMPTZ,
  p_end          TIMESTAMPTZ,
  p_reopen_days  INT  DEFAULT 7,
  p_tag_name     TEXT DEFAULT 'VAL'
)
RETURNS TABLE (
  day        DATE,
  nuevas     INT,
  reabiertas INT,
  agendadas  INT
)
LANGUAGE sql
SECURITY INVOKER
AS $$
  WITH
  -- 1) Serie de dias en el rango, bucketeada en America/Bogota.
  days AS (
    SELECT generate_series(
      date_trunc('day', p_start AT TIME ZONE 'America/Bogota')::date,
      date_trunc('day', (p_end - INTERVAL '1 microsecond') AT TIME ZONE 'America/Bogota')::date,
      INTERVAL '1 day'
    )::date AS day
  ),

  -- 2) NUEVAS (STRICT): conversaciones cuyo PRIMER mensaje INBOUND cae en el rango.
  --    No usamos conversations.created_at porque una plantilla outbound crea la
  --    conversacion antes de cualquier inbound real. CONTEXT.md exige al menos
  --    un inbound del cliente para contar como "nueva".
  nuevas_q AS (
    SELECT
      date_trunc('day', first_in AT TIME ZONE 'America/Bogota')::date AS day,
      COUNT(*)::int AS n
    FROM (
      SELECT
        m.conversation_id,
        MIN(m.timestamp) AS first_in
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.workspace_id = p_workspace_id
        AND m.direction = 'inbound'
      GROUP BY m.conversation_id
    ) t
    WHERE first_in >= p_start
      AND first_in <  p_end
    GROUP BY 1
  ),

  -- 3) Ventana de mensajes inbound con LAG() para detectar reaperturas.
  --    Cushion p_reopen_days hacia atras para que el primer inbound del rango
  --    pueda comparar contra un inbound previo fuera del rango.
  msg_win AS (
    SELECT
      m.conversation_id,
      m.timestamp,
      LAG(m.timestamp) OVER (
        PARTITION BY m.conversation_id
        ORDER BY m.timestamp
      ) AS prev_in
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.workspace_id = p_workspace_id
      AND m.direction = 'inbound'
      AND m.timestamp >= (p_start - (p_reopen_days || ' days')::interval)
      AND m.timestamp <  p_end
  ),

  -- 4) REABIERTAS: inbound actual con prev_in no nulo cuya distancia al prev
  --    es >= p_reopen_days. Un inbound sin prev (primer inbound absoluto) NO
  --    cuenta como reapertura (prev_in IS NOT NULL guard).
  reabiertas_q AS (
    SELECT
      date_trunc('day', timestamp AT TIME ZONE 'America/Bogota')::date AS day,
      COUNT(*)::int AS n
    FROM msg_win
    WHERE prev_in IS NOT NULL
      AND (timestamp - prev_in) >= (p_reopen_days || ' days')::interval
      AND timestamp >= p_start
      AND timestamp <  p_end
    GROUP BY 1
  ),

  -- 5) AGENDADAS: rows en contact_tags cuyo tag es p_tag_name (default 'VAL')
  --    y cuyo created_at cae en el rango. Al remover la etiqueta el row
  --    desaparece y la siguiente llamada al RPC refleja el cambio.
  agendadas_q AS (
    SELECT
      date_trunc('day', ct.created_at AT TIME ZONE 'America/Bogota')::date AS day,
      COUNT(*)::int AS n
    FROM contact_tags ct
    WHERE ct.tag_id = (
        SELECT id
        FROM tags
        WHERE workspace_id = p_workspace_id
          AND name = p_tag_name
        LIMIT 1
      )
      AND ct.created_at >= p_start
      AND ct.created_at <  p_end
    GROUP BY 1
  )

  SELECT
    d.day,
    COALESCE(nq.n, 0) AS nuevas,
    COALESCE(rq.n, 0) AS reabiertas,
    COALESCE(aq.n, 0) AS agendadas
  FROM days d
  LEFT JOIN nuevas_q     nq ON nq.day = d.day
  LEFT JOIN reabiertas_q rq ON rq.day = d.day
  LEFT JOIN agendadas_q  aq ON aq.day = d.day
  ORDER BY d.day;
$$;

-- ----------------------------------------------------------------------------
-- Permisos: cualquier usuario autenticado puede llamar la RPC; RLS garantiza
-- que solo vera datos de workspaces donde es miembro (SECURITY INVOKER).
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_conversation_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT)
  TO authenticated;
