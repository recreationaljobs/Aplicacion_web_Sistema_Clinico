import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/authContextValue'
import { listPatients } from '../../services/patientService'
import { normalizePage } from '../../services/pagination'
import PaginationControls from '../../components/PaginationControls'

const dateFormatter = new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const formatDate = (value) => value ? dateFormatter.format(new Date(`${value}T00:00:00Z`)) : 'Sin registrar'
const initials = (patient) => `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase()
const PAGE_SIZE = 25

export default function PatientsPage() {
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [patientCount, setPatientCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [orderingField, setOrderingField] = useState('created_at')
  const [orderingDirection, setOrderingDirection] = useState('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const isDentist = user.role === 'ODONTOLOGO'
  const canCreate = user.role === 'ADMINISTRADOR' || user.permissions?.includes('patients.create')
  const ordering = `${orderingDirection === 'desc' ? '-' : ''}${orderingField}`

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      listPatients(
        accessToken,
        search,
        page > 1 ? page : undefined,
        undefined,
        ordering,
      )
        .then((data) => {
          if (!active) return
          const loaded = normalizePage(data)
          setPatients(loaded.results)
          setPatientCount(loaded.count)
        })
        .catch((requestError) => { if (active) setError(requestError.message) })
        .finally(() => { if (active) setLoading(false) })
    }, search ? 250 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [accessToken, ordering, page, search])

  return <div className="mx-auto w-full max-w-6xl">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Gestión clínica</p><h1 className="mt-1 font-sans text-4xl font-semibold tracking-tight text-slate-900">{isDentist ? 'Mis pacientes' : 'Pacientes'}</h1><p className="mt-2 text-sm text-slate-500">{isDentist ? 'Pacientes vinculados a tus citas actuales e históricas.' : 'Gestiona los registros y expedientes de tus pacientes.'}</p></div>
      {canCreate ? <button type="button" aria-label="Nuevo paciente" onClick={() => navigate('/pacientes/nuevo')} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">＋ Nuevo paciente</button> : null}
    </header>

    <div className="mt-8 grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="relative block">
        <span className="sr-only">Buscar pacientes</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Buscar por nombre, identificación, teléfono o correo…" className="h-11 w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">Ordenar por<select aria-label="Ordenar por" value={orderingField} onChange={(event) => { setOrderingField(event.target.value); setPage(1) }} className="h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700"><option value="name">Nombre</option><option value="code">Código</option><option value="created_at">Fecha de registro</option><option value="is_active">Estado</option></select></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-600">Dirección<select aria-label="Dirección" value={orderingDirection} onChange={(event) => { setOrderingDirection(event.target.value); setPage(1) }} className="h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700"><option value="asc">Ascendente</option><option value="desc">Descendente</option></select></label>
    </div>

    <section aria-label="Lista de pacientes" className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {loading ? <p className="p-10 text-center text-sm text-slate-500">Cargando pacientes…</p> : null}
      {error ? <p role="alert" className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!loading && !error && patients.length === 0 ? <div className="grid min-h-64 place-content-center px-6 py-12 text-center"><span aria-hidden="true" className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-700">♙</span><p className="text-sm font-semibold text-slate-700">{search ? 'No encontramos pacientes con esa búsqueda.' : (isDentist ? 'Aún no tienes pacientes asignados mediante citas.' : 'Aún no hay pacientes registrados.')}</p><p className="mt-1 text-xs text-slate-400">{search ? 'Prueba con otro nombre, identificación o teléfono.' : (isDentist ? 'Los pacientes aparecerán cuando se te asigne una cita.' : 'Registra al primer paciente para abrir su expediente.')}</p></div> : null}
      {!loading && !error && patients.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[840px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Paciente</th><th className="px-5 py-3">Contacto</th><th className="px-5 py-3">{isDentist ? 'Próxima cita' : 'Fecha de nacimiento'}</th><th className="px-5 py-3">{isDentist ? 'Última consulta' : 'Registro'}</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody className="divide-y divide-slate-100">{patients.map((patient) => <tr key={patient.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">{initials(patient)}</span><span><strong className="block text-sm text-slate-800">{patient.full_name}</strong><small className="text-xs text-slate-500">{patient.code}</small>{patient.profile_complete === false ? <small className="mt-1 block font-semibold text-amber-700">Perfil incompleto</small> : null}</span></div></td><td className="px-5 py-4 text-xs text-slate-600"><span className="block">{patient.phone || 'Sin teléfono'}</span><span className="mt-1 block">{patient.email || 'Sin correo'}</span></td><td className="px-5 py-4 text-xs text-slate-600">{isDentist ? (patient.next_appointment_date ? <>{formatDate(patient.next_appointment_date)} · {patient.next_appointment_time?.slice(0, 5)}<span className="mt-1 block">{patient.next_appointment_status}</span></> : 'Sin próxima cita') : formatDate(patient.date_of_birth)}</td><td className="px-5 py-4 text-xs text-slate-600">{isDentist ? (patient.last_consultation_date ? formatDate(patient.last_consultation_date) : 'Sin consultas') : dateFormatter.format(new Date(patient.created_at))}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${patient.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{patient.is_active ? 'Activo' : 'Inactivo'}</span></td><td className="px-5 py-4 text-right"><Link to={`/pacientes/${patient.id}`} className="text-xs font-semibold text-blue-700 no-underline hover:underline">Ver ›</Link></td></tr>)}</tbody></table></div> : null}
      {!loading && !error ? <PaginationControls count={patientCount} label="Pacientes" onPageChange={setPage} page={page} pageSize={PAGE_SIZE} /> : null}
    </section>
  </div>
}
