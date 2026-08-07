import {
  createContext,
  useContext,
  useState,
} from 'react'

import Swal from 'sweetalert2'


const AuthContext = createContext(null)

const KEY = 'dentalclinic_session'


const readSession = () => {
  try {
    const localSession =
      localStorage.getItem(KEY)

    if (localSession) {
      return JSON.parse(localSession)
    }

    const temporalSession =
      sessionStorage.getItem(KEY)

    if (temporalSession) {
      return JSON.parse(temporalSession)
    }

    return null
  } catch {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(KEY)

    return null
  }
}


export function AuthProvider({ children }) {
  const [session, setSession] = useState(
    readSession
  )


  const signIn = (
    data,
    remember = false
  ) => {
    const storage = remember
      ? localStorage
      : sessionStorage

    const otherStorage = remember
      ? sessionStorage
      : localStorage


    // Elimina cualquier sesión anterior
    otherStorage.removeItem(KEY)


    // Guarda la nueva sesión
    storage.setItem(
      KEY,
      JSON.stringify(data)
    )


    // Actualiza el estado global
    setSession(data)
  }


  const signOut = async () => {
    const result = await Swal.fire({
      title: '¿Cerrar sesión?',
      text: '¿Estás seguro de que deseas salir del sistema?',
      icon: 'warning',

      showCancelButton: true,

      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar',

      reverseButtons: true,

      allowOutsideClick: false,
      allowEscapeKey: false,
    })


    // Si el usuario cancela, no se elimina la sesión
    if (!result.isConfirmed) {
      return false
    }


    // Eliminar sesión persistente
    localStorage.removeItem(KEY)


    // Eliminar sesión temporal
    sessionStorage.removeItem(KEY)


    // Limpiar estado global
    setSession(null)


    // Confirmar cierre de sesión
    await Swal.fire({
      title: 'Sesión cerrada',
      text: 'Has cerrado sesión correctamente.',
      icon: 'success',

      confirmButtonText: 'Aceptar',

      allowOutsideClick: false,
      allowEscapeKey: false,
    })


    return true
  }


  return (
    <AuthContext.Provider
      value={{
        user:
          session?.user ?? null,

        accessToken:
          session?.access ?? null,

        refreshToken:
          session?.refresh ?? null,

        isAuthenticated:
          Boolean(session?.access),

        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}


export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error(
      'useAuth debe utilizarse dentro de AuthProvider.'
    )
  }

  return value
}