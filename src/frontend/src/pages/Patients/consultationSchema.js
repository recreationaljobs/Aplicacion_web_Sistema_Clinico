export const consultationTypes = [
  ['VALORACION_INICIAL', 'Valoración inicial'],
  ['GENERAL', 'Consulta general'],
  ['SEGUIMIENTO', 'Seguimiento'],
  ['URGENCIA', 'Urgencia'],
]

export const consultationStatuses = [
  ['EN_PROGRESO', 'En progreso'],
  ['COMPLETADA', 'Completada'],
  ['CANCELADA', 'Cancelada'],
]

export const generalFields = [
  { label: 'N.º de cédula del doctor', field: 'examiner_national_id' },
  { label: 'Fecha', field: 'date', type: 'date', required: true },
  { label: 'Hora', field: 'time', type: 'time', required: true },
  { label: 'Servicio odontológico', field: 'dental_service' },
  { label: 'Tipo', field: 'consultation_type', type: 'select', options: consultationTypes, required: true },
  { label: 'Estado', field: 'status', type: 'select', options: consultationStatuses, required: true },
  { label: 'Resumen', field: 'summary', type: 'textarea', required: true },
]

export const systemsFields = [
  ['Respiratorio', 'respiratory'], ['Cardiovascular', 'cardiovascular'],
  ['Hepático y renal', 'hepatic_renal'], ['Gastrointestinal', 'gastrointestinal'],
  ['Neurológico', 'neurological'], ['Sistema sanguíneo', 'blood_system'],
  ['Órganos reproductivos', 'reproductive_organs'],
].map(([label, field]) => ({ label, field, type: 'checkbox' }))

export const vitalFields = [
  ['Frecuencia cardíaca', 'heart_rate'], ['Frecuencia respiratoria', 'respiratory_rate'],
  ['Presión arterial', 'blood_pressure'], ['Temperatura', 'temperature'],
  ['Peso', 'weight'], ['Talla', 'height'], ['Área de superficie corporal', 'body_surface_area'],
  ['IMC', 'bmi'],
].map(([label, field]) => ({ label, field, type: field === 'blood_pressure' ? 'text' : 'number' }))

export const examinationFields = [
  ['Aspecto general', 'general_appearance'], ['Piel y mucosas', 'skin_and_mucosa'],
].map(([label, field]) => ({ label, field, type: 'textarea' }))

export const narrativeCards = [
  ['Motivo de consulta', 'Motivo de consulta', 'chief_complaint'],
  ['Diagnósticos o problemas odontológicos', 'Diagnóstico / problemas odontológicos', 'dental_diagnoses'],
  ['Plan de tratamiento odontológico', 'Plan de tratamiento', 'treatment_plan'],
  ['Presupuesto', 'Presupuesto / descripción', 'budget'],
]

export const numericConsultationFields = new Set([
  'heart_rate', 'respiratory_rate', 'temperature', 'weight', 'height', 'body_surface_area', 'bmi',
])

const booleanConsultationFields = new Set(systemsFields.map(({ field }) => field))

export const editableConsultationFields = [
  ...generalFields.map(({ field }) => field),
  'chief_complaint',
  ...systemsFields.map(({ field }) => field),
  ...vitalFields.map(({ field }) => field),
  ...examinationFields.map(({ field }) => field),
  'dental_diagnoses', 'treatment_plan', 'budget',
]

function localDateAndTime() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
}

export function makeEmptyConsultationForm() {
  const current = localDateAndTime()
  return {
    ...Object.fromEntries(editableConsultationFields.map((field) => [field, booleanConsultationFields.has(field) ? false : ''])),
    ...current,
    status: 'EN_PROGRESO',
  }
}

export function consultationToForm(consultation) {
  const empty = makeEmptyConsultationForm()
  for (const field of editableConsultationFields) {
    empty[field] = consultation?.[field] ?? empty[field]
  }
  if (empty.time) empty.time = String(empty.time).slice(0, 5)
  return empty
}

export function consultationPayload(form) {
  return Object.fromEntries(editableConsultationFields.map((field) => [
    field,
    numericConsultationFields.has(field) && form[field] === '' ? null : form[field],
  ]))
}

export function consultationTitle(consultation) {
  return consultation?.consultation_type_display || 'Consulta clínica'
}
