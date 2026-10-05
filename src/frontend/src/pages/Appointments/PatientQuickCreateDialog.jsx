import { useRef, useState } from 'react'

import PatientDuplicateDialog from '../../components/PatientDuplicateDialog'

import {
  cedulaPattern,
  formatCedula,
} from '../../utils/identification'

import {
  checkPatientDuplicates,
  createQuickPatient,
} from '../../services/patientService'

import {
  showError,
  showSuccess,
} from '../../utils/alerts'

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  phone: '',
  identification_type: '',
  identification_number: '',
}

function patientPayload(form) {
  const identificationNumber =
    form.identification_number.trim()

  return {
    first_name:
      form.first_name.trim(),

    last_name:
      form.last_name.trim(),

    // IMPORTANTE:
    // Django DateField debe recibir null
    // cuando no hay fecha, no "".
    date_of_birth:
      form.date_of_birth || null,

    phone:
      form.phone.trim(),

    identification_type:
      identificationNumber
        ? form.identification_type || null
        : null,

    identification_number:
      identificationNumber || null,
  }
}

function candidatePayload(payload) {
  return {
    first_name:
      payload.first_name,

    first_last_name:
      payload.last_name,

    date_of_birth:
      payload.date_of_birth,

    phone:
      payload.phone,
  }
}

/*
 * Todos los datos son opcionales.
 *
 * La única validación que conservamos es
 * la coherencia entre tipo y número de
 * identificación:
 *
 * - si escribe número, debe seleccionar tipo;
 * - si selecciona tipo, debe escribir número.
 */
function identificationError(
  payload,
  rawIdentificationType,
) {
  if (
    payload.identification_number &&
    !rawIdentificationType
  ) {
    return 'Selecciona el tipo correspondiente al número de identificación.'
  }

  if (
    rawIdentificationType &&
    !payload.identification_number
  ) {
    return 'Indica el número de identificación o selecciona "Sin identificación".'
  }

  return ''
}

function hasDuplicateCandidateData(
  candidate,
) {
  return Boolean(
    candidate.first_name ||
      candidate.first_last_name ||
      candidate.date_of_birth ||
      candidate.phone,
  )
}

export default function PatientQuickCreateDialog({
  accessToken,
  onCancel,
  onSelect,
}) {
  const submissionPendingRef =
    useRef(false)

  const pendingPayloadRef =
    useRef(null)

  const [form, setForm] =
    useState(EMPTY_FORM)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')

  const [
    duplicateMatches,
    setDuplicateMatches,
  ] = useState([])

  const change =
    (field) => (event) => {
      const value =
        event.target.value

      setForm((current) => {
        const next = {
          ...current,
          [field]: value,
        }

        if (
          next.identification_type ===
            'CEDULA' &&
          [
            'identification_type',
            'identification_number',
          ].includes(field)
        ) {
          next.identification_number =
            formatCedula(
              next.identification_number,
            )
        }

        /*
         * Si vuelve a "Sin identificación",
         * limpiamos también el número para
         * mantener ambos campos coherentes.
         */
        if (
          field ===
            'identification_type' &&
          value === ''
        ) {
          next.identification_number =
            ''
        }

        return next
      })

      setError('')
    }

  const persist =
    async (payload) => {
      try {
        const created =
          await createQuickPatient(
            accessToken,
            payload,
          )

        pendingPayloadRef.current =
          null

        setError('')

        await showSuccess(
          'Paciente creado con éxito',
          'El paciente fue registrado y ya puede utilizarse en la cita.',
        )

        onSelect(created)
      } catch (
        requestError
      ) {
        const message =
          requestError?.message ||
          'No se pudo crear el paciente.'

        setError(message)

        await showError(
          'No se pudo crear el paciente',
          message,
        )
      } finally {
        setSaving(false)

        submissionPendingRef.current =
          false
      }
    }

  const submit =
    async (event) => {
      event.preventDefault()

      if (
        submissionPendingRef.current
      ) {
        return
      }

      const payload =
        patientPayload(form)

      const validationError =
        identificationError(
          payload,
          form.identification_type,
        )

      if (validationError) {
        setError(validationError)

        await showError(
          'Revisa la identificación',
          validationError,
        )

        return
      }

      submissionPendingRef.current =
        true

      setSaving(true)

      setError('')

      try {
        const candidate =
          candidatePayload(payload)

        /*
         * Si no hay datos útiles para buscar
         * duplicados, creamos directamente.
         *
         * Esto permite que todos los campos
         * sean realmente opcionales.
         */
        if (
          !hasDuplicateCandidateData(
            candidate,
          )
        ) {
          await persist(payload)

          return
        }

        const duplicateResult =
          await checkPatientDuplicates(
            accessToken,
            candidate,
          )

        if (
          duplicateResult.matches
            .length > 0
        ) {
          pendingPayloadRef.current =
            payload

          setDuplicateMatches(
            duplicateResult.matches,
          )

          setSaving(false)

          submissionPendingRef.current =
            false

          return
        }

        await persist(payload)
      } catch (
        requestError
      ) {
        const message =
          requestError?.message ||
          'No se pudo validar la información del paciente.'

        setError(message)

        setSaving(false)

        submissionPendingRef.current =
          false

        await showError(
          'No se pudo crear el paciente',
          message,
        )
      }
    }

  const createDespiteWarning =
    () => {
      if (
        submissionPendingRef.current ||
        !pendingPayloadRef.current
      ) {
        return
      }

      submissionPendingRef.current =
        true

      const payload =
        pendingPayloadRef.current

      setDuplicateMatches([])

      setSaving(true)

      setError('')

      persist(payload)
    }

  const selectExisting =
    (match) => {
      if (!match.is_active) {
        return
      }

      pendingPayloadRef.current =
        null

      setDuplicateMatches([])

      onSelect(match)
    }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-quick-create-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
              Agenda clínica
            </p>

            <h2
              id="patient-quick-create-title"
              className="mt-1 font-sans text-2xl font-semibold text-slate-900"
            >
              Alta rápida de paciente
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Crea el paciente sin abandonar
              la nueva cita.
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            aria-label="Cerrar alta rápida"
            className="grid h-9 w-9 place-items-center rounded-full text-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          >
            ×
          </button>
        </header>

        <form
          onSubmit={submit}
          className="space-y-4 p-6"
        >
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* NOMBRES */}
            <label className="text-sm font-semibold text-slate-700">
              Nombres

              <span className="ml-1 font-normal text-slate-400">
                (opcional)
              </span>

              <input
                value={
                  form.first_name
                }
                onChange={change(
                  'first_name',
                )}
                autoComplete="given-name"
                placeholder="Ej. María"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            {/* APELLIDO */}
            <label className="text-sm font-semibold text-slate-700">
              Primer apellido

              <span className="ml-1 font-normal text-slate-400">
                (opcional)
              </span>

              <input
                value={
                  form.last_name
                }
                onChange={change(
                  'last_name',
                )}
                autoComplete="family-name"
                placeholder="Ej. López"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            {/* FECHA */}
            <label className="text-sm font-semibold text-slate-700">
              Fecha de nacimiento

              <span className="ml-1 font-normal text-slate-400">
                (opcional)
              </span>

              <input
                type="date"
                value={
                  form.date_of_birth
                }
                onChange={change(
                  'date_of_birth',
                )}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            {/* TELÉFONO */}
            <label className="text-sm font-semibold text-slate-700">
              Teléfono

              <span className="ml-1 font-normal text-slate-400">
                (opcional)
              </span>

              <input
                aria-label="Teléfono"
                type="tel"
                value={
                  form.phone
                }
                onChange={change(
                  'phone',
                )}
                autoComplete="tel"
                placeholder="Ej. 8888-8888"
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            {/* TIPO IDENTIFICACIÓN */}
            <label className="text-sm font-semibold text-slate-700">
              Tipo de identificación

              <span className="ml-1 font-normal text-slate-400">
                (opcional)
              </span>

              <select
                value={
                  form.identification_type
                }
                onChange={change(
                  'identification_type',
                )}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">
                  Sin identificación
                </option>

                <option value="CEDULA">
                  Cédula
                </option>

                <option value="PASAPORTE">
                  Pasaporte
                </option>

                <option value="OTRO">
                  Otro
                </option>
              </select>
            </label>

            {/* NÚMERO IDENTIFICACIÓN */}
            <label className="text-sm font-semibold text-slate-700">
              Número de identificación

              <span className="ml-1 font-normal text-slate-400">
                (opcional)
              </span>

              <input
                value={
                  form.identification_number
                }
                onChange={change(
                  'identification_number',
                )}
                pattern={
                  form.identification_type ===
                  'CEDULA'
                    ? cedulaPattern
                    : undefined
                }
                placeholder={
                  form.identification_type ===
                  'CEDULA'
                    ? '281-090403-1006K'
                    : 'Número de identificación'
                }
                title={
                  form.identification_type ===
                  'CEDULA'
                    ? 'Formato: 281-090403-1006K'
                    : undefined
                }
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
            <p className="text-xs leading-5 text-slate-600">
              Todos los campos son opcionales.
              Puedes registrar al paciente ahora y
              completar la información faltante
              posteriormente desde su expediente.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />

                  Creando…
                </>
              ) : (
                'Crear paciente'
              )}
            </button>
          </div>
        </form>
      </section>

      <PatientDuplicateDialog
        matches={duplicateMatches}
        busy={saving}
        onSelect={
          selectExisting
        }
        onBack={() => {
          setDuplicateMatches(
            [],
          )

          pendingPayloadRef.current =
            null
        }}
        onContinue={
          createDespiteWarning
        }
      />
    </div>
  )
}