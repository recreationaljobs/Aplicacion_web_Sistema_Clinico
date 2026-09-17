import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../context/authContextValue'
import * as userService from '../../services/userService'
import * as clinicService from '../../services/clinicService'
import SettingsPage from './SettingsPage'

vi.mock('../../services/userService', () => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  getUserAvatarContent: vi.fn(),
  listRolePermissionPresets: vi.fn(),
  listUsers: vi.fn(),
  updateRolePermissionPreset: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('../../services/clinicService', () => ({
  createClinicService: vi.fn(), createClosure: vi.fn(), createServiceCategory: vi.fn(),
  getBusinessHours: vi.fn(), getClinicOptions: vi.fn(), listClinicServices: vi.fn(),
  listClosures: vi.fn(), listServiceCategories: vi.fn(), updateBusinessHours: vi.fn(),
  updateClinicProfile: vi.fn(), updateClinicService: vi.fn(), updateClosure: vi.fn(),
  updateServiceCategory: vi.fn(),
}))

const renderPage = (permissions = ['clinic.manage', 'users.manage']) => render(
  <MemoryRouter>
    <AuthContext.Provider value={{
      accessToken: 'access-token',
      user: { id: 1, role: 'ADMINISTRADOR', permissions },
    }}>
      <SettingsPage />
    </AuthContext.Provider>
  </MemoryRouter>,
)

const fillForm = () => {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Lucía' } })
  fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Méndez' } })
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'nuevo@dentalclinic.com' } })
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'ODONTOLOGO' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ContraseñaSegura123!' } })
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'ContraseñaSegura123!' } })
}

const openStaff = () => {
  fireEvent.click(screen.getByRole('button', { name: /Gestión de Staff/ }))
}

describe('SettingsPage staff management', () => {
  beforeEach(() => {
    clinicService.getClinicOptions.mockResolvedValue({
      currencies: [{ value: 'NIO', label: 'Córdoba' }],
      timezones: ['America/Managua'],
    })
    clinicService.getBusinessHours.mockResolvedValue({ days: Array.from({ length: 7 }, (_, weekday) => ({ weekday, is_open: false, opens_at: null, closes_at: null, breaks: [] })) })
    clinicService.listClosures.mockResolvedValue([])
    clinicService.listServiceCategories.mockResolvedValue([])
    clinicService.listClinicServices.mockResolvedValue([])
    clinicService.updateClinicProfile.mockResolvedValue({ name: 'Clínica Argüello', phone: '', email: '', address: '', logo_url: '', currency: 'NIO', timezone: 'America/Managua' })
    userService.listUsers.mockResolvedValue([])
    userService.createUser.mockResolvedValue({
      id: 2,
      email: 'nuevo@dentalclinic.com',
      first_name: 'Lucía',
      last_name: 'Méndez',
      phone: '',
      role: 'ODONTOLOGO',
      is_active: true,
    })
    userService.updateUser.mockResolvedValue({
      id: 7,
      email: 'elena.editada@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Vargas',
      phone: '',
      role: 'ODONTOLOGO',
      is_active: true,
    })
    userService.deleteUser.mockResolvedValue({})
    userService.listRolePermissionPresets.mockResolvedValue({
      available_permissions: [
        { code: 'patients.view', label: 'Ver pacientes', group: 'Pacientes' },
        { code: 'patients.create', label: 'Registrar pacientes', group: 'Pacientes' },
        { code: 'patients.edit', label: 'Editar pacientes', group: 'Pacientes' },
        { code: 'consultations.view', label: 'Ver consultas', group: 'Consultas' },
        { code: 'consultations.view_all', label: 'Ver consultas de todo el equipo', group: 'Consultas' },
        { code: 'appointments.view', label: 'Ver citas', group: 'Citas' },
        { code: 'appointments.view_all', label: 'Ver citas de todo el equipo', group: 'Citas' },
        { code: 'appointments.create', label: 'Crear citas', group: 'Citas' },
        { code: 'appointments.edit', label: 'Editar citas', group: 'Citas' },
      ],
      presets: [
        { role: 'RECEPCIONISTA', permissions: ['patients.view', 'patients.create', 'patients.edit', 'appointments.view', 'appointments.view_all', 'appointments.create', 'appointments.edit'] },
        { role: 'ODONTOLOGO', permissions: ['patients.view', 'appointments.view'] },
      ],
    })
    userService.updateRolePermissionPreset.mockResolvedValue({
      role: 'ODONTOLOGO',
      permissions: ['patients.view', 'patients.create', 'appointments.view'],
    })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens with the clinic profile selected', async () => {
    renderPage()

    expect(screen.getByRole('button', { name: /Perfil de la clínica/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /Gestión de Staff/ })).not.toHaveAttribute('aria-current')
    expect(await screen.findByRole('heading', { name: 'Perfil de la clínica' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Subtítulo')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gestión de Staff' })).not.toBeInTheDocument()
  })

  it('saves the clinic profile without a tagline field', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Perfil de la clínica' })
    fireEvent.change(screen.getByLabelText('Nombre de la clínica'), { target: { value: 'Clínica Argüello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Perfil de la clínica actualizado.')
    const [, payload] = clinicService.updateClinicProfile.mock.calls.at(-1)
    expect(payload.get('name')).toBe('Clínica Argüello')
    expect(payload.has('tagline')).toBe(false)
  })

  it('opens staff in Activos and shows its specific empty state', async () => {
    renderPage()
    openStaff()

    expect(await screen.findByText('No hay usuarios activos.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activos' })).toHaveAttribute('aria-selected', 'true')
    expect(userService.listUsers).toHaveBeenCalledWith('access-token', {
      status: 'active',
      search: '',
    })
    expect(screen.getByRole('button', { name: 'Añadir miembro' })).toBeInTheDocument()
  })

  it('shows only configuration sections allowed by effective capabilities', async () => {
    renderPage(['clinic.manage'])

    expect(screen.getByRole('button', { name: /Perfil de la clínica/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Horarios de atención/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Servicios y tarifas/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Gestión de Staff/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Permisos por rol/ })).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Perfil de la clínica' })
    expect(userService.listUsers).not.toHaveBeenCalled()
  })

  it('opens staff as the first allowed section for a user-management capability', async () => {
    renderPage(['users.manage'])

    expect(screen.queryByRole('button', { name: /Perfil de la clínica/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gestión de Staff/ })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('No hay usuarios activos.')).toBeInTheDocument()
  })

  it('does not expose notifications while that feature is outside the MVP', () => {
    renderPage()

    expect(screen.queryByRole('button', { name: /Notificaciones/ })).not.toBeInTheDocument()
  })

  it('loads the next bounded staff page', async () => {
    userService.listUsers
      .mockResolvedValueOnce({
        count: 26,
        next: '/api/auth/users/?page=2',
        previous: null,
        results: [{
          id: 2,
          email: 'ana@dentalclinic.com',
          first_name: 'Ana',
          last_name: 'Pérez',
          role: 'ODONTOLOGO',
          is_active: true,
        }],
      })
      .mockResolvedValueOnce({
        count: 26,
        next: null,
        previous: '/api/auth/users/',
        results: [{
          id: 3,
          email: 'bruno@dentalclinic.com',
          first_name: 'Bruno',
          last_name: 'López',
          role: 'RECEPCIONISTA',
          is_active: true,
        }],
      })
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Página siguiente de Personal' }))

    expect(await screen.findByText('Bruno López')).toBeInTheDocument()
    expect(userService.listUsers).toHaveBeenLastCalledWith('access-token', {
      page: 2,
      status: 'active',
      search: '',
    })
  })

  it('switches from active users to archived users using backend filtering', async () => {
    userService.listUsers.mockImplementation((_access, options) => Promise.resolve(
      options.status === 'archived'
        ? [{
            id: 3,
            email: 'paul@dentalclinic.com',
            first_name: 'Paul',
            last_name: 'Walker',
            role: 'ODONTOLOGO',
            is_active: false,
          }]
        : [{
            id: 2,
            email: 'ana@dentalclinic.com',
            first_name: 'Ana',
            last_name: 'Pérez',
            role: 'ODONTOLOGO',
            is_active: true,
          }],
    ))
    renderPage()
    openStaff()

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.queryByText('Paul Walker')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Archivados' }))

    expect(await screen.findByText('Paul Walker')).toBeInTheDocument()
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
    expect(screen.getByText('Archivado')).toBeInTheDocument()
    expect(userService.listUsers).toHaveBeenLastCalledWith('access-token', {
      status: 'archived',
      search: '',
    })
  })

  it('keeps the active filter when searching staff', async () => {
    renderPage()
    openStaff()
    await screen.findByText('No hay usuarios activos.')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar personal' }), {
      target: { value: 'Elena' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => expect(userService.listUsers).toHaveBeenLastCalledWith(
      'access-token',
      { status: 'active', search: 'Elena' },
    ))
  })

  it('closes the staff dialog with Escape and restores focus to its opener', async () => {
    renderPage()
    openStaff()
    const opener = await screen.findByRole('button', { name: 'Añadir miembro' })
    opener.focus()
    fireEvent.click(opener)

    expect(screen.getByRole('dialog', { name: 'Añadir miembro' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Añadir miembro' })).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('opens operational panels only when selected and saves the clinic profile', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Perfil de la clínica' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nombre de la clínica'), { target: { value: 'Clínica Argüello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(clinicService.updateClinicProfile).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /Horarios de atención/ }))
    expect(await screen.findByRole('heading', { name: 'Horarios de atención' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Servicios y tarifas/ }))
    expect(await screen.findByRole('heading', { name: 'Servicios y tarifas' })).toBeInTheDocument()
    expect(screen.getByText('Aún no hay categorías.')).toBeInTheDocument()
  })

  it('[HU-09] shows each filtered user with role and status', async () => {
    userService.listUsers.mockImplementation((_access, options) => Promise.resolve(
      options.status === 'archived' ? [{
        id: 3,
        email: 'bruno@dentalclinic.com',
        first_name: 'Bruno',
        last_name: 'López',
        role: 'RECEPCIONISTA',
        is_active: false,
      }] : [{
        id: 2,
        email: 'ana@dentalclinic.com',
        first_name: 'Ana',
        last_name: 'Pérez',
        role: 'ODONTOLOGO',
        is_active: true,
      }],
    ))
    renderPage()
    openStaff()

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Odontólogo')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Archivados' }))
    expect(await screen.findByText('Bruno López')).toBeInTheDocument()
    expect(screen.getByText('Recepcionista')).toBeInTheDocument()
    expect(screen.getByText('Archivado')).toBeInTheDocument()
  })

  it('[HU-09] lets an administrator update the permissions preset for a role', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Permisos por rol/ }))
    expect(await screen.findByRole('heading', { name: 'Permisos por rol' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recepcionista' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Editar pacientes')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Odontólogo' }))
    expect(screen.getByLabelText('Registrar pacientes')).not.toBeChecked()
    expect(screen.getByLabelText('Editar pacientes')).not.toBeChecked()

    fireEvent.click(screen.getByLabelText('Registrar pacientes'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }))

    await waitFor(() => expect(userService.updateRolePermissionPreset).toHaveBeenCalledWith(
      'access-token',
      'ODONTOLOGO',
      ['patients.view', 'patients.create', 'appointments.view'],
    ))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Permisos de Odontólogo actualizados.',
    )
  })

  it('removes team appointment visibility when base appointment access is disabled', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Permisos por rol/ }))
    expect(await screen.findByLabelText('Ver citas de todo el equipo')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Ver citas'))

    expect(screen.getByLabelText('Ver citas')).not.toBeChecked()
    expect(screen.getByLabelText('Ver citas de todo el equipo')).not.toBeChecked()
  })

  it('[HU-11] shows the protected profile photo in the staff list', async () => {
    const avatarBlob = new Blob(['avatar'], { type: 'image/png' })
    userService.getUserAvatarContent.mockResolvedValue(avatarBlob)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:staff-avatar'),
      revokeObjectURL: vi.fn(),
    })
    userService.listUsers.mockResolvedValue([{
      id: 8,
      email: 'sara@dentalclinic.com',
      first_name: 'Sara',
      last_name: 'López',
      phone: '+505 8555 4444',
      avatar_url: '/api/auth/users/8/avatar/',
      role: 'RECEPCIONISTA',
      is_active: true,
    }])
    renderPage()
    openStaff()

    expect(await screen.findByRole('img', { name: 'Foto de Sara López' })).toHaveAttribute(
      'src',
      'blob:staff-avatar',
    )
  })

  it('keeps team consultation visibility dependent on base consultation access', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Permisos por rol/ }))
    expect(await screen.findByLabelText('Ver consultas de todo el equipo')).not.toBeChecked()

    fireEvent.click(screen.getByLabelText('Ver consultas de todo el equipo'))
    expect(screen.getByLabelText('Ver consultas')).toBeChecked()
    expect(screen.getByLabelText('Ver consultas de todo el equipo')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Ver consultas'))
    expect(screen.getByLabelText('Ver consultas')).not.toBeChecked()
    expect(screen.getByLabelText('Ver consultas de todo el equipo')).not.toBeChecked()
  })

  it('registers a member and adds it to the staff list', async () => {
    renderPage()
    openStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir miembro' }))
    fillForm()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar usuario' }))

    expect(await screen.findByText('Lucía Méndez')).toBeInTheDocument()
    expect(screen.getByText('nuevo@dentalclinic.com')).toBeInTheDocument()
    expect(userService.createUser).toHaveBeenCalledWith('access-token', {
      email: 'nuevo@dentalclinic.com',
      first_name: 'Lucía',
      last_name: 'Méndez',
      phone: '',
      role: 'ODONTOLOGO',
      password: 'ContraseñaSegura123!',
      confirm_password: 'ContraseñaSegura123!',
    })
  })

  it('[HU-11] lets an administrator create a member with phone and photo', async () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:new-staff-avatar'),
      revokeObjectURL: vi.fn(),
    })
    renderPage()
    openStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir miembro' }))
    fillForm()
    const avatar = new File(['avatar'], 'sara.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+505 8555 4444' } })
    fireEvent.change(screen.getByLabelText('Foto de perfil'), { target: { files: [avatar] } })

    expect(screen.getByRole('img', { name: 'Vista previa de la foto del miembro' })).toHaveAttribute(
      'src',
      'blob:new-staff-avatar',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Guardar usuario' }))

    await waitFor(() => expect(userService.createUser).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({ phone: '+505 8555 4444', avatar }),
    ))
  })

  it('[HU-11] lets an administrator remove a staff profile photo', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      phone: '+505 8111 2222',
      avatar_url: '/api/auth/users/7/avatar/',
      role: 'RECEPCIONISTA',
      is_active: true,
    }])
    userService.getUserAvatarContent.mockRejectedValue(new Error('imagen no disponible'))
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar a Elena Méndez' }))
    expect(screen.getByDisplayValue('+505 8111 2222')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(userService.updateUser).toHaveBeenCalledWith(
      'access-token',
      7,
      expect.objectContaining({ remove_avatar: true }),
    ))
  })

  it('shows the duplicate warning returned by the API', async () => {
    userService.createUser.mockRejectedValue(
      new Error('Ya existe un usuario con este correo electrónico.'),
    )
    renderPage()
    openStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir miembro' }))
    fillForm()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar usuario' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un usuario con este correo electrónico.',
    )
    await waitFor(() => expect(userService.createUser).toHaveBeenCalledTimes(1))
  })

  it('[HU-06/HU-08] edits information and role without sending a password', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      role: 'RECEPCIONISTA',
      is_active: true,
    }])
    userService.updateUser.mockResolvedValue({
      id: 7,
      email: 'elena.editada@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Vargas',
      phone: '',
      role: 'ODONTOLOGO',
      is_active: true,
    })
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar a Elena Méndez' }))
    expect(screen.getByRole('dialog', { name: 'Editar miembro' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Vargas' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'elena.editada@dentalclinic.com' } })
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'ODONTOLOGO' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('elena.editada@dentalclinic.com')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(userService.updateUser).toHaveBeenCalledWith('access-token', 7, {
      email: 'elena.editada@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Vargas',
      phone: '',
      role: 'ODONTOLOGO',
    })
  })

  it('[HU-61] captures optional dentist credentials and preserves them across role changes', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      phone: '',
      role: 'ODONTOLOGO',
      specialty: 'Endodoncia',
      professional_registration_number: 'REG-2048',
      is_active: true,
    }])
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar a Elena Méndez' }))
    expect(screen.getByLabelText('Especialidad')).toHaveValue('Endodoncia')
    expect(screen.getByLabelText('Código MINSA')).toHaveValue('REG-2048')

    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'RECEPCIONISTA' } })
    expect(screen.queryByLabelText('Especialidad')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Código MINSA')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(userService.updateUser).toHaveBeenCalledWith(
      'access-token',
      7,
      expect.objectContaining({
        role: 'RECEPCIONISTA',
        specialty: 'Endodoncia',
        professional_registration_number: 'REG-2048',
      }),
    ))
  })

  it('[HU-61] lets an administrator clear optional dentist credentials', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      phone: '',
      role: 'ODONTOLOGO',
      specialty: 'Endodoncia',
      professional_registration_number: 'REG-2048',
      is_active: true,
    }])
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar a Elena Méndez' }))
    fireEvent.change(screen.getByLabelText('Especialidad'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Código MINSA'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(userService.updateUser).toHaveBeenCalledWith(
      'access-token',
      7,
      expect.objectContaining({
        specialty: '',
        professional_registration_number: '',
      }),
    ))
  })

  it('[HU-61] shows blank optional professional fields for a new dentist', async () => {
    renderPage()
    openStaff()
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir miembro' }))

    expect(screen.getByLabelText('Especialidad')).toHaveValue('')
    expect(screen.getByLabelText('Código MINSA')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Especialidad'), {
      target: { value: 'Odontopediatría' },
    })
    fireEvent.change(screen.getByLabelText('Código MINSA'), {
      target: { value: 'MINSA 7788' },
    })
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar usuario' }))

    await waitFor(() => expect(userService.createUser).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({
        specialty: 'Odontopediatría',
        professional_registration_number: 'MINSA 7788',
      }),
    ))
  })

  it('[HU-06] lets an administrator assign a new staff password', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      phone: '',
      role: 'RECEPCIONISTA',
      is_active: true,
    }])
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar a Elena Méndez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    expect(screen.getByText(/cerrarán las sesiones activas/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'NuevaClaveSegura456!' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), {
      target: { value: 'NuevaClaveSegura456!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(userService.updateUser).toHaveBeenCalledWith(
      'access-token',
      7,
      {
        email: 'elena@dentalclinic.com',
        first_name: 'Elena',
        last_name: 'Méndez',
        phone: '',
        role: 'RECEPCIONISTA',
        new_password: 'NuevaClaveSegura456!',
        confirm_password: 'NuevaClaveSegura456!',
      },
    ))
  })

  it('[HU-06] rejects mismatched staff passwords before calling the API', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      phone: '',
      role: 'RECEPCIONISTA',
      is_active: true,
    }])
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar a Elena Méndez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'NuevaClaveSegura456!' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), {
      target: { value: 'OtraClaveSegura789!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Las contraseñas no coinciden.')
    expect(userService.updateUser).not.toHaveBeenCalled()
  })

  it('archives a member only after explicit confirmation and removes it from Activos', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      phone: '',
      role: 'RECEPCIONISTA',
      is_active: true,
    }])
    userService.updateUser.mockResolvedValue({
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      phone: '',
      role: 'RECEPCIONISTA',
      is_active: false,
    })
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Archivar a Elena Méndez' }))
    expect(screen.getByRole('dialog', { name: 'Archivar usuario' })).toBeInTheDocument()
    expect(screen.getByText(/dejará de poder iniciar sesión/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar a Elena Méndez' })).not.toBeInTheDocument()
    expect(userService.updateUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar archivo' }))

    await waitFor(() => expect(userService.updateUser).toHaveBeenCalledWith(
      'access-token',
      7,
      { is_active: false },
    ))
    expect(screen.queryByText('Elena Méndez')).not.toBeInTheDocument()
    expect(await screen.findByText('No hay usuarios activos.')).toBeInTheDocument()
  })

  it('reactivates an archived user without creating a replacement', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      role: 'RECEPCIONISTA',
      is_active: false,
    }])
    userService.updateUser.mockResolvedValue({
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      role: 'RECEPCIONISTA',
      is_active: true,
    })
    renderPage()
    openStaff()
    fireEvent.click(screen.getByRole('tab', { name: 'Archivados' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Reactivar a Elena Méndez' }))

    await waitFor(() => expect(userService.updateUser).toHaveBeenCalledWith(
      'access-token',
      7,
      { is_active: true },
    ))
    expect(userService.createUser).not.toHaveBeenCalled()
    expect(screen.queryByText('Elena Méndez')).not.toBeInTheDocument()
    expect(await screen.findByText('No hay usuarios archivados.')).toBeInTheDocument()
  })

  it('does not offer to archive or delete the authenticated administrator', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 1,
      email: 'admin@dentalclinic.com',
      first_name: 'Ada',
      last_name: 'Admin',
      role: 'ADMINISTRADOR',
      is_active: true,
    }])
    renderPage()
    openStaff()

    expect(await screen.findByText('Ada Admin')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archivar a Ada Admin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar a Ada Admin' })).not.toBeInTheDocument()
  })

  it('keeps the archive confirmation open and shows backend errors', async () => {
    userService.listUsers.mockResolvedValue([{
      id: 7,
      email: 'elena@dentalclinic.com',
      first_name: 'Elena',
      last_name: 'Méndez',
      role: 'RECEPCIONISTA',
      is_active: true,
    }])
    userService.updateUser.mockRejectedValue(new Error('No fue posible archivar el usuario.'))
    renderPage()
    openStaff()

    fireEvent.click(await screen.findByRole('button', { name: 'Archivar a Elena Méndez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar archivo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible archivar')
    expect(screen.getByRole('dialog', { name: 'Archivar usuario' })).toBeInTheDocument()
    expect(screen.getAllByText('Elena Méndez')).toHaveLength(2)
  })
})
