import { useRef, useState } from 'react'
import PatientDuplicateDialog from '../../components/PatientDuplicateDialog'
import { cedulaPattern, formatCedula } from '../../utils/identification'
import {
  checkPatientDuplicates,
  createQuickPatient,
} from '../../services/patientService'

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  phone: '',
  identification_type: '',
  identification_number: '',
}

function patientPayload(form) {
  const identificationNumber = form.identification_number.trim()
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    date_of_birth: form.date_of_birth,
    phone: form.phone.trim(),
    identification_type: identificationNumber ? form.identification_type : null,
    identification_number: identificationNumber || null,
  }
}

function candidatePayload(payload) {
  return {
    first_name: payload.first_name,
    first_last_name: payload.last_name,
    date_of_birth: payload.date_of_birth,
    phone: payload.phone,
  }
}

function minimumError(payload, rawIdentificationType) {
  if (payload.identification_number && !rawIdentificationType) {
    return 'Selecciona el tipo correspondiente al número de identificación.'
  }
  if (rawIdentificationType && !payload.identification_number) {
    return 'Indica el número o deja también vacío el tipo de identificación.'
  }
  if (!payload.phone && !payload.identification_number) {
    return 'Indica un teléfono o una identificación para registrar al paciente.'
  }
  return ''
}

export default function PatientQuickCreateDialog({ accessToken, onCancel, onSelect }) {
  const submissionPendingRef = useRef(false)
  const pendingPayloadRef = useRef(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [duplicateMatches, setDuplicateMatches] = useState([])

  const change = (field) => (event) => {
    const value = event.target.value
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (next.identification_type === 'CEDULA' && ['identification_type', 'identification_number'].includes(field)) {
        next.identification_number = formatCedula(next.identification_number)
      }
      return next
    })
    setError('')
  }

  const persist = async (payload) => {
    try {
      const created = await createQuickPatient(accessToken, payload)
      pendingPayloadRef.current = null
      onSelect(created)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
      submissionPendingRef.current = false
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (submissionPendingRef.current) return
    const payload = patientPayload(form)
    const validationError = minimumError(payload, form.identification_type)
    if (validationError) {
      setError(validationError)
      return
    }

    submissionPendingRef.current = true
    setSaving(true)
    setError('')
    try {
      const duplicateResult = await checkPatientDuplicates(
        accessToken,
        candidatePayload(payload),
      )
      if (duplicateResult.matches.length > 0) {
        pendingPayloadRef.current = payload
        setDuplicateMatches(duplicateResult.matches)
        setSaving(false)
        submissionPendingRef.current = false
        return
      }
      await persist(payload)
    } catch (requestError) {
      setError(requestError.message)
      setSaving(false)
      submissionPendingRef.current = false
    }
  }

  const createDespiteWarning = () => {
    if (submissionPendingRef.current || !pendingPayloadRef.current) return
    submissionPendingRef.current = true
    const payload = pendingPayloadRef.current
    setDuplicateMatches([])
    setSaving(true)
    setError('')
    persist(payload)
  }

  const selectExisting = (match) => {
    if (!match.is_active) return
    pendingPayloadRef.current = null
    setDuplicateMatches([])
    onSelect(match)
  }

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
    <section role="dialog" aria-modal="true" aria-labelledby="patient-quick-create-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">Agenda clínica</p>
          <h2 id="patient-quick-create-title" className="mt-1 font-sans text-2xl font-semibold text-slate-900">Alta rápida de paciente</h2>
          <p className="mt-1 text-xs text-slate-500">Crea el paciente sin abandonar la nueva cita.</p>
        </div>
        <button type="button" disabled={saving} onClick={onCancel} aria-label="Cerrar alta rápida" className="grid h-9 w-9 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button>
      </header>

      <form onSubmit={submit} className="space-y-4 p-6">
        {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Nombres<input required value={form.first_name} onChange={change('first_name')} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="text-sm font-semibold text-slate-700">Primer apellido<input required value={form.last_name} onChange={change('last_name')} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="text-sm font-semibold text-slate-700">Fecha de nacimiento<input required type="date" value={form.date_of_birth} onChange={change('date_of_birth')} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="text-sm font-semibold text-slate-700">Teléfono <span className="font-normal text-slate-400">(opcional con identificación)</span><input aria-label="Teléfono" type="tel" value={form.phone} onChange={change('phone')} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="text-sm font-semibold text-slate-700">Tipo de identificación<select value={form.identification_type} onChange={change('identification_type')} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">Sin identificación</option><option value="CEDULA">Cédula</option><option value="PASAPORTE">Pasaporte</option><option value="OTRO">Otro</option></select></label>
          <label className="text-sm font-semibold text-slate-700">Número de identificación<input value={form.identification_number} onChange={change('identification_number')} pattern={form.identification_type === 'CEDULA' ? cedulaPattern : undefined} placeholder={form.identification_type === 'CEDULA' ? '281-090403-1006K' : undefined} title={form.identification_type === 'CEDULA' ? 'Formato: 281-090403-1006K' : undefined} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
        </div>
        <p className="text-xs leading-5 text-slate-500">Se requiere teléfono o identificación. Los demás datos administrativos podrán completarse después.</p>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <button type="button" disabled={saving} onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Creando paciente…' : 'Crear paciente'}</button>
        </div>
      </form>
    </section>

    <PatientDuplicateDialog
      matches={duplicateMatches}
      busy={saving}
      onSelect={selectExisting}
      onBack={() => {
        setDuplicateMatches([])
        pendingPayloadRef.current = null
      }}
      onContinue={createDespiteWarning}
    />
  </div>
}
