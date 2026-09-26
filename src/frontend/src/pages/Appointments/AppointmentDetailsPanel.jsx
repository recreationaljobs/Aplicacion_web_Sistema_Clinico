import { useEffect, useRef, useState } from 'react'
import { profileFieldLabel } from '../Patients/patientProfileDisplay'
import { formatClock, formatLongDate, statusTone } from './appointmentDisplay'

const actionLabels = {
  CONFIRMADA: 'Confirmar cita',
  NO_ASISTIO: 'Marcar inasistencia',
}

const formatStartedAt = (value, timeZone) => new Intl.DateTimeFormat('es-NI', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone,
}).format(new Date(value))

const compactDate = (value) => value.split('-').reverse().join('/')

const rescheduleInterval = (event, prefix) => (
  `${compactDate(event[`${prefix}_date`])} · ${formatClock(event[`${prefix}_start_time`])} · ${event[`${prefix}_duration_minutes`]} min`
)

export default function AppointmentDetailsPanel({
  appointment,
  canEdit,
  canCheckIn,
  canViewPatient,
  canCompletePatientProfile,
  canStartAttendance,
  canContinueAttendance,
  timeZone,
  onClose,
  onEdit,
  onStatus,
  onOpenPatient,
  onCompletePatientProfile,
  onStartAttendance,
  onCheckIn,
  onUndoCheckIn,
  onContinueAttendance,
  rescheduleHistory = [],
  rescheduleHistoryLoading = false,
  rescheduleHistoryError = '',
}) {
  const titleRef = useRef(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancellationReason, setCancellationReason] = useState(appointment.cancellation_reason || '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [correctingArrival, setCorrectingArrival] = useState(false)
  const [arrivalReason, setArrivalReason] = useState('')

  useEffect(() => {
    setCancelling(false)
    setCorrectingArrival(false)
    setCancellationReason(appointment.cancellation_reason || '')
  }, [appointment.cancellation_reason, appointment.status])

  useEffect(() => {
    titleRef.current?.focus()
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const transition = async (status, extra = {}) => {
    setSaving(true)
    setError(null)
    try {
      await onStatus(status, extra)
      if (status === 'CANCELADA') setCancelling(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const clinicalAction = async (action) => {
    setSaving(true)
    setError(null)
    try {
      await action()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  const scheduled = appointment.status === 'PROGRAMADA'
  const confirmed = appointment.status === 'CONFIRMADA'
  const checkedIn = appointment.status === 'PRESENTE'
  const patientInactive = appointment.patient_is_active === false
  const editable = canEdit && (scheduled || confirmed)
  const canRegisterArrival = canCheckIn && !patientInactive && !appointment.consultation && (scheduled || confirmed)
  const canCorrectArrival = canEdit && checkedIn && !appointment.consultation
  const canStart = canStartAttendance && !patientInactive && !appointment.consultation && (scheduled || confirmed || checkedIn)
  const startAvailable = appointment.attendance?.can_start === true
  const canContinue = canContinueAttendance
    && appointment.status === 'EN_ATENCION'
    && Boolean(appointment.consultation)
  const canViewConsultation = canContinueAttendance
    && appointment.status === 'COMPLETADA'
    && Boolean(appointment.consultation)
  const hasActions = editable || canViewPatient || canRegisterArrival || canCorrectArrival || canStart || canContinue || canViewConsultation
  const profileError = error?.data?.code === 'patient_profile_incomplete'
  const missingFields = profileError && Array.isArray(error.data.missing_fields)
    ? error.data.missing_fields
    : []
  const errorMessage = typeof error === 'string'
    ? error
    : (error?.data?.detail || error?.message || '')

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:p-5">
    <section role="dialog" aria-modal="true" aria-label="Detalle de cita" className="h-full w-full overflow-y-auto bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-2xl sm:rounded-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">Detalle de cita</p><h2 ref={titleRef} tabIndex="-1" id="appointment-detail-title" className="mt-1 font-sans text-3xl font-semibold text-slate-900 outline-none">{appointment.patient_name}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{appointment.patient_code}</p></div>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="grid h-10 w-10 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100">×</button>
      </header>
      <div className="space-y-6 p-6">
        {patientInactive ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Paciente inactivo</p> : null}
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong className="block">{errorMessage}</strong>
          {missingFields.length > 0 ? <><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-red-700">Campos faltantes</p><ul className="mt-1 list-disc space-y-1 pl-5">{missingFields.map((field) => <li key={field}>{profileFieldLabel(field)}</li>)}</ul></> : null}
          {profileError && canCompletePatientProfile ? <button type="button" onClick={onCompletePatientProfile} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100">Completar perfil</button> : null}
        </div> : null}
        <div className="rounded-2xl bg-blue-50 p-5">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusTone[appointment.status] || statusTone.PROGRAMADA}`}>{appointment.status_display}</span>
          <p className="mt-4 text-lg font-semibold text-slate-900">{formatLongDate(appointment.date)}</p>
          <p className="mt-1 text-sm font-semibold text-blue-800">{formatClock(appointment.start_time)}–{formatClock(appointment.end_time)} · {appointment.duration_minutes} minutos</p>
        </div>
        <dl className="grid gap-5 text-sm">
          <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Odontólogo</dt><dd className="mt-1 font-semibold text-slate-800">{appointment.dentist_name}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Servicio</dt><dd className="mt-1 text-slate-700">{appointment.service_name || 'Sin servicio asociado.'}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Motivo</dt><dd className="mt-1 text-slate-700">{appointment.reason}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Notas</dt><dd className="mt-1 whitespace-pre-wrap text-slate-700">{appointment.notes || 'Sin notas adicionales.'}</dd></div>
          {appointment.consultation ? <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Consulta asociada</dt><dd className="mt-1 font-semibold text-slate-800">Consulta #{appointment.consultation}</dd></div> : null}
          {appointment.attendance_started_at ? <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Inicio real</dt><dd className="mt-1 text-slate-700">{formatStartedAt(appointment.attendance_started_at, timeZone)}</dd></div> : null}
          {appointment.cancellation_reason ? <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Motivo de cancelación</dt><dd className="mt-1 text-slate-700">{appointment.cancellation_reason}</dd></div> : null}
        </dl>
        <section aria-label="Historial de reprogramaciones" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-sans text-lg font-semibold text-slate-900">Historial de reprogramaciones</h3>
          {rescheduleHistoryLoading ? <p role="status" className="mt-3 text-sm text-slate-500">Cargando historial…</p> : null}
          {rescheduleHistoryError ? <p role="alert" className="mt-3 text-sm text-red-700">{rescheduleHistoryError}</p> : null}
          {!rescheduleHistoryLoading && !rescheduleHistoryError && rescheduleHistory.length === 0 ? <p className="mt-3 text-sm text-slate-500">Sin reprogramaciones registradas.</p> : null}
          {!rescheduleHistoryLoading && !rescheduleHistoryError && rescheduleHistory.length > 0 ? <ol className="mt-3 space-y-3">{rescheduleHistory.map((event) => <li key={event.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
            <p><span className="font-semibold">Anterior:</span> {rescheduleInterval(event, 'previous')}</p>
            <p className="mt-1"><span className="font-semibold">Nuevo:</span> {rescheduleInterval(event, 'new')}</p>
            {event.reason ? <p className="mt-2">{event.reason}</p> : null}
            <p className="mt-2 text-xs text-slate-500">{event.changed_by_name} · {formatStartedAt(event.created_at, timeZone)}</p>
          </li>)}</ol> : null}
        </section>
        {cancelling ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><label className="block text-sm font-semibold text-red-800">Motivo de cancelación <span className="font-normal">(opcional)</span><textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} rows="3" className="mt-2 w-full rounded-xl border border-red-200 bg-white p-3 font-normal outline-none focus:ring-2 focus:ring-red-100" /></label><div className="mt-3 flex gap-2"><button type="button" onClick={() => setCancelling(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600">Volver</button><button disabled={saving} type="button" onClick={() => transition('CANCELADA', { cancellation_reason: cancellationReason.trim() })} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white">Confirmar cancelación</button></div></div> : null}
        {correctingArrival ? <div className="rounded-xl border border-amber-200 p-4">
          <label className="grid gap-2 text-sm font-semibold">Motivo de corrección de llegada
            <textarea maxLength={1000} value={arrivalReason} onChange={(event) => setArrivalReason(event.target.value)} className="rounded-lg border p-3" />
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={saving} onClick={() => setCorrectingArrival(false)}>Volver</button>
            <button type="button" disabled={saving || !arrivalReason.trim()} onClick={() => clinicalAction(() => onUndoCheckIn(arrivalReason.trim()))} className="rounded-lg bg-amber-700 px-4 py-2 text-white disabled:opacity-50">Confirmar corrección</button>
          </div>
        </div> : null}
        {hasActions && !cancelling && !correctingArrival ? <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          {canViewPatient ? <button type="button" onClick={onOpenPatient} className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-50">Abrir expediente</button> : null}
          {canRegisterArrival ? <button disabled={saving} type="button" onClick={() => clinicalAction(onCheckIn)} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{saving ? 'Registrando…' : 'Registrar llegada'}</button> : null}
          {canCorrectArrival ? <button type="button" disabled={saving} onClick={() => setCorrectingArrival(true)} className="rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800">Corregir llegada</button> : null}
          {canStart ? <div><button disabled={saving || !startAvailable} type="button" onClick={() => clinicalAction(onStartAttendance)} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Iniciando…' : 'Iniciar consulta'}</button>{!startAvailable ? <p role="status" className="mt-2 text-sm text-slate-600">{appointment.attendance?.detail || 'Consultando disponibilidad de atención…'}</p> : null}</div> : null}
          {canContinue ? <button type="button" onClick={onContinueAttendance} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">Continuar atención</button> : null}
          {canViewConsultation ? <button type="button" onClick={onContinueAttendance} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">Ver consulta</button> : null}
          {editable ? <button type="button" onClick={onEdit} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Editar</button> : null}
          {editable && scheduled ? <button disabled={saving} type="button" onClick={() => transition('CONFIRMADA')} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">{actionLabels.CONFIRMADA}</button> : null}
          {editable && confirmed ? <button disabled={saving} type="button" onClick={() => transition('NO_ASISTIO')} className="rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800">{actionLabels.NO_ASISTIO}</button> : null}
          {editable ? <button type="button" onClick={() => setCancelling(true)} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Cancelar cita</button> : null}
        </div> : null}
      </div>
    </section>
  </div>
}
