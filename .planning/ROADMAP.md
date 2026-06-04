### Phase 999.1: WhatsApp interactive message composer (botones + lista) (PLANNED)

**Goal:** UI de operador para componer y enviar mensajes interactivos de WhatsApp (botones de respuesta ≤3 + lista con secciones ≤10), más un domain `sendInteractiveMessage` provider-aware. Hoy la primitiva `sendWhatsAppInteractive` (Meta) + el clamping existen y están unit-tested (Fase 39, `meta-whatsapp-sender.test.ts`), pero NO hay UI de operador ni chokepoint de dominio para enviarlos; el `sendButtonMessage` de 360dialog está sin caller. El rendering entrante (`button_reply`/`list_reply`) ya existe; falta el rendering SALIENTE. Alcance: (1) compositor en el toolbar del inbox (gated a ventana 24h abierta, D-01/D-02); (2) domain `sendInteractiveMessage` con branch provider único (meta_direct → metaWhatsappSender; 360dialog → sendButtonMessage byte-idéntica, lista no soportada) siguiendo el chokepoint de la Fase 39 (Regla 3, Regla 6); (3) validación inline del set COMPLETO de límites Meta (incl. total-rows ≤10) + preview WhatsApp + bubble saliente rico; (4) tests.
**Requirements:** D-01..D-06 (decisiones lockeadas en 999.1-CONTEXT.md sirven como requisitos de facto)
**Plans:** 5 plans

Plans:
- [ ] 999.1-01-PLAN.md — Wave 0 (tdd): helper `interactive-limits.ts` (set completo Meta + total-rows ≤10 + id-uniqueness) + 2 test files (limits GREEN, provider RED)
- [ ] 999.1-02-PLAN.md — Wave 1: domain `sendInteractiveMessage` chokepoint provider-aware + caller 360dialog (Regla 3/6); provider test GREEN
- [ ] 999.1-03-PLAN.md — Wave 2: server action `sendInteractiveMessage` (auth + workspace + 24h window + delegate; sin leer provider)
- [ ] 999.1-04-PLAN.md — Wave 3: UI — `interactive-bubble.tsx` compartido + builder Dialog (toggle/validación/preview/send) + botón toolbar gated a ventana 24h
- [ ] 999.1-05-PLAN.md — Wave 4: bubble saliente rico (`message-bubble.tsx case 'interactive'` via componente compartido)