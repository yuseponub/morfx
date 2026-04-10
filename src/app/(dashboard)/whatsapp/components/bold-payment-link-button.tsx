'use client'

// ============================================================================
// BOLD Payment Link Button + Modal
// Shows in chat-header when BOLD is configured for the workspace.
// Captures amount + description, calls robot in background.
// Results persist in localStorage — survives navigation and page refresh.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { getBoldIntegration } from '@/app/actions/bold'
import { boldLinkStore, type BoldLinkState } from '@/lib/bold/link-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { CreditCard, Loader2, Copy, CheckCircle2, ExternalLink, RotateCcw } from 'lucide-react'

interface Props {
  conversationId: string
}

export function BoldPaymentLinkButton({ conversationId }: Props) {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [linkState, setLinkState] = useState<BoldLinkState | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync state from the global store
  const syncState = useCallback(() => {
    const state = boldLinkStore.getState(conversationId)
    setLinkState(state)
  }, [conversationId])

  // Check if BOLD is configured on mount
  useEffect(() => {
    let cancelled = false
    getBoldIntegration().then((config) => {
      if (cancelled) return
      setIsConfigured(config !== null && config.isActive)
    }).catch(() => {
      setIsConfigured(false)
    })
    return () => { cancelled = true }
  }, [])

  // Load persisted state on mount and when conversationId changes
  useEffect(() => {
    syncState()
  }, [syncState])

  // Listen for store updates (fires when background request completes)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.conversationId === conversationId) {
        syncState()
      }
    }
    window.addEventListener('bold-link-update', handler)
    return () => window.removeEventListener('bold-link-update', handler)
  }, [conversationId, syncState])

  if (isConfigured !== true) return null

  const isPending = linkState?.status === 'pending'
  const isCompleted = linkState?.status === 'completed'
  const isError = linkState?.status === 'error'

  const handleOpen = () => {
    // If there's already a result or pending, show it directly
    if (linkState) {
      setIsOpen(true)
      return
    }
    // Fresh form
    setAmount('')
    setDescription('')
    setImageUrl('')
    setError(null)
    setCopied(false)
    setIsOpen(true)
  }

  const handleGenerate = () => {
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      setError('Ingresa un monto valido mayor a 0')
      return
    }
    if (!description.trim()) {
      setError('Ingresa una descripcion')
      return
    }
    setError(null)

    // Fire and forget — the store handles the request lifecycle
    boldLinkStore.generate(conversationId, numAmount, description.trim(), imageUrl.trim() || undefined)
    syncState()
  }

  const handleClearAndRetry = () => {
    boldLinkStore.clear(conversationId)
    setLinkState(null)
    setAmount('')
    setDescription('')
    setImageUrl('')
    setError(null)
    setCopied(false)
  }

  const handleCopy = async () => {
    if (linkState?.status !== 'completed') return
    try {
      await navigator.clipboard.writeText(linkState.url)
      setCopied(true)
      toast.success('Link copiado al portapapeles')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Selecciona el link manualmente.')
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    // Don't clear state on close — it persists for later
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 text-xs relative"
        onClick={handleOpen}
        title="Generar link de pago BOLD"
      >
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
        {!isPending && !isCompleted && <CreditCard className="h-3.5 w-3.5" />}
      </Button>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Cobrar con BOLD
            </DialogTitle>
          </DialogHeader>

          {/* PENDING: Show spinner + what's being generated */}
          {isPending && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Generando link de pago...</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ${linkState.amount.toLocaleString('es-CO')} COP — {linkState.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Puedes cerrar este modal y volver despues. El link se genera en segundo plano.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* COMPLETED: Show URL + copy */}
          {isCompleted && (
            <div className="space-y-4 py-4">
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-medium text-green-600 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Link generado — ${linkState.amount.toLocaleString('es-CO')} COP
                </p>
                <p className="text-xs text-muted-foreground">{linkState.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    readOnly
                    value={linkState.url}
                    className="text-xs font-mono"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={handleCopy}
                    title="Copiar link"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <a
                  href={linkState.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir link en nueva pestana
                </a>
              </div>
            </div>
          )}

          {/* ERROR: Show error + retry */}
          {isError && (
            <div className="space-y-4 py-4">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm font-medium text-destructive">Error al generar link</p>
                <p className="text-xs text-muted-foreground">{linkState.error}</p>
                <p className="text-xs text-muted-foreground">
                  ${linkState.amount.toLocaleString('es-CO')} COP — {linkState.description}
                </p>
              </div>
            </div>
          )}

          {/* FRESH: Show form */}
          {!linkState && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="bold-amount">Monto (COP)</Label>
                <Input
                  id="bold-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="50000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate()
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bold-description">Descripcion</Label>
                <Input
                  id="bold-description"
                  placeholder="Ej: 1x ELIXIR DEL SUENO"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate()
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bold-image">Imagen del producto (opcional)</Label>
                <Input
                  id="bold-image"
                  type="url"
                  placeholder="https://cdn.shopify.com/..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Puede tardar hasta 30 segundos. Puedes cerrar el modal y volver despues.
              </p>
            </div>
          )}

          <DialogFooter>
            {!linkState && (
              <>
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button onClick={handleGenerate}>
                  Generar link
                </Button>
              </>
            )}
            {isPending && (
              <Button variant="outline" onClick={handleClose}>
                Cerrar (sigue generando)
              </Button>
            )}
            {(isCompleted || isError) && (
              <>
                <Button variant="outline" onClick={handleClearAndRetry} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Crear otro
                </Button>
                <Button onClick={handleClose}>
                  Cerrar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
