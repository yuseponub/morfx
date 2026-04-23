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
// COLLISION_PRIORITY_LOW = 1 (from @dnd-kit/abstract, not directly installable)
const COLLISION_PRIORITY_LOW = 1
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
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

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
  v2,
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
  v2: boolean
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
      className={cn(
        v2
          ? 'flex items-center gap-3 px-3 py-2 border-b border-dotted border-[var(--border)] bg-transparent transition-colors hover:bg-[var(--paper-3)]'
          : 'flex items-center gap-3 px-3 py-2.5 border rounded-lg bg-card transition-opacity',
        isDragSource && 'opacity-30',
        !automation.is_enabled && 'opacity-50'
      )}
    >
      {/* Drag handle */}
      <button
        ref={handleRef}
        className={cn(
          'cursor-grab active:cursor-grabbing p-0.5 shrink-0',
          v2 ? 'text-[var(--ink-4)] hover:text-[var(--ink-1)]' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Status dot (v2 only, mock .al-item .dot) */}
      {v2 && (
        <span
          className={cn(
            'h-2 w-2 rounded-full shrink-0',
            automation.is_enabled ? 'bg-[var(--semantic-success)]' : 'bg-[var(--ink-4)]'
          )}
          aria-label={automation.is_enabled ? 'Activa' : 'Borrador'}
        />
      )}

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'truncate block',
            v2
              ? 'text-[13px] font-semibold text-[var(--ink-1)] leading-tight'
              : 'text-sm font-medium'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          {automation.name}
        </span>
        {automation.description && (
          <span
            className={cn(
              'truncate block',
              v2
                ? 'mt-0.5 text-[11px] italic text-[var(--ink-3)]'
                : 'text-xs text-muted-foreground'
            )}
            style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
          >
            {automation.description}
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        {v2 ? (
          <>
            <span
              className="mx-tag mx-tag--ink text-[10px]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {trigger.label}
            </span>
            <span
              className="text-[10px] tabular-nums text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {automation.actions.length} acc
            </span>
          </>
        ) : (
          <>
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${categoryColor}`}>
              {trigger.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {automation.actions.length} acc
            </Badge>
          </>
        )}
      </div>

      {/* Last execution */}
      <div
        className={cn(
          'hidden md:flex items-center gap-1 text-xs shrink-0 min-w-[100px]',
          v2 && 'text-[11px]'
        )}
        style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
      >
        {statusInfo ? (
          <>
            <statusInfo.icon className={`h-3 w-3 ${statusInfo.color}`} />
            <span className={v2 ? 'text-[var(--ink-2)]' : statusInfo.color}>{statusInfo.label}</span>
            <span className={v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'}>
              {formatRelativeTime(automation.updated_at)}
            </span>
          </>
        ) : (
          <>
            <Clock className={cn('h-3 w-3', v2 ? 'text-[var(--ink-4)]' : 'text-muted-foreground')} />
            <span className={v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'}>Sin ejec.</span>
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
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 shrink-0',
              v2 && 'text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--paper-2)]'
            )}
          >
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
  v2,
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
  v2: boolean
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
      className={cn(
        v2
          ? 'flex items-center gap-3 px-3 py-2 border-b border-dotted border-[var(--border)] bg-transparent transition-colors hover:bg-[var(--paper-3)]'
          : 'flex items-center gap-3 px-3 py-2.5 border rounded-lg bg-card',
        !automation.is_enabled && 'opacity-50'
      )}
    >
      {v2 ? (
        <span
          className={cn(
            'h-2 w-2 rounded-full shrink-0',
            automation.is_enabled ? 'bg-[var(--semantic-success)]' : 'bg-[var(--ink-4)]'
          )}
          aria-label={automation.is_enabled ? 'Activa' : 'Borrador'}
        />
      ) : (
        <div className="w-5 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'truncate block',
            v2
              ? 'text-[13px] font-semibold text-[var(--ink-1)] leading-tight'
              : 'text-sm font-medium'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          {automation.name}
        </span>
        {automation.description && (
          <span
            className={cn(
              'truncate block',
              v2
                ? 'mt-0.5 text-[11px] italic text-[var(--ink-3)]'
                : 'text-xs text-muted-foreground'
            )}
            style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
          >
            {automation.description}
          </span>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        {v2 ? (
          <>
            <span
              className="mx-tag mx-tag--ink text-[10px]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {trigger.label}
            </span>
            <span
              className="text-[10px] tabular-nums text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {automation.actions.length} acc
            </span>
          </>
        ) : (
          <>
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${categoryColor}`}>
              {trigger.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {automation.actions.length} acc
            </Badge>
          </>
        )}
      </div>

      <div
        className={cn(
          'hidden md:flex items-center gap-1 text-xs shrink-0 min-w-[100px]',
          v2 && 'text-[11px]'
        )}
        style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
      >
        {statusInfo ? (
          <>
            <statusInfo.icon className={`h-3 w-3 ${statusInfo.color}`} />
            <span className={v2 ? 'text-[var(--ink-2)]' : statusInfo.color}>{statusInfo.label}</span>
            <span className={v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'}>
              {formatRelativeTime(automation.updated_at)}
            </span>
          </>
        ) : (
          <>
            <Clock className={cn('h-3 w-3', v2 ? 'text-[var(--ink-4)]' : 'text-muted-foreground')} />
            <span className={v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'}>Sin ejec.</span>
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
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 shrink-0',
              v2 && 'text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--paper-2)]'
            )}
          >
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
  v2,
  onToggleCollapse,
  onRename,
  onDelete,
  children,
}: {
  folder: AutomationFolder
  index: number
  automationCount: number
  isCollapsed: boolean
  v2: boolean
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
    collisionPriority: COLLISION_PRIORITY_LOW,
  })

  const FolderIcon = isCollapsed ? FolderClosed : FolderOpen

  return (
    <div
      ref={ref}
      className={cn(
        v2
          ? 'border border-[var(--ink-1)] bg-[var(--paper-0)] overflow-hidden transition-opacity shadow-[0_1px_0_var(--ink-1)]'
          : 'border rounded-lg overflow-hidden transition-opacity',
        isDragSource && 'opacity-30'
      )}
    >
      {/* Folder header */}
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2.5',
          v2 ? 'bg-[var(--paper-2)] border-b border-[var(--ink-1)]' : 'bg-muted/50'
        )}
      >
        <button
          ref={handleRef}
          className={cn(
            'cursor-grab active:cursor-grabbing p-0.5 shrink-0',
            v2 ? 'text-[var(--ink-4)] hover:text-[var(--ink-1)]' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          {isCollapsed ? (
            <ChevronRight
              className={cn('h-4 w-4 shrink-0', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}
            />
          ) : (
            <ChevronDown
              className={cn('h-4 w-4 shrink-0', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}
            />
          )}
          <FolderIcon
            className={cn('h-4 w-4 shrink-0', v2 ? 'text-[var(--ink-2)]' : 'text-muted-foreground')}
          />
          <span
            className={cn(
              'truncate',
              v2
                ? 'text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]'
                : 'text-sm font-medium'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
          >
            {folder.name}
          </span>
        </button>

        <span
          className={cn(
            'shrink-0',
            v2
              ? 'text-[10px] tabular-nums text-[var(--ink-3)]'
              : 'text-xs text-muted-foreground'
          )}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          {v2 ? `· ${automationCount}` : `${automationCount} automatizacion${automationCount !== 1 ? 'es' : ''}`}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 shrink-0',
                v2 && 'text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--paper-3)]'
              )}
            >
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
        <div
          className={cn(
            'min-h-[40px]',
            v2
              ? 'bg-[var(--paper-0)]'
              : 'px-3 py-2 space-y-1.5 bg-muted/20'
          )}
        >
          {children}
          {automationCount === 0 && (
            <div
              className={cn(
                'text-center py-3',
                v2
                  ? 'text-[11px] italic text-[var(--ink-3)]'
                  : 'text-xs text-muted-foreground'
              )}
              style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
            >
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

function RootDropZone({
  children,
  hasItems,
  v2,
}: {
  children: React.ReactNode
  hasItems: boolean
  v2: boolean
}) {
  const { ref } = useDroppable({
    id: 'root',
    accept: 'automation',
    collisionPriority: COLLISION_PRIORITY_LOW,
  })

  return (
    <div
      ref={ref}
      className={cn(
        'min-h-[40px]',
        v2
          ? 'border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)]'
          : 'space-y-1.5'
      )}
    >
      {children}
      {!hasItems && (
        <div
          className={cn(
            'text-center py-3',
            v2
              ? 'text-[11px] italic text-[var(--ink-3)] border-t border-dotted border-[var(--border)]'
              : 'text-xs text-muted-foreground border border-dashed rounded-lg'
          )}
          style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
        >
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
  const v2 = useDashboardV2()
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
    if (v2) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]"
          >
            <Zap className="h-6 w-6 text-[var(--rubric-2)]" />
          </div>
          <p className="mx-h3">Sin automatizaciones.</p>
          <p className="mx-caption max-w-sm">
            Crea la primera para ahorrar tiempo automatizando tareas repetitivas.
          </p>
          <p className="mx-rule-ornament">· · ·</p>
          <Button
            asChild
            className="mt-2 bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <Link href="/automatizaciones/nueva">
              <Plus className="h-4 w-4 mr-2" />
              Crear automatización
            </Link>
          </Button>
        </div>
      )
    }
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
      {v2 ? (
        <div className="flex items-end justify-between gap-3">
          <p
            className="text-[11px] italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {initialAutomations.length} automatizaci
            {initialAutomations.length !== 1 ? 'ones' : 'ón'}
            {folderOrder.length > 0 &&
              ` · ${folderOrder.length} carpeta${folderOrder.length !== 1 ? 's' : ''}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Link href="/automatizaciones/builder">
                <Sparkles className="h-4 w-4 mr-2 text-[var(--rubric-2)]" />
                AI Builder
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
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
              className="bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Nueva carpeta
            </Button>
            <Button
              size="sm"
              asChild
              className="bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Link href="/automatizaciones/nueva">
                <Plus className="h-4 w-4 mr-2" />
                Nueva automatización
              </Link>
            </Button>
          </div>
        </div>
      ) : (
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
      )}

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
        {v2 ? (
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-[var(--ink-3)] pointer-events-none"
              aria-hidden
            />
            <Input
              placeholder="Buscar flujo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--paper-0)] border-[var(--border)] rounded-[var(--radius-2)] py-1.5 pr-3 pl-9 text-[12px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:ring-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            />
          </div>
        ) : (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar automatizaciones..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
        <div className={cn('flex gap-1 flex-wrap', v2 && 'gap-2')}>
          {categories.map((cat) => {
            const isActive = categoryFilter === cat.value
            return v2 ? (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategoryFilter(cat.value)}
                className={cn(
                  'px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors border',
                  isActive
                    ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)]'
                    : 'bg-transparent text-[var(--ink-3)] border-[var(--border)] hover:text-[var(--ink-1)] hover:border-[var(--ink-1)]'
                )}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {cat.label}
              </button>
            ) : (
              <Button
                key={cat.value}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategoryFilter(cat.value)}
              >
                {cat.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      {isFiltering ? (
        /* ── Filtered flat view (no folders, no DnD) ── */
        <div
          className={cn(
            v2
              ? 'border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)]'
              : 'space-y-1.5'
          )}
        >
          {filteredAutomations && filteredAutomations.length === 0 ? (
            v2 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
                <p className="mx-h4">Sin resultados.</p>
                <p className="mx-caption">No se encontraron automatizaciones con los filtros actuales.</p>
                <p className="mx-rule-ornament">· · ·</p>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No se encontraron automatizaciones con los filtros actuales
              </div>
            )
          ) : (
            filteredAutomations?.map((automation) => (
              <StaticAutomationRow
                key={automation.id}
                automation={automation}
                folders={allFolders}
                currentFolderId={automation.folder_id}
                isToggling={togglingIds.has(automation.id)}
                isPending={isPending}
                v2={v2}
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
                  v2={v2}
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
                        v2={v2}
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
            <RootDropZone hasItems={(items.root ?? []).length > 0} v2={v2}>
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
                    v2={v2}
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
                  <div
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 shadow-lg',
                      v2
                        ? 'bg-[var(--paper-2)] border border-[var(--ink-1)]'
                        : 'bg-muted border rounded-lg'
                    )}
                  >
                    <GripVertical
                      className={cn('h-4 w-4', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}
                    />
                    <FolderOpen
                      className={cn('h-4 w-4', v2 ? 'text-[var(--ink-2)]' : 'text-muted-foreground')}
                    />
                    <span
                      className={cn(
                        v2 ? 'text-[13px] font-semibold text-[var(--ink-1)]' : 'text-sm font-medium'
                      )}
                      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                    >
                      {folder.name}
                    </span>
                  </div>
                ) : null
              }
              const auto = automationMap.get(source.id as string)
              return auto ? (
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 shadow-lg',
                    v2
                      ? 'bg-[var(--paper-0)] border border-[var(--ink-1)]'
                      : 'bg-card border rounded-lg'
                  )}
                >
                  <GripVertical
                    className={cn('h-4 w-4', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}
                  />
                  <span
                    className={cn(
                      v2 ? 'text-[13px] font-semibold text-[var(--ink-1)]' : 'text-sm font-medium'
                    )}
                    style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                  >
                    {auto.name}
                  </span>
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
