'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  SearchIcon,
  Upload,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Tag as TagIcon,
  Settings as SettingsIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable, useSelectedRowIds } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  createColumns,
  renderEditorialTags,
  formatEditorialDate,
  resolveCityLabel,
} from './columns'
import { EmptyState } from './empty-state'
import { BulkActions } from './bulk-actions'
import { ContactDialog } from './contact-dialog'
import { TagFilter } from './tag-filter'
import { TagManager } from './tag-manager'
import { CsvImportDialog } from './csv-import-dialog'
import { CsvExportButton } from './csv-export-button'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { formatPhoneDisplay } from '@/lib/utils/phone'
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
  /**
   * Editorial v3 flag (standalone ui-redesign-editorial-core, Plan 02).
   * When true, renders the editorial `table.dict` markup that resolves
   * against the `.theme-editorial-v3` scope wired on the dashboard <main>
   * (Plan 00). Default false → legacy shadcn DataTable path is byte-identical
   * (Regla 6, fail-closed).
   */
  v3?: boolean
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
  v3 = false,
}: ContactsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = React.useState(currentSearch)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingContact, setEditingContact] = React.useState<ContactWithTags | null>(null)
  const [tagManagerOpen, setTagManagerOpen] = React.useState(false)
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)
  const [tagFilterOpen, setTagFilterOpen] = React.useState(false)
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null)

  // Locate the `.theme-editorial-v3` wrapper so Radix DropdownMenu/Popover can
  // re-root inside the editorial token scope (same pattern as the inbox v3 —
  // conversation-list.tsx). The dashboard <main> carries `.theme-editorial-v3`
  // (layout.tsx); there is no data-module on CRM, so we match by class. When v3
  // is false the ref stays null → Radix falls back to the default body portal
  // (legacy path byte-identical, Regla 6).
  const themeContainerRef = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!v3) return
    themeContainerRef.current = document.querySelector(
      '.theme-editorial-v3'
    ) as HTMLElement | null
  }, [v3])

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

  // Row-action handlers — single source of truth shared by the legacy
  // DataTable columns (via createColumns) AND the v3 row dropdown. No logic
  // duplication between branches (avoids drift).
  const handleEditContact = React.useCallback((contact: ContactWithTags) => {
    setEditingContact(contact)
    setDialogOpen(true)
  }, [])

  const handleDeleteContact = React.useCallback(
    async (contact: ContactWithTags) => {
      if (!confirm(`Eliminar contacto "${contact.name}"?`)) return
      const result = await deleteContact(contact.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Contacto eliminado')
        router.refresh()
      }
    },
    [router]
  )

  const handleViewDetail = React.useCallback(
    (contact: ContactWithTags) => {
      router.push(`/crm/contactos/${contact.id}`)
    },
    [router]
  )

  // Memoize columns — consume the shared row-action callbacks above so the
  // legacy DataTable keeps identical behavior.
  const columns = React.useMemo(
    () =>
      createColumns({
        onEdit: handleEditContact,
        onDelete: handleDeleteContact,
        onViewDetail: handleViewDetail,
      }),
    [handleEditContact, handleDeleteContact, handleViewDetail]
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
        <EmptyState v3={v3} onCreateClick={() => setDialogOpen(true)} />
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
          <button
            type="button"
            className={v3 ? 'btn' : undefined}
            onClick={() => setImportDialogOpen(true)}
          >
            {v3 ? null : <Upload className="h-4 w-4 mr-2 inline-block" />}
            Importar desde CSV
          </button>
        </div>
      </>
    )
  }

  // =========================================================================
  // Editorial v3 branch (standalone ui-redesign-editorial-core, Plan 02).
  // Verbatim port of `ui_kits/crm/crm-editorial.html`: the topbar (eyebrow +
  // h1 + Importar/Exportar/Nuevo), tabs (.tabs), toolbar (.search + .chip),
  // the dictionary table (table.dict + cell variants .entry/.ph/.city/.date +
  // MxTag tags), and the pager (.pager + mono range + Anterior/Siguiente).
  //
  // ALL data wiring is preserved: the same `contacts` data, the same
  // debounced `search` state, the same `handleTagSelectionChange` filter
  // handler, the same `goToPage` pagination, the same row-selection +
  // bulk-action handlers, and the same CSV import/export + create-contact
  // triggers. Markup + classes only (D-08). The legacy shadcn DataTable
  // path below is byte-untouched (Regla 6).
  // =========================================================================
  if (v3) {
    const allSelectedOnPage =
      contacts.length > 0 &&
      contacts.every((c) => rowSelection[c.id])
    const someSelectedOnPage = contacts.some((c) => rowSelection[c.id])

    const toggleAll = (checked: boolean) => {
      const next: RowSelectionState = {}
      if (checked) {
        for (const c of contacts) next[c.id] = true
      }
      setRowSelection(next)
    }
    const toggleOne = (id: string, checked: boolean) => {
      setRowSelection((prev) => {
        const next = { ...prev }
        if (checked) next[id] = true
        else delete next[id]
        return next
      })
    }

    // Filter chips wired to the existing tag-filter URL state. "Todos" clears
    // the tag filter; each named chip toggles its matching workspace tag (by
    // normalized name) through the same handler the legacy TagFilter uses.
    const findTagByNames = (names: string[]): Tag | undefined =>
      tags.find((t) => names.includes((t.name || '').toLowerCase().trim()))
    const clienteTag = findTagByNames(['cliente', 'clientes'])
    const leadTag = findTagByNames(['lead', 'leads', 'prospecto', 'prospectos'])
    const mayoristaTag = findTagByNames([
      'mayorista',
      'mayoristas',
      'distribuidor',
      'distribuidores',
    ])
    const isChipOn = (tag: Tag | undefined) =>
      !!tag && currentTagIds.length === 1 && currentTagIds[0] === tag.id
    const setChip = (tag: Tag | undefined) =>
      handleTagSelectionChange(tag ? [tag.id] : [])

    return (
      <>
        <header className="topbar">
          <div>
            <div className="eye">CRM · Directorio</div>
            <h1>
              Contactos <em>{total.toLocaleString('es-CO')} registros</em>
            </h1>
          </div>
          <div className="actions">
            <ThemeToggle />
            <button
              type="button"
              className="btn"
              onClick={() => setImportDialogOpen(true)}
            >
              Importar
            </button>
            <CsvExportButton
              v3
              allContacts={contacts}
              filteredContacts={contacts}
              customFields={customFields}
              hasFilters={hasFilters}
            />
            <button
              type="button"
              className="btn pri"
              onClick={() => setDialogOpen(true)}
            >
              Nuevo contacto
            </button>
          </div>
        </header>

        <nav className="tabs">
          <a
            className={currentTagIds.length === 0 ? 'on' : undefined}
            role="button"
            tabIndex={0}
            onClick={() => setChip(undefined)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setChip(undefined)
            }}
          >
            Todos
          </a>
          <a
            className={isChipOn(clienteTag) ? 'on' : undefined}
            role="button"
            tabIndex={0}
            onClick={() => setChip(clienteTag)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setChip(clienteTag)
            }}
          >
            Clientes
          </a>
          <a
            className={isChipOn(leadTag) ? 'on' : undefined}
            role="button"
            tabIndex={0}
            onClick={() => setChip(leadTag)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setChip(leadTag)
            }}
          >
            Leads
          </a>
          <a
            className={isChipOn(mayoristaTag) ? 'on' : undefined}
            role="button"
            tabIndex={0}
            onClick={() => setChip(mayoristaTag)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setChip(mayoristaTag)
            }}
          >
            Mayoristas
          </a>
        </nav>

        <div className="page">
          <div className="toolbar">
            <div className="search">
              <SearchIcon
                width={14}
                height={14}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-3)',
                }}
              />
              <input
                type="search"
                placeholder="Buscar contacto, teléfono o ciudad…"
                aria-label="Buscar contactos"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={currentTagIds.length === 0 ? 'chip on' : 'chip'}
              onClick={() => setChip(undefined)}
            >
              Todos
            </button>
            <button
              type="button"
              className={isChipOn(clienteTag) ? 'chip on' : 'chip'}
              onClick={() => setChip(clienteTag)}
            >
              Clientes
            </button>
            <button
              type="button"
              className={isChipOn(leadTag) ? 'chip on' : 'chip'}
              onClick={() => setChip(leadTag)}
            >
              Leads
            </button>
            <button
              type="button"
              className={isChipOn(mayoristaTag) ? 'chip on' : 'chip'}
              onClick={() => setChip(mayoristaTag)}
            >
              Mayoristas
            </button>

            {/* Dynamic tag filter (C-2): multi-select popover over ANY
                workspace tag, wired to the same ?tags= URL state as the
                legacy TagFilter. The 4 quick chips above stay as shortcuts. */}
            <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn('chip', currentTagIds.length > 0 && 'on')}
                  title="Filtrar por etiqueta"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <TagIcon width={12} height={12} aria-hidden />
                  {currentTagIds.length > 0
                    ? `${currentTagIds.length} etiqueta${currentTagIds.length > 1 ? 's' : ''}`
                    : 'Etiqueta'}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[220px] p-2"
                align="start"
                portalContainer={themeContainerRef.current ?? undefined}
              >
                <div className="space-y-1">
                  {currentTagIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleTagSelectionChange([])}
                      className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent text-muted-foreground"
                    >
                      Quitar filtro
                    </button>
                  )}
                  {tags.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-2 py-1.5">
                      Sin etiquetas
                    </p>
                  ) : (
                    tags.map((tag) => {
                      const selected = currentTagIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            const next = selected
                              ? currentTagIds.filter((id) => id !== tag.id)
                              : [...currentTagIds, tag.id]
                            handleTagSelectionChange(next)
                          }}
                          className={cn(
                            'w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent flex items-center gap-2',
                            selected && 'bg-accent font-medium'
                          )}
                        >
                          <span
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </button>
                      )
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Manage tags (C-3): cables the trigger for the already-mounted
                <TagManager>. */}
            <button
              type="button"
              className="btn"
              onClick={() => setTagManagerOpen(true)}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <SettingsIcon width={14} height={14} aria-hidden />
              Gestionar etiquetas
            </button>
          </div>

          {/* Bulk actions toolbar — same handlers as legacy */}
          <BulkActions
            selectedCount={selectedIds.length}
            tags={tags}
            onAddTag={handleBulkAddTag}
            onRemoveTag={handleBulkRemoveTag}
            onDelete={handleBulkDelete}
            onClearSelection={() => setRowSelection({})}
          />

          <table className="dict">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={allSelectedOnPage}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          someSelectedOnPage && !allSelectedOnPage
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Ciudad</th>
                <th>Tags</th>
                <th>Última actividad</th>
                <th style={{ width: 40 }} aria-hidden />
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      padding: '32px 12px',
                      color: 'var(--ink-3)',
                      fontStyle: 'italic',
                      fontFamily: 'var(--font-serif)',
                    }}
                  >
                    Sin contactos.
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td style={{ width: 30 }}>
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${contact.name}`}
                        checked={!!rowSelection[contact.id]}
                        onChange={(e) => toggleOne(contact.id, e.target.checked)}
                      />
                    </td>
                    <td className="entry">
                      <Link
                        href={`/crm/contactos/${contact.id}`}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {contact.name}
                      </Link>
                    </td>
                    <td className="ph">{formatPhoneDisplay(contact.phone)}</td>
                    <td className="city">{resolveCityLabel(contact.city)}</td>
                    <td>{renderEditorialTags(contact.tags)}</td>
                    <td className="date">
                      {formatEditorialDate(contact.updated_at)}
                    </td>
                    <td style={{ width: 40, textAlign: 'right' }}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="btn"
                            aria-label="Acciones"
                            style={{ padding: '2px 6px' }}
                          >
                            <MoreHorizontalIcon width={14} height={14} aria-hidden />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          portalContainer={themeContainerRef.current ?? undefined}
                        >
                          <DropdownMenuItem
                            onSelect={() => handleViewDetail(contact)}
                          >
                            Ver detalles
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => handleEditContact(contact)}
                          >
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => handleDeleteContact(contact)}
                            style={{ color: 'var(--viv-red, var(--ink-1))' }}
                          >
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {total > 0 && (
            <div className="pager">
              <span className="pg">
                {startItem.toLocaleString('es-CO')}–
                {endItem.toLocaleString('es-CO')} de{' '}
                {total.toLocaleString('es-CO')}
              </span>
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dialogs — shared with the legacy path, untouched wiring */}
        <ContactDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          contact={editingContact}
          onSuccess={handleCreateSuccess}
        />
        <TagManager
          open={tagManagerOpen}
          onOpenChange={setTagManagerOpen}
          tags={tags}
        />
        <CsvImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImportComplete={() => router.refresh()}
        />
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
