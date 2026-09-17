import { apiRequest } from './api'
import { collectPaginatedResults } from './pagination'

const authorization = (access) => ({ Authorization: `Bearer ${access}` })

const queryString = (params) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) query.set(key, value)
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}

export const listAppointments = (access, filters = {}) => apiRequest(
  `/api/appointments/${queryString(filters)}`,
  { headers: authorization(access) },
)

export const listAllAppointments = (access, filters = {}) => collectPaginatedResults(
  (page, pageSize) => listAppointments(access, { ...filters, page, page_size: pageSize }),
)

export const getAppointment = (access, id) => apiRequest(`/api/appointments/${id}/`, {
  headers: authorization(access),
})

export const createAppointment = (access, appointment) => apiRequest('/api/appointments/', {
  method: 'POST',
  body: JSON.stringify(appointment),
  headers: authorization(access),
})

export const updateAppointment = (access, id, changes) => apiRequest(`/api/appointments/${id}/`, {
  method: 'PATCH',
  body: JSON.stringify(changes),
  headers: authorization(access),
})

export const startAppointmentAttendance = (access, id) => apiRequest(
  `/api/appointments/${id}/start-attendance/`,
  {
    method: 'POST',
    headers: authorization(access),
  },
)

export const checkInAppointment = (access, id) => apiRequest(
  `/api/appointments/${id}/check-in/`,
  {
    method: 'POST',
    headers: authorization(access),
  },
)

export const listAppointmentReschedules = (access, id) => collectPaginatedResults(
  (page, pageSize) => apiRequest(
    `/api/appointments/${id}/reschedule-history/${queryString({ page, page_size: pageSize })}`,
    { headers: authorization(access) },
  ),
)

export const undoCheckInAppointment = (access, id, correction) => apiRequest(
  `/api/appointments/${id}/undo-check-in/`,
  { method: 'POST', body: JSON.stringify(correction), headers: authorization(access) },
)

export const getAvailableDentists = (access, values) => apiRequest(
  `/api/appointments/dentists/availability/${queryString({
    date: values.date,
    start_time: values.startTime,
    duration_minutes: values.durationMinutes,
    exclude_id: values.excludeId,
  })}`,
  { headers: authorization(access) },
)
