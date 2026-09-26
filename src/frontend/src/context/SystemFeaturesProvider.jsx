import { useEffect, useState } from 'react'
import { apiRequest } from '../services/api'
import { SystemFeaturesContext } from './systemFeaturesValue'

export default function SystemFeaturesProvider({ children }) {
  const [features, setFeatures] = useState({
    demo: false,
    uploads: true,
    password_reset: true,
  })

  useEffect(() => {
    let active = true

    const controller = new AbortController()

    const timeout = setTimeout(
      () => controller.abort(),
      10000
    )

    apiRequest(
      '/api/system/features/',
      {
        signal: controller.signal,
      }
    )
      .then((data) => {
        const valid = [
          'demo',
          'uploads',
          'password_reset',
        ].every(
          (key) =>
            typeof data[key] === 'boolean'
        )

        if (!valid) {
          throw new Error(
            'No se pudo verificar la configuración del servidor.'
          )
        }

        if (active) {
          setFeatures(data)
        }
      })
      .catch(() => {
        /*
         * No bloqueamos la aplicación.
         * Si el servidor tarda o falla,
         * se mantienen los valores iniciales
         * y el login aparece inmediatamente.
         */
      })
      .finally(() => {
        clearTimeout(timeout)
      })

    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  return (
    <SystemFeaturesContext.Provider
      value={features}
    >
      {features.demo && (
        <div
          role="note"
          className="
            sticky top-0 z-50
            shrink-0
            bg-amber-100
            px-4 py-2
            text-center
            text-sm
            font-semibold
            text-amber-950
          "
        >
          DEMO · Solo datos ficticios.
          No ingreses información de pacientes reales.
          Cargas y recuperación por correo deshabilitadas.
        </div>
      )}

      {children}
    </SystemFeaturesContext.Provider>
  )
}