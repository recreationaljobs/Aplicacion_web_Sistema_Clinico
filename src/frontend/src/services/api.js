export function resolveApiUrl({
  configured,
  isDevelopment,
  location,
}) {
  if (configured?.trim() === '/') {
    return ''
  }

  const explicitUrl = configured
    ?.trim()
    .replace(/\/+$/, '')

  if (explicitUrl) {
    return explicitUrl
  }

  if (!isDevelopment) {
    throw new Error(
      'VITE_API_URL es obligatoria para el build de producción.',
    )
  }

  if (!location) {
    return 'http://127.0.0.1:8000'
  }

  return `${location.protocol}//${location.hostname}:8000`
}


const API_URL = resolveApiUrl({
  configured: import.meta.env.VITE_API_URL,
  isDevelopment: import.meta.env.DEV,
  location:
    typeof window === 'undefined'
      ? null
      : window.location,
})


let accessToken = null
let refreshPromise = null
let sessionExpiredHandler = null
let forbiddenHandler = null
let sessionGeneration = 0


/*
 * Desarrollo:
 *   Frontend -> Django directamente.
 *
 * Producción en Vercel:
 *
 *   Rutas específicas:
 *   /api/system/features
 *   /api/auth/csrf
 *   /api/auth/login
 *
 *   El resto:
 *   /api/proxy?target=...
 *
 * De esta forma evitamos que las rutas Django
 * terminen siendo atendidas por index.html de React.
 */
function requestUrl(path) {
  const rawPath = path.startsWith('/')
    ? path
    : `/${path}`

  /*
   * Si existe una URL explícita de backend,
   * por ejemplo en desarrollo local,
   * conservamos las rutas Django originales.
   */
  if (API_URL) {
    return `${API_URL}${rawPath}`
  }

  const questionIndex =
    rawPath.indexOf('?')

  const pathname =
    questionIndex === -1
      ? rawPath
      : rawPath.slice(
          0,
          questionIndex,
        )

  const query =
    questionIndex === -1
      ? ''
      : rawPath.slice(
          questionIndex,
        )

  /*
   * Vercel Functions no están resolviendo
   * correctamente las rutas con "/" final.
   */
  const normalizedPath =
    pathname.length > 1
      ? pathname.replace(
          /\/+$/,
          '',
        )
      : pathname

  const normalizedTarget =
    `${normalizedPath}${query}`

  /*
   * Estas rutas tienen Functions específicas.
   */
  const directVercelFunctions =
    new Set([
      '/api/system/features',
      '/api/auth/csrf',
      '/api/auth/login',
    ])

  if (
    directVercelFunctions.has(
      normalizedPath,
    )
  ) {
    return normalizedTarget
  }

  /*
   * Todas las demás peticiones pasan
   * por src/frontend/api/proxy.js
   */
  return (
    '/api/proxy?target=' +
    encodeURIComponent(
      normalizedTarget,
    )
  )
}


export function setAccessToken(
  token,
) {
  accessToken = token || null
  sessionGeneration += 1
}


export function clearAccessToken() {
  accessToken = null
  sessionGeneration += 1
}


export function setSessionExpiredHandler(
  handler,
) {
  sessionExpiredHandler = handler
}


export function setForbiddenHandler(
  handler,
) {
  forbiddenHandler = handler
}


function firstError(value) {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message =
        firstError(item)

      if (message) {
        return message
      }
    }
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    for (
      const item
      of Object.values(value)
    ) {
      const message =
        firstError(item)

      if (message) {
        return message
      }
    }
  }

  return ''
}


function errorMessage(data) {
  if (
    Array.isArray(data?.detail)
  ) {
    return data.detail[0]
  }

  if (
    typeof data?.detail ===
    'string'
  ) {
    return data.detail
  }

  return (
    firstError(data) ||
    'No fue posible procesar la solicitud.'
  )
}


function csrfTokenFromCookie() {
  if (
    typeof document ===
    'undefined'
  ) {
    return ''
  }

  const cookie =
    document.cookie
      .split('; ')
      .find((item) =>
        item.startsWith(
          'csrftoken=',
        ),
      )

  return cookie
    ? decodeURIComponent(
        cookie
          .split('=')
          .slice(1)
          .join('='),
      )
    : ''
}


export async function ensureCsrfCookie() {
  const response = await fetch(
    requestUrl(
      '/api/auth/csrf/',
    ),
    {
      method: 'GET',

      credentials:
        'include',

      headers: {
        Accept:
          'application/json',
      },
    },
  )

  const data =
    await response
      .json()
      .catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      errorMessage(data) ||
        'No fue posible inicializar la protección CSRF.',
    )
  }

  const token =
    data.csrfToken ||
    csrfTokenFromCookie()

  if (!token) {
    throw new Error(
      'El servidor no devolvió el token CSRF.',
    )
  }

  return token
}


export async function csrfRequest(
  path,
  options = {},
) {
  const csrf =
    await ensureCsrfCookie()

  return apiRequest(
    path,
    {
      ...options,

      credentials:
        'include',

      headers: {
        ...options.headers,

        'X-CSRFToken':
          csrf,
      },
    },
  )
}


async function authenticatedResponse(
  path,
  options = {},
) {
  const {
    _retried,
    ...requestOptions
  } = options

  const isProtected =
    Boolean(
      options.headers
        ?.Authorization,
    )

  const contentHeaders =
    options.body instanceof FormData
      ? {}
      : {
          'Content-Type':
            'application/json',
        }

  const response =
    await fetch(
      requestUrl(path),
      {
        ...requestOptions,

        credentials:
          options.credentials ||
          'include',

        headers: {
          ...contentHeaders,

          ...options.headers,

          ...(
            isProtected &&
            accessToken
              ? {
                  Authorization:
                    `Bearer ${accessToken}`,
                }
              : {}
          ),
        },
      },
    )

  if (
    response.status === 401 &&
    isProtected &&
    !_retried
  ) {
    const renewedAccess =
      await refreshAccessToken()

    return authenticatedResponse(
      path,
      {
        ...options,

        _retried: true,

        headers: {
          ...options.headers,

          Authorization:
            `Bearer ${renewedAccess}`,
        },
      },
    )
  }

  if (
    response.status === 403 &&
    isProtected &&
    forbiddenHandler
  ) {
    try {
      Promise.resolve(
        forbiddenHandler(),
      ).catch(() => {})
    } catch {
      /*
       * El error original conserva
       * prioridad.
       */
    }
  }

  return response
}


export async function apiRequest(
  path,
  options = {},
) {
  const response =
    await authenticatedResponse(
      path,
      options,
    )

  const data =
    await response
      .json()
      .catch(() => ({}))

  if (!response.ok) {
    const error =
      new Error(
        errorMessage(data),
      )

    error.status =
      response.status

    error.data = data

    throw error
  }

  return data
}


export async function apiBlobRequest(
  path,
  options = {},
) {
  const response =
    await authenticatedResponse(
      path,
      options,
    )

  if (!response.ok) {
    const data =
      await response
        .json()
        .catch(() => ({}))

    const error =
      new Error(
        errorMessage(data),
      )

    error.status =
      response.status

    error.data = data

    throw error
  }

  return response.blob()
}


function fileResponseName(
  response,
) {
  const disposition =
    response.headers.get(
      'Content-Disposition',
    ) || ''

  const encoded =
    disposition.match(
      /filename\*=UTF-8''([^;]+)/i,
    )?.[1]

  const plain =
    disposition.match(
      /filename="?([^";]+)"?/i,
    )?.[1]

  let filename = ''

  try {
    filename = encoded
      ? decodeURIComponent(
          encoded.replace(
            /^"|"$/g,
            '',
          ),
        )
      : plain || ''
  } catch {
    filename =
      plain || ''
  }

  return Array.from(
    filename
      .split(/[\\/]/)
      .pop(),
  )
    .filter(
      (character) => {
        const code =
          character.charCodeAt(
            0,
          )

        return (
          code >= 32 &&
          code !== 127
        )
      },
    )
    .join('')
    .trim()
}


export async function apiFileRequest(
  path,
  options = {},
) {
  const response =
    await authenticatedResponse(
      path,
      options,
    )

  if (!response.ok) {
    const data =
      await response
        .json()
        .catch(() => ({}))

    const error =
      new Error(
        errorMessage(data),
      )

    error.status =
      response.status

    error.data = data

    throw error
  }

  return {
    blob:
      await response.blob(),

    filename:
      fileResponseName(
        response,
      ),
  }
}


export async function refreshAccessToken() {
  const generation =
    sessionGeneration

  if (
    refreshPromise?.generation ===
    generation
  ) {
    return refreshPromise.promise
  }

  const promise = (
    async () => {
      const csrf =
        await ensureCsrfCookie()

      const response =
        await fetch(
          requestUrl(
            '/api/auth/token/refresh/',
          ),
          {
            method:
              'POST',

            credentials:
              'include',

            headers: {
              'Content-Type':
                'application/json',

              'X-CSRFToken':
                csrf,
            },

            body:
              JSON.stringify(
                {},
              ),
          },
        )

      const data =
        await response
          .json()
          .catch(() => ({}))

      if (
        !response.ok ||
        !data.access
      ) {
        if (
          generation ===
          sessionGeneration
        ) {
          clearAccessToken()

          sessionExpiredHandler?.()
        }

        throw new Error(
          'Tu sesión expiró. Inicia sesión nuevamente.',
        )
      }

      if (
        generation !==
        sessionGeneration
      ) {
        throw new Error(
          'La sesión cambió durante la renovación.',
        )
      }

      setAccessToken(
        data.access,
      )

      return data.access
    }
  )()

  refreshPromise = {
    generation,
    promise,
  }

  try {
    return await promise
  } finally {
    if (
      refreshPromise?.promise ===
      promise
    ) {
      refreshPromise = null
    }
  }
}