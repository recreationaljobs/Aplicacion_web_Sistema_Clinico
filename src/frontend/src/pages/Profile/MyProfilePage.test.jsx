import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../context/authContextValue'
import * as userService from '../../services/userService'
import MyProfilePage from './MyProfilePage'

vi.mock('../../services/userService', () => ({
  getCurrentUser: vi.fn(),
  getUserAvatarContent: vi.fn(),
  updateCurrentProfile: vi.fn(),
}))

const profile = {
  id: 4,
  email: 'elena@dentalclinic.com',
  first_name: 'Elena',
  last_name: 'Vargas',
  phone: '+505 8888 1111',
  specialty: 'Endodoncia',
  professional_registration_number: 'REG-2048',
  role: 'ODONTOLOGO',
  permissions: ['patients.view'],
  avatar_url: '',
}

const updateUser = vi.fn()
const renderPage = () => render(
  <MemoryRouter>
    <AuthContext.Provider value={{
      accessToken: 'access-token',
      user: profile,
      updateUser,
    }}>
      <MyProfilePage />
    </AuthContext.Provider>
  </MemoryRouter>,
)

describe('MyProfilePage', () => {
  beforeEach(() => {
    userService.getCurrentUser.mockResolvedValue(profile)
    userService.updateCurrentProfile.mockResolvedValue(profile)
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the authenticated identity and asks for a password only after changing email', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Elena')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Vargas')).toBeInTheDocument()
    expect(screen.getByText('Odontólogo')).toBeInTheDocument()
    expect(screen.getByText('Endodoncia')).toBeInTheDocument()
    expect(screen.getByText('REG-2048')).toBeInTheDocument()
    expect(screen.getByLabelText('Especialidad')).toHaveValue('Endodoncia')
    expect(screen.getByLabelText('Código MINSA')).toHaveValue('REG-2048')
    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'elena.nueva@dentalclinic.com' },
    })

    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument()
  })

  it('saves changed data and synchronizes the authenticated session', async () => {
    const saved = { ...profile, first_name: 'Elena María', specialty: 'Implantología', professional_registration_number: '9669', email: 'nueva@dentalclinic.com' }
    userService.updateCurrentProfile.mockResolvedValue(saved)
    renderPage()
    await screen.findByDisplayValue('Elena')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Elena María' } })
    fireEvent.change(screen.getByLabelText('Especialidad'), { target: { value: saved.specialty } })
    fireEvent.change(screen.getByLabelText('Código MINSA'), { target: { value: saved.professional_registration_number } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: saved.email } })
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'ContraseñaPerfil123!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(userService.updateCurrentProfile).toHaveBeenCalledWith(
      'access-token',
      {
        first_name: 'Elena María',
        last_name: 'Vargas',
        phone: '+505 8888 1111',
        specialty: 'Implantología',
        professional_registration_number: '9669',
        email: 'nueva@dentalclinic.com',
        current_password: 'ContraseñaPerfil123!',
      },
    ))
    expect(updateUser).toHaveBeenCalledWith(saved)
    expect(await screen.findByRole('status')).toHaveTextContent('Perfil actualizado correctamente.')
  })

  it('previews and submits a replacement photo', async () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
    renderPage()
    await screen.findByDisplayValue('Elena')
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('Seleccionar foto'), {
      target: { files: [avatar] },
    })

    expect(screen.getByRole('img', { name: 'Vista previa de la foto' })).toHaveAttribute('src', 'blob:preview')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(userService.updateCurrentProfile).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({ avatar }),
    ))
  })

  it('removes the current photo and falls back to initials', async () => {
    const withAvatar = { ...profile, avatar_url: '/api/auth/me/avatar/' }
    userService.getCurrentUser.mockResolvedValue(withAvatar)
    userService.updateCurrentProfile.mockResolvedValue({ ...withAvatar, avatar_url: '' })
    userService.getUserAvatarContent.mockResolvedValue(new Blob(['avatar'], { type: 'image/png' }))
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:current-avatar'),
      revokeObjectURL: vi.fn(),
    })
    renderPage()

    expect(await screen.findByRole('img', { name: 'Foto de Elena Vargas' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }))
    expect(screen.queryByRole('img', { name: 'Foto de Elena Vargas' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(userService.updateCurrentProfile).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({ remove_avatar: true }),
    ))
  })

  it('shows a useful error when the profile cannot be loaded', async () => {
    userService.getCurrentUser.mockRejectedValue(new Error('No fue posible cargar tu perfil.'))

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cargar tu perfil.')
  })
})
