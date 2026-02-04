'use client'

import { Search, User, ShoppingCart, MessageSquare, Loader2 } from 'lucide-react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useGlobalSearch, type SearchFilter } from '@/hooks/use-global-search'
import { SearchResultItem } from './search-result-item'

// ============================================================================
// Configuration
// ============================================================================

const filterTabs: { value: SearchFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'all', label: 'Todos', icon: Search },
  { value: 'contact', label: 'Contactos', icon: User },
  { value: 'order', label: 'Pedidos', icon: ShoppingCart },
  { value: 'conversation', label: 'Chats', icon: MessageSquare },
]

const groupLabels = {
  contact: 'Contactos',
  order: 'Pedidos',
  conversation: 'Conversaciones'
}

// ============================================================================
// Component
// ============================================================================

/**
 * Global search component with command palette UI.
 * Renders trigger button for sidebar and search dialog.
 */
export function GlobalSearch() {
  const {
    open,
    setOpen,
    query,
    setQuery,
    filter,
    setFilter,
    groupedResults,
    loading,
    navigate
  } = useGlobalSearch()

  return (
    <>
      {/* Trigger button in sidebar */}
      <Button
        variant="outline"
        className="w-full justify-start text-muted-foreground font-normal"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span>Buscar...</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">Ctrl</span>K
        </kbd>
      </Button>

      {/* Command Dialog */}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar"
        description="Buscar contactos, pedidos y conversaciones"
      >
        <CommandInput
          placeholder="Buscar contactos, pedidos, chats..."
          value={query}
          onValueChange={setQuery}
        />

        {/* Filter tabs */}
        <div className="flex gap-1 p-2 border-b">
          {filterTabs.map(tab => {
            const Icon = tab.icon
            return (
              <Button
                key={tab.value}
                variant="ghost"
                size="sm"
                onClick={() => setFilter(tab.value)}
                className={cn(
                  'h-7 px-2 text-xs',
                  filter === tab.value && 'bg-accent'
                )}
              >
                <Icon className="h-3 w-3 mr-1" />
                {tab.label}
              </Button>
            )
          })}
        </div>

        <CommandList>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <CommandEmpty>No se encontraron resultados.</CommandEmpty>

              {filter === 'all' ? (
                // Grouped display
                <>
                  {Object.entries(groupedResults).map(([type, items]) => {
                    if (!items || items.length === 0) return null
                    return (
                      <CommandGroup key={type} heading={groupLabels[type as keyof typeof groupLabels]}>
                        {items.map(item => (
                          <SearchResultItem
                            key={`${item.type}-${item.id}`}
                            item={item}
                            onSelect={navigate}
                          />
                        ))}
                      </CommandGroup>
                    )
                  })}
                </>
              ) : (
                // Single type display
                <CommandGroup heading={groupLabels[filter as keyof typeof groupLabels]}>
                  {groupedResults[filter]?.map(item => (
                    <SearchResultItem
                      key={`${item.type}-${item.id}`}
                      item={item}
                      onSelect={navigate}
                    />
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
