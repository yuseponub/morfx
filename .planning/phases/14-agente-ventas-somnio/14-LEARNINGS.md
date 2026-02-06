# Phase 14: Agente Ventas Somnio - Learnings

## Bugs Encontrados

### 1. Turbopack Error en WSL (CRÍTICO)

**Síntoma:**
```
FATAL: An unexpected Turbopack error occurred.
Error: Next.js inferred your workspace root, but it may not be correct.
We couldn't find the Next.js package (next/package.json) from the project directory
```

**Causa:** Turbopack en Next.js 16 tiene problemas con WSL y paths de Windows/Linux.

**Solución:** Agregar configuración `turbopack.root` en `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // ... resto de config
}
```

**Nota:** El flag `--no-turbo` NO existe en Next.js 16. No intentes usarlo.

### 2. Función RLS Inexistente

**Síntoma:**
```sql
ERROR: 42883: function get_user_workspace_ids() does not exist
```

**Causa:** La migración de `agent_templates` usaba `get_user_workspace_ids()` que no existe en el proyecto.

**Solución:** Usar `is_workspace_member(workspace_id)` que sí existe:
```sql
-- Incorrecto
CREATE POLICY "..." ON agent_templates
  FOR ALL USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- Correcto
CREATE POLICY "..." ON agent_templates
  FOR ALL USING (workspace_id IS NULL OR is_workspace_member(workspace_id));
```

### 3. Puerto en Uso (EADDRINUSE)

**Síntoma:**
```
errno: -98, syscall: 'listen', address: '::', port: 3020
```

**Causa:** Proceso zombie de Next.js ocupando el puerto.

**Solución:**
```bash
pkill -9 -f "next"
pkill -9 -f "node"
sleep 3
npm run dev
```

## Tips para Futuros Agentes

### Migraciones Pendientes

Las migraciones de fases 12-14 (MVP v2) deben aplicarse manualmente a Supabase:
- `20260205_tool_logs_agent_session.sql` - Columna agent_session_id
- `20260205_agent_sessions.sql` - Tablas de sesiones
- `20260206_agent_templates.sql` - Templates de agente

### Testing del API

Para probar `/api/agents/somnio` necesitas IDs reales:
- `workspaceId` - UUID de un workspace existente
- `conversationId` - UUID de una conversación existente

Con IDs falsos recibirás: `{"success":false,"error":{"code":"PROCESSING_ERROR"}}`

### Dependencias Peer

Si `npm install` falla con conflictos de peer dependencies:
```bash
npm install --legacy-peer-deps
```

## Decisiones Técnicas

| Decisión | Razón |
|----------|-------|
| `turbopack.root: process.cwd()` | Fix para WSL/Windows paths |
| `is_workspace_member()` en RLS | Función existente en el proyecto |
| Templates con `workspace_id NULL` | Permite templates globales por defecto |

## Tiempo Perdido

- ~30 min debuggeando Turbopack error
- ~10 min con función RLS inexistente

**Lección:** Verificar funciones SQL existentes antes de escribir migraciones.
