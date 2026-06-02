# Bug: "Guias Inter" se queda cargando indefinidamente

## Fecha: 2026-02-26
## Severidad: P1 (funcionalidad bloqueada para usuario)
## Comando afectado: "Guias Inter" (executeGenerarGuiasInter / pdf_guide_inter)

## Sintoma
Al ejecutar "Guias Inter" desde Chat de Comandos, el UI muestra "Procesando: 2/2" pero nunca transiciona al resultado con el link de descarga del PDF. El usuario debe refrescar la pagina para salir del estado cargando.

## Diagnostico

### Backend: OK
- Jobs en DB se completan exitosamente (~13 segundos)
- Items tienen status='success' con documentUrl en value_sent
- No hay jobs stuck en pending/processing
- Ultimo job: `01b7033e` — 2/2 success, PDF generado y subido a Storage

### Frontend: BUG
- `useRobotJobProgress` depende EXCLUSIVAMENTE de Supabase Realtime para detectar job completion
- `isComplete = job?.status === 'completed' || job?.status === 'failed'`
- El `job` state solo se actualiza via Realtime subscription en `robot_jobs` UPDATE
- Si el evento Realtime no llega, `isComplete` nunca se vuelve true
- El UI se queda en estado "executing" indefinidamente

### Por que afecta mas a Guias Inter
- `create_shipment`: 38-140s (items se procesan uno a uno en Railway, muchos eventos Realtime)
- `guide_lookup`: 143s+ (items se procesan uno a uno en Railway)
- `pdf_guide_inter`: ~13s (TODO el procesamiento en Inngest steps, rapido)
- La ventana de tiempo entre subscription setup y job completion es muy corta para pdf_guide_inter
- Cualquier perdida de evento Realtime (timing, reconexion, rate limit) bloquea el UI

## Causa raiz
`useRobotJobProgress` no tiene mecanismo de fallback. Si Realtime pierde el evento de `robot_jobs.status = 'completed'`, no hay recovery.

## Fix: Polling de respaldo

### Cambio en `src/hooks/use-robot-job-progress.ts`
Agregar un interval de polling cada 5 segundos que consulta `getJobStatus()` como safety net:
- Si Realtime entrega el evento, el polling es redundante (no hace nada)
- Si Realtime falla, el polling detecta la completacion en max 5 segundos
- El polling se detiene cuando no hay job activo o cuando el job completa
- Usar `useRef` para el interval ID, cleanup en el effect return

### Logica del polling
```
useEffect(() => {
  if (!jobId) return

  const intervalId = setInterval(async () => {
    const result = await getJobStatus(jobType)  // pass jobType for scoping
    if (result.success && result.data) {
      const freshJob = result.data.job
      const freshItems = result.data.items
      // Update state if job progressed
      setJob(freshJob)
      setItems(freshItems)
    }
  }, 5000)

  return () => clearInterval(intervalId)
}, [jobId])
```

### Notas
- El polling NO reemplaza Realtime — es un complemento de seguridad
- Realtime sigue dando actualizaciones de baja latencia para progress
- El polling solo importa para el evento critico de completion que Realtime puede perder
- 5 segundos es un buen balance entre responsividad y carga al servidor
