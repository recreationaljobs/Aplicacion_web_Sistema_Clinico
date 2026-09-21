import {
  apiRequest,
  csrfRequest,
  refreshAccessToken,
  setAccessToken,
} from './api'


export const LOGOUT_PENDING_KEY =
  'dentalclinic.logoutPending'


let logoutPending = false


function setLogoutPending(
  pending
) {
  logoutPending = pending

  try {
    if (pending) {
      localStorage.setItem(
        LOGOUT_PENDING_KEY,
        '1',
      )
    } else {
      localStorage.removeItem(
        LOGOUT_PENDING_KEY,
      )
    }

  } catch {
    /*
     * Memory fallback para
     * navegadores que no permiten
     * almacenamiento local.
     */
  }
}


function hasPendingLogout() {
  try {
    return (
      logoutPending ||
      localStorage.getItem(
        LOGOUT_PENDING_KEY
      ) === '1'
    )

  } catch {
    return logoutPending
  }
}


export async function login(
  credentials
) {
  const session = await csrfRequest(
    '/api/auth/login/',
    {
      method: 'POST',

      body:
        JSON.stringify(
          credentials
        ),
    }
  )

  setAccessToken(
    session.access
  )

  setLogoutPending(
    false
  )

  return session
}


export async function logout({
  access,
} = {}) {
  setLogoutPending(
    true
  )

  await csrfRequest(
    '/api/auth/logout/',
    {
      method: 'POST',

      body:
        JSON.stringify({}),

      ...(
        access
          ? {
              headers: {
                Authorization:
                  `Bearer ${access}`,
              },
            }
          : {}
      ),
    }
  )

  setLogoutPending(
    false
  )
}


export async function restoreSession() {
  if (
    hasPendingLogout()
  ) {
    await logout()

    return null
  }

  const access = (
    await refreshAccessToken()
  )

  const user = (
    await getCurrentSessionUser(
      access
    )
  )

  return {
    access,
    user,
  }
}


export const getCurrentSessionUser = (
  access
) => apiRequest(
  '/api/auth/me/',
  {
    headers: {
      Authorization:
        `Bearer ${access}`,
    },
  }
)


export const requestPasswordReset = ({
  email,
}) => apiRequest(
  '/api/auth/password-reset/',
  {
    method: 'POST',

    body:
      JSON.stringify({
        email,
      }),
  }
)


export const confirmPasswordReset = (
  payload
) => apiRequest(
  '/api/auth/password-reset/confirm/',
  {
    method: 'POST',

    body:
      JSON.stringify(
        payload
      ),
  }
)


export const changePassword = ({
  access,
  ...passwords
}) => apiRequest(
  '/api/auth/password-change/',
  {
    method: 'POST',

    body:
      JSON.stringify(
        passwords
      ),

    headers: {
      Authorization:
        `Bearer ${access}`,
    },
  }
)