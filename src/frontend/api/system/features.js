const BACKEND_URL =
  'https://aplicacion-web-sistema-clinico.onrender.com'

export default async function handler(req, res) {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/system/features/`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
    )

    const data = await response
      .json()
      .catch(() => ({}))

    res.status(response.status).json(data)
  } catch (error) {
    console.error(
      'Error obteniendo system features:',
      error,
    )

    res.status(502).json({
      detail:
        'No fue posible conectar con el backend.',
    })
  }
}