import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/authContextValue'
import {
  checkInAppointment,
  createAppointment,
  getAppointment,
  listAllAppointments,
  listAppointmentReschedules,
  startAppointmentAttendance,
  updateAppointment,
  undoCheckInAppointment,
} from '../../services/appointmentService'
import { listClinicServices } from '../../services/clinicService'
import { useClinic } from '../../context/clinicContextValue'
import AppointmentDetailsPanel from './AppointmentDetailsPanel'
import AppointmentFormPanel from './AppointmentFormPanel'
import AppointmentMonthView from './AppointmentMonthView'
import AppointmentTimeline from './AppointmentTimeline'
import AppointmentWeekView from './AppointmentWeekView'
import {
  calendarRange,
  calendarTitle,
  dateBelongsToView,
  shiftDate,
  shiftMonth,
  todayValue,
} from './appointmentDisplay'

const can = (user, permission) => user.role === 'ADMINISTRADOR' || user.permissions?.includes(permission)

export default function AppointmentsPage() {
  const navigateTo = useNavigate()
  const location = useLocation()
  const { user, accessToken } = useAuth()
  const { profile } = useClinic()
  const [selectedDate, setSelectedDate] = useState(() => todayValue(profile.timezone))
  const [calendarView, setCalendarView] = useState('day')
  const [appointments, setAppointments] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [formAppointment, setFormAppointment] = useState(undefined)
  const [formPrefill, setFormPrefill] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [rescheduleHistory, setRescheduleHistory] = useState([])
  const [rescheduleHistoryLoading, setRescheduleHistoryLoading] = useState(false)
  const [rescheduleHistoryError, setRescheduleHistoryError] = useState('')
  const attendanceStartRef = useRef(null)
  const checkInRef = useRef(null)
  const canCreate = can(user, 'appointments.create')
  const canEdit = can(user, 'appointments.edit')
  const canViewPatient = can(user, 'patients.view')
  const canEditPatient = can(user, 'patients.edit')
  const canStartAttendance = can(user, 'consultations.create')
    && ['ADMINISTRADOR', 'ODONTOLOGO'].includes(user.role)
  const canContinueAttendance = can(user, 'consultations.view')
  const agendaFilters = useMemo(
    () => calendarRange(calendarView, selectedDate),
    [calendarView, selectedDate],
  )

  const loadAgenda = useCallback(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      listAllAppointments(accessToken, agendaFilters),
      listClinicServices(accessToken),
    ])
      .then(([appointmentData, serviceData]) => {
        if (!active) return
        setAppointments(appointmentData)
        setServices(serviceData)
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, agendaFilters])

  useEffect(() => loadAgenda(), [loadAgenda])

  const selectedAppointmentId = selectedAppointment?.id
  useEffect(() => {
    if (!selectedAppointmentId || !canStartAttendance) return undefined
    let active = true
    let pending = false
    const refresh = async () => {
      if (pending) return
      pending = true
      try {
        const latest = await getAppointment(accessToken, selectedAppointmentId)
        if (active) {
          setSelectedAppointment((current) => current?.version > latest.version ? current : latest)
          setAppointments((current) => current.map((item) => item.id === latest.id && !(item.version > latest.version) ? latest : item))
        }
      } catch {
        if (active) setSelectedAppointment((current) => current ? {
          ...current, attendance: { can_start: false, detail: 'No se pudo comprobar la disponibilidad. Se volverá a consultar al servidor.' },
        } : current)
      } finally {
        pending = false
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [accessToken, canStartAttendance, selectedAppointmentId])

  useEffect(() => {
    if (!selectedAppointment?.id) {
      setRescheduleHistory([])
      setRescheduleHistoryError('')
      setRescheduleHistoryLoading(false)
      return undefined
    }
    let active = true
    setRescheduleHistoryLoading(true)
    setRescheduleHistoryError('')
    listAppointmentReschedules(accessToken, selectedAppointment.id)
      .then((items) => { if (active) setRescheduleHistory(items) })
      .catch((requestError) => {
        if (active) {
          setRescheduleHistory([])
          setRescheduleHistoryError(requestError.message)
        }
      })
      .finally(() => { if (active) setRescheduleHistoryLoading(false) })
    return () => { active = false }
  }, [accessToken, selectedAppointment?.id])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const prefill = location.state?.appointmentPrefill
    if (loading || !prefill) return

    if (canCreate) {
      const treatmentService = prefill.treatment?.service
      const selectedService = treatmentService
        ? services.find(({ id, is_active: isActive }) => (
          id === treatmentService.id && isActive
        ))
        : null
      setFormPrefill({
        initialValues: {
          patient: prefill.patient?.id || '',
          dentist: prefill.dentist?.id || '',
          service: selectedService?.id || '',
          duration_minutes: selectedService?.duration_minutes || 60,
          reason: prefill.treatment?.description || 'Seguimiento clínico',
          date: '',
          start_time: '',
        },
        initialPatient: prefill.patient || null,
        initialDentist: prefill.dentist || null,
        followUpContext: {
          treatmentDescription: prefill.treatment?.description || '',
          serviceName: treatmentService?.name || '',
          serviceAvailable: treatmentService ? Boolean(selectedService) : null,
        },
      })
      setFormAppointment(undefined)
      setSelectedAppointment(null)
      setFormOpen(true)
    }
    navigateTo(location.pathname, { replace: true, state: null })
  }, [canCreate, loading, location.pathname, location.state, navigateTo, services])

  const openCreate = () => {
    setFormPrefill(null)
    setFormAppointment(undefined)
    setSelectedAppointment(null)
    setFormOpen(true)
  }

  const saveAppointment = async (values) => {
    const saved = formAppointment
      ? await updateAppointment(accessToken, formAppointment.id, {
        ...values,
        ...(formAppointment.version ? { expected_version: formAppointment.version } : {}),
      })
      : await createAppointment(accessToken, values)
    setSelectedDate(saved.date)
    setAppointments((current) => {
      const remaining = current.filter((item) => item.id !== saved.id)
      return dateBelongsToView(saved.date, calendarView, selectedDate)
        ? [...remaining, saved].sort((a, b) => a.start_time.localeCompare(b.start_time))
        : remaining
    })
    setFormOpen(false)
    setFormAppointment(undefined)
    setFormPrefill(null)
    setToast(formAppointment ? 'Cita actualizada.' : 'Cita programada.')
  }

  const changeStatus = async (status, extra = {}) => {
    const saved = await updateAppointment(accessToken, selectedAppointment.id, {
      status, ...extra,
      ...(selectedAppointment.version ? { expected_version: selectedAppointment.version } : {}),
    })
    setAppointments((current) => current.map((item) => item.id === saved.id ? saved : item))
    setSelectedAppointment(saved)
    const messages = {
      CONFIRMADA: 'Cita confirmada.', COMPLETADA: 'Cita completada.', CANCELADA: 'Cita cancelada.', NO_ASISTIO: 'Inasistencia registrada.',
    }
    setToast(messages[status])
  }

  const editSelected = () => {
    setFormPrefill(null)
    setFormAppointment(selectedAppointment)
    setSelectedAppointment(null)
    setFormOpen(true)
  }

  const startSelectedAttendance = async () => {
    if (attendanceStartRef.current === selectedAppointment.id) return
    attendanceStartRef.current = selectedAppointment.id
    try {
      const result = await startAppointmentAttendance(accessToken, selectedAppointment.id)
      setAppointments((current) => current.map((item) => (
        item.id === result.appointment.id ? result.appointment : item
      )))
      navigateTo(`/pacientes/${result.appointment.patient}/consultas/${result.consultation.id}`)
    } finally {
      attendanceStartRef.current = null
    }
  }

  const checkInSelected = async () => {
    if (checkInRef.current === selectedAppointment.id) return
    checkInRef.current = selectedAppointment.id
    try {
      const result = await checkInAppointment(accessToken, selectedAppointment.id)
      setAppointments((current) => current.map((item) => (
        item.id === result.appointment.id ? result.appointment : item
      )))
      setSelectedAppointment(result.appointment)
      setToast(result.changed ? 'Llegada registrada.' : 'La llegada ya estaba registrada.')
    } finally {
      checkInRef.current = null
    }
  }

  const openSelectedPatient = () => {
    navigateTo(`/pacientes/${selectedAppointment.patient}`)
  }

  const undoSelectedCheckIn = async (reason) => {
    const saved = await undoCheckInAppointment(accessToken, selectedAppointment.id, {
      reason, expected_version: selectedAppointment.version,
    })
    setAppointments((current) => current.map((item) => item.id === saved.id ? saved : item))
    setSelectedAppointment(saved)
    setToast('Llegada corregida.')
  }

  const continueSelectedAttendance = () => {
    navigateTo(
      `/pacientes/${selectedAppointment.patient}/consultas/${selectedAppointment.consultation}`,
    )
  }

  const navigate = (direction) => {
    setSelectedDate((value) => calendarView === 'month'
      ? shiftMonth(value, direction)
      : shiftDate(value, direction * (calendarView === 'week' ? 7 : 1)))
  }

  const openDay = (date) => {
    setSelectedDate(date)
    setCalendarView('day')
  }

  const viewLabel = { day: 'Día', week: 'Semana', month: 'Mes' }

  return <div className="mx-auto w-full max-w-7xl">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Agenda clínica</p>
        <h1 className="mt-1 font-sans text-4xl font-semibold tracking-tight text-slate-900">Citas</h1>
        <p className="mt-2 text-sm text-slate-500">Organiza la atención y revisa la disponibilidad del equipo.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label={`${viewLabel[calendarView]} anterior`} onClick={() => navigate(-1)} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-lg text-slate-600 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">‹</button>
        <button type="button" onClick={() => setSelectedDate(todayValue(profile.timezone))} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Hoy</button>
        <label className="sr-only" htmlFor="agenda-date">Fecha de agenda</label>
        <input id="agenda-date" aria-label="Fecha de agenda" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        <button type="button" aria-label={`${viewLabel[calendarView]} siguiente`} onClick={() => navigate(1)} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-lg text-slate-600 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">›</button>
        {canCreate ? <button type="button" aria-label="Nueva cita" onClick={openCreate} className="ml-auto h-11 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">＋ Nueva cita</button> : null}
      </div>
    </header>

    <section className="mt-8">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-sans text-2xl font-semibold text-slate-900">{calendarTitle(calendarView, selectedDate)}</h2><p className="mt-1 text-xs text-slate-500">{appointments.length} {appointments.length === 1 ? 'cita en el periodo' : 'citas en el periodo'}</p></div>
        <div role="group" aria-label="Vista de calendario" className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([value, label]) => <button
            key={value}
            type="button"
            aria-pressed={calendarView === value}
            onClick={() => setCalendarView(value)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${calendarView === value ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}
          >{label}</button>)}
        </div>
      </div>
      {loading ? <div className="grid min-h-72 place-content-center rounded-2xl border border-slate-200 bg-white text-center shadow-sm"><span className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-100 border-t-blue-700" aria-hidden="true" /><p className="mt-3 text-sm text-slate-500">Cargando agenda…</p></div> : null}
      {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><strong className="block">No fue posible cargar la agenda.</strong><span>{error}</span><button type="button" onClick={loadAgenda} className="mt-3 block font-semibold underline">Intentar de nuevo</button></div> : null}
      {!loading && !error && appointments.length === 0 && calendarView === 'day' ? <div className="grid min-h-72 place-content-center rounded-2xl border border-dashed border-blue-200 bg-white px-6 py-12 text-center shadow-sm"><span aria-hidden="true" className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-2xl text-blue-700">▦</span><p className="mt-4 text-sm font-semibold text-slate-800">No hay citas programadas para este día.</p><p className="mt-1 text-xs text-slate-500">Elige otra fecha o programa una nueva cita.</p>{canCreate ? <button type="button" aria-label="Programar primera cita" onClick={openCreate} className="mx-auto mt-5 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">Nueva cita</button> : null}</div> : null}
      {!loading && !error && calendarView === 'day' ? <AppointmentTimeline appointments={appointments} selectedDate={selectedDate} onSelect={setSelectedAppointment} timeZone={profile.timezone} /> : null}
      {!loading && !error && calendarView === 'week' ? <AppointmentWeekView appointments={appointments} selectedDate={selectedDate} onOpenDay={openDay} onSelect={setSelectedAppointment} /> : null}
      {!loading && !error && calendarView === 'month' ? <AppointmentMonthView appointments={appointments} selectedDate={selectedDate} onOpenDay={openDay} onSelect={setSelectedAppointment} /> : null}
    </section>

    {toast ? <div role="status" className="fixed bottom-5 right-5 z-[60] rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div> : null}
    {formOpen ? <AppointmentFormPanel
      accessToken={accessToken}
      appointment={formAppointment}
      canCreatePatient={can(user, 'patients.create')}
      services={services}
      selectedDate={selectedDate}
      initialValues={formPrefill?.initialValues}
      initialPatient={formPrefill?.initialPatient}
      initialDentist={formPrefill?.initialDentist}
      followUpContext={formPrefill?.followUpContext}
      onClose={() => { setFormOpen(false); setFormPrefill(null) }}
      onSave={saveAppointment}
    /> : null}
    {selectedAppointment ? <AppointmentDetailsPanel
      appointment={selectedAppointment}
      canEdit={canEdit}
      canCheckIn={canEdit}
      canViewPatient={canViewPatient}
      canCompletePatientProfile={canViewPatient && canEditPatient}
      canStartAttendance={canStartAttendance}
      canContinueAttendance={canContinueAttendance}
      timeZone={profile.timezone}
      onClose={() => setSelectedAppointment(null)}
      onEdit={editSelected}
      onStatus={changeStatus}
      onOpenPatient={openSelectedPatient}
      onCompletePatientProfile={openSelectedPatient}
      onStartAttendance={startSelectedAttendance}
      onCheckIn={checkInSelected}
      onUndoCheckIn={undoSelectedCheckIn}
      onContinueAttendance={continueSelectedAttendance}
      rescheduleHistory={rescheduleHistory}
      rescheduleHistoryLoading={rescheduleHistoryLoading}
      rescheduleHistoryError={rescheduleHistoryError}
    /> : null}
  </div>
}
