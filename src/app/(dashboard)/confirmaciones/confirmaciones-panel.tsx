'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, Send, CheckCircle2, XCircle, Ban } from 'lucide-react'
import {
  scrapeAppointments,
  sendConfirmations,
  type GodentistAppointment,
  type SendResult,
} from '@/app/actions/godentist'

type Phase = 'idle' | 'scraping' | 'preview' | 'sending' | 'done'

export function ConfirmacionesPanel() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [appointments, setAppointments] = useState<GodentistAppointment[]>([])
  const [date, setDate] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState('')

  const cancelledCount = appointments.filter(a => a.estado.toLowerCase().includes('cancelada')).length
  const validCount = selected.size

  async function handleScrape() {
    setPhase('scraping')
    setError('')
    setResult(null)

    const res = await scrapeAppointments()
    if (res.error || !res.data) {
      setError(res.error || 'Error desconocido')
      setPhase('idle')
      return
    }

    const apts = res.data.appointments
    setAppointments(apts)
    setDate(res.data.date)

    // Auto-select non-cancelled appointments
    const sel = new Set<number>()
    apts.forEach((a, i) => {
      if (!a.estado.toLowerCase().includes('cancelada')) sel.add(i)
    })
    setSelected(sel)
    setPhase('preview')
  }

  function toggleSelect(index: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === appointments.length) {
      setSelected(new Set())
    } else {
      const sel = new Set<number>()
      appointments.forEach((_, i) => sel.add(i))
      setSelected(sel)
    }
  }

  async function handleSend() {
    setPhase('sending')
    setError('')

    const toSend = appointments.filter((_, i) => selected.has(i))
    const res = await sendConfirmations(toSend, date)

    if (res.error || !res.data) {
      setError(res.error || 'Error desconocido')
      setPhase('preview')
      return
    }

    setResult(res.data)
    setPhase('done')
  }

  function handleReset() {
    setPhase('idle')
    setAppointments([])
    setDate('')
    setSelected(new Set())
    setResult(null)
    setError('')
  }

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Phase: idle or scraping */}
      {(phase === 'idle' || phase === 'scraping') && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <p className="text-muted-foreground text-center">
                Presiona el boton para obtener las citas del proximo dia habil y enviar confirmaciones por WhatsApp.
              </p>
              <Button
                size="lg"
                onClick={handleScrape}
                disabled={phase === 'scraping'}
              >
                {phase === 'scraping' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Obteniendo citas...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Obtener citas
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase: preview */}
      {phase === 'preview' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{appointments.length} citas</Badge>
              <Badge variant="default">{validCount} para enviar</Badge>
              {cancelledCount > 0 && (
                <Badge variant="destructive">{cancelledCount} canceladas</Badge>
              )}
              <span className="text-sm text-muted-foreground">Fecha: {date}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                Cancelar
              </Button>
              <Button onClick={handleSend} disabled={validCount === 0}>
                <Send className="mr-2 h-4 w-4" />
                Enviar confirmaciones ({validCount})
              </Button>
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === appointments.length}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="p-3 text-left">Nombre</th>
                    <th className="p-3 text-left">Telefono</th>
                    <th className="p-3 text-left">Hora</th>
                    <th className="p-3 text-left">Sucursal</th>
                    <th className="p-3 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((apt, i) => {
                    const isCancelled = apt.estado.toLowerCase().includes('cancelada')
                    return (
                      <tr
                        key={i}
                        className={`border-b ${isCancelled ? 'bg-destructive/5 text-muted-foreground line-through' : 'hover:bg-muted/30'}`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selected.has(i)}
                            onChange={() => toggleSelect(i)}
                            className="rounded"
                          />
                        </td>
                        <td className="p-3 font-medium">{apt.nombre}</td>
                        <td className="p-3 font-mono text-xs">{apt.telefono}</td>
                        <td className="p-3">{apt.hora}</td>
                        <td className="p-3">{apt.sucursal}</td>
                        <td className="p-3">
                          <Badge variant={isCancelled ? 'destructive' : 'secondary'} className="text-xs">
                            {apt.estado || 'Sin estado'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Phase: sending */}
      {phase === 'sending' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">
                Enviando confirmaciones... esto puede tomar unos minutos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase: done */}
      {phase === 'done' && result && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Enviados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold">{result.sent}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Fallidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="text-2xl font-bold">{result.failed}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Excluidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Ban className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">{result.excluded}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {result.failed > 0 && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-sm">Envios fallidos</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {result.details
                    .filter(d => d.status === 'failed')
                    .map((d, i) => (
                      <li key={i} className="text-destructive">
                        {d.nombre} ({d.telefono}): {d.error}
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Button onClick={handleReset} variant="outline">
            Volver al inicio
          </Button>
        </>
      )}
    </div>
  )
}
