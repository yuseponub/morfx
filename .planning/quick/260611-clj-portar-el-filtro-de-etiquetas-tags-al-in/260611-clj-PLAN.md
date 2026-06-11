---
phase: quick-260611-clj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
autonomous: true
requirements:
  - QUICK-TAG-V3-01
must_haves:
  truths:
    - "En el inbox v3 (editorial) aparece un control de filtro por etiqueta en la fila de chips .conv-filters"
    - "Al abrir el control se listan las etiquetas del workspace con su punto de color"
    - "Seleccionar una etiqueta filtra la lista de conversaciones a las que tienen ese tag"
    - "Existe una forma de quitar el filtro de etiqueta (Quitar filtro)"
    - "Cuando no hay etiquetas en el workspace, el control muestra 'Sin etiquetas'"
    - "Las etiquetas se cargan lazy al abrir el control (no al montar)"
    - "Las ramas legacy y v2 siguen byte-idénticas en comportamiento (Regla 6)"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      provides: "Tag filter UI dentro del branch v3 (.conv-filters)"
      contains: "tagFilterOpen"
  key_links:
    - from: "v3 .conv-filters Popover trigger"
      to: "setTagFilterOpen / tagFilter state existente"
      via: "reuso del state compartido tagFilter/tagFilterOpen/availableTags"
      pattern: "tagFilter"
    - from: "Popover de tags v3"
      to: "filteredConversations useMemo (líneas ~169-178)"
      via: "tagFilter ya aplicado en el filtro client-side compartido"
      pattern: "c.tags\\?\\.some"
---

<objective>
Portar el filtro de etiquetas (tags) al branch v3 (editorial) del inbox de conversaciones, con paridad funcional respecto al filtro v2/legacy.

Purpose: El branch v3 (`.conv-col`) renderiza la fila de chips `.conv-filters` (Todas / Sin leer / Mías / Agente IA / Cerradas) pero NO ofrece filtro por etiqueta — la única funcionalidad faltante vs v2/legacy. El state (`tagFilter`, `setTagFilter`, `tagFilterOpen`, `availableTags`), el lazy-load (`getTagsForScope('whatsapp')`), el filtrado client-side (`filteredConversations`), el `isFiltered` check y el botón "Limpiar filtros" del empty-state YA contemplan tags y corren para v3. Solo falta la UI.

Output: Un único archivo modificado (`conversation-list.tsx`), branch v3 únicamente. Sin nuevo state, sin tocar el hook, sin migración.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(dashboard)/whatsapp/components/conversation-list.tsx

<interfaces>
<!-- Todo esto YA existe en el archivo — el executor lo reusa, no lo recrea. -->

State compartido (líneas ~67-69, vivo para los tres branches):
```typescript
const [tagFilter, setTagFilter] = useState<string | null>(null)
const [tagFilterOpen, setTagFilterOpen] = useState(false)
const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([])
```

Lazy-load al abrir (líneas ~128-132) — YA dispara para v3 porque escucha tagFilterOpen:
```typescript
useEffect(() => {
  if (!tagFilterOpen) return
  getTagsForScope('whatsapp').then(setAvailableTags).catch(console.error)
}, [tagFilterOpen])
```

Filtrado client-side (líneas ~169-178) — YA aplica tagFilter para v3:
```typescript
if (tagFilter) {
  result = result.filter(c => c.tags?.some(t => t.id === tagFilter))
}
```

Portal container para Radix Popover en scope editorial (líneas ~63, 91-97):
`themeContainerRef.current = document.querySelector('[data-module="whatsapp"]')` — se resuelve cuando `v2 || v3`. El branch v3 debe pasar `portalContainer={themeContainerRef.current}` al PopoverContent.

Imports YA presentes (líneas 4-13): `Tag` (lucide), `Popover/PopoverContent/PopoverTrigger`, `cn`. NO agregar imports nuevos.

CSS v3 disponible (globals.css):
- `.theme-editorial-v3 .conv-filters` tiene `flex-wrap:wrap` + `gap:6px` → el trigger del tag filter cabe en la misma fila.
- `.theme-editorial-v3 .chip` / `.chip.on` → estilo de chip editorial (pill, border, tokens). Reusar para el trigger.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Añadir el filtro de etiquetas al branch v3 (.conv-filters)</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-list.tsx</files>
  <action>
Dentro del branch `if (v3)` (return que empieza ~línea 276), en el bloque de chips `<div className="conv-filters">` (~líneas 293-329), añadir un Popover de filtro por etiqueta como ÚLTIMO hijo de `.conv-filters` (después del chip "Cerradas", ~línea 328).

REUSAR exclusivamente el state y patrones existentes — NO declarar state nuevo, NO agregar imports, NO tocar el hook. Estructura:

```tsx
<Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
  <PopoverTrigger asChild>
    <button
      type="button"
      className={cn('chip', tagFilter && 'on')}
      title={tagFilter
        ? `Filtrando: ${availableTags.find(t => t.id === tagFilter)?.name || 'etiqueta'}`
        : 'Filtrar por etiqueta'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
    >
      <Tag style={{ width: 12, height: 12 }} aria-hidden />
      {tagFilter
        ? (availableTags.find(t => t.id === tagFilter)?.name || 'Etiqueta')
        : 'Etiqueta'}
    </button>
  </PopoverTrigger>
  <PopoverContent
    className="w-[200px] p-2"
    align="start"
    portalContainer={themeContainerRef.current ?? undefined}
  >
    <div className="space-y-1">
      {tagFilter && (
        <button
          onClick={() => { setTagFilter(null); setTagFilterOpen(false) }}
          className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent text-muted-foreground"
        >
          Quitar filtro
        </button>
      )}
      {availableTags.length === 0 ? (
        <p className="text-sm text-muted-foreground px-2 py-1.5">Sin etiquetas</p>
      ) : (
        availableTags.map(tag => (
          <button
            key={tag.id}
            onClick={() => { setTagFilter(tag.id); setTagFilterOpen(false) }}
            className={cn(
              "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent flex items-center gap-2",
              tagFilter === tag.id && "bg-accent font-medium"
            )}
          >
            <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
            {tag.name}
          </button>
        ))
      )}
    </div>
  </PopoverContent>
</Popover>
```

Notas de implementación:
- El trigger usa la clase `.chip` (idioma v3) con `.on` cuando hay tag activo — coherente con los chips vecinos. El icono `Tag` inline + label "Etiqueta" / nombre del tag activo encaja en `.conv-filters` (flex-wrap:wrap).
- El `PopoverContent` reusa el contenido EXACTO del branch v2 (~líneas 495-521) por paridad funcional: "Quitar filtro", punto de color por tag, estado "Sin etiquetas", selección que cierra el popover. La única diferencia es el trigger (chip editorial en vez del IconButton shadcn) — la estética del PANEL del popover se mantiene como v2 porque el Popover de Radix se re-rootea en `[data-module="whatsapp"]` igual que v2 y no hay tokens v3 específicos para su interior.
- `portalContainer={themeContainerRef.current ?? undefined}` re-rootea el popover en el scope editorial (mismo patrón que v2 línea 493). En v3 `themeContainerRef` ya se resuelve (useEffect líneas 94-97 corre cuando `v2 || v3`).
- NO tocar el chip "Limpiar filtros" del empty-state v3 (~línea 347) — ya limpia `tagFilter`. NO tocar el `isFiltered` check (~línea 239) — ya incluye `!!tagFilter`.

REGLA 6 — NO modificar nada fuera del branch `if (v3)`. Las ramas v2 (~377-526) y legacy (~529-626) y el bloque return final deben quedar byte-idénticas. Verificar con diff que el cambio es puramente aditivo dentro de `.conv-filters` del branch v3.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && pnpm exec tsc --noEmit 2>&1 | grep -i "conversation-list" || echo "OK-no-typeerrors-in-file"</automated>
  </verify>
  <done>
- El branch v3 (`.conv-filters`) renderiza el Popover de filtro por etiqueta como último hijo, con trigger estilo `.chip`/`.on`.
- `pnpm exec tsc --noEmit` no reporta errores nuevos en `conversation-list.tsx`.
- `git diff` muestra cambios SOLO dentro del branch `if (v3)` (puramente aditivo en `.conv-filters`); ramas v2/legacy sin cambios (Regla 6).
- No se agregó state, imports, ni se tocó el hook `useConversations`.
  </done>
</task>

</tasks>

<verification>
1. Typecheck: `pnpm exec tsc --noEmit` sin errores nuevos en el archivo (pueden existir 4 errores pre-existentes test-only fuera de scope, documentados en STATE — ignorarlos).
2. Regla 6 (diff): `git diff -- 'src/app/(dashboard)/whatsapp/components/conversation-list.tsx'` debe mostrar adiciones únicamente dentro del branch v3; cero líneas removidas/cambiadas en v2 y legacy.
3. Paridad funcional: el popover v3 lista tags con punto de color, "Quitar filtro", "Sin etiquetas", lazy-load al abrir — idéntico a v2.
</verification>

<success_criteria>
- El inbox v3 tiene filtro por etiqueta funcional, con paridad respecto a v2/legacy.
- `tagFilter` filtra la lista vía el `filteredConversations` useMemo ya existente.
- Cambio aislado a un solo archivo, branch v3, sin tocar v2/legacy (Regla 6), sin migración, sin imports nuevos.
- Typecheck verde.
</success_criteria>

<output>
After completion, create `.planning/quick/260611-clj-portar-el-filtro-de-etiquetas-tags-al-in/260611-clj-SUMMARY.md`.

Regla 1: tras verde, push a Vercel (`git add … && git commit && git push origin main`) antes de pedir prueba visual al usuario.
</output>
