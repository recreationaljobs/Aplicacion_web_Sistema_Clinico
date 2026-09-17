import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAvailableDentists } from '../../services/appointmentService'
import {
  checkPatientDuplicates,
  createQuickPatient,
  searchPatientOptions,
} from '../../services/patientService'
import AppointmentFormPanel from './AppointmentFormPanel'

vi.mock('../../services/appointmentService', () => ({ getAvailableDentists: vi.fn() }))
vi.mock('../../services/patientService', () => ({
  checkPatientDuplicates: vi.fn(),
  createQuickPatient: vi.fn(),
  searchPatientOptions: vi.fn(),
}))

const patient = {
  id: 7,
  code: 'PAC-00007',
  full_name: 'Ana Pérez',
  phone: '8888-1111',
  date_of_birth: '1990-01-01',
}
const dentist = { id: 3, full_name: 'Dra. Elena Vargas' }
const quickPatient = {
  id: 20,
  code: 'PAC-00020',
  full_name: 'Paciente Rápido',
  phone: '8888-2020',
  date_of_birth: '1990-05-10',
  profile_complete: false,
}

function deferredPromise() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function renderPanel(overrides = {}) {
  const props = {
    accessToken: 'access-token',
    appointment: undefined,
    patients: [],
    services: [],
    selectedDate: '2026-09-01',
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return { ...render(<AppointmentFormPanel {...props} />), props }
}

async function advance(milliseconds) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

describe('AppointmentFormPanel patient search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getAvailableDentists.mockResolvedValue([dentist])
    searchPatientOptions.mockResolvedValue([])
    checkPatientDuplicates.mockResolvedValue({ has_matches: false, matches: [] })
    createQuickPatient.mockResolvedValue(quickPatient)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('does not search on open or below two characters and debounces valid text', async () => {
    renderPanel()

    expect(screen.queryByLabelText(/Notas/)).not.toBeInTheDocument()
    expect(searchPatientOptions).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'A' } })
    await advance(400)
    expect(searchPatientOptions).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'An' } })
    await advance(299)
    expect(searchPatientOptions).not.toHaveBeenCalled()
    await advance(1)

    expect(searchPatientOptions).toHaveBeenCalledWith(
      'access-token',
      'An',
      expect.any(AbortSignal),
    )
  })

  it('shows loading, selects a result directly, and submits the patient id', async () => {
    const pending = deferredPromise()
    searchPatientOptions.mockReturnValueOnce(pending.promise)
    const { props } = renderPanel()
    await act(async () => {})

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Ana' } })
    await advance(300)
    expect(screen.getByText('Buscando pacientes…')).toBeInTheDocument()

    await act(async () => pending.resolve([patient]))
    expect(screen.getByRole('option', { name: /Ana Pérez.*PAC-00007/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Ana Pérez.*PAC-00007/ }))

    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('PAC-00007')

    fireEvent.change(screen.getByLabelText('Odontólogo'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Control' } })
    fireEvent.click(screen.getByRole('button', { name: 'Programar cita' }))
    await act(async () => {})

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ patient: 7 }))
  })

  it('[HU-53] marks an incomplete profile but keeps it selectable for scheduling', async () => {
    const incompletePatient = { ...patient, profile_complete: false }
    searchPatientOptions.mockResolvedValue([incompletePatient])
    const { props } = renderPanel()
    await act(async () => {})

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Ana' } })
    await advance(300)

    const option = screen.getByRole('option', {
      name: /Ana Pérez.*PAC-00007.*Perfil incompleto/,
    })
    expect(option).not.toBeDisabled()
    fireEvent.click(screen.getByRole('option', { name: /Ana Pérez.*PAC-00007/ }))
    fireEvent.change(screen.getByLabelText('Odontólogo'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Valoración' } })
    fireEvent.click(screen.getByRole('button', { name: 'Programar cita' }))
    await act(async () => {})

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ patient: 7 }))
  })

  it('explains when a valid search has no results', async () => {
    renderPanel()

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Nadie' } })
    await advance(300)

    expect(screen.getByText('No encontramos pacientes.')).toBeInTheDocument()
  })

  it('[HU-52] offers inline creation after an empty search only with patient-create permission', async () => {
    renderPanel({ canCreatePatient: true })

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Paciente nuevo' } })
    await advance(300)

    expect(screen.getByRole('button', { name: 'Crear paciente' })).toBeInTheDocument()
  })

  it('[HU-52] hides inline creation without patient-create permission', async () => {
    renderPanel({ canCreatePatient: false })

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Paciente nuevo' } })
    await advance(300)

    expect(screen.getByText('No encontramos pacientes.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear paciente' })).not.toBeInTheDocument()
  })

  it('[HU-52] opens and closes quick-create without abandoning the appointment', async () => {
    renderPanel({ canCreatePatient: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Paciente nuevo' } })
    await advance(300)

    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))
    expect(screen.getByRole('dialog', { name: 'Alta rápida de paciente' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar alta rápida' }))

    expect(screen.queryByRole('dialog', { name: 'Alta rápida de paciente' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Nueva cita' })).toBeInTheDocument()
  })

  it('[HU-52] selects the new incomplete patient and continues the unchanged appointment form', async () => {
    const { props } = renderPanel({ canCreatePatient: true })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Valoración inicial' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Paciente nuevo' } })
    await advance(300)
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))

    const quickDialog = screen.getByRole('dialog', { name: 'Alta rápida de paciente' })

    fireEvent.change(within(quickDialog).getByLabelText('Nombres'), { target: { value: 'Paciente' } })
    fireEvent.change(within(quickDialog).getByLabelText('Primer apellido'), { target: { value: 'Rápido' } })
    fireEvent.change(within(quickDialog).getByLabelText('Fecha de nacimiento'), {
      target: { value: '1990-05-10' },
    })
    fireEvent.change(within(quickDialog).getByLabelText('Teléfono'), { target: { value: '8888-2020' } })
    fireEvent.click(within(quickDialog).getByRole('button', { name: 'Crear paciente' }))
    await act(async () => {})

    expect(screen.queryByRole('dialog', { name: 'Alta rápida de paciente' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('Paciente Rápido')
    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('PAC-00020')
    expect(screen.getByText('Perfil incompleto')).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo')).toHaveValue('Valoración inicial')
    expect(props.onSave).not.toHaveBeenCalled()
    expect(searchPatientOptions).toHaveBeenCalledTimes(1)
  })

  it('shows a patient-specific API error without closing the form', async () => {
    searchPatientOptions.mockRejectedValue(new Error('No fue posible buscar pacientes.'))
    renderPanel()

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Error' } })
    await advance(300)

    expect(screen.getByRole('alert')).toHaveTextContent('No fue posible buscar pacientes.')
    expect(screen.getByRole('dialog', { name: 'Nueva cita' })).toBeInTheDocument()
  })

  it('aborts the previous remote request when the search changes', async () => {
    searchPatientOptions.mockReturnValue(new Promise(() => {}))
    renderPanel()

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Ana' } })
    await advance(300)
    const firstSignal = searchPatientOptions.mock.calls[0][2]
    expect(firstSignal.aborted).toBe(false)

    fireEvent.change(screen.getByRole('combobox', { name: 'Paciente' }), { target: { value: 'Elena' } })

    expect(firstSignal.aborted).toBe(true)
  })

  it('[HU-51] applies editable follow-up defaults without searching or inventing date and time', async () => {
    renderPanel({
      services: [{ id: 4, name: 'Restauración simple', duration_minutes: 45, is_active: true }],
      initialValues: {
        patient: 7,
        dentist: 3,
        service: 4,
        duration_minutes: 45,
        reason: 'Restauración de resina',
        date: '',
        start_time: '',
      },
      initialPatient: patient,
      initialDentist: dentist,
    })
    await act(async () => {})

    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('PAC-00007')
    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('Ana Pérez')
    expect(screen.getByLabelText('Odontólogo')).toHaveValue('3')
    expect(screen.getByLabelText(/Servicio/)).toHaveValue('4')
    expect(screen.getByLabelText('Duración')).toHaveValue('45')
    expect(screen.getByLabelText('Motivo')).toHaveValue('Restauración de resina')
    expect(screen.getByLabelText('Fecha')).toHaveValue('')
    expect(screen.getByLabelText('Hora')).toHaveValue('')
    expect(searchPatientOptions).not.toHaveBeenCalled()
    expect(getAvailableDentists).not.toHaveBeenCalled()
  })

  it('[HU-51] keeps inactive historical service as context and uses current duration after a service change', async () => {
    renderPanel({
      services: [{ id: 5, name: 'Control activo', duration_minutes: 90, is_active: true }],
      initialValues: {
        patient: 7,
        dentist: 3,
        service: '',
        duration_minutes: 60,
        reason: 'Control periodontal',
        date: '',
        start_time: '',
      },
      initialPatient: patient,
      initialDentist: dentist,
      followUpContext: {
        treatmentDescription: 'Control periodontal',
        serviceName: 'Servicio histórico',
        serviceAvailable: false,
      },
    })
    await act(async () => {})

    expect(screen.getByText('Servicio histórico no está disponible para nuevas citas.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Servicio/)).toHaveValue('')

    fireEvent.change(screen.getByLabelText(/Servicio/), { target: { value: '5' } })

    expect(screen.getByLabelText('Duración')).toHaveValue('90')
    expect(screen.getByLabelText('Motivo')).toHaveValue('Control periodontal')
  })

  it('[HU-58] submits an optional trimmed reason only while editing a reschedule', async () => {
    const existing = {
      id: 9,
      patient: 7,
      patient_code: 'PAC-00007',
      patient_name: 'Ana Pérez',
      dentist: 3,
      service: null,
      date: '2026-09-01',
      start_time: '09:00:00',
      duration_minutes: 60,
      reason: 'Control',
      notes: '',
    }
    const { props } = renderPanel({ appointment: existing })
    await act(async () => {})

    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('Motivo de reprogramación'), {
      target: { value: '  Solicitud del paciente  ' },
    })
    await advance(0)
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await act(async () => {})

    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
      start_time: '10:00',
      reschedule_reason: 'Solicitud del paciente',
    }))
  })

  it('keeps a closed-day warning beside the blocked submit button while other fields are edited', async () => {
    getAvailableDentists.mockRejectedValue(new Error('La clínica está cerrada ese día.'))
    const { props } = renderPanel({
      selectedDate: '2026-09-19', initialPatient: patient, initialDentist: dentist,
      initialValues: { patient: 7, dentist: 3, reason: 'Control' },
    })
    await act(async () => {})

    const actions = screen.getByRole('region', { name: 'Acciones de la cita' })
    expect(within(actions).getByRole('alert')).toHaveTextContent('La clínica está cerrada ese día.')
    expect(within(actions).getByRole('alert')).toHaveTextContent(/sábado/i)
    expect(screen.getByRole('button', { name: 'Programar cita' })).toBeDisabled()
    expect(screen.queryByRole('option', { name: dentist.full_name })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Control actualizado' } })
    expect(within(actions).getByRole('alert')).toHaveTextContent('La clínica está cerrada ese día.')
    fireEvent.submit(screen.getByRole('button', { name: 'Programar cita' }).closest('form'))
    await act(async () => {})
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('enables scheduling again after a different date has confirmed availability', async () => {
    getAvailableDentists.mockRejectedValueOnce(new Error('La clínica está cerrada ese día.'))
    const pending = deferredPromise()
    getAvailableDentists.mockReturnValueOnce(pending.promise)
    const { props } = renderPanel({
      selectedDate: '2026-09-19', initialPatient: patient, initialDentist: dentist,
      initialValues: { patient: 7, dentist: 3, reason: 'Control' },
    })
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Programar cita' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-21' } })
    expect(screen.getByRole('button', { name: 'Programar cita' })).toBeDisabled()
    await act(async () => pending.resolve([dentist]))
    expect(screen.queryByText('La clínica está cerrada ese día.')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('PAC-00007')
    fireEvent.change(screen.getByLabelText('Odontólogo'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Programar cita' }))
    await act(async () => {})
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-21', patient: 7 }))
  })

  it('shows a booking API rejection beside the submit button without losing entered data', async () => {
    renderPanel({
      initialPatient: patient, initialValues: { patient: 7, dentist: 3, reason: 'Control' },
      onSave: vi.fn().mockRejectedValue(new Error('El paciente ya tiene una cita en ese horario.')),
    })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Programar cita' }))
    await act(async () => {})
    expect(within(screen.getByRole('region', { name: 'Acciones de la cita' })).getByRole('alert')).toHaveTextContent('El paciente ya tiene una cita en ese horario.')
    expect(screen.getByLabelText('Motivo')).toHaveValue('Control')
    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('PAC-00007')
  })

  it('explains an empty dentist availability result beside the disabled submit button', async () => {
    getAvailableDentists.mockResolvedValue([])
    renderPanel()
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Programar cita' })).toBeDisabled()
    expect(within(screen.getByRole('region', { name: 'Acciones de la cita' })).getByRole('alert')).toHaveTextContent('No hay odontólogos disponibles para este horario.')
  })

  it('selects a patient directly from suggestions beneath a single search field', async () => {
    searchPatientOptions.mockResolvedValue([patient])
    const { props } = renderPanel()
    await act(async () => {})
    const input = screen.getByRole('combobox', { name: 'Paciente' })
    fireEvent.change(input, { target: { value: 'Ana' } })
    await advance(300)
    fireEvent.click(screen.getByRole('option', { name: /Ana Pérez.*PAC-00007/ }))
    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('Ana Pérez')
    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('8888-1111')
    fireEvent.change(screen.getByLabelText('Odontólogo'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Control' } })
    fireEvent.click(screen.getByRole('button', { name: 'Programar cita' }))
    await act(async () => {})
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ patient: 7 }))
  })

  it('corrects a typo in the same field and selects a result with arrows and Enter', async () => {
    searchPatientOptions.mockResolvedValueOnce([]).mockResolvedValueOnce([patient])
    renderPanel()
    const input = screen.getByRole('combobox', { name: 'Paciente' })
    fireEvent.change(input, { target: { value: 'Anaa' } })
    await advance(300)
    expect(screen.getByText('No encontramos pacientes.')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'Ana' } })
    await advance(300)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('Ana Pérez')
  })

  it('clears the old patient when changing selection and never submits unresolved search text', async () => {
    searchPatientOptions.mockResolvedValue([patient])
    const { props } = renderPanel({
      initialPatient: patient, initialValues: { patient: 7, dentist: 3, reason: 'Control' },
    })
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar paciente' }))
    const input = screen.getByRole('combobox', { name: 'Paciente' })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'Ana' } })
    await advance(300)
    fireEvent.submit(screen.getByRole('button', { name: 'Programar cita' }).closest('form'))
    await act(async () => {})
    expect(props.onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona un paciente de los resultados.')
    expect(screen.getByLabelText('Motivo')).toHaveValue('Control')
  })
})
