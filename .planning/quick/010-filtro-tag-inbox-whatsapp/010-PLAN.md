---
phase: quick-010
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
  - src/app/(dashboard)/whatsapp/components/filters/search-input.tsx
autonomous: true

must_haves:
  truths:
    - "User sees a Tag icon button next to sort and bot buttons"
    - "Clicking the Tag button opens a popover with whatsapp-scope tags (colored dot + name)"
    - "Selecting a tag filters conversation list to only show conversations with that tag"
    - "Tag filter combines with existing filters (inbox, search, agent)"
    - "Active tag filter shows visually (button variant=default)"
    - "Clicking active tag again or X clears the filter"
    - "Search placeholder is shorter: Buscar..."
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      provides: "Tag filter state + button + popover + client-side filtering"
    - path: "src/app/(dashboard)/whatsapp/components/filters/search-input.tsx"
      provides: "Shorter default placeholder"
  key_links:
    - from: "conversation-list.tsx tagFilter state"
      to: "filteredConversations useMemo"
      via: "c.tags?.some(t => t.id === tagFilter)"
    - from: "Tag button popover"
      to: "getTagsForScope('whatsapp')"
      via: "server action call on popover open"
---

<objective>
Add a tag filter button to the WhatsApp inbox conversation list. Users can filter conversations by a single tag, combinable with all existing filters (inbox tabs, search, agent filter). Also shorten the search placeholder.

Purpose: Let users quickly find conversations tagged with a specific label (e.g., "VIP", "Pendiente") without scrolling through the full list.
Output: Updated conversation-list.tsx with tag filter functionality, updated search-input.tsx with shorter placeholder.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(dashboard)/whatsapp/components/conversation-list.tsx
@src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx
@src/app/(dashboard)/whatsapp/components/filters/search-input.tsx
@src/lib/whatsapp/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add tag filter to conversation list</name>
  <files>
    src/app/(dashboard)/whatsapp/components/conversation-list.tsx
    src/app/(dashboard)/whatsapp/components/filters/search-input.tsx
  </files>
  <action>
**In conversation-list.tsx:**

1. Add imports:
   - `Tag` from `lucide-react`
   - `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover`
   - `getTagsForScope` from `@/app/actions/tags`

2. Add state:
   - `tagFilter: string | null` initialized to `null`
   - `tagFilterOpen: boolean` for popover
   - `availableTags: Array<{ id: string; name: string; color: string }>` initialized to `[]`

3. Add useEffect to load tags when popover opens (same pattern as conversation-tag-input.tsx):
   ```
   useEffect(() => {
     if (!tagFilterOpen) return
     getTagsForScope('whatsapp').then(setAvailableTags).catch(console.error)
   }, [tagFilterOpen])
   ```

4. Update the `filteredConversations` useMemo (line 104-109) to also apply tag filter:
   ```
   const filteredConversations = useMemo(() => {
     let result = conversations
     if (agentFilter === 'agent-attended') {
       result = result.filter(c => c.agent_conversational !== false)
     }
     if (tagFilter) {
       result = result.filter(c => c.tags?.some(t => t.id === tagFilter))
     }
     return result
   }, [conversations, agentFilter, tagFilter])
   ```

5. Add Tag button AFTER the Bot button (line 167), same style pattern:
   ```jsx
   <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
     <PopoverTrigger asChild>
       <Button
         variant={tagFilter ? 'default' : 'ghost'}
         size="icon"
         className="h-8 w-8 flex-shrink-0"
         title={tagFilter
           ? `Filtrando: ${availableTags.find(t => t.id === tagFilter)?.name || 'tag'}`
           : 'Filtrar por etiqueta'}
       >
         <Tag className="h-4 w-4" />
       </Button>
     </PopoverTrigger>
     <PopoverContent className="w-[200px] p-2" align="start">
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

   Note: Import `cn` from `@/lib/utils` if not already imported.

6. Update the empty state message (line 180) to also handle tagFilter:
   Add before the `agentFilter` check:
   ```
   tagFilter
     ? `No hay conversaciones con esta etiqueta`
     : agentFilter === 'agent-attended'
   ```

7. Update the results count condition (line 227) to include tagFilter:
   ```
   {(hasQuery || agentFilter === 'agent-attended' || tagFilter) && filteredConversations.length > 0 && (
   ```

**In search-input.tsx:**

8. Change default placeholder from `'Buscar conversaciones...'` to `'Buscar...'` (line 20).
  </action>
  <verify>
    - `npx tsc --noEmit` passes without errors
    - `npm run build` succeeds
    - Visual: Tag button appears next to sort and bot buttons
    - Clicking Tag button opens popover with whatsapp tags
    - Selecting a tag filters the list
    - Filter combines with search and agent filter
    - Search placeholder shows "Buscar..."
  </verify>
  <done>
    - Tag filter button visible in conversation list toolbar
    - Popover shows all whatsapp-scope tags with colored dots
    - Selecting a tag filters conversations client-side
    - Button shows variant="default" when filter active
    - "Quitar filtro" option clears the filter
    - Empty state shows appropriate message when tag filter active
    - Results count shown when tag filter active
    - Search input placeholder is "Buscar..."
    - All existing filters (inbox tabs, search, agent) continue working and combine with tag filter
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` -- no type errors
2. `npm run build` -- build succeeds
3. Visual check: Tag button appears in the filter row, styled consistently with sort and bot buttons
4. Functional check: Tag filter works independently and combines with other filters
</verification>

<success_criteria>
- Tag filter button visible and functional in WhatsApp inbox
- Popover loads whatsapp-scope tags with colored dots
- Single tag filter applied client-side in filteredConversations useMemo
- Filter combinable with inbox tabs, search query, and agent filter
- Active state visually indicated (button variant="default")
- Clear filter option available
- Search placeholder shortened to "Buscar..."
- Build passes without errors
</success_criteria>

<output>
After completion, create `.planning/quick/010-filtro-tag-inbox-whatsapp/010-SUMMARY.md`
</output>
