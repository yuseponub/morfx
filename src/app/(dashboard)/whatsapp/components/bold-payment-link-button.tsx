'use client'

// ============================================================================
// BOLD Payment Link Button + Modal
// Shows in chat-header when BOLD is configured for the workspace.
// Captures amount + description, calls createPaymentLinkAction, shows URL.
// ============================================================================

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { createPaymentLinkAction, getBoldIntegration } from '@/app/actions/bold'
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
import { CreditCard, Loader2, Copy, CheckCircle2, ExternalLink } from 'lucide-react'

export function BoldPaymentLinkButton() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  // Don't render if not configured or still loading
  if (isConfigured !== true) return null

  const handleOpen = () => {
    setAmount('')
    setDescription('')
    setGeneratedUrl(null)
    setError(null)
    setCopied(false)
    setIsOpen(true)
  }

  const handleGenerate = async () => {
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      setError('Ingresa un monto valido mayor a 0')
      return
    }
    if (!description.trim()) {
      setError('Ingresa una descripcion')
      return
    }

    setIsGenerating(true)
    setError(null)

    const result = await createPaymentLinkAction({
      amount: numAmount,
      description: description.trim(),
    })

    setIsGenerating(false)

    if (result.success && result.url) {
      setGeneratedUrl(result.url)
    } else {
      setError(result.error || 'Error al generar link de pago')
    }
  }

  const handleCopy = async () => {
    if (!generatedUrl) return
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopied(true)
      toast.success('Link copiado al portapapeles')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Selecciona el link manualmente.')
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 text-xs"
        onClick={handleOpen}
        title="Generar link de pago BOLD"
      >
        <CreditCard className="h-3.5 w-3.5" />
        Cobrar con BOLD
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Generar link de pago BOLD
            </DialogTitle>
          </DialogHeader>

          {!generatedUrl ? (
            // Form: amount + description
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
                    if (e.key === 'Enter' && !isGenerating) {
                      handleGenerate()
                    }
                  }}
                  disabled={isGenerating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bold-description">Descripcion</Label>
                <Input
                  id="bold-description"
                  placeholder="Pago pedido #123"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isGenerating) {
                      handleGenerate()
                    }
                  }}
                  disabled={isGenerating}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              {isGenerating && (
                <p className="text-sm text-muted-foreground">
                  Generando link... esto puede tardar hasta 30 segundos.
                </p>
              )}
            </div>
          ) : (
            // Result: show URL + copy button
            <div className="space-y-4 py-4">
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-sm font-medium text-green-600 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Link generado exitosamente
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={generatedUrl}
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
                  href={generatedUrl}
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

          <DialogFooter>
            {!generatedUrl ? (
              <>
                <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isGenerating}>
                  Cancelar
                </Button>
                <Button onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isGenerating ? 'Generando...' : 'Generar link'}
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsOpen(false)}>
                Cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
