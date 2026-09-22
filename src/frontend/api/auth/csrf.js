const BACKEND_URL =
  'https://aplicacion-web-sistema-clinico.onrender.com'

export default async function handler(req, res) {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/auth/csrf/`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
    )

    const data = await response.json().catch(() => ({}))

    const setCookie = response.headers.get('set-cookie')

    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie)
    }

    res.status(response.status).json(data)
  } catch (error) {
    console.error('CSRF proxy error:', error)

    res.status(502).json({
      detail: 'No fue posible conectar con el backend.',
    })
  }
}