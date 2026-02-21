'use client'

import { useState, useRef, useCallback, useMemo, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  History,
  Sparkles,
  X,
  ChevronDown,
  ChevronRight,
  GripVertical,
  FolderPlus,
  FolderOpen,
  FolderClosed,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { DragDropProvider, DragOverlay, useDroppable } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { move } from '@dnd-kit/helpers'
import { CollisionPriority } from '@dnd-kit/abstract'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  toggleAutomation,
  duplicateAutomation,
  deleteAutomation as deleteAutomationAction,
  createFolder as createFolderAction,
  renameFolder as renameFolderAction,
  deleteFolder as deleteFolderAction,
  toggleFolderCollapse,
  reorderFolders,
  reorderAutomations,
  moveAutomation,
  getFolderAutomationNames,
} from '@/app/actions/automations'
import { TRIGGER_CATALOG } from '@/lib/automations/constants'
import type { Automation, AutomationFolder } from '@/lib/automations/types'

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  CRM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  WhatsApp: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Tareas: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  Shopify: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  Logistica: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  success: { label: 'Exitosa', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
  failed: { label: 'Fallida', color: 'text-red-600 dark:text-red-400', icon: XCircle },
  running: { label: 'Ejecutando', color: 'text-yellow-600 dark:text-yellow-400', icon: Loader2 },
  cancelled: { label: 'Cancelada', color: 'text-muted-foreground', icon: XCircle },
}

type FilterCategory = 'all' | 'CRM' | 'WhatsApp' | 'Tareas' | 'Shopify'

// ============================================================================
// Helpers
// ============================================================================

function getTriggerInfo(triggerType: string) {
  const found = TRIGGER_CATALOG.find((t) => t.type === triggerType)
  return found ?? { label: triggerType, category: 'CRM', description: '' }
}

function formatRelativeTime(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Hace un momento'
  if (diffMin < 60) return `Hace ${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `Hace ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `Hace ${diffDays}d`
  return date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
}

function buildItemsMap(
  automations: Automation[],
  folders: AutomationFolder[]
): Record<string, string[]> {
  const result: Record<string, string[]> = { root: [] }
  folders.forEach((f) => { result[f.id] = [] })
  const sorted = [...automations].sort((a, b) => a.position - b.position)
  sorted.forEach((a) => {
    const group = a.folder_id ?? 'root'
    if (!result[group]) result[group] = []
    result[group].push(a.id)
  })
  return result
}

// ============================================================================
// SortableAutomationRow
// ============================================================================

function SortableAutomationRow({
  automation,
  index,
  group,
  folders,
  currentFolderId,
  isToggling,
  isPending,
  onToggle,
  onDuplicate,
  onDelete,
  onMoveToFolder,
}: {
  automation: Automation
  index: number
  group: string
  folders: AutomationFolder[]
  currentFolderId: string | null
  isToggling: boolean
  isPending: boolean
  onToggle: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMoveToFolder: (folderId: string | null) => void
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: automation.id,
    index,
    group,
    type: 'automation',
    accept: 'automation',
  })

  const trigger = getTriggerInfo(automation.trigger_type)
  const categoryColor = CATEGORY_COLORS[trigger.category] ?? CATEGORY_COLORS.CRM
  const lastStatus = (automation as Automation & { _lastExecutionStatus?: string | null })
    ._lastExecutionStatus
  const statusInfo = lastStatus ? STATUS_CONFIG[lastStatus] : null

  return (
    <div
      ref={ref}
      className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg bg-card transition-opacity ${
        isDragSource ? 'opacity-30' : ''
      } ${!automation.is_enabled ? 'opacity-50' : ''}`}
    >
      {/* Drag handle */}
      <button ref={handleRef} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium truncate block">{automation.name}</span>
        {automation.description && (
          <span className="text-xs text-muted-foreground truncate block">{automation.description}</span>
        )}
      </div>

      {/* Badges */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${categoryColor}`}>
          {trigger.label}
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {automation.actions.length} acc
        </Badge>
      </div>

      {/* Last execution */}
      <div className="hidden md:flex items-center gap-1 text-xs shrink-0 min-w-[100px]">
        {statusInfo ? (
          <>
            <statusInfo.icon className={`h-3 w-3 ${statusInfo.color}`} />
            <span className={statusInfo.color}>{statusInfo.label}</span>
            <span className="text-muted-foreground">{formatRelativeTime(automation.updated_at)}</span>
          </>
        ) : (
          <>
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Sin ejec.</span>
          </>
        )}
      </div>

      {/* Toggle */}
      <Switch
        checked={automation.is_enabled}
        onCheckedChange={onToggle}
        disabled={isToggling || isPending}
        size="sm"
        className="shrink-0"
      />

      {/* Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/automatizaciones/${automation.id}/editar`}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </DropdownMenuItem>
          {folders.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRight className="h-4 w-4 mr-2" />
                Mover a carpeta
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => onMoveToFolder(null)}
                  disabled={currentFolderId === null}
                >
                  Sin carpeta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {folders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onClick={() => onMoveToFolder(f.id)}
                    disabled={currentFolderId === f.id}
                  >
                    {f.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ============================================================================
// Static AutomationRow (for filtered view, no DnD)
// ============================================================================

function StaticAutomationRow({
  automation,
  folders,
  currentFolderId,
  isToggling,
  isPending,
  onToggle,
  onDuplicate,
  onDelete,
  onMoveToFolder,
}: {
  automation: Automation
  folders: AutomationFolder[]
  currentFolderId: string | null
  isToggling: boolean
  isPending: boolean
  onToggle: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMoveToFolder: (folderId: string | null) => void
}) {
  const trigger = getTriggerInfo(automation.trigger_type)
  const categoryColor = CATEGORY_COLORS[trigger.category] ?? CATEGORY_COLORS.CRM
  const lastStatus = (automation as Automation & { _lastExecutionStatus?: string | null })
    ._lastExecutionStatus
  const statusInfo = lastStatus ? STATUS_CONFIG[lastStatus] : null

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg bg-card ${
        !automation.is_enabled ? 'opacity-50' : ''
      }`}
    >
      <div className="w-5 shrink-0" />

      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium truncate block">{automation.name}</span>
        {automation.description && (
          <span className="text-xs text-muted-foreground truncate block">{automation.description}</span>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${categoryColor}`}>
          {trigger.label}
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {automation.actions.length} acc
        </Badge>
      </div>

      <div className="hidden md:flex items-center gap-1 text-xs shrink-0 min-w-[100px]">
        {statusInfo ? (
          <>
            <statusInfo.icon className={`h-3 w-3 ${statusInfo.color}`} />
            <span className={statusInfo.color}>{statusInfo.label}</span>
            <span className="text-muted-foreground">{formatRelativeTime(automation.updated_at)}</span>
          </>
        ) : (
          <>
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Sin ejec.</span>
          </>
        )}
      </div>

      <Switch
        checked={automation.is_enabled}
        onCheckedChange={onToggle}
        disabled={isToggling || isPending}
        size="sm"
        className="shrink-0"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/automatizaciones/${automation.id}/editar`}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicar
          </DropdownMenuItem>
          {folders.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRight className="h-4 w-4 mr-2" />
                Mover a carpeta
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => onMoveToFolder(null)}
                  disabled={currentFolderId === null}
                >
                  Sin carpeta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {folders.map((f) => (
                  <DropdownMenuItem
                    key={f.id}
                    onClick={() => onMoveToFolder(f.id)}
                    disabled={currentFolderId === f.id}
                  >
                    {f.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ============================================================================
// SortableFolderRow
// ============================================================================

function SortableFolderRow({
  folder,
  index,
  automationCount,
  isCollapsed,
  onToggleCollapse,
  onRename,
  onDelete,
  children,
}: {
  folder: AutomationFolder
  index: number
  automationCount: number
  isCollapsed: boolean
  onToggleCollapse: () => void
  onRename: () => void
  onDelete: () => void
  children: React.ReactNode
}) {
  const { ref, handleRef, isDragSource } = useSortable({
    id: folder.id,
    index,
    type: 'folder',
    accept: ['folder', 'automation'],
    collisionPriority: CollisionPriority.Low,
  })

  const FolderIcon = isCollapsed ? FolderClosed : FolderOpen

  return (
    <div
      ref={ref}
      className={`border rounded-lg overflow-hidden transition-opacity ${isDragSource ? 'opacity-30' : ''}`}
    >
      {/* Folder header */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/50">
        <button ref={handleRef} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground shrink-0">
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{folder.name}</span>
        </button>

        <span className="text-xs text-muted-foreground shrink-0">
          {automationCount} automatizacion{automationCount !== 1 ? 'es' : ''}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="h-4 w-4 mr-2" />
              Renombrar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar carpeta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Folder children */}
      {!isCollapsed && (
        <div className="px-3 py-2 space-y-1.5 bg-muted/20 min-h-[40px]">
          {children}
          {automationCount === 0 && (
            <div className="text-xs text-muted-foreground text-center py-3">
              Arrastra automatizaciones aqui
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// RootDropZone
// ============================================================================

function RootDropZone({ children, hasItems }: { children: React.ReactNode; hasItems: boolean }) {
  const { ref } = useDroppable({
    id: 'root',
    accept: 'automation',
    collisionPriority: CollisionPriority.Low,
  })

  return (
    <div ref={ref} className="space-y-1.5 min-h-[40px]">
      {children}
      {!hasItems && (
        <div className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-lg">
          Automatizaciones sin carpeta
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface AutomationListProps {
  initialAutomations: Automation[]
  initialFolders: AutomationFolder[]
}

export function AutomationList({ initialAutomations, initialFolders }: AutomationListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Build automation lookup map
  const automationMap = useMemo(() => {
    const map = new Map<string, Automation>()
    initialAutomations.forEach((a) => map.set(a.id, a))
    return map
  }, [initialAutomations])

  // DnD state: Record<groupId, automationId[]>
  const [items, setItems] = useState(() => buildItemsMap(initialAutomations, initialFolders))
  const snapshot = useRef(structuredClone(items))

  // Folder state
  const [folderOrder, setFolderOrder] = useState(() =>
    [...initialFolders].sort((a, b) => a.position - b.position).map((f) => f.id)
  )
  const [folderMap, setFolderMap] = useState(() =>
    new Map(initialFolders.map((f) => [f.id, f]))
  )
  const [collapsed, setCollapsed] = useState(() =>
    new Set(initialFolders.filter((f) => f.is_collapsed).map((f) => f.id))
  )

  // UI state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('all')
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null)
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<AutomationFolder | null>(null)
  const [deleteFolderAutomationNames, setDeleteFolderAutomationNames] = useState<string[]>([])
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState('')

  const isFiltering = search.trim() !== '' || categoryFilter !== 'all'

  // Filtered flat list (when filtering is active)
  const filteredAutomations = useMemo(() => {
    if (!isFiltering) return null
    let result = initialAutomations
    if (search.trim()) {
      const lower = search.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(lower) ||
          (a.description && a.description.toLowerCase().includes(lower))
      )
    }
    if (categoryFilter !== 'all') {
      result = result.filter((a) => getTriggerInfo(a.trigger_type).category === categoryFilter)
    }
    return result
  }, [initialAutomations, search, categoryFilter, isFiltering])

  // Folder list for menus
  const allFolders = useMemo(
    () => folderOrder.map((id) => folderMap.get(id)!).filter(Boolean),
    [folderOrder, folderMap]
  )

  // ========================================================================
  // DnD handlers
  // ========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragStart = useCallback((_event: any) => {
    snapshot.current = structuredClone(items)
  }, [items])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragOver = useCallback((event: any) => {
    const source = event.operation?.source
    if (!source) return

    if (source.type === 'automation') {
      setItems((prev) => move(prev, event))
    } else if (source.type === 'folder') {
      setFolderOrder((prev) => move(prev, event))
    }
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragEnd = useCallback(
    (event: any) => {
      if (event.canceled) {
        setItems(snapshot.current)
        return
      }

      const source = event.operation?.source
      if (!source) return

      if (source.type === 'folder') {
        // Persist folder order
        reorderFolders(folderOrder).catch(() => toast.error('Error al reordenar carpetas'))
      } else if (source.type === 'automation') {
        // Persist automation positions
        const updates: { id: string; folder_id: string | null; position: number }[] = []
        for (const [groupId, ids] of Object.entries(items)) {
          ids.forEach((id, idx) => {
            updates.push({
              id,
              folder_id: groupId === 'root' ? null : groupId,
              position: (idx + 1) * 1000,
            })
          })
        }
        reorderAutomations(updates).catch(() => toast.error('Error al reordenar'))
      }
    },
    [items, folderOrder]
  )

  // ========================================================================
  // Automation handlers
  // ========================================================================

  async function handleToggle(automation: Automation) {
    setTogglingIds((prev) => new Set(prev).add(automation.id))
    try {
      const result = await toggleAutomation(automation.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(result.data.is_enabled ? 'Activada' : 'Desactivada')
        startTransition(() => router.refresh())
      }
    } catch {
      toast.error('Error al cambiar estado')
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(automation.id)
        return next
      })
    }
  }

  async function handleDuplicate(automation: Automation) {
    try {
      const result = await duplicateAutomation(automation.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(`"${result.data.name}" creada`)
        startTransition(() => router.refresh())
      }
    } catch {
      toast.error('Error al duplicar')
    }
  }

  async function handleDeleteAutomation() {
    if (!deleteTarget) return
    try {
      const result = await deleteAutomationAction(deleteTarget.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        // Update local state
        setItems((prev) => {
          const next = { ...prev }
          for (const key of Object.keys(next)) {
            next[key] = next[key].filter((id) => id !== deleteTarget.id)
          }
          return next
        })
        toast.success('Automatizacion eliminada')
      }
    } catch {
      toast.error('Error al eliminar')
    } finally {
      setDeleteTarget(null)
    }
  }

  async function handleMoveToFolder(automationId: string, targetFolderId: string | null) {
    // Find current group
    let currentGroup: string | null = null
    for (const [groupId, ids] of Object.entries(items)) {
      if (ids.includes(automationId)) {
        currentGroup = groupId
        break
      }
    }
    if (!currentGroup) return

    const targetGroup = targetFolderId ?? 'root'
    if (currentGroup === targetGroup) return

    // Update local state
    setItems((prev) => {
      const next = { ...prev }
      next[currentGroup!] = next[currentGroup!].filter((id) => id !== automationId)
      if (!next[targetGroup]) next[targetGroup] = []
      next[targetGroup] = [...next[targetGroup], automationId]
      return next
    })

    // Persist
    const targetItems = items[targetGroup] ?? []
    const newPosition = targetItems.length > 0
      ? (targetItems.length + 1) * 1000
      : 1000

    try {
      const result = await moveAutomation(automationId, targetFolderId, newPosition)
      if ('error' in result) {
        toast.error(result.error)
        // Rollback
        setItems((prev) => {
          const next = { ...prev }
          next[targetGroup] = next[targetGroup].filter((id) => id !== automationId)
          if (!next[currentGroup!]) next[currentGroup!] = []
          next[currentGroup!] = [...next[currentGroup!], automationId]
          return next
        })
      } else {
        toast.success('Automatizacion movida')
      }
    } catch {
      toast.error('Error al mover')
    }
  }

  // ========================================================================
  // Folder handlers
  // ========================================================================

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    try {
      const result = await createFolderAction(newFolderName.trim())
      if ('error' in result) {
        toast.error(result.error)
      } else {
        const folder = result.data
        setFolderMap((prev) => new Map(prev).set(folder.id, folder))
        setFolderOrder((prev) => [...prev, folder.id])
        setItems((prev) => ({ ...prev, [folder.id]: [] }))
        toast.success('Carpeta creada')
      }
    } catch {
      toast.error('Error al crear carpeta')
    } finally {
      setCreatingFolder(false)
      setNewFolderName('')
    }
  }

  async function handleRenameFolder() {
    if (!renamingFolderId || !renameFolderName.trim()) return
    try {
      const result = await renameFolderAction(renamingFolderId, renameFolderName.trim())
      if ('error' in result) {
        toast.error(result.error)
      } else {
        setFolderMap((prev) => {
          const next = new Map(prev)
          next.set(result.data.id, result.data)
          return next
        })
        toast.success('Carpeta renombrada')
      }
    } catch {
      toast.error('Error al renombrar')
    } finally {
      setRenamingFolderId(null)
      setRenameFolderName('')
    }
  }

  async function handleDeleteFolderConfirm() {
    if (!deleteFolderTarget) return
    try {
      const result = await deleteFolderAction(deleteFolderTarget.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        setFolderOrder((prev) => prev.filter((id) => id !== deleteFolderTarget.id))
        setFolderMap((prev) => {
          const next = new Map(prev)
          next.delete(deleteFolderTarget.id)
          return next
        })
        setItems((prev) => {
          const next = { ...prev }
          delete next[deleteFolderTarget.id]
          return next
        })
        toast.success('Carpeta y automatizaciones eliminadas')
        startTransition(() => router.refresh())
      }
    } catch {
      toast.error('Error al eliminar carpeta')
    } finally {
      setDeleteFolderTarget(null)
      setDeleteFolderAutomationNames([])
    }
  }

  async function handleStartDeleteFolder(folder: AutomationFolder) {
    const names = await getFolderAutomationNames(folder.id)
    setDeleteFolderAutomationNames(names)
    setDeleteFolderTarget(folder)
  }

  function handleToggleCollapse(folderId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
    toggleFolderCollapse(folderId).catch(() => {})
  }

  function startRenameFolder(folder: AutomationFolder) {
    setRenamingFolderId(folder.id)
    setRenameFolderName(folder.name)
  }

  // ========================================================================
  // Category filter buttons
  // ========================================================================

  const categories: { value: FilterCategory; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'CRM', label: 'CRM' },
    { value: 'WhatsApp', label: 'WhatsApp' },
    { value: 'Tareas', label: 'Tareas' },
    { value: 'Shopify', label: 'Shopify' },
  ]

  // ========================================================================
  // Empty state
  // ========================================================================

  if (initialAutomations.length === 0 && initialFolders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Zap className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Sin automatizaciones</h2>
          <p className="text-muted-foreground max-w-sm">
            Crea tu primera automatizacion para ahorrar tiempo automatizando tareas repetitivas
          </p>
        </div>
        <Button asChild>
          <Link href="/automatizaciones/nueva">
            <Plus className="h-4 w-4 mr-2" />
            Crea tu primera automatizacion
          </Link>
        </Button>
      </div>
    )
  }

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automatizaciones</h1>
          <p className="text-muted-foreground">
            {initialAutomations.length} automatizacion{initialAutomations.length !== 1 ? 'es' : ''}
            {folderOrder.length > 0 && ` · ${folderOrder.length} carpeta${folderOrder.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/automatizaciones/builder">
              <Sparkles className="h-4 w-4 mr-2" />
              AI Builder
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/automatizaciones/historial">
              <History className="h-4 w-4 mr-2" />
              Historial
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreatingFolder(true)
              setNewFolderName('')
            }}
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            Nueva carpeta
          </Button>
          <Button size="sm" asChild>
            <Link href="/automatizaciones/nueva">
              <Plus className="h-4 w-4 mr-2" />
              Nueva automatizacion
            </Link>
          </Button>
        </div>
      </div>

      {/* Create folder inline */}
      {creatingFolder && (
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Nombre de la carpeta..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
            }}
            autoFocus
            className="max-w-xs"
          />
          <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
            Crear
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreatingFolder(false); setNewFolderName('') }}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Rename folder inline */}
      {renamingFolderId && (
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Nuevo nombre..."
            value={renameFolderName}
            onChange={(e) => setRenameFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameFolder()
              if (e.key === 'Escape') { setRenamingFolderId(null); setRenameFolderName('') }
            }}
            autoFocus
            className="max-w-xs"
          />
          <Button size="sm" onClick={handleRenameFolder} disabled={!renameFolderName.trim()}>
            Renombrar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setRenamingFolderId(null); setRenameFolderName('') }}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar automatizaciones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {categories.map((cat) => (
            <Button
              key={cat.value}
              variant={categoryFilter === cat.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter(cat.value)}
            >
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Main content */}
      {isFiltering ? (
        /* ── Filtered flat view (no folders, no DnD) ── */
        <div className="space-y-1.5">
          {filteredAutomations && filteredAutomations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No se encontraron automatizaciones con los filtros actuales
            </div>
          ) : (
            filteredAutomations?.map((automation) => (
              <StaticAutomationRow
                key={automation.id}
                automation={automation}
                folders={allFolders}
                currentFolderId={automation.folder_id}
                isToggling={togglingIds.has(automation.id)}
                isPending={isPending}
                onToggle={() => handleToggle(automation)}
                onDuplicate={() => handleDuplicate(automation)}
                onDelete={() => setDeleteTarget(automation)}
                onMoveToFolder={(fId) => handleMoveToFolder(automation.id, fId)}
              />
            ))
          )}
        </div>
      ) : (
        /* ── Folder + DnD view ── */
        <DragDropProvider
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-2">
            {/* Folders */}
            {folderOrder.map((folderId, folderIndex) => {
              const folder = folderMap.get(folderId)
              if (!folder) return null
              const folderItems = items[folderId] ?? []
              const isCollapsed = collapsed.has(folderId)

              return (
                <SortableFolderRow
                  key={folderId}
                  folder={folder}
                  index={folderIndex}
                  automationCount={folderItems.length}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={() => handleToggleCollapse(folderId)}
                  onRename={() => startRenameFolder(folder)}
                  onDelete={() => handleStartDeleteFolder(folder)}
                >
                  {folderItems.map((autoId, autoIndex) => {
                    const auto = automationMap.get(autoId)
                    if (!auto) return null
                    return (
                      <SortableAutomationRow
                        key={autoId}
                        automation={auto}
                        index={autoIndex}
                        group={folderId}
                        folders={allFolders}
                        currentFolderId={folderId}
                        isToggling={togglingIds.has(autoId)}
                        isPending={isPending}
                        onToggle={() => handleToggle(auto)}
                        onDuplicate={() => handleDuplicate(auto)}
                        onDelete={() => setDeleteTarget(auto)}
                        onMoveToFolder={(fId) => handleMoveToFolder(autoId, fId)}
                      />
                    )
                  })}
                </SortableFolderRow>
              )
            })}

            {/* Root automations */}
            <RootDropZone hasItems={(items.root ?? []).length > 0}>
              {(items.root ?? []).map((autoId, autoIndex) => {
                const auto = automationMap.get(autoId)
                if (!auto) return null
                return (
                  <SortableAutomationRow
                    key={autoId}
                    automation={auto}
                    index={autoIndex}
                    group="root"
                    folders={allFolders}
                    currentFolderId={null}
                    isToggling={togglingIds.has(autoId)}
                    isPending={isPending}
                    onToggle={() => handleToggle(auto)}
                    onDuplicate={() => handleDuplicate(auto)}
                    onDelete={() => setDeleteTarget(auto)}
                    onMoveToFolder={(fId) => handleMoveToFolder(autoId, fId)}
                  />
                )
              })}
            </RootDropZone>
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {(source) => {
              if (!source) return null
              if (source.type === 'folder') {
                const folder = folderMap.get(source.id as string)
                return folder ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted border rounded-lg shadow-lg">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{folder.name}</span>
                  </div>
                ) : null
              }
              const auto = automationMap.get(source.id as string)
              return auto ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-card border rounded-lg shadow-lg">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{auto.name}</span>
                </div>
              ) : null
            }}
          </DragOverlay>
        </DragDropProvider>
      )}

      {/* Delete automation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar automatizacion</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro de eliminar &quot;{deleteTarget?.name}&quot;? Esta accion no se puede
              deshacer. El historial de ejecuciones tambien sera eliminado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAutomation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete folder dialog */}
      <AlertDialog open={!!deleteFolderTarget} onOpenChange={(open) => !open && setDeleteFolderTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar carpeta &quot;{deleteFolderTarget?.name}&quot;</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFolderAutomationNames.length > 0 ? (
                <>
                  Se eliminaran la carpeta y las siguientes automatizaciones:
                  <ul className="mt-2 space-y-1">
                    {deleteFolderAutomationNames.map((name, i) => (
                      <li key={i} className="text-sm font-medium text-foreground">
                        · {name}
                      </li>
                    ))}
                  </ul>
                  <span className="block mt-2">Esta accion no se puede deshacer.</span>
                </>
              ) : (
                'La carpeta esta vacia. Se eliminara permanentemente.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolderConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar carpeta{deleteFolderAutomationNames.length > 0 ? ' y automatizaciones' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
