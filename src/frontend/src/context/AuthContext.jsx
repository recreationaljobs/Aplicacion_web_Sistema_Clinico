import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getCurrentSessionUser,
  logout as revokeSession,
  restoreSession,
} from '../services/authService'
import {
  clearAccessToken,
  setAccessToken,
  setForbiddenHandler,
  setSessionExpiredHandler,
  setAccessTokenChangeHandler
} from '../services/api'
import { AuthContext } from './authContextValue'

export function AuthProvider({ children, initialSession }) {
  const hasInitialSession = initialSession !== undefined
  const [session, setSession] = useState(initialSession ?? null)
  const [initializing, setInitializing] = useState(!hasInitialSession)
  const revalidationRef = useRef(null)

  useEffect(() => {
    if (hasInitialSession) {
      setAccessToken(initialSession?.access)
      return undefined
    }
    let active = true
    restoreSession()
      .then((restored) => {
        if (active) setSession(restored)
      })
      .catch(() => {
        clearAccessToken()
        if (active) setSession(null)
      })
      .finally(() => {
        if (active) setInitializing(false)
      })
    return () => { active = false }
  }, [hasInitialSession, initialSession])

  useEffect(() => {
    setSessionExpiredHandler(() => setSession(null))
    return () => setSessionExpiredHandler(null)
  }, [])


  useEffect(() => {
  setAccessTokenChangeHandler(
    (newAccess) => {
      setSession((current) => {
        if (!current) {
          return current
        }

        if (!newAccess) {
          return null
        }

        return {
          ...current,
          access: newAccess,
        }
      })
    }
  )

  return () => {
    setAccessTokenChangeHandler(null)
  }
}, [])

  const revalidateUser = useCallback(() => {
    const access = session?.access
    if (!access) return Promise.resolve(null)
    if (revalidationRef.current?.access === access) {
      return revalidationRef.current.promise
    }
    const promise = getCurrentSessionUser(access)
      .then((user) => {
        setSession((current) => (
          current?.access === access ? { ...current, user } : current
        ))
        return user
      })
      .finally(() => {
        if (revalidationRef.current?.promise === promise) {
          revalidationRef.current = null
        }
      })
    revalidationRef.current = { access, promise }
    return promise
  }, [session?.access])

  useEffect(() => {
    const refreshCapabilities = () => { revalidateUser().catch(() => {}) }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshCapabilities()
    }
    setForbiddenHandler(refreshCapabilities)
    window.addEventListener('focus', refreshCapabilities)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      setForbiddenHandler(null)
      window.removeEventListener('focus', refreshCapabilities)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [revalidateUser])

  const signIn = useCallback((data) => {
    setAccessToken(data.access)
    setSession(data)
    setInitializing(false)
  }, [])

  const signOut = useCallback(async ({ revoke = true } = {}) => {
    const access = session?.access
    clearAccessToken()
    setSession(null)
    try {
      if (revoke) await revokeSession({ access })
    } catch {
      // La sesión local se cierra aunque la API no esté disponible.
    } finally {
      clearAccessToken()
      setSession(null)
    }
  }, [session?.access])

  const updateUser = useCallback((user) => {
    setSession((current) => current ? { ...current, user } : current)
  }, [])

  return (
    <AuthContext.Provider value={{
      user: session?.user,
      accessToken: session?.access,
      initializing,
      signIn,
      signOut,
      updateUser,
      revalidateUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
