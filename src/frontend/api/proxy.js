const BACKEND_URL =
  'https://aplicacion-web-sistema-clinico.onrender.com'

const FRONTEND_URL =
  'https://aplicacion-web-sistema-clinico-blush.vercel.app'

export default async function handler(req, res) {
  const target = String(
    req.query.target || '',
  )

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

    const incomingContentType =
      req.headers['content-type'] || ''

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

    let body

    if (
      req.method !== 'GET' &&
      req.method !== 'HEAD'
    ) {
      /*
       * FORM DATA
       *
       * No reutilizamos el boundary original.
       * Creamos un FormData nuevo para que fetch
       * genere correctamente Content-Type + boundary.
       */
      if (
        incomingContentType.includes(
          'multipart/form-data',
        )
      ) {
        const formData = new FormData()

        if (
          req.body &&
          typeof req.body === 'object'
        ) {
          for (
            const [key, value]
            of Object.entries(req.body)
          ) {
            if (
              value !== undefined &&
              value !== null
            ) {
              formData.append(
                key,
                String(value),
              )
            }
          }
        }

        body = formData
      } else {
        /*
         * JSON normal.
         */
        headers['Content-Type'] =
          'application/json'

        if (
          typeof req.body === 'string'
        ) {
          body = req.body
        } else {
          body = JSON.stringify(
            req.body || {},
          )
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

    const responseBuffer =
      Buffer.from(
        await response.arrayBuffer(),
      )

    res.status(response.status)

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

    return res.send(
      responseBuffer,
    )
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