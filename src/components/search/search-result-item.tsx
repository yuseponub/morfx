'use client'

import { User, ShoppingCart, MessageSquare } from 'lucide-react'
import { CommandItem } from '@/components/ui/command'
import type { SearchableItem } from '@/app/actions/search'

// ============================================================================
// Configuration
// ============================================================================

const typeConfig = {
  contact: {
    icon: User,
    label: 'Contacto'
  },
  order: {
    icon: ShoppingCart,
    label: 'Pedido'
  },
  conversation: {
    icon: MessageSquare,
    label: 'Chat'
  }
}

// ============================================================================
// Component
// ============================================================================

interface SearchResultItemProps {
  item: SearchableItem
  onSelect: (href: string) => void
}

/**
 * Individual search result item.
 * Shows type icon, title, and subtitle with navigation on select.
 */
export function SearchResultItem({ item, onSelect }: SearchResultItemProps) {
  const config = typeConfig[item.type]
  const Icon = config.icon

  return (
    <CommandItem
      value={`${item.type}-${item.id}-${item.title}`}
      onSelect={() => onSelect(item.href)}
      className="flex items-center gap-3 py-2"
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
      </div>
    </CommandItem>
  )
}
