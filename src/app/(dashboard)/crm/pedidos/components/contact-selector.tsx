'use client'

import * as React from 'react'
import { CheckIcon, ChevronsUpDownIcon, UserIcon, XIcon, PlusIcon, LoaderIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPhoneDisplay } from '@/lib/utils/phone'
import { createContact } from '@/app/actions/contacts'
import { toast } from 'sonner'
import type { ContactWithTags } from '@/lib/types/database'

interface ContactSelectorProps {
  contacts: ContactWithTags[]
  value: string | null
  onChange: (contactId: string | null) => void
  onContactCreated?: (contact: ContactWithTags) => void
  disabled?: boolean
  /** Pre-fill phone when creating new contact (e.g., from WhatsApp conversation) */
  defaultPhone?: string
  /** Pre-fill name when creating new contact (e.g., from WhatsApp profile) */
  defaultName?: string
}

export function ContactSelector({
  contacts,
  value,
  onChange,
  onContactCreated,
  disabled,
  defaultPhone,
  defaultName,
}: ContactSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [isCreating, setIsCreating] = React.useState(false)
  const [newContact, setNewContact] = React.useState({ name: '', phone: '', city: '' })
  const [createError, setCreateError] = React.useState<string | null>(null)

  const selectedContact = React.useMemo(() => {
    return contacts.find((c) => c.id === value) || null
  }, [contacts, value])

  const handleCreateContact = async () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) {
      setCreateError('Nombre y teléfono son requeridos')
      return
    }

    setIsCreating(true)
    setCreateError(null)

    const result = await createContact({
      name: newContact.name.trim(),
      phone: newContact.phone.trim(),
      city: newContact.city.trim() || undefined,
    })

    setIsCreating(false)

    if ('error' in result) {
      setCreateError(result.error)
      return
    }

    toast.success(`Contacto "${result.data.name}" creado`)
    onChange(result.data.id)
    onContactCreated?.({ ...result.data, tags: [] })
    setShowCreateDialog(false)
    setNewContact({ name: '', phone: '', city: '' })
    setOpen(false)
  }

  const openCreateDialog = () => {
    // Pre-fill with search term, defaultPhone and defaultName
    const phoneToUse = defaultPhone || ''
    const nameToUse = defaultName || ''
    if (search && !/^\d+$/.test(search)) {
      // Search term is text - use it as name
      setNewContact({ name: search, phone: phoneToUse, city: '' })
    } else if (search && /^\d+$/.test(search)) {
      // Search term is numeric - use it as phone
      setNewContact({ name: nameToUse, phone: search || phoneToUse, city: '' })
    } else {
      // No search - use defaults
      setNewContact({ name: nameToUse, phone: phoneToUse, city: '' })
    }
    setCreateError(null)
    setShowCreateDialog(true)
  }

  // Filter contacts by search
  const filteredContacts = React.useMemo(() => {
    if (!search) return contacts.slice(0, 50)
    const searchLower = search.toLowerCase()
    return contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.phone.includes(search)
      )
      .slice(0, 50)
  }, [contacts, search])

  const handleSelect = (contactId: string) => {
    onChange(contactId === value ? null : contactId)
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10"
          disabled={disabled}
        >
          {selectedContact ? (
            <div className="flex items-center gap-2 flex-1 text-left">
              <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="font-medium truncate">{selectedContact.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatPhoneDisplay(selectedContact.phone)}
                  {selectedContact.city && ` - ${selectedContact.city}`}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">Seleccionar contacto...</span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {selectedContact && (
              <span
                role="button"
                tabIndex={0}
                className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                onClick={handleClear}
                onKeyDown={(e) => e.key === 'Enter' && handleClear(e as unknown as React.MouseEvent)}
              >
                <XIcon className="h-3 w-3" />
                <span className="sr-only">Limpiar</span>
              </span>
            )}
            <ChevronsUpDownIcon className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre o telefono..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {/* Create new contact option - always visible */}
            <CommandGroup>
              <CommandItem
                onSelect={openCreateDialog}
                className="flex items-center gap-2 text-primary"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Crear nuevo contacto</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandEmpty>
              <div className="py-4 text-center text-sm text-muted-foreground">
                No se encontraron contactos
              </div>
            </CommandEmpty>
            <CommandGroup heading={`Contactos (${filteredContacts.length})`}>
              {filteredContacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={contact.id}
                  onSelect={handleSelect}
                  className="flex items-center gap-2"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{contact.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatPhoneDisplay(contact.phone)}
                        {contact.city && ` - ${contact.city}`}
                      </div>
                    </div>
                  </div>
                  <CheckIcon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      value === contact.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>

      {/* Create contact dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Crear contacto</DialogTitle>
            <DialogDescription>
              Crea un nuevo contacto para asociar al pedido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {createError && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {createError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-contact-name">Nombre *</Label>
              <Input
                id="new-contact-name"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Nombre del cliente"
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-contact-phone">Teléfono *</Label>
              <Input
                id="new-contact-phone"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="3001234567"
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-contact-city">Ciudad</Label>
              <Input
                id="new-contact-city"
                value={newContact.city}
                onChange={(e) => setNewContact({ ...newContact, city: e.target.value })}
                placeholder="Bogotá"
                disabled={isCreating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isCreating}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateContact} disabled={isCreating}>
              {isCreating && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
              Crear contacto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Popover>
  )
}
