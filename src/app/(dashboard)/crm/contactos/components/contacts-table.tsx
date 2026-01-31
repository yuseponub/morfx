'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon, Upload } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable, useSelectedRowIds } from '@/components/ui/data-table'
import { createColumns } from './columns'
import { EmptyState } from './empty-state'
import { BulkActions } from './bulk-actions'
import { ContactDialog } from './contact-dialog'
import { TagFilter } from './tag-filter'
import { TagManager } from './tag-manager'
import { CsvImportDialog } from './csv-import-dialog'
import { CsvExportButton } from './csv-export-button'
import type { ContactWithTags, Tag, CustomFieldDefinition } from '@/lib/types/database'
import { deleteContact, deleteContacts, bulkAddTag, bulkRemoveTag } from '@/app/actions/contacts'
import { toast } from 'sonner'
import { RowSelectionState } from '@tanstack/react-table'

interface ContactsTableProps {
  contacts: ContactWithTags[]
  tags: Tag[]
  customFields: CustomFieldDefinition[]
}

export function ContactsTable({ contacts, tags, customFields }: ContactsTableProps) {
  const router = useRouter()
  const [search, setSearch] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingContact, setEditingContact] = React.useState<ContactWithTags | null>(null)
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([])
  const [tagManagerOpen, setTagManagerOpen] = React.useState(false)
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)

  // Filter contacts by selected tags (client-side)
  // Show contacts that have ANY of the selected tags
  const filteredContacts = React.useMemo(() => {
    if (selectedTagIds.length === 0) {
      return contacts
    }
    return contacts.filter((contact) =>
      contact.tags.some((tag) => selectedTagIds.includes(tag.id))
    )
  }, [contacts, selectedTagIds])

  // Get selected contact IDs (use filteredContacts for correct mapping)
  const selectedIds = useSelectedRowIds(filteredContacts, rowSelection)

  // Memoize columns to prevent infinite re-renders
  const columns = React.useMemo(
    () =>
      createColumns({
        onEdit: (contact) => {
          setEditingContact(contact)
          setDialogOpen(true)
        },
        onDelete: async (contact) => {
          if (!confirm(`Eliminar contacto "${contact.name}"?`)) return

          const result = await deleteContact(contact.id)
          if ('error' in result) {
            toast.error(result.error)
          } else {
            toast.success('Contacto eliminado')
          }
        },
        onViewDetail: (contact) => {
          router.push(`/crm/contactos/${contact.id}`)
        },
      }),
    [router]
  )

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (!confirm(`Eliminar ${selectedIds.length} contacto(s)?`)) return

    const result = await deleteContacts(selectedIds)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`${selectedIds.length} contacto(s) eliminado(s)`)
      setRowSelection({})
    }
  }

  // Handle bulk add tag
  const handleBulkAddTag = async (tagId: string) => {
    const result = await bulkAddTag(selectedIds, tagId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Etiqueta agregada')
    }
  }

  // Handle bulk remove tag
  const handleBulkRemoveTag = async (tagId: string) => {
    const result = await bulkRemoveTag(selectedIds, tagId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Etiqueta removida')
    }
  }

  // Handle dialog close and success
  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingContact(null)
  }

  const handleCreateSuccess = () => {
    handleDialogClose()
    toast.success(editingContact ? 'Contacto actualizado' : 'Contacto creado')
  }

  // Determine if filters are active (tag filter or search)
  const hasFilters = selectedTagIds.length > 0 || search.trim().length > 0

  // Show empty state if no contacts
  if (contacts.length === 0) {
    return (
      <>
        <EmptyState onCreateClick={() => setDialogOpen(true)} />
        <ContactDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleCreateSuccess}
        />
        {/* Import dialog available even with no contacts */}
        <CsvImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImportComplete={() => router.refresh()}
        />
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar desde CSV
          </Button>
        </div>
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search and import/export buttons */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contactos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <CsvExportButton
            allContacts={contacts}
            filteredContacts={filteredContacts}
            customFields={customFields}
            hasFilters={hasFilters}
          />
        </div>
      </div>

      {/* Tag filter and manager */}
      <TagFilter
        tags={tags}
        selectedTagIds={selectedTagIds}
        onSelectionChange={setSelectedTagIds}
        onManageTags={() => setTagManagerOpen(true)}
      />

      {/* Bulk actions toolbar */}
      <BulkActions
        selectedCount={selectedIds.length}
        tags={tags}
        onAddTag={handleBulkAddTag}
        onRemoveTag={handleBulkRemoveTag}
        onDelete={handleBulkDelete}
        onClearSelection={() => setRowSelection({})}
      />

      {/* Data table */}
      <DataTable
        columns={columns}
        data={filteredContacts}
        onRowSelectionChange={setRowSelection}
        searchColumn="name"
        searchValue={search}
      />

      {/* Edit dialog */}
      <ContactDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        contact={editingContact}
        onSuccess={handleCreateSuccess}
      />

      {/* Tag manager */}
      <TagManager
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
        tags={tags}
      />

      {/* CSV import dialog */}
      <CsvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => router.refresh()}
      />
    </div>
  )
}
