# Phase 44.1: CRM bots config via platform_config — Learnings

**Fecha:** 2026-04-19 / 2026-04-20
**Duración:** ~150 min (Tasks 1-8 autonomos ~90 min + Task 9 Parte A debug + fix + re-verify ~60 min)
**Plans ejecutados:** 1 de 1 (44.1-01)

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| Kill-switch flip via SQL NO disparaba 503 en produccion | Tabla `platform_config` fue creada via Supabase Studio SQL Editor (Task 2). El SQL Editor en Studio NO auto-grantea privilegios sobre tablas nuevas al role `service_role` — a diferencia de `supabase db push` que SI lo hace. `getPlatformConfig` hit `42501 permission denied`; el fail-open catch retornaba `true` (fallback) silenciosamente; kill-switch nunca se activaba. | `GRANT ALL ON TABLE public.platform_config TO service_role; GRANT SELECT ON TABLE public.platform_config TO authenticated;` aplicado via Supabase SQL Editor, luego persistido en el archivo de migration (`commit ac4b6b8`) para que futuras copias (staging/dev/nueva prod) no hereden el bug. | **TEMPLATE CHANGE (ver seccion "Patrones a seguir"):** toda migration que cree una tabla via `CREATE TABLE` debe incluir inmediatamente despues GRANTs explicitos al `service_role`. No asumir herencia automatica. |
| Vercel build fallaba con `ERR_PNPM_OUTDATED_LOCKFILE` post-push de Phase 44.1 | Phase 44-02 agrego `resend@^6.12.0` al `package.json` via `npm install`, generando un `package-lock.json` pero dejando `pnpm-lock.yaml` desincronizado. Vercel CI corre `pnpm install --frozen-lockfile` y rechaza lockfiles desincronizados. | `pnpm install` localmente para regenerar `pnpm-lock.yaml` en sync. Commit `2d8fd1c`. | **VERIFICAR ANTES DE INSTALAR:** `test -f pnpm-lock.yaml` — si existe, usar `pnpm install --legacy-peer-deps` en vez de `npm install`. Ver seccion "Tips para Futuros Agentes" → "Lo que NO hacer". |
| Commit `--allow-empty` NO estaba vacio — barrio 3 archivos mobile search de otro Claude paralelo | Otro Claude instance en paralelo habia dejado 3 archivos stageados en el working tree compartido. Nuestro `git commit --allow-empty -m "force redeploy"` (intencion: push vacio para trigger Vercel redeploy) encontro staged changes y los incluyo sin avisar. | No es un bug de correctness (los archivos eran legitimos y nuestro commit les dio un message con contexto equivocado), pero es hygiene problematica. Commit `e173b98` termino mezclando "force redeploy" con 3 archivos de Phase 43-12. | **CHECK ANTES DE `--allow-empty`:** cuando trabajas en paralelo, `git status --short` antes de cualquier commit — si hay stageado/modificado de otro scope, coordinar. Alternativamente usar `git commit --only --allow-empty -m ...` (flag `--only` ignora staged changes). |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Cache in-memory TTL 30s (no pub-sub / Realtime) | Supabase Realtime broadcast, manual invalidation endpoint, LRU con mayor TTL | 3 rows, traffic bajo. 30s es balance aceptable entre consistencia post-flip (operator espera 30s) y DB load (~2 queries/min/key/lambda). Realtime seria overkill para config. |
| Fail-open para `crm_bot_enabled` (fallback `true` en DB error) | Fail-closed (fallback `false` → kill-switch ON en DB outage) | DB outages son raros; un fail-closed causaria outage funcional. Kill-switch es soft guard encima de rate-limit + API key revocation (defensa real). IRONIA: fail-open enmascaro LEARNING 1 durante 1 deploy — ver seccion abajo sobre log visibility. |
| `maybeSingle()` en vez de `.single()` | `.single()` que throw-ea si no hay match | Row ausente debe degradar a fallback silenciosamente, no disparar error. `.single()` hubiera tirado "JSON object requested, multiple (or no) rows returned" en primera carga si seed fallo. |
| Deliberate deviation del domain layer pattern | Aceptar `DomainContext` + filtrar por `workspace_id` (matches tags.ts / orders.ts / etc.) | Platform config NO tiene tenancy — es platform-wide. Forzar un fake `workspace_id='platform'` hubiera contaminado el pattern para el resto del domain layer. Deviation documentada in-code con JSDoc. D8 hace non-breaking la futura columna `workspace_id UUID NULL`. |
| `rateLimiter.check` sync con tercer param opcional | Convertir a async | ~5 call sites (3 routes + 1 executor + 1 test); async cascade hubiera forzado `await` en cada uno, contaminando tool handlers. Tercer param opcional mantiene retro-compatibilidad 100%. |
| Hardcodear `{limit: 50, windowMs: 60_000}` en DEFAULTS['crm-bot'] (en vez de leer env) | Mantener `Number(process.env.CRM_BOT_RATE_LIMIT_PER_MIN ?? 50)` | Must-have del plan: grep de env var retorna 0 matches. En produccion las rutas siempre pasan `{limit}` explicito via `getPlatformConfig`, entonces el 50 es defensive default inerte. |
| NO endpoint de invalidacion manual | `POST /admin/invalidate-config` con secret header | TTL 30s es propagation window suficiente para operacion normal. Endpoint agregaria auth surface sin beneficio inmediato. Deferred a admin UI phase cuando haya mas keys y mas frecuencia de cambios. |
| GRANT a `authenticated` (SELECT only) ademas de service_role (ALL) | Solo grant a service_role | Defense-in-depth para futuros server components que usen `createClient()` (SSR) en vez de `createAdminClient()`. No hay consumer hoy pero es barato agregarlo ahora y no romper algo sutil en el futuro. |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| Migration SQL (via Supabase Studio) | `createAdminClient()` (via `service_role`) | Tabla creada via SQL Editor en Studio NO hereda grants auto del service_role — a diferencia de `supabase db push` que si lo hace. Reads fallaban con 42501 silenciosamente. | GRANTs explicitos agregados al migration file para futuros ambientes. Production DB parchada manualmente. |
| Phase 44-02 `npm install resend` | Vercel CI `pnpm install --frozen-lockfile` | `pnpm-lock.yaml` quedo obsoleto, Vercel rechazo el build. | `pnpm install` local + commit regenerado. |
| `rateLimiter.check` (sync) | Route handlers (async) | Extender a async hubiera cascadeado a tool handlers via executor. | Tercer parametro opcional `opts?: { limit?: number }`; rutas resuelven el limite via helper async, luego invocan sync con `{limit}` explicito. |
| `getPlatformConfig` (async) | `alerts.ts::getFromAddress` (antes sync) | Fn sync leyendo env → no podia hacer await | Convertida a async; los 2 call sites (`sendRunawayAlert`, `maybeSendApproachingLimitAlert`) ya eran async, solo se agrego `await`. |
| Phase 44 `CRM_BOT_ENABLED` env (per-request read) | Vercel warm lambda no refresca env | Original Phase 44 Blocker 6 documentaba que cambiar env en Vercel requiere redeploy. | Phase 44.1 elimina el problema al leer de DB — SQL UPDATE visible en <=30s sin redeploy. |

## Tips para Futuros Agentes

### Lo que funcionó bien

- **Checkpoint bloqueante Task 2** — pausar y esperar confirmacion del usuario antes de refactor (Regla 5). Si hubieramos intentado pushear el codigo antes de la migration, primer request en prod habria tirado "relation platform_config does not exist" globalmente.
- **Separar refactor en 3 commits por route** — facilita bisect + rollback granular. Ninguno de los 3 rompio nada pero la opcion estaba ahi.
- **Migration additive (sin ALTER a tablas existentes)** — rollback via DROP TABLE trivial. Fallback en el helper + defaults hardcodeados significa que DROP seria seguro funcionalmente aunque feo.
- **SEED-001 planted in-session** — cuando detectamos que alerts.ts era fail-silent sin Resend, documentamos 4 opciones de transport con analisis costo/beneficio. Auto-surface cuando se toque CRM bot code.
- **Debug cycle transparente en SUMMARY** — en vez de ocultar que kill-switch tuvo 1 round fallido en prod, documentamos el ciclo completo (bug encontrado, root cause, fix, verificacion post-fix). Vale mas para el siguiente agente que una narrativa lineal limpia.

### Lo que NO hacer

- **NO ejecutar `npm install` en este repo** — usa pnpm. `test -f pnpm-lock.yaml` antes de cualquier `install` command; si existe (existe), usar `pnpm install --legacy-peer-deps`.
- **NO usar `git commit --allow-empty` sin `git status` check previo** — si estas en un working tree compartido con otros Claude instances, revisa que no haya stageado de otro scope. Alternativa defensiva: `git commit --only --allow-empty -m ...`.
- **NO crear tabla nueva sin GRANTs explicitos en la migration** — ver seccion "Patrones a seguir" → "Template de migration con grants". Si usas Studio SQL Editor, los grants son obligatorios.
- **NO asumir que fail-open fallback "just works"** — fail-open enmascara bugs de infra (como 42501). Agregar `console.error` visible en Vercel logs es el minimo indispensable (el helper lo tiene); revisar los logs proactivamente tras cada deploy que toque config.
- **NO skippear checkpoints humanos "porque ya sabes lo que el usuario va a responder"** — Task 2 parecia trivial pero si hubieramos asumido y continuado sin esperar, el bug de grants se hubiera manifestado en produccion con trafico real. El checkpoint impone un punto de verificacion manual.
- **NO hacer push a Vercel sin verificar que el lockfile este en sync** — `git status pnpm-lock.yaml` antes del push. Si aparece modified, regenerarlo.

### Patrones a seguir

- **Template de migration con GRANTs (CRITICAL — LEARNING 1):**
  ```sql
  CREATE TABLE public.my_new_table (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ... columnas ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
  );

  -- Seed rows si aplica
  INSERT INTO public.my_new_table (...) VALUES (...);

  COMMENT ON TABLE public.my_new_table IS '...';

  -- ────────────────────────────────────────────────────────────────
  -- MANDATORY: grants explicitos
  -- Tablas creadas via Supabase Studio SQL Editor NO auto-grantean
  -- privilegios a service_role. Sin estos GRANTs, createAdminClient()
  -- tira 42501 (permission denied). Ver LEARNINGS Phase 44.1.
  -- ────────────────────────────────────────────────────────────────
  GRANT ALL    ON TABLE public.my_new_table TO service_role;
  GRANT SELECT ON TABLE public.my_new_table TO authenticated;
  -- GRANT anon solo si aplica — usualmente NO para tablas server-only.

  -- Si agregas RLS:
  -- ALTER TABLE public.my_new_table ENABLE ROW LEVEL SECURITY;
  -- CREATE POLICY ... ;
  ```

- **Pattern DB-backed runtime config con cache TTL:** reusable para futuros feature flags / admin toggles. Ver `src/lib/domain/platform-config.ts` como canonical. Key takeaways:
  - `Map<string, {value, expiresAt}>` module-scoped.
  - TTL como constante exportada para testing.
  - `getConfig<T>(key, fallback): Promise<T>` — fallback tipado, NEVER throw.
  - `invalidateCache(key?)` — helper para tests + admin UI futura.
  - JSDoc con warnings explicitos: (a) deviation del domain pattern si aplica, (b) consistency window multi-instance, (c) fail-open vs fail-closed policy.

- **Fail-open con logging visible:** cuando el fallback es "seguro" pero puede enmascarar bugs de infra, agregar `console.error` en el catch → aparece en Vercel logs → operador puede detectar el problema proactivamente aunque el sistema "funcione". `platform-config.ts` lo hace en todos los catch blocks.

- **Non-breaking signature extension con parametro opcional:** evita async cascade. Patron: `fn(required1, required2, opts?: { field?: type })`. Interior: `const effective = opts?.field ?? DEFAULTS.field`. Callers existentes no se tocan.

### Comandos útiles

```bash
# Verificar que service_role tiene grants sobre una tabla (Supabase REST API)
curl -s "$SUPABASE_URL/rest/v1/MY_TABLE?select=*&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# Si responde 42501 "permission denied for table X": faltan GRANTs.
# Si responde 200 con [] o rows: grants OK.

# Verificar que los lockfiles estan en sync antes de push
git status pnpm-lock.yaml
# Si modified: pnpm install + git add + commit.

# Ver grants actuales en una tabla (correr en Supabase SQL Editor):
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'platform_config';

# Fix grants si faltan:
GRANT ALL    ON TABLE public.platform_config TO service_role;
GRANT SELECT ON TABLE public.platform_config TO authenticated;

# Kill-switch flip via SQL (para futuras QA / incidentes reales):
UPDATE platform_config SET value='false'::jsonb WHERE key='crm_bot_enabled';
-- Esperar 30s para propagacion cache TTL.
-- Revert:
UPDATE platform_config SET value='true'::jsonb  WHERE key='crm_bot_enabled';

# Verificar 0 refs a env vars eliminadas post-refactor:
grep -rn 'process\.env\.CRM_BOT_ENABLED\|process\.env\.CRM_BOT_RATE_LIMIT_PER_MIN\|process\.env\.CRM_BOT_ALERT_FROM' src/ | grep -v __tests__
# Expected: 0 lines de output.
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida | Nota |
|---|---|---|---|
| Tests `src/__tests__/integration/crm-bots/{reader,security}.test.ts` rotos post-refactor (referencian `process.env.CRM_BOT_ENABLED`) | P1 | Follow-up phase | D6 decision — out of scope de 44.1. Mocks deben cambiar a `vi.mock('@/lib/domain/platform-config')`. Tests de Phase 44 siguen validos en logica, solo el setup de kill-switch cambio. |
| RLS + policies para `platform_config` | P2 | Follow-up security pass | GRANTs son permisivos hoy (service_role ALL + authenticated SELECT). No hay RLS. Defense-in-depth contra leak de service_role seria ideal. |
| Alertas reales transport (Telegram/Supabase log) | P2 | Cuando se toque codigo CRM bots | SEED-001 documenta 4 opciones evaluadas. Fail-silent hoy; 429 rate limit es la defensa real. |
| Admin UI para editar `platform_config` sin SQL | P2 | Futura (post-44.1 cuando haya mas keys) | Supabase Studio SQL Editor es el path hoy. |
| Columna `workspace_id UUID NULL` para per-workspace overrides | P3 | Futura | Non-breaking cuando llegue (D8 explicit). |
| Endpoint `POST /admin/invalidate-config` con secret header | P3 | Futura | Para urgencias donde 30s TTL es demasiado. |
| Phase 44 Plan 09 formal SUMMARY.md | P3 | Cleanup pass | Nunca se creo; Task 6 QA satisfied via este SUMMARY (44.1-01). |
| Monitoring/alerting en Vercel logs sobre `console.error` de `platform-config.ts` | P3 | Observability phase | Detectar recurrencia del bug de grants si ocurre en ambientes nuevos. |

## Notas para el Módulo

### CRM Bots Config Subsystem (platform_config)

Información específica que un agente de documentación de este módulo necesitaría saber:

- **Canonical file:** `src/lib/domain/platform-config.ts`. Si se agrega una nueva key a `platform_config`, seguir el mismo patron: `await getPlatformConfig<T>(key, fallback)` dentro del handler, NO memoizado cross-request.
- **TTL exacto:** 30_000 ms. NO cambiar sin documentar impact en pitfalls (ventana de consistencia post-flip + DB load). Cualquier key agregada hereda el TTL (no hay per-key override por simplicidad).
- **JSONB strict typing en migration:** booleans sin comillas (`'true'::jsonb`), numbers sin comillas (`'50'::jsonb`), strings con comillas doble (`'"sandbox@example.com"'::jsonb`), null literal (`'null'::jsonb`). Ver Pitfall 7 de 44.1-RESEARCH.
- **Fail-open policy:** helper nunca throw-ea. DB error → `console.error` + retorna `fallback`. Esto es by design — no cambiar sin re-evaluar trade-off con fail-closed.
- **Defensive type check:** si `typeof data.value !== typeof fallback` Y fallback no es null, retorna fallback. Catches corrupted JSONB writes.
- **Deliberate deviation del domain pattern:** este modulo NO acepta DomainContext, NO filtra por workspace_id, NO retorna DomainResult. Documentado en el JSDoc del archivo. Si agregas una nueva key que SI deberia ser per-workspace, NO uses este helper — crea `src/lib/domain/workspace-config.ts` o similar.
- **GRANTs mandatorios en migrations:** cualquier tabla nueva creada en este repo debe incluir `GRANT ALL ON TABLE ... TO service_role` + (opcionalmente) `GRANT SELECT TO authenticated`. Ver LEARNING 1.

### Kill-switch operability runbook

- Flip OFF: `UPDATE platform_config SET value='false'::jsonb WHERE key='crm_bot_enabled';` — efecto visible en <=30s, todas las lambdas propagan dentro de ese window.
- Flip ON (revert): `UPDATE platform_config SET value='true'::jsonb WHERE key='crm_bot_enabled';` — mismo window.
- Verificacion: `curl -i -X POST https://morfx.app/api/v1/crm-bots/reader ...` — debe retornar 503 con `{"code":"KILL_SWITCH"}` cuando disabled, 200 cuando enabled.
- Si el flip NO dispara 503 despues de 30s: verificar GRANTs (`SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='platform_config'` debe listar service_role). Si faltan: re-aplicar los GRANTs del migration file.

---

*Generado al completar Phase 44.1 — 2026-04-20. Input para entrenamiento de agentes de documentación y para el siguiente executor que toque CRM bot code (SEED-001 auto-surface).*
