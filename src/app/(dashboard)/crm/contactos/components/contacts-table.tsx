'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SearchIcon, Upload, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
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
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentTagIds: string[]
}

export function ContactsTable({
  contacts,
  tags,
  customFields,
  total,
  page,
  pageSize,
  currentSearch,
  currentTagIds,
}: ContactsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState(currentSearch)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingContact, setEditingContact] = React.useState<ContactWithTags | null>(null)
  const [tagManagerOpen, setTagManagerOpen] = React.useState(false)
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null)

  // Build URL with updated params
  const buildUrl = React.useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    return `/crm/contactos?${params.toString()}`
  }, [searchParams])

  // Debounced search — update URL after 300ms
  React.useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      if (search !== currentSearch) {
        router.push(buildUrl({ q: search || undefined, page: undefined }))
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, currentSearch, router, buildUrl])

  // Tag filter → update URL immediately
  const handleTagSelectionChange = React.useCallback((tagIds: string[]) => {
    const tagsParam = tagIds.length > 0 ? tagIds.join(',') : undefined
    router.push(buildUrl({ tags: tagsParam, page: undefined }))
  }, [router, buildUrl])

  // Clear row selection when page data changes
  React.useEffect(() => {
    setRowSelection({})
  }, [contacts])

  // Get selected contact IDs
  const selectedIds = useSelectedRowIds(contacts, rowSelection)

  // Pagination
  const totalPages = Math.ceil(total / pageSize)
  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, total)

  const goToPage = React.useCallback((newPage: number) => {
    router.push(buildUrl({ page: newPage > 1 ? String(newPage) : undefined }))
  }, [router, buildUrl])

  // Memoize columns
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
            router.refresh()
          }
        },
        onViewDetail: (contact) => {
          router.push(`/crm/contactos/${contact.id}`)
        },
      }),
    [router]
  )

  // Bulk actions
  const handleBulkDelete = async () => {
    if (!confirm(`Eliminar ${selectedIds.length} contacto(s)?`)) return
    const result = await deleteContacts(selectedIds)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`${selectedIds.length} contacto(s) eliminado(s)`)
      setRowSelection({})
      router.refresh()
    }
  }

  const handleBulkAddTag = async (tagId: string) => {
    const result = await bulkAddTag(selectedIds, tagId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Etiqueta agregada')
      router.refresh()
    }
  }

  const handleBulkRemoveTag = async (tagId: string) => {
    const result = await bulkRemoveTag(selectedIds, tagId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Etiqueta removida')
      router.refresh()
    }
  }

  // Dialog handlers
  const handleDialogClose = () => {
    setDialogOpen(false)
    setEditingContact(null)
  }

  const handleCreateSuccess = () => {
    handleDialogClose()
    toast.success(editingContact ? 'Contacto actualizado' : 'Contacto creado')
    router.refresh()
  }

  const hasFilters = currentTagIds.length > 0 || currentSearch.length > 0

  // Empty state: only when NO contacts exist at all (no filters active)
  if (total === 0 && !hasFilters) {
    return (
      <>
        <EmptyState onCreateClick={() => setDialogOpen(true)} />
        <ContactDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleCreateSuccess}
        />
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
            filteredContacts={contacts}
            customFields={customFields}
            hasFilters={hasFilters}
          />
        </div>
      </div>

      {/* Tag filter and manager */}
      <TagFilter
        tags={tags}
        selectedTagIds={currentTagIds}
        onSelectionChange={handleTagSelectionChange}
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

      {/* Data table — no client-side search filtering, data is already server-filtered */}
      <DataTable
        columns={columns}
        data={contacts}
        onRowSelectionChange={setRowSelection}
      />

      {/* Pagination controls */}
      {total > 0 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {startItem}-{endItem} de {total.toLocaleString()} contactos
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeftIcon className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Pagina {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Siguiente
              <ChevronRightIcon className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

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
