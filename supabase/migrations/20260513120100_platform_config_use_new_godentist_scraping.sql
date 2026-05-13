-- godentist-scraping-structural-v2: D-10 feature flag default ON (kill-switch semantics)
--
-- Per CONTEXT.md D-10: el paradigma F nuevo está activo por default desde el merge a main.
-- El flag existe como kill-switch para bloquear nuevos scrapes si el rediseño tiene su
-- propia falla en producción.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- IMPORTANT — FLAG SEMANTICS (Issue 3 fix Option A, revision iteration 1):
--
--   Setting to false aborts new scrapes with an explicit error — does NOT fall
--   back to paradigm A. Paradigm A was REMOVED from the robot adapter in Plan 05
--   of this same standalone (godentist-scraping-structural-v2). The endpoint
--   /api/scrape-appointments-legacy DOES NOT EXIST in server.ts post-Plan 05.
--
--   To revive paradigm A:
--     1. `git revert <HEAD del commit del standalone>` en main del repo morfx.
--     2. `git push origin main` — Vercel + Railway redeployan a paradigma A.
--     3. La fila de este flag NO se borra; el operador puede flipearla back a true
--        después del revert si quiere reactivar paradigma F (no aplicable aquí ya
--        que el revert reactivaría el "old behavior" — pero el statement queda
--        para futuros estándalones que reusen este patrón).
--
--   Rollback SOFT (mientras se diagnostica un bug nuevo de paradigma F):
--     UPDATE platform_config
--        SET value = 'false'::jsonb
--      WHERE key = 'use_new_godentist_scraping';
--
--   Toma efecto en ≤30s (cache TTL del helper getPlatformConfig). El server-action
--   scrapeAppointments retornará el error:
--     "Feature flag use_new_godentist_scraping=false. Paradigm A removed in
--      standalone godentist-scraping-structural-v2. To rollback to paradigm A,
--      git revert the standalone + redeploy."
-- ──────────────────────────────────────────────────────────────────────────────
--
-- Per CONTEXT.md DISC-01: nombre del flag es prerrogativa del planner. Se mantiene el
-- nombre sugerido `use_new_godentist_scraping` por consistencia con otros flags
-- snake_case del repo (ej. somnio_recompra_crm_reader_enabled).
--
-- Per CLAUDE.md REGLA 5: aplicar a prod ANTES de pushear Plan 06 (server-action que
-- consume el flag via getPlatformConfig). Sin esta fila, getPlatformConfig cae al
-- fallback=true del código — comportamiento equivalente PERO sin visibilidad operacional
-- ni rollback path persistido.

INSERT INTO platform_config (key, value)
VALUES ('use_new_godentist_scraping', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW();

COMMENT ON COLUMN platform_config.value IS
  '(unchanged) JSONB primitive or object. For use_new_godentist_scraping: true=paradigm F (D-10 default), false=KILL-SWITCH (aborts new scrapes with explicit error; does NOT fall back to paradigm A — that was removed in Plan 05; rollback to paradigm A requires git revert + redeploy).';
