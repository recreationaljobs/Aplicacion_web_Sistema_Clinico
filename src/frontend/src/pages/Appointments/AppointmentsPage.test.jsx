import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom'
import { AuthContext } from '../../context/authContextValue'
import * as appointmentService from '../../services/appointmentService'
import { listAllPatients, searchPatientOptions } from '../../services/patientService'
import { listClinicServices } from '../../services/clinicService'
import AppointmentsPage from './AppointmentsPage'
import ConsultationRecordPage from '../Patients/ConsultationRecordPage'

vi.mock('../../services/appointmentService', async (importOriginal) => ({
  ...await importOriginal(),
  createAppointment: vi.fn(),
  getAvailableDentists: vi.fn(),
  listAllAppointments: vi.fn(),
  startAppointmentAttendance: vi.fn(),
  updateAppointment: vi.fn(),
  checkInAppointment: vi.fn(),
  undoCheckInAppointment: vi.fn(),
  listAppointmentReschedules: vi.fn(),
}))
vi.mock('../../services/patientService', async (importOriginal) => ({
  ...await importOriginal(),
  listAllPatients: vi.fn(),
  searchPatientOptions: vi.fn(),
}))
vi.mock('../../services/clinicService', () => ({ listClinicServices: vi.fn() }))

const clinicDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Managua',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const datePlus = (days) => {
  const value = new Date(`${clinicDate()}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const weekStart = () => {
  const value = new Date(`${clinicDate()}T12:00:00Z`)
  const weekday = value.getUTCDay()
  value.setUTCDate(value.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday))
  return value.toISOString().slice(0, 10)
}

const patient = {
  id: 1, code: 'PAC-00001', full_name: 'Ana Pérez', first_name: 'Ana', last_name: 'Pérez',
  phone: '8888-1111', is_active: true,
}
const dentist = { id: 3, full_name: 'Dra. Elena Vargas', email: 'elena@dentalclinic.com' }
const appointment = (overrides = {}) => ({
  id: 9,
  patient: 1,
  patient_name: 'Ana Pérez',
  patient_code: 'PAC-00001',
  dentist: 3,
  dentist_name: 'Dra. Elena Vargas',
  date: clinicDate(),
  start_time: '09:00:00',
  end_time: '10:00:00',
  duration_minutes: 60,
  reason: 'Valoración de ortodoncia',
  notes: 'Sensibilidad dental.',
  status: 'PROGRAMADA',
  status_display: 'Programada',
  cancellation_reason: '',
  created_by: 2,
  created_at: `${clinicDate()}T12:00:00Z`,
  updated_at: `${clinicDate()}T12:00:00Z`,
  ...overrides,
})

const receptionist = {
  role: 'RECEPCIONISTA',
  permissions: ['patients.view', 'appointments.view', 'appointments.create', 'appointments.edit'],
}
const odontologist = { role: 'ODONTOLOGO', permissions: ['appointments.view'] }

function PageHarness({ user }) {
  return <AuthContext.Provider value={{ user, accessToken: 'access-token' }}>
    <Routes>
      <Route path="/citas" element={<AppointmentsPage />} />
      <Route path="/pacientes/:patientId" element={<p>Expediente del paciente</p>} />
      <Route
        path="/pacientes/:patientId/consultas/:consultationId"
        element={<p>Consulta clínica destino</p>}
      />
    </Routes>
  </AuthContext.Provider>
}

function renderPage(user = receptionist, initialEntries = ['/citas']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <PageHarness user={user} />
    </MemoryRouter>,
  )
}

const followUpPrefill = (overrides = {}) => ({
  patient: {
    id: patient.id,
    code: patient.code,
    full_name: patient.full_name,
    phone: patient.phone,
    date_of_birth: null,
  },
  dentist,
  treatment: {
    id: 15,
    description: 'Restauración de resina',
    service: { id: 4, name: 'Restauración simple', is_active: true },
  },
  ...overrides,
})

function renderFollowUpPage(prefill = followUpPrefill(), user = receptionist) {
  return renderPage(user, [{
    pathname: '/citas',
    state: { appointmentPrefill: prefill },
  }])
}

function renderClinicalFlow(user) {
  const context = { user, accessToken: 'access-token' }
  const router = createMemoryRouter([
    {
      path: '/citas',
      element: <AuthContext.Provider value={context}><AppointmentsPage /></AuthContext.Provider>,
    },
    {
      path: '/pacientes/:patientId/consultas/:consultationId',
      element: <AuthContext.Provider value={context}><ConsultationRecordPage /></AuthContext.Provider>,
    },
  ], { initialEntries: ['/citas'] })
  return render(<RouterProvider router={router} />)
}

describe('AppointmentsPage', () => {
  it('sends the displayed version when confirming a booking', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([appointment({ version: 7 })])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cita' }))
    await waitFor(() => expect(appointmentService.updateAppointment).toHaveBeenCalledWith(
      'access-token', 9, { status: 'CONFIRMADA', expected_version: 7 },
    ))
  })

  it('corrects an arrival with a reason and its current version', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([
      appointment({ status: 'PRESENTE', status_display: 'Presente', version: 8 }),
    ])
    appointmentService.undoCheckInAppointment.mockResolvedValue(appointment({ version: 9 }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Corregir llegada' }))
    fireEvent.change(screen.getByLabelText('Motivo de corrección de llegada'), {
      target: { value: 'Se seleccionó otra cita' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar corrección' }))
    await waitFor(() => expect(appointmentService.undoCheckInAppointment).toHaveBeenCalledWith(
      'access-token', 9, { reason: 'Se seleccionó otra cita', expected_version: 8 },
    ))
    expect(await screen.findByText('Llegada corregida.')).toBeInTheDocument()
  })

  beforeEach(() => {
    listClinicServices.mockResolvedValue([])
    appointmentService.listAllAppointments.mockResolvedValue([appointment()])
    appointmentService.getAvailableDentists.mockResolvedValue([dentist])
    appointmentService.createAppointment.mockResolvedValue(appointment())
    appointmentService.listAppointmentReschedules.mockResolvedValue([])
    appointmentService.checkInAppointment.mockResolvedValue({
      appointment: appointment({ status: 'PRESENTE', status_display: 'Presente' }),
      changed: true,
    })
    appointmentService.startAppointmentAttendance.mockResolvedValue({
      appointment: appointment({
        status: 'EN_ATENCION',
        status_display: 'En atención',
        consultation: 41,
        attendance_started_at: `${clinicDate()}T15:05:00Z`,
      }),
      consultation: { id: 41 },
      created: true,
    })
    appointmentService.updateAppointment.mockImplementation((access, id, changes) => {
      const labels = {
        CONFIRMADA: 'Confirmada', COMPLETADA: 'Completada', CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistió',
      }
      return Promise.resolve(appointment({
        ...changes,
        status_display: labels[changes.status] || 'Programada',
      }))
    })
    listAllPatients.mockResolvedValue([patient])
    searchPatientOptions.mockResolvedValue([patient])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the daily agenda and appointment context', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Citas' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ })).toBeInTheDocument()
    expect(screen.getByText('Valoración de ortodoncia')).toBeInTheDocument()
    expect(screen.getByText('Dra. Elena Vargas · 1 cita')).toBeInTheDocument()
    expect(screen.getByText('Dra. Elena Vargas', { selector: 'small' })).toBeInTheDocument()
    expect(screen.getByText('Programada')).toBeInTheDocument()
  })

  it('[HU-19] identifies each professional and shows their daily load', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([
      appointment(),
      appointment({
        id: 10,
        patient: 2,
        patient_name: 'Luis Mendoza',
        patient_code: 'PAC-00002',
        start_time: '10:00:00',
        end_time: '10:30:00',
        duration_minutes: 30,
      }),
      appointment({
        id: 11,
        patient: 3,
        patient_name: 'María Ruiz',
        patient_code: 'PAC-00003',
        dentist: 4,
        dentist_name: 'Dr. Mario Ruiz',
        start_time: '11:00:00',
        end_time: '11:45:00',
        duration_minutes: 45,
      }),
    ])

    renderPage()

    expect(await screen.findByText('Dra. Elena Vargas · 2 citas')).toBeInTheDocument()
    expect(screen.getByText('Dr. Mario Ruiz · 1 cita')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /María Ruiz, 11:00 a 11:45/ })).toBeInTheDocument()
    expect(appointmentService.listAllAppointments).toHaveBeenCalledWith(
      'access-token',
      { date: clinicDate() },
    )
  })

  it('loads the agenda without downloading every patient page', async () => {
    renderPage()

    await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ })

    expect(listAllPatients).not.toHaveBeenCalled()
    expect(searchPatientOptions).not.toHaveBeenCalled()
  })

  it('navigates days and keeps create controls behind permissions', async () => {
    const { rerender } = renderPage()
    await screen.findByText('Valoración de ortodoncia')
    const dateInput = screen.getByLabelText('Fecha de agenda')
    const initialDate = dateInput.value

    fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' }))

    expect(dateInput.value).not.toBe(initialDate)
    expect(screen.getByRole('button', { name: 'Nueva cita' })).toBeInTheDocument()

    rerender(<MemoryRouter initialEntries={['/citas']}><PageHarness user={odontologist} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Nueva cita' })).not.toBeInTheDocument()
  })

  it('switches to a seven-day agenda and opens one day from the week', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([
      appointment(),
      appointment({
        id: 10,
        patient: 2,
        patient_name: 'Luis Mendoza',
        patient_code: 'PAC-00002',
        date: weekStart(),
        start_time: '11:00:00',
        end_time: '11:45:00',
        duration_minutes: 45,
        reason: 'Control preventivo',
      }),
    ])
    renderPage()
    await screen.findByText('Valoración de ortodoncia')

    fireEvent.click(screen.getByRole('button', { name: 'Semana' }))

    const week = await screen.findByRole('region', { name: 'Vista semanal' })
    expect(within(week).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(week).getByText('Luis Mendoza')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(week).getAllByRole('button', { name: /Abrir agenda del/ })[0])
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Fecha de agenda')).toHaveValue(weekStart())
  })

  it('shows a monthly calendar and drills into a day with appointments', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([
      appointment(),
      appointment({
        id: 10,
        patient_name: 'Luis Mendoza',
        date: datePlus(1),
        start_time: '11:00:00',
        end_time: '11:45:00',
        duration_minutes: 45,
      }),
    ])
    renderPage()
    await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ })

    fireEvent.click(screen.getByRole('button', { name: 'Mes' }))

    const month = await screen.findByRole('region', { name: 'Vista mensual' })
    expect(within(month).getByText('Lun')).toBeInTheDocument()
    expect(within(month).getByText('Dom')).toBeInTheDocument()
    expect(within(month).getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(month).getAllByRole('button', { name: /Abrir agenda del/ })[0])
    expect(screen.getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('creates an appointment from the accessible side panel', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([])
    listClinicServices.mockResolvedValue([{
      id: 4, name: 'Control de ortodoncia', duration_minutes: 45, is_active: true,
    }])
    renderPage()
    await screen.findByText('No hay citas programadas para este día.')

    fireEvent.click(screen.getByRole('button', { name: 'Nueva cita' }))
    const dialog = screen.getByRole('dialog', { name: 'Nueva cita' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Paciente' }), {
      target: { value: 'Ana' },
    })
    await waitFor(() => expect(searchPatientOptions).toHaveBeenCalledWith(
      'access-token', 'Ana', expect.any(AbortSignal),
    ))
    await waitFor(() => expect(
      within(dialog).getByRole('option', { name: /Ana Pérez.*PAC-00001/ }),
    ).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole('option', { name: /Ana Pérez.*PAC-00001/ }))
    fireEvent.change(within(dialog).getByLabelText(/Servicio/), { target: { value: '4' } })
    expect(within(dialog).getByLabelText('Duración')).toHaveValue('45')
    expect(within(dialog).getByLabelText('Motivo')).toHaveValue('Control de ortodoncia')
    fireEvent.change(within(dialog).getByLabelText('Hora'), { target: { value: '09:00' } })
    await waitFor(() => expect(within(dialog).getByLabelText('Odontólogo').options.length).toBe(2))
    fireEvent.change(within(dialog).getByLabelText('Odontólogo'), { target: { value: '3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Programar cita' }))

    expect(await screen.findByText('Cita programada.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Nueva cita' })).not.toBeInTheDocument()
    expect(appointmentService.createAppointment).toHaveBeenCalledWith(
      'access-token', expect.objectContaining({
        patient: 1,
        service: 4,
        duration_minutes: 45,
        reason: 'Control de ortodoncia',
      }),
    )
  })

  it('[HU-52] exposes quick-create in the real agenda only with patients.create', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([])
    searchPatientOptions.mockResolvedValue([])
    const authorized = {
      ...receptionist,
      permissions: [...receptionist.permissions, 'patients.create'],
    }
    renderPage(authorized)
    await screen.findByText('No hay citas programadas para este día.')

    fireEvent.click(screen.getByRole('button', { name: 'Nueva cita' }))
    const appointmentDialog = screen.getByRole('dialog', { name: 'Nueva cita' })
    fireEvent.change(within(appointmentDialog).getByRole('combobox', { name: 'Paciente' }), {
      target: { value: 'Sin resultado' },
    })

    await waitFor(() => expect(searchPatientOptions).toHaveBeenCalled())
    expect(await within(appointmentDialog).findByRole('button', {
      name: 'Crear paciente',
    })).toBeInTheDocument()
  })

  it('[HU-52] keeps quick-create hidden for appointment creators without patients.create', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([])
    searchPatientOptions.mockResolvedValue([])
    renderPage(receptionist)
    await screen.findByText('No hay citas programadas para este día.')

    fireEvent.click(screen.getByRole('button', { name: 'Nueva cita' }))
    const appointmentDialog = screen.getByRole('dialog', { name: 'Nueva cita' })
    fireEvent.change(within(appointmentDialog).getByRole('combobox', { name: 'Paciente' }), {
      target: { value: 'Sin resultado' },
    })

    await waitFor(() => expect(searchPatientOptions).toHaveBeenCalled())
    expect(within(appointmentDialog).queryByRole('button', {
      name: 'Crear paciente',
    })).not.toBeInTheDocument()
  })

  it('[HU-51] consumes follow-up state and opens the normal form with current catalog defaults', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([])
    listClinicServices.mockResolvedValue([{
      id: 4, name: 'Restauración simple', duration_minutes: 45, is_active: true,
    }])

    renderFollowUpPage()

    const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' })
    await waitFor(() => expect(within(dialog).getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('PAC-00001'))
    expect(within(dialog).getByRole('group', { name: 'Paciente seleccionado' })).toHaveTextContent('Ana Pérez')
    expect(within(dialog).getByLabelText('Odontólogo')).toHaveValue('3')
    await waitFor(() => expect(within(dialog).getByLabelText(/Servicio/)).toHaveValue('4'))
    expect(within(dialog).getByLabelText('Duración')).toHaveValue('45')
    expect(within(dialog).getByLabelText('Motivo')).toHaveValue('Restauración de resina')
    expect(within(dialog).getByLabelText('Fecha')).toHaveValue('')
    expect(within(dialog).getByLabelText('Hora')).toHaveValue('')
    expect(searchPatientOptions).not.toHaveBeenCalled()
    expect(appointmentService.getAvailableDentists).not.toHaveBeenCalled()
  })

  it('[HU-51] creates a normal appointment once after the user chooses date and time', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([])
    listClinicServices.mockResolvedValue([{
      id: 4, name: 'Restauración simple', duration_minutes: 45, is_active: true,
    }])
    let releaseCreation
    appointmentService.createAppointment.mockReturnValue(new Promise((resolve) => {
      releaseCreation = resolve
    }))
    renderFollowUpPage()
    const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' })

    fireEvent.change(within(dialog).getByLabelText('Fecha'), { target: { value: datePlus(1) } })
    fireEvent.change(within(dialog).getByLabelText('Hora'), { target: { value: '10:30' } })
    await waitFor(() => expect(appointmentService.getAvailableDentists).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({ date: datePlus(1), startTime: '10:30', durationMinutes: '45' }),
    ))
    await waitFor(() => expect(within(dialog).getByLabelText('Odontólogo')).toHaveValue('3'))

    const submit = within(dialog).getByRole('button', { name: 'Programar cita' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(within(dialog).getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(appointmentService.createAppointment).toHaveBeenCalledTimes(1)
    expect(appointmentService.createAppointment).toHaveBeenCalledWith('access-token', {
      patient: 1,
      dentist: 3,
      service: 4,
      date: datePlus(1),
      start_time: '10:30',
      duration_minutes: 45,
      reason: 'Restauración de resina',
      notes: '',
    })

    releaseCreation(appointment({
      date: datePlus(1),
      start_time: '10:30:00',
      end_time: '11:15:00',
      duration_minutes: 45,
      reason: 'Restauración de resina',
      service: 4,
      service_name: 'Restauración simple',
    }))
    expect(await screen.findByText('Cita programada.')).toBeInTheDocument()
  })

  it('[HU-51] does not preselect an inactive historical service', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([])
    listClinicServices.mockResolvedValue([{
      id: 4, name: 'Restauración simple', duration_minutes: 45, is_active: false,
    }])
    renderFollowUpPage(followUpPrefill({
      treatment: {
        id: 15,
        description: 'Restauración de resina',
        service: { id: 4, name: 'Restauración simple', is_active: false },
      },
    }))

    const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' })
    expect(within(dialog).getByLabelText(/Servicio/)).toHaveValue('')
    expect(within(dialog).getByText('Restauración simple no está disponible para nuevas citas.')).toBeInTheDocument()
  })

  it('preserves the form and explains a scheduling conflict', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([])
    appointmentService.createAppointment.mockRejectedValue(
      new Error('El odontólogo ya tiene una cita en ese horario.'),
    )
    renderPage()
    await screen.findByText('No hay citas programadas para este día.')
    fireEvent.click(screen.getByRole('button', { name: 'Nueva cita' }))
    const dialog = screen.getByRole('dialog', { name: 'Nueva cita' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Paciente' }), {
      target: { value: 'Ana' },
    })
    await waitFor(() => expect(
      within(dialog).getByRole('option', { name: /Ana Pérez.*PAC-00001/ }),
    ).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole('option', { name: /Ana Pérez.*PAC-00001/ }))
    await waitFor(() => expect(within(dialog).getByLabelText('Odontólogo').options.length).toBe(2))
    fireEvent.change(within(dialog).getByLabelText('Odontólogo'), { target: { value: '3' } })
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Control' } })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Programar cita' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El odontólogo ya tiene')
    expect(within(dialog).getByLabelText('Motivo')).toHaveValue('Control')
  })

  it('opens appointment details and confirms a scheduled appointment', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))
    const dialog = screen.getByRole('dialog', { name: 'Detalle de cita' })

    expect(within(dialog).getByText('Sensibilidad dental.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cita' }))

    expect(await screen.findByText('Cita confirmada.')).toBeInTheDocument()
    expect(screen.getAllByText('Confirmada')).toHaveLength(2)
  })

  it('edits appointment details with the same scheduling form', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar cita' })
    await waitFor(() => expect(within(dialog).getByLabelText('Odontólogo').options.length).toBe(2))
    fireEvent.change(within(dialog).getByLabelText('Motivo'), {
      target: { value: 'Control de ortodoncia actualizado' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Cita actualizada.')).toBeInTheDocument()
    expect(screen.getByText('Control de ortodoncia actualizado')).toBeInTheDocument()
  })

  it('cancels an appointment while keeping an optional reason', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }))
    fireEvent.change(screen.getByLabelText(/Motivo de cancelación/), {
      target: { value: 'Paciente reprogramará después.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))

    expect(await screen.findByText('Cita cancelada.')).toBeInTheDocument()
    expect(screen.getAllByText('Cancelada')).toHaveLength(2)
    expect(screen.getByText('Paciente reprogramará después.')).toBeInTheDocument()
  })

  it('[HU-23] lets reception register arrival without offering clinical start', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    expect(screen.getByRole('button', { name: 'Registrar llegada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iniciar atención' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar llegada' }))

    expect(await screen.findByText('Llegada registrada.')).toBeInTheDocument()
    expect(appointmentService.checkInAppointment).toHaveBeenCalledTimes(1)
    expect(appointmentService.checkInAppointment).toHaveBeenCalledWith('access-token', 9)
    expect(screen.getAllByText('Presente')).not.toHaveLength(0)
  })

  it('[HU-23] offers normal attendance start after a checked-in appointment', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([
      appointment({ status: 'PRESENTE', status_display: 'Presente' }),
    ])
    renderPage({
      role: 'ODONTOLOGO',
      permissions: ['appointments.view', 'consultations.create', 'consultations.view'],
    })
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    expect(screen.queryByRole('button', { name: 'Registrar llegada' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar atención' })).toBeInTheDocument()
  })

  it('[HU-58] loads and renders compact reschedule history only for an open detail', async () => {
    appointmentService.listAppointmentReschedules.mockResolvedValue([{
      id: 31,
      previous_date: '2026-08-31',
      previous_start_time: '09:00:00',
      previous_duration_minutes: 60,
      new_date: clinicDate(),
      new_start_time: '10:30:00',
      new_duration_minutes: 45,
      reason: 'Solicitud del paciente',
      changed_by: 2,
      changed_by_name: 'Rosa López',
      created_at: `${clinicDate()}T15:00:00Z`,
    }])
    renderPage()

    expect(appointmentService.listAppointmentReschedules).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    expect(await screen.findByRole('region', { name: 'Historial de reprogramaciones' })).toBeInTheDocument()
    expect(screen.getByText(/31\/08\/2026.*09:00.*60 min/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${clinicDate().split('-').reverse().join('/')}.*10:30.*45 min`))).toBeInTheDocument()
    expect(screen.getByText('Solicitud del paciente')).toBeInTheDocument()
    expect(screen.getByText(/Rosa López/)).toBeInTheDocument()
    expect(appointmentService.listAppointmentReschedules).toHaveBeenCalledWith('access-token', 9)
  })

  it('shows the complete appointment context and opens the patient only with permission', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([appointment({
      service: 5,
      service_name: 'Valoración clínica',
      consultation: 41,
      attendance_started_at: `${clinicDate()}T15:05:00Z`,
      status: 'EN_ATENCION',
      status_display: 'En atención',
    })])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))
    const dialog = screen.getByRole('dialog', { name: 'Detalle de cita' })

    expect(within(dialog).getByText('PAC-00001')).toBeInTheDocument()
    expect(within(dialog).getByText('Valoración clínica')).toBeInTheDocument()
    expect(within(dialog).getByText('Consulta #41')).toBeInTheDocument()
    expect(within(dialog).getByText(/Inicio real/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir expediente' }))
    expect(await screen.findByText('Expediente del paciente')).toBeInTheDocument()
  })

  it('starts attendance once and navigates to the linked consultation', async () => {
    const clinicalUser = {
      role: 'ODONTOLOGO',
      permissions: [
        'appointments.view',
        'patients.view',
        'consultations.create',
        'consultations.view',
      ],
    }
    renderPage(clinicalUser)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))
    const startButton = screen.getByRole('button', { name: 'Iniciar atención' })

    fireEvent.click(startButton)
    fireEvent.click(startButton)

    expect(await screen.findByText('Consulta clínica destino')).toBeInTheDocument()
    expect(appointmentService.startAppointmentAttendance).toHaveBeenCalledTimes(1)
    expect(appointmentService.startAppointmentAttendance).toHaveBeenCalledWith(
      'access-token',
      9,
    )
  })

  it('continues a linked attendance and hides clinical actions without permission', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([appointment({
      consultation: 41,
      attendance_started_at: `${clinicDate()}T15:05:00Z`,
      status: 'EN_ATENCION',
      status_display: 'En atención',
    })])
    const clinicalUser = {
      role: 'ODONTOLOGO',
      permissions: ['appointments.view', 'consultations.view'],
    }
    const { unmount } = renderPage(clinicalUser)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Continuar atención' }))
    expect(await screen.findByText('Consulta clínica destino')).toBeInTheDocument()

    unmount()
    renderPage({ role: 'RECEPCIONISTA', permissions: ['appointments.view'] })
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))
    expect(screen.queryByRole('button', { name: 'Abrir expediente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iniciar atención' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continuar atención' })).not.toBeInTheDocument()
  })

  it('[HU-46] opens a completed linked consultation without attendance actions', async () => {
    appointmentService.listAllAppointments.mockResolvedValue([appointment({
      consultation: 41,
      attendance_started_at: `${clinicDate()}T15:05:00Z`,
      status: 'COMPLETADA',
      status_display: 'Completada',
    })])
    renderPage({
      role: 'ODONTOLOGO',
      permissions: ['appointments.view', 'consultations.view'],
    })
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    expect(screen.queryByRole('button', { name: 'Iniciar atención' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continuar atención' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver consulta' }))

    expect(await screen.findByText('Consulta clínica destino')).toBeInTheDocument()
  })

  it('keeps HU-28 alerts visible after agenda, start, and consultation navigation', async () => {
    const clinicalUser = {
      first_name: 'Elena',
      role: 'ODONTOLOGO',
      permissions: [
        'appointments.view',
        'patients.view',
        'consultations.create',
        'consultations.view',
        'consultations.edit',
      ],
    }
    const consultation = {
      id: 41,
      patient: 1,
      professional: 3,
      professional_name: 'Dra. Elena Vargas',
      date: clinicDate(),
      time: '09:05:00',
      consultation_type: 'GENERAL',
      consultation_type_display: 'Consulta general',
      summary: 'Valoración de ortodoncia',
      status: 'EN_PROGRESO',
      status_display: 'En progreso',
    }
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/')) return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ...patient,
          clinical_record: {
            allergies: 'Penicilina — urticaria',
            current_medications: 'Losartán 50 mg',
            relevant_conditions: '',
            other_clinical_alerts: '',
          },
        }),
      })
      if (url.endsWith('/api/patients/1/consultations/41/')) return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(consultation),
      })
      if (url.endsWith('/api/patients/1/consultations/41/treatment-items/')) return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
      if (url.includes('/api/clinics/services/?active=true')) return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      })
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderClinicalFlow(clinicalUser)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atención' }))

    const banner = await screen.findByRole('region', { name: 'Alertas clínicas' })
    expect(within(banner).getByText('Penicilina — urticaria')).toBeInTheDocument()
    expect(within(banner).getByText('Losartán 50 mg')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Consulta general' })).toBeInTheDocument()
  })

  it('shows loading and a stable backend error without leaving the appointment', async () => {
    const clinicalUser = {
      role: 'ODONTOLOGO',
      permissions: ['appointments.view', 'consultations.create', 'consultations.view'],
    }
    let rejectStart
    appointmentService.startAppointmentAttendance.mockReturnValue(new Promise((resolve, reject) => {
      rejectStart = reject
    }))
    renderPage(clinicalUser)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atención' }))

    expect(screen.getByRole('button', { name: 'Iniciando…' })).toBeDisabled()
    rejectStart(new Error('La cita no está en un estado que permita iniciar la atención.'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La cita no está en un estado que permita iniciar la atención.',
    )
    expect(screen.getByRole('dialog', { name: 'Detalle de cita' })).toBeInTheDocument()
  })

  it('[HU-53] explains an incomplete profile, preserves the appointment, and offers completion with both patient permissions', async () => {
    const clinicalUser = {
      role: 'ODONTOLOGO',
      permissions: [
        'appointments.view',
        'patients.view',
        'patients.edit',
        'consultations.create',
        'consultations.view',
      ],
    }
    const requestError = Object.assign(new Error('Complete el perfil antes de iniciar la atención.'), {
      data: {
        code: 'patient_profile_incomplete',
        detail: 'Complete el perfil antes de iniciar la atención.',
        missing_fields: ['phone', 'guardian_name'],
      },
    })
    appointmentService.startAppointmentAttendance.mockRejectedValue(requestError)
    renderPage(clinicalUser)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atención' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Complete el perfil antes de iniciar la atención.')
    expect(alert).toHaveTextContent('Teléfono')
    expect(alert).toHaveTextContent('Nombre del responsable')
    expect(screen.getByRole('dialog', { name: 'Detalle de cita' })).toBeInTheDocument()
    expect(screen.getAllByText('Programada')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Iniciar atención' })).toBeEnabled()
    expect(screen.queryByText('Consulta clínica destino')).not.toBeInTheDocument()
    expect(appointmentService.listAllAppointments).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Completar perfil' }))
    expect(await screen.findByText('Expediente del paciente')).toBeInTheDocument()
  })

  it('[HU-53] does not offer profile completion without patients.edit', async () => {
    const clinicalUser = {
      role: 'ODONTOLOGO',
      permissions: [
        'appointments.view',
        'patients.view',
        'consultations.create',
        'consultations.view',
      ],
    }
    appointmentService.startAppointmentAttendance.mockRejectedValue(Object.assign(
      new Error('Complete el perfil antes de iniciar la atención.'),
      {
        data: {
          code: 'patient_profile_incomplete',
          detail: 'Complete el perfil antes de iniciar la atención.',
          missing_fields: ['phone'],
        },
      },
    ))
    renderPage(clinicalUser)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar atención' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Teléfono')
    expect(screen.queryByRole('button', { name: 'Completar perfil' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Detalle de cita' })).toBeInTheDocument()
  })

  it.each([
    ['CANCELADA', 'Cancelada'],
    ['NO_ASISTIO', 'No asistió'],
    ['COMPLETADA', 'Completada'],
  ])('does not offer start attendance for %s', async (status, statusDisplay) => {
    appointmentService.listAllAppointments.mockResolvedValue([
      appointment({ status, status_display: statusDisplay }),
    ])
    const clinicalUser = {
      role: 'ODONTOLOGO',
      permissions: ['appointments.view', 'consultations.create', 'consultations.view'],
    }
    renderPage(clinicalUser)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez, 09:00 a 10:00/ }))

    expect(screen.queryByRole('button', { name: 'Iniciar atención' })).not.toBeInTheDocument()
  })
})
