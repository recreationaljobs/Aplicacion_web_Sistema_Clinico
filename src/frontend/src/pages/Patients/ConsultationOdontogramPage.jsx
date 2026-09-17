import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBeforeUnload, useBlocker, useParams } from 'react-router-dom'
import { useAuth } from '../../context/authContextValue'
import {
  createOdontogramVersion,
  getConsultationOdontogram,
  getPatient,
  getPatientConsultation,
  getPatientPlannedOdontogramOverlay,
} from '../../services/patientService'
import { ConsultationTabs } from './ConsultationRecordShell'
import OdontogramChart from './OdontogramChart'
import { PatientHeader, PatientTabs } from './PatientRecordShell'
import {
  DENTITIONS,
  FINDING_LABELS,
  PRIMARY_ARCHES,
  PERMANENT_ARCHES,
  SURFACE_FINDINGS,
  SURFACE_LABELS,
  WHOLE_FINDINGS,
  cloneChart,
  emptyTooth,
  toothName,
} from './odontogramSchema'
import { patientIdentity, patientInitials } from './patientDisplay'
import { buildPlannedOdontogramOverlay } from './odontogramOverlay'

function CloudIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.3 8.3 4.5 4.5 0 0 0 7 18Z" /><path d="m9 13 3-3 3 3M12 10v7" /></svg>
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
}

function UnsavedDialog({ blocker, allowNavigationRef }) {
  if (blocker.state !== 'blocked') return null
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[1px]">
    <section role="dialog" aria-modal="true" aria-labelledby="odontogram-unsaved-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <h2 id="odontogram-unsaved-title" className="font-sans text-2xl font-semibold text-slate-900">Cambios sin guardar</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">El odontograma tiene cambios clínicos pendientes.</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => blocker.reset()} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Seguir editando</button>
        <button type="button" onClick={() => { allowNavigationRef.current = true; blocker.proceed() }} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">Descartar y salir</button>
      </div>
    </section>
  </div>
}

function FindingLegend() {
  const items = [
    ['#C62828', 'Caries o fractura', 'C/F'],
    ['#0B57D0', 'Restauración existente', 'R'],
    ['#087C91', 'Sellante o selección', 'S'],
    ['#C77A00', 'Plan de tratamiento', 'P'],
    ['#475569', 'Estado de pieza completa', '●'],
  ]
  return <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-600" aria-label="Leyenda del odontograma">
    {items.map(([color, label, mark]) => <span key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="grid h-4 min-w-4 place-items-center rounded border bg-white px-0.5 text-[8px] font-bold" style={{ borderColor: color, color }}>{mark}</span>{label}</span>)}
  </div>
}

function ToothEditor({ code, tooth, layer, canModify, onToggleWhole, onNote, onHealthy, onReset }) {
  if (!code) return <aside className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 lg:sticky lg:top-5 lg:self-start">Selecciona una pieza para revisar sus superficies y hallazgos.</aside>
  return <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-5 lg:self-start">
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">Pieza seleccionada</p>
    <h2 className="mt-1 font-sans text-2xl font-semibold capitalize text-slate-900">Pieza {code}</h2>
    <p className="mt-1 text-xs capitalize text-slate-500">{toothName(code)}</p>
    <div className="mt-5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{layer === 'current' ? 'Estado de pieza completa' : 'Tratamiento de pieza completa'}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(WHOLE_FINDINGS[layer] || []).map((finding) => {
          const active = tooth?.[layer]?.whole?.includes(finding)
          return canModify
            ? <button key={finding} type="button" onClick={() => onToggleWhole(code, finding)} aria-pressed={active} className={`rounded-lg border px-2.5 py-2 text-xs font-semibold ${active ? 'border-cyan-700 bg-cyan-50 text-cyan-800' : 'border-slate-200 text-slate-600 hover:border-cyan-300'}`}>{FINDING_LABELS[finding]}</button>
            : active ? <span key={finding} className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700">{FINDING_LABELS[finding]}</span> : null
        })}
        {!canModify && !tooth?.[layer]?.whole?.length ? <span className="text-xs italic text-slate-400">Sin hallazgos de pieza completa</span> : null}
      </div>
    </div>
    <div className="mt-5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Superficies registradas</p>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">
        {Object.entries(tooth?.[layer]?.surfaces || {}).map(([surface, findings]) => <li key={surface}><span className="font-semibold capitalize">{SURFACE_LABELS[surface]}:</span> {findings.map((finding) => FINDING_LABELS[finding]).join(', ')}</li>)}
        {!Object.keys(tooth?.[layer]?.surfaces || {}).length ? <li className="italic text-slate-400">Sin superficies afectadas</li> : null}
      </ul>
    </div>
    <label className="mt-5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Nota clínica
      {canModify
        ? <textarea aria-label={`Nota clínica de pieza ${code}`} value={tooth?.note || ''} onChange={(event) => onNote(code, event.target.value)} rows="3" placeholder="Añade una observación de esta pieza" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-100" />
        : <p className="mt-2 whitespace-pre-wrap text-sm font-normal normal-case tracking-normal text-slate-600">{tooth?.note || 'Sin nota clínica'}</p>}
    </label>
    {canModify ? <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => onHealthy(code)} className="rounded-lg border border-cyan-200 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-50">Marcar como sano</button><button type="button" onClick={() => onReset(code)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Restablecer pieza</button></div> : null}
  </aside>
}

function PlannedTreatmentDetails({ code, items }) {
  if (!code) return <aside className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-6 text-center text-sm text-slate-600 lg:sticky lg:top-5 lg:self-start">Selecciona una pieza para ver todos sus tratamientos pendientes.</aside>
  return <aside className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm lg:sticky lg:top-5 lg:self-start">
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Plan estructurado vigente</p>
    <h2 className="mt-1 font-sans text-2xl font-semibold text-slate-900">Pieza {code}</h2>
    {items.length ? <ul className="mt-4 space-y-3">{items.map((item) => <li key={item.treatment_item_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="font-semibold text-slate-900">{item.description}</p>
      <p className="mt-1 text-xs text-slate-600">{item.status_display || item.status} · Consulta #{item.proposed_in?.id}</p>
      <p className="mt-1 text-xs text-slate-600">{FINDING_LABELS[item.planned_finding] || item.planned_finding}{item.surfaces?.length ? ` · ${item.surfaces.map((surface) => SURFACE_LABELS[surface]).join(', ')}` : ''}</p>
    </li>)}</ul> : <p className="mt-4 text-sm italic text-slate-500">No hay tratamientos pendientes para esta pieza.</p>}
  </aside>
}

export default function ConsultationOdontogramPage() {
  const { patientId, consultationId } = useParams()
  const { user, accessToken } = useAuth()
  const allowNavigationRef = useRef(false)
  const [patient, setPatient] = useState(null)
  const [consultation, setConsultation] = useState(null)
  const [version, setVersion] = useState(null)
  const [chart, setChart] = useState(null)
  const [baselineChart, setBaselineChart] = useState(null)
  const [layer, setLayer] = useState('current')
  const [activeFinding, setActiveFinding] = useState('CARIES')
  const [selectedTooth, setSelectedTooth] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [plannedItems, setPlannedItems] = useState([])
  const [plannedOverlayError, setPlannedOverlayError] = useState('')
  const canModify = consultation?.status === 'EN_PROGRESO' && patient?.is_active !== false
    && (user.role === 'ADMINISTRADOR' || user.permissions?.includes('consultations.edit'))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setPlannedOverlayError('')
    try {
      const [patientResult, consultationResult, versionResult, overlayResult] = await Promise.allSettled([
        getPatient(accessToken, patientId),
        getPatientConsultation(accessToken, patientId, consultationId),
        getConsultationOdontogram(accessToken, patientId, consultationId),
        getPatientPlannedOdontogramOverlay(accessToken, patientId),
      ])
      const failedCore = [patientResult, consultationResult, versionResult]
        .find((result) => result.status === 'rejected')
      if (failedCore) throw failedCore.reason
      const loadedPatient = patientResult.value
      const loadedConsultation = consultationResult.value
      const loadedVersion = versionResult.value
      const loadedChart = cloneChart(loadedVersion)
      setPatient(loadedPatient)
      setConsultation(loadedConsultation)
      setVersion(loadedVersion)
      setChart(loadedChart)
      setBaselineChart(loadedChart)
      if (overlayResult.status === 'fulfilled') {
        setPlannedItems(overlayResult.value)
      } else {
        setPlannedItems([])
        setPlannedOverlayError(overlayResult.reason?.message || 'No fue posible cargar el plan estructurado vigente.')
      }
      setConflict(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [accessToken, consultationId, patientId])

  useEffect(() => { load() }, [load])

  const isDirty = canModify && chart && baselineChart && (
    chart.dentition !== baselineChart.dentition
    || JSON.stringify(chart.teeth) !== JSON.stringify(baselineChart.teeth)
  )
  const blocker = useBlocker(useCallback(() => isDirty && !saving && !allowNavigationRef.current, [isDirty, saving]))
  useBeforeUnload(useCallback((event) => {
    if (isDirty && !saving) {
      event.preventDefault()
      event.returnValue = ''
    }
  }, [isDirty, saving]))

  const updateTooth = (code, updater) => setChart((current) => {
    const next = structuredClone(current)
    const tooth = next.teeth[code] ? structuredClone(next.teeth[code]) : emptyTooth()
    updater(tooth)
    next.teeth[code] = tooth
    return next
  })

  const toggleSurface = (code, surface) => {
    if (!canModify || layer !== 'current' || !activeFinding) return
    updateTooth(code, (tooth) => {
      const findings = tooth[layer].surfaces[surface] || []
      tooth[layer].surfaces[surface] = findings.includes(activeFinding)
        ? findings.filter((finding) => finding !== activeFinding)
        : [...findings, activeFinding]
      if (!tooth[layer].surfaces[surface].length) delete tooth[layer].surfaces[surface]
    })
  }

  const toggleWhole = (code, finding) => updateTooth(code, (tooth) => {
    const findings = tooth[layer].whole
    tooth[layer].whole = findings.includes(finding)
      ? findings.filter((item) => item !== finding)
      : [...findings, finding]
  })
  const updateNote = (code, note) => updateTooth(code, (tooth) => { tooth.note = note })
  const markHealthy = (code) => updateTooth(code, (tooth) => {
    tooth.reviewed = true
    tooth.current = { whole: [], surfaces: {} }
  })
  const resetTooth = (code) => updateTooth(code, (tooth) => {
    tooth.reviewed = true
    tooth.note = ''
    tooth.current = { whole: [], surfaces: {} }
  })

  const changeDentition = (dentition) => {
    const allowed = dentition === 'PRIMARY'
      ? new Set([...PRIMARY_ARCHES.upper, ...PRIMARY_ARCHES.lower])
      : dentition === 'PERMANENT'
        ? new Set([...PERMANENT_ARCHES.upper, ...PERMANENT_ARCHES.lower])
        : new Set([...PRIMARY_ARCHES.upper, ...PRIMARY_ARCHES.lower, ...PERMANENT_ARCHES.upper, ...PERMANENT_ARCHES.lower])
    setChart((current) => ({
      ...current,
      dentition,
      teeth: Object.fromEntries(Object.entries(current.teeth).filter(([code]) => allowed.has(code))),
    }))
    setSelectedTooth('')
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setConflict(false)
    try {
      const saved = await createOdontogramVersion(accessToken, patientId, consultationId, {
        base_version_id: version.id,
        dentition: chart.dentition,
        teeth: chart.teeth,
        note: chart.note,
      })
      const savedChart = cloneChart(saved)
      setVersion(saved)
      setChart(savedChart)
      setBaselineChart(savedChart)
    } catch (requestError) {
      setError(requestError.message)
      setConflict(requestError.status === 409)
    } finally {
      setSaving(false)
    }
  }

  const reviewedCount = useMemo(() => Object.values(chart?.teeth || {}).filter((tooth) => tooth.reviewed).length, [chart])
  const plannedOverlay = useMemo(
    () => buildPlannedOdontogramOverlay(plannedItems),
    [plannedItems],
  )
  const totalCount = chart?.dentition === 'PRIMARY' ? 20 : chart?.dentition === 'MIXED' ? 52 : 32

  if (loading) return <p className="p-10 text-center text-sm text-slate-500">Cargando odontograma…</p>
  if (!patient || !consultation || !version || !chart) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error || 'No fue posible cargar el odontograma.'}</p>

  return <div className="mx-auto w-full max-w-7xl pb-20">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <Link to={`/pacientes/${patientId}/consultas/${consultationId}`} className="text-sm font-medium text-slate-600 no-underline hover:text-blue-700">← Volver a la consulta</Link>
      {isDirty ? <div aria-label="Acciones de cambios" className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg sm:right-8"><button type="button" onClick={save} disabled={saving} aria-label="Guardar cambios" title="Guardar cambios" className="grid h-9 w-9 place-items-center rounded-lg text-blue-700 hover:bg-blue-50 disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" /> : <CloudIcon />}</button><button type="button" onClick={() => { setChart(structuredClone(baselineChart)); setError(''); setConflict(false) }} aria-label="Descartar cambios" title="Descartar cambios" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><CloseIcon /></button></div> : null}
    </div>
    <PatientHeader patient={patient} title={patient.full_name} initials={patientInitials(patient)} isActive={patient.is_active} identityText={patientIdentity(patient)} />
    <PatientTabs patientId={patient.id} active="consultations" />
    <ConsultationTabs patientId={patient.id} consultationId={consultation.id} active="odontogram" />
    <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">Salud dental · {consultation.consultation_type_display}</p><h1 className="mt-1 font-sans text-3xl font-semibold text-slate-900">Odontograma clínico</h1><p className="mt-1 text-sm text-slate-500">Registra el estado actual y el plan sin sobrescribir versiones anteriores.</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-cyan-800 shadow-sm">Versión {version.version_number}</span>{canModify ? null : <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Solo lectura</span>}</div>
    </div>
    {error ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span>{error}</span>{conflict ? <button type="button" onClick={load} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-700 shadow-sm">Cargar última versión</button> : null}</div> : null}
    {plannedOverlayError ? <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">El estado actual sigue disponible. El plan estructurado no pudo cargarse: {plannedOverlayError}</p> : null}

    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Dentición
            <select aria-label="Dentición" disabled={!canModify} value={chart.dentition} onChange={(event) => changeDentition(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-700 disabled:bg-slate-50">{DENTITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Progreso de evaluación</p><p className="mt-2 text-sm font-semibold text-slate-700">{reviewedCount} de {totalCount} piezas</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-cyan-700" style={{ width: `${Math.min(100, reviewedCount / totalCount * 100)}%` }} /></div></div>
        </div>
        <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1" aria-label="Capa del odontograma">{[['current', 'Estado actual'], ['planned', 'Plan de tratamiento']].map(([value, label]) => <button key={value} type="button" aria-pressed={layer === value} onClick={() => { setLayer(value); setActiveFinding(value === 'current' ? SURFACE_FINDINGS.current[0] : '') }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${layer === value ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>
      </div>
      <div className="mt-5 border-y border-slate-100 py-4">
        {canModify && layer === 'current' ? <div className="mb-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Hallazgo de superficie</span>{SURFACE_FINDINGS.current.map((finding) => <button key={finding} type="button" aria-pressed={activeFinding === finding} onClick={() => setActiveFinding(finding)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeFinding === finding ? 'border-cyan-700 bg-cyan-50 text-cyan-800' : 'border-slate-200 text-slate-600 hover:border-cyan-300'}`}>{FINDING_LABELS[finding]}</button>)}</div> : null}
        {layer === 'planned' ? <p className="mb-4 text-sm text-amber-800">Esta capa se deriva de tratamientos propuestos y aceptados. La planificación manual guardada en versiones anteriores se conserva en el histórico.</p> : null}
        <FindingLegend />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <OdontogramChart dentition={chart.dentition} teeth={layer === 'planned' ? plannedOverlay.teeth : chart.teeth} layer={layer} canModify={canModify && layer === 'current'} selectedTooth={selectedTooth} onSelectTooth={setSelectedTooth} onSurfaceClick={toggleSurface} />
        {layer === 'planned'
          ? <PlannedTreatmentDetails code={selectedTooth} items={plannedOverlay.detailsByTooth[selectedTooth] || []} />
          : <ToothEditor code={selectedTooth} tooth={chart.teeth[selectedTooth]} layer={layer} canModify={canModify} onToggleWhole={toggleWhole} onNote={updateNote} onHealthy={markHealthy} onReset={resetTooth} />}
      </div>
      {canModify ? <label className="mt-5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Nota de la nueva versión
        <textarea aria-label="Nota de la versión" value={chart.note} onChange={(event) => setChart((current) => ({ ...current, note: event.target.value }))} rows="2" placeholder="Motivo o contexto de esta revisión (opcional)" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-100" />
      </label> : null}
    </section>
    <UnsavedDialog blocker={blocker} allowNavigationRef={allowNavigationRef} />
  </div>
}
