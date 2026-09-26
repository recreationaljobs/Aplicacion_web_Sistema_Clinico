import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { AuthProvider } from '../../context/AuthContext'
import * as authService from '../../services/authService'

vi.mock('../../services/authService')

const patient = {
  id: 1,
  code: 'PAC-00001',
  first_name: 'María',
  last_name: 'García',
  full_name: 'María García',
  gender: 'FEMENINO',
  date_of_birth: '1998-04-16',
  national_id: '001-160498-0001A',
  is_active: true,
}

const consultation = {
  id: 12,
  patient: 1,
  date: '2026-08-09',
  time: '09:30:00',
  consultation_type: 'GENERAL',
  consultation_type_display: 'Consulta general',
  professional: 3,
  professional_name: 'Dra. Elena Rivera',
  summary: 'Valoración odontológica.',
  status: 'EN_PROGRESO',
  status_display: 'En progreso',
}

const initialVersion = {
  id: 41,
  patient: 1,
  consultation: 12,
  consultation_date: '2026-08-09',
  consultation_type: 'GENERAL',
  consultation_type_display: 'Consulta general',
  version_number: 1,
  schema_version: 1,
  dentition: 'PERMANENT',
  teeth: {},
  changed_teeth: [],
  note: '',
  based_on: null,
  created_by: 3,
  professional_name: 'Dra. Elena Rivera',
  created_at: '2026-08-09T15:30:00Z',
}

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
})

function renderAt(path, role = 'ODONTOLOGO') {
  const permissions = role === 'RECEPCIONISTA'
    ? ['patients.view', 'consultations.view']
    : ['patients.view', 'consultations.view', 'consultations.create', 'consultations.edit']
  const initialSession = {
    access: 'access-token',
    refresh: 'refresh-token',
    user: { email: 'clinico@example.com', first_name: 'Elena', role, permissions },
  }
  const router = createMemoryRouter([{
    path: '*',
    element: <AuthProvider initialSession={initialSession}><App /></AuthProvider>,
  }], { initialEntries: [path] })
  return { ...render(<RouterProvider router={router} />), router }
}

function baseFetch(url, options = {}) {
  if (url.endsWith('/api/patients/1/consultations/12/odontogram/')) {
    return Promise.resolve(jsonResponse(initialVersion))
  }
  if (url.endsWith('/api/patients/1/odontogram/planned-overlay/')) {
    return Promise.resolve(jsonResponse([]))
  }
  if (url.endsWith('/api/patients/1/consultations/12/')) {
    return Promise.resolve(jsonResponse(consultation))
  }
  if (url.endsWith('/api/patients/1/consultations/12/treatment-items/')) {
    return Promise.resolve(jsonResponse([]))
  }
  if (url.includes('/api/clinics/services/?active=true')) {
    return Promise.resolve(jsonResponse([]))
  }
  if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patient))
  throw new Error(`Unexpected request: ${url} ${options.method || 'GET'}`)
}

describe('versioned odontograms', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    authService.logout.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens the consultation odontogram from the contextual navigation', async () => {
    vi.stubGlobal('fetch', vi.fn(baseFetch))
    renderAt('/pacientes/1/consultas/12')

    expect(await screen.findByRole('link', { name: 'Odontograma de la consulta' })).toHaveAttribute(
      'href',
      '/pacientes/1/consultas/12/odontograma',
    )
  })

  it('disables the odontogram until a new consultation is saved', async () => {
    vi.stubGlobal('fetch', vi.fn(baseFetch))
    renderAt('/pacientes/1/consultas/nueva', 'ADMINISTRADOR')

    expect(await screen.findByRole('button', { name: 'Odontograma de la consulta' })).toBeDisabled()
    expect(screen.getByText('Guarda la consulta para abrir el odontograma')).toBeInTheDocument()
  })

  it('edits a tooth surface and saves a new immutable version', async () => {
    let posted = null
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/odontogram/versions/') && options.method === 'POST') {
        posted = JSON.parse(options.body)
        return Promise.resolve(jsonResponse({
          ...initialVersion,
          id: 42,
          version_number: 2,
          based_on: 41,
          changed_teeth: ['14'],
          teeth: posted.teeth,
        }, 201))
      }
      return baseFetch(url, options)
    }))
    renderAt('/pacientes/1/consultas/12/odontograma')

    expect(await screen.findByRole('heading', { name: 'Odontograma clínico' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Caries' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pieza 14, superficie mesial' }))
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(posted).not.toBeNull())
    expect(posted.base_version_id).toBe(41)
    expect(posted.teeth['14'].current.surfaces.MESIAL).toEqual(['CARIES'])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument())
    expect(screen.getByText('Versión 2')).toBeInTheDocument()
  }, 10_000)

  it('keeps the odontogram read-only without consultation edit permission', async () => {
    vi.stubGlobal('fetch', vi.fn(baseFetch))
    renderAt('/pacientes/1/consultas/12/odontograma', 'RECEPCIONISTA')

    expect(await screen.findByRole('heading', { name: 'Odontograma clínico' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Caries' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
  })

  it('renders the structured plan as a read-only overlay and preserves duplicate details', async () => {
    let postCount = 0
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/odontogram/planned-overlay/')) {
        return Promise.resolve(jsonResponse([
          { treatment_item_id: 5, status: 'PROPUESTO', status_display: 'Propuesto', tooth_code: '14', surfaces: ['MESIAL'], planned_finding: 'RESTORATION', description: 'Primera restauración', proposed_in: { id: 8, date: '2026-08-01' } },
          { treatment_item_id: 9, status: 'ACEPTADO', status_display: 'Aceptado', tooth_code: '14', surfaces: ['MESIAL'], planned_finding: 'RESTORATION', description: 'Segunda restauración', proposed_in: { id: 12, date: '2026-08-09' } },
        ]))
      }
      if (url.endsWith('/odontogram/versions/') && options.method === 'POST') {
        postCount += 1
      }
      return baseFetch(url, options)
    }))
    renderAt('/pacientes/1/consultas/12/odontograma')

    await screen.findByRole('heading', { name: 'Odontograma clínico' })
    fireEvent.click(screen.getByRole('button', { name: 'Plan de tratamiento' }))
    fireEvent.click(screen.getByRole('button', { name: '14' }))

    expect(screen.getByText('Primera restauración')).toBeInTheDocument()
    expect(screen.getByText('Segunda restauración')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restauración' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(postCount).toBe(0)
  }, 10_000)

  it('keeps the core odontogram available when the planned overlay fails', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/api/patients/1/odontogram/planned-overlay/')) {
        return Promise.reject(new Error('Overlay temporalmente no disponible'))
      }
      return baseFetch(url, options)
    }))
    renderAt('/pacientes/1/consultas/12/odontograma')

    expect(await screen.findByRole('heading', { name: 'Odontograma clínico' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Overlay temporalmente no disponible')
  })

  it('preserves the draft after a concurrent change and can load the latest version', async () => {
    let latest = initialVersion
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      if (url.endsWith('/odontogram/versions/') && options.method === 'POST') {
        latest = { ...initialVersion, id: 42, version_number: 2 }
        return Promise.resolve(jsonResponse({
          detail: 'El odontograma cambió desde que lo abriste.',
          current_version_id: 42,
        }, 409))
      }
      if (url.endsWith('/api/patients/1/consultations/12/odontogram/')) {
        return Promise.resolve(jsonResponse(latest))
      }
      return baseFetch(url, options)
    }))
    renderAt('/pacientes/1/consultas/12/odontograma')

    await screen.findByRole('heading', { name: 'Odontograma clínico' })
    fireEvent.click(screen.getByRole('button', { name: 'Caries' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pieza 14, superficie mesial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El odontograma cambió desde que lo abriste.')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar última versión' }))
    expect(await screen.findByText('Versión 2')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument())
  }, 10_000)

  it('shows the patient timeline and compares arbitrary versions', async () => {
    const secondVersion = {
      ...initialVersion,
      id: 42,
      version_number: 2,
      based_on: 41,
      changed_teeth: ['14'],
      note: 'Control de caries.',
      teeth: {
        '14': {
          reviewed: true,
          note: '',
          current: { whole: [], surfaces: { MESIAL: ['CARIES'] } },
          planned: { whole: [], surfaces: {} },
        },
      },
    }
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/odontogram-versions/')) {
        const { teeth: _firstTeeth, ...firstSummary } = initialVersion
        const { teeth: _secondTeeth, ...secondSummary } = secondVersion
        return Promise.resolve(jsonResponse([secondSummary, firstSummary]))
      }
      if (url.endsWith('/api/patients/1/odontogram-versions/41/')) return Promise.resolve(jsonResponse(initialVersion))
      if (url.endsWith('/api/patients/1/odontogram-versions/42/')) return Promise.resolve(jsonResponse(secondVersion))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patient))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAt('/pacientes/1/odontogramas')

    expect(await screen.findByRole('heading', { name: 'Histórico de odontogramas' })).toBeInTheDocument()
    expect(screen.getByText('Control de caries.')).toBeInTheDocument()
    expect(screen.getByLabelText('Versión A')).toHaveValue('41')
    expect(screen.getByLabelText('Versión B')).toHaveValue('42')
    expect(await screen.findByText('Pieza 14: hallazgo agregado')).toBeInTheDocument()
  })

  it('coalesces comparison scroll to the latest frame without changing versions or looping', async () => {
    const secondVersion = {
      ...initialVersion,
      id: 42,
      version_number: 2,
      based_on: 41,
      changed_teeth: ['14'],
    }
    const frames = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/odontogram-versions/')) {
        const { teeth: _firstTeeth, ...firstSummary } = initialVersion
        const { teeth: _secondTeeth, ...secondSummary } = secondVersion
        return Promise.resolve(jsonResponse([secondSummary, firstSummary]))
      }
      if (url.endsWith('/api/patients/1/odontogram-versions/41/')) return Promise.resolve(jsonResponse(initialVersion))
      if (url.endsWith('/api/patients/1/odontogram-versions/42/')) return Promise.resolve(jsonResponse(secondVersion))
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patient))
      throw new Error(`Unexpected request: ${url}`)
    }))
    renderAt('/pacientes/1/odontogramas')

    const chartA = await screen.findByRole('region', { name: 'Versión A: odontograma' })
    const chartB = screen.getByRole('region', { name: 'Versión B: odontograma' })
    const scheduledBeforeScroll = requestAnimationFrame.mock.calls.length

    chartA.scrollLeft = 120
    fireEvent.scroll(chartA)
    chartA.scrollLeft = 260
    fireEvent.scroll(chartA)

    expect(chartB.scrollLeft).toBe(0)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(scheduledBeforeScroll + 1)
    frames[scheduledBeforeScroll](16)
    expect(chartB.scrollLeft).toBe(260)

    fireEvent.scroll(chartB)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(scheduledBeforeScroll + 1)
    expect(screen.getByLabelText('Versión A')).toHaveValue('41')
    expect(screen.getByLabelText('Versión B')).toHaveValue('42')
  })

  it('pages the odontogram timeline without downloading the complete history', async () => {
    const pageOne = Array.from({ length: 25 }, (_, index) => ({
      ...initialVersion,
      id: 100 + index,
      version_number: 26 - index,
      changed_teeth: [],
      note: `Control ${26 - index}`,
    }))
    const oldest = { ...initialVersion, id: 75, version_number: 1, note: 'Primera evaluación' }

    vi.stubGlobal('fetch', vi.fn((url) => {
      if (url.endsWith('/api/patients/1/odontogram-versions/')) {
        return Promise.resolve(jsonResponse({ count: 26, next: 'page=2', previous: null, results: pageOne }))
      }
      if (url.endsWith('/api/patients/1/odontogram-versions/?page=2')) {
        return Promise.resolve(jsonResponse({ count: 26, next: null, previous: 'page=1', results: [oldest] }))
      }
      if (/\/api\/patients\/1\/odontogram-versions\/\d+\/$/.test(url)) {
        const id = Number(url.match(/(\d+)\/$/)[1])
        return Promise.resolve(jsonResponse(id === oldest.id ? oldest : pageOne.find((item) => item.id === id)))
      }
      if (url.endsWith('/api/patients/1/')) return Promise.resolve(jsonResponse(patient))
      throw new Error(`Unexpected request: ${url}`)
    }))

    renderAt('/pacientes/1/odontogramas')

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente de odontogramas' }))
    expect(await screen.findByText('Primera evaluación')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()
  })
})
