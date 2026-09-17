import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ServicesPanel from './ServicesPanel'
import * as service from '../../services/clinicService'

vi.mock('../../services/clinicService', () => ({
  listServiceCategories: vi.fn(), listClinicServices: vi.fn(),
  createClinicService: vi.fn(), createServiceCategory: vi.fn(),
  updateClinicService: vi.fn(), updateServiceCategory: vi.fn(),
}))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('keeps an archive failure visible and the service available', async () => {
  service.listServiceCategories.mockResolvedValue([{ id: 1, name: 'General', is_active: true }])
  service.listClinicServices.mockResolvedValue([{ id: 2, category: 1, name: 'Valoración', price: '0', duration_minutes: 30, is_active: true }])
  service.updateClinicService.mockRejectedValue(new Error('No se pudo archivar'))
  render(<ServicesPanel accessToken="token" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Archivar' }))
  expect(await screen.findByText('No se pudo archivar')).toBeInTheDocument()
  expect(screen.getByText('Valoración')).toBeInTheDocument()
})
