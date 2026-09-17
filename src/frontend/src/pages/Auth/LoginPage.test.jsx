import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../context/AuthContext'
import LoginPage from './LoginPage'
import * as authService from '../../services/authService'

vi.mock('../../services/authService')

const renderPage = () => render(<MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>)

describe('LoginPage', () => {
  afterEach(cleanup)
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    authService.restoreSession.mockRejectedValue(new Error('Sin sesión'))
  })
  it('validates empty credentials', async () => {
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresa tu correo electrónico y contraseña.')
  })
  it('keeps the authenticated session out of Web Storage', async () => {
    authService.login.mockResolvedValue({ access: 'access', user: { email: 'admin@test.com', role: 'ADMINISTRADOR' } })
    renderPage()
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'admin@test.com' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await waitFor(() => expect(authService.login).toHaveBeenCalled())
    expect(screen.queryByLabelText('Recuérdame')).not.toBeInTheDocument()
    expect(localStorage.getItem('dentalclinic_session')).toBeNull()
    expect(sessionStorage.getItem('dentalclinic_session')).toBeNull()
  })
  it('links to the password recovery flow', () => {
    renderPage()

    expect(screen.getByRole('link', { name: '¿Has olvidado tu contraseña?' })).toHaveAttribute(
      'href',
      '/recuperar-contrasena',
    )
  })
  it('shows and hides the password without changing it or submitting the form', () => {
    renderPage()
    const password = screen.getByLabelText('Contraseña')
    const loginCalls = authService.login.mock.calls.length
    fireEvent.change(password, { target: { value: 'ContraseñaDePrueba123!' } })
    expect(password).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('ContraseñaDePrueba123!')
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveValue('ContraseñaDePrueba123!')
    expect(authService.login.mock.calls).toHaveLength(loginCalls)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('uses localized input guidance and reserves space for its images', () => {
    const { container } = renderPage()

    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('placeholder', 'nombre@clinica.com')
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('spellcheck', 'false')
    expect(screen.getByRole('img', { name: 'DentalClinic' })).toHaveAttribute('width', '560')
    expect(screen.getByRole('img', { name: 'DentalClinic' })).toHaveAttribute('height', '144')
    expect(container.querySelector('img[alt=""]')).toHaveAttribute('width', '720')
    expect(container.querySelector('img[alt=""]')).toHaveAttribute('height', '1023')
  })
  it('shows the generic API error for invalid credentials', async () => {
    authService.login.mockRejectedValue(new Error('Correo electrónico o contraseña incorrectos.'))
    renderPage()
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'unknown@test.com' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'incorrecta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo electrónico o contraseña incorrectos.')
    expect(localStorage.getItem('dentalclinic_session')).toBeNull()
    expect(sessionStorage.getItem('dentalclinic_session')).toBeNull()
  })
})
