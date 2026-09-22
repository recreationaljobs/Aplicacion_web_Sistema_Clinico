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
    const csrfToken = req.headers['x-csrftoken']
    const cookie = req.headers.cookie

    console.log('LOGIN PROXY', {
      hasCsrfHeader: Boolean(csrfToken),
      hasCookie: Boolean(cookie),
    })

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }

    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken
    }

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

    const rawBody = await response.text()

    const setCookie =
      response.headers.get('set-cookie')

    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie)
    }

    const contentType =
      response.headers.get('content-type') || ''

    res.status(response.status)

    if (contentType.includes('application/json')) {
      try {
        return res.json(JSON.parse(rawBody))
      } catch {
        return res.json({
          detail: rawBody || 'Respuesta JSON inválida.',
        })
      }
    }

    return res.json({
      detail:
        rawBody ||
        `El backend respondió ${response.status}.`,
      backend_status: response.status,
    })
  } catch (error) {
    console.error('Login proxy error:', error)

    return res.status(502).json({
      detail: 'No fue posible conectar con el backend.',
    })
  }
}