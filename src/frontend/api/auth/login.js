const BACKEND_URL =
  'https://aplicacion-web-sistema-clinico.onrender.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')

    return res.status(405).json({
      detail: 'Método no permitido.',
    })
  }

  try {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }

    const csrfToken =
      req.headers['x-csrftoken']

    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken
    }

    const cookie =
      req.headers.cookie

    if (cookie) {
      headers.Cookie = cookie
    }

    const response = await fetch(
      `${BACKEND_URL}/api/auth/login/`,
      {
        method: 'POST',
        headers,
        body:
          typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body || {}),
        redirect: 'manual',
      },
    )

    const data = await response
      .json()
      .catch(() => ({}))

    const setCookie =
      response.headers.get('set-cookie')

    if (setCookie) {
      res.setHeader(
        'Set-Cookie',
        setCookie,
      )
    }

    res
      .status(response.status)
      .json(data)
  } catch (error) {
    console.error(
      'Login proxy error:',
      error,
    )

    res.status(502).json({
      detail:
        'No fue posible conectar con el backend.',
    })
  }
}