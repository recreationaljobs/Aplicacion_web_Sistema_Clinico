import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Link,
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
} from 'react-router-dom'

import ClinicalAlertsBanner from '../../components/ClinicalAlertsBanner'

import ClinicalHistoryPanel from './ClinicalHistoryPanel'

import { useAuth } from '../../context/authContextValue'

import {
  acceptConsultationTreatmentItem,
  cancelConsultationTreatmentItem,
  completePatientConsultation,
  createConsultationTreatmentItem,
  createPatientConsultation,
  getPatient,
  getPatientConsultation,
  performConsultationTreatmentItem,
  updatePatientConsultation,
} from '../../services/patientService'

import { listClinicServices } from '../../services/clinicService'

import {
  consultationPayload,
  consultationTitle,
  consultationToForm,
  examinationFields,
  generalFields,
  makeEmptyConsultationForm,
  narrativeCards,
  systemsFields,
  vitalFields,
} from './consultationSchema'

import {
  patientIdentity,
  patientInitials,
} from './patientDisplay'

import {
  PatientHeader,
  PatientTabs,
} from './PatientRecordShell'

import { ConsultationTabs } from './ConsultationRecordShell'

import ConsultationFollowUpSection from './ConsultationFollowUpSection'

import TreatmentPlanSection from './TreatmentPlanSection'

import useLongitudinalTreatmentPlan from './useLongitudinalTreatmentPlan'


const inputClass =
  'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'


const textareaClass =
  'mt-2 min-h-[110px] w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium leading-6 text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'


const selectClass =
  'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'


function timeLabel(value) {
  if (!value) {
    return ''
  }

  const [hourText, minuteText] =
    String(value).split(':')

  const hour =
    Number(hourText)

  const minute =
    minuteText || '00'

  if (
    Number.isNaN(hour)
  ) {
    return value
  }

  const period =
    hour >= 12
      ? 'PM'
      : 'AM'

  const hour12 =
    hour % 12 || 12

  return `${hour12}:${minute} ${period}`
}


const BASE_TIME_OPTIONS =
  Array.from(
    {
      length: 24 * 4,
    },
    (_, index) => {
      const totalMinutes =
        index * 15

      const hour =
        Math.floor(
          totalMinutes / 60,
        )

      const minute =
        totalMinutes % 60

      const value =
        `${String(hour).padStart(
          2,
          '0',
        )}:${String(minute).padStart(
          2,
          '0',
        )}`

      return {
        value,
        label:
          timeLabel(value),
      }
    },
  )


function getTimeOptions(
  currentValue,
) {
  if (
    !currentValue ||
    BASE_TIME_OPTIONS.some(
      (option) =>
        option.value ===
        currentValue,
    )
  ) {
    return BASE_TIME_OPTIONS
  }

  return [
    {
      value:
        currentValue,

      label:
        timeLabel(
          currentValue,
        ),
    },

    ...BASE_TIME_OPTIONS,
  ]
}


function fieldPlaceholder(
  descriptor,
) {
  const label =
    descriptor.label || ''

  const field =
    descriptor.field || ''

  const normalized =
    `${label} ${field}`
      .toLowerCase()

  if (
    normalized.includes(
      'motivo',
    )
  ) {
    return 'Describe el motivo de la consulta'
  }

  if (
    normalized.includes(
      'diagnóstico',
    ) ||
    normalized.includes(
      'diagnostico',
    )
  ) {
    return 'Describe los hallazgos y diagnóstico odontológico'
  }

  if (
    normalized.includes(
      'resumen',
    )
  ) {
    return 'Escribe un resumen de la atención realizada'
  }

  if (
    normalized.includes(
      'plan de tratamiento',
    )
  ) {
    return 'Describe el plan de tratamiento indicado'
  }

  if (
    normalized.includes(
      'presupuesto',
    )
  ) {
    return 'Describe el presupuesto o las observaciones económicas'
  }

  if (
    normalized.includes(
      'presión',
    ) ||
    normalized.includes(
      'presion',
    )
  ) {
    return 'Ej. 120/80'
  }

  if (
    normalized.includes(
      'temperatura',
    )
  ) {
    return 'Ej. 36.5'
  }

  if (
    normalized.includes(
      'peso',
    )
  ) {
    return 'Ej. 70'
  }

  if (
    normalized.includes(
      'talla',
    )
  ) {
    return 'Ej. 1.70'
  }

  if (
    normalized.includes(
      'frecuencia',
    )
  ) {
    return 'Ingresa el valor'
  }

  return 'Ingresa la información'
}


function CloudSaveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.3 8.3 4.5 4.5 0 0 0 7 18Z" />

      <path d="m9 13 3-3 3 3M12 10v7" />
    </svg>
  )
}


function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}


function SaveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 3h12l2 2v16H5z" />

      <path d="M8 3v6h8V3" />

      <path d="M8 21v-7h8v7" />
    </svg>
  )
}


function SectionCard({
  title,
  subtitle,
  children,
  wide = false,
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
        wide
          ? 'lg:col-span-2'
          : ''
      }`}
    >
      <header className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <h2 className="text-xl font-bold text-slate-900">
          {title}
        </h2>

        {subtitle ? (
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {subtitle}
          </p>
        ) : null}
      </header>

      <div className="p-5 sm:p-6">
        {children}
      </div>
    </section>
  )
}


function ConsultationField({
  descriptor,
  value,
  canModify,
  onChange,
}) {
  const {
    field,
    label,
    type = 'text',
    options = [],
    required = false,
    readOnly = false,
  } = descriptor

  /*
   * =========================================================
   * CHECKBOX / SISTEMAS
   * =========================================================
   */

  if (
    type === 'checkbox'
  ) {
    const checked =
      Boolean(value)

    if (!canModify) {
      return (
        <div
          className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
            checked
              ? 'border-blue-200 bg-blue-50 text-blue-800'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
        >
          <span
            className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
              checked
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 bg-white'
            }`}
          >
            {checked
              ? '✓'
              : ''}
          </span>

          {label}
        </div>
      )
    }

    return (
      <label
        htmlFor={`consultation-${field}`}
        className={`flex cursor-pointer select-none items-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-semibold transition ${
          checked
            ? 'border-blue-300 bg-blue-50 text-blue-800 shadow-sm'
            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/40'
        } ${
          readOnly
            ? 'cursor-not-allowed opacity-60'
            : ''
        }`}
      >
        <input
          id={`consultation-${field}`}
          aria-label={label}
          name={field}
          type="checkbox"
          checked={checked}
          disabled={
            !canModify ||
            readOnly
          }
          onChange={({
            target,
          }) =>
            onChange({
              target: {
                name:
                  field,

                value:
                  target.checked,
              },
            })
          }
          className="sr-only"
        />

        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs transition ${
            checked
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-slate-300 bg-white text-transparent'
          }`}
        >
          ✓
        </span>

        <span>
          {label}
        </span>
      </label>
    )
  }

  /*
   * =========================================================
   * SOLO LECTURA
   * =========================================================
   */

  if (!canModify) {
    const display =
      options.find(
        ([code]) =>
          code === value,
      )?.[1] ||
      (
        type === 'time'
          ? timeLabel(value)
          : value
      )

    return (
      <div
        className={
          type ===
          'textarea'
            ? 'min-h-20'
            : ''
        }
      >
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {label}
        </p>

        <div
          className={`mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-6 ${
            display
              ? 'font-medium text-slate-700'
              : 'italic text-slate-400'
          }`}
        >
          <p className="whitespace-pre-wrap">
            {display ||
              'Sin información registrada'}
          </p>
        </div>
      </div>
    )
  }

  /*
   * =========================================================
   * HORA 12 HORAS AM/PM
   * =========================================================
   */

  if (
    type === 'time'
  ) {
    const timeOptions =
      getTimeOptions(value)

    return (
      <label
        htmlFor={`consultation-${field}`}
        className="block"
      >
        <span className="text-xs font-bold text-slate-700">
          {label}

          {required ? (
            <span className="text-red-500">
              {' '}
              *
            </span>
          ) : null}
        </span>

        <select
          id={`consultation-${field}`}
          aria-label={label}
          name={field}
          value={value || ''}
          required={required}
          disabled={readOnly}
          onChange={onChange}
          className={selectClass}
        >
          <option value="">
            Selecciona una hora
          </option>

          {timeOptions.map(
            (option) => (
              <option
                key={
                  option.value
                }
                value={
                  option.value
                }
              >
                {
                  option.label
                }
              </option>
            ),
          )}
        </select>
      </label>
    )
  }

  /*
   * =========================================================
   * CAMPOS NORMALES
   * =========================================================
   */

  const common = {
    id:
      `consultation-${field}`,

    'aria-label':
      label,

    name:
      field,

    value:
      value ?? '',

    onChange,

    required,

    readOnly,
  }

  const placeholder =
    fieldPlaceholder(
      descriptor,
    )

  return (
    <label
      htmlFor={
        common.id
      }
      className="block"
    >
      <span className="text-xs font-bold text-slate-700">
        {label}

        {required ? (
          <span className="text-red-500">
            {' '}
            *
          </span>
        ) : null}
      </span>

      {type ===
      'select' ? (
        <select
          {...common}
          disabled={readOnly}
          className={
            selectClass
          }
        >
          <option value="">
            Selecciona una opción
          </option>

          {options.map(
            ([
              code,
              text,
            ]) => (
              <option
                key={
                  code
                }
                value={
                  code
                }
              >
                {text}
              </option>
            ),
          )}
        </select>
      ) : type ===
        'textarea' ? (
        <textarea
          {...common}
          rows="4"
          placeholder={
            placeholder
          }
          className={
            textareaClass
          }
        />
      ) : (
        <input
          {...common}
          type={type}
          step={
            type ===
            'number'
              ? 'any'
              : undefined
          }
          min={
            type ===
            'number'
              ? '0'
              : undefined
          }
          placeholder={
            placeholder
          }
          className={`${inputClass} ${
            readOnly
              ? 'cursor-default border-slate-200 bg-slate-50 text-slate-600 shadow-none'
              : ''
          }`}
        />
      )}
    </label>
  )
}


function FieldsGrid({
  fields,
  form,
  canModify,
  onChange,
  columns =
    'sm:grid-cols-2',
}) {
  return (
    <div
      className={`grid gap-x-5 gap-y-5 ${columns}`}
    >
      {fields.map(
        (descriptor) => (
          <ConsultationField
            key={
              descriptor.field
            }
            descriptor={
              descriptor
            }
            value={
              form[
                descriptor.field
              ] ?? ''
            }
            canModify={
              canModify
            }
            onChange={
              onChange
            }
          />
        ),
      )}
    </div>
  )
}


function UnsavedDialog({
  blocker,
  allowNavigationRef,
}) {
  if (
    blocker.state !==
    'blocked'
  ) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[1px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="consultation-unsaved-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <h2
          id="consultation-unsaved-title"
          className="text-2xl font-semibold text-slate-900"
        >
          Cambios sin guardar
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Hay información de la consulta que todavía no se ha guardado. Si sales ahora, esos cambios se perderán.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() =>
              blocker.reset()
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          >
            Seguir editando
          </button>

          <button
            type="button"
            onClick={() => {
              allowNavigationRef.current =
                true

              blocker.proceed()
            }}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
          >
            Descartar y salir
          </button>
        </div>
      </section>
    </div>
  )
}


function CompletionDialog({
  completing,
  onCancel,
  onConfirm,
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[1px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="consultation-complete-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <h2
          id="consultation-complete-title"
          className="text-2xl font-semibold text-slate-900"
        >
          Completar consulta
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          El cierre dejará la consulta en modo de solo lectura. Las aclaraciones posteriores se registran como adendas y conservan el contenido original.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={
              onCancel
            }
            disabled={
              completing
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Volver
          </button>

          <button
            type="button"
            onClick={
              onConfirm
            }
            disabled={
              completing
            }
            aria-label={
              completing
                ? 'Completando consulta'
                : 'Confirmar cierre'
            }
            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
          >
            {completing
              ? 'Completando…'
              : 'Confirmar cierre'}
          </button>
        </div>
      </section>
    </div>
  )
}


const completionDate = (
  value,
) =>
  new Intl.DateTimeFormat(
    'es-NI',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  ).format(
    new Date(value),
  )


export default function ConsultationRecordPage({
  isNew = false,
}) {
  const { user } =
    useAuth()

  if (
    isNew &&
    user.role ===
      'ODONTOLOGO'
  ) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm leading-6 text-slate-600">
          La nueva consulta debe iniciarse desde una cita asignada, dentro de su horario de atención.
        </p>

        <Link
          to="/citas"
          className="mt-4 inline-block font-semibold text-blue-700 underline"
        >
          Ir a mis citas
        </Link>
      </div>
    )
  }

  return (
    <ConsultationRecordForm
      isNew={
        isNew
      }
    />
  )
}


function ConsultationRecordForm({
  isNew,
}) {
  const {
    patientId,
    consultationId,
  } = useParams()

  const {
    user,
    accessToken,
  } = useAuth()

  const navigate =
    useNavigate()

  const allowNavigationRef =
    useRef(false)

  const completionRef =
    useRef(false)

  const initialFormRef =
    useRef(null)

  if (
    initialFormRef.current ===
    null
  ) {
    initialFormRef.current =
      makeEmptyConsultationForm()
  }

  const [
    patient,
    setPatient,
  ] = useState(null)

  const [
    consultation,
    setConsultation,
  ] = useState(null)

  const [
    form,
    setForm,
  ] = useState(
    initialFormRef.current,
  )

  const [
    baselineForm,
    setBaselineForm,
  ] = useState(
    initialFormRef.current,
  )

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    completionOpen,
    setCompletionOpen,
  ] = useState(false)

  const [
    completing,
    setCompleting,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const [
    treatmentServices,
    setTreatmentServices,
  ] = useState([])

  const [
    treatmentServicesError,
    setTreatmentServicesError,
  ] = useState('')

  const canCreate =
    user.role ===
      'ADMINISTRADOR' ||
    user.permissions?.includes(
      'consultations.create',
    )

  const canEdit =
    user.role ===
      'ADMINISTRADOR' ||
    user.permissions?.includes(
      'consultations.edit',
    )

  const canViewTreatments =
    user.role ===
      'ADMINISTRADOR' ||
    user.permissions?.includes(
      'consultations.view',
    )

  const hasAppointmentCreatePermission =
    user.role ===
      'ADMINISTRADOR' ||
    user.permissions?.includes(
      'appointments.create',
    )

  const treatmentPlan =
    useLongitudinalTreatmentPlan(
      accessToken,
      patientId,
      !isNew &&
        canViewTreatments,
    )


  useEffect(() => {
    let active = true

    const load =
      async () => {
        try {
          if (isNew) {
            const loadedPatient =
              await getPatient(
                accessToken,
                patientId,
              )

            if (active) {
              setPatient(
                loadedPatient,
              )
            }

            return
          }

          const [
            patientResult,
            consultationResult,
          ] =
            await Promise.allSettled([
              getPatient(
                accessToken,
                patientId,
              ),

              getPatientConsultation(
                accessToken,
                patientId,
                consultationId,
              ),
            ])

          if (
            patientResult.status ===
            'rejected'
          ) {
            throw patientResult.reason
          }

          if (
            consultationResult.status ===
            'rejected'
          ) {
            throw consultationResult.reason
          }

          if (!active) {
            return
          }

          const loadedConsultation =
            consultationResult.value

          const loadedForm =
            consultationToForm(
              loadedConsultation,
            )

          setPatient(
            patientResult.value,
          )

          setConsultation(
            loadedConsultation,
          )

          setForm(
            loadedForm,
          )

          setBaselineForm(
            loadedForm,
          )

          if (
            patientResult.value.is_active &&
            loadedConsultation.status ===
              'EN_PROGRESO' &&
            canEdit
          ) {
            try {
              const loadedServices =
                await listClinicServices(
                  accessToken,
                  {
                    active:
                      true,
                  },
                )

              if (active) {
                setTreatmentServices(
                  loadedServices,
                )
              }
            } catch (
              requestError
            ) {
              if (active) {
                setTreatmentServicesError(
                  requestError.message,
                )
              }
            }
          }
        } catch (
          requestError
        ) {
          if (active) {
            setError(
              requestError.message,
            )
          }
        } finally {
          if (active) {
            setLoading(
              false,
            )
          }
        }
      }

    load()

    return () => {
      active = false
    }
  }, [
    accessToken,
    canEdit,
    consultationId,
    isNew,
    patientId,
  ])


  useEffect(() => {
    allowNavigationRef.current =
      false
  }, [
    consultationId,
    isNew,
    patientId,
  ])


  const patientActive =
    patient?.is_active !==
    false

  const canModify =
    isNew
      ? canCreate &&
        patientActive
      : canEdit &&
        consultation?.status ===
          'EN_PROGRESO'

  const canComplete =
    !isNew &&
    canEdit &&
    consultation?.status ===
      'EN_PROGRESO'

  const canScheduleAppointment =
    hasAppointmentCreatePermission &&
    patientActive

  const isDirty =
    canModify &&
    JSON.stringify(form) !==
      JSON.stringify(
        baselineForm,
      )

  const blocker =
    useBlocker(
      useCallback(
        () =>
          isDirty &&
          !saving &&
          !allowNavigationRef.current,
        [
          isDirty,
          saving,
        ],
      ),
    )

  useBeforeUnload(
    useCallback(
      (event) => {
        if (
          isDirty &&
          !saving
        ) {
          event.preventDefault()

          event.returnValue =
            ''
        }
      },
      [
        isDirty,
        saving,
      ],
    ),
  )


  const update = ({
    target,
  }) =>
    setForm(
      (current) => ({
        ...current,

        [target.name]:
          target.value,
      }),
    )


  const professionalName =
    [
      user.first_name,
      user.last_name,
    ]
      .filter(Boolean)
      .join(' ') ||
    user.email


  const professionalSpecialty =
    isNew
      ? user.specialty
      : consultation
          ?.professional_specialty


  const professionalRegistration =
    isNew
      ? user.professional_registration_number
      : consultation
          ?.professional_registration_number


  const professionalPhone =
    isNew
      ? user.phone
      : consultation
          ?.professional_phone


  const discard = () => {
    setError('')

    if (isNew) {
      allowNavigationRef.current =
        true

      navigate(
        `/pacientes/${patientId}/consultas`,
      )

      return
    }

    setForm(
      baselineForm,
    )
  }


  const submit =
    async (event) => {
      event.preventDefault()

      setSaving(true)

      setError('')

      try {
        const payload =
          consultationPayload(
            form,
          )

        const saved =
          isNew
            ? await createPatientConsultation(
                accessToken,
                patientId,
                payload,
              )
            : await updatePatientConsultation(
                accessToken,
                patientId,
                consultationId,
                {
                  ...payload,

                  expected_version:
                    consultation.version,
                },
              )

        const savedForm =
          consultationToForm(
            saved,
          )

        setConsultation(
          saved,
        )

        setForm(
          savedForm,
        )

        setBaselineForm(
          savedForm,
        )

        if (isNew) {
          allowNavigationRef.current =
            true

          navigate(
            `/pacientes/${patientId}/consultas/${saved.id}`,
            {
              replace:
                true,
            },
          )
        }
      } catch (
        requestError
      ) {
        setError(
          requestError.message,
        )
      } finally {
        setSaving(
          false,
        )
      }
    }


  const complete =
    async () => {
      if (
        completionRef.current
      ) {
        return
      }

      completionRef.current =
        true

      setCompleting(
        true,
      )

      setError('')

      try {
        const result =
          await completePatientConsultation(
            accessToken,
            patientId,
            consultationId,
          )

        const completed =
          result.consultation

        const completedForm =
          consultationToForm(
            completed,
          )

        setConsultation(
          completed,
        )

        setForm(
          completedForm,
        )

        setBaselineForm(
          completedForm,
        )

        setCompletionOpen(
          false,
        )
      } catch (
        requestError
      ) {
        setError(
          requestError.message,
        )

        setCompletionOpen(
          false,
        )
      } finally {
        completionRef.current =
          false

        setCompleting(
          false,
        )
      }
    }


  const createTreatmentItem =
    async (payload) => {
      setTreatmentServicesError(
        '',
      )

      return createConsultationTreatmentItem(
        accessToken,
        patientId,
        consultationId,
        payload,
      )
    }


  const acceptTreatmentItem = (
    treatmentItemId,
    originConsultationId,
  ) =>
    acceptConsultationTreatmentItem(
      accessToken,
      patientId,
      originConsultationId,
      treatmentItemId,
    )


  const performTreatmentItem = (
    treatmentItemId,
    originConsultationId,
    performedIn,
    odontogramResult,
  ) =>
    performConsultationTreatmentItem(
      accessToken,
      patientId,
      originConsultationId,
      treatmentItemId,
      performedIn,
      odontogramResult,
    )


  const cancelTreatmentItem = (
    treatmentItemId,
    originConsultationId,
    reason,
  ) =>
    cancelConsultationTreatmentItem(
      accessToken,
      patientId,
      originConsultationId,
      treatmentItemId,
      reason,
    )


  const scheduleFollowUp = (
    treatmentItem,
  ) => {
    const service =
      treatmentItem?.service

    navigate(
      '/citas',
      {
        state: {
          appointmentPrefill: {
            patient: {
              id:
                patient.id,

              code:
                patient.code,

              full_name:
                patient.full_name,

              phone:
                patient.phone ||
                '',

              date_of_birth:
                patient.date_of_birth ||
                null,
            },

            dentist:
              consultation?.professional
                ? {
                    id:
                      consultation.professional,

                    full_name:
                      consultation.professional_name,
                  }
                : null,

            treatment:
              treatmentItem
                ? {
                    id:
                      treatmentItem.id,

                    description:
                      treatmentItem.description,

                    service:
                      service
                        ? {
                            id:
                              service.id,

                            name:
                              service.name,

                            is_active:
                              service.is_active,
                          }
                        : null,
                  }
                : null,
          },
        },
      },
    )
  }


  if (loading) {
    return (
      <div className="grid min-h-48 place-items-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />

          Cargando consulta…
        </div>
      </div>
    )
  }


  if (!patient) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        {error ||
          'No fue posible cargar el paciente.'}
      </p>
    )
  }


  const title =
    isNew
      ? 'Nueva consulta'
      : consultationTitle(
          consultation,
        )


  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-6xl pb-24"
    >
      {/* =====================================================
          NAVEGACIÓN SUPERIOR
      ====================================================== */}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <Link
          to={`/pacientes/${patientId}/consultas`}
          className="text-sm font-semibold text-slate-600 no-underline transition hover:text-blue-700"
        >
          ← Volver a consultas
        </Link>

        <div className="flex items-center gap-2">
          {canComplete ? (
            <button
              type="button"
              onClick={() =>
                setCompletionOpen(
                  true,
                )
              }
              disabled={
                isDirty ||
                completing
              }
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Completar consulta
            </button>
          ) : null}
        </div>
      </div>


      {/* =====================================================
          PACIENTE / TABS
      ====================================================== */}

      <PatientHeader
        patient={
          patient
        }
        title={
          patient.full_name
        }
        initials={
          patientInitials(
            patient,
          )
        }
        isActive={
          patient.is_active
        }
        identityText={
          patientIdentity(
            patient,
          )
        }
      />

      <PatientTabs
        patientId={
          patient.id
        }
        active="consultations"
      />

      <ConsultationTabs
        patientId={
          patient.id
        }
        consultationId={
          consultationId
        }
        isNew={
          isNew
        }
      />


      {/* =====================================================
          ERRORES / ESTADO
      ====================================================== */}

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"
        >
          {error}
        </p>
      ) : null}


      {!patientActive ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El paciente está inactivo. El historial permanece disponible, pero no se pueden iniciar nuevas operaciones clínicas.
        </p>
      ) : null}


      <div className="mt-6">
        <ClinicalAlertsBanner
          clinicalRecord={
            patient.clinical_record
          }
        />
      </div>


      {/* =====================================================
          CABECERA CONSULTA
      ====================================================== */}

      <div className="mt-6 overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-sm">
        <div className="bg-cyan-50/70 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">
                Historial médico
              </p>

              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                {title}
              </h1>

              {isNew ? (
                <p className="mt-1 text-sm text-slate-500">
                  Registra los datos de la atención clínica del paciente.
                </p>
              ) : null}
            </div>

            {!isNew &&
            consultation?.status_display ? (
              <div className="text-left sm:text-right">
                <span className="inline-flex rounded-full border border-cyan-100 bg-white px-3 py-1.5 text-xs font-bold text-cyan-800 shadow-sm">
                  {
                    consultation.status_display
                  }
                </span>

                {consultation.completed_at ? (
                  <p className="mt-2 text-xs font-medium text-slate-600">
                    Cerrada el{' '}
                    {completionDate(
                      consultation.completed_at,
                    )}
                  </p>
                ) : null}

                {consultation.completed_by_name ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Cerrada por{' '}
                    {
                      consultation.completed_by_name
                    }
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>


      {/* =====================================================
          CONTENIDO
      ====================================================== */}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {!isNew ? (
          <ConsultationFollowUpSection
            status={
              consultation?.status
            }
            items={
              treatmentPlan.items
            }
            canSchedule={
              canScheduleAppointment
            }
            onSchedule={
              scheduleFollowUp
            }
          />
        ) : null}


        {/* ===================================================
            DATOS GENERALES
        ==================================================== */}

        <SectionCard
          title="Datos generales de la consulta"
          subtitle="Información del profesional y datos principales de esta atención."
          wide
        >
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Profesional tratante
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              <ConsultationField
                descriptor={{
                  label:
                    'Profesional',

                  field:
                    'professional_name',

                  readOnly:
                    true,
                }}
                value={
                  isNew
                    ? professionalName
                    : consultation?.professional_name ||
                      ''
                }
                canModify={
                  canModify
                }
                onChange={() => {}}
              />

              <ConsultationField
                descriptor={{
                  label:
                    'Especialidad',

                  field:
                    'professional_specialty',

                  readOnly:
                    true,
                }}
                value={
                  professionalSpecialty ||
                  ''
                }
                canModify={
                  canModify
                }
                onChange={() => {}}
              />

              <ConsultationField
                descriptor={{
                  label:
                    'Código MINSA',

                  field:
                    'professional_registration_number',

                  readOnly:
                    true,
                }}
                value={
                  professionalRegistration ||
                  ''
                }
                canModify={
                  canModify
                }
                onChange={() => {}}
              />

              <ConsultationField
                descriptor={{
                  label:
                    'Teléfono del profesional',

                  field:
                    'professional_phone',

                  readOnly:
                    true,
                }}
                value={
                  professionalPhone ||
                  ''
                }
                canModify={
                  canModify
                }
                onChange={() => {}}
              />
            </div>
          </div>

          <FieldsGrid
            fields={
              generalFields
            }
            form={
              form
            }
            canModify={
              canModify
            }
            onChange={
              update
            }
          />
        </SectionCard>


        {/* ===================================================
            MOTIVO DE CONSULTA
        ==================================================== */}

        {narrativeCards
          .slice(0, 1)
          .map(
            ([
              cardTitle,
              label,
              field,
            ]) => (
              <SectionCard
                key={
                  field
                }
                title={
                  cardTitle
                }
                subtitle="Describe claramente la razón principal por la que el paciente acude a consulta."
                wide
              >
                <ConsultationField
                  descriptor={{
                    label,
                    field,
                    type:
                      'textarea',
                  }}
                  value={
                    form[
                      field
                    ]
                  }
                  canModify={
                    canModify
                  }
                  onChange={
                    update
                  }
                />
              </SectionCard>
            ),
          )}


        {/* ===================================================
            INTERROGATORIO
        ==================================================== */}

        <SectionCard
          title="Interrogatorio por aparatos y sistemas"
          subtitle="Marca los sistemas en los que el paciente refiere síntomas o antecedentes relevantes."
          wide
        >
          <FieldsGrid
            fields={
              systemsFields
            }
            form={
              form
            }
            canModify={
              canModify
            }
            onChange={
              update
            }
            columns="sm:grid-cols-2 lg:grid-cols-3"
          />
        </SectionCard>


        {/* ===================================================
            EXAMEN FÍSICO
        ==================================================== */}

        <SectionCard
          title="Examen físico"
          subtitle="Registra los signos vitales y los hallazgos generales del examen."
          wide
        >
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Signos vitales y medidas
            </p>

            <FieldsGrid
              fields={
                vitalFields
              }
              form={
                form
              }
              canModify={
                canModify
              }
              onChange={
                update
              }
              columns="sm:grid-cols-2 lg:grid-cols-4"
            />
          </div>

          <div className="mt-6">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Evaluación general
            </p>

            <FieldsGrid
              fields={
                examinationFields
              }
              form={
                form
              }
              canModify={
                canModify
              }
              onChange={
                update
              }
            />
          </div>
        </SectionCard>


        {/* ===================================================
            DIAGNÓSTICO
        ==================================================== */}

        {narrativeCards
          .slice(1, 2)
          .map(
            ([
              cardTitle,
              label,
              field,
            ]) => (
              <SectionCard
                key={
                  field
                }
                title={
                  cardTitle
                }
                subtitle="Registra los diagnósticos, problemas odontológicos y hallazgos relevantes."
                wide
              >
                <ConsultationField
                  descriptor={{
                    label,
                    field,
                    type:
                      'textarea',
                  }}
                  value={
                    form[
                      field
                    ]
                  }
                  canModify={
                    canModify
                  }
                  onChange={
                    update
                  }
                />
              </SectionCard>
            ),
          )}


        {/* ===================================================
            PLAN LONGITUDINAL EXISTENTE
        ==================================================== */}

        {!isNew ? (
          <TreatmentPlanSection
            items={
              treatmentPlan.items
            }
            services={
              treatmentServices
            }
            canEdit={
              canEdit &&
              patientActive &&
              consultation?.status ===
                'EN_PROGRESO'
            }
            canTransition={
              canEdit
            }
            canPerform={
              canEdit &&
              consultation?.status ===
                'EN_PROGRESO'
            }
            currentConsultationId={
              consultation?.id
            }
            loading={
              treatmentPlan.loading
            }
            error={
              treatmentPlan.error ||
              treatmentServicesError
            }
            pendingHasMore={
              treatmentPlan.pendingHasMore
            }
            historyHasMore={
              treatmentPlan.historyHasMore
            }
            loadingMoreScope={
              treatmentPlan.loadingMoreScope
            }
            onLoadMore={
              treatmentPlan.loadMore
            }
            onItemChanged={
              treatmentPlan.upsert
            }
            onCreate={
              createTreatmentItem
            }
            onAccept={
              acceptTreatmentItem
            }
            onPerform={
              performTreatmentItem
            }
            onCancel={
              cancelTreatmentItem
            }
          />
        ) : null}


        {/* ===================================================
            PLAN / PRESUPUESTO NARRATIVO
        ==================================================== */}

        {narrativeCards
          .slice(2)
          .map(
            ([
              cardTitle,
              label,
              field,
            ]) => (
              <SectionCard
                key={
                  field
                }
                title={
                  cardTitle
                }
                subtitle={
                  cardTitle
                    .toLowerCase()
                    .includes(
                      'presupuesto',
                    )
                    ? 'Agrega información económica u observaciones del presupuesto.'
                    : 'Describe las indicaciones y procedimientos recomendados.'
                }
              >
                <ConsultationField
                  descriptor={{
                    label,
                    field,
                    type:
                      'textarea',
                  }}
                  value={
                    form[
                      field
                    ]
                  }
                  canModify={
                    canModify
                  }
                  onChange={
                    update
                  }
                />
              </SectionCard>
            ),
          )}
      </div>


      {/* =====================================================
          ACCIONES NUEVA CONSULTA
      ====================================================== */}

      {isNew &&
      canModify ? (
        <div className="sticky bottom-4 z-30 mt-6 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">
                Nueva consulta
              </p>

              <p className="mt-0.5 text-xs text-slate-500">
                Revisa la información antes de guardar.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={
                  discard
                }
                disabled={
                  saving
                }
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={
                  saving
                }
                className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />

                    Guardando…
                  </>
                ) : (
                  <>
                    <SaveIcon />

                    Guardar consulta
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}


      {/* =====================================================
          ACCIONES CONSULTA EXISTENTE
      ====================================================== */}

      {!isNew &&
      isDirty ? (
        <div
          aria-label="Acciones de cambios"
          className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg sm:right-8"
        >
          <button
            type="submit"
            disabled={
              saving
            }
            aria-label="Guardar cambios"
            title="Guardar cambios"
            className="grid h-10 w-10 place-items-center rounded-lg text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:opacity-50"
          >
            {saving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
            ) : (
              <CloudSaveIcon />
            )}
          </button>

          <button
            type="button"
            onClick={
              discard
            }
            disabled={
              saving
            }
            aria-label="Descartar cambios"
            title="Descartar cambios"
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}


      {/* =====================================================
          HISTORIAL
      ====================================================== */}

      {!isNew ? (
        <ClinicalHistoryPanel
          key={
            consultationId
          }
          accessToken={
            accessToken
          }
          patientId={
            patientId
          }
          consultationId={
            consultationId
          }
          canAmend={
            canEdit &&
            consultation?.status ===
              'COMPLETADA'
          }
        />
      ) : null}


      <UnsavedDialog
        blocker={
          blocker
        }
        allowNavigationRef={
          allowNavigationRef
        }
      />


      {completionOpen ? (
        <CompletionDialog
          completing={
            completing
          }
          onCancel={() =>
            setCompletionOpen(
              false,
            )
          }
          onConfirm={
            complete
          }
        />
      ) : null}
    </form>
  )
}