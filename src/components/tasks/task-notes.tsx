'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquareIcon, PencilIcon, TrashIcon, UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Timeline, TimelineItem, formatRelativeDate } from '@/components/ui/timeline'
import { createTaskNote, updateTaskNote, deleteTaskNote } from '@/app/actions/task-notes'
import { toast } from 'sonner'
import type { TaskNoteWithUser } from '@/lib/tasks/types'

interface TaskNotesSectionProps {
  taskId: string
  initialNotes: TaskNoteWithUser[]
  currentUserId?: string
  isAdminOrOwner?: boolean
}

export function TaskNotesSection({
  taskId,
  initialNotes,
  currentUserId,
  isAdminOrOwner = false,
}: TaskNotesSectionProps) {
  const router = useRouter()
  const [notes, setNotes] = React.useState(initialNotes)
  const [newNote, setNewNote] = React.useState('')
  const [isCreating, setIsCreating] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editContent, setEditContent] = React.useState('')
  const [isUpdating, setIsUpdating] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  // Handle creating a new note
  const handleCreate = async () => {
    if (!newNote.trim()) return

    setIsCreating(true)

    // Optimistic update
    const optimisticNote: TaskNoteWithUser = {
      id: `temp-${Date.now()}`,
      task_id: taskId,
      workspace_id: '',
      user_id: currentUserId || '',
      content: newNote.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: { id: currentUserId || '', email: 'Tu' }
    }

    setNotes(prev => [optimisticNote, ...prev])
    setNewNote('')

    try {
      const result = await createTaskNote(taskId, newNote.trim())

      if ('error' in result) {
        // Revert optimistic update
        setNotes(prev => prev.filter(n => n.id !== optimisticNote.id))
        setNewNote(optimisticNote.content)
        toast.error(result.error)
      } else {
        // Replace optimistic note with real one
        setNotes(prev => prev.map(n =>
          n.id === optimisticNote.id ? result.data : n
        ))
        toast.success('Nota agregada')
        router.refresh()
      }
    } catch {
      // Revert on error
      setNotes(prev => prev.filter(n => n.id !== optimisticNote.id))
      setNewNote(optimisticNote.content)
      toast.error('Error al agregar la nota')
    } finally {
      setIsCreating(false)
    }
  }

  // Handle editing a note
  const handleStartEdit = (note: TaskNoteWithUser) => {
    setEditingId(note.id)
    setEditContent(note.content)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return

    setIsUpdating(true)

    const originalNote = notes.find(n => n.id === editingId)
    if (!originalNote) return

    // Optimistic update
    setNotes(prev => prev.map(n =>
      n.id === editingId ? { ...n, content: editContent.trim(), updated_at: new Date().toISOString() } : n
    ))

    try {
      const result = await updateTaskNote(editingId, editContent.trim())

      if ('error' in result) {
        // Revert optimistic update
        setNotes(prev => prev.map(n =>
          n.id === editingId ? originalNote : n
        ))
        toast.error(result.error)
      } else {
        toast.success('Nota actualizada')
        setEditingId(null)
        setEditContent('')
        router.refresh()
      }
    } catch {
      // Revert on error
      setNotes(prev => prev.map(n =>
        n.id === editingId ? originalNote : n
      ))
      toast.error('Error al actualizar la nota')
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle deleting a note
  const handleDelete = async (noteId: string) => {
    if (!confirm('Eliminar esta nota? Esta accion no se puede deshacer.')) return

    setDeletingId(noteId)

    const noteToDelete = notes.find(n => n.id === noteId)
    if (!noteToDelete) return

    // Optimistic update
    setNotes(prev => prev.filter(n => n.id !== noteId))

    try {
      const result = await deleteTaskNote(noteId)

      if ('error' in result) {
        // Revert optimistic update
        setNotes(prev => {
          const newNotes = [...prev]
          // Find correct position to insert back
          const index = newNotes.findIndex(n =>
            new Date(n.created_at) < new Date(noteToDelete.created_at)
          )
          if (index === -1) {
            newNotes.push(noteToDelete)
          } else {
            newNotes.splice(index, 0, noteToDelete)
          }
          return newNotes
        })
        toast.error(result.error)
      } else {
        toast.success('Nota eliminada')
        router.refresh()
      }
    } catch {
      // Revert on error - simplified: just add at the beginning
      setNotes(prev => [noteToDelete, ...prev])
      toast.error('Error al eliminar la nota')
    } finally {
      setDeletingId(null)
    }
  }

  // Check if current user can edit/delete a note
  const canModify = (note: TaskNoteWithUser) => {
    return note.user_id === currentUserId || isAdminOrOwner
  }

  return (
    <div className="space-y-6">
      {/* Add note form */}
      <div className="space-y-3">
        <Textarea
          placeholder="Escribe una nota..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <Button
          onClick={handleCreate}
          disabled={!newNote.trim() || isCreating}
          size="sm"
        >
          {isCreating ? 'Agregando...' : 'Agregar nota'}
        </Button>
      </div>

      {/* Notes timeline */}
      {notes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquareIcon className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p>Sin notas</p>
          <p className="text-sm">Agrega notas para recordar detalles importantes sobre esta tarea.</p>
        </div>
      ) : (
        <Timeline>
          {notes.map((note, index) => (
            <TimelineItem
              key={note.id}
              icon={<MessageSquareIcon className="h-4 w-4" />}
              title={
                <span className="flex items-center gap-2">
                  <UserIcon className="h-3 w-3" />
                  {note.user.email}
                </span>
              }
              date={formatRelativeDate(note.created_at)}
              isLast={index === notes.length - 1}
            >
              {editingId === note.id ? (
                // Edit mode
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={!editContent.trim() || isUpdating}
                    >
                      {isUpdating ? 'Guardando...' : 'Guardar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="space-y-2">
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  {canModify(note) && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => handleStartEdit(note)}
                      >
                        <PencilIcon className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingId === note.id}
                      >
                        <TrashIcon className="h-3 w-3 mr-1" />
                        {deletingId === note.id ? 'Eliminando...' : 'Eliminar'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TimelineItem>
          ))}
        </Timeline>
      )}
    </div>
  )
}
