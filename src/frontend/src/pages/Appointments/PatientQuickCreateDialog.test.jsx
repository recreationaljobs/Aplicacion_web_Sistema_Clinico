import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkPatientDuplicates,
  createQuickPatient,
} from '../../services/patientService'
import PatientQuickCreateDialog from './PatientQuickCreateDialog'

vi.mock('../../services/patientService', () => ({
  checkPatientDuplicates: vi.fn(),
  createQuickPatient: vi.fn(),
}))

const createdPatient = {
  id: 20,
  code: 'PAC-00020',
  full_name: 'Ana López',
  phone: '8888-1111',
  date_of_birth: '1990-05-10',
  profile_complete: false,
}

const duplicate = {
  id: 12,
  code: 'PAC-00012',
  full_name: 'Ana López',
  date_of_birth: '1990-05-10',
  phone: '8888-1111',
  is_active: true,
  profile_complete: true,
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

function renderDialog(overrides = {}) {
  const props = {
    accessToken: 'access-token',
    onCancel: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  }
  return { ...render(<PatientQuickCreateDialog {...props} />), props }
}

function fillCoreFields() {
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Primer apellido'), { target: { value: 'López' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
    target: { value: '1990-05-10' },
  })
}

describe('PatientQuickCreateDialog', () => {
  beforeEach(() => {
    checkPatientDuplicates.mockResolvedValue({ has_matches: false, matches: [] })
    createQuickPatient.mockResolvedValue(createdPatient)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('opens as an accessible modal and closes without creating', () => {
    const { props } = renderDialog()

    expect(screen.getByRole('dialog', { name: 'Alta rápida de paciente' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar alta rápida' }))

    expect(props.onCancel).toHaveBeenCalledOnce()
    expect(createQuickPatient).not.toHaveBeenCalled()
  })

  it('rejects a form without phone or identification before duplicate-check', () => {
    renderDialog()
    fillCoreFields()

    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))

    expect(screen.getByRole('alert')).toHaveTextContent('teléfono o una identificación')
    expect(checkPatientDuplicates).not.toHaveBeenCalled()
    expect(createQuickPatient).not.toHaveBeenCalled()
  })

  it('creates with phone and selects the minimal response immediately', async () => {
    const { props } = renderDialog()
    fillCoreFields()
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-1111' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))

    await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith(createdPatient))
    expect(checkPatientDuplicates).toHaveBeenCalledWith('access-token', {
      first_name: 'Ana',
      first_last_name: 'López',
      date_of_birth: '1990-05-10',
      phone: '8888-1111',
    })
    expect(createQuickPatient).toHaveBeenCalledWith('access-token', {
      first_name: 'Ana',
      last_name: 'López',
      date_of_birth: '1990-05-10',
      phone: '8888-1111',
      identification_type: null,
      identification_number: null,
    })
  })

  it.each(['CEDULA', 'PASAPORTE', 'OTRO'])(
    'creates with %s identification and no phone',
    async (identificationType) => {
      const { props } = renderDialog()
      fillCoreFields()
      fireEvent.change(screen.getByLabelText('Tipo de identificación'), {
        target: { value: identificationType },
      })
      fireEvent.change(screen.getByLabelText('Número de identificación'), {
        target: { value: identificationType === 'CEDULA' ? '2810904031006k' : `${identificationType}-5200` },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))

      await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith(createdPatient))
      expect(createQuickPatient).toHaveBeenCalledWith('access-token', expect.objectContaining({
        phone: '',
        identification_type: identificationType,
        identification_number: identificationType === 'CEDULA' ? '281-090403-1006K' : `${identificationType}-5200`,
      }))
    },
  )

  it('uses an active duplicate instead of creating another patient', async () => {
    checkPatientDuplicates.mockResolvedValue({ has_matches: true, matches: [duplicate] })
    const { props } = renderDialog()
    fillCoreFields()
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-1111' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Usar paciente existente' }))

    expect(props.onSelect).toHaveBeenCalledWith(duplicate)
    expect(createQuickPatient).not.toHaveBeenCalled()
  })

  it('does not allow selecting an inactive duplicate', async () => {
    checkPatientDuplicates.mockResolvedValue({
      has_matches: true,
      matches: [{ ...duplicate, is_active: false }],
    })
    renderDialog()
    fillCoreFields()
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-1111' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))

    expect(await screen.findByRole('button', { name: 'Usar paciente existente' })).toBeDisabled()
    expect(screen.getByText('Paciente inactivo')).toBeInTheDocument()
  })

  it('returns to the quick form or creates explicitly despite an approximate match', async () => {
    checkPatientDuplicates.mockResolvedValue({ has_matches: true, matches: [duplicate] })
    const { props } = renderDialog()
    fillCoreFields()
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-1111' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Volver' }))
    expect(screen.getByLabelText('Teléfono')).toHaveValue('8888-1111')
    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Crear de todos modos' }))

    await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith(createdPatient))
    expect(createQuickPatient).toHaveBeenCalledOnce()
  })

  it('shows duplicate-check errors and keeps the quick form open', async () => {
    checkPatientDuplicates.mockRejectedValue(new Error('No fue posible revisar duplicados.'))
    renderDialog()
    fillCoreFields()
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-1111' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear paciente' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible revisar duplicados.')
    expect(screen.getByRole('dialog', { name: 'Alta rápida de paciente' })).toBeInTheDocument()
    expect(createQuickPatient).not.toHaveBeenCalled()
  })

  it('ignores repeated submit while duplicate-check is pending', async () => {
    const pending = deferredPromise()
    checkPatientDuplicates.mockReturnValue(pending.promise)
    const { props } = renderDialog()
    fillCoreFields()
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-1111' } })

    const create = screen.getByRole('button', { name: 'Crear paciente' })
    fireEvent.click(create)
    fireEvent.click(create)

    expect(checkPatientDuplicates).toHaveBeenCalledOnce()
    await act(async () => pending.resolve({ has_matches: false, matches: [] }))
    await waitFor(() => expect(props.onSelect).toHaveBeenCalledWith(createdPatient))
    expect(createQuickPatient).toHaveBeenCalledOnce()
  })
})
