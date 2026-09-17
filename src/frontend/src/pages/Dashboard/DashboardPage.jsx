import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MenuIcon from '../../components/MenuIcon'
import { listAllAppointments } from '../../services/appointmentService'
import { listPatientDashboardSummary, listRecentConsultations } from '../../services/patientService'
import { formatClock, statusTone, todayValue } from '../Appointments/appointmentDisplay'
import { useClinic } from '../../context/clinicContextValue'

const consultationInitials = (consultation) => consultation.patient_name
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase()

const formatShortDate = (value) => {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

const formatToday = (value) => {
  const formatted = new Intl.DateTimeFormat('es-NI', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`
}

function StatCard({ label, value, icon, tone, error }) {
  return (
    <article aria-label={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 font-sans text-3xl text-slate-900">{value}</p>
        {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
      </div>
      <span aria-hidden="true" className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><MenuIcon name={icon} className="h-5 w-5 shrink-0" /></span>
    </article>
  )
}

function RecentConsultationsCard({ consultations, error, loading, personal, showProfessional }) {
  const title = personal ? 'Mis consultas recientes' : 'Consultas recientes'
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-400">{personal ? 'Tus últimas atenciones' : 'Últimas atenciones del equipo'}</p>
        </div>
        <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-700">
          {personal ? 'Personal' : 'Equipo'}
        </span>
      </div>
      {loading ? <div className="grid min-h-36 place-content-center px-6 py-8 text-center"><p className="text-sm text-slate-500">Cargando consultas…</p></div> : null}
      {!loading && error ? <div className="grid min-h-36 place-content-center px-6 py-8 text-center"><p role="alert" className="text-sm text-red-700">{error}</p></div> : null}
      {!loading && !error && consultations.length === 0 ? <div className="grid min-h-36 place-content-center px-6 py-8 text-center">
        <span aria-hidden="true" className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-cyan-50 text-lg text-cyan-700">⌁</span>
        <p className="text-sm font-semibold text-slate-700">No hay consultas recientes.</p>
        <p className="mt-1 text-xs text-slate-400">Las atenciones registradas aparecerán aquí.</p>
      </div> : null}
      {!loading && !error && consultations.length > 0 ? <ul className="divide-y divide-slate-100">
        {consultations.map((consultation) => <li key={consultation.id}>
          <Link
            to={`/pacientes/${consultation.patient}/consultas/${consultation.id}`}
            aria-label={`Ver consulta de ${consultation.patient_name}`}
            className="flex items-center gap-3 px-5 py-4 no-underline transition hover:bg-cyan-50/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600"
          >
            <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-50 text-xs font-bold text-cyan-700">{consultationInitials(consultation)}</span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm text-slate-800">{consultation.patient_name}</strong>
              <small className="block truncate text-xs text-slate-500">{consultation.consultation_type_display}{showProfessional ? ` · ${consultation.professional_name}` : ''}</small>
            </span>
            <span className="shrink-0 text-right">
              <time dateTime={consultation.date} className="block text-[11px] font-semibold tabular-nums text-slate-500">{formatShortDate(consultation.date)}</time>
              <span aria-hidden="true" className="text-sm text-blue-700">›</span>
            </span>
          </Link>
        </li>)}
      </ul> : null}
    </article>
  )
}

export default function DashboardPage({ user, accessToken }) {
  const { profile } = useClinic()
  const navigate = useNavigate()
  const [patientTotal, setPatientTotal] = useState(0)
  const [patientsLoading, setPatientsLoading] = useState(true)
  const [patientsError, setPatientsError] = useState('')
  const [appointments, setAppointments] = useState([])
  const [appointmentsLoading, setAppointmentsLoading] = useState(true)
  const [appointmentsError, setAppointmentsError] = useState('')
  const [recentConsultations, setRecentConsultations] = useState([])
  const [recentConsultationsLoading, setRecentConsultationsLoading] = useState(true)
  const [recentConsultationsError, setRecentConsultationsError] = useState('')
  const currentDate = todayValue(profile.timezone)
  const name = user?.first_name || 'Arguello'
  const isAdministrator = user?.role === 'ADMINISTRADOR'
  const isDentist = user?.role === 'ODONTOLOGO'
  const isReceptionist = user?.role === 'RECEPCIONISTA'
  const canCreatePatient = user?.role === 'ADMINISTRADOR' || user?.permissions?.includes('patients.create')
  const canViewPatients = user?.role === 'ADMINISTRADOR' || user?.permissions?.includes('patients.view')
  const canCreateAppointment = user?.role === 'ADMINISTRADOR' || user?.permissions?.includes('appointments.create')
  const canViewAppointments = user?.role === 'ADMINISTRADOR' || user?.permissions?.includes('appointments.view')
  const canViewTeamAppointments = user?.role === 'ADMINISTRADOR' || user?.permissions?.includes('appointments.view_all')
  const canViewConsultations = isAdministrator || user?.permissions?.includes('consultations.view')
  const canViewTeamConsultations = isAdministrator || user?.permissions?.includes('consultations.view_all')
  const showRecentConsultations = canViewConsultations && (
    isAdministrator || isDentist || (isReceptionist && canViewTeamConsultations)
  )
  const hasPersonalAgenda = canViewAppointments && !canViewTeamAppointments

  useEffect(() => {
    if (!canViewPatients) {
      setPatientsLoading(false)
      return undefined
    }

    let active = true
    setPatientsLoading(true)
    setPatientsError('')
    listPatientDashboardSummary(accessToken)
      .then((data) => {
        if (active) {
          setPatientTotal(data.total_patients)
        }
      })
      .catch((requestError) => { if (active) setPatientsError(requestError.message) })
      .finally(() => { if (active) setPatientsLoading(false) })

    return () => { active = false }
  }, [accessToken, canViewPatients])

  useEffect(() => {
    if (!canViewAppointments) {
      setAppointmentsLoading(false)
      return undefined
    }

    let active = true
    setAppointmentsLoading(true)
    setAppointmentsError('')
    listAllAppointments(accessToken, { date: currentDate })
      .then((data) => { if (active) setAppointments(data) })
      .catch((requestError) => { if (active) setAppointmentsError(requestError.message) })
      .finally(() => { if (active) setAppointmentsLoading(false) })

    return () => { active = false }
  }, [accessToken, canViewAppointments, currentDate])

  useEffect(() => {
    if (!showRecentConsultations) {
      setRecentConsultationsLoading(false)
      return undefined
    }

    let active = true
    setRecentConsultationsLoading(true)
    setRecentConsultationsError('')
    listRecentConsultations(accessToken)
      .then((data) => { if (active) setRecentConsultations(data) })
      .catch((requestError) => { if (active) setRecentConsultationsError(requestError.message) })
      .finally(() => { if (active) setRecentConsultationsLoading(false) })

    return () => { active = false }
  }, [accessToken, showRecentConsultations])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Resumen del día</p>
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-slate-900">Bienvenido, Dr. {name}</h1>
          <p className="mt-1 text-sm text-slate-500">{formatToday(currentDate)}</p>
        </div>
        <div className="flex gap-2">
          {canCreatePatient ? <button type="button" aria-label="Nuevo paciente" onClick={() => navigate('/pacientes/nuevo')} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">+ Nuevo paciente</button> : null}
          {canCreateAppointment ? <button type="button" aria-label="Agendar citas" onClick={() => navigate('/citas')} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">+ Agendar citas</button> : null}
        </div>
      </section>

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total pacientes" value={patientsLoading || patientsError ? '—' : String(patientTotal)} icon="patients" tone="bg-blue-50 text-blue-700" error={patientsError} />
        <StatCard label="Citas de hoy" value={appointmentsLoading ? '—' : String(appointments.length)} icon="appointments" tone="bg-emerald-50 text-emerald-700" />
      </section>

      <section className={`grid min-h-80 gap-4 ${showRecentConsultations ? 'lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]' : ''}`}>
        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h2 className="font-semibold text-slate-900">Citas de hoy</h2><p className="text-xs text-slate-400">{hasPersonalAgenda ? 'Tu agenda del día' : 'Agenda del día'}</p></div>
            <a href="/citas" className="text-xs font-semibold text-blue-700 no-underline hover:underline">{hasPersonalAgenda ? 'Ver mi agenda →' : 'Ver todas →'}</a>
          </div>
          {appointmentsLoading ? <div className="grid min-h-56 place-content-center px-6 py-10 text-center"><p className="text-sm text-slate-500">Cargando citas…</p></div> : null}
          {!appointmentsLoading && appointmentsError ? <div className="grid min-h-56 place-content-center px-6 py-10 text-center"><p role="alert" className="text-sm text-red-700">{appointmentsError}</p></div> : null}
          {!appointmentsLoading && !appointmentsError && !canViewAppointments ? <div className="grid min-h-56 place-content-center px-6 py-10 text-center"><p className="text-sm text-slate-500">No tienes permiso para consultar la agenda.</p></div> : null}
          {!appointmentsLoading && !appointmentsError && canViewAppointments && appointments.length === 0 ? <div className="grid min-h-56 place-content-center px-6 py-10 text-center">
            <span aria-hidden="true" className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-xl text-blue-700">▣</span>
            <p className="text-sm font-semibold text-slate-700">No hay citas programadas para hoy.</p>
            <p className="mt-1 text-xs text-slate-400">Las nuevas citas aparecerán aquí.</p>
          </div> : null}
          {!appointmentsLoading && !appointmentsError && appointments.length > 0 ? <ul className="divide-y divide-slate-100">
            {appointments.slice(0, 4).map((appointment) => <li key={appointment.id}>
              <Link to="/citas" aria-label={`Ver cita de ${appointment.patient_name} a las ${formatClock(appointment.start_time)}`} className="flex items-center gap-4 px-5 py-4 no-underline transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600">
                <span className="w-28 shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-blue-700">{formatClock(appointment.start_time)}–{formatClock(appointment.end_time)}</span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-slate-900">{appointment.patient_name}</strong>
                  <small className="mt-0.5 block truncate text-xs text-slate-500">{appointment.reason} · {appointment.dentist_name}</small>
                </span>
                <span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 sm:inline-flex ${statusTone[appointment.status]}`}>{appointment.status_display}</span>
                <span aria-hidden="true" className="text-blue-700">›</span>
              </Link>
            </li>)}
          </ul> : null}
        </article>

        {showRecentConsultations ? <div className="grid content-start gap-4">
          <RecentConsultationsCard
            consultations={recentConsultations}
            error={recentConsultationsError}
            loading={recentConsultationsLoading}
            personal={!canViewTeamConsultations}
            showProfessional={canViewTeamConsultations}
          />
        </div> : null}
      </section>
    </div>
  )
}
