import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../context/authContextValue'
import * as patientService from '../../services/patientService'
import { listClinicServices } from '../../services/clinicService'
import AppointmentDetailsPanel from '../Appointments/AppointmentDetailsPanel'
import ConsultationRecordPage from './ConsultationRecordPage'
import PatientConsultationsPanel from './PatientConsultationsPanel'
import PatientRecordPage from './PatientRecordPage'

vi.mock('../../services/patientService')
vi.mock('../../services/clinicService', () => ({ listClinicServices: vi.fn() }))

const activePatient = {
  id: 1,
  code: 'PAC-00001',
  first_name: 'Ana',
  last_name: 'López',
  second_last_name: '',
  full_name: 'Ana López',
  birth_place: 'Managua',
  phone: '8888-1717',
  email: '',
  gender: 'FEMENINO',
  date_of_birth: '1990-01-01',
  identification_type: null,
  identification_number: null,
  is_active: true,
  profile_complete: true,
  missing_profile_fields: [],
  clinical_record: {},
}

const consultation = {
  id: 12,
  patient: 1,
  professional: 3,
  professional_name: 'Dra. Elena Vargas',
  date: '2026-09-01',
  time: '09:00:00',
  consultation_type: 'GENERAL',
  consultation_type_display: 'Consulta general',
  summary: 'Consulta histórica visible',
  status: 'EN_PROGRESO',
  status_display: 'En progreso',
  completed_at: null,
  completed_by_name: '',
}

const user = {
  email: 'clinico@example.test',
  first_name: 'Elena',
  last_name: 'Vargas',
  role: 'ODONTOLOGO',
  permissions: [
    'patients.view',
    'patients.edit',
    'consultations.view',
    'consultations.create',
    'consultations.edit',
    'appointments.create',
  ],
}

function auth(value = user) {
  return { user: value, accessToken: 'access-token' }
}

function renderDataRoute(path, routePath, element, value = user) {
  const router = createMemoryRouter(
    [{ path: routePath, element: <AuthContext.Provider value={auth(value)}>{element}</AuthContext.Provider> }],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('inactive patient frontend policy', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    patientService.listPatientConsultations.mockResolvedValue({
      count: 1,
      results: [consultation],
    })
    patientService.listPatientTreatmentItems.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    listClinicServices.mockResolvedValue([])
  })

  afterEach(() => cleanup())

  it('keeps historical consultations visible but hides creation for an inactive patient', async () => {
    render(
      <AuthContext.Provider value={auth()}>
        <MemoryRouter>
          <PatientConsultationsPanel
            accessToken="access-token"
            patientId={1}
            patientActive={false}
          />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect((await screen.findAllByText('Consulta histórica visible')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Ver detalle' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pathname: '/pacientes/1/consultas/12' }),
      ]),
    )
    expect(screen.queryByRole('link', { name: 'Nueva consulta' })).not.toBeInTheDocument()
    expect(screen.getByText(/paciente está inactivo/i)).toBeInTheDocument()
  })

  it('allows patients.edit to change the explicit administrative state', async () => {
    patientService.getPatient.mockResolvedValue(activePatient)
    patientService.updatePatient.mockImplementation(async (_token, _id, payload) => ({
      ...activePatient,
      ...payload,
    }))
    renderDataRoute('/pacientes/1', '/pacientes/:id', <PatientRecordPage />)

    const state = await screen.findByRole('combobox', { name: 'Estado administrativo' })
    expect(state).toHaveValue('true')
    fireEvent.change(state, { target: { name: 'is_active', value: 'false' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(patientService.updatePatient).toHaveBeenCalledWith(
        'access-token',
        '1',
        expect.objectContaining({ is_active: false }),
      )
    })
    expect(await screen.findByText('Paciente inactivo')).toBeInTheDocument()
  })

  it('opens an inactive historical consultation without offering a new proposal or follow-up', async () => {
    patientService.getPatient.mockResolvedValue({ ...activePatient, is_active: false })
    patientService.getPatientConsultation.mockResolvedValue(consultation)
    renderDataRoute(
      '/pacientes/1/consultas/12',
      '/pacientes/:patientId/consultas/:consultationId',
      <ConsultationRecordPage />,
    )

    expect(await screen.findByText('Consulta histórica visible')).toBeInTheDocument()
    expect(screen.getByText(/paciente está inactivo/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar tratamiento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Programar próxima cita/i })).not.toBeInTheDocument()
  })

  it('requires an appointment even for a directly opened new consultation', async () => {
    patientService.getPatient.mockResolvedValue({ ...activePatient, is_active: false })
    renderDataRoute(
      '/pacientes/1/consultas/nueva',
      '/pacientes/:patientId/consultas/nueva',
      <ConsultationRecordPage isNew />,
    )

    expect(await screen.findByRole('link', { name: 'Ir a mis citas' })).toHaveAttribute('href', '/citas')
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Resumen')).not.toBeInTheDocument()
  })

  it('shows inactive appointment context and suppresses start attendance', () => {
    render(
      <AppointmentDetailsPanel
        appointment={{
          id: 9,
          patient: 1,
          patient_name: 'Ana López',
          patient_code: 'PAC-00001',
          patient_is_active: false,
          dentist_name: 'Dra. Elena Vargas',
          service_name: '',
          date: '2026-09-02',
          start_time: '09:00:00',
          end_time: '10:00:00',
          duration_minutes: 60,
          reason: 'Control',
          notes: '',
          status: 'PROGRAMADA',
          status_display: 'Programada',
          cancellation_reason: '',
          consultation: null,
          attendance_started_at: null,
        }}
        canEdit={false}
        canViewPatient
        canCompletePatientProfile={false}
        canStartAttendance
        canContinueAttendance={false}
        timeZone="America/Managua"
        onClose={vi.fn()}
        onOpenPatient={vi.fn()}
        onStartAttendance={vi.fn()}
      />,
    )

    expect(screen.getByText('Paciente inactivo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iniciar atención' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir expediente' })).toBeInTheDocument()
  })
})
