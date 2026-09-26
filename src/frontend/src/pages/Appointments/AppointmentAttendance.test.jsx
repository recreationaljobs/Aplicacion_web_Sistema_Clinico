import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AppointmentDetailsPanel from './AppointmentDetailsPanel'

afterEach(cleanup)

const appointment = {
  id: 1, patient_name: 'Juan Pérez', patient_code: 'PAC-00001', dentist_name: 'Yader',
  date: '2026-09-26', start_time: '10:00:00', end_time: '10:30:00', duration_minutes: 30,
  status: 'PROGRAMADA', status_display: 'Programada', reason: 'Revisión',
}

it('enables start only when the server authorizes the interval', () => {
  const props = { appointment: { ...appointment, attendance: { can_start: false, detail: 'Aún no disponible' } },
    canStartAttendance: true, rescheduleHistory: [], onStartAttendance: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<AppointmentDetailsPanel {...props} />)
  expect(screen.getByRole('button', { name: 'Iniciar consulta' })).toBeDisabled()
  expect(screen.getByText('Aún no disponible')).toBeInTheDocument()
  rerender(<AppointmentDetailsPanel {...props} appointment={{ ...appointment, attendance: { can_start: true } }} />)
  expect(screen.getByRole('button', { name: 'Iniciar consulta' })).toBeEnabled()
  rerender(<AppointmentDetailsPanel {...props} appointment={appointment} />)
  expect(screen.getByRole('button', { name: 'Iniciar consulta' })).toBeDisabled()
})
