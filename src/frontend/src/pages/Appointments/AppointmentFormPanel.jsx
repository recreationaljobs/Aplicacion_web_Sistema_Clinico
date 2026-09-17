import { useEffect, useRef, useState } from 'react'
import { getAvailableDentists } from '../../services/appointmentService'
import { searchPatientOptions } from '../../services/patientService'
import PatientQuickCreateDialog from './PatientQuickCreateDialog'
import PatientSearchField from './PatientSearchField'

const EMPTY_FORM = {
  patient: '', dentist: '', service: '', date: '', start_time: '09:00', duration_minutes: '60', reason: '', notes: '', reschedule_reason: '',
}

const formString = (value) => (value === null || value === undefined ? '' : String(value))
const dateFormatter = new Intl.DateTimeFormat('es-NI', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

const creationValues = (selectedDate, initialValues) => {
  const values = { ...EMPTY_FORM, date: selectedDate }
  Object.keys(EMPTY_FORM).forEach((field) => {
    if (Object.hasOwn(initialValues || {}, field)) values[field] = formString(initialValues[field])
  })
  return values
}

export default function AppointmentFormPanel({
  accessToken,
  appointment,
  services,
  selectedDate,
  initialValues = null,
  initialPatient = null,
  initialDentist = null,
  followUpContext = null,
  canCreatePatient = false,
  onClose,
  onSave,
}) {
  const titleRef = useRef(null)
  const patientSearchRef = useRef(null)
  const [values, setValues] = useState(EMPTY_FORM)
  const [patientSearch, setPatientSearch] = useState('')
  const [patientOptions, setPatientOptions] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [patientSearchError, setPatientSearchError] = useState('')
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [dentists, setDentists] = useState([])
  const [loadingDentists, setLoadingDentists] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [availabilityError, setAvailabilityError] = useState('')

  useEffect(() => {
    setValues(appointment ? {
      patient: String(appointment.patient),
      dentist: String(appointment.dentist),
      service: appointment.service ? String(appointment.service) : '',
      date: appointment.date,
      start_time: appointment.start_time.slice(0, 5),
      duration_minutes: String(appointment.duration_minutes),
      reason: appointment.reason,
      notes: appointment.notes || '',
      reschedule_reason: '',
    } : creationValues(selectedDate, initialValues))
    setPatientSearch('')
    setPatientOptions([])
    setSelectedPatient(appointment ? {
      id: appointment.patient,
      code: appointment.patient_code,
      full_name: appointment.patient_name,
      phone: '',
      date_of_birth: null,
    } : initialPatient)
    setDentists(!appointment && initialDentist ? [initialDentist] : [])
    setLoadingPatients(false)
    setPatientSearchError('')
    setQuickCreateOpen(false)
    setError('')
    setAvailabilityError('')
    titleRef.current?.focus()
  }, [appointment, initialDentist, initialPatient, initialValues, selectedDate])

  useEffect(() => {
    let active = true
    setAvailabilityError('')
    if (!values.date || !values.start_time) {
      setDentists(initialDentist ? [initialDentist] : [])
      setLoadingDentists(false)
      return () => { active = false }
    }
    setLoadingDentists(true)
    setDentists([])
    getAvailableDentists(accessToken, {
      date: values.date,
      startTime: values.start_time,
      durationMinutes: values.duration_minutes,
      excludeId: appointment?.id,
    })
      .then((data) => {
        if (!active) return
        setDentists(data)
        if (!data.length) setAvailabilityError('No hay odontólogos disponibles para este horario.')
        setValues((current) => (
          current.dentist && !data.some((dentist) => String(dentist.id) === current.dentist)
            ? { ...current, dentist: '' }
            : current
        ))
      })
      .catch((requestError) => {
        if (!active) return
        setAvailabilityError(requestError.message)
        setDentists([])
        setValues((current) => ({ ...current, dentist: '' }))
      })
      .finally(() => { if (active) setLoadingDentists(false) })
    return () => { active = false }
  }, [accessToken, appointment?.id, initialDentist, values.date, values.duration_minutes, values.start_time])

  useEffect(() => {
    const search = patientSearch.trim()
    if (search.length < 2) {
      setPatientOptions([])
      setLoadingPatients(false)
      setPatientSearchError('')
      return undefined
    }

    let active = true
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoadingPatients(true)
      setPatientSearchError('')
      searchPatientOptions(accessToken, search, controller.signal)
        .then((data) => {
          if (active) setPatientOptions(data)
        })
        .catch((requestError) => {
          if (active && requestError.name !== 'AbortError') {
            setPatientOptions([])
            setPatientSearchError(requestError.message)
          }
        })
        .finally(() => {
          if (active) setLoadingPatients(false)
        })
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [accessToken, patientSearch])

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !quickCreateOpen) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, quickCreateOpen])

  const change = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }))
    setError('')
  }

  const changeService = (event) => {
    const selected = services.find((item) => String(item.id) === event.target.value)
    setValues((current) => {
      const previous = services.find((item) => String(item.id) === current.service)
      return {
        ...current,
        service: event.target.value,
        duration_minutes: selected ? String(selected.duration_minutes) : current.duration_minutes,
        reason: selected && (!current.reason.trim() || current.reason === previous?.name)
          ? selected.name
          : current.reason,
      }
    })
    setError('')
  }

  const searchPatients = (query) => {
    setPatientSearch(query)
    setPatientOptions([])
    setLoadingPatients(query.trim().length >= 2)
    setPatientSearchError('')
    setError('')
  }
  const selectPatient = (patient) => {
    setSelectedPatient(patient)
    setPatientOptions((current) => (
      current.some((option) => option.id === patient.id)
        ? current
        : [patient, ...current]
    ))
    setValues((current) => ({ ...current, patient: String(patient.id) }))
    setPatientSearch('')
    setLoadingPatients(false)
    setPatientSearchError('')
    setQuickCreateOpen(false)
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    if (loadingDentists || availabilityError || !dentists.length) return
    if (!values.patient) {
      setError('Selecciona un paciente de los resultados.')
      patientSearchRef.current?.focus()
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        patient: Number(values.patient),
        dentist: Number(values.dentist),
        service: values.service ? Number(values.service) : null,
        date: values.date,
        start_time: values.start_time,
        duration_minutes: Number(values.duration_minutes),
        reason: values.reason.trim(),
        notes: values.notes.trim(),
      }
      if (appointment) payload.reschedule_reason = values.reschedule_reason.trim()
      await onSave(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:p-5">
    <section role="dialog" aria-modal="true" aria-labelledby="appointment-form-title" className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-3xl sm:rounded-2xl">
      <header className="flex shrink-0 items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">Agenda clínica</p>
          <h2 ref={titleRef} tabIndex="-1" id="appointment-form-title" className="mt-1 font-sans text-3xl font-semibold text-slate-900 outline-none">{appointment ? 'Editar cita' : 'Nueva cita'}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar panel" className="grid h-10 w-10 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-700">×</button>
      </header>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div role="region" aria-label="Datos de la cita" tabIndex={0} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
        {followUpContext ? <aside aria-label="Contexto de seguimiento" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong className="block">Próxima cita de seguimiento</strong>
          {followUpContext.treatmentDescription ? <span className="mt-1 block">{followUpContext.treatmentDescription}</span> : null}
          {followUpContext.serviceName && followUpContext.serviceAvailable === false ? <span className="mt-1 block text-xs text-blue-700">{followUpContext.serviceName} no está disponible para nuevas citas.</span> : null}
        </aside> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Fecha<input required type="date" value={values.date} onChange={change('date')} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="text-sm font-semibold text-slate-700">Hora<input required type="time" value={values.start_time} onChange={change('start_time')} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
        </div>
        <label className="block text-sm font-semibold text-slate-700">Servicio <span className="font-normal text-slate-400">(opcional)</span><select value={values.service} onChange={changeService} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Sin servicio del catálogo</option>{services.filter((item) => item.is_active || item.id === appointment?.service).map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? '' : ' · archivado'}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-700">Duración<select value={values.duration_minutes} onChange={change('duration_minutes')} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{Array.from({ length: 16 }, (_, index) => (index + 1) * 15).map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select></label>
        <PatientSearchField
          query={patientSearch} options={patientOptions} selectedPatient={selectedPatient}
          loading={loadingPatients} error={patientSearchError} inputRef={patientSearchRef}
          onQueryChange={searchPatients} onSelect={selectPatient}
          onClear={() => { setSelectedPatient(null); setValues((current) => ({ ...current, patient: '' })); searchPatients('') }}
          canCreate={canCreatePatient && !appointment} onCreate={() => setQuickCreateOpen(true)}
        />
        <label className="block text-sm font-semibold text-slate-700">Odontólogo<select required disabled={loadingDentists} value={values.dentist} onChange={change('dentist')} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none disabled:bg-slate-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">{loadingDentists ? 'Consultando disponibilidad…' : dentists.length ? 'Selecciona un odontólogo disponible' : 'No hay odontólogos disponibles'}</option>{dentists.map((dentist) => <option key={dentist.id} value={dentist.id}>{dentist.full_name}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-700">Motivo<input required maxLength="240" value={values.reason} onChange={change('reason')} placeholder="Ej. Valoración de ortodoncia" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
        {appointment ? <label className="block text-sm font-semibold text-slate-700">Notas <span className="font-normal text-slate-400">(opcional)</span><textarea rows="4" value={values.notes} onChange={change('notes')} placeholder="Indicaciones o contexto para la atención" className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label> : null}
        {appointment ? <label className="block text-sm font-semibold text-slate-700">Motivo de reprogramación <span className="font-normal text-slate-400">(opcional)</span><input aria-label="Motivo de reprogramación" maxLength="500" value={values.reschedule_reason} onChange={change('reschedule_reason')} placeholder="Ej. Solicitud del paciente" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label> : null}
        </div>
        <div role="region" aria-label="Acciones de la cita" className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
          {availabilityError || error ? <div id="appointment-form-error" role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">{availabilityError || error}</p>
            {availabilityError ? <p className="mt-1">{values.date ? `Fecha elegida: ${dateFormatter.format(new Date(`${values.date}T00:00:00Z`))}. ` : ''}Cambia la fecha o la hora para consultar otro horario.</p> : null}
          </div> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button disabled={saving || loadingDentists || Boolean(availabilityError)} aria-describedby={availabilityError || error ? 'appointment-form-error' : undefined} type="submit" className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Guardando…' : appointment ? 'Guardar cambios' : 'Programar cita'}</button>
          </div>
        </div>
      </form>
    </section>
    {quickCreateOpen ? <PatientQuickCreateDialog
      accessToken={accessToken}
      onCancel={() => setQuickCreateOpen(false)}
      onSelect={selectPatient}
    /> : null}
  </div>
}
