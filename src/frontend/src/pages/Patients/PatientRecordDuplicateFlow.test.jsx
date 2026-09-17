import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkPatientDuplicates,
  createPatient,
  getPatient,
  updatePatient,
} from '../../services/patientService'
import PatientRecordPage from './PatientRecordPage'

vi.mock('../../context/authContextValue', () => ({
  useAuth: () => ({
    accessToken: 'access-token',
    user: {
      role: 'RECEPCIONISTA',
      permissions: ['patients.view', 'patients.create', 'patients.edit'],
    },
  }),
}))
vi.mock('../../services/patientService', () => ({
  checkPatientDuplicates: vi.fn(),
  createPatient: vi.fn(),
  getPatient: vi.fn(),
  updatePatient: vi.fn(),
}))
vi.mock('./useLongitudinalTreatmentPlan', () => ({
  default: () => ({
    items: [], loading: false, error: '', pendingHasMore: false, historyHasMore: false,
    loadingMoreScope: '', loadMore: vi.fn(),
  }),
}))

const patient = {
  id: 7,
  code: 'PAC-00007',
  first_name: 'Ana',
  last_name: 'López',
  second_last_name: '',
  full_name: 'Ana López',
  birth_place: 'Managua',
  identification_type: null,
  identification_number: null,
  phone: '8888-1111',
  email: '',
  gender: 'FEMENINO',
  date_of_birth: '1990-05-10',
  is_active: true,
  profile_complete: true,
  missing_profile_fields: [],
  clinical_record: {},
}

const duplicate = {
  id: 12,
  code: 'PAC-00012',
  full_name: 'Ana López',
  date_of_birth: '1990-05-10',
  phone: '8888-1111',
  is_active: true,
  matched_on: ['phone', 'name_and_date_of_birth'],
}

function deferredPromise() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function renderPage({ isNew = true, route = '/pacientes/nuevo' } = {}) {
  const router = createMemoryRouter([
    { path: '/pacientes/nuevo', element: <PatientRecordPage isNew /> },
    { path: '/pacientes/:id/editar', element: <PatientRecordPage /> },
    { path: '/pacientes/:id', element: <p>Detalle de paciente abierto</p> },
    { path: '/pacientes', element: <p>Lista de pacientes</p> },
  ], { initialEntries: [isNew ? '/pacientes/nuevo' : route] })
  return { router, ...render(<RouterProvider router={router} />) }
}

function fillRequiredCreateFields() {
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Primer apellido'), { target: { value: 'López' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '1990-05-10' } })
  fireEvent.change(screen.getByLabelText('Lugar de nacimiento'), { target: { value: 'Managua' } })
  fireEvent.change(screen.getByLabelText('Género'), { target: { value: 'FEMENINO' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-1111' } })
}

describe('PatientRecordPage duplicate warning flow', () => {
  it('collects a clinical reason while preserving receptionist permissions', async () => {
    getPatient.mockResolvedValue({ ...patient, version: 1, clinical_record: { allergies: 'Original' } })
    renderPage({ isNew: false, route: '/pacientes/7/editar' })
    fireEvent.change(await screen.findByLabelText('Alergias'), { target: { value: 'Clarified' } })
    fireEvent.change(screen.getByLabelText('Motivo del cambio clínico'), { target: { value: 'Patient clarification' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(updatePatient).toHaveBeenCalledWith('access-token', '7', expect.objectContaining({ clinical_change_reason: 'Patient clarification', expected_version: 1 })))
  })
  beforeEach(() => {
    checkPatientDuplicates.mockResolvedValue({ has_matches: false, matches: [] })
    createPatient.mockResolvedValue(patient)
    getPatient.mockResolvedValue(patient)
    updatePatient.mockResolvedValue(patient)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('checks after form validation and creates immediately when there are no matches', async () => {
    renderPage()
    fillRequiredCreateFields()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(createPatient).toHaveBeenCalledOnce())
    expect(checkPatientDuplicates).toHaveBeenCalledWith('access-token', {
      first_name: 'Ana',
      first_last_name: 'López',
      date_of_birth: '1990-05-10',
      phone: '8888-1111',
    })
    expect(checkPatientDuplicates.mock.invocationCallOrder[0]).toBeLessThan(
      createPatient.mock.invocationCallOrder[0],
    )
  })

  it('pauses on a warning, keeps the form on back, and creates only after confirmation', async () => {
    checkPatientDuplicates.mockResolvedValue({ has_matches: true, matches: [duplicate] })
    renderPage()
    fillRequiredCreateFields()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByRole('dialog', { name: 'Posible paciente duplicado' })).toBeInTheDocument()
    expect(createPatient).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('dialog', { name: 'Posible paciente duplicado' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Teléfono')).toHaveValue('8888-1111')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByRole('dialog', { name: 'Posible paciente duplicado' })
    fireEvent.click(screen.getByRole('button', { name: 'Crear de todos modos' }))

    await waitFor(() => expect(createPatient).toHaveBeenCalledOnce())
  })

  it('reviews a matching patient without creating', async () => {
    checkPatientDuplicates.mockResolvedValue({ has_matches: true, matches: [duplicate] })
    const { router } = renderPage()
    fillRequiredCreateFields()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar paciente' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/pacientes/12'))
    expect(createPatient).not.toHaveBeenCalled()
  })

  it('excludes self when duplicate-relevant fields change during update', async () => {
    renderPage({ isNew: false, route: '/pacientes/7/editar' })
    fireEvent.change(await screen.findByLabelText('Teléfono'), {
      target: { value: '8888 1111' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updatePatient).toHaveBeenCalledOnce())
    expect(checkPatientDuplicates).toHaveBeenCalledWith('access-token', {
      first_name: 'Ana',
      first_last_name: 'López',
      date_of_birth: '1990-05-10',
      phone: '8888 1111',
    }, '7')
  })

  it('shows duplicate-check errors and never creates a patient', async () => {
    checkPatientDuplicates.mockRejectedValue(new Error('No fue posible revisar duplicados.'))
    renderPage()
    fillRequiredCreateFields()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible revisar duplicados.')
    expect(createPatient).not.toHaveBeenCalled()
  })

  it('ignores a repeated submit while duplicate-check is pending', async () => {
    const pending = deferredPromise()
    checkPatientDuplicates.mockReturnValue(pending.promise)
    renderPage()
    fillRequiredCreateFields()

    const save = screen.getByRole('button', { name: 'Guardar cambios' })
    fireEvent.click(save)
    fireEvent.click(save)

    expect(checkPatientDuplicates).toHaveBeenCalledOnce()
    await act(async () => pending.resolve({ has_matches: false, matches: [] }))
    await waitFor(() => expect(createPatient).toHaveBeenCalledOnce())
  })
})
