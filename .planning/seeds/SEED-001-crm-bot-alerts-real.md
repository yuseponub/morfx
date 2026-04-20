---
id: SEED-001
status: dormant
planted: 2026-04-20
planted_during: Phase 44.1 (platform_config DB refactor)
trigger_when: cuando se toque codigo de CRM bots (crm-reader, crm-writer, alerts.ts, routes /api/v1/crm-bots/*) o se inserte fase relacionada a CRM bot
scope: Small
---

# SEED-001: Sistema de alertas real para CRM bots (runaway + approaching-limit)

## Why This Matters

El codigo del Phase 44-02 en `src/lib/agents/_shared/alerts.ts` ya tiene implementada la logica de `sendRunawayAlert` y `maybeSendApproachingLimitAlert`, pero usan Resend como transport — y `RESEND_API_KEY` NUNCA se seteo en Vercel. El decorador `fail-silent` de `alerts.ts` es por diseño (no queremos que un fallo de transport tumbe el request), asi que hoy las llamadas a ambos helpers se ejecutan sin error pero no envian nada.

Consecuencia: si un cliente con API key valida se loopea y pega 51+ requests/min:
- El endpoint SI devuelve 429 correctamente (rate limit es la defensa real, funciona)
- El invoker recibe el error y debe auto-regularse
- PERO: como operador **no te llega notificacion** — podrias no enterarte hasta que abras la inbox y veas un pico de 429 en logs

No es critico hoy (volumen bajo, rate limit ya contiene el dano), pero cuando haya mas invokers en produccion o agentes autonomos llamando al bot sin human-in-the-loop, queres visibilidad en tiempo real.

## When to Surface

**Trigger:** cuando se modifique cualquiera de:
- `src/lib/agents/crm-reader/**`
- `src/lib/agents/crm-writer/**`
- `src/lib/agents/_shared/alerts.ts`
- `src/app/api/v1/crm-bots/**`
- O cuando se cree una fase que mencione `crm-reader`, `crm-writer`, `platform_config` expansion, o modulo de alertas

Tambien surfacear si el usuario pide **agregar mas alertas** a cualquier bot (las mismas opciones de transport aplican).

## Scope Estimate

**Small** — 2 a 4 horas de trabajo:
- Elegir transport (ver opciones abajo)
- Implementar en `alerts.ts` o crear un thin wrapper `src/lib/alerts/transport.ts`
- Testeo manual: disparar runaway controlado y verificar que llega la alerta
- Documentar en runbook

## Opciones de Transport (evaluadas en Phase 44.1 conversation)

### Opcion A — Telegram bot (RECOMENDADO)
- **Setup:** 5 min via @BotFather para crear el bot, `getMe` para chat_id
- **Transport:** `fetch('https://api.telegram.org/bot<TOKEN>/sendMessage', {...})` — sin SDK
- **Env vars:** `TELEGRAM_ALERT_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID` (2 nuevas en Vercel, o en `platform_config` si preferimos mantener el pattern 44.1)
- **Pros:** push instantaneo en tu celular, gratis ilimitado, markdown/formatting nativo, sin dominios ni DKIM
- **Contras:** 2 env vars mas (o 2 rows mas en platform_config)

### Opcion B — Supabase table log
- **Setup:** nueva migracion `CREATE TABLE crm_bot_alerts (...)`, refactor `alerts.ts` → INSERT en vez de email
- **Pros:** zero new deps, registro persistente (utiles para analisis historico de patrones de abuso), usa lo que ya tenemos
- **Contras:** NO push notification — hay que mirar manualmente con `SELECT ... FROM crm_bot_alerts WHERE ...`
- **Combina bien con A:** log persistente + Telegram push son complementarios

### Opcion C — Resend (lo que ya esta codificado)
- **Setup:** crear cuenta en resend.com, verificar dominio, DKIM, DNS en Porkbun, set `RESEND_API_KEY` + `CRM_BOT_ALERT_FROM` en platform_config
- **Pros:** codigo ya escrito, emails son universales, 3k/mes gratis
- **Contras:** setup de dominio + DKIM es tedioso, deliverability a Gmail puede ser flaky para volumen bajo/sporadico

### Opcion D — Gmail SMTP + nodemailer
- **Setup:** generar App Password en Gmail (requiere 2FA habilitado), instalar `nodemailer`, usar joseromerorincon041100@gmail.com como sender
- **Pros:** mandas desde tu propio email
- **Contras:** Gmail App Passwords son fragiles (Google las revoca si detecta "actividad sospechosa"), ~500/dia hard limit, deliverability puede marcar como spam

## Recomendacion al reactivar

1. **Ambos:** Telegram (push critico) + Supabase log (registro historico)
2. **Solo Telegram** si solo queres notificacion y no te importa historico
3. **Solo Supabase log** si queres cero env vars nuevas y estas OK revisando manualmente

Evitar Resend a menos que ya tengas dominio verificado por otra razon.

## Breadcrumbs

Relevant code + decisions in the current codebase:

- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/_shared/alerts.ts` — 179 lineas, exporta `sendRunawayAlert` y `maybeSendApproachingLimitAlert` con dedup 15min in-memory, fail-silent
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/v1/crm-bots/reader/route.ts` — llama `void sendRunawayAlert(...)` al devolver 429 (fire-and-forget)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/v1/crm-bots/writer/propose/route.ts` — idem
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/v1/crm-bots/writer/confirm/route.ts` — idem
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/phases/44-crm-bots/44-02-PLAN.md` — diseno original del modulo alerts (cuando todavia se asumia Resend)
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/phases/44.1-crm-bots-config-db/44.1-01-PLAN.md` — conversion a platform_config
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/phases/44-crm-bots/44-RESEARCH.md` Pitfall 8 — alert storm prevention via dedupe
- package.json — `resend@^6.12.0` ya instalado (no hay que removerlo necesariamente, puede coexistir con nuevo transport)

## Notes

- Usuario confirmo 2026-04-20 que no habia seteado `CRM_BOT_ENABLED`, `CRM_BOT_RATE_LIMIT_PER_MIN`, `CRM_BOT_ALERT_FROM` ni `RESEND_API_KEY` en Vercel — todo el sistema de alertas siempre estuvo en estado fail-silent
- Rate limit funciona correctamente sin alertas — el 429 al cliente es la defensa real
- Phase 44.1 ya movio las 3 vars de config (`crm_bot_enabled`, `crm_bot_rate_limit_per_min`, `crm_bot_alert_from`) a `platform_config` table. Si se elige Telegram (Option A), los 2 nuevos valores (`telegram_alert_bot_token`, `telegram_alert_chat_id`) podrian seguir el mismo pattern — UN secret (`TELEGRAM_ALERT_BOT_TOKEN` en Vercel env porque es un secret) + `telegram_alert_chat_id` en `platform_config` (no es secret, es solo el ID del chat destino)
- Al reactivar: correr un runaway de prueba (51 requests/min con una API key de test) y verificar que llega la alerta exactamente 1 vez (por dedup de 15min), no 20 veces
