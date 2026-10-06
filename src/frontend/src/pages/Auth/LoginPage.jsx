import {
  useState,
} from 'react'

import {
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import {
  useSystemFeatures,
} from '../../context/systemFeaturesValue'

import {
  useAuth,
} from '../../context/authContextValue'

import {
  login,
} from '../../services/authService'

import CustomButton from '../../components/CustomButton'

import logo from '../../assets/vite.jpeg'
import image from '../../assets/imagen_login.webp'


export default function LoginPage() {
  const {
    password_reset:
      passwordResetEnabled,
  } = useSystemFeatures()

  const [
    form,
    setForm,
  ] = useState({
    email: '',
    password: '',
  })

  const [
    error,
    setError,
  ] = useState('')

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    showPassword,
    setShowPassword,
  ] = useState(false)

  const {
    signIn,
  } = useAuth()

  const navigate =
    useNavigate()

  const location =
    useLocation()


  const [
    notice,
  ] = useState(() => {
    const storedNotice =
      sessionStorage.getItem(
        'dentalclinic_auth_notice',
      )

    sessionStorage.removeItem(
      'dentalclinic_auth_notice',
    )

    return (
      location.state
        ?.notice ||
      storedNotice ||
      ''
    )
  })


  const change = ({
    target,
  }) => {
    setForm(
      (current) => ({
        ...current,
        [target.name]:
          target.value,
      }),
    )

    if (error) {
      setError('')
    }
  }


  const submit = async (
    event,
  ) => {
    event.preventDefault()

    setError('')

    if (
      !form.email.trim() ||
      !form.password
    ) {
      setError(
        'Ingresa tu correo electrónico y contraseña.',
      )

      return
    }

    try {
      setLoading(true)

      const session =
        await login({
          email:
            form.email.trim(),
          password:
            form.password,
        })

      signIn(session)

      navigate(
        '/bienvenida',
        {
          replace: true,
        },
      )
    } catch (err) {
      setError(
        err.message ||
          'Correo electrónico o contraseña incorrectos.',
      )
    } finally {
      setLoading(false)
    }
  }


  return (
    <main
      className="
        flex
        min-h-screen
        bg-white
        font-sans
        text-slate-900
      "
    >
      {/* ================= IMAGEN LATERAL ================= */}

      <section
        className="
          hidden
          overflow-hidden
          lg:block
          lg:w-[42%]
          xl:w-[45%]
        "
        aria-hidden="true"
      >
        <img
          src={image}
          alt=""
          width="720"
          height="1023"
          loading="eager"
          decoding="async"
          className="
            h-full
            min-h-screen
            w-full
            object-cover
          "
        />
      </section>


      {/* ================= CONTENEDOR LOGIN ================= */}

      <section
        className="
          grid
          min-w-0
          flex-1
          place-items-center
          bg-white
          px-5
          py-8
          sm:px-8
          sm:py-10
        "
      >
        <form
          onSubmit={submit}
          className="
            flex
            w-[min(100%,400px)]
            flex-col
          "
          noValidate
        >
          {/* ================= LOGO ================= */}

          {/*
            La zona del logo tiene una altura fija.

            Aunque el archivo original sea muy alto o muy ancho,
            nunca podrá aumentar este espacio ni empujar el formulario.

            width y height también ayudan al navegador a conocer
            las dimensiones antes de terminar de decodificar la imagen.
          */}

          <div
            className="
              mb-6
              flex
              h-40
              w-full
              items-center
              justify-center
              overflow-hidden
            "
          >
            <img
              src={logo}
              alt="Clínica Argüello"
              width="320"
              height="160"
              className="
                block
                h-full
                w-full
                max-h-full
                max-w-[320px]
                object-contain
                object-center
              "
            />
          </div>


          {/* ================= SUBTÍTULO ================= */}

          <p
            className="
              mb-7
              self-center
              text-center
              text-sm
              font-medium
              text-slate-600
            "
          >
            Sistema de Gestión Odontológica
          </p>


          {/* ================= TÍTULO ================= */}

          <h1
            className="
              m-0
              text-[28px]
              font-semibold
              tracking-tight
              text-slate-900
            "
          >
            Bienvenido
          </h1>

          <p
            className="
              mb-7
              mt-1.5
              text-sm
              text-slate-600
            "
          >
            Ingresa tus credenciales para acceder
          </p>


          {/* ================= MENSAJE ================= */}

          {notice ? (
            <div
              role="status"
              className="
                mb-4
                rounded-xl
                border
                border-emerald-200
                bg-emerald-50
                px-4
                py-3
                text-sm
                font-medium
                text-emerald-800
              "
            >
              {notice}
            </div>
          ) : null}


          {/* ================= ERROR ================= */}

          {error ? (
            <div
              role="alert"
              className="
                mb-4
                rounded-xl
                border
                border-red-200
                bg-red-50
                px-4
                py-3
                text-sm
                font-medium
                text-red-700
              "
            >
              {error}
            </div>
          ) : null}


          {/* ================= EMAIL ================= */}

          <label
            htmlFor="email"
            className="
              mb-2
              text-sm
              font-bold
              text-slate-700
            "
          >
            Correo electrónico
          </label>

          <input
            id="email"
            name="email"
            type="email"
            value={
              form.email
            }
            onChange={
              change
            }
            placeholder="nombre@clinica.com"
            autoComplete="email"
            inputMode="email"
            spellCheck="false"
            disabled={
              loading
            }
            className="
              mb-5
              h-12
              rounded-xl
              border
              border-slate-300
              bg-white
              px-4
              text-sm
              font-medium
              text-slate-900
              outline-none
              transition
              placeholder:text-slate-400
              hover:border-slate-400
              focus:border-blue-600
              focus:ring-4
              focus:ring-blue-100
              disabled:cursor-not-allowed
              disabled:bg-slate-100
              disabled:text-slate-500
            "
          />


          {/* ================= PASSWORD ================= */}

          <label
            htmlFor="password"
            className="
              mb-2
              text-sm
              font-bold
              text-slate-700
            "
          >
            Contraseña
          </label>

          <div
            className="
              relative
              mb-4
            "
          >
            <input
              id="password"
              name="password"
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={
                form.password
              }
              onChange={
                change
              }
              placeholder="Tu contraseña…"
              autoComplete="current-password"
              disabled={
                loading
              }
              className="
                h-12
                w-full
                rounded-xl
                border
                border-slate-300
                bg-white
                py-3
                pl-4
                pr-12
                text-sm
                font-medium
                text-slate-900
                outline-none
                transition
                placeholder:text-slate-400
                hover:border-slate-400
                focus:border-blue-600
                focus:ring-4
                focus:ring-blue-100
                disabled:cursor-not-allowed
                disabled:bg-slate-100
                disabled:text-slate-500
              "
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword(
                  (current) =>
                    !current,
                )
              }
              disabled={
                loading
              }
              aria-label={
                showPassword
                  ? 'Ocultar contraseña'
                  : 'Mostrar contraseña'
              }
              aria-pressed={
                showPassword
              }
              aria-controls="password"
              className="
                absolute
                inset-y-0
                right-0
                grid
                w-12
                place-items-center
                rounded-r-xl
                text-slate-500
                transition
                hover:text-blue-700
                disabled:cursor-not-allowed
                disabled:opacity-50
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-inset
                focus-visible:ring-blue-600
              "
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="
                  h-5
                  w-5
                "
              >
                <path
                  d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
                />

                <circle
                  cx="12"
                  cy="12"
                  r="3"
                />

                {showPassword ? (
                  <path
                    d="m3 3 18 18"
                  />
                ) : null}
              </svg>
            </button>
          </div>


          {/* ================= RECUPERAR CONTRASEÑA ================= */}

          <div
            className="
              mb-8
              flex
              items-center
              justify-end
              text-sm
            "
          >
            {passwordResetEnabled ? (
              <Link
                to="/recuperar-contrasena"
                className="
                  font-semibold
                  text-blue-700
                  no-underline
                  transition
                  hover:text-blue-800
                  hover:underline
                "
              >
                ¿Has olvidado tu contraseña?
              </Link>
            ) : (
              <p
                className="
                  text-right
                  text-sm
                  leading-5
                  text-slate-500
                "
              >
                Para cambiar tu contraseña,
                contacta al administrador.
              </p>
            )}
          </div>


          {/* ================= BOTÓN LOGIN ================= */}

          <CustomButton
            type="submit"
            disabled={
              loading
            }
          >
            {loading
              ? 'Iniciando sesión…'
              : 'Iniciar sesión'}
          </CustomButton>
        </form>
      </section>
    </main>
  )
}