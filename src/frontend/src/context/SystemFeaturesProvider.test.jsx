import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import SystemFeaturesProvider from './SystemFeaturesProvider'
import { useSystemFeatures } from './systemFeaturesValue'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const response = (data) => ({ ok: true, status: 200, json: async () => data })

function FeatureActions() {
  const { uploads, password_reset: passwordReset } = useSystemFeatures()
  return <>
    <button disabled={!uploads}>Subir documento</button>
    <button disabled={!passwordReset}>Recuperar contraseña</button>
  </>
}

function renderFeatures() {
  return render(<SystemFeaturesProvider><FeatureActions /></SystemFeaturesProvider>)
}

it('shows the synthetic-data notice and disables actions using server features', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
    demo: true, uploads: false, password_reset: false,
  })))
  renderFeatures()

  expect(await screen.findByRole('note')).toHaveTextContent('Solo datos ficticios')
  expect(screen.getByRole('button', { name: 'Subir documento' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Recuperar contraseña' })).toBeDisabled()
})

it('renders immediately while configuration loads, then applies server restrictions', async () => {
  let resolve
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((done) => { resolve = done })))
  renderFeatures()

  expect(screen.getByRole('button', { name: 'Subir documento' })).toBeEnabled()
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  await act(async () => resolve(response({ demo: true, uploads: false, password_reset: false })))
  expect(screen.getByRole('button', { name: 'Subir documento' })).toBeDisabled()
})

it('keeps startup available if the configuration server is offline', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')))
  await act(async () => { renderFeatures() })

  expect(screen.getByRole('button', { name: 'Subir documento' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Recuperar contraseña' })).toBeEnabled()
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
})

it.each([
  { demo: true, uploads: 'false', password_reset: false },
  { demo: true },
  null,
])('does not apply a malformed feature response: %j', async (data) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)))
  await act(async () => { renderFeatures() })

  expect(screen.getByRole('button', { name: 'Subir documento' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Recuperar contraseña' })).toBeEnabled()
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
})

it('aborts a pending request on unmount', () => {
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
  vi.stubGlobal('fetch', fetchMock)
  const { unmount } = renderFeatures()
  const signal = fetchMock.mock.calls[0][1].signal

  expect(signal.aborted).toBe(false)
  unmount()
  expect(signal.aborted).toBe(true)
})

it('aborts a slow configuration request after ten seconds without blocking children', () => {
  vi.useFakeTimers()
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
  vi.stubGlobal('fetch', fetchMock)
  renderFeatures()
  const signal = fetchMock.mock.calls[0][1].signal

  act(() => vi.advanceTimersByTime(9999))
  expect(signal.aborted).toBe(false)
  act(() => vi.advanceTimersByTime(1))
  expect(signal.aborted).toBe(true)
  expect(screen.getByRole('button', { name: 'Subir documento' })).toBeEnabled()
})
