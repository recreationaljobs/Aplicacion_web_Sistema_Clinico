import { useAuth } from '../../context/AuthContext'


const labels = {
  ADMINISTRADOR: 'Administrador',
  RECEPCIONISTA: 'Recepcionista',
  ODONTOLOGO: 'Odontólogo',
}


export default function WelcomePage() {
  const { user } = useAuth()

  const nombre =
    user?.first_name?.trim() ||
    user?.username ||
    user?.email ||
    'Usuario'

  return (
    <div className="h-full grid place-content-center text-center">

      <h1 className="text-2xl font-semibold m-0">
        Bienvenido, {nombre}
      </h1>

      <p className="text-gray-500 mt-2">
        Rol: {labels[user?.role] || user?.role}
      </p>

    </div>
  )
}