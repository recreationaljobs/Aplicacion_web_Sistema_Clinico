import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../context/authContextValue'
import { listPatients } from '../../services/patientService'
import PatientsPage from './PatientsPage'

vi.mock('../../services/patientService', () => ({ listPatients: vi.fn() }))

const patients = [
  {
    id: 2,
    code: 'PAC-00002',
    first_name: 'Bruno',
    last_name: 'García',
    full_name: 'Bruno García',
    phone: '8888-0002',
    email: '',
    date_of_birth: '1990-01-01',
    created_at: '2026-08-02T09:00:00Z',
    is_active: false,
    profile_complete: true,
  },
  {
    id: 1,
    code: 'PAC-00001',
    first_name: 'Ana',
    last_name: 'López',
    full_name: 'Ana López',
    phone: '8888-0001',
    email: 'ana@example.test',
    date_of_birth: '1991-01-01',
    created_at: '2026-08-01T09:00:00Z',
    is_active: true,
    profile_complete: true,
  },
]

function renderPage(user = {
  role: 'RECEPCIONISTA',
  permissions: ['patients.view', 'patients.create'],
}) {
  return render(
    <AuthContext.Provider value={{ user, accessToken: 'access-token' }}>
      <MemoryRouter><PatientsPage /></MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('PatientsPage HU-16/HU-17', () => {
  it('shows assigned patient summaries under Mis pacientes for dentists', async () => {
    listPatients.mockResolvedValue({ count: 1, results: [{ ...patients[1], next_appointment_date: '2026-09-26', next_appointment_time: '10:00:00', next_appointment_status: 'CONFIRMADA', last_consultation_date: '2026-09-01' }] })
    renderPage({ role: 'ODONTOLOGO', permissions: ['patients.view'] })
    expect(await screen.findByRole('heading', { name: 'Mis pacientes' })).toBeInTheDocument()
    expect(await screen.findByText(/10:00/)).toBeInTheDocument()
    expect(screen.getByText('CONFIRMADA')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Última consulta' })).toBeInTheDocument()
  })
  beforeEach(() => {
    listPatients.mockReset()
    listPatients.mockResolvedValue({ count: 60, results: patients })
  })

  afterEach(() => cleanup())

  it('loads the default backend order and renders patient activity separately', async () => {
    renderPage()

    expect(await screen.findByRole('combobox', { name: 'Ordenar por' })).toHaveValue('created_at')
    expect(screen.getByRole('combobox', { name: 'Dirección' })).toHaveValue('desc')
    await waitFor(() => {
      expect(listPatients).toHaveBeenCalledWith(
        'access-token',
        '',
        undefined,
        undefined,
        '-created_at',
      )
    })
    const inactiveRow = screen.getByRole('row', { name: /Bruno García/ })
    const activeRow = screen.getByRole('row', { name: /Ana López/ })
    expect(within(inactiveRow).getByText('Inactivo')).toBeInTheDocument()
    expect(within(activeRow).getByText('Activo')).toBeInTheDocument()
  })

  it('resets pagination and requests the selected backend order', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Página siguiente de Pacientes' })
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente de Pacientes' }))

    await waitFor(() => {
      expect(listPatients).toHaveBeenCalledWith(
        'access-token',
        '',
        2,
        undefined,
        '-created_at',
      )
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar por' }), {
      target: { value: 'name' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Dirección' }), {
      target: { value: 'asc' },
    })

    await waitFor(() => {
      expect(listPatients).toHaveBeenCalledWith(
        'access-token',
        '',
        undefined,
        undefined,
        'name',
      )
    })
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
  })

  it('keeps the existing patient-create permission boundary', async () => {
    renderPage({ role: 'ODONTOLOGO', permissions: ['patients.view'] })

    await screen.findByRole('heading', { name: 'Mis pacientes' })
    expect(screen.queryByRole('button', { name: 'Nuevo paciente' })).not.toBeInTheDocument()
  })
})
