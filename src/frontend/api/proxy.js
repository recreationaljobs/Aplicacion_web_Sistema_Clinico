const BACKEND_URL =
  'https://aplicacion-web-sistema-clinico.onrender.com'

const FRONTEND_URL =
  'https://aplicacion-web-sistema-clinico-blush.vercel.app'

export default async function handler(req, res) {
  const target = String(req.query.target || '')

  if (!target.startsWith('/api/')) {
    return res.status(400).json({
      detail: 'Ruta API inválida.',
    })
  }

  try {
    const [pathname, queryString = ''] =
      target.split('?')

    const normalizedPath =
      pathname.endsWith('/')
        ? pathname
        : `${pathname}/`

    const targetUrl =
      `${BACKEND_URL}${normalizedPath}` +
      (queryString
        ? `?${queryString}`
        : '')

    const headers = {
      Accept:
        req.headers.accept ||
        'application/json',

      Origin:
        req.headers.origin ||
        FRONTEND_URL,

      Referer:
        req.headers.referer ||
        `${FRONTEND_URL}/`,
    }

    if (req.headers.authorization) {
      headers.Authorization =
        req.headers.authorization
    }

    if (req.headers.cookie) {
      headers.Cookie =
        req.headers.cookie
    }

    if (req.headers['x-csrftoken']) {
      headers['X-CSRFToken'] =
        req.headers['x-csrftoken']
    }

    if (req.headers['content-type']) {
      headers['Content-Type'] =
        req.headers['content-type']
    }

    let body

    if (
      req.method !== 'GET' &&
      req.method !== 'HEAD'
    ) {
      if (
        typeof req.body === 'string' ||
        Buffer.isBuffer(req.body)
      ) {
        body = req.body
      } else if (
        req.body !== undefined
      ) {
        body = JSON.stringify(
          req.body,
        )

        if (!headers['Content-Type']) {
          headers['Content-Type'] =
            'application/json'
        }
      }
    }

    const response = await fetch(
      targetUrl,
      {
        method: req.method,
        headers,
        body,
        redirect: 'manual',
      },
    )

    res.status(response.status)

    const setCookie =
      response.headers.get(
        'set-cookie',
      )

    if (setCookie) {
      res.setHeader(
        'Set-Cookie',
        setCookie,
      )
    }

    const contentType =
      response.headers.get(
        'content-type',
      )

    if (contentType) {
      res.setHeader(
        'Content-Type',
        contentType,
      )
    }

    const disposition =
      response.headers.get(
        'content-disposition',
      )

    if (disposition) {
      res.setHeader(
        'Content-Disposition',
        disposition,
      )
    }

    const buffer = Buffer.from(
      await response.arrayBuffer(),
    )

    return res.send(buffer)
  } catch (error) {
    console.error(
      'API proxy error:',
      error,
    )

    return res.status(502).json({
      detail:
        'No fue posible conectar con el backend.',
    })
  }
}