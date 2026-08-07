import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'

import logo from '../../assets/logo_login.svg'
import image from '../../assets/imagen_login.png'

import CustomButton from '../../components/CustomButton'

import { useAuth } from '../../context/AuthContext'
import { login } from '../../services/authService'


export default function LoginPage() {
  const [form, setForm] = useState({
    username: '',
    password: '',
    remember: false,
  })

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const passwordRef = useRef(null)

  const { signIn } = useAuth()
  const navigate = useNavigate()


  const change = ({ target }) => {
    const { name, type, checked, value } = target

    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))

    if (error) {
      setError('')
    }
  }


  const handleUsernameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      passwordRef.current?.focus()
    }
  }

const submit = async (event) => {
  event.preventDefault()

  setError('')

  const username = form.username.trim()

  if (!username) {
    setError('Ingresa tu nombre de usuario.')
    return
  }

  if (!form.password) {
    setError('Ingresa tu contraseña.')
    passwordRef.current?.focus()
    return
  }

  try {
    setLoading(true)

    const session = await login({
      username,
      password: form.password,
    })

    // 1. Guardar sesión
    signIn(
      session,
      form.remember
    )

    // 2. Entrar inmediatamente al sistema
    navigate('/bienvenida', {
      replace: true,
    })

    // 3. Dar tiempo a React para mostrar
    // la pantalla interna antes del SweetAlert
    await new Promise((resolve) => {
      setTimeout(resolve, 100)
    })

    // 4. Mostrar la bienvenida ya dentro del sistema
    await Swal.fire({
      title: '¡Bienvenido!',
      text: 'Has iniciado sesión correctamente.',
      icon: 'success',

      confirmButtonText: 'Continuar',

      allowOutsideClick: false,
      allowEscapeKey: false,
    })
  } catch (err) {
    setError(
      err?.message ||
        'Usuario o contraseña incorrectos.'
    )
  } finally {
    setLoading(false)
  }
}


  return (
    <main
      className="
        relative
        flex
        min-h-screen
        overflow-hidden
        bg-white
        font-sans
        text-[#1f2937]
      "
    >

      {/* =====================================================
          PANEL IZQUIERDO
      ===================================================== */}

      <section
        className="
          relative
          hidden
          w-[40%]
          overflow-hidden
          lg:block
        "
      >

        <img
          src={image}
          alt="Clínica odontológica"
          className="
            absolute
            inset-0
            h-full
            w-full
            object-cover
          "
        />

        {/* Capa azul sobre la imagen */}
        <div
          className="
            absolute
            inset-0
            bg-[#1479b8]/45
          "
        />

        {/* Gradiente sutil */}
        <div
          className="
            absolute
            inset-0
            bg-gradient-to-t
            from-[#063b63]/35
            via-transparent
            to-[#d8f3ff]/10
          "
        />

        {/* Efecto de luz */}
        <div
          className="
            absolute
            -left-24
            -top-24
            h-80
            w-80
            rounded-full
            bg-cyan-200/20
            blur-[90px]
          "
        />

        <div
          className="
            absolute
            -bottom-20
            -right-20
            h-72
            w-72
            rounded-full
            bg-blue-200/20
            blur-[90px]
          "
        />

        {/* Borde decorativo */}
        <div
          className="
            absolute
            right-0
            top-0
            h-full
            w-px
            bg-white/40
          "
        />

      </section>


      {/* =====================================================
          PANEL DERECHO
      ===================================================== */}

      <section
        className="
          relative
          flex
          flex-1
          items-center
          justify-center
          overflow-hidden
          px-6
          py-10
        "
      >

        {/* Decoración superior */}
        <div
          className="
            pointer-events-none
            absolute
            -right-32
            -top-32
            h-[360px]
            w-[360px]
            rounded-full
            bg-[#dff5ff]
            blur-[95px]
          "
        />

        {/* Decoración inferior */}
        <div
          className="
            pointer-events-none
            absolute
            -bottom-40
            -left-20
            h-[380px]
            w-[380px]
            rounded-full
            bg-[#e9f5ff]
            blur-[100px]
          "
        />

        {/* Patrón decorativo */}
        <div
          className="
            pointer-events-none
            absolute
            right-10
            top-10
            grid
            grid-cols-5
            gap-3
            opacity-[0.18]
          "
        >
          {Array.from({ length: 25 }).map((_, index) => (
            <span
              key={index}
              className="
                h-1
                w-1
                rounded-full
                bg-[#1479b8]
              "
            />
          ))}
        </div>


        {/* =================================================
            CONTENEDOR FORMULARIO
        ================================================= */}

        <div
          className="
            relative
            z-10
            w-full
            max-w-[430px]
          "
        >

          {/* Logo */}
          <div className="mb-8 text-center">

            <img
              src={logo}
              alt="DentalClinic"
              className="
                mx-auto
                mb-4
                w-[175px]
              "
            />

            <p
              className="
                text-sm
                font-medium
                text-[#8a8a8a]
              "
            >
              Sistema de Gestión Odontológica
            </p>

          </div>


          {/* Tarjeta */}
          <div
            className="
              relative
              rounded-[22px]
              border
              border-white/80
              bg-white/75
              px-8
              py-8
              shadow-[0_20px_60px_rgba(30,90,130,0.10)]
              backdrop-blur-xl
              sm:px-9
            "
          >

            {/* Línea superior */}
            <div
              className="
                absolute
                left-1/2
                top-0
                h-[3px]
                w-[70px]
                -translate-x-1/2
                rounded-b-full
                bg-gradient-to-r
                from-[#0e92d0]
                to-[#176bb4]
              "
            />


            {/* Encabezado */}
            <div className="mb-7">

              <div
                className="
                  mb-3
                  flex
                  items-center
                  gap-2
                "
              >

              

                

              </div>


              <h1
                className="
                  m-0
                  text-[28px]
                  font-semibold
                  tracking-[-0.03em]
                  text-[#20252a]
                "
              >
                Bienvenido
              </h1>


              <p
                className="
                  mt-2
                  text-sm
                  leading-6
                  text-[#8a8a8a]
                "
              >
                Ingresa tus credenciales para acceder
              </p>

            </div>


            <form
              onSubmit={submit}
              noValidate
            >

              {/* =============================================
                  USUARIO
              ============================================= */}

              <div className="mb-5">

                <label
                  htmlFor="username"
                  className="
                    mb-2
                    block
                    text-[13px]
                    font-bold
                    text-[#333]
                  "
                >
                  Nombre de usuario
                </label>


                <div className="group relative">

                  {/* Icono usuario */}
                  <div
                    className="
                      pointer-events-none
                      absolute
                      left-4
                      top-1/2
                      -translate-y-1/2
                      text-[#9ca3af]
                      transition-colors
                      duration-200
                      group-focus-within:text-[#1479b8]
                    "
                  >

                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>

                  </div>


                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={form.username}
                    onChange={change}
                    onKeyDown={handleUsernameKeyDown}
                    placeholder="Ingresa tu usuario"
                    autoComplete="username"
                    autoFocus
                    disabled={loading}
                    className="
                      h-[52px]
                      w-full
                      rounded-xl
                      border
                      border-[#d9e0e5]
                      bg-white
                      pl-12
                      pr-4
                      text-sm
                      text-[#333]
                      outline-none
                      transition-all
                      duration-200

                      placeholder:text-[#a7afb6]

                      hover:border-[#b8c8d3]

                      focus:border-[#1888c5]
                      focus:ring-4
                      focus:ring-[#1888c5]/10

                      disabled:cursor-not-allowed
                      disabled:bg-gray-100
                    "
                  />

                </div>

              </div>


              {/* =============================================
                  CONTRASEÑA
              ============================================= */}

              <div className="mb-4">

                <label
                  htmlFor="password"
                  className="
                    mb-2
                    block
                    text-[13px]
                    font-bold
                    text-[#333]
                  "
                >
                  Contraseña
                </label>


                <div className="group relative">

                  {/* Icono candado */}
                  <div
                    className="
                      pointer-events-none
                      absolute
                      left-4
                      top-1/2
                      -translate-y-1/2
                      text-[#9ca3af]
                      transition-colors
                      duration-200
                      group-focus-within:text-[#1479b8]
                    "
                  >

                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        width="18"
                        height="11"
                        x="3"
                        y="11"
                        rx="2"
                      />

                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>

                  </div>


                  <input
                    ref={passwordRef}
                    id="password"
                    name="password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={form.password}
                    onChange={change}
                    placeholder="Ingresa tu contraseña"
                    autoComplete="current-password"
                    disabled={loading}
                    className="
                      h-[52px]
                      w-full
                      rounded-xl
                      border
                      border-[#d9e0e5]
                      bg-white
                      pl-12
                      pr-16
                      text-sm
                      text-[#333]
                      outline-none
                      transition-all
                      duration-200

                      placeholder:text-[#a7afb6]

                      hover:border-[#b8c8d3]

                      focus:border-[#1888c5]
                      focus:ring-4
                      focus:ring-[#1888c5]/10

                      disabled:cursor-not-allowed
                      disabled:bg-gray-100
                    "
                  />


                  {/* Mostrar / ocultar contraseña */}
                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) => !current
                      )
                    }
                    className="
                      absolute
                      right-4
                      top-1/2
                      -translate-y-1/2
                      border-0
                      bg-transparent
                      text-[11px]
                      font-semibold
                      text-[#8a939b]
                      transition-colors
                      hover:text-[#1479b8]
                    "
                  >
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </button>

                </div>

              </div>


              {/* =============================================
                  ERROR
              ============================================= */}

              {error && (
                <div
                  role="alert"
                  className="
                    mb-4
                    flex
                    items-start
                    gap-2.5
                    rounded-xl
                    border
                    border-red-100
                    bg-red-50
                    px-4
                    py-3
                    text-[13px]
                    text-red-700
                  "
                >

                  <span
                    className="
                      mt-[5px]
                      h-1.5
                      w-1.5
                      shrink-0
                      rounded-full
                      bg-red-500
                    "
                  />

                  {error}

                </div>
              )}


              {/* =============================================
                  OPCIONES
              ============================================= */}

              <div
                className="
                  mb-8
                  mt-4
                  flex
                  items-center
                  justify-between
                  gap-4
                  text-xs
                "
              >

                <label
                  className="
                    flex
                    cursor-pointer
                    items-center
                    gap-2
                    text-[#60676d]
                  "
                >

                  <input
                    name="remember"
                    type="checkbox"
                    checked={form.remember}
                    onChange={change}
                    disabled={loading}
                    className="
                      h-4
                      w-4
                      cursor-pointer
                      accent-[#1479b8]
                    "
                  />

                  Recuérdame

                </label>


                <button
                  type="button"
                  className="
                    border-0
                    bg-transparent
                    p-0
                    text-xs
                    font-semibold
                    text-[#50565b]
                    transition-colors
                    hover:text-[#1479b8]
                  "
                >
                  ¿Has olvidado tu contraseña?
                </button>

              </div>


              {/* =============================================
                  BOTÓN
              ============================================= */}

              <CustomButton
                type="submit"
                disabled={loading}
              >
                {
                  loading
                    ? 'Iniciando sesión…'
                    : 'Iniciar sesión'
                }
              </CustomButton>

            </form>

          </div>


          {/* ===============================================
              PARTE INFERIOR
          =============================================== */}

          <div
            className="
              mt-5
              flex
              items-center
              justify-center
              gap-2
              text-[10px]
              font-medium
              tracking-wide
              text-[#9aa4ac]
            "
          >

          </div>

        </div>

      </section>

    </main>
  )
}