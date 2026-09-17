import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as clinicService from '../../services/clinicService'
import BusinessHoursPanel from './BusinessHoursPanel'

vi.mock('../../services/clinicService')

const closedDays = () => Array.from({ length: 7 }, (_, weekday) => ({
  weekday, is_open: false, opens_at: null, closes_at: null, breaks: [],
}))
const renderPanel = () => render(<MemoryRouter><BusinessHoursPanel accessToken="synthetic-token" /></MemoryRouter>)

beforeEach(() => {
  vi.resetAllMocks()
  clinicService.getBusinessHours.mockResolvedValue({ days: closedDays() })
  clinicService.listClosures.mockResolvedValue([])
})
afterEach(cleanup)

it('saves edited opening hours and restores them when the panel is reopened', async () => {
  let stored = { days: closedDays() }
  clinicService.getBusinessHours.mockImplementation(async () => structuredClone(stored))
  clinicService.updateBusinessHours.mockImplementation(async (_, payload) => {
    stored = structuredClone(payload)
    return stored
  })
  const view = renderPanel()
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Sábado' }))
  fireEvent.change(screen.getByLabelText('Cierre Sábado'), { target: { value: '16:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await screen.findByText('Horarios guardados correctamente.')
  expect(stored.days[5]).toMatchObject({ is_open: true, opens_at: '08:00', closes_at: '16:00' })
  view.unmount()
  renderPanel()
  expect(await screen.findByRole('checkbox', { name: 'Sábado' })).toBeChecked()
  expect(screen.getByLabelText('Cierre Sábado')).toHaveValue('16:00')
})

it('shows save conflicts as an actionable alert with affected appointments', async () => {
  clinicService.updateBusinessHours.mockRejectedValue(Object.assign(new Error('La configuración afecta citas futuras.'), {
    data: { conflicting_appointments: [{ id: 1, date: '2026-09-19', start_time: '09:00:00', patient_name: 'Paciente ficticio' }] },
  }))
  renderPanel()
  await screen.findByRole('checkbox', { name: 'Lunes' })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('2026-09-19 · 09:00 · Paciente ficticio')
  expect(alert).toHaveTextContent(/reprograma o cancela/i)
  expect(within(alert).getByRole('link', { name: 'Revisar agenda' })).toHaveAttribute('href', '/citas')
  expect(screen.getByRole('checkbox', { name: 'Sábado' })).not.toBeChecked()
  expect(screen.queryByText('Horarios guardados correctamente.')).not.toBeInTheDocument()
})

it('accepts a break edited to the opening boundary after loading second precision times', async () => {
  const days = closedDays()
  days[0] = {
    weekday: 0, is_open: true, opens_at: '08:00:00', closes_at: '17:00:00',
    breaks: [{ starts_at: '08:30:00', ends_at: '09:00:00' }],
  }
  clinicService.getBusinessHours.mockResolvedValue({ days })
  clinicService.updateBusinessHours.mockImplementation(async (_, payload) => payload)
  renderPanel()
  fireEvent.change(await screen.findByLabelText('Inicio pausa Lunes 1'), { target: { value: '08:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(clinicService.updateBusinessHours).toHaveBeenCalled())
  await screen.findByText('Horarios guardados correctamente.')
})
