import { apiBlobRequest, apiFileRequest, apiRequest } from './api'
import { collectPaginatedResults } from './pagination'

const authorization = (access) => ({ Authorization: `Bearer ${access}` })

export const listClinicalRevisions = (access, patientId, consultationId, page = 1) => apiRequest(
  `/api/patients/${patientId}/${consultationId ? `consultations/${consultationId}` : 'clinical-record'}/revisions/?page=${page}`,
  { headers: authorization(access) },
)
export const listConsultationAmendments = (access, patientId, consultationId, page = 1) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/amendments/?page=${page}`,
  { headers: authorization(access) },
)
export const createConsultationAmendment = (access, patientId, consultationId, amendment) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/amendments/`,
  { method: 'POST', body: JSON.stringify(amendment), headers: authorization(access) },
)

export const listPatients = (access, search = '', page, pageSize, ordering) => {
  const query = new URLSearchParams()
  if (search.trim()) query.set('search', search.trim())
  if (page) query.set('page', page)
  if (pageSize) query.set('page_size', pageSize)
  if (ordering) query.set('ordering', ordering)
  const suffix = query.size ? `?${query.toString().replaceAll('+', '%20')}` : ''
  return apiRequest(`/api/patients/${suffix}`, { headers: authorization(access) })
}

export const listAllPatients = (access, search = '') => collectPaginatedResults(
  (page, pageSize) => listPatients(access, search, page, pageSize),
)

export const searchPatientOptions = (access, search, signal) => {
  const query = new URLSearchParams({ search: search.trim() })
  const suffix = query.toString().replaceAll('+', '%20')
  return apiRequest(`/api/patients/options/?${suffix}`, {
    headers: authorization(access),
    signal,
  })
}

export const checkPatientDuplicates = (access, candidate, excludePatientId = null) => {
  const body = {
    first_name: candidate.first_name || '',
    first_last_name: candidate.first_last_name || '',
    date_of_birth: candidate.date_of_birth || null,
    phone: candidate.phone || '',
  }
  if (excludePatientId !== null && excludePatientId !== undefined) {
    body.exclude_patient_id = Number(excludePatientId)
  }
  return apiRequest('/api/patients/duplicate-check/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: authorization(access),
  })
}

export const listPatientDashboardSummary = (access) => apiRequest(
  '/api/patients/dashboard-summary/',
  { headers: authorization(access) },
)

export const createPatient = (access, patient) => apiRequest('/api/patients/', {
  method: 'POST',
  body: JSON.stringify(patient),
  headers: authorization(access),
})

export const getPatient = (access, id) => apiRequest(`/api/patients/${id}/`, {
  headers: authorization(access),
})

export const listPatientConsultations = (access, id, page, pageSize) => {
  const query = new URLSearchParams()
  if (page) query.set('page', page)
  if (pageSize) query.set('page_size', pageSize)
  const suffix = query.size ? `?${query.toString()}` : ''
  return apiRequest(`/api/patients/${id}/consultations/${suffix}`, {
  headers: authorization(access),
  })
}

export const listPatientConsultationOptions = (access, id) => collectPaginatedResults(
  (page) => apiRequest(
    `/api/patients/${id}/consultations/?compact=true&page_size=100${page > 1 ? `&page=${page}` : ''}`,
    { headers: authorization(access) },
  ),
)

export const listRecentConsultations = (access) => apiRequest('/api/patients/consultations/recent/', {
  headers: authorization(access),
})

export const exportPatientClinicalRecord = (access, id) => apiFileRequest(
  `/api/patients/${id}/clinical-record/export/`,
  { headers: authorization(access) },
)

export const createQuickPatient = (access, patient) => apiRequest('/api/patients/?mode=quick', {
  method: 'POST',
  body: JSON.stringify(patient),
  headers: authorization(access),
})

export const getPatientConsultation = (access, patientId, consultationId) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/`,
  { headers: authorization(access) },
)

export const createPatientConsultation = (access, patientId, consultation) => apiRequest(
  `/api/patients/${patientId}/consultations/`,
  {
    method: 'POST',
    body: JSON.stringify(consultation),
    headers: authorization(access),
  },
)

export const updatePatientConsultation = (access, patientId, consultationId, changes) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/`,
  {
    method: 'PATCH',
    body: JSON.stringify(changes),
    headers: authorization(access),
  },
)

export const completePatientConsultation = (access, patientId, consultationId) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/complete/`,
  {
    method: 'POST',
    headers: authorization(access),
  },
)

export const listConsultationTreatmentItems = (access, patientId, consultationId) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/treatment-items/`,
  { headers: authorization(access) },
)

export const listPatientTreatmentItems = (access, patientId, filters = {}) => {
  const query = new URLSearchParams()
  if (filters.status) query.set('status', filters.status)
  if (filters.scope) query.set('scope', filters.scope)
  if (filters.page) query.set('page', filters.page)
  if (filters.pageSize) query.set('page_size', filters.pageSize)
  const suffix = query.size ? `?${query.toString()}` : ''
  return apiRequest(`/api/patients/${patientId}/treatment-items/${suffix}`, {
    headers: authorization(access),
  })
}

export const createConsultationTreatmentItem = (
  access,
  patientId,
  consultationId,
  treatmentItem,
) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/treatment-items/`,
  {
    method: 'POST',
    body: JSON.stringify(treatmentItem),
    headers: authorization(access),
  },
)

export const updateConsultationTreatmentItem = (
  access,
  patientId,
  consultationId,
  treatmentItemId,
  changes,
) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/treatment-items/${treatmentItemId}/`,
  {
    method: 'PATCH',
    body: JSON.stringify(changes),
    headers: authorization(access),
  },
)

const treatmentItemActionPath = (patientId, consultationId, treatmentItemId, action) => (
  `/api/patients/${patientId}/consultations/${consultationId}/treatment-items/${treatmentItemId}/${action}/`
)

export const acceptConsultationTreatmentItem = (
  access,
  patientId,
  consultationId,
  treatmentItemId,
) => apiRequest(
  treatmentItemActionPath(patientId, consultationId, treatmentItemId, 'accept'),
  { method: 'POST', headers: authorization(access) },
)

export const performConsultationTreatmentItem = (
  access,
  patientId,
  consultationId,
  treatmentItemId,
  performedIn,
  odontogramResult = null,
) => apiRequest(
  treatmentItemActionPath(patientId, consultationId, treatmentItemId, 'perform'),
  {
    method: 'POST',
    body: JSON.stringify({
      performed_in: performedIn,
      ...(odontogramResult ? { odontogram_result: odontogramResult } : {}),
    }),
    headers: authorization(access),
  },
)

export const cancelConsultationTreatmentItem = (
  access,
  patientId,
  consultationId,
  treatmentItemId,
  reason,
) => apiRequest(
  treatmentItemActionPath(patientId, consultationId, treatmentItemId, 'cancel'),
  {
    method: 'POST',
    body: JSON.stringify({ reason }),
    headers: authorization(access),
  },
)

export const getConsultationOdontogram = (access, patientId, consultationId) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/odontogram/`,
  { headers: authorization(access) },
)

export const getPatientPlannedOdontogramOverlay = (access, patientId) => apiRequest(
  `/api/patients/${patientId}/odontogram/planned-overlay/`,
  { headers: authorization(access) },
)

export const createOdontogramVersion = (access, patientId, consultationId, version) => apiRequest(
  `/api/patients/${patientId}/consultations/${consultationId}/odontogram/versions/`,
  {
    method: 'POST',
    body: JSON.stringify(version),
    headers: authorization(access),
  },
)

export const listPatientOdontogramVersions = (access, patientId, page, pageSize) => {
  const query = new URLSearchParams()
  if (page) query.set('page', page)
  if (pageSize) query.set('page_size', pageSize)
  const suffix = query.size ? `?${query.toString()}` : ''
  return apiRequest(
    `/api/patients/${patientId}/odontogram-versions/${suffix}`,
    { headers: authorization(access) },
  )
}

export const getPatientOdontogramVersion = (access, patientId, versionId) => apiRequest(
  `/api/patients/${patientId}/odontogram-versions/${versionId}/`,
  { headers: authorization(access) },
)

export const updatePatient = (access, id, changes) => apiRequest(`/api/patients/${id}/`, {
  method: 'PATCH',
  body: JSON.stringify(changes),
  headers: authorization(access),
})

export const listPatientDocuments = (access, patientId, filters = {}) => {
  const query = new URLSearchParams()
  if (filters.retired) query.set('retired', 'true')
  if (filters.search?.trim()) query.set('search', filters.search.trim())
  if (filters.category?.trim()) query.set('category', filters.category.trim())
  if (filters.consultationId) query.set('consultation_id', filters.consultationId)
  if (filters.page) query.set('page', filters.page)
  if (filters.pageSize) query.set('page_size', filters.pageSize)
  const suffix = query.size ? `?${query.toString().replaceAll('+', '%20')}` : ''
  return apiRequest(`/api/patients/${patientId}/documents/${suffix}`, {
    headers: authorization(access),
  })
}

export const listDocumentCategories = (access) => apiRequest('/api/patients/document-categories/', {
  headers: authorization(access),
})

export const uploadPatientDocuments = (access, patientId, payload) => {
  const body = new FormData()
  payload.files.forEach((file) => body.append('files', file))
  body.append('category', payload.category)
  body.append('document_date', payload.documentDate)
  body.append('notes', payload.notes || '')
  if (payload.consultationId) body.append('consultation_id', payload.consultationId)
  if (payload.toothCode?.trim()) body.append('tooth_code', payload.toothCode.trim())
  return apiRequest(`/api/patients/${patientId}/documents/`, {
    method: 'POST', body, headers: authorization(access),
  })
}

export const getPatientDocumentContent = (access, patientId, documentId, download = false) => (
  apiBlobRequest(
    `/api/patients/${patientId}/documents/${documentId}/content/${download ? '?download=true' : ''}`,
    { headers: authorization(access) },
  )
)

export const deletePatientDocument = (access, patientId, documentId, reason) => apiRequest(
  `/api/patients/${patientId}/documents/${documentId}/`,
  { method: 'DELETE', body: JSON.stringify({ reason }), headers: authorization(access) },
)

export const restorePatientDocument = (access, patientId, documentId) => apiRequest(
  `/api/patients/${patientId}/documents/${documentId}/restore/`,
  { method: 'POST', headers: authorization(access) },
)

export const updatePatientDocument = (access, patientId, documentId, changes) => apiRequest(
  `/api/patients/${patientId}/documents/${documentId}/`,
  {
    method: 'PATCH',
    body: JSON.stringify(changes),
    headers: authorization(access),
  },
)
