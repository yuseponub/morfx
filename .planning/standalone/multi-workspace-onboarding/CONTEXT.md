# Multi-Workspace WhatsApp Onboarding

## Motivation

Onboarding a second business (GoDentist, odontología) to MorfX.
Currently, the WhatsApp webhook hardcodes all inbound messages to a single workspace
via `WHATSAPP_DEFAULT_WORKSPACE_ID` env var. This blocks multi-tenant WhatsApp.

## What Exists

- `workspaces.settings` JSONB column exists in production (added manually, no migration)
- All outbound code already reads per-workspace credentials from settings with env var fallback
- Webhook route extracts `phone_number_id` from payload but ignores it for routing
- `templates.ts` is hardcoded to env var (not critical for initial onboarding)

## Requirements

1. Webhook route must resolve workspace by `phone_number_id` from the payload
2. Somnio must continue working EXACTLY as before (fallback to env var if lookup fails)
3. New workspace (GoDentist) created with settings populated
4. Zero risk to Somnio — the env var fallback guarantees existing behavior

## New Business Data

- Name: GoDentist
- Slug: godentist
- Business type: odontologia
- Owner: pending registration (will be assigned after they sign up)
- 360dialog credentials: pending (will be configured when connecting)
