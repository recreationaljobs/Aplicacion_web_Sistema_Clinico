import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  useSystemFeatures,
} from '../../context/systemFeaturesValue'

import {
  useClinic,
} from '../../context/clinicContextValue'

import {
  getClinicOptions,
  updateClinicProfile,
} from '../../services/clinicService'

import fallbackLogo from '../../assets/logo_login.svg'


const MAX_LOGO_SIZE = 2 * 1024 * 1024

const ALLOWED_LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
]


export default function ClinicProfilePanel({
  accessToken,
}) {
  const {
    uploads,
  } = useSystemFeatures()

  const {
    profile,
    setProfile,
  } = useClinic()

  const [
    values,
    setValues,
  ] = useState(profile)

  const [
    options,
    setOptions,
  ] = useState({
    currencies: [],
    timezones: [],
  })

  const [
    logo,
    setLogo,
  ] = useState(null)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    messageType,
    setMessageType,
  ] = useState('')


  useEffect(() => {
    setValues(profile)
  }, [profile])


  useEffect(() => {
    let active = true

    getClinicOptions(
      accessToken,
    )
      .then((data) => {
        if (active) {
          setOptions(data)
        }
      })
      .catch((error) => {
        if (active) {
          setMessage(
            error.message ||
              'No fue posible cargar las opciones de configuración.',
          )

          setMessageType(
            'error',
          )
        }
      })

    return () => {
      active = false
    }
  }, [accessToken])


  /*
   * Se crea una sola URL temporal para la vista previa.
   * No usamos URL.createObjectURL directamente dentro del JSX,
   * porque eso crearía una URL nueva en cada render.
   */
  const logoPreview =
    useMemo(() => {
      if (!logo) {
        return (
          profile?.logo_url ||
          fallbackLogo
        )
      }

      return URL.createObjectURL(
        logo,
      )
    }, [
      logo,
      profile?.logo_url,
    ])


  /*
   * Liberamos la URL temporal al cambiar de archivo
   * o desmontar el componente.
   */
  useEffect(() => {
    return () => {
      if (
        logo &&
        logoPreview?.startsWith(
          'blob:',
        )
      ) {
        URL.revokeObjectURL(
          logoPreview,
        )
      }
    }
  }, [
    logo,
    logoPreview,
  ])


  const change = (
    event,
  ) => {
    setValues(
      (current) => ({
        ...current,
        [event.target.name]:
          event.target.value,
      }),
    )

    if (message) {
      setMessage('')
      setMessageType('')
    }
  }


  const handleLogoChange = (
    event,
  ) => {
    const file =
      event.target.files?.[0] ||
      null

    setMessage('')
    setMessageType('')

    if (!file) {
      setLogo(null)
      return
    }

    if (
      !ALLOWED_LOGO_TYPES.includes(
        file.type,
      )
    ) {
      setLogo(null)

      setMessage(
        'El logo debe ser una imagen PNG, JPEG o WebP.',
      )

      setMessageType(
        'error',
      )

      event.target.value =
        ''

      return
    }

    if (
      file.size >
      MAX_LOGO_SIZE
    ) {
      setLogo(null)

      setMessage(
        'El logo no puede superar los 2 MB.',
      )

      setMessageType(
        'error',
      )

      event.target.value =
        ''

      return
    }

    setLogo(file)
  }


  const clearSelectedLogo =
    () => {
      setLogo(null)
      setMessage('')
      setMessageType('')
    }


  const submit = async (
    event,
  ) => {
    event.preventDefault()

    if (saving) {
      return
    }

    setSaving(true)
    setMessage('')
    setMessageType('')

    const data =
      new FormData()

    ;[
      'name',
      'phone',
      'email',
      'address',
      'currency',
      'timezone',
    ].forEach(
      (key) => {
        data.append(
          key,
          values?.[key] ||
            '',
        )
      },
    )

    if (logo) {
      data.append(
        'logo',
        logo,
      )
    }

    try {
      const saved =
        await updateClinicProfile(
          accessToken,
          data,
        )

      setProfile(saved)
      setValues(saved)
      setLogo(null)

      setMessage(
        'Perfil de la clínica actualizado correctamente.',
      )

      setMessageType(
        'success',
      )
    } catch (error) {
      setMessage(
        error.message ||
          'No fue posible actualizar el perfil de la clínica.',
      )

      setMessageType(
        'error',
      )
    } finally {
      setSaving(false)
    }
  }


  return (
    <section
      className="
        overflow-hidden
        rounded-2xl
        border
        border-slate-200
        bg-white
        shadow-sm
      "
      aria-labelledby="clinic-profile-title"
    >
      <form
        onSubmit={submit}
      >
        {/* ================= ENCABEZADO ================= */}

        <header
          className="
            flex
            flex-col
            gap-4
            border-b
            border-slate-100
            p-5

            sm:flex-row
            sm:items-start
            sm:justify-between
          "
        >
          <div
            className="
              min-w-0
              flex-1
            "
          >
            <h2
              id="clinic-profile-title"
              className="
                font-sans
                text-2xl
                font-semibold
                text-slate-900
              "
            >
              Perfil de la clínica
            </h2>

            <p
              className="
                mt-1
                text-xs
                leading-5
                text-slate-500
              "
            >
              Identidad, contacto y preferencias regionales.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="
              inline-flex
              min-h-11
              shrink-0
              items-center
              justify-center

              rounded-xl

              bg-blue-700

              px-5
              py-2.5

              text-sm
              font-semibold
              text-white

              shadow-sm

              transition

              hover:bg-blue-800

              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            {saving
              ? 'Guardando…'
              : 'Guardar cambios'}
          </button>
        </header>


        {/* ================= CONTENIDO ================= */}

        <div
          className="
            grid
            gap-6
            p-5

            md:grid-cols-[200px_minmax(0,1fr)]

            lg:grid-cols-[220px_minmax(0,1fr)]
          "
        >
          {/* ================= LOGO ================= */}

          <aside
            className="
              min-w-0
            "
          >
            <p
              className="
                mb-2
                text-sm
                font-semibold
                text-slate-700
              "
            >
              Logotipo
            </p>

            {/*
              El contenedor tiene altura fija.

              Esto evita que una imagen vertical o de grandes
              dimensiones aumente la altura del formulario y
              desplace el resto del contenido.

              También reserva el espacio antes de que termine
              de cargar la imagen, reduciendo CLS.
            */}
            <div
              className="
                flex
                h-48
                w-full
                items-center
                justify-center
                overflow-hidden
                rounded-2xl
                border
                border-dashed
                border-slate-300
                bg-slate-50
                p-4
              "
            >
              <img
                src={
                  logo
                    ? logoPreview
                    : profile.logo_url || fallbackLogo
                }
                alt="Vista previa del logo"
                width="180"
                height="180"
                className="
                  block
                  h-full
                  w-full
                  max-h-full
                  max-w-full
                  object-contain
                  object-center
                "
              />
            </div>

            <label
              className={`
                mt-3
                flex
                min-h-11
                w-full
                items-center
                justify-center
                rounded-xl
                border
                px-3
                py-2.5
                text-center
                text-xs
                font-semibold
                transition

                ${
                  uploads
                    ? `
                      cursor-pointer
                      border-slate-200
                      bg-white
                      text-blue-700
                      hover:border-blue-200
                      hover:bg-blue-50
                    `
                    : `
                      cursor-not-allowed
                      border-slate-200
                      bg-slate-100
                      text-slate-400
                    `
                }
              `}
            >
              Reemplazar logo

              <input
                className="sr-only"
                type="file"
                disabled={
                  !uploads ||
                  saving
                }
                accept="
                  image/png,
                  image/jpeg,
                  image/webp
                "
                onChange={
                  handleLogoChange
                }
              />
            </label>

            {logo ? (
              <button
                type="button"
                disabled={
                  saving
                }
                onClick={
                  clearSelectedLogo
                }
                className="
                  mt-2

                  min-h-10
                  w-full

                  rounded-xl

                  border
                  border-slate-200

                  bg-white

                  px-3
                  py-2

                  text-xs
                  font-semibold
                  text-slate-600

                  transition

                  hover:bg-slate-50

                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              >
                Cancelar cambio de logo
              </button>
            ) : null}

            <p
              className="
                mt-2

                text-[11px]
                leading-5
                text-slate-400
              "
            >
              PNG, JPEG o WebP · máximo 2 MB.
              La imagen se ajustará automáticamente sin deformarse.
            </p>
          </aside>


          {/* ================= CAMPOS ================= */}

          <div
            className="
              grid
              min-w-0
              content-start
              gap-4

              sm:grid-cols-2
            "
          >
            <Field
              label="Nombre de la clínica"
              wide
            >
              <input
                required
                name="name"
                value={
                  values?.name ||
                  ''
                }
                onChange={
                  change
                }
              />
            </Field>

            <Field
              label="Teléfono"
            >
              <input
                name="phone"
                value={
                  values?.phone ||
                  ''
                }
                onChange={
                  change
                }
              />
            </Field>

            <Field
              label="Correo electrónico"
            >
              <input
                type="email"
                name="email"
                value={
                  values?.email ||
                  ''
                }
                onChange={
                  change
                }
              />
            </Field>

            <Field
              label="Dirección"
              wide
            >
              <textarea
                rows="3"
                name="address"
                value={
                  values?.address ||
                  ''
                }
                onChange={
                  change
                }
              />
            </Field>

            <Field
              label="Moneda"
            >
              <select
                name="currency"
                value={
                  values?.currency ||
                  'NIO'
                }
                onChange={
                  change
                }
              >
                {options.currencies.map(
                  (item) => (
                    <option
                      key={
                        item.value
                      }
                      value={
                        item.value
                      }
                    >
                      {
                        item.label
                      }
                    </option>
                  ),
                )}
              </select>
            </Field>

            <Field
              label="Zona horaria"
            >
              <select
                name="timezone"
                value={
                  values?.timezone ||
                  'America/Managua'
                }
                onChange={
                  change
                }
              >
                {options.timezones.map(
                  (item) => (
                    <option
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {item}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </div>
        </div>


        {/* ================= MENSAJE ================= */}

        {message ? (
          <div
            className="
              px-5
              pb-5
            "
          >
            <p
              role={
                messageType ===
                'error'
                  ? 'alert'
                  : 'status'
              }
              className={`
                rounded-xl
                border
                px-4
                py-3
                text-sm
                font-medium

                ${
                  messageType ===
                  'success'
                    ? `
                      border-emerald-200
                      bg-emerald-50
                      text-emerald-700
                    `
                    : `
                      border-red-200
                      bg-red-50
                      text-red-700
                    `
                }
              `}
            >
              {message}
            </p>
          </div>
        ) : null}
      </form>
    </section>
  )
}


function Field({
  label,
  wide,
  children,
}) {
  return (
    <label
      className={`
        grid
        min-w-0
        gap-1.5
        text-sm
        font-semibold
        text-slate-700
        ${
          wide
            ? 'sm:col-span-2'
            : ''
        }
      `}
    >
      {label}

      <span
        className="
          contents
          [&>*]:w-full
          [&>*]:min-w-0
          [&>*]:rounded-xl
          [&>*]:border
          [&>*]:border-slate-200
          [&>*]:bg-white
          [&>*]:px-3
          [&>*]:py-2.5
          [&>*]:font-normal
          [&>*]:text-slate-900
          [&>*]:outline-none
          [&>*]:transition
          focus-within:[&>*]:border-blue-500
          focus-within:[&>*]:ring-2
          focus-within:[&>*]:ring-blue-100
        "
      >
        {children}
      </span>
    </label>
  )
}