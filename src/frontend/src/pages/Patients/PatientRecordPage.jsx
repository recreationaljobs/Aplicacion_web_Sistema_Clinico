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

import Swal from 'sweetalert2'

import ClinicalAlertsBanner from '../../components/ClinicalAlertsBanner'
import PatientDuplicateDialog from '../../components/PatientDuplicateDialog'
import ClinicalHistoryPanel from './ClinicalHistoryPanel'

import {
  cedulaPattern,
  formatCedula,
} from '../../utils/identification'

import { useAuth } from '../../context/authContextValue'

import {
  checkPatientDuplicates,
  createPatient,
  exportPatientClinicalRecord,
  getPatient,
  updatePatient,
} from '../../services/patientService'

import {
  PatientHeader,
  PatientTabs,
} from './PatientRecordShell'

import { patientIdentity } from './patientDisplay'

import {
  isMinorDate,
  patientMissingProfileFields,
  profileFieldLabel,
} from './patientProfileDisplay'

import {
  patientFields,
  recordFields,
} from './patientRecordSchema'

import LongitudinalTreatmentPlan from './LongitudinalTreatmentPlan'
import useLongitudinalTreatmentPlan from './useLongitudinalTreatmentPlan'


const genderLabels = {
  FEMENINO: 'Femenino',
  MASCULINO: 'Masculino',
  OTRO: 'Otro',
}


const inputClass =
  'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'


const textareaClass =
  'mt-2 min-h-[110px] w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium leading-6 text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'


const selectClass =
  'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'


function makeEmptyForm() {
  return {
    ...Object.fromEntries(
      [
        ...patientFields,
        ...recordFields,
      ].map(
        (field) => [
          field,
          '',
        ],
      ),
    ),

    identification_type: '',
    is_active: true,
    infectious_diseases: {},
    hereditary_diseases: {},
  }
}


const infectiousLabels = {
  hepatitis: 'Hepatitis',
  syphilis: 'Sífilis',
  tuberculosis: 'Tuberculosis (TB)',
  cholera: 'Cólera',
  amebiasis: 'Amebiasis',
  pertussis: 'Tosferina',
  measles: 'Sarampión',
  varicella: 'Varicela',
  rubella: 'Rubéola',
  mumps: 'Parotiditis',
  meningitis: 'Meningitis',
  impetigo: 'Impétigo',
  typhoid_fever: 'Fiebre tifoidea',
  scarlet_fever: 'Escarlatina',
  malaria: 'Malaria',
  scabies: 'Escabiosis',
  pediculosis: 'Pediculosis',
  ringworm: 'Tiña',
}


const hereditaryLabels = {
  diabetes_mellitus:
    'Diabetes mellitus',

  hypertension:
    'Hipertensión arterial',

  rheumatic_disease:
    'Enfermedad reumática',

  kidney_diseases:
    'Enfermedades renales',

  eye_diseases:
    'Enfermedades oculares',

  heart_diseases:
    'Enfermedades cardíacas',

  liver_disease:
    'Enfermedad hepática',

  muscle_diseases:
    'Enfermedades musculares',

  congenital_malformations:
    'Malformaciones congénitas',

  mental_disorders:
    'Desórdenes mentales',

  degenerative_cns_diseases:
    'Enfermedades degenerativas del sistema nervioso central',

  growth_anomalies:
    'Anomalías del crecimiento y desarrollo',

  inborn_metabolic_errors:
    'Errores innatos del metabolismo',
}


function formFromPatient(
  patient,
) {
  const values =
    makeEmptyForm()

  const record =
    patient.clinical_record ||
    {}

  patientFields.forEach(
    (field) => {
      const value =
        patient[field]

      if (
        field ===
        'is_active'
      ) {
        values[field] =
          Boolean(value)
      } else if (
        value !==
        undefined
      ) {
        values[field] =
          value === null
            ? ''
            : String(
                value,
              )
      }
    },
  )

  recordFields.forEach(
    (field) => {
      const value =
        record[field]

      values[field] =
        Array.isArray(
          value,
        )
          ? value.join(
              '\n',
            )
          : value ===
                null ||
              value ===
                undefined
            ? ''
            : String(
                value,
              )
    },
  )

  values.infectious_diseases =
    record.infectious_diseases ||
    {}

  values.hereditary_diseases =
    record.hereditary_diseases ||
    {}

  if (
    values.identification_type ===
    'CEDULA'
  ) {
    values.identification_number =
      formatCedula(
        values.identification_number,
      )
  }

  return values
}


function lines(
  value,
) {
  return String(
    value || '',
  )
    .split('\n')
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean)
}


function payloadFromForm(
  form,
) {
  const payload =
    Object.fromEntries(
      patientFields.map(
        (field) => [
          field,
          form[field],
        ],
      ),
    )

  payload.date_of_birth =
    form.date_of_birth ||
    null

  const identificationNumber =
    String(
      form.identification_number ||
        '',
    ).trim()

  payload.identification_number =
    identificationNumber ||
    null

  payload.identification_type =
    identificationNumber
      ? form.identification_type
      : null

  payload.clinical_record =
    Object.fromEntries(
      recordFields.map(
        (field) => {
          if (
            field ===
              'radiographic_exams' ||
            field ===
              'clinical_photographs'
          ) {
            return [
              field,
              lines(
                form[field],
              ),
            ]
          }

          return [
            field,
            form[field],
          ]
        },
      ),
    )

  payload.clinical_record.infectious_diseases =
    form.infectious_diseases

  payload.clinical_record.hereditary_diseases =
    form.hereditary_diseases

  return payload
}


function ageFromBirthDate(
  value,
) {
  if (!value) {
    return ''
  }

  const birthDate =
    new Date(
      `${value}T00:00:00`,
    )

  const today =
    new Date()

  let age =
    today.getFullYear() -
    birthDate.getFullYear()

  if (
    today.getMonth() <
      birthDate.getMonth() ||
    (
      today.getMonth() ===
        birthDate.getMonth() &&
      today.getDate() <
        birthDate.getDate()
    )
  ) {
    age -= 1
  }

  return age >= 0
    ? `${age} años`
    : ''
}


function RecordValue({
  label,
  value,
  field,
  form,
  canModify,
  onChange,
  type = 'text',
  required = false,
  maxLength,
  pattern,
  placeholder,
  options = [],
  ariaLabel,
}) {
  if (
    canModify &&
    field
  ) {
    return (
      <label className="grid content-start">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
          {label}

          {required ? (
            <span className="text-blue-700">
              {' '}
              *
            </span>
          ) : null}
        </span>

        {type ===
        'textarea' ? (
          <textarea
            aria-label={
              ariaLabel ||
              label
            }
            name={field}
            value={
              form[field] ??
              ''
            }
            onChange={
              onChange
            }
            rows={4}
            maxLength={
              maxLength
            }
            placeholder={
              placeholder ||
              'Escribe la información correspondiente'
            }
            className={
              textareaClass
            }
          />
        ) : null}

        {type ===
        'select' ? (
          <select
            aria-label={
              ariaLabel ||
              label
            }
            name={field}
            value={
              form[field] ??
              ''
            }
            onChange={
              onChange
            }
            required={
              required
            }
            className={
              selectClass
            }
          >
            <option value="">
              Seleccionar
            </option>

            {options.map(
              ({
                value:
                  optionValue,

                label:
                  optionLabel,
              }) => (
                <option
                  key={
                    optionValue
                  }
                  value={
                    optionValue
                  }
                >
                  {
                    optionLabel
                  }
                </option>
              ),
            )}
          </select>
        ) : null}

        {type !==
          'textarea' &&
        type !==
          'select' ? (
          <input
            aria-label={
              ariaLabel ||
              label
            }
            name={field}
            value={
              form[field] ??
              ''
            }
            onChange={
              onChange
            }
            type={type}
            step={
              type ===
              'number'
                ? 'any'
                : undefined
            }
            required={
              required
            }
            pattern={
              pattern
            }
            title={
              pattern
                ? 'Formato: 281-090403-1006K'
                : undefined
            }
            placeholder={
              placeholder ||
              (
                type ===
                  'date' ||
                type ===
                  'time'
                  ? undefined
                  : 'Escribe aquí'
              )
            }
            className={
              inputClass
            }
          />
        ) : null}
      </label>
    )
  }

  const display =
    value === '' ||
    value === null ||
    value ===
      undefined
      ? 'Sin información registrada'
      : value

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </dt>

      <dd
        className={`mt-1.5 text-sm font-medium ${
          display ===
          'Sin información registrada'
            ? 'italic text-slate-400'
            : 'text-slate-800'
        }`}
      >
        {display}
      </dd>
    </div>
  )
}


function DataGrid({
  items,
  form,
  canModify,
  onChange,
  columns =
    'sm:grid-cols-2',
}) {
  return (
    <dl
      className={`grid gap-x-6 gap-y-5 ${columns}`}
    >
      {items.map(
        (item) => (
          <RecordValue
            key={
              item.label
            }
            {...item}
            form={
              form
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
    </dl>
  )
}


function SectionCard({
  title,
  children,
  wide = false,
  ariaLabel,
  highlighted = false,
}) {
  return (
    <section
      aria-label={
        ariaLabel
      }
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
        highlighted
          ? 'border-amber-300 ring-2 ring-amber-100'
          : 'border-slate-200'
      } ${
        wide
          ? 'lg:col-span-2'
          : ''
      }`}
    >
      <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
        <h2 className="font-sans text-lg font-bold text-slate-900 sm:text-xl">
          {title}
        </h2>
      </div>

      <div className="p-5 sm:p-6">
        {children}
      </div>
    </section>
  )
}


function duplicateCandidateFromForm(
  form,
) {
  return {
    first_name:
      String(
        form.first_name ||
          '',
      ).trim(),

    first_last_name:
      String(
        form.last_name ||
          '',
      ).trim(),

    date_of_birth:
      form.date_of_birth ||
      null,

    phone:
      String(
        form.phone ||
          '',
      ).trim(),
  }
}


function duplicateRelevantFieldsChanged(
  form,
  baselineForm,
) {
  return [
    'first_name',
    'last_name',
    'date_of_birth',
    'phone',
  ].some(
    (field) =>
      form[field] !==
      baselineForm[field],
  )
}


function ProfileIncompleteNotice({
  fields,
  compact = false,
}) {
  if (
    fields.length === 0
  ) {
    return null
  }

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 text-amber-900 ${
        compact
          ? 'mb-5 px-3 py-2'
          : 'mt-5 p-4'
      }`}
    >
      <strong className="block text-sm">
        Perfil administrativo incompleto
      </strong>

      <p className="mt-1 text-xs">
        Falta completar:{' '}

        {fields
          .map(
            profileFieldLabel,
          )
          .join(', ')}
        .
      </p>
    </div>
  )
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
      <path d="M7 18a4 4 0 0 1-.4-7.98A6 6 0 0 1 18.5 11H19a3.5 3.5 0 0 1 0 7H7Z" />

      <path d="m9 14 3-3 3 3M12 11v7" />
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
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}


function PrintIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9V3h12v6" />

      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />

      <path d="M6 14h12v7H6z" />
    </svg>
  )
}


function DiseaseGroup({
  title,
  values,
  labels,
  canModify,
  onChange,
  hiddenField,
}) {
  const [
    open,
    setOpen,
  ] = useState(false)

  const active =
    Object.entries(
      values || {},
    )
      .filter(
        ([
          name,
          selected,
        ]) =>
          name !==
            'other' &&
          name !==
            hiddenField &&
          selected,
      )
      .map(
        ([name]) =>
          labels[name] ||
          name,
      )

  if (
    values?.other
  ) {
    active.push(
      values.other,
    )
  }

  const summary =
    active.length >
    0 ? (
      <span className="flex flex-wrap gap-2">
        {active.map(
          (label) => (
            <span
              key={
                label
              }
              className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800"
            >
              {
                label
              }
            </span>
          ),
        )}
      </span>
    ) : (
      <span className="text-sm italic text-slate-400">
        Sin información registrada
      </span>
    )

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800">
          {title}
        </h3>

        {canModify ? (
          <button
            type="button"
            aria-label={`Editar ${title}`}
            aria-expanded={
              open
            }
            onClick={() =>
              setOpen(
                (
                  current,
                ) =>
                  !current,
              )
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
          >
            {open
              ? 'Cerrar'
              : 'Editar'}
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        {summary}
      </div>

      {canModify &&
      open ? (
        <div className="mt-4 grid gap-2.5 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          {Object.entries(
            labels,
          ).map(
            ([
              name,
              label,
            ]) => (
              <label
                key={
                  name
                }
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                  values?.[
                    name
                  ]
                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(
                    values?.[
                      name
                    ],
                  )}
                  onChange={(
                    event,
                  ) =>
                    onChange(
                      name,
                      event
                        .target
                        .checked,
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300 accent-blue-700"
                />

                <span>
                  {
                    label
                  }
                </span>
              </label>
            ),
          )}

          <label className="grid text-xs font-bold uppercase tracking-[0.08em] text-slate-500 sm:col-span-2">
            Otros

            <input
              aria-label={`${title}: otros`}
              value={
                values?.other ||
                ''
              }
              onChange={(
                event,
              ) =>
                onChange(
                  'other',
                  event
                    .target
                    .value,
                )
              }
              placeholder="Especificar otro antecedente"
              className={
                inputClass
              }
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}


export default function PatientRecordPage({
  isNew = false,
}) {
  const {
    id,
  } = useParams()

  const {
    user,
    accessToken,
  } = useAuth()

  const navigate =
    useNavigate()

  const allowNavigationRef =
    useRef(false)

  const submissionPendingRef =
    useRef(false)

  const exportPendingRef =
    useRef(false)

  const pendingPatientPayloadRef =
    useRef(null)

  const [
    patient,
    setPatient,
  ] = useState(null)

  const [
    form,
    setForm,
  ] = useState(
    makeEmptyForm,
  )

  const [
    baselineForm,
    setBaselineForm,
  ] = useState(
    makeEmptyForm,
  )

  const [
    loading,
    setLoading,
  ] = useState(
    !isNew,
  )

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    exporting,
    setExporting,
  ] = useState(false)

  const [
    printing,
    setPrinting,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const [
    clinicalReason,
    setClinicalReason,
  ] = useState('')

  const [
    duplicateMatches,
    setDuplicateMatches,
  ] = useState([])


  const clinicalDirty =
    !isNew &&
    JSON.stringify(
      payloadFromForm(
        form,
      ).clinical_record,
    ) !==
      JSON.stringify(
        payloadFromForm(
          baselineForm,
        ).clinical_record,
      )


  const canViewTreatments =
    user.role ===
      'ADMINISTRADOR' ||
    user.permissions?.includes(
      'consultations.view',
    )


  const canExport =
    !isNew &&
    (
      user.role ===
        'ADMINISTRADOR' ||
      (
        user.permissions?.includes(
          'patients.view',
        ) &&
        user.permissions?.includes(
          'consultations.view',
        )
      )
    )


  const treatmentPlan =
    useLongitudinalTreatmentPlan(
      accessToken,
      id,
      !isNew &&
        canViewTreatments,
    )


  useEffect(() => {
    if (
      isNew ||
      !id
    ) {
      return undefined
    }

    let active =
      true

    getPatient(
      accessToken,
      id,
    )
      .then(
        (data) => {
          if (
            !active
          ) {
            return
          }

          const loadedForm =
            formFromPatient(
              data,
            )

          setPatient(
            data,
          )

          setForm(
            loadedForm,
          )

          setBaselineForm(
            loadedForm,
          )
        },
      )
      .catch(
        (
          requestError,
        ) => {
          if (
            active
          ) {
            setError(
              requestError.message,
            )
          }
        },
      )
      .finally(
        () => {
          if (
            active
          ) {
            setLoading(
              false,
            )
          }
        },
      )

    return () => {
      active = false
    }
  }, [
    accessToken,
    id,
    isNew,
  ])


  useEffect(() => {
    allowNavigationRef.current =
      false
  }, [
    id,
    isNew,
  ])


  useEffect(() => {
    if (
      !isNew
    ) {
      return undefined
    }

    const previousOverflow =
      document.body.style.overflow

    document.body.style.overflow =
      'hidden'

    return () => {
      document.body.style.overflow =
        previousOverflow
    }
  }, [
    isNew,
  ])


  const update = ({
    target,
  }) =>
    setForm(
      (current) => {
        const next = {
          ...current,

          [target.name]:
            target.name ===
            'is_active'
              ? target.value ===
                'true'
              : target.type ===
                  'checkbox'
                ? target.checked
                : target.value,
        }

        if (
          next.identification_type ===
            'CEDULA' &&
          [
            'identification_type',
            'identification_number',
          ].includes(
            target.name,
          )
        ) {
          next.identification_number =
            formatCedula(
              next.identification_number,
            )
        }

        return next
      },
    )


  const updateDisease = (
    group,
    name,
    value,
  ) =>
    setForm(
      (current) => ({
        ...current,

        [group]: {
          ...current[
            group
          ],

          [name]:
            value,
        },
      }),
    )


  const canCreate =
    user.role ===
      'ADMINISTRADOR' ||
    user.permissions?.includes(
      'patients.create',
    )


  const canEdit =
    user.role ===
      'ADMINISTRADOR' ||
    user.permissions?.includes(
      'patients.edit',
    )


  const canModify =
    isNew
      ? canCreate
      : canEdit


  const isDirty =
    canModify &&
    JSON.stringify(
      form,
    ) !==
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


  const record =
    patient?.clinical_record ||
    {}


  const currentName =
    `${form.first_name} ${form.last_name} ${form.second_last_name}`
      .replace(
        /\s+/g,
        ' ',
      )
      .trim()


  const title =
    canModify
      ? (
          currentName ||
          (
            isNew
              ? 'Nuevo paciente'
              : 'Paciente sin nombre'
          )
        )
      : (
          patient?.full_name ||
          'Paciente'
        )


  const initials =
    canModify
      ? (
          currentName
            ? `${form.first_name?.[0] || ''}${form.last_name?.[0] || ''}`.toUpperCase()
            : 'NP'
        )
      : `${patient?.first_name?.[0] || ''}${patient?.last_name?.[0] || ''}`.toUpperCase()


  const discard =
    async () => {
      if (
        isDirty
      ) {
        const result =
          await Swal.fire({
            title:
              isNew
                ? '¿Cancelar el registro?'
                : '¿Descartar los cambios?',

            text:
              isNew
                ? 'Los datos ingresados se perderán.'
                : 'Se restaurará la información guardada del paciente.',

            icon:
              'warning',

            showCancelButton:
              true,

            confirmButtonText:
              isNew
                ? 'Sí, salir'
                : 'Sí, descartar',

            cancelButtonText:
              'Continuar editando',

            reverseButtons:
              true,

            focusCancel:
              true,

            confirmButtonColor:
              '#1d4ed8',

            cancelButtonColor:
              '#64748b',
          })

        if (
          !result.isConfirmed
        ) {
          return
        }
      }

      if (
        isNew
      ) {
        allowNavigationRef.current =
          true

        navigate(
          '/pacientes',
        )

        return
      }

      setForm(
        baselineForm,
      )

      setClinicalReason(
        '',
      )

      setError('')

      setDuplicateMatches(
        [],
      )

      pendingPatientPayloadRef.current =
        null
    }


  const persistPatient =
    async (
      payload,
    ) => {
      if (
        clinicalDirty
      ) {
        payload = {
          ...payload,

          clinical_change_reason:
            clinicalReason.trim(),
        }
      }

      const creating =
        isNew

      const saved =
        creating
          ? await createPatient(
              accessToken,
              payload,
            )
          : await updatePatient(
              accessToken,
              id,
              {
                ...payload,

                expected_version:
                  patient.version,
              },
            )

      const savedForm =
        formFromPatient(
          saved,
        )

      setPatient(
        saved,
      )

      setForm(
        savedForm,
      )

      setBaselineForm(
        savedForm,
      )

      setClinicalReason(
        '',
      )

      pendingPatientPayloadRef.current =
        null

      await Swal.fire({
        icon:
          'success',

        title:
          creating
            ? 'Paciente registrado'
            : 'Cambios guardados',

        text:
          creating
            ? 'El expediente del paciente fue creado correctamente.'
            : 'La información del paciente se actualizó correctamente.',

        confirmButtonText:
          'Aceptar',

        confirmButtonColor:
          '#1d4ed8',
      })

      if (
        creating
      ) {
        allowNavigationRef.current =
          true

        navigate(
          `/pacientes/${saved.id}`,
          {
            replace:
              true,
          },
        )
      }

      return saved
    }


  const showSaveError =
    async (
      requestError,
    ) => {
      const message =
        requestError?.message ||
        'No fue posible guardar la información del paciente.'

      setError(
        message,
      )

      await Swal.fire({
        icon:
          'error',

        title:
          'No se pudo guardar',

        text:
          message,

        confirmButtonText:
          'Entendido',

        confirmButtonColor:
          '#1d4ed8',
      })
    }


  const runPatientSave =
    async (
      payload,
    ) => {
      setSaving(
        true,
      )

      setError('')

      try {
        await persistPatient(
          payload,
        )
      } catch (
        requestError
      ) {
        await showSaveError(
          requestError,
        )
      } finally {
        setSaving(
          false,
        )

        submissionPendingRef.current =
          false
      }
    }


  const submit =
    async (
      event,
    ) => {
      event.preventDefault()

      if (
        submissionPendingRef.current
      ) {
        return
      }

      submissionPendingRef.current =
        true

      setSaving(
        true,
      )

      setError('')

      const payload =
        payloadFromForm(
          form,
        )

      if (
        clinicalDirty &&
        !clinicalReason.trim()
      ) {
        const message =
          'Indica el motivo del cambio clínico.'

        setError(
          message,
        )

        setSaving(
          false,
        )

        submissionPendingRef.current =
          false

        await Swal.fire({
          icon:
            'warning',

          title:
            'Falta el motivo del cambio',

          text:
            message,

          confirmButtonText:
            'Completar',

          confirmButtonColor:
            '#1d4ed8',
        })

        return
      }

      const shouldCheckDuplicates =
        isNew ||
        duplicateRelevantFieldsChanged(
          form,
          baselineForm,
        )

      try {
        if (
          shouldCheckDuplicates
        ) {
          const candidate =
            duplicateCandidateFromForm(
              form,
            )

          const duplicateResult =
            isNew
              ? await checkPatientDuplicates(
                  accessToken,
                  candidate,
                )
              : await checkPatientDuplicates(
                  accessToken,
                  candidate,
                  id,
                )

          if (
            duplicateResult
              .matches
              .length >
            0
          ) {
            pendingPatientPayloadRef.current =
              payload

            setDuplicateMatches(
              duplicateResult.matches,
            )

            return
          }
        }

        await persistPatient(
          payload,
        )
      } catch (
        requestError
      ) {
        await showSaveError(
          requestError,
        )
      } finally {
        setSaving(
          false,
        )

        submissionPendingRef.current =
          false
      }
    }


  const createDespiteWarning =
    () => {
      if (
        submissionPendingRef.current ||
        !pendingPatientPayloadRef.current
      ) {
        return
      }

      submissionPendingRef.current =
        true

      const payload =
        pendingPatientPayloadRef.current

      setDuplicateMatches(
        [],
      )

      runPatientSave(
        payload,
      )
    }


  const reviewDuplicate =
    (match) => {
      allowNavigationRef.current =
        true

      setDuplicateMatches(
        [],
      )

      pendingPatientPayloadRef.current =
        null

      navigate(
        `/pacientes/${match.id}`,
      )
    }


  const exportRecord =
    async () => {
      if (
        exportPendingRef.current
      ) {
        return
      }

      exportPendingRef.current =
        true

      setExporting(
        true,
      )

      setError('')

      try {
        const {
          blob,
          filename,
        } =
          await exportPatientClinicalRecord(
            accessToken,
            id,
          )

        const objectUrl =
          URL.createObjectURL(
            blob,
          )

        try {
          const anchor =
            window.document.createElement(
              'a',
            )

          anchor.href =
            objectUrl

          anchor.download =
            filename ||
            `expediente-clinico-${patient?.code || id}.pdf`

          anchor.click()
        } finally {
          URL.revokeObjectURL(
            objectUrl,
          )
        }

        await Swal.fire({
          toast:
            true,

          position:
            'top-end',

          icon:
            'success',

          title:
            'PDF generado correctamente',

          showConfirmButton:
            false,

          timer:
            2200,

          timerProgressBar:
            true,
        })
      } catch (
        requestError
      ) {
        const message =
          requestError?.message ||
          'No se pudo generar el PDF.'

        setError(
          message,
        )

        await Swal.fire({
          icon:
            'error',

          title:
            'No se pudo generar el PDF',

          text:
            message,

          confirmButtonColor:
            '#1d4ed8',
        })
      } finally {
        exportPendingRef.current =
          false

        setExporting(
          false,
        )
      }
    }


  const printRecord =
    async () => {
      if (
        exportPendingRef.current
      ) {
        return
      }

      const printWindow =
        window.open(
          '',
          '_blank',
        )

      if (
        !printWindow
      ) {
        const message =
          'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio.'

        setError(
          message,
        )

        await Swal.fire({
          icon:
            'warning',

          title:
            'Ventana de impresión bloqueada',

          text:
            message,

          confirmButtonColor:
            '#1d4ed8',
        })

        return
      }

      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Preparando impresión</title>
          </head>

          <body
            style="
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
              color: #475569;
              background: #ffffff;
            "
          >
            <div style="text-align:center;">
              <strong>
                Preparando expediente…
              </strong>

              <p style="font-size:13px;">
                La ventana de impresión se abrirá en unos segundos.
              </p>
            </div>
          </body>
        </html>
      `)

      exportPendingRef.current =
        true

      setPrinting(
        true,
      )

      setError('')

      try {
        const {
          blob,
        } =
          await exportPatientClinicalRecord(
            accessToken,
            id,
          )

        const objectUrl =
          URL.createObjectURL(
            blob,
          )

        printWindow.location.replace(
          objectUrl,
        )

        let alreadyPrinted =
          false

        const openPrintDialog =
          () => {
            if (
              alreadyPrinted ||
              printWindow.closed
            ) {
              return
            }

            alreadyPrinted =
              true

            try {
              printWindow.focus()
              printWindow.print()
            } catch {
              // El PDF permanece abierto
              // para impresión manual.
            }
          }

        printWindow.onload =
          () => {
            setTimeout(
              openPrintDialog,
              800,
            )
          }

        setTimeout(
          openPrintDialog,
          1800,
        )

        setTimeout(
          () => {
            URL.revokeObjectURL(
              objectUrl,
            )
          },
          120000,
        )
      } catch (
        requestError
      ) {
        if (
          !printWindow.closed
        ) {
          printWindow.close()
        }

        const message =
          requestError?.message ||
          'No se pudo imprimir el expediente.'

        setError(
          message,
        )

        await Swal.fire({
          icon:
            'error',

          title:
            'No se pudo imprimir',

          text:
            message,

          confirmButtonColor:
            '#1d4ed8',
        })
      } finally {
        exportPendingRef.current =
          false

        setPrinting(
          false,
        )
      }
    }


  if (
    loading
  ) {
    return (
      <p className="p-10 text-center text-sm text-slate-500">
        Cargando expediente…
      </p>
    )
  }


  if (
    error &&
    !patient &&
    !isNew
  ) {
    return (
      <div className="mx-auto max-w-5xl">
        <Link
          to="/pacientes"
          className="text-sm text-blue-700"
        >
          ← Volver a pacientes
        </Link>

        <p
          role="alert"
          className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      </div>
    )
  }


  const personalSource =
    canModify
      ? form
      : patient ||
        form


  const recordSource =
    canModify
      ? form
      : record


  const identityText =
    patientIdentity(
      personalSource,
    )


  const isMinor =
    isMinorDate(
      personalSource.date_of_birth,
    )


  const missingProfileFields =
    patientMissingProfileFields(
      personalSource,
      canModify,
    )


  const profileComplete =
    canModify
      ? missingProfileFields.length ===
        0
      : patient?.profile_complete !==
        false


  const missingGuardianFields =
    missingProfileFields.filter(
      (field) =>
        field.startsWith(
          'guardian_',
        ),
    )


  const formContent = (
    <form
      onSubmit={
        submit
      }
      className={
        isNew
          ? 'flex min-h-0 flex-1 flex-col'
          : 'mx-auto w-full max-w-6xl pb-20'
      }
    >
      <div
        className={
          isNew
            ? 'hidden'
            : 'mb-5 flex flex-wrap items-center justify-between gap-4'
        }
      >
        <Link
          to="/pacientes"
          className="text-sm font-medium text-slate-600 no-underline hover:text-blue-700"
        >
          ← Volver a pacientes
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {canExport ? (
            <>
              <button
                type="button"
                onClick={
                  printRecord
                }
                disabled={
                  printing ||
                  exporting
                }
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
              >
                <PrintIcon />

                {printing
                  ? 'Preparando…'
                  : 'Imprimir'}
              </button>

              <button
                type="button"
                onClick={
                  exportRecord
                }
                disabled={
                  exporting ||
                  printing
                }
                className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
              >
                {exporting
                  ? 'Generando PDF…'
                  : 'Exportar PDF'}
              </button>
            </>
          ) : null}

          {isDirty &&
          !isNew ? (
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
                className="grid h-9 w-9 place-items-center rounded-lg text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:opacity-50"
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
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:opacity-50"
              >
                <CloseIcon />
              </button>
            </div>
          ) : null}
        </div>
      </div>


      {!isNew ? (
        <>
          <PatientHeader
            patient={
              patient
            }
            title={
              title
            }
            initials={
              initials
            }
            isActive={
              form.is_active
            }
            identityText={
              identityText ||
              'Completa los datos para crear el expediente clínico.'
            }
            profileComplete={
              profileComplete
            }
          />

          <PatientTabs
            patientId={
              patient?.id
            }
            active="summary"
            isNew={
              isNew
            }
          />
        </>
      ) : null}


      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}


      {!profileComplete ? (
        <ProfileIncompleteNotice
          fields={
            missingProfileFields
          }
        />
      ) : null}


      <div className="mt-6">
        <ClinicalAlertsBanner
          clinicalRecord={
            recordSource
          }
        />
      </div>


      {clinicalDirty ? (
        <label className="mt-5 grid gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold">
          Motivo del cambio clínico

          <textarea
            aria-label="Motivo del cambio clínico"
            required
            maxLength={
              1000
            }
            value={
              clinicalReason
            }
            onChange={(
              event,
            ) =>
              setClinicalReason(
                event
                  .target
                  .value,
              )
            }
            rows={2}
            className="rounded-lg border border-blue-200 bg-white p-2 font-normal"
          />
        </label>
      ) : null}


      <div className="mt-6 grid gap-5 lg:grid-cols-2">

        {!isNew &&
        canEdit ? (
          <SectionCard title="Estado administrativo">
            <DataGrid
              form={
                form
              }
              canModify
              onChange={
                update
              }
              columns="grid-cols-1"
              items={[
                {
                  label:
                    'Estado administrativo',

                  value:
                    form.is_active
                      ? 'Activo'
                      : 'Inactivo',

                  field:
                    'is_active',

                  type:
                    'select',

                  required:
                    true,

                  options: [
                    {
                      value:
                        'true',

                      label:
                        'Activo',
                    },

                    {
                      value:
                        'false',

                      label:
                        'Inactivo',
                    },
                  ],
                },
              ]}
            />

            <p className="mt-4 text-xs text-slate-500">
              Al desactivar al paciente se conserva su historial, pero se bloquean nuevas operaciones clínicas.
            </p>
          </SectionCard>
        ) : null}


        {!isNew &&
        canViewTreatments ? (
          <LongitudinalTreatmentPlan
            items={
              treatmentPlan.items
            }
            loading={
              treatmentPlan.loading
            }
            error={
              treatmentPlan.error
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
          />
        ) : null}


        {canModify ? (
          <SectionCard
            title="Editar alertas clínicas"
            wide
          >
            <DataGrid
              form={
                form
              }
              canModify
              onChange={
                update
              }
              items={[
                {
                  label:
                    'Alergias',

                  value:
                    recordSource.allergies,

                  field:
                    'allergies',

                  type:
                    'textarea',

                  maxLength:
                    2000,
                },

                {
                  label:
                    'Medicamentos actuales',

                  value:
                    recordSource.current_medications,

                  field:
                    'current_medications',

                  type:
                    'textarea',

                  maxLength:
                    2000,
                },

                {
                  label:
                    'Condiciones médicas relevantes',

                  value:
                    recordSource.relevant_conditions,

                  field:
                    'relevant_conditions',

                  type:
                    'textarea',

                  maxLength:
                    2000,
                },

                {
                  label:
                    'Otras alertas clínicas',

                  value:
                    recordSource.other_clinical_alerts,

                  field:
                    'other_clinical_alerts',

                  type:
                    'textarea',

                  maxLength:
                    2000,
                },
              ]}
            />
          </SectionCard>
        ) : null}


        <SectionCard
          title="Datos personales"
          wide
        >
          <DataGrid
            form={
              form
            }
            canModify={
              canModify
            }
            onChange={
              update
            }
            items={[
              {
                label:
                  'Nombres',

                value:
                  personalSource.first_name,

                field:
                  'first_name',

                required:
                  !isNew,
              },

              {
                label:
                  'Primer apellido',

                value:
                  personalSource.last_name,

                field:
                  'last_name',

                required:
                  !isNew,
              },

              {
                label:
                  'Segundo apellido',

                value:
                  personalSource.second_last_name,

                field:
                  'second_last_name',
              },

              {
                label:
                  'Edad',

                value:
                  ageFromBirthDate(
                    personalSource.date_of_birth,
                  ),
              },

              {
                label:
                  'Fecha de nacimiento',

                value:
                  personalSource.date_of_birth,

                field:
                  'date_of_birth',

                type:
                  'date',

                required:
                  !isNew,
              },

              {
                label:
                  'Lugar de nacimiento',

                value:
                  personalSource.birth_place,

                field:
                  'birth_place',

                required:
                  !isNew,
              },

              {
                label:
                  'Género',

                value:
                  genderLabels[
                    personalSource
                      .gender
                  ],

                field:
                  'gender',

                type:
                  'select',

                required:
                  !isNew,

                options: [
                  {
                    value:
                      'FEMENINO',

                    label:
                      'Femenino',
                  },

                  {
                    value:
                      'MASCULINO',

                    label:
                      'Masculino',
                  },

                  {
                    value:
                      'OTRO',

                    label:
                      'Otro género',
                  },
                ],
              },

              {
                label:
                  'Procedencia',

                value:
                  personalSource.origin,

                field:
                  'origin',
              },

              {
                label:
                  'Religión',

                value:
                  personalSource.religion,

                field:
                  'religion',
              },

              {
                label:
                  'Escolaridad',

                value:
                  personalSource.education,

                field:
                  'education',
              },

              {
                label:
                  'Profesión u oficio',

                value:
                  personalSource.profession,

                field:
                  'profession',
              },

              {
                label:
                  'Dirección habitual',

                value:
                  personalSource.address,

                field:
                  'address',
              },

              {
                label:
                  'Nombre del padre',

                value:
                  personalSource.father_name,

                field:
                  'father_name',
              },

              {
                label:
                  'Nombre de la madre',

                value:
                  personalSource.mother_name,

                field:
                  'mother_name',
              },

              {
                label:
                  'Fuente de información',

                value:
                  personalSource.information_source,

                field:
                  'information_source',
              },

              {
                label:
                  'Confiabilidad',

                value:
                  personalSource.information_reliability,

                field:
                  'information_reliability',
              },

              {
                label:
                  'Teléfono',

                value:
                  personalSource.phone,

                field:
                  'phone',

                type:
                  'tel',
              },

              {
                label:
                  'Correo electrónico',

                value:
                  personalSource.email,

                field:
                  'email',

                type:
                  'email',
              },

              {
                label:
                  'Contacto de emergencia',

                value:
                  personalSource.emergency_contact_name,

                field:
                  'emergency_contact_name',
              },

              {
                label:
                  'Parentesco',

                value:
                  personalSource.emergency_relationship,

                field:
                  'emergency_relationship',
              },

              {
                label:
                  'Teléfono de emergencia',

                value:
                  personalSource.emergency_phone,

                field:
                  'emergency_phone',

                type:
                  'tel',
              },
            ]}
          />
        </SectionCard>


        <SectionCard title="Identificación">
          <DataGrid
            form={
              form
            }
            canModify={
              canModify
            }
            onChange={
              update
            }
            columns="grid-cols-1"
            items={[
              {
                label:
                  'Tipo de identificación',

                value:
                  personalSource.identification_type
                    ? (
                        {
                          CEDULA:
                            'Cédula',

                          PASAPORTE:
                            'Pasaporte',

                          OTRO:
                            'Otro',
                        }[
                          personalSource
                            .identification_type
                        ] ||
                        personalSource.identification_type
                      )
                    : '',

                field:
                  'identification_type',

                type:
                  'select',

                options: [
                  {
                    value:
                      'CEDULA',

                    label:
                      'Cédula',
                  },

                  {
                    value:
                      'PASAPORTE',

                    label:
                      'Pasaporte',
                  },

                  {
                    value:
                      'OTRO',

                    label:
                      'Otro',
                  },
                ],
              },

              {
                label:
                  canModify &&
                  form.identification_type ===
                    'CEDULA'
                    ? 'Cédula'
                    : 'Número de identificación',

                ariaLabel:
                  'Número de identificación',

                value:
                  personalSource.identification_type ===
                  'CEDULA'
                    ? formatCedula(
                        personalSource.identification_number,
                      )
                    : personalSource.identification_number,

                field:
                  'identification_number',

                pattern:
                  form.identification_type ===
                  'CEDULA'
                    ? cedulaPattern
                    : undefined,

                placeholder:
                  form.identification_type ===
                  'CEDULA'
                    ? '281-090403-1006K'
                    : 'Número de identificación',
              },
            ]}
          />

          <p className="mt-4 text-xs text-slate-500">
            El número es opcional. Si se registra, selecciona el tipo correspondiente.
          </p>
        </SectionCard>


        <SectionCard
          title="Responsable / Tutor"
          ariaLabel="Responsable / Tutor"
          highlighted={
            isMinor &&
            missingGuardianFields.length >
              0
          }
        >
          {isMinor &&
          missingGuardianFields.length >
            0 ? (
            <ProfileIncompleteNotice
              fields={
                missingGuardianFields
              }
              compact
            />
          ) : null}

          {isMinor ? (
            <p className="mb-4 text-xs text-slate-600">
              Estos datos son necesarios para completar el perfil administrativo de una persona menor de edad.
            </p>
          ) : (
            <p className="mb-4 text-xs text-slate-500">
              Registra estos datos cuando otra persona sea responsable del paciente.
            </p>
          )}

          <DataGrid
            form={
              form
            }
            canModify={
              canModify
            }
            onChange={
              update
            }
            columns="grid-cols-1"
            items={[
              {
                label:
                  'Nombre del responsable',

                value:
                  personalSource.guardian_name,

                field:
                  'guardian_name',
              },

              {
                label:
                  'Parentesco del responsable',

                value:
                  personalSource.guardian_relationship,

                field:
                  'guardian_relationship',
              },

              {
                label:
                  'Teléfono del responsable',

                value:
                  personalSource.guardian_phone,

                field:
                  'guardian_phone',

                type:
                  'tel',
              },
            ]}
          />
        </SectionCard>


        <SectionCard
          title="Historia de la enfermedad actual"
          wide
        >
          <RecordValue
            label="Historia de la enfermedad actual"
            value={
              recordSource.present_illness_history
            }
            field="present_illness_history"
            type="textarea"
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


        <SectionCard
          title="Antecedentes familiares patológicos"
          wide
        >
          <RecordValue
            label="Antecedentes familiares"
            value={
              recordSource.family_history
            }
            field="family_history"
            type="textarea"
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

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <DiseaseGroup
              title="Enfermedades infectocontagiosas"
              values={
                canModify
                  ? form.infectious_diseases
                  : record.infectious_diseases
              }
              labels={
                infectiousLabels
              }
              canModify={
                canModify
              }
              onChange={(
                name,
                value,
              ) =>
                updateDisease(
                  'infectious_diseases',
                  name,
                  value,
                )
              }
            />

            <DiseaseGroup
              title="Enfermedades hereditarias"
              values={
                canModify
                  ? form.hereditary_diseases
                  : record.hereditary_diseases
              }
              labels={
                hereditaryLabels
              }
              hiddenField="allergies"
              canModify={
                canModify
              }
              onChange={(
                name,
                value,
              ) =>
                updateDisease(
                  'hereditary_diseases',
                  name,
                  value,
                )
              }
            />
          </div>
        </SectionCard>
      </div>


      {blocker.state ===
      'blocked' ? (
        <div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[1px]">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-changes-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h2
              id="unsaved-changes-title"
              className="font-sans text-2xl font-semibold text-slate-900"
            >
              Cambios sin guardar
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Hay información del expediente que todavía no se ha guardado. Si sales ahora, esos cambios se perderán.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  blocker.reset()
                }
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
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
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              >
                Descartar y salir
              </button>
            </div>
          </section>
        </div>
      ) : null}


      {!isNew ? (
        <ClinicalHistoryPanel
          accessToken={
            accessToken
          }
          patientId={
            id
          }
        />
      ) : null}


      {isNew ? (
        <div className="sticky bottom-0 z-20 mt-6 -mx-1 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-1 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={
              discard
            }
            disabled={
              saving
            }
            className="h-12 rounded-xl border border-slate-300 bg-white px-6 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={
              saving ||
              !canCreate
            }
            className="inline-flex h-12 min-w-[180px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-bold text-white shadow-md shadow-blue-100 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          >
            {saving ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />

                Guardando…
              </>
            ) : (
              'Crear paciente'
            )}
          </button>
        </div>
      ) : null}


      <PatientDuplicateDialog
        matches={
          duplicateMatches
        }
        busy={
          saving
        }
        onReview={
          reviewDuplicate
        }
        onBack={() => {
          setDuplicateMatches(
            [],
          )

          pendingPatientPayloadRef.current =
            null
        }}
        onContinue={
          createDespiteWarning
        }
      />
    </form>
  )


  if (
    !isNew
  ) {
    return formContent
  }


  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-5"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-patient-modal-title"
        className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
              Expediente clínico
            </p>

            <h1
              id="new-patient-modal-title"
              className="mt-1 truncate text-xl font-bold text-slate-900 sm:text-2xl"
            >
              Nuevo paciente
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Registra la información disponible. Los datos faltantes podrán agregarse después desde el expediente.
            </p>
          </div>

          <button
            type="button"
            onClick={
              discard
            }
            disabled={
              saving
            }
            aria-label="Cerrar nuevo paciente"
            title="Cerrar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-2xl leading-none text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-5 sm:px-6 lg:px-8">
          {formContent}
        </div>
      </section>
    </div>
  )
}