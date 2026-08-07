const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000'


export async function apiRequest(path, options = {}) {
  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...options,

      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }
  )

  const data = await response
    .json()
    .catch(() => ({}))

  if (!response.ok) {
    let message = 'Ocurrió un error al procesar la solicitud.'

    if (typeof data.detail === 'string') {
      message = data.detail
    } else if (Array.isArray(data.detail)) {
      message = data.detail[0]
    } else if (data.non_field_errors) {
      message = Array.isArray(data.non_field_errors)
        ? data.non_field_errors[0]
        : data.non_field_errors
    } else if (data.username) {
      message = Array.isArray(data.username)
        ? data.username[0]
        : data.username
    } else if (data.password) {
      message = Array.isArray(data.password)
        ? data.password[0]
        : data.password
    }

    throw new Error(message)
  }

  return data
}