import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'


const menuByRole = {
  ADMINISTRADOR: [
    {
      to: '/bienvenida',
      label: 'Inicio',
      icon: 'home',
    },
    {
      to: '/usuarios',
      label: 'Usuarios',
      icon: 'users',
    },
    {
      to: '/pacientes',
      label: 'Pacientes',
      icon: 'patient',
    },
    {
      to: '/clinicas',
      label: 'Clínicas',
      icon: 'clinic',
    },
    {
      to: '/citas',
      label: 'Citas',
      icon: 'calendar',
    },
  ],

  RECEPCIONISTA: [
    {
      to: '/bienvenida',
      label: 'Inicio',
      icon: 'home',
    },
    {
      to: '/pacientes',
      label: 'Pacientes',
      icon: 'patient',
    },
    {
      to: '/citas',
      label: 'Citas',
      icon: 'calendar',
    },
  ],

  ODONTOLOGO: [
    {
      to: '/bienvenida',
      label: 'Inicio',
      icon: 'home',
    },
    {
      to: '/pacientes',
      label: 'Pacientes',
      icon: 'patient',
    },
    {
      to: '/citas',
      label: 'Citas',
      icon: 'calendar',
    },
  ],
}


const roleLabels = {
  ADMINISTRADOR: 'Administrador',
  RECEPCIONISTA: 'Recepcionista',
  ODONTOLOGO: 'Odontólogo',
}


function MenuIcon({ name }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }

  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5" />
        <path d="M9.5 20v-6h5v6" />
      </svg>
    )
  }

  if (name === 'users') {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }

  if (name === 'patient') {
    return (
      <svg {...common}>
        <circle cx="12" cy="7" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
        <path d="M19 10v4" />
        <path d="M17 12h4" />
      </svg>
    )
  }

  if (name === 'clinic') {
    return (
      <svg {...common}>
        <path d="M4 21V5h16v16" />
        <path d="M9 21v-5h6v5" />
        <path d="M9 9h6" />
        <path d="M12 6v6" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4" />
        <path d="M8 3v4" />
        <path d="M3 10h18" />
      </svg>
    )
  }

  return null
}


export default function Sidebar() {
  const { user } = useAuth()

  const items =
    menuByRole[user?.role] || []

  const nombre =
    user?.first_name?.trim() ||
    user?.username ||
    'Usuario'

  const inicial =
    nombre.charAt(0).toUpperCase()

  return (
    <aside
      className="
        flex
        h-full
        w-[245px]
        shrink-0
        flex-col
        border-r
        border-[#e8edf2]
        bg-white
      "
    >

      {/* Usuario */}
      <div
        className="
          border-b
          border-[#edf1f4]
          px-5
          py-5
        "
      >
        <div
          className="
            flex
            items-center
            gap-3
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
              bg-[#eaf5fc]
              text-sm
              font-bold
              text-[#1479b8]
            "
          >
            {inicial}
          </div>

          <div className="min-w-0">
            <p
              className="
                truncate
                text-[13px]
                font-semibold
                text-[#20252a]
              "
            >
              {nombre}
            </p>

            <p
              className="
                mt-0.5
                text-[11px]
                text-[#8b949c]
              "
            >
              {roleLabels[user?.role] || user?.role}
            </p>
          </div>
        </div>
      </div>


      {/* Menú */}
      <div
        className="
          px-4
          pb-2
          pt-5
        "
      >
        <p
          className="
            px-2
            text-[10px]
            font-bold
            uppercase
            tracking-[0.15em]
            text-[#a0a8af]
          "
        >
          Menú principal
        </p>
      </div>


      <nav
        className="
          flex-1
          space-y-1
          px-3
        "
      >
        {items.map(
          ({
            to,
            label,
            icon,
          }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `
                  group
                  flex
                  items-center
                  gap-3
                  rounded-xl
                  px-3
                  py-2.5
                  text-[13px]
                  font-medium
                  no-underline
                  transition-all
                  duration-200

                  ${
                    isActive
                      ? `
                        bg-[#eaf5fc]
                        text-[#126eaa]
                      `
                      : `
                        text-[#5e6670]
                        hover:bg-[#f5f8fa]
                        hover:text-[#126eaa]
                      `
                  }
                `
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`
                      flex
                      h-8
                      w-8
                      items-center
                      justify-center
                      rounded-lg
                      transition-all

                      ${
                        isActive
                          ? `
                            bg-white
                            text-[#1479b8]
                            shadow-sm
                          `
                          : `
                            text-[#8a949d]
                            group-hover:bg-white
                            group-hover:text-[#1479b8]
                          `
                      }
                    `}
                  >
                    <MenuIcon name={icon} />
                  </span>

                  <span>
                    {label}
                  </span>

                  {isActive && (
                    <span
                      className="
                        ml-auto
                        h-1.5
                        w-1.5
                        rounded-full
                        bg-[#1479b8]
                      "
                    />
                  )}
                </>
              )}
            </NavLink>
          )
        )}
      </nav>


      {/* Parte inferior */}
      <div
        className="
          border-t
          border-[#edf1f4]
          px-5
          py-4
        "
      >
        <div
          className="
            flex
            items-center
            gap-2
            text-[10px]
            font-medium
            text-[#9aa3ab]
          "
        >
          <span
            className="
              h-1.5
              w-1.5
              rounded-full
              bg-emerald-500
            "
          />

          Sistema disponible
        </div>
      </div>

    </aside>
  )
}