import { afterEach, describe, expect, it, vi } from 'vitest'
import { changePassword, confirmPasswordReset, logout, requestPasswordReset } from './authService'

const apiUrl = `${window.location.protocol}//${window.location.hostname}:8000`

describe('authService.logout', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('revokes the cookie refresh without sending it in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ csrfToken: 'csrf-json' }),
    }).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.reject(new SyntaxError('No content')),
    })
    vi.stubGlobal('fetch', fetchMock)

    await logout({ access: 'access-token' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiUrl}/api/auth/logout/`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'X-CSRFToken': 'csrf-json',
        }),
      }),
    )
  })
})

describe('password reset services', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requests a recovery email from the password reset endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ detail: 'Solicitud recibida.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await requestPasswordReset({ email: 'user@test.com' })

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/api/auth/password-reset/`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@test.com' }),
      }),
    )
  })

  it('submits the token and new password to the confirmation endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ detail: 'Contraseña actualizada.' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const payload = {
      uid: 'uid-value',
      token: 'token-value',
      new_password: 'NuevaContraseña123!',
      confirm_password: 'NuevaContraseña123!',
    }

    await confirmPasswordReset(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/api/auth/password-reset/confirm/`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    )
  })

  it('surfaces field validation errors returned by the reset API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ token: ['El enlace no es válido o ha expirado.'] }),
    }))

    await expect(confirmPasswordReset({
      uid: 'uid-value',
      token: 'expired-token',
      new_password: 'NuevaContraseña123!',
      confirm_password: 'NuevaContraseña123!',
    })).rejects.toThrow('El enlace no es válido o ha expirado.')
  })
})

describe('authService.changePassword', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('submits the password change with bearer authentication', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ detail: 'Tu contraseña fue actualizada correctamente.' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const credentials = {
      current_password: 'Actual123!',
      new_password: 'Nueva456!',
      confirm_password: 'Nueva456!',
    }

    await changePassword({ access: 'access-token', ...credentials })

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/api/auth/password-change/`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(credentials),
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    )
  })
})
