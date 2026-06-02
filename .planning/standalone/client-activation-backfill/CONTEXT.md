# Client Activation Backfill — Contexto

## Problema
El backfill de `is_client` ya existe en `src/lib/domain/client-activation.ts:backfillIsClient()` y se llama automáticamente desde `updateClientActivation()` cuando cambian `activation_stage_ids` o `enabled`. PERO la primera vez que el usuario guardó la config, el GRANT de la tabla no existía (error 42501), así que el backfill falló silenciosamente. Los contactos existentes con órdenes en stages de activación no tienen `is_client=true`.

## Lo que ya existe

### Domain — `src/lib/domain/client-activation.ts` línea 115
```ts
export async function backfillIsClient(workspaceId: string)
```
- Lee config → si no enabled o sin stage_ids → reset todos a false
- Query orders con stage_id IN activation_stage_ids → contact_ids únicos
- Reset all is_client=false, luego SET true para los que match

### Server Action — `src/app/actions/client-activation.ts` línea 65
```ts
if (updates.activation_stage_ids !== undefined || updates.enabled !== undefined) {
  const backfillResult = await backfillIsClient(workspaceId)
}
```

### UI Form — `src/app/(dashboard)/settings/activacion-cliente/components/activation-config-form.tsx`
- Switch enabled, switch all_are_clients, stage selector, botón guardar

## Solución — 2 cambios

### 1. Server Action — nueva función `runBackfill()`
En `src/app/actions/client-activation.ts` agregar:
```ts
export async function runClientBackfill(): Promise<ActionResult<{ updated: number }>> {
  // auth + admin check (copiar patrón de updateClientActivation)
  // llamar backfillIsClient(workspaceId)
  // revalidatePath('/whatsapp')
  // retornar { success: true, data: { updated: N } }
}
```

### 2. UI — botón "Recalcular" en el form
En `activation-config-form.tsx`, agregar un botón secundario debajo del botón guardar:
- Solo visible cuando `enabled && !allAreClients && selectedStageIds.length > 0`
- Texto: "Recalcular contactos existentes"
- Llama `runClientBackfill()`
- Toast con cantidad de contactos actualizados
- Variant outline para distinguir del botón principal

## Archivos a modificar (2)
| Archivo | Cambio |
|---------|--------|
| `src/app/actions/client-activation.ts` | Agregar `runClientBackfill()` |
| `src/app/(dashboard)/settings/activacion-cliente/components/activation-config-form.tsx` | Agregar botón "Recalcular" |

## No se necesita
- Cambios en migration, domain, types, inbox, ni realtime — todo eso ya funciona
- El backfill automático en `updateClientActivation` sigue funcionando para futuros cambios de config
