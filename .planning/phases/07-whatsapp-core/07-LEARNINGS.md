# Phase 7: WhatsApp Core - Learnings

**Fecha:** 2026-01-30
**Duración:** ~31 minutos
**Plans ejecutados:** 3

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| TypeScript error en getMessages return type | Action retornaba tipo genérico en lugar de Message[] | Especificar return type explícito `Promise<ActionResult<Message[]>>` | Siempre especificar tipos de retorno explícitos en Server Actions |
| Realtime subscription not filtering | Channel subscription no filtraba por workspace_id | Agregar filter en postgres_changes: `filter: 'workspace_id=eq.${workspaceId}'` | Verificar filtros RLS también aplican a Realtime |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| wamid unique constraint | UUID generado, hash de contenido | 360dialog garantiza wamid único, evita duplicados en reenvíos |
| Async webhook processing | Sync processing | 360dialog timeout 5s, proceso pesado debe ser async |
| TanStack Virtual para mensajes | react-virtualized, react-window | Más ligero, mejor API hooks, React 19 compatible |
| frimousse para emoji picker | emoji-picker-react, emoji-mart | 2kb vs 200kb+, shadcn-compatible, React 19 compatible |
| Base64 encoding para file upload | FormData, presigned URLs | Server Actions no soportan FormData nativo, Base64 simple para MVP |
| Supabase Storage para media | S3, Cloudflare R2 | Ya integrado con Supabase, RLS policies, CDN incluido |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| useConversations hook | Supabase Realtime | Re-renders excesivos en updates | Memoizar Fuse instance, usar filteredConversations separado |
| MessageInput | sendMessage action | Textarea no limpiaba después de envío | Resetear state en onSuccess callback después de revalidatePath |
| ChatView scroll | TanStack Virtual | No scrolleaba a último mensaje | useEffect con messages.length dependency + scrollToIndex(messages.length - 1) |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Patrón de webhook: return 200 inmediatamente, procesar async con setTimeout
- Supabase Realtime con postgres_changes para updates en tiempo real
- Fuse.js weighted search (mismo patrón de Phase 6 Kanban)
- Window indicator como componente separado con lógica de tiempo encapsulada

### Lo que NO hacer
- NO usar FormData en Server Actions (Next.js App Router limitación)
- NO procesar webhook sync (360dialog timeout 5s)
- NO subscribir a Realtime sin filtro de workspace (data leak)
- NO usar emoji pickers pesados (emoji-mart, emoji-picker-react son 200kb+)

### Patrones a seguir
- ActionResult<T> pattern para todas las Server Actions
- useRef + useVirtualizer para listas largas de mensajes
- Realtime subscription en useEffect con cleanup en return
- E.164 format para phone matching (libphonenumber-js)

### Comandos útiles
```bash
# Test webhook locally con ngrok
ngrok http 3020

# Verificar mensajes en DB
psql -c "SELECT * FROM messages ORDER BY timestamp DESC LIMIT 5"

# Verificar realtime habilitado
psql -c "SELECT * FROM supabase_realtime.subscription"
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Template messages cuando window cerrada | Alta | Phase 8 |
| Media message previews optimizados (thumbnails) | Media | Phase 8 |
| Read receipts batch update | Baja | Phase 8 |
| Conversation assignment UI | Alta | Phase 8 |
| Message search dentro de conversación | Media | Phase 10 |

## Notas para el Módulo

Información específica que un agente de documentación de este módulo necesitaría saber:

- **360dialog API:** Cloud API v2, base URL `https://waba-v2.360dialog.io`, bearer token auth
- **Webhook URL:** `/api/webhooks/whatsapp` - GET para verificación (hub.challenge), POST para mensajes
- **24h Window:** Calculada desde `last_customer_message_at`, warning <2h, closed >24h
- **Phone format:** E.164 obligatorio (+573001234567) para contact linking
- **Message types soportados:** text, image, video, audio, document (sticker pendiente)
- **Realtime tables:** conversations, messages (ambas con RLS y Realtime enabled)
- **File upload:** Base64 encoded en Server Action → Supabase Storage bucket 'whatsapp-media'

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
