import { afterEach, expect, it, vi } from 'vitest'
import { logout, restoreSession } from './authService'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

it('does not restore a cookie session after an offline logout', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new TypeError('Offline'))
  vi.stubGlobal('fetch', fetchMock)
  await expect(logout({ access: 'expired' })).rejects.toThrow('Offline')
  expect(localStorage.getItem('dentalclinic.logoutPending')).toBe('1')
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-json' }) })
    .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
  expect(await restoreSession()).toBeNull()
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining('/api/auth/logout/'),
    expect.objectContaining({
      method: 'POST', credentials: 'include', body: '{}',
      headers: expect.objectContaining({ 'X-CSRFToken': 'csrf-json' }),
    }),
  )
  expect(fetchMock.mock.calls.some(([url]) => url.includes('token/refresh'))).toBe(false)
  expect(localStorage.getItem('dentalclinic.logoutPending')).toBeNull()
})
