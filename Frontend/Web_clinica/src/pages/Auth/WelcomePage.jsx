import {
  Link,
} from 'react-router-dom'

import {
  useAuth,
} from '../../context/AuthContext'


const labels = {
  ADMINISTRADOR: 'Administrador',
  RECEPCIONISTA: 'Recepcionista',
  ODONTOLOGO: 'Odontólogo',
}


const modulesByRole = {
  ADMINISTRADOR: [
    {
      title: 'Usuarios',
      description:
        'Administra las cuentas y permisos de acceso al sistema.',
      to: '/usuarios',
      icon: 'users',
    },
    {
      title: 'Pacientes',
      description:
        'Consulta y administra la información de los pacientes.',
      to: '/pacientes',
      icon: 'patient',
    },
    {
      title: 'Clínicas',
      description:
        'Gestiona la información de las clínicas registradas.',
      to: '/clinicas',
      icon: 'clinic',
    },
    {
      title: 'Citas',
      description:
        'Organiza y consulta las citas odontológicas.',
      to: '/citas',
      icon: 'calendar',
    },
  ],

  RECEPCIONISTA: [
    {
      title: 'Pacientes',
      description:
        'Consulta y administra la información de los pacientes.',
      to: '/pacientes',
      icon: 'patient',
    },
    {
      title: 'Citas',
      description:
        'Organiza y consulta las citas odontológicas.',
      to: '/citas',
      icon: 'calendar',
    },
  ],

  ODONTOLOGO: [
    {
      title: 'Pacientes',
      description:
        'Consulta la información clínica de tus pacientes.',
      to: '/pacientes',
      icon: 'patient',
    },
    {
      title: 'Citas',
      description:
        'Consulta las citas odontológicas asignadas.',
      to: '/citas',
      icon: 'calendar',
    },
  ],
}


function ModuleIcon({ type }) {
  const props = {
    width: 25,
    height: 25,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }

  if (type === 'users') {
    return (
      <svg {...props}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }

  if (type === 'patient') {
    return (
      <svg {...props}>
        <circle cx="12" cy="7" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
        <path d="M19 10v4" />
        <path d="M17 12h4" />
      </svg>
    )
  }

  if (type === 'clinic') {
    return (
      <svg {...props}>
        <path d="M4 21V5h16v16" />
        <path d="M9 21v-5h6v5" />
        <path d="M9 9h6" />
        <path d="M12 6v6" />
      </svg>
    )
  }

  return (
    <svg {...props}>
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
      />

      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </svg>
  )
}


export default function WelcomePage() {
  const { user } = useAuth()

  const nombre =
    user?.first_name?.trim() ||
    user?.username ||
    user?.email ||
    'Usuario'

  const rol =
    labels[user?.role] ||
    user?.role ||
    ''

  const modules =
    modulesByRole[user?.role] || []

  return (
    <main
      className="
        min-h-full
        bg-white
        px-7
        py-7
        lg:px-10
        lg:py-8
      "
    >

      {/* Encabezado */}
      <section
        className="
          relative
          overflow-hidden
          rounded-[22px]
          border
          border-[#e7edf2]
          bg-gradient-to-r
          from-[#f7fbfe]
          via-white
          to-[#f2f9fd]
          px-7
          py-7
          lg:px-9
          lg:py-8
        "
      >

        {/* Decoración */}
        <div
          className="
            pointer-events-none
            absolute
            -right-20
            -top-24
            h-64
            w-64
            rounded-full
            bg-[#dff3fc]
            blur-[70px]
          "
        />

        <div
          className="
            relative
            z-10
            flex
            flex-col
            gap-5
            lg:flex-row
            lg:items-center
            lg:justify-between
          "
        >

          <div>
            <div
              className="
                mb-3
                flex
                items-center
                gap-2
              "
            >
              <span
                className="
                  h-2
                  w-2
                  rounded-full
                  bg-[#1687c3]
                  shadow-[0_0_8px_rgba(22,135,195,0.5)]
                "
              />

              <p
                className="
                  text-[10px]
                  font-bold
                  uppercase
                  tracking-[0.17em]
                  text-[#1680ba]
                "
              >
                Sistema de Gestión Odontológica
              </p>
            </div>


            <h1
              className="
                text-[28px]
                font-semibold
                tracking-[-0.03em]
                text-[#20252a]
                lg:text-[31px]
              "
            >
              Bienvenido, {nombre}
            </h1>


            <p
              className="
                mt-2
                max-w-[650px]
                text-[13px]
                leading-6
                text-[#7b858d]
              "
            >
              Accede rápidamente a los módulos habilitados
              para tu perfil y administra las operaciones
              del sistema.
            </p>
          </div>


          <div
            className="
              flex
              shrink-0
              items-center
              gap-3
              rounded-2xl
              border
              border-white
              bg-white/80
              px-4
              py-3
              shadow-sm
            "
          >
            <div
              className="
                flex
                h-11
                w-11
                items-center
                justify-center
                rounded-xl
                bg-[#e9f6fc]
                text-[#1479b8]
              "
            >
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle
                  cx="12"
                  cy="7"
                  r="4"
                />
              </svg>
            </div>

            <div>
              <p
                className="
                  text-[11px]
                  text-[#8d969d]
                "
              >
                Perfil actual
              </p>

              <p
                className="
                  mt-0.5
                  text-[13px]
                  font-semibold
                  text-[#353b40]
                "
              >
                {rol}
              </p>
            </div>
          </div>

        </div>
      </section>


      {/* Título módulos */}
      <section
        className="
          mt-8
        "
      >
        <div
          className="
            mb-5
            flex
            items-end
            justify-between
          "
        >
          <div>
            <h2
              className="
                text-[17px]
                font-semibold
                text-[#272c31]
              "
            >
              Accesos rápidos
            </h2>

            <p
              className="
                mt-1
                text-[12px]
                text-[#90989f]
              "
            >
              Selecciona el módulo que deseas gestionar.
            </p>
          </div>
        </div>


        {/* Cards */}
        <div
          className="
            grid
            grid-cols-1
            gap-4
            sm:grid-cols-2
            xl:grid-cols-4
          "
        >
          {modules.map(
            ({
              title,
              description,
              to,
              icon,
            }) => (
              <Link
                key={to}
                to={to}
                className="
                  group
                  relative
                  min-h-[185px]
                  overflow-hidden
                  rounded-[18px]
                  border
                  border-[#e6ebef]
                  bg-white
                  p-5
                  no-underline
                  shadow-[0_8px_25px_rgba(15,40,60,0.04)]
                  transition-all
                  duration-200

                  hover:-translate-y-1
                  hover:border-[#cce6f4]
                  hover:shadow-[0_14px_35px_rgba(20,100,150,0.10)]
                "
              >

                <div
                  className="
                    mb-5
                    flex
                    h-11
                    w-11
                    items-center
                    justify-center
                    rounded-xl
                    bg-[#eff8fd]
                    text-[#1479b8]
                    transition-all
                    duration-200

                    group-hover:bg-[#1479b8]
                    group-hover:text-white
                  "
                >
                  <ModuleIcon
                    type={icon}
                  />
                </div>


                <h3
                  className="
                    text-[15px]
                    font-semibold
                    text-[#252a2e]
                  "
                >
                  {title}
                </h3>


                <p
                  className="
                    mt-2
                    text-[12px]
                    leading-5
                    text-[#899198]
                  "
                >
                  {description}
                </p>


                <div
                  className="
                    absolute
                    bottom-5
                    right-5
                    flex
                    h-8
                    w-8
                    items-center
                    justify-center
                    rounded-full
                    text-[#9aa4ab]
                    transition-all

                    group-hover:bg-[#edf7fc]
                    group-hover:text-[#1479b8]
                  "
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </div>

              </Link>
            )
          )}
        </div>
      </section>


      {/* Bloque inferior */}
      <section
        className="
          mt-8
          rounded-[18px]
          border
          border-[#edf0f2]
          bg-[#fafcfd]
          px-6
          py-5
        "
      >
        <div
          className="
            flex
            items-center
            gap-4
          "
        >
          <div
            className="
              flex
              h-10
              w-10
              shrink-0
              items-center
              justify-center
              rounded-xl
              bg-white
              text-emerald-500
              shadow-sm
            "
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>

          <div>
            <p
              className="
                text-[13px]
                font-semibold
                text-[#3c4349]
              "
            >
              Sistema disponible
            </p>

            <p
              className="
                mt-1
                text-[11px]
                text-[#929aa1]
              "
            >
              Has iniciado sesión correctamente y puedes utilizar
              los módulos disponibles para tu perfil.
            </p>
          </div>
        </div>
      </section>

    </main>
  )
}