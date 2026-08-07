import {
  createContext,
  useContext,
  useState,
} from 'react'

import Swal from 'sweetalert2'

import {
  logout,
} from '../services/authService'


const AuthContext = createContext(null)

const KEY = 'dentalclinic_session'


const readSession = () => {
  try {
    const localSession =
      localStorage.getItem(KEY)

    if (localSession) {
      return JSON.parse(
        localSession
      )
    }

    const temporalSession =
      sessionStorage.getItem(KEY)

    if (temporalSession) {
      return JSON.parse(
        temporalSession
      )
    }

    return null
  } catch {
    localStorage.removeItem(KEY)

    sessionStorage.removeItem(KEY)

    return null
  }
}


export function AuthProvider({
  children,
}) {
  const [session, setSession] =
    useState(readSession)


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


    // Eliminar cualquier sesión anterior
    otherStorage.removeItem(KEY)


    // Guardar nueva sesión
    storage.setItem(
      KEY,
      JSON.stringify(data)
    )


    // Actualizar estado global
    setSession(data)
  }


  const signOut = async () => {
    /*
     * Primero preguntamos.
     *
     * Todavía NO eliminamos tokens.
     */
    const result = await Swal.fire({
      title: '¿Cerrar sesión?',

      text:
        '¿Estás seguro de que deseas salir del sistema?',

      icon: 'warning',

      showCancelButton: true,

      confirmButtonText:
        'Sí, cerrar sesión',

      cancelButtonText:
        'Cancelar',

      reverseButtons: true,

      allowOutsideClick: false,

      allowEscapeKey: false,
    })


    /*
     * Si cancela, permanece dentro
     * y los tokens siguen intactos.
     */
    if (!result.isConfirmed) {
      return false
    }


    try {
      /*
       * Mandamos el refresh token
       * al backend para invalidarlo.
       */
      if (
        session?.refresh &&
        session?.access
      ) {
        await logout(
          session.refresh,
          session.access
        )
      }
    } catch (error) {
      /*
       * Si Django no puede invalidar
       * el token, mostramos el error
       * y NO cerramos automáticamente.
       */
      await Swal.fire({
        title:
          'No se pudo cerrar la sesión',

        text:
          error?.message ||
          (
            'No fue posible invalidar ' +
            'la sesión en el servidor.'
          ),

        icon: 'error',

        confirmButtonText: 'Aceptar',

        allowOutsideClick: false,

        allowEscapeKey: false,
      })

      return false
    }


    /*
     * El backend ya invalidó
     * correctamente el refresh token.
     */

    localStorage.removeItem(KEY)

    sessionStorage.removeItem(KEY)

    setSession(null)


    await Swal.fire({
      title: 'Sesión cerrada',

      text:
        'Has cerrado sesión correctamente.',

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
          Boolean(
            session?.access
          ),

        signIn,

        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}


export function useAuth() {
  const value =
    useContext(AuthContext)

  if (!value) {
    throw new Error(
      'useAuth debe utilizarse ' +
      'dentro de AuthProvider.'
    )
  }

  return value
}