import { useEffect, useState } from 'react'
import { apiRequest } from '../services/api'
import { SystemFeaturesContext } from './systemFeaturesValue'

export default function SystemFeaturesProvider({ children }) {
  const [features, setFeatures] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 110000)
    apiRequest('/api/system/features/', { signal: controller.signal })
      .then((data) => {
        if (['demo', 'uploads', 'password_reset'].some((key) => typeof data[key] !== 'boolean')) {
          throw new Error('No se pudo verificar la configuración del servidor.')
        }
        if (active) setFeatures(data)
      })
      .catch(() => { if (active) setError('No pudimos conectar con el servidor. Intenta nuevamente.') })
      .finally(() => clearTimeout(timeout))
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [attempt])
  if (!features) return <main className="grid min-h-screen place-content-center gap-4 px-6 text-center">
    <p role="status">{error || 'Conectando con el servidor… La demo puede tardar cerca de un minuto en iniciar.'}</p>
    {error && <button type="button" onClick={() => { setError(''); setAttempt((value) => value + 1) }} className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white">Reintentar</button>}
  </main>
  return <SystemFeaturesContext.Provider value={features}>
    {features.demo && <div role="note" className="sticky top-0 z-50 shrink-0 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950">DEMO · Solo datos ficticios. No ingreses información de pacientes reales. Cargas y recuperación por correo deshabilitadas.</div>}
    {children}
  </SystemFeaturesContext.Provider>
}
