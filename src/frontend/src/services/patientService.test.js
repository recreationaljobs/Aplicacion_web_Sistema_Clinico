import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkPatientDuplicates,
  createQuickPatient,
  createPatient,
  createPatientConsultation,
  acceptConsultationTreatmentItem,
  cancelConsultationTreatmentItem,
  completePatientConsultation,
  createConsultationTreatmentItem,
  deletePatientDocument,
  getPatientDocumentContent,
  getPatient,
  getPatientConsultation,
  listDocumentCategories,
  listPatientDocuments,
  listPatientConsultations,
  getPatientPlannedOdontogramOverlay,
  listConsultationTreatmentItems,
  listRecentConsultations,
  listPatients,
  performConsultationTreatmentItem,
  searchPatientOptions,
  uploadPatientDocuments,
  updatePatientConsultation,
  updateConsultationTreatmentItem,
} from './patientService'
import * as patientService from './patientService'
import { apiBlobRequest, apiFileRequest, apiRequest } from './api'

vi.mock('./api', () => ({
  apiRequest: vi.fn(),
  apiBlobRequest: vi.fn(),
  apiFileRequest: vi.fn(),
}))

describe('patientService', () => {
  it('keeps consultation options beyond the first hundred available', async () => {
    const first = Array.from({ length: 100 }, (_, id) => ({ id: id + 1 }))
    apiRequest.mockResolvedValueOnce({ count: 101, next: '?page=2', results: first })
      .mockResolvedValueOnce({ count: 101, next: null, results: [{ id: 101 }] })
    const result = await patientService.listPatientConsultationOptions('token', 7)
    expect(result).toHaveLength(101)
    expect(result[100].id).toBe(101)
    expect(apiRequest).toHaveBeenLastCalledWith(
      '/api/patients/7/consultations/?compact=true&page_size=100&page=2',
      { headers: { Authorization: 'Bearer token' } },
    )
  })

  beforeEach(() => {
    apiRequest.mockReset()
    apiBlobRequest.mockReset()
    apiFileRequest.mockReset()
  })

  it('lists and searches patient records with authentication', () => {
    listPatients('token', 'María García')
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/?search=Mar%C3%ADa%20Garc%C3%ADa', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('requests a bounded patient page', () => {
    listPatients('token', 'María García', 2, 25)
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/patients/?search=Mar%C3%ADa%20Garc%C3%ADa&page=2&page_size=25',
      { headers: { Authorization: 'Bearer token' } },
    )
  })

  it('requests server-side patient ordering with search and pagination', () => {
    listPatients('token', 'Ana', 2, 25, '-name')

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/patients/?search=Ana&page=2&page_size=25&ordering=-name',
      { headers: { Authorization: 'Bearer token' } },
    )
  })

  it('requests ordering without adding empty pagination parameters', () => {
    listPatients('token', '', undefined, undefined, 'is_active')

    expect(apiRequest).toHaveBeenCalledWith('/api/patients/?ordering=is_active', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('searches the minimal patient options with an abort signal', () => {
    const controller = new AbortController()

    searchPatientOptions('token', 'Ana Pérez', controller.signal)

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/patients/options/?search=Ana%20P%C3%A9rez',
      {
        headers: { Authorization: 'Bearer token' },
        signal: controller.signal,
      },
    )
  })

  it('checks possible duplicates with minimized candidate data and optional self exclusion', () => {
    checkPatientDuplicates('token', {
      first_name: 'Ana',
      first_last_name: 'López',
      date_of_birth: '1990-05-10',
      phone: '8888-1111',
    }, 7)

    expect(apiRequest).toHaveBeenCalledWith('/api/patients/duplicate-check/', {
      method: 'POST',
      body: JSON.stringify({
        first_name: 'Ana',
        first_last_name: 'López',
        date_of_birth: '1990-05-10',
        phone: '8888-1111',
        exclude_patient_id: 7,
      }),
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('creates a patient without exposing technical fields', () => {
    const patient = { first_name: 'María', national_id: '001-A' }
    createPatient('token', patient)
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/', {
      method: 'POST', body: JSON.stringify(patient), headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads the generated clinical record', () => {
    getPatient('token', 7)
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads the consultations scoped to a patient', () => {
    listPatientConsultations('token', 7)
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/consultations/', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('exports the generated clinical record through the patient-scoped endpoint', () => {
    expect(patientService.exportPatientClinicalRecord).toBeTypeOf('function')

    patientService.exportPatientClinicalRecord('token', 7)

    expect(apiFileRequest).toHaveBeenCalledWith(
      '/api/patients/7/clinical-record/export/',
      { headers: { Authorization: 'Bearer token' } },
    )
  })

  it('quick-creates a real patient through the normal endpoint with minimal mode', () => {
    const patient = {
      first_name: 'Ana',
      last_name: 'López',
      date_of_birth: '1990-05-10',
      phone: '8888-1111',
      identification_type: null,
      identification_number: null,
    }

    createQuickPatient('token', patient)

    expect(apiRequest).toHaveBeenCalledWith('/api/patients/?mode=quick', {
      method: 'POST',
      body: JSON.stringify(patient),
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('requests a bounded consultation page', () => {
    listPatientConsultations('token', 7, 3, 25)
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/consultations/?page=3&page_size=25', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads the compact patient dashboard summary with authentication', () => {
    expect(patientService.listPatientDashboardSummary).toBeTypeOf('function')
    patientService.listPatientDashboardSummary('token')
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/dashboard-summary/', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads the recent consultation summary with authentication', () => {
    listRecentConsultations('token')
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/consultations/recent/', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads one consultation scoped to its patient', () => {
    getPatientConsultation('token', 7, 12)
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/consultations/12/', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('creates a consultation for a patient', () => {
    const consultation = { date: '2026-08-08', summary: 'Valoración clínica.' }
    createPatientConsultation('token', 7, consultation)
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/consultations/', {
      method: 'POST', body: JSON.stringify(consultation), headers: { Authorization: 'Bearer token' },
    })
  })

  it('updates a patient consultation', () => {
    const changes = { summary: 'Control actualizado.' }
    updatePatientConsultation('token', 7, 12, changes)
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/consultations/12/', {
      method: 'PATCH', body: JSON.stringify(changes), headers: { Authorization: 'Bearer token' },
    })
  })

  it('updates only the submitted patient fields with authentication', () => {
    const changes = { address: 'Residencial Las Colinas' }

    patientService.updatePatient('token', 7, changes)

    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/', {
      method: 'PATCH', body: JSON.stringify(changes), headers: { Authorization: 'Bearer token' },
    })
  })

  it('lists patient documents with encoded filters and category suggestions', () => {
    listPatientDocuments('token', 7, { search: 'rayos X', category: 'Radiografía dental' })
    listDocumentCategories('token')

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/patients/7/documents/?search=rayos%20X&category=Radiograf%C3%ADa%20dental',
      { headers: { Authorization: 'Bearer token' } },
    )
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/patients/document-categories/', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('completes a patient consultation through the explicit action', () => {
    completePatientConsultation('token', 7, 12)
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/consultations/12/complete/', {
      method: 'POST', headers: { Authorization: 'Bearer token' },
    })
  })

  it('lists, creates and updates treatment items inside the consultation scope', () => {
    const proposal = { service_id: 4, tooth_code: '16', surfaces: ['OCCLUSAL'] }
    const changes = { notes: 'Aislamiento absoluto' }

    listConsultationTreatmentItems('token', 7, 12)
    createConsultationTreatmentItem('token', 7, 12, proposal)
    updateConsultationTreatmentItem('token', 7, 12, 3, changes)

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/patients/7/consultations/12/treatment-items/',
      { headers: { Authorization: 'Bearer token' } },
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      '/api/patients/7/consultations/12/treatment-items/',
      { method: 'POST', body: JSON.stringify(proposal), headers: { Authorization: 'Bearer token' } },
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      '/api/patients/7/consultations/12/treatment-items/3/',
      { method: 'PATCH', body: JSON.stringify(changes), headers: { Authorization: 'Bearer token' } },
    )
  })

  it('uses explicit treatment lifecycle endpoints and payloads', () => {
    acceptConsultationTreatmentItem('token', 7, 12, 3)
    performConsultationTreatmentItem('token', 7, 12, 3, 18, {
      tooth_code: '16', surfaces: ['OCCLUSAL'], finding: 'RESTORATION',
    })
    cancelConsultationTreatmentItem('token', 7, 12, 3, 'Paciente pospone')

    const base = '/api/patients/7/consultations/12/treatment-items/3'
    expect(apiRequest).toHaveBeenNthCalledWith(1, `${base}/accept/`, {
      method: 'POST', headers: { Authorization: 'Bearer token' },
    })
    expect(apiRequest).toHaveBeenNthCalledWith(2, `${base}/perform/`, {
      method: 'POST',
      body: JSON.stringify({
        performed_in: 18,
        odontogram_result: {
          tooth_code: '16', surfaces: ['OCCLUSAL'], finding: 'RESTORATION',
        },
      }),
      headers: { Authorization: 'Bearer token' },
    })
    expect(apiRequest).toHaveBeenNthCalledWith(3, `${base}/cancel/`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Paciente pospone' }),
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads the current planned overlay and omits an unregistered result', () => {
    getPatientPlannedOdontogramOverlay('token', 7)
    performConsultationTreatmentItem('token', 7, 12, 3, 18, null)

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      '/api/patients/7/odontogram/planned-overlay/',
      { headers: { Authorization: 'Bearer token' } },
    )
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/api/patients/7/consultations/12/treatment-items/3/perform/', {
      method: 'POST',
      body: JSON.stringify({ performed_in: 18 }),
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads one bounded longitudinal treatment page with explicit filters', async () => {
    apiRequest.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 9, status: 'ACEPTADO' }],
    })
    expect(patientService.listPatientTreatmentItems).toBeTypeOf('function')

    const result = await patientService.listPatientTreatmentItems('token', 7, {
      scope: 'pending',
      page: 2,
      pageSize: 25,
    })

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/patients/7/treatment-items/?scope=pending&page=2&page_size=25',
      { headers: { Authorization: 'Bearer token' } },
    )
    expect(result.results).toEqual([{ id: 9, status: 'ACEPTADO' }])
  })

  it('requests a bounded filtered document page', () => {
    listPatientDocuments('token', 7, {
      search: 'rayos X', category: 'Radiografía dental', consultationId: 12,
      page: 2, pageSize: 25,
    })

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/patients/7/documents/?search=rayos%20X&category=Radiograf%C3%ADa%20dental&consultation_id=12&page=2&page_size=25',
      { headers: { Authorization: 'Bearer token' } },
    )
  })

  it('uploads repeated files as multipart without setting a content type', () => {
    const files = [new File(['a'], 'frontal.png', { type: 'image/png' }), new File(['b'], 'rx.pdf', { type: 'application/pdf' })]
    uploadPatientDocuments('token', 7, {
      files, category: 'Radiografías', documentDate: '2026-08-09', notes: 'Ingreso',
      consultationId: 12, toothCode: '16',
    })

    const [path, options] = apiRequest.mock.calls[0]
    expect(path).toBe('/api/patients/7/documents/')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ Authorization: 'Bearer token' })
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.getAll('files')).toEqual(files)
    expect(options.body.get('document_date')).toBe('2026-08-09')
    expect(options.body.get('consultation_id')).toBe('12')
    expect(options.body.get('tooth_code')).toBe('16')
  })

  it('loads bounded minimal consultation options for document context', async () => {
    expect(patientService.listPatientConsultationOptions).toBeTypeOf('function')

    apiRequest.mockResolvedValueOnce([])
    await patientService.listPatientConsultationOptions('token', 7)

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/patients/7/consultations/?compact=true&page_size=100',
      { headers: { Authorization: 'Bearer token' } },
    )
  })

  it('updates document classification and nullable context on the existing detail URL', () => {
    expect(patientService.updatePatientDocument).toBeTypeOf('function')
    const changes = {
      category: 'Fotografía clínica',
      consultation_id: 12,
      tooth_code: '16',
    }

    patientService.updatePatientDocument('token', 7, 4, changes)

    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/documents/4/', {
      method: 'PATCH',
      body: JSON.stringify(changes),
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('loads authenticated content and deletes within the patient scope', () => {
    getPatientDocumentContent('token', 7, 4, true)
    deletePatientDocument('token', 7, 4, 'Duplicado')

    expect(apiBlobRequest).toHaveBeenCalledWith(
      '/api/patients/7/documents/4/content/?download=true',
      { headers: { Authorization: 'Bearer token' } },
    )
    expect(apiRequest).toHaveBeenCalledWith('/api/patients/7/documents/4/', {
      method: 'DELETE', body: JSON.stringify({ reason: 'Duplicado' }), headers: { Authorization: 'Bearer token' },
    })
  })
})
