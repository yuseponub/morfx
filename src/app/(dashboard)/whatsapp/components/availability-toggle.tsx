'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Circle } from 'lucide-react'
import { getMyAvailability, setAgentAvailability } from '@/app/actions/assignment'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

/**
 * Toggle button for agent to set their online/offline availability status.
 * Affects round-robin assignment distribution.
 */
export function AvailabilityToggle() {
  const [isOnline, setIsOnline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    loadStatus()
  }, [])

  async function loadStatus() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const status = await getMyAvailability()
        setIsOnline(status)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle() {
    if (!userId) return

    const newStatus = !isOnline
    setIsOnline(newStatus)  // Optimistic update

    try {
      const result = await setAgentAvailability(userId, newStatus)
      if ('error' in result) {
        setIsOnline(!newStatus)  // Revert
        toast.error(result.error)
        return
      }
      toast.success(newStatus ? 'Ahora estas disponible' : 'Ahora estas no disponible')
    } catch (error) {
      setIsOnline(!newStatus)  // Revert
      toast.error('Error al cambiar disponibilidad')
    }
  }

  if (loading) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      className={`gap-2 ${isOnline ? 'text-green-600' : 'text-muted-foreground'}`}
    >
      <Circle className={`h-3 w-3 ${isOnline ? 'fill-green-500 text-green-500' : 'fill-gray-300 text-gray-300'}`} />
      {isOnline ? 'Disponible' : 'No disponible'}
    </Button>
  )
}
