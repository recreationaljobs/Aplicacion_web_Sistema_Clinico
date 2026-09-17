import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import * as authService from './services/authService'

vi.mock('./services/authService')

const rolePermissions = {
  ADMINISTRADOR: ['patients.view', 'patients.create', 'patients.edit', 'consultations.view', 'consultations.create', 'consultations.edit', 'appointments.view', 'appointments.create', 'appointments.edit', 'clinic.manage', 'users.manage'],
  RECEPCIONISTA: ['patients.view', 'patients.create', 'patients.edit', 'consultations.view', 'appointments.view', 'appointments.create', 'appointments.edit'],
  ODONTOLOGO: ['patients.view', 'consultations.view', 'consultations.create', 'consultations.edit', 'appointments.view'],
}

const patientFixture = {
  id: 1,
  code: 'PAC-00001',
  first_name: 'María Fernanda',
  last_name: 'García',
  second_last_name: 'López',
  full_name: 'María Fernanda García López',
  birth_place: 'Managua',
  origin: 'Chinandega',
  religion: 'Católica',
  education: 'Universitaria',
  profession: 'Docente',
  address: 'Colonia Roma Norte',
  father_name: 'José García',
  mother_name: 'Ana López',
  information_source: 'Paciente',
  information_reliability: 'Confiable',
  national_id: '001-160498-0001A',
  phone: '+505 8888 1111',
  email: 'maria@example.com',
  emergency_contact_name: 'Carlos García',
  emergency_relationship: 'Hermano',
  emergency_phone: '+505 8888 2222',
  gender: 'FEMENINO',
  date_of_birth: '1998-04-16',
  is_active: true,
  created_at: '2026-08-08T12:00:00Z',
  updated_at: '2026-08-08T12:00:00Z',
  registered_by: 2,
  clinical_record: {
    id: 1, examiner_name: 'Dra. Elena Ruiz', examiner_national_id: '001-010180-0003C',
    allergies: 'Penicilina — urticaria', current_medications: 'Losartán 50 mg',
    relevant_conditions: 'Hipertensión controlada',
    other_clinical_alerts: 'Antecedente de síncope durante procedimientos',
    consultation_date: '2026-08-08',
    consultation_time: '09:30:00', dental_service: 'Valoración odontológica',
    chief_complaint: 'Dolor en molar inferior derecho.', present_illness_history: 'Dolor pulsátil de tres días.',
    respiratory: 'Sin disnea.', cardiovascular: 'Sin dolor precordial.', hepatic_renal: 'Sin alteraciones.',
    gastrointestinal: 'Apetito conservado.', neurological: 'Sin cefalea.', blood_system: 'Sin sangrado.',
    reproductive_organs: 'Sin alteraciones.', family_history: 'Madre con hipertensión arterial.',
    infectious_diseases: { hepatitis: false, varicella: true, other: '' },
    hereditary_diseases: { allergies: false, diabetes_mellitus: true, other: '' },
    heart_rate: 72, respiratory_rate: 16, blood_pressure: '118/76', temperature: '36.6',
    weight: '68.40', height: '1.65', body_surface_area: '1.76', bmi: '25.12',
    general_appearance: 'Consciente y orientada.', skin_and_mucosa: 'Normocoloreadas.',
    dental_diagnoses: 'Pulpitis irreversible en pieza 46.',
    treatment_plan: 'Tratamiento endodóntico y corona.', budget: 'C$ 10,500.',
    radiographic_exams: ['periapical-46.pdf'],
    clinical_photographs: ['pieza-46-frontal.jpg'], created_at: '2026-08-08T12:00:00Z', updated_at: '2026-08-08T12:00:00Z',
  },
}

const consultationFixture = {
  id: 12,
  date: '2026-08-08',
  consultation_type: 'SEGUIMIENTO',
  consultation_type_display: 'Seguimiento',
  professional: 3,
  professional_name: 'Dra. Elena Rivera',
  professional_specialty: 'Endodoncia',
  professional_registration_number: 'REG-2048',
  professional_phone: '+505 8888 4321',
  summary: 'Paciente estable. Continúa con el tratamiento indicado.',
  status: 'COMPLETADA',
  status_display: 'Completada',
  patient: 1,
  time: '09:30:00',
  examiner_national_id: '001-010180-0003C',
  dental_service: 'Valoración odontológica',
  chief_complaint: 'Dolor en molar inferior derecho.',
  respiratory: true,
  cardiovascular: true,
  hepatic_renal: false,
  gastrointestinal: false,
  neurological: false,
  blood_system: false,
  reproductive_organs: false,
  heart_rate: 72,
  respiratory_rate: 16,
  blood_pressure: '118/76',
  temperature: '36.6',
  weight: '68.40',
  height: '1.65',
  body_surface_area: '1.76',
  bmi: '25.12',
  general_appearance: 'Consciente y orientada.',
  skin_and_mucosa: '',
  dental_diagnoses: 'Pulpitis irreversible.',
  treatment_plan: 'Tratamiento endodóntico.',
  budget: 'C$ 4,500.',
  completed_at: '2026-08-08T16:45:00Z',
  completed_by: 3,
  completed_by_name: 'Dra. Elena Rivera',
  created_at: '2026-08-08T12:00:00Z',
  updated_at: '2026-08-08T12:00:00Z',
}

const inProgressConsultationFixture = {
  ...consultationFixture,
  status: 'EN_PROGRESO',
  status_display: 'En progreso',
  completed_at: null,
  completed_by: null,
  completed_by_name: '',
}

const session = (role) => ({
  access: 'access-token',
  refresh: 'refresh-token',
  user: {
    email: `${role.toLowerCase()}@test.com`,
    first_name: 'Usuario',
    role,
    permissions: rolePermissions[role],
  },
})

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
})

function BackControl() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>Atrás</button>
}

function renderAuthenticated(
  role,
  withBackControl = false,
  path = '/bienvenida',
  permissions = rolePermissions[role],
  treatmentItems = [],
) {
  const configuredFetch = globalThis.fetch
  if (vi.isMockFunction(configuredFetch)) {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (
        /\/api\/patients\/\d+\/treatment-items\/\?/.test(url)
        && (!options.method || options.method === 'GET')
      ) {
        const scope = new URL(url, 'http://localhost').searchParams.get('scope')
        const scopedItems = treatmentItems.filter(({ status }) => scope === 'history'
          ? ['REALIZADO', 'CANCELADO'].includes(status)
          : ['PROPUESTO', 'ACEPTADO'].includes(status))
        return Promise.resolve(jsonResponse({
          count: scopedItems.length,
          next: null,
          previous: null,
          results: scopedItems,
        }))
      }
      if (
        url.includes('/treatment-items/')
        && (!options.method || options.method === 'GET')
      ) return Promise.resolve(jsonResponse(treatmentItems))
      if (
        url.includes('/api/clinics/services/?active=true')
        && (!options.method || options.method === 'GET')
      ) return Promise.resolve(jsonResponse([]))
      return configuredFetch(url, options)
    }))
  }
  const initialSession = session(role)
  initialSession.user.permissions = permissions
  authService.getCurrentSessionUser.mockResolvedValue(initialSession.user)
  const router = createMemoryRouter([{
    path: '*',
    element:
      <AuthProvider initialSession={initialSession}>
        {withBackControl ? <BackControl /> : null}
        <App />
      </AuthProvider>,
  }], { initialEntries: ['/login', path], initialIndex: 1 })
  return { ...render(<RouterProvider router={router} />), router }
}

describe('authenticated routes', () => {
  it('records an addendum without making the completed consultation editable', async () => {
    const amendment = { id: 1, content: 'Clinical clarification', reason: 'Transcription correction', author_name: 'Elena', created_at: '2026-09-16T15:00:00Z' }
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.includes('/amendments/')) return Promise.resolve(jsonResponse(options.method === 'POST' ? amendment : { results: [], count: 0, next: null }))
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(consultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      return Promise.resolve(jsonResponse([]))
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')
    fireEvent.change(await screen.findByLabelText('Motivo de la adenda'), { target: { value: amendment.reason } })
    fireEvent.change(screen.getByLabelText('Contenido de la adenda'), { target: { value: amendment.content } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar adenda' }))
    expect(await screen.findByText(amendment.content)).toBeInTheDocument()
    expect(screen.queryByLabelText('Resumen')).not.toBeInTheDocument()
  })
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    authService.getCurrentSessionUser.mockReset()
    authService.logout.mockReset()
    authService.logout.mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it.each([
    ['ADMINISTRADOR', ['Dashboard', 'Pacientes', 'Citas', 'Configuración']],
    ['RECEPCIONISTA', ['Dashboard', 'Pacientes', 'Citas']],
    ['ODONTOLOGO', ['Dashboard', 'Pacientes', 'Citas']],
  ])('shows only the effective navigation for %s', (role, expectedLinks) => {
    renderAuthenticated(role)

    const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }))
    const links = navigation.getAllByRole('link')
    expect(links.map((link) => link.textContent.trim())).toEqual(expectedLinks)
    if (role === 'ADMINISTRADOR') {
      expect(navigation.getByRole('link', { name: 'Configuración' })).toHaveAttribute(
        'href',
        '/configuracion',
      )
    } else {
      expect(navigation.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument()
    }
    expect(navigation.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Clínicas' })).not.toBeInTheDocument()
  })

  it('hides modules independently when their effective view capability is absent', () => {
    renderAuthenticated('RECEPCIONISTA', false, '/bienvenida', ['appointments.view'])

    const navigation = within(screen.getByRole('navigation', { name: 'Navegación principal' }))
    expect(navigation.queryByRole('link', { name: 'Pacientes' })).not.toBeInTheDocument()
    expect(navigation.getByRole('link', { name: 'Citas' })).toBeInTheDocument()
    expect(navigation.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument()
  })

  it('protects a patient URL when the effective permission is absent', () => {
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes', ['appointments.view'])

    expect(screen.getByRole('heading', { name: 'Bienvenido, Dr. Usuario' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pacientes' })).not.toBeInTheDocument()
  })

  it('[HU-43] removes and restores patient access after effective permissions change', async () => {
    const revokedUser = {
      ...session('RECEPCIONISTA').user,
      permissions: ['appointments.view'],
    }
    const restoredUser = {
      ...revokedUser,
      permissions: ['patients.view', 'appointments.view'],
    }
    authService.getCurrentSessionUser
      .mockResolvedValueOnce(revokedUser)
      .mockResolvedValueOnce(restoredUser)
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/')) return Promise.resolve(jsonResponse([]))
      throw new Error(`Unexpected request: ${url}`)
    }))

    renderAuthenticated('RECEPCIONISTA', false, '/pacientes')
    expect(await screen.findByRole('heading', { name: 'Pacientes' })).toBeInTheDocument()

    fireEvent.focus(window)

    expect(await screen.findByRole('heading', { name: 'Bienvenido, Dr. Usuario' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pacientes' })).not.toBeInTheDocument()

    fireEvent.focus(window)

    expect(await screen.findByRole('link', { name: 'Pacientes' })).toBeInTheDocument()
  })

  it('clears the session and protects history after logout', async () => {
    renderAuthenticated('ADMINISTRADOR', true)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de Usuario' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Bienvenido' })).toBeInTheDocument()
    expect(localStorage.getItem('dentalclinic_session')).toBeNull()
    expect(sessionStorage.getItem('dentalclinic_session')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Bienvenido' })).toBeInTheDocument())
    expect(screen.queryByText('Panel principal')).not.toBeInTheDocument()
  })

  it('prevents a receptionist from opening an administrator route directly', () => {
    renderAuthenticated('RECEPCIONISTA', false, '/usuarios')

    expect(screen.getByRole('heading', { name: 'Bienvenido, Dr. Usuario' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument()
  })

  it('prevents a receptionist from opening staff configuration directly', () => {
    renderAuthenticated('RECEPCIONISTA', false, '/configuracion')

    expect(screen.getByRole('heading', { name: 'Bienvenido, Dr. Usuario' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Configuración' })).not.toBeInTheDocument()
  })

  it('offers profile, password change and logout actions from the avatar menu', () => {
    renderAuthenticated('ODONTOLOGO')

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de Usuario' }))

    expect(screen.getByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute('href', '/mi-perfil')
    expect(screen.getByRole('menuitem', { name: 'Cambiar contraseña' })).toHaveAttribute(
      'href',
      '/cambiar-contrasena',
    )
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: 'Mi perfil' })).not.toBeInTheDocument()
  })

  it.each([
    ['/usuarios', 'staff'],
    ['/clinicas', 'perfil'],
  ])('redirects the legacy administrator route %s to functional configuration', async (path, section) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    const { router } = renderAuthenticated('ADMINISTRADOR', false, path)

    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/configuracion')
    expect(router.state.location.search).toBe(`?seccion=${section}`)
  })

  it('does not render inactive notification or global-search controls', () => {
    renderAuthenticated('ODONTOLOGO')

    expect(screen.queryByRole('button', { name: 'Notificaciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Buscar pacientes o citas' })).not.toBeInTheDocument()
  })

  it.each(['ADMINISTRADOR', 'RECEPCIONISTA', 'ODONTOLOGO'])(
    'allows %s to open the personal profile route',
    async (role) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
        ...session(role).user,
        id: 4,
        last_name: 'Clínica',
        phone: '',
        avatar_url: '',
      })))

      renderAuthenticated(role, false, '/mi-perfil')

      expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument()
      expect(screen.getByDisplayValue(`${role.toLowerCase()}@test.com`)).toBeInTheDocument()
    },
  )

  it('uses the clinic logo in the main navigation and opens on the dashboard', () => {
    renderAuthenticated('ODONTOLOGO')

    expect(screen.getByRole('img', { name: 'Dental Clinic' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/bienvenida')
    expect(screen.getByRole('heading', { name: 'Bienvenido, Dr. Usuario' })).toBeInTheDocument()
  })

  it('[HU-10] registers a patient and opens the new clinical record', async () => {
    let submittedPatient = null
    const fetchMock = vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/duplicate-check/') && options.method === 'POST') {
        return Promise.resolve(jsonResponse({ has_matches: false, matches: [] }))
      }
      if (url.endsWith('/api/patients/') && options.method === 'POST') {
        submittedPatient = JSON.parse(options.body)
        return Promise.resolve(jsonResponse(patientFixture, 201))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      if (url.endsWith('/api/patients/')) return Promise.resolve(jsonResponse([]))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes')

    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo paciente' }))
    expect(screen.getByRole('heading', { name: 'Nuevo paciente' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Resumen clínico')).toBeInTheDocument()
    expect(screen.getByText('Consultas')).toBeInTheDocument()
    expect(screen.getByText('Odontograma')).toBeInTheDocument()
    expect(screen.getByText('Documentos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datos personales' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Antecedentes familiares patológicos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Datos generales de la consulta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Interrogatorio por aparatos y sistemas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Examen físico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Archivos clínicos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descartar cambios' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'María Fernanda' } })
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descartar cambios' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Primer apellido'), { target: { value: 'García' } })
    fireEvent.change(screen.getByLabelText('Segundo apellido'), { target: { value: 'López' } })
    fireEvent.change(screen.getByLabelText('Lugar de nacimiento'), { target: { value: 'Managua' } })
    fireEvent.change(screen.getByLabelText('Tipo de identificación'), { target: { value: 'CEDULA' } })
    fireEvent.change(screen.getByLabelText('Número de identificación'), { target: { value: '2810904031006k' } })
    expect(screen.getByLabelText('Número de identificación')).toHaveValue('281-090403-1006K')
    fireEvent.change(screen.getByLabelText('Género'), { target: { value: 'FEMENINO' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '1998-04-16' } })
    fireEvent.change(screen.getByLabelText('Antecedentes familiares'), { target: { value: 'Madre con hipertensión arterial.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('heading', { name: 'María Fernanda García López' })).toBeInTheDocument()
    expect(screen.getByText('PAC-00001')).toBeInTheDocument()
    expect(submittedPatient.clinical_record.family_history).toBe('Madre con hipertensión arterial.')
    expect(Object.keys(submittedPatient.clinical_record).sort()).toEqual([
      'allergies',
      'clinical_photographs',
      'current_medications',
      'family_history',
      'hereditary_diseases',
      'infectious_diseases',
      'other_clinical_alerts',
      'present_illness_history',
      'radiographic_exams',
      'relevant_conditions',
    ])
  })

  it('[HU-53] registers a patient without identification and does not submit the legacy field', async () => {
    let submittedPatient = null
    const patientWithoutIdentification = {
      ...patientFixture,
      identification_type: null,
      identification_number: null,
      profile_complete: true,
      missing_profile_fields: [],
    }
    delete patientWithoutIdentification.national_id
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/duplicate-check/') && options.method === 'POST') {
        return Promise.resolve(jsonResponse({ has_matches: false, matches: [] }))
      }
      if (url.endsWith('/api/patients/') && options.method === 'POST') {
        submittedPatient = JSON.parse(options.body)
        return Promise.resolve(jsonResponse(patientWithoutIdentification, 201))
      }
      if (url.endsWith('/api/patients/1/')) {
        return Promise.resolve(jsonResponse(patientWithoutIdentification))
      }
      if (url.endsWith('/api/patients/')) return Promise.resolve(jsonResponse([]))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/nuevo')

    expect(screen.getByLabelText('Número de identificación')).not.toBeRequired()
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Adriana' } })
    fireEvent.change(screen.getByLabelText('Primer apellido'), { target: { value: 'López' } })
    fireEvent.change(screen.getByLabelText('Lugar de nacimiento'), { target: { value: 'Masaya' } })
    fireEvent.change(screen.getByLabelText('Género'), { target: { value: 'FEMENINO' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '1990-05-20' } })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-9090' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(submittedPatient).not.toBeNull())
    expect(submittedPatient).toHaveProperty('identification_type')
    expect(submittedPatient).toHaveProperty('identification_number')
    expect(submittedPatient.identification_type || null).toBeNull()
    expect(submittedPatient.identification_number || null).toBeNull()
    expect(submittedPatient).not.toHaveProperty('national_id')
  })

  it('[HU-53] captures flexible identification and highlights guardian data for a minor', async () => {
    let submittedPatient = null
    const minorPatient = {
      ...patientFixture,
      first_name: 'Lucía',
      full_name: 'Lucía García',
      date_of_birth: '2015-06-10',
      identification_type: 'PASAPORTE',
      identification_number: 'PA-000071',
      guardian_name: 'Marta García',
      guardian_relationship: 'Madre',
      guardian_phone: '8777-1234',
      profile_complete: true,
      missing_profile_fields: [],
    }
    delete minorPatient.national_id
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/duplicate-check/') && options.method === 'POST') {
        return Promise.resolve(jsonResponse({ has_matches: false, matches: [] }))
      }
      if (url.endsWith('/api/patients/') && options.method === 'POST') {
        submittedPatient = JSON.parse(options.body)
        return Promise.resolve(jsonResponse(minorPatient, 201))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(minorPatient))
      if (url.endsWith('/api/patients/')) return Promise.resolve(jsonResponse([]))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/nuevo')

    expect(screen.getByRole('option', { name: 'Cédula' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Pasaporte' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Otro' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Lucía' } })
    fireEvent.change(screen.getByLabelText('Primer apellido'), { target: { value: 'García' } })
    fireEvent.change(screen.getByLabelText('Lugar de nacimiento'), { target: { value: 'Managua' } })
    fireEvent.change(screen.getByLabelText('Género'), { target: { value: 'FEMENINO' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '2015-06-10' } })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8666-4321' } })
    fireEvent.change(screen.getByLabelText('Tipo de identificación'), {
      target: { value: 'PASAPORTE' },
    })
    fireEvent.change(screen.getByLabelText('Número de identificación'), {
      target: { value: 'PA-000071' },
    })

    const guardianSection = screen.getByRole('region', { name: 'Responsable / Tutor' })
    expect(within(guardianSection).getByText('Perfil administrativo incompleto')).toBeInTheDocument()
    fireEvent.change(within(guardianSection).getByLabelText('Nombre del responsable'), {
      target: { value: 'Marta García' },
    })
    fireEvent.change(within(guardianSection).getByLabelText('Parentesco del responsable'), {
      target: { value: 'Madre' },
    })
    fireEvent.change(within(guardianSection).getByLabelText('Teléfono del responsable'), {
      target: { value: '8777-1234' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(submittedPatient).not.toBeNull())
    expect(submittedPatient).toMatchObject({
      identification_type: 'PASAPORTE',
      identification_number: 'PA-000071',
      guardian_name: 'Marta García',
      guardian_relationship: 'Madre',
      guardian_phone: '8777-1234',
    })
    expect(submittedPatient).not.toHaveProperty('national_id')
  })

  it('[HU-28] shows longitudinal clinical alerts prominently in the patient record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(patientFixture)))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1')

    const banner = await screen.findByRole('region', { name: 'Alertas clínicas' })
    expect(within(banner).getByText('Penicilina — urticaria')).toBeInTheDocument()
    expect(within(banner).getByText('Losartán 50 mg')).toBeInTheDocument()
    expect(within(banner).getByText('Hipertensión controlada')).toBeInTheDocument()
    expect(within(banner).getByText('Antecedente de síncope durante procedimientos')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Alergias' })).not.toBeInTheDocument()
  })

  it('[HU-28] does not duplicate the legacy allergy flag beside the migrated alert', async () => {
    const migratedPatient = {
      ...patientFixture,
      clinical_record: {
        ...patientFixture.clinical_record,
        allergies: 'Alergia registrada previamente; completar detalle',
        hereditary_diseases: {
          ...patientFixture.clinical_record.hereditary_diseases,
          allergies: true,
        },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(migratedPatient)))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1')

    expect(await screen.findByText('Información pendiente de completar')).toBeInTheDocument()
    expect(screen.queryByText('allergies')).not.toBeInTheDocument()
    expect(screen.getAllByText('Alergia registrada previamente; completar detalle')).toHaveLength(1)
  })

  it('[HU-28] edits and persists every clinical alert from the patient record', async () => {
    let submittedChanges = null
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/') && options.method === 'PATCH') {
        submittedChanges = JSON.parse(options.body)
        return Promise.resolve(jsonResponse({
          ...patientFixture,
          ...submittedChanges,
          clinical_record: submittedChanges.clinical_record,
        }))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/1')

    fireEvent.change(await screen.findByLabelText('Alergias'), { target: { value: 'Látex — dermatitis' } })
    fireEvent.change(screen.getByLabelText('Medicamentos actuales'), { target: { value: 'Metformina 850 mg' } })
    fireEvent.change(screen.getByLabelText('Condiciones médicas relevantes'), { target: { value: 'Diabetes tipo 2 controlada' } })
    fireEvent.change(screen.getByLabelText('Otras alertas clínicas'), { target: { value: 'Citas matutinas' } })
    fireEvent.change(screen.getByLabelText('Motivo del cambio clínico'), { target: { value: 'Información aclarada por el paciente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(submittedChanges).not.toBeNull())
    expect(submittedChanges.clinical_record.allergies).toBe('Látex — dermatitis')
    expect(submittedChanges.clinical_record.current_medications).toBe('Metformina 850 mg')
    expect(submittedChanges.clinical_record.relevant_conditions).toBe('Diabetes tipo 2 controlada')
    expect(submittedChanges.clinical_record.other_clinical_alerts).toBe('Citas matutinas')
  })

  it('[HU-28] keeps clinical alerts behind patient-record permission', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/1', ['appointments.view'])

    expect(screen.getByRole('heading', { name: 'Bienvenido, Dr. Usuario' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Alertas clínicas' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/patients/'))).toBe(false)
  })

  it('[HU-10] keeps consultation-specific fields out of the clinical summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(patientFixture)))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1')

    expect(await screen.findByRole('heading', { name: 'María Fernanda García López' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datos personales' })).toBeInTheDocument()
    expect(screen.getByText('Docente')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Antecedentes familiares patológicos' })).toBeInTheDocument()
    expect(screen.getByText('Varicela')).toBeInTheDocument()
    expect(screen.getByText('Diabetes mellitus')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Historia de la enfermedad actual' })).toBeInTheDocument()
    expect(screen.getByText(patientFixture.clinical_record.present_illness_history)).toBeInTheDocument()
    for (const heading of [
      'Datos generales de la consulta',
      'Motivo de consulta',
      'Interrogatorio por aparatos y sistemas',
      'Examen físico',
      'Observaciones y análisis',
      'Diagnósticos o problemas odontológicos',
      'Plan de tratamiento odontológico',
      'Presupuesto',
      'Tratamiento realizado',
    ]) {
      expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument()
    }
  })

  it('[HU-10] reserves clinical files for the Documents tab', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(patientFixture)))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1')

    expect(await screen.findByRole('heading', { name: 'María Fernanda García López' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Archivos clínicos' })).not.toBeInTheDocument()
    expect(screen.queryByText('periapical-46.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('pieza-46-frontal.jpg')).not.toBeInTheDocument()
  })

  it('shows the persisted consultations for the current patient', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/')) {
        return Promise.resolve(jsonResponse([consultationFixture]))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1')

    fireEvent.click(await screen.findByRole('tab', { name: 'Consultas' }))

    expect(await screen.findByRole('heading', { name: 'Consultas del paciente' })).toBeInTheDocument()
    const row = await screen.findByRole('row', { name: /08 ago 2026 Seguimiento Dra\. Elena Rivera/ })
    expect(within(row).getByText('Paciente estable. Continúa con el tratamiento indicado.')).toBeInTheDocument()
    expect(within(row).getByText('Completada')).toBeInTheDocument()
  })

  it('[HU-61] shows current professional context in the consultation header', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) {
        return Promise.resolve(jsonResponse(consultationFixture))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))

    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    expect(await screen.findByText('Dra. Elena Rivera')).toBeInTheDocument()
    expect(screen.getByText('Endodoncia')).toBeInTheDocument()
    expect(screen.getByText('REG-2048')).toBeInTheDocument()
    expect(screen.getByText('Código MINSA')).toBeInTheDocument()
    expect(screen.getByText('+505 8888 4321')).toBeInTheDocument()
  })

  it('shows guidance when the patient does not have consultations', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/')) return Promise.resolve(jsonResponse([]))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1')

    fireEvent.click(await screen.findByRole('tab', { name: 'Consultas' }))

    expect(await screen.findByText('Este paciente todavía no tiene consultas registradas.')).toBeInTheDocument()
  })

  it('shows the API error when consultations cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/')) {
        return Promise.resolve(jsonResponse({ detail: 'No fue posible cargar las consultas.' }, 500))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1')

    fireEvent.click(await screen.findByRole('tab', { name: 'Consultas' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cargar las consultas.')
  })

  it('shows consultation actions according to the configured capabilities', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/')) return Promise.resolve(jsonResponse([consultationFixture]))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas')

    expect(await screen.findByRole('link', { name: 'Nueva consulta' })).toHaveAttribute(
      'href',
      '/pacientes/1/consultas/nueva',
    )
    expect((await screen.findAllByRole('link', { name: 'Ver detalle' }))[0]).toHaveAttribute(
      'href',
      '/pacientes/1/consultas/12',
    )

    cleanup()
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/1/consultas')
    expect((await screen.findAllByRole('link', { name: 'Ver detalle' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Nueva consulta' })).not.toBeInTheDocument()
  })

  it('opens a new consultation with defaults and every clinical section', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/')) return Promise.resolve(jsonResponse([]))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/nueva')

    expect(await screen.findByRole('heading', { name: 'Nueva consulta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).not.toHaveValue('')
    expect(screen.getByLabelText('Hora')).not.toHaveValue('')
    expect(screen.getByLabelText('Estado')).toHaveValue('EN_PROGRESO')
    expect(screen.getByLabelText('Profesional')).toHaveValue('Usuario')
    ;[
      'N.º de cédula del doctor', 'Servicio odontológico',
      'Tipo', 'Resumen', 'Motivo de consulta',
      'Respiratorio', 'Cardiovascular', 'Hepático y renal', 'Gastrointestinal',
      'Neurológico', 'Sistema sanguíneo', 'Órganos reproductivos', 'Frecuencia cardíaca',
      'Frecuencia respiratoria', 'Presión arterial', 'Temperatura', 'Peso', 'Talla',
      'Área de superficie corporal', 'IMC', 'Aspecto general', 'Piel y mucosas',
      'Diagnóstico / problemas odontológicos',
      'Plan de tratamiento', 'Presupuesto / descripción',
    ].forEach((label) => expect(screen.getByLabelText(label)).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Historia de la enfermedad actual' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Historia de la enfermedad actual')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Observaciones y análisis' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Observaciones y análisis')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tratamiento realizado' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tratamiento realizado')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('N.º INSS')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('N.º CEMA')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Especialidad')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Código MINSA')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Teléfono del profesional')).toHaveAttribute('readonly')
    ;[
      'Tórax', 'Caja torácica', 'Mamas', 'Campos pulmonares', 'Cardíaco',
      'Abdomen y pelvis', 'Tacto rectal, cuando aplique', 'Musculoesquelético',
      'Extremidades superiores', 'Extremidades inferiores', 'Genitourinario, cuando aplique',
      'Examen ginecológico', 'Examen neurológico',
    ].forEach((label) => expect(screen.queryByRole('textbox', { name: label })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Borrador' } })
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    expect(await screen.findByRole('heading', { name: 'Consultas del paciente' })).toBeInTheDocument()
  })

  it('saves and reloads systems review as individual checkboxes', async () => {
    let savedConsultation = { ...inProgressConsultationFixture, respiratory: false, cardiovascular: false }
    const fetchMock = vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) {
        if (options.method === 'PATCH') {
          savedConsultation = { ...savedConsultation, ...JSON.parse(options.body) }
        }
        return Promise.resolve(jsonResponse(savedConsultation))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    const respiratory = await screen.findByRole('checkbox', { name: 'Respiratorio' })
    expect(respiratory).not.toBeChecked()
    ;[
      'Cardiovascular', 'Hepático y renal', 'Gastrointestinal',
      'Neurológico', 'Sistema sanguíneo', 'Órganos reproductivos',
    ].forEach((name) => expect(screen.getByRole('checkbox', { name })).not.toBeChecked())
    fireEvent.click(respiratory)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cardiovascular' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cardiovascular' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument())

    const systemValues = Object.fromEntries([
      'respiratory', 'cardiovascular', 'hepatic_renal', 'gastrointestinal',
      'neurological', 'blood_system', 'reproductive_organs',
    ].map((field) => [field, savedConsultation[field]]))
    expect(systemValues).toEqual({
      respiratory: true, cardiovascular: false, hepatic_renal: false,
      gastrointestinal: false, neurological: false, blood_system: false,
      reproductive_organs: false,
    })

    cleanup()
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')
    expect(await screen.findByRole('checkbox', { name: 'Respiratorio' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Cardiovascular' })).not.toBeChecked()
  })

  it('shows completed systems checkboxes as disabled', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(consultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    const respiratory = await screen.findByRole('checkbox', { name: 'Respiratorio' })
    expect(respiratory).toBeChecked()
    expect(respiratory).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Neurológico' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Neurológico' })).toBeDisabled()
  })

  it('[HU-28] shows patient alerts in a consultation without copying them into it', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(consultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    const banner = await screen.findByRole('region', { name: 'Alertas clínicas' })
    expect(within(banner).getByText('Penicilina — urticaria')).toBeInTheDocument()
    expect(within(banner).getByText('Losartán 50 mg')).toBeInTheDocument()
    expect(consultationFixture).not.toHaveProperty('allergies')
    expect(consultationFixture).not.toHaveProperty('current_medications')
  })

  it('[HU-47] integrates the structured treatment plan into an editable consultation', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(inProgressConsultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    expect(await screen.findByRole('heading', { name: 'Plan de tratamiento' })).toBeInTheDocument()
    expect(screen.getByText('No hay tratamientos pendientes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar tratamiento' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aceptar|Realizar|Cancelar/ })).not.toBeInTheDocument()
  })

  it('[HU-48] accepts a proposal from a completed origin without reopening it', async () => {
    const proposed = {
      id: 9,
      proposed_in: 12,
      service: null,
      description: 'Profilaxis clínica',
      diagnosis_text: '',
      tooth_code: null,
      surfaces: [],
      planned_finding: '',
      status: 'PROPUESTO',
      status_display: 'Propuesto',
      unit_price_snapshot: null,
      notes: '',
      performed_in: null,
      performed_at: null,
      status_reason: '',
    }
    let accepted = false
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(consultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      if (url.endsWith('/treatment-items/9/accept/') && options.method === 'POST') {
        accepted = true
        return Promise.resolve(jsonResponse({
          ...proposed,
          status: 'ACEPTADO',
          status_display: 'Aceptado',
        }))
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated(
      'ODONTOLOGO',
      false,
      '/pacientes/1/consultas/12',
      rolePermissions.ODONTOLOGO,
      [proposed],
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar Profilaxis clínica' }))

    await waitFor(() => expect(accepted).toBe(true))
    const updatedTreatment = await screen.findByRole('article', { name: 'Profilaxis clínica' })
    expect(within(updatedTreatment).getByText('Aceptado')).toBeInTheDocument()
    expect(screen.getAllByText('Completada')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Agregar tratamiento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Realizar Profilaxis clínica' })).not.toBeInTheDocument()
  })

  it('[HU-49] shows the longitudinal plan in the patient record as read-only groups', async () => {
    const items = [
      {
        id: 31,
        proposed_in: { id: 8, date: '2026-07-10' },
        performed_in: null,
        performed_at: null,
        description: 'Corona definitiva',
        diagnosis_text: 'Fractura coronaria',
        tooth_code: '11',
        surfaces: [],
        planned_finding: 'CROWN',
        status: 'ACEPTADO',
        status_display: 'Aceptado',
        unit_price_snapshot: '4200.00',
        notes: '',
        status_reason: '',
      },
      {
        id: 19,
        proposed_in: { id: 4, date: '2026-05-12' },
        performed_in: { id: 6, date: '2026-06-01' },
        performed_at: '2026-06-01T15:00:00Z',
        description: 'Profilaxis',
        diagnosis_text: '',
        tooth_code: null,
        surfaces: [],
        planned_finding: '',
        status: 'REALIZADO',
        status_display: 'Realizado',
        unit_price_snapshot: '700.00',
        notes: '',
        status_reason: '',
      },
    ]
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1', rolePermissions.ODONTOLOGO, items)

    const pendingGroup = await screen.findByRole('region', { name: 'Tratamientos pendientes' })
    const historyGroup = screen.getByRole('region', { name: 'Historial de tratamientos' })
    expect(within(pendingGroup).getByText('Corona definitiva')).toBeInTheDocument()
    expect(within(pendingGroup).getByText(/Consulta #8/)).toBeInTheDocument()
    expect(within(historyGroup).getByText('Profilaxis')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aceptar|Realizar|Cancelar Corona/ })).not.toBeInTheDocument()
  })

  it('[HU-49] acts on an earlier proposal from the active consultation without duplicating it', async () => {
    const activeConsultation = { ...inProgressConsultationFixture, id: 18, date: '2026-08-31' }
    const proposed = {
      id: 44,
      proposed_in: { id: 12, date: '2026-08-08' },
      performed_in: null,
      performed_at: null,
      description: 'Restauración pendiente previa',
      diagnosis_text: 'Caries',
      tooth_code: '16',
      surfaces: ['OCCLUSAL'],
      planned_finding: 'RESTORATION',
      status: 'PROPUESTO',
      status_display: 'Propuesto',
      unit_price_snapshot: '850.00',
      notes: '',
      status_reason: '',
    }
    let actionUrl = ''
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/consultations/18/')) return Promise.resolve(jsonResponse(activeConsultation))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      if (url.endsWith('/consultations/12/treatment-items/44/accept/') && options.method === 'POST') {
        actionUrl = url
        return Promise.resolve(jsonResponse({ ...proposed, status: 'ACEPTADO', status_display: 'Aceptado' }))
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/18', rolePermissions.ODONTOLOGO, [proposed, proposed])

    expect((await screen.findAllByText('Restauración pendiente previa'))).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar Restauración pendiente previa' }))

    await waitFor(() => expect(actionUrl).toContain('/consultations/12/treatment-items/44/accept/'))
    expect(await screen.findByText('Aceptado')).toBeInTheDocument()
  })

  it('creates a consultation with the cloud and opens its detail', async () => {
    let submittedConsultation = null
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/consultations/') && options.method === 'POST') {
        submittedConsultation = JSON.parse(options.body)
        return Promise.resolve(jsonResponse({ ...consultationFixture, ...submittedConsultation, consultation_type_display: 'Consulta general' }, 201))
      }
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse({ ...consultationFixture, ...submittedConsultation, consultation_type_display: 'Consulta general' }))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/nueva')

    fireEvent.change(await screen.findByLabelText('Tipo'), { target: { value: 'GENERAL' } })
    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Nueva valoración clínica.' } })
    fireEvent.change(screen.getByLabelText('Motivo de consulta'), { target: { value: 'Dolor dental.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(submittedConsultation).not.toBeNull())
    expect(submittedConsultation.status).toBe('EN_PROGRESO')
    expect(submittedConsultation.chief_complaint).toBe('Dolor dental.')
    expect(submittedConsultation).not.toHaveProperty('present_illness_history')
    expect(submittedConsultation).not.toHaveProperty('observations_analysis')
    expect(submittedConsultation).not.toHaveProperty('treatment_performed')
    expect(submittedConsultation).not.toHaveProperty('inss_number')
    expect(submittedConsultation).not.toHaveProperty('cema_number')
    expect(submittedConsultation).not.toHaveProperty('professional_phone')
    ;[
      'thorax', 'rib_cage', 'breasts', 'lung_fields', 'cardiac', 'abdomen_pelvis',
      'rectal_exam', 'musculoskeletal', 'upper_extremities', 'lower_extremities',
      'genitourinary', 'gynecological_exam', 'neurological_exam',
    ].forEach((field) => expect(submittedConsultation).not.toHaveProperty(field))
    expect(await screen.findByRole('heading', { name: 'Consulta general' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('edits and discards an in-progress consultation inline', async () => {
    let patchPayload = null
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/consultations/12/') && options.method === 'PATCH') {
        patchPayload = JSON.parse(options.body)
        return Promise.resolve(jsonResponse({ ...inProgressConsultationFixture, ...patchPayload }))
      }
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(inProgressConsultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    expect(await screen.findByLabelText('Resumen')).toHaveValue(inProgressConsultationFixture.summary)
    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Cambio descartado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    expect(screen.getByLabelText('Resumen')).toHaveValue(inProgressConsultationFixture.summary)
    expect(patchPayload).toBeNull()

    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Control actualizado.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument())
    expect(patchPayload.summary).toBe('Control actualizado.')
    expect(screen.getByLabelText('Resumen')).toHaveValue('Control actualizado.')
  })

  it('[HU-46] completes once after confirmation and switches the record to read-only', async () => {
    let releaseCompletion
    const completion = new Promise((resolve) => { releaseCompletion = resolve })
    const fetchMock = vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/consultations/12/complete/') && options.method === 'POST') {
        return completion
      }
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(inProgressConsultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    fireEvent.click(await screen.findByRole('button', { name: 'Completar consulta' }))
    expect(screen.getByRole('dialog', { name: 'Completar consulta' })).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Confirmar cierre' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(screen.getByRole('button', { name: 'Completando consulta' })).toBeDisabled()
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/complete/'))).toHaveLength(1)

    releaseCompletion(jsonResponse({ consultation: consultationFixture, appointment: null }))
    expect(await screen.findByText('Cerrada el 8 ago 2026')).toBeInTheDocument()
    expect(screen.getByText('Cerrada por Dra. Elena Rivera')).toBeInTheDocument()
    expect(screen.getByText(consultationFixture.summary)).toBeInTheDocument()
    expect(screen.queryByLabelText('Resumen')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Completar consulta' })).not.toBeInTheDocument()
  })

  it('[HU-51] offers optional follow-up after a completed manual consultation', async () => {
    const pending = {
      id: 15,
      description: 'Restauración de resina',
      diagnosis_text: 'No debe viajar a agenda',
      notes: 'Contexto clínico privado',
      tooth_code: '16',
      surfaces: ['OCCLUSAL'],
      status: 'ACEPTADO',
      status_display: 'Aceptado',
      service: {
        id: 8,
        name: 'Restauración simple',
        category_name: 'Restauraciones',
        duration_minutes: 45,
        is_active: true,
      },
    }
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(consultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated(
      'ODONTOLOGO',
      false,
      '/pacientes/1/consultas/12',
      [...rolePermissions.ODONTOLOGO, 'appointments.create'],
      [pending],
    )

    const followUp = await screen.findByRole('region', { name: 'Seguimiento de la atención' })
    expect(within(followUp).getByText('Restauración de resina')).toBeInTheDocument()
    expect(within(followUp).getByRole('button', { name: 'Programar próxima cita' })).toBeInTheDocument()
  })

  it('[HU-51] keeps the post-close CTA behind appointment creation permission', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(consultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    const followUp = await screen.findByRole('region', { name: 'Seguimiento de la atención' })
    expect(within(followUp).getByText('No hay tratamientos pendientes.')).toBeInTheDocument()
    expect(within(followUp).queryByRole('button', { name: 'Programar próxima cita' })).not.toBeInTheDocument()
  })

  it.each([
    ['EN_PROGRESO', inProgressConsultationFixture],
    ['CANCELADA', { ...consultationFixture, status: 'CANCELADA', status_display: 'Cancelada' }],
  ])('[HU-51] does not show post-close follow-up for %s', async (_status, consultation) => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(consultation))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated(
      'ODONTOLOGO',
      false,
      '/pacientes/1/consultas/12',
      [...rolePermissions.ODONTOLOGO, 'appointments.create'],
    )

    expect(await screen.findByText(consultation.summary)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Seguimiento de la atención' })).not.toBeInTheDocument()
  })

  it.each([
    [403, 'No tienes permiso para completar esta consulta.'],
    [409, 'La consulta no contiene todos los datos obligatorios.'],
  ])('[HU-46] preserves editing and shows completion error %s', async (status, detail) => {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/consultations/12/complete/') && options.method === 'POST') {
        return Promise.resolve(jsonResponse({ detail }, status))
      }
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(inProgressConsultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    fireEvent.click(await screen.findByRole('button', { name: 'Completar consulta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(screen.getByLabelText('Resumen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Completar consulta' })).toBeInTheDocument()
  })

  it('keeps consultation values read-only without edit capability', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(consultationFixture))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/1/consultas/12')

    expect(await screen.findByText(consultationFixture.summary)).toBeInTheDocument()
    expect(screen.queryByLabelText('Resumen')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('preserves a consultation draft after an API error and blocks navigation', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/consultations/12/') && options.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ detail: 'No fue posible guardar la consulta.' }, 400))
      }
      if (url.endsWith('/api/patients/1/consultations/12/')) return Promise.resolve(jsonResponse(inProgressConsultationFixture))
      if (url.endsWith('/api/patients/1/consultations/')) return Promise.resolve(jsonResponse([inProgressConsultationFixture]))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1/consultas/12')

    fireEvent.change(await screen.findByLabelText('Resumen'), { target: { value: 'Borrador pendiente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible guardar la consulta.')
    expect(screen.getByLabelText('Resumen')).toHaveValue('Borrador pendiente')

    fireEvent.click(screen.getByRole('link', { name: /Volver a consultas/ }))
    expect(await screen.findByRole('dialog', { name: 'Cambios sin guardar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(screen.getByLabelText('Resumen')).toHaveValue('Borrador pendiente')
  })

  it('[HU-10] edits patient information from the clinical record when permitted', async () => {
    let currentPatient = patientFixture
    let submittedChanges = null
    const fetchMock = vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/') && options.method === 'PATCH') {
        submittedChanges = JSON.parse(options.body)
        currentPatient = { ...currentPatient, ...submittedChanges, clinical_record: submittedChanges.clinical_record, updated_at: '2026-08-08T13:00:00Z' }
        return Promise.resolve(jsonResponse(currentPatient))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(currentPatient))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/1')

    expect(await screen.findByLabelText('Nombres')).toHaveValue('María Fernanda')
    expect(screen.queryByRole('button', { name: 'Editar expediente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'María Fernanda García López' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Mariana' } })
    expect(screen.getByRole('heading', { name: 'Mariana García López' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Dirección habitual'), { target: { value: 'Cambio descartado' } })
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))

    expect(screen.getByLabelText('Nombres')).toHaveValue('María Fernanda')
    expect(screen.getByLabelText('Dirección habitual')).toHaveValue('Colonia Roma Norte')
    expect(submittedChanges).toBeNull()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Dirección habitual'), { target: { value: 'Residencial Las Colinas' } })
    fireEvent.change(screen.getByLabelText('Teléfono de emergencia'), { target: { value: '+505 7777 3333' } })
    fireEvent.change(screen.getByLabelText('Historia de la enfermedad actual'), { target: { value: 'Dolor intermitente de una semana.' } })
    fireEvent.change(screen.getByLabelText('Motivo del cambio clínico'), { target: { value: 'Actualización de antecedentes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Dirección habitual')).toHaveValue('Residencial Las Colinas')
    expect(screen.getByLabelText('Teléfono de emergencia')).toHaveValue('+505 7777 3333')
    expect(screen.getByLabelText('Historia de la enfermedad actual')).toHaveValue('Dolor intermitente de una semana.')
    expect(submittedChanges.clinical_record.present_illness_history).toBe('Dolor intermitente de una semana.')
    expect(submittedChanges.clinical_record).not.toHaveProperty('chief_complaint')
    expect(submittedChanges.clinical_record).not.toHaveProperty('blood_pressure')

    cleanup()
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/1')
    expect(await screen.findByLabelText('Historia de la enfermedad actual')).toHaveValue('Dolor intermitente de una semana.')
  })

  it('[HU-10] keeps the patient record read-only without the configured permission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(patientFixture)))
    renderAuthenticated('ODONTOLOGO', false, '/pacientes/1')

    expect(await screen.findByRole('heading', { name: 'María Fernanda García López' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
    expect(screen.getByText('María Fernanda')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('[HU-10] discards a dirty new patient without creating it', async () => {
    let postCount = 0
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/') && options.method === 'POST') postCount += 1
      if (url.endsWith('/api/patients/')) return Promise.resolve(jsonResponse([]))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/nuevo')

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Paciente descartado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))

    expect(await screen.findByRole('heading', { name: 'Pacientes' })).toBeInTheDocument()
    expect(postCount).toBe(0)
  })

  it('[HU-10] preserves the dirty draft when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/') && options.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ detail: 'No fue posible guardar los cambios.' }, 400))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/1')

    fireEvent.change(await screen.findByLabelText('Dirección habitual'), { target: { value: 'Borrador conservado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible guardar los cambios.')
    expect(screen.getByLabelText('Dirección habitual')).toHaveValue('Borrador conservado')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('[HU-13] shows the duplicate identification error without losing the new patient draft', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/duplicate-check/') && options.method === 'POST') {
        return Promise.resolve(jsonResponse({ has_matches: false, matches: [] }))
      }
      if (url.endsWith('/api/patients/') && options.method === 'POST') {
        return Promise.resolve(jsonResponse({
          identification_number: ['Ya existe un paciente con este tipo y número de identificación.'],
        }, 400))
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    const { router } = renderAuthenticated('RECEPCIONISTA', false, '/pacientes/nuevo')

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'María Fernanda' } })
    fireEvent.change(screen.getByLabelText('Primer apellido'), { target: { value: 'García' } })
    fireEvent.change(screen.getByLabelText('Lugar de nacimiento'), { target: { value: 'Managua' } })
    fireEvent.change(screen.getByLabelText('Tipo de identificación'), { target: { value: 'CEDULA' } })
    fireEvent.change(screen.getByLabelText('Número de identificación'), { target: { value: '0011604980001a' } })
    fireEvent.change(screen.getByLabelText('Género'), { target: { value: 'FEMENINO' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '1998-04-16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un paciente con este tipo y número de identificación.')
    expect(screen.getByLabelText('Número de identificación')).toHaveValue('001-160498-0001A')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pacientes/nuevo')
  })

  it('[HU-10] warns before leaving a dirty patient record', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patientFixture))
      if (url.endsWith('/api/patients/')) return Promise.resolve(jsonResponse([]))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAuthenticated('RECEPCIONISTA', false, '/pacientes/1')

    fireEvent.change(await screen.findByLabelText('Dirección habitual'), { target: { value: 'Cambio pendiente' } })
    const unloadEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unloadEvent)
    expect(unloadEvent.defaultPrevented).toBe(true)

    fireEvent.click(screen.getByRole('link', { name: /Volver a pacientes/ }))
    expect(await screen.findByRole('dialog', { name: 'Cambios sin guardar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(screen.getByLabelText('Dirección habitual')).toHaveValue('Cambio pendiente')

    fireEvent.click(screen.getByRole('link', { name: /Volver a pacientes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar y salir' }))
    expect(await screen.findByRole('heading', { name: 'Pacientes' })).toBeInTheDocument()
  })
})
