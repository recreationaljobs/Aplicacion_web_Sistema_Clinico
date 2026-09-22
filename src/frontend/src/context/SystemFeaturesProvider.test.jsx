import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../services/api'
import { SystemFeaturesContext } from './systemFeaturesValue'

const DEFAULT_FEATURES = {
  demo: false,
  uploads: true,
  password_reset: true,
}

export default function SystemFeaturesProvider({ children }) {
  const [features, setFeatures] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadFeatures = useCallback(async () => {
    const controller = new AbortController()

    setLoading(true)
    setError('')

    try {
      const data = await apiRequest(
        '/api/system/features',
        {
          signal: controller.signal,
        },
      )

      setFeatures({
        demo: Boolean(data?.demo),
        uploads: Boolean(data?.uploads),
        password_reset: Boolean(data?.password_reset),
      })
    } catch (requestError) {
      if (requestError?.name === 'AbortError') {
        return
      }

      setFeatures(null)
      setError(
        requestError?.message ||
          'No pudimos conectar con el servidor. Intenta nuevamente.',
      )
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }

    return () => controller.abort()
  }, [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError('')

      try {
        const data = await apiRequest(
          '/api/system/features',
          {
            signal: controller.signal,
          },
        )

        if (!active) {
          return
        }

        setFeatures({
          demo: Boolean(data?.demo),
          uploads: Boolean(data?.uploads),
          password_reset: Boolean(data?.password_reset),
        })
      } catch (requestError) {
        if (
          !active ||
          requestError?.name === 'AbortError'
        ) {
          return
        }

        setFeatures(null)
        setError(
          requestError?.message ||
            'No pudimos conectar con el servidor. Intenta nuevamente.',
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  const contextValue = useMemo(
    () => ({
      demo:
        features?.demo ??
        DEFAULT_FEATURES.demo,
      uploads:
        features?.uploads ??
        DEFAULT_FEATURES.uploads,
      passwordReset:
        features?.password_reset ??
        DEFAULT_FEATURES.password_reset,
      rawFeatures: features,
    }),
    [features],
  )

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <div className="text-center">
          <span
            aria-hidden="true"
            className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-blue-100 border-t-blue-700"
          />
          <p className="mt-4 text-sm font-medium text-slate-500">
            Cargando configuración…
          </p>
        </div>
      </div>
    )
  }

  if (error || !features) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p
            role="alert"
            className="text-sm font-medium text-red-700"
          >
            No pudimos conectar con el servidor. Intenta nuevamente.
          </p>

          <button
            type="button"
            onClick={loadFeatures}
            className="mt-5 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <SystemFeaturesContext.Provider value={contextValue}>
      {features.demo ? (
        <div
          role="note"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-800"
        >
          Solo datos ficticios. Este entorno es de demostración.
        </div>
      ) : null}

      {children}
    </SystemFeaturesContext.Provider>
  )
}