const BACKEND_URL = 'https://aplicacion-web-sistema-clinico.onrender.com'

export default async function handler(req, res) {
  try {
    const path = Array.isArray(req.query.path)
      ? req.query.path.join('/')
      : req.query.path || ''

    const searchParams = new URLSearchParams()

    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path') continue

      if (Array.isArray(value)) {
        value.forEach((item) => searchParams.append(key, item))
      } else if (value !== undefined) {
        searchParams.append(key, value)
      }
    }

    const queryString = searchParams.toString()

    const targetUrl =
      `${BACKEND_URL}/api/${path}` +
      (queryString ? `?${queryString}` : '')

    const headers = new Headers()

    for (const [key, value] of Object.entries(req.headers)) {
      if (
        value !== undefined &&
        ![
          'host',
          'content-length',
          'connection',
          'accept-encoding',
        ].includes(key.toLowerCase())
      ) {
        headers.set(
          key,
          Array.isArray(value) ? value.join(', ') : value,
        )
      }
    }

    let body

    if (!['GET', 'HEAD'].includes(req.method)) {
      if (Buffer.isBuffer(req.body)) {
        body = req.body
      } else if (typeof req.body === 'string') {
        body = req.body
      } else if (req.body !== undefined) {
        body = JSON.stringify(req.body)

        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json')
        }
      }
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    })

    res.status(response.status)

    response.headers.forEach((value, key) => {
      if (
        ![
          'content-encoding',
          'content-length',
          'transfer-encoding',
          'connection',
        ].includes(key.toLowerCase())
      ) {
        res.setHeader(key, value)
      }
    })

    const arrayBuffer = await response.arrayBuffer()

    res.send(Buffer.from(arrayBuffer))
  } catch (error) {
    console.error('API proxy error:', error)

    res.status(502).json({
      detail: 'No fue posible conectar con el backend.',
    })
  }
}