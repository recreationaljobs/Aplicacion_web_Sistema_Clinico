import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/authContextValue'
import { listPatientConsultations } from '../../services/patientService'
import { normalizePage } from '../../services/pagination'
import PaginationControls from '../../components/PaginationControls'

const dateFormatter = new Intl.DateTimeFormat('es-NI', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const statusStyles = {
  COMPLETADA: 'bg-emerald-50 text-emerald-700',
  EN_PROGRESO: 'bg-amber-50 text-amber-700',
  CANCELADA: 'bg-red-50 text-red-700',
}
const PAGE_SIZE = 25

function formatDate(value) {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

function StatusBadge({ consultation }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[consultation.status] || 'bg-slate-100 text-slate-600'}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{consultation.status_display}</span>
}

function ConsultationCard({ consultation, patientId }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><time dateTime={consultation.date} className="font-mono text-xs font-medium text-slate-700">{formatDate(consultation.date)}</time><StatusBadge consultation={consultation} /></div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">{consultation.consultation_type_display}</span><span className="text-xs font-medium text-slate-700">{consultation.professional_name}</span></div>
    <p className="mt-3 text-sm leading-6 text-slate-600">{consultation.summary}</p>
    <Link to={`/pacientes/${patientId}/consultas/${consultation.id}`} className="mt-3 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-900">Ver detalle</Link>
  </article>
}

export default function PatientConsultationsPanel({ accessToken, patientId, patientActive = true }) {
  const { user } = useAuth()
  const [consultations, setConsultations] = useState([])
  const [consultationCount, setConsultationCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canCreate = patientActive && user.role !== 'ODONTOLOGO' && (user.role === 'ADMINISTRADOR' || user.permissions?.includes('consultations.create'))

  useEffect(() => {
    let active = true
    listPatientConsultations(accessToken, patientId, page > 1 ? page : undefined)
      .then((data) => {
        if (!active) return
        const loaded = normalizePage(data)
        setConsultations(loaded.results)
        setConsultationCount(loaded.count)
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, page, patientId])

  return <section aria-labelledby="patient-consultations-title" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    {patientActive && user.role === 'ODONTOLOGO' && user.permissions?.includes('consultations.create') ? <p className="px-6 pt-5 text-sm text-slate-600">Para iniciar una consulta, abre tu cita en <Link to="/citas" className="font-semibold text-blue-700 underline">Citas</Link>.</p> : null}
    <header className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700">Historial médico</p>
        <h2 id="patient-consultations-title" className="mt-1 font-sans text-2xl font-semibold text-slate-900">Consultas del paciente</h2>
        <p className="mt-1 text-sm text-slate-500">Consulta el seguimiento y la evolución clínica.</p></div>
      {canCreate ? <Link to={`/pacientes/${patientId}/consultas/nueva`} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><span aria-hidden="true">+&nbsp;</span>Nueva consulta</Link> : null}
    </header>

    {!patientActive ? <p className="m-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">El paciente está inactivo. Su historial permanece disponible en modo de solo lectura.</p> : null}

    {loading ? <p role="status" className="p-8 text-center text-sm text-slate-500">Cargando consultas…</p> : null}
    {error ? <p role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
    {!loading && !error && consultations.length === 0 ? <div className="grid justify-items-center px-6 py-14 text-center"><span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-cyan-50 text-cyan-700"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 11h6M9 15h6" /></svg></span><p className="mt-4 text-sm font-semibold text-slate-800">Este paciente todavía no tiene consultas registradas.</p><p className="mt-1 text-xs text-slate-500">Las consultas clínicas aparecerán aquí en orden cronológico.</p></div> : null}

    {!loading && !error && consultations.length > 0 ? <>
      <div className="grid gap-3 bg-slate-50/60 p-4 sm:hidden">{consultations.map((consultation) => <ConsultationCard key={consultation.id} consultation={consultation} patientId={patientId} />)}</div>
      <div className="hidden overflow-x-auto sm:block"><table className="w-full border-collapse text-left"><thead><tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><th className="px-6 py-3">Fecha</th><th className="px-6 py-3">Tipo</th><th className="px-6 py-3">Profesional</th><th className="px-6 py-3">Resumen</th><th className="px-6 py-3">Estado</th><th className="px-6 py-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody className="divide-y divide-slate-100">{consultations.map((consultation) => <tr key={consultation.id} className="transition-colors hover:bg-slate-50"><td className="whitespace-nowrap px-6 py-4"><time dateTime={consultation.date} className="font-mono text-xs font-medium text-slate-700">{formatDate(consultation.date)}</time></td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">{consultation.consultation_type_display}</span></td><td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-700">{consultation.professional_name}</td><td className="max-w-sm px-6 py-4 text-sm leading-6 text-slate-500">{consultation.summary}</td><td className="whitespace-nowrap px-6 py-4"><StatusBadge consultation={consultation} /></td><td className="whitespace-nowrap px-6 py-4 text-right"><Link to={`/pacientes/${patientId}/consultas/${consultation.id}`} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Ver detalle</Link></td></tr>)}</tbody></table></div>
    </> : null}
    {!loading && !error ? <PaginationControls count={consultationCount} label="Consultas" onPageChange={setPage} page={page} pageSize={PAGE_SIZE} /> : null}
  </section>
}
