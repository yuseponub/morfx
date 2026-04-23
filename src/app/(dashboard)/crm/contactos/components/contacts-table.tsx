'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SearchIcon, Upload, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable, useSelectedRowIds } from '@/components/ui/data-table'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'
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
  const v2 = useDashboardV2()
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
        v2,
      }),
    [router, v2]
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
        <EmptyState onCreateClick={() => setDialogOpen(true)} v2={v2} />
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
          <Button
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
            className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
          >
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
      <div className={v2 ? 'flex items-center gap-3 flex-wrap' : 'flex items-center gap-4'}>
        <div className={cn('relative', v2 ? 'flex-1 max-w-[320px]' : 'flex-1 max-w-sm')}>
          <SearchIcon
            className={cn(
              'absolute top-1/2 -translate-y-1/2',
              v2
                ? 'left-[10px] h-[14px] w-[14px] text-[var(--ink-3)]'
                : 'left-3 h-4 w-4 text-muted-foreground'
            )}
          />
          <Input
            placeholder={v2 ? 'Buscar por nombre, teléfono o ciudad…' : 'Buscar contactos...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              v2
                ? 'pl-[30px] bg-[var(--paper-0)] border-[var(--border)] rounded-[var(--radius-3)] text-[13px]'
                : 'pl-9'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
            className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
          >
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
      <div
        className={cn(
          v2 &&
            'bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] overflow-hidden [&_table]:border-collapse [&_thead_th]:bg-[var(--paper-1)] [&_thead_th]:border-b [&_thead_th]:border-[var(--ink-1)] [&_thead_th]:text-[10px] [&_thead_th]:uppercase [&_thead_th]:tracking-[0.08em] [&_thead_th]:text-[var(--ink-3)] [&_thead_th]:font-semibold [&_tbody_tr:hover]:bg-[var(--paper-2)] [&_tbody_td]:border-b [&_tbody_td]:border-[var(--border)] [&_tbody_td]:text-[13px] [&_tbody_td]:text-[var(--ink-1)]'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        <DataTable
          columns={columns}
          data={contacts}
          onRowSelectionChange={setRowSelection}
        />
      </div>

      {/* Pagination controls */}
      {total > 0 && (
        <div className={cn('flex items-center justify-between', v2 ? 'px-3 pt-3 border-t border-[var(--border)]' : 'px-2')}>
          <p
            className={cn(v2 ? 'text-[12px] text-[var(--ink-3)]' : 'text-sm text-muted-foreground')}
            style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
          >
            Mostrando {startItem}-{endItem} de {total.toLocaleString()} contactos
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
            >
              <ChevronLeftIcon className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <span
              className={cn(v2 ? 'text-[12px] text-[var(--ink-3)]' : 'text-sm text-muted-foreground')}
              style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
            >
              Pagina {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
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
