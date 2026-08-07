import { apiRequest } from './api'


export const login = (credentials) =>
  apiRequest(
    '/api/auth/login/',
    {
      method: 'POST',

      body: JSON.stringify(
        credentials
      ),
    }
  )


export const logout = (
  refreshToken,
  accessToken
) =>
  apiRequest(
    '/api/auth/logout/',
    {
      method: 'POST',

      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },

      body: JSON.stringify({
        refresh: refreshToken,
      }),
    }
  )