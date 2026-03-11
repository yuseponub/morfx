'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Search, Send, CheckCircle2, XCircle, Ban, History, Clock, Eye, RotateCcw } from 'lucide-react'
import {
  scrapeAppointments,
  sendConfirmations,
  getScrapeHistory,
  type GodentistAppointment,
  type SendResult,
  type ScrapeHistoryEntry,
} from '@/app/actions/godentist'

type Phase = 'idle' | 'scraping' | 'preview' | 'sending' | 'done'
type Tab = 'scrape' | 'history'
type HistoryView = 'list' | 'detail'

const ALL_SUCURSALES = ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS']

export function ConfirmacionesPanel() {
  // Tab state
  const [tab, setTab] = useState<Tab>('scrape')

  // Scrape state
  const [phase, setPhase] = useState<Phase>('idle')
  const [allAppointments, setAllAppointments] = useState<GodentistAppointment[]>([])
  const [activeSucursales, setActiveSucursales] = useState<Set<string>>(new Set(ALL_SUCURSALES))
  const [date, setDate] = useState('')
  const [historyId, setHistoryId] = useState<string | undefined>()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<SendResult | null>(null)
  const [error, setError] = useState('')
  const [searchName, setSearchName] = useState('')
  const [filterSucursal, setFilterSucursal] = useState<string>('all')
  const [filterEstado, setFilterEstado] = useState<string>('all')

  // History state
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyView, setHistoryView] = useState<HistoryView>('list')
  const [selectedEntry, setSelectedEntry] = useState<ScrapeHistoryEntry | null>(null)

  // Filtered appointments
  const sucursalFiltered = allAppointments.filter(a => activeSucursales.has(a.sucursal.toUpperCase()))

  const appointments = useMemo(() => {
    let filtered = sucursalFiltered
    if (searchName.trim()) {
      const q = searchName.toLowerCase()
      filtered = filtered.filter(a => a.nombre.toLowerCase().includes(q))
    }
    if (filterSucursal !== 'all') {
      filtered = filtered.filter(a => a.sucursal.toUpperCase() === filterSucursal)
    }
    if (filterEstado !== 'all') {
      if (filterEstado === 'cancelada') {
        filtered = filtered.filter(a => a.estado.toLowerCase().includes('cancelada'))
      } else if (filterEstado === 'no-cancelada') {
        filtered = filtered.filter(a => !a.estado.toLowerCase().includes('cancelada'))
      } else if (filterEstado === 'confirmada') {
        filtered = filtered.filter(a => a.estado.toLowerCase().includes('confirmada'))
      }
    }
    return filtered
  }, [sucursalFiltered, searchName, filterSucursal, filterEstado])

  const uniqueSucursales = useMemo(() => {
    const set = new Set(sucursalFiltered.map(a => a.sucursal.toUpperCase()))
    return Array.from(set).sort()
  }, [sucursalFiltered])

  const cancelledCount = appointments.filter(a => a.estado.toLowerCase().includes('cancelada')).length
  const validCount = selected.size

  // Load history when switching to tab
  useEffect(() => {
    if (tab === 'history' && history.length === 0) {
      loadHistory()
    }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHistory() {
    setHistoryLoading(true)
    const res = await getScrapeHistory()
    if (res.data) setHistory(res.data)
    setHistoryLoading(false)
  }

  function toggleSucursal(suc: string) {
    setActiveSucursales(prev => {
      const next = new Set(prev)
      if (next.has(suc)) next.delete(suc)
      else next.add(suc)
      return next
    })
    setSelected(new Set())
  }

  async function handleScrape() {
    setPhase('scraping')
    setError('')
    setResult(null)

    const res = await scrapeAppointments(Array.from(activeSucursales))
    if (res.error || !res.data) {
      setError(res.error || 'Error desconocido')
      setPhase('idle')
      return
    }

    const apts = res.data.appointments
    setAllAppointments(apts)
    setDate(res.data.date)
    setHistoryId(res.historyId)

    // Auto-select non-cancelled
    const sel = new Set<number>()
    const filtered = apts.filter(a => activeSucursales.has(a.sucursal.toUpperCase()))
    filtered.forEach((a, i) => {
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
    const res = await sendConfirmations(toSend, date, historyId)

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
    setAllAppointments([])
    setDate('')
    setHistoryId(undefined)
    setSelected(new Set())
    setResult(null)
    setError('')
    setSearchName('')
    setFilterSucursal('all')
    setFilterEstado('all')
  }

  /** Load a history entry into the preview phase for re-sending */
  function handleLoadFromHistory(entry: ScrapeHistoryEntry) {
    setAllAppointments(entry.appointments)
    setDate(entry.scraped_date)
    setHistoryId(entry.id)
    setActiveSucursales(new Set(entry.sucursales))

    // Auto-select non-cancelled
    const sel = new Set<number>()
    entry.appointments.forEach((a, i) => {
      if (!a.estado.toLowerCase().includes('cancelada')) sel.add(i)
    })
    setSelected(sel)

    setSearchName('')
    setFilterSucursal('all')
    setFilterEstado('all')
    setResult(null)
    setError('')
    setPhase('preview')
    setTab('scrape')
  }

  return (
    <div className="space-y-4">
      {/* Tab buttons */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={tab === 'scrape' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('scrape')}
        >
          <Search className="mr-2 h-4 w-4" />
          Nuevo scrape
        </Button>
        <Button
          variant={tab === 'history' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('history')}
        >
          <History className="mr-2 h-4 w-4" />
          Historial
        </Button>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: SCRAPE                                 */}
      {/* ═══════════════════════════════════════════ */}
      {tab === 'scrape' && (
        <>
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-4">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Sucursal filter */}
          {(phase === 'idle' || phase === 'scraping' || phase === 'preview') && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">Sucursales</p>
                <div className="flex flex-wrap gap-3">
                  {ALL_SUCURSALES.map(suc => (
                    <label key={suc} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeSucursales.has(suc)}
                        onChange={() => toggleSucursal(suc)}
                        className="rounded"
                        disabled={phase === 'scraping' || phase === 'preview'}
                      />
                      {suc}
                    </label>
                  ))}
                </div>
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
                    disabled={phase === 'scraping' || activeSucursales.size === 0}
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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
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

              {/* Filters */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      placeholder="Buscar por nombre..."
                      value={searchName}
                      onChange={e => setSearchName(e.target.value)}
                      className="w-64"
                    />
                    <select
                      value={filterSucursal}
                      onChange={e => setFilterSucursal(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="all">Todas las sucursales</option>
                      {uniqueSucursales.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      value={filterEstado}
                      onChange={e => setFilterEstado(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="all">Todos los estados</option>
                      <option value="no-cancelada">No canceladas</option>
                      <option value="cancelada">Canceladas</option>
                      <option value="confirmada">Confirmadas</option>
                    </select>
                    {(searchName || filterSucursal !== 'all' || filterEstado !== 'all') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSearchName(''); setFilterSucursal('all'); setFilterEstado('all') }}
                      >
                        Limpiar filtros
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <AppointmentsTable
                appointments={appointments}
                selected={selected}
                toggleSelect={toggleSelect}
                toggleAll={toggleAll}
                selectable
              />
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
              <SendResultCards result={result} />
              <Button onClick={handleReset} variant="outline">
                Volver al inicio
              </Button>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: HISTORY                                */}
      {/* ═══════════════════════════════════════════ */}
      {tab === 'history' && (
        <>
          {historyView === 'list' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Últimos 20 scrapes</p>
                <Button variant="outline" size="sm" onClick={loadHistory} disabled={historyLoading}>
                  {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                </Button>
              </div>

              {historyLoading && history.length === 0 && (
                <Card>
                  <CardContent className="pt-6 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </CardContent>
                </Card>
              )}

              {!historyLoading && history.length === 0 && (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                    No hay historial aún.
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                {history.map(entry => (
                  <Card key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {new Date(entry.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                            </span>
                          </div>
                          <Badge variant="secondary">Fecha: {entry.scraped_date}</Badge>
                          <Badge variant="outline">{entry.total_appointments} citas</Badge>
                          <div className="flex gap-1">
                            {entry.sucursales.map(s => (
                              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                            ))}
                          </div>
                          {entry.send_results ? (
                            <Badge variant="default" className="bg-green-600">
                              Enviado: {entry.send_results.sent}/{entry.send_results.total}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">No enviado</Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedEntry(entry); setHistoryView('detail') }}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            Ver
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleLoadFromHistory(entry)}
                          >
                            <Send className="mr-1 h-3 w-3" />
                            Reenviar
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {historyView === 'detail' && selectedEntry && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => { setHistoryView('list'); setSelectedEntry(null) }}>
                    &larr; Volver
                  </Button>
                  <Badge variant="secondary">Fecha: {selectedEntry.scraped_date}</Badge>
                  <Badge variant="outline">{selectedEntry.total_appointments} citas</Badge>
                </div>
                <Button size="sm" onClick={() => handleLoadFromHistory(selectedEntry)}>
                  <Send className="mr-1 h-3 w-3" />
                  Reenviar seleccion
                </Button>
              </div>

              {/* Send results if exists */}
              {selectedEntry.send_results && (
                <>
                  <p className="text-sm font-medium">Resultados del envio ({new Date(selectedEntry.sent_at!).toLocaleString('es-CO', { timeZone: 'America/Bogota' })})</p>
                  <SendResultCards result={selectedEntry.send_results} />

                  {selectedEntry.send_results.failed > 0 && (
                    <Card className="border-destructive">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Envios fallidos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-1 text-sm">
                          {selectedEntry.send_results.details
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
                </>
              )}

              {/* All appointments table */}
              <p className="text-sm font-medium">Citas scrapeadas</p>
              <AppointmentsTable
                appointments={selectedEntry.appointments}
                selected={new Set()}
                toggleSelect={() => {}}
                toggleAll={() => {}}
                selectable={false}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Shared Components ──

function AppointmentsTable({
  appointments,
  selected,
  toggleSelect,
  toggleAll,
  selectable,
}: {
  appointments: GodentistAppointment[]
  selected: Set<number>
  toggleSelect: (i: number) => void
  toggleAll: () => void
  selectable: boolean
}) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {selectable && (
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === appointments.length && appointments.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
              )}
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
                  {selectable && (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggleSelect(i)}
                        className="rounded"
                      />
                    </td>
                  )}
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
            {appointments.length === 0 && (
              <tr>
                <td colSpan={selectable ? 6 : 5} className="p-6 text-center text-muted-foreground">
                  No hay citas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SendResultCards({ result }: { result: SendResult }) {
  return (
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
  )
}
