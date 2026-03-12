'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Search, Send, CheckCircle2, XCircle, Ban, History, Clock, Eye, RotateCcw, Calendar } from 'lucide-react'
import {
  scrapeAppointments,
  sendConfirmations,
  getScrapeHistory,
  scheduleReminders,
  getScheduledReminders,
  cancelScheduledReminder,
  type GodentistAppointment,
  type SendResult,
  type ScrapeHistoryEntry,
  type ScheduleResult,
  type ScheduledReminderEntry,
} from '@/app/actions/godentist'

type Phase = 'idle' | 'scraping' | 'preview' | 'sending' | 'done'
type Tab = 'scrape' | 'history' | 'programacion'
type HistoryView = 'list' | 'detail'
type DateMode = 'auto' | 'today' | 'tomorrow' | 'custom'

const ALL_SUCURSALES = ['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS']

function getColombiaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
}

function getColombiaTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
}

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

  // Date picker state
  const [scrapeDate, setScrapeDate] = useState<string>('')
  const [dateMode, setDateMode] = useState<DateMode>('auto')
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null)

  // History state
  const [history, setHistory] = useState<ScrapeHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyView, setHistoryView] = useState<HistoryView>('list')
  const [selectedEntry, setSelectedEntry] = useState<ScrapeHistoryEntry | null>(null)
  const [detailSelected, setDetailSelected] = useState<Set<number>>(new Set())

  // Programacion state
  const [reminders, setReminders] = useState<ScheduledReminderEntry[]>([])
  const [remindersLoading, setRemindersLoading] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

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

  // Load reminders when switching to programacion tab
  useEffect(() => {
    if (tab === 'programacion') {
      loadReminders()
    }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHistory() {
    setHistoryLoading(true)
    const res = await getScrapeHistory()
    if (res.data) setHistory(res.data)
    setHistoryLoading(false)
  }

  async function loadReminders() {
    setRemindersLoading(true)
    const res = await getScheduledReminders()
    if (res.data) setReminders(res.data)
    setRemindersLoading(false)
  }

  async function handleCancelReminder(id: string) {
    setCancellingId(id)
    const res = await cancelScheduledReminder(id)
    if (res.success) {
      setReminders(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r))
    }
    setCancellingId(null)
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

  function handleDateMode(mode: DateMode) {
    setDateMode(mode)
    if (mode === 'today') {
      setScrapeDate(getColombiaToday())
    } else if (mode === 'tomorrow') {
      setScrapeDate(getColombiaTomorrow())
    } else if (mode === 'auto') {
      setScrapeDate('')
    }
    // 'custom' keeps whatever was in scrapeDate or waits for input
  }

  async function handleScrape() {
    setPhase('scraping')
    setError('')
    setResult(null)
    setScheduleResult(null)

    const res = await scrapeAppointments(Array.from(activeSucursales), scrapeDate || undefined)
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

  async function handleSchedule() {
    setPhase('sending')
    setError('')

    const toSchedule = appointments.filter((_, i) => selected.has(i))
    // Use scrapeDate if set, otherwise fall back to the date returned from scrape response
    const fechaCita = scrapeDate || date
    const res = await scheduleReminders(toSchedule, fechaCita, historyId)

    if (res.error || !res.data) {
      setError(res.error || 'Error desconocido')
      setPhase('preview')
      return
    }

    setScheduleResult(res.data)
    setPhase('done')
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
    setScheduleResult(null)
    setError('')
    setSearchName('')
    setFilterSucursal('all')
    setFilterEstado('all')
    setScrapeDate('')
    setDateMode('auto')
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
    setScheduleResult(null)
    setError('')
    setPhase('preview')
    setTab('scrape')
  }

  const pendingReminders = reminders.filter(r => r.status === 'pending')
  const historyReminders = reminders.filter(r => r.status !== 'pending')

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
        <Button
          variant={tab === 'programacion' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('programacion')}
        >
          <Clock className="mr-2 h-4 w-4" />
          Programacion
        </Button>
      </div>

      {/* =============================================== */}
      {/* TAB: SCRAPE                                     */}
      {/* =============================================== */}
      {tab === 'scrape' && (
        <>
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-4">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Date picker - only in idle phase */}
          {phase === 'idle' && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Fecha del scrape
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Button
                    variant={dateMode === 'auto' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleDateMode('auto')}
                  >
                    Por defecto
                  </Button>
                  <Button
                    variant={dateMode === 'today' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleDateMode('today')}
                  >
                    Hoy
                  </Button>
                  <Button
                    variant={dateMode === 'tomorrow' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleDateMode('tomorrow')}
                  >
                    Manana
                  </Button>
                  <Button
                    variant={dateMode === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleDateMode('custom')}
                  >
                    Otra fecha
                  </Button>
                </div>
                {dateMode === 'custom' && (
                  <input
                    type="date"
                    value={scrapeDate}
                    onChange={e => setScrapeDate(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  />
                )}
                {scrapeDate ? (
                  <Badge variant="secondary" className="mt-1">Fecha seleccionada: {scrapeDate}</Badge>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Se usara el proximo dia habil (por defecto)</p>
                )}
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
                  <Badge variant="default">{validCount} seleccionadas</Badge>
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
                  <Button onClick={handleSchedule} disabled={validCount === 0} variant="secondary">
                    <Clock className="mr-2 h-4 w-4" />
                    Programar recordatorios ({validCount})
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
                    Procesando... esto puede tomar unos minutos.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phase: done - Send result */}
          {phase === 'done' && result && (
            <>
              <SendResultCards result={result} />
              <Button onClick={handleReset} variant="outline">
                Volver al inicio
              </Button>
            </>
          )}

          {/* Phase: done - Schedule result */}
          {phase === 'done' && scheduleResult && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Programados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-2xl font-bold">{scheduleResult.scheduled}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Omitidos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Ban className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">{scheduleResult.skipped}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Detail list */}
              {scheduleResult.details.length > 0 && (
                <Card>
                  <CardContent className="pt-4">
                    <ul className="space-y-1 text-sm">
                      {scheduleResult.details.map((d, i) => (
                        <li key={i} className={d.status === 'scheduled' ? 'text-green-600' : 'text-muted-foreground'}>
                          {d.nombre} ({d.telefono}):{' '}
                          {d.status === 'scheduled'
                            ? `Programado para ${new Date(d.scheduledAt!).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`
                            : d.reason || 'Omitido'}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2">
                <Button onClick={handleReset} variant="outline">
                  Volver al inicio
                </Button>
                <Button onClick={() => { setTab('programacion'); setPhase('idle') }}>
                  <Clock className="mr-2 h-4 w-4" />
                  Ver programacion
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* =============================================== */}
      {/* TAB: HISTORY                                    */}
      {/* =============================================== */}
      {tab === 'history' && (
        <>
          {historyView === 'list' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Ultimos 20 scrapes</p>
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
                    No hay historial aun.
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
                            onClick={() => { setSelectedEntry(entry); setDetailSelected(new Set()); setHistoryView('detail') }}
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
            <HistoryDetail
              entry={selectedEntry}
              detailSelected={detailSelected}
              setDetailSelected={setDetailSelected}
              onBack={() => { setHistoryView('list'); setSelectedEntry(null); setDetailSelected(new Set()) }}
              onResend={(apts) => {
                // Load only selected appointments into preview
                setAllAppointments(apts)
                setDate(selectedEntry.scraped_date)
                setHistoryId(selectedEntry.id)
                setActiveSucursales(new Set(selectedEntry.sucursales))
                const sel = new Set<number>()
                apts.forEach((a, i) => {
                  if (!a.estado.toLowerCase().includes('cancelada')) sel.add(i)
                })
                setSelected(sel)
                setSearchName('')
                setFilterSucursal('all')
                setFilterEstado('all')
                setResult(null)
                setScheduleResult(null)
                setError('')
                setPhase('preview')
                setTab('scrape')
                setHistoryView('list')
                setSelectedEntry(null)
                setDetailSelected(new Set())
              }}
            />
          )}
        </>
      )}

      {/* =============================================== */}
      {/* TAB: PROGRAMACION                               */}
      {/* =============================================== */}
      {tab === 'programacion' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Recordatorios programados</p>
            <Button variant="outline" size="sm" onClick={loadReminders} disabled={remindersLoading}>
              {remindersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
          </div>

          {remindersLoading && reminders.length === 0 && (
            <Card>
              <CardContent className="pt-6 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </CardContent>
            </Card>
          )}

          {/* Pendientes section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium">Pendientes</p>
              {pendingReminders.length > 0 && (
                <Badge variant="default">{pendingReminders.length} pendientes</Badge>
              )}
            </div>
            {pendingReminders.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                  No hay recordatorios pendientes
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left">Nombre</th>
                        <th className="p-3 text-left">Telefono</th>
                        <th className="p-3 text-left">Hora cita</th>
                        <th className="p-3 text-left">Hora envio</th>
                        <th className="p-3 text-left">Sucursal</th>
                        <th className="p-3 text-left w-24">Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingReminders.map(r => (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-medium">{r.nombre}</td>
                          <td className="p-3 font-mono text-xs">{r.telefono}</td>
                          <td className="p-3">{r.hora_cita}</td>
                          <td className="p-3 text-xs">
                            {new Date(r.scheduled_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                          </td>
                          <td className="p-3">{r.sucursal}</td>
                          <td className="p-3">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancelReminder(r.id)}
                              disabled={cancellingId === r.id}
                            >
                              {cancellingId === r.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Cancelar'
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>

          {/* Historial section */}
          <div>
            <p className="text-sm font-medium mb-2">Historial de recordatorios</p>
            {historyReminders.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                  No hay historial de recordatorios
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left">Nombre</th>
                        <th className="p-3 text-left">Telefono</th>
                        <th className="p-3 text-left">Sucursal</th>
                        <th className="p-3 text-left">Estado</th>
                        <th className="p-3 text-left">Fecha envio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyReminders.map(r => (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-medium">{r.nombre}</td>
                          <td className="p-3 font-mono text-xs">{r.telefono}</td>
                          <td className="p-3">{r.sucursal}</td>
                          <td className="p-3">
                            <Badge
                              variant={r.status === 'sent' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}
                              className={r.status === 'sent' ? 'bg-green-600' : ''}
                            >
                              {r.status === 'sent' ? 'Enviado' : r.status === 'failed' ? 'Fallido' : r.status === 'cancelled' ? 'Cancelado' : r.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs">
                            {r.sent_at
                              ? new Date(r.sent_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
                              : new Date(r.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// -- Shared Components --

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

function HistoryDetail({
  entry,
  detailSelected,
  setDetailSelected,
  onBack,
  onResend,
}: {
  entry: ScrapeHistoryEntry
  detailSelected: Set<number>
  setDetailSelected: (s: Set<number>) => void
  onBack: () => void
  onResend: (apts: GodentistAppointment[]) => void
}) {
  const [searchName, setSearchName] = useState('')
  const [filterSucursal, setFilterSucursal] = useState('all')
  const [filterEstado, setFilterEstado] = useState('all')

  const filtered = useMemo(() => {
    let list = entry.appointments
    if (searchName.trim()) {
      const q = searchName.toLowerCase()
      list = list.filter(a => a.nombre.toLowerCase().includes(q))
    }
    if (filterSucursal !== 'all') {
      list = list.filter(a => a.sucursal.toUpperCase() === filterSucursal)
    }
    if (filterEstado !== 'all') {
      if (filterEstado === 'cancelada') list = list.filter(a => a.estado.toLowerCase().includes('cancelada'))
      else if (filterEstado === 'no-cancelada') list = list.filter(a => !a.estado.toLowerCase().includes('cancelada'))
      else if (filterEstado === 'confirmada') list = list.filter(a => a.estado.toLowerCase().includes('confirmada'))
    }
    return list
  }, [entry.appointments, searchName, filterSucursal, filterEstado])

  const uniqueSucursales = useMemo(() => {
    const set = new Set(entry.appointments.map(a => a.sucursal.toUpperCase()))
    return Array.from(set).sort()
  }, [entry.appointments])

  // Map filtered indices back to original indices for selection
  const filteredOriginalIndices = useMemo(() => {
    return filtered.map(apt => entry.appointments.indexOf(apt))
  }, [filtered, entry.appointments])

  function toggleDetailSelect(filteredIdx: number) {
    const origIdx = filteredOriginalIndices[filteredIdx]
    const next = new Set(detailSelected)
    if (next.has(origIdx)) next.delete(origIdx)
    else next.add(origIdx)
    setDetailSelected(next)
  }

  function toggleDetailAll() {
    const allSelected = filteredOriginalIndices.every(i => detailSelected.has(i))
    const next = new Set(detailSelected)
    if (allSelected) {
      filteredOriginalIndices.forEach(i => next.delete(i))
    } else {
      filteredOriginalIndices.forEach(i => next.add(i))
    }
    setDetailSelected(next)
  }

  // Build selected set relative to filtered list for AppointmentsTable
  const filteredSelected = useMemo(() => {
    const set = new Set<number>()
    filteredOriginalIndices.forEach((origIdx, filteredIdx) => {
      if (detailSelected.has(origIdx)) set.add(filteredIdx)
    })
    return set
  }, [filteredOriginalIndices, detailSelected])

  function handleResendSelected() {
    const selectedApts = entry.appointments.filter((_, i) => detailSelected.has(i))
    onResend(selectedApts)
  }

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            &larr; Volver
          </Button>
          <Badge variant="secondary">Fecha: {entry.scraped_date}</Badge>
          <Badge variant="outline">{entry.total_appointments} citas</Badge>
          {detailSelected.size > 0 && (
            <Badge variant="default">{detailSelected.size} seleccionadas</Badge>
          )}
        </div>
        <Button size="sm" onClick={handleResendSelected} disabled={detailSelected.size === 0}>
          <Send className="mr-1 h-3 w-3" />
          Reenviar seleccion ({detailSelected.size})
        </Button>
      </div>

      {/* Send results if exists */}
      {entry.send_results && (
        <>
          <p className="text-sm font-medium">Resultados del envio ({new Date(entry.sent_at!).toLocaleString('es-CO', { timeZone: 'America/Bogota' })})</p>
          <SendResultCards result={entry.send_results} />

          {entry.send_results.failed > 0 && (
            <Card className="border-destructive">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Envios fallidos</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {entry.send_results.details
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

      <p className="text-sm font-medium">Citas scrapeadas</p>
      <AppointmentsTable
        appointments={filtered}
        selected={filteredSelected}
        toggleSelect={toggleDetailSelect}
        toggleAll={toggleDetailAll}
        selectable
      />
    </>
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
