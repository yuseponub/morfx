# Fase Suelta: Optimizacion Rendimiento Modulo WhatsApp

## Objetivo
Optimizar el rendimiento del modulo de WhatsApp en MorfX para que la carga de conversaciones, mensajes y panel lateral sea rapida y fluida.

## Problemas Identificados
1. **Queries muy pesadas** — getConversations() trae datos anidados innecesarios (contactos + tags + conversation_tags)
2. **Cascade realtime refetches** — 4 canales de Supabase re-cargan toda la lista en cada evento
3. **8 canales realtime por conversacion** — Lista(4) + Chat(2) + ContactPanel(2)
4. **Panel lateral carga innecesariamente** — El slider de contacto/pedidos carga al abrir la conversacion aunque no se necesite

## Archivos Clave
- `src/app/actions/conversations.ts` — Queries pesadas (linea 44-52)
- `src/hooks/use-conversations.ts` — Cascade realtime (linea 206-304)
- `src/hooks/use-messages.ts` — Carga de mensajes
- `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` — Panel lateral (2 canales extra)
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx` — Vista de chat

## Plans
- [ ] 01-PLAN.md — Query optimization + surgical state updates + channel consolidation (4→1)
- [ ] 02-PLAN.md — Panel lazy-loading (closed by default, conditional render, channel consolidation 2→1)
- [ ] 03-PLAN.md — Verification checkpoint (user testing on Vercel)
- [ ] 04-PLAN.md — Infrastructure recommendations (Supabase + Vercel config, non-blocking)

## Estado
- [x] Discuss
- [x] Research
- [x] Plan
- [ ] Execute
- [ ] Verify
