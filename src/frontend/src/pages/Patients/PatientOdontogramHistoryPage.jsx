import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../context/authContextValue'
import {
  getPatient,
  getPatientOdontogramVersion,
  listPatientOdontogramVersions,
} from '../../services/patientService'
import OdontogramChart from './OdontogramChart'
import { PatientHeader, PatientTabs } from './PatientRecordShell'
import { comparisonSummary } from './odontogramSchema'
import { patientIdentity, patientInitials } from './patientDisplay'
import PaginationControls from '../../components/PaginationControls'
import { normalizePage } from '../../services/pagination'

const PAGE_SIZE = 25

const dateFormatter = new Intl.DateTimeFormat('es-NI', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatDate(value, includeTime = false) {
  if (!value) return 'Sin fecha'
  return includeTime
    ? new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

function ComparisonCard({ label, version, hiddenOnMobile, scrollContainerRef, onScroll }) {
  if (!version) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Cargando versión…</div>
  return <article className={`${hiddenOnMobile ? 'hidden md:block' : ''} min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}>
    <header className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700">{label}</p><h3 className="font-sans text-xl font-semibold text-slate-900">Versión {version.version_number}</h3></div><span className="text-right text-[11px] text-slate-500">{formatDate(version.consultation_date)}<br />{version.professional_name}</span></header>
    <OdontogramChart dentition={version.dentition} teeth={version.teeth || {}} highlightedTeeth={version.changed_teeth || []} scrollContainerRef={scrollContainerRef} onScroll={onScroll} ariaLabel={`${label}: odontograma`} />
  </article>
}

export default function PatientOdontogramHistoryPage() {
  const { patientId } = useParams()
  const { accessToken } = useAuth()
  const [patient, setPatient] = useState(null)
  const [versions, setVersions] = useState([])
  const [versionCount, setVersionCount] = useState(0)
  const [page, setPage] = useState(1)
  const [versionAId, setVersionAId] = useState('')
  const [versionBId, setVersionBId] = useState('')
  const [versionA, setVersionA] = useState(null)
  const [versionB, setVersionB] = useState(null)
  const [mobileSide, setMobileSide] = useState('A')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const chartARef = useRef(null)
  const chartBRef = useRef(null)
  const synchronizationFrameRef = useRef(null)
  const pendingSynchronizationRef = useRef(null)
  const programmaticScrollRef = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([
      getPatient(accessToken, patientId),
      listPatientOdontogramVersions(accessToken, patientId, page > 1 ? page : undefined),
    ]).then(([loadedPatient, versionPayload]) => {
      if (!active) return
      const loadedVersions = normalizePage(versionPayload)
      setPatient(loadedPatient)
      setVersions(loadedVersions.results)
      setVersionCount(loadedVersions.count)
      if (loadedVersions.results.length) {
        setVersionAId(String(loadedVersions.results.at(-1).id))
        setVersionBId(String(loadedVersions.results[0].id))
      }
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [accessToken, page, patientId])

  useEffect(() => {
    if (!versionAId || !versionBId) return undefined
    let active = true
    const loadA = getPatientOdontogramVersion(accessToken, patientId, versionAId)
    const loadB = versionAId === versionBId
      ? loadA
      : getPatientOdontogramVersion(accessToken, patientId, versionBId)
    Promise.all([loadA, loadB]).then(([loadedA, loadedB]) => {
      if (!active) return
      setVersionA(loadedA)
      setVersionB(loadedB)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    })
    return () => { active = false }
  }, [accessToken, patientId, versionAId, versionBId])

  const changes = useMemo(() => comparisonSummary(versionA, versionB), [versionA, versionB])
  const synchronize = useCallback((source, targetRef) => {
    const sourceElement = source.currentTarget
    const programmaticScroll = programmaticScrollRef.current
    if (
      programmaticScroll?.element === sourceElement
      && programmaticScroll.left === sourceElement.scrollLeft
    ) {
      programmaticScrollRef.current = null
      return
    }

    const target = targetRef.current
    if (!target) return
    pendingSynchronizationRef.current = { target, left: sourceElement.scrollLeft }
    if (synchronizationFrameRef.current !== null) return

    synchronizationFrameRef.current = requestAnimationFrame(() => {
      const pending = pendingSynchronizationRef.current
      pendingSynchronizationRef.current = null
      synchronizationFrameRef.current = null
      if (!pending || pending.target.scrollLeft === pending.left) return
      programmaticScrollRef.current = { element: pending.target, left: pending.left }
      pending.target.scrollLeft = pending.left
    })
  }, [])
  const synchronizeAtoB = useCallback((event) => synchronize(event, chartBRef), [synchronize])
  const synchronizeBtoA = useCallback((event) => synchronize(event, chartARef), [synchronize])

  useEffect(() => () => {
    if (synchronizationFrameRef.current !== null) {
      cancelAnimationFrame(synchronizationFrameRef.current)
    }
    pendingSynchronizationRef.current = null
    programmaticScrollRef.current = null
  }, [])

  if (loading) return <p className="p-10 text-center text-sm text-slate-500">Cargando histórico…</p>
  if (!patient) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error || 'No fue posible cargar el histórico.'}</p>

  return <div className="mx-auto w-full max-w-7xl">
    <Link to={`/pacientes/${patientId}`} className="mb-5 inline-flex text-sm font-medium text-slate-600 no-underline hover:text-blue-700">← Volver al expediente</Link>
    <PatientHeader patient={patient} title={patient.full_name} initials={patientInitials(patient)} isActive={patient.is_active} identityText={patientIdentity(patient)} />
    <PatientTabs patientId={patient.id} active="odontogram" />
    <header className="mt-6 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">Evolución dental</p><h1 className="mt-1 font-sans text-3xl font-semibold text-slate-900">Histórico de odontogramas</h1><p className="mt-1 text-sm text-slate-500">Cada versión conserva la consulta, el profesional y los cambios registrados.</p></header>
    {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
    {!versions.length ? <section className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><h2 className="font-sans text-2xl font-semibold text-slate-800">Aún no hay odontogramas</h2><p className="mt-2 text-sm text-slate-500">El primer odontograma se crea al guardar una consulta.</p></section> : <>
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-sans text-2xl font-semibold text-slate-900">Línea temporal</h2>
        <ol className="relative mt-5 space-y-1 border-l border-cyan-200 pl-6">{versions.map((version) => <li key={version.id} className="relative rounded-xl px-3 py-4 hover:bg-slate-50"><span aria-hidden="true" className="absolute -left-[1.95rem] top-5 h-3 w-3 rounded-full border-2 border-white bg-cyan-700 ring-1 ring-cyan-200" /><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-slate-800">Versión {version.version_number} · {version.consultation_type_display}</p><p className="mt-1 text-xs text-slate-500">Consulta {formatDate(version.consultation_date)} · Guardado {formatDate(version.created_at, true)} · {version.professional_name}</p>{version.note ? <p className="mt-2 text-sm text-slate-600">{version.note}</p> : null}</div><div className="flex shrink-0 flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{version.changed_teeth.length} piezas modificadas</span><button type="button" onClick={() => setVersionBId(String(version.id))} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Comparar</button><Link to={`/pacientes/${patientId}/consultas/${version.consultation}/odontograma`} className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">Ver consulta</Link></div></div></li>)}</ol>
        <PaginationControls count={versionCount} label="odontogramas" page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-sans text-2xl font-semibold text-slate-900">Comparar versiones</h2><p className="mt-1 text-sm text-slate-500">Las piezas con contorno ámbar cambiaron en la versión mostrada.</p></div><div className="grid gap-3 sm:grid-cols-2">{[['Versión A', versionAId, setVersionAId], ['Versión B', versionBId, setVersionBId]].map(([label, value, setter]) => <label key={label} className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}<select aria-label={label} value={value} onChange={(event) => setter(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-700">{[...versions].reverse().map((version) => <option key={version.id} value={version.id}>Versión {version.version_number}</option>)}</select></label>)}</div></div>
        <div className="mt-4 inline-flex rounded-lg bg-white p-1 shadow-sm md:hidden"><button type="button" aria-pressed={mobileSide === 'A'} onClick={() => setMobileSide('A')} className={`rounded px-3 py-1.5 text-xs font-semibold ${mobileSide === 'A' ? 'bg-cyan-700 text-white' : 'text-slate-500'}`}>Ver A</button><button type="button" aria-pressed={mobileSide === 'B'} onClick={() => setMobileSide('B')} className={`rounded px-3 py-1.5 text-xs font-semibold ${mobileSide === 'B' ? 'bg-cyan-700 text-white' : 'text-slate-500'}`}>Ver B</button></div>
        <div className="mt-5 grid gap-5 md:grid-cols-2"><ComparisonCard label="Versión A" version={versionA} hiddenOnMobile={mobileSide !== 'A'} scrollContainerRef={chartARef} onScroll={synchronizeAtoB} /><ComparisonCard label="Versión B" version={versionB} hiddenOnMobile={mobileSide !== 'B'} scrollContainerRef={chartBRef} onScroll={synchronizeBtoA} /></div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold text-slate-800">Resumen de cambios</h3>{changes.length ? <ul className="mt-2 space-y-1 text-sm text-slate-600">{changes.map((change) => <li key={change}>{change}</li>)}</ul> : <p className="mt-2 text-sm italic text-slate-400">Las versiones seleccionadas no tienen diferencias clínicas.</p>}</div>
      </section>
    </>}
  </div>
}
