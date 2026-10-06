import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  profileFieldLabel,
} from '../Patients/patientProfileDisplay'

import {
  formatClock,
  formatLongDate,
  statusTone,
} from './appointmentDisplay'


const actionLabels = {
  CONFIRMADA: 'Confirmar cita',
  NO_ASISTIO: 'Marcar inasistencia',
}


const formatStartedAt = (
  value,
  timeZone,
) =>
  new Intl.DateTimeFormat(
    'es-NI',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    },
  ).format(new Date(value))


const compactDate = (
  value,
) =>
  value
    .split('-')
    .reverse()
    .join('/')


const rescheduleInterval = (
  event,
  prefix,
) => (
  `${compactDate(
    event[
      `${prefix}_date`
    ],
  )} · ${formatClock(
    event[
      `${prefix}_start_time`
    ],
  )} · ${
    event[
      `${prefix}_duration_minutes`
    ]
  } min`
)


function ActionIcon({
  children,
}) {
  return (
    <span
      aria-hidden="true"
      className="
        grid
        h-8
        w-8
        shrink-0
        place-items-center
        rounded-lg
        bg-white/15
        text-lg
      "
    >
      {children}
    </span>
  )
}


export default function AppointmentDetailsPanel({
  appointment,
  canEdit,
  canCheckIn,
  canViewPatient,
  canCompletePatientProfile,
  canStartAttendance,
  canContinueAttendance,
  timeZone,
  onClose,
  onEdit,
  onStatus,
  onOpenPatient,
  onCompletePatientProfile,
  onStartAttendance,
  onCheckIn,
  onUndoCheckIn,
  onContinueAttendance,
  rescheduleHistory = [],
  rescheduleHistoryLoading = false,
  rescheduleHistoryError = '',
}) {
  const titleRef = useRef(null)

  const [
    cancelling,
    setCancelling,
  ] = useState(false)

  const [
    cancellationReason,
    setCancellationReason,
  ] = useState(
    appointment
      .cancellation_reason || '',
  )

  const [
    error,
    setError,
  ] = useState(null)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    correctingArrival,
    setCorrectingArrival,
  ] = useState(false)

  const [
    arrivalReason,
    setArrivalReason,
  ] = useState('')


  useEffect(() => {
    setCancelling(false)

    setCorrectingArrival(false)

    setCancellationReason(
      appointment
        .cancellation_reason || '',
    )
  }, [
    appointment
      .cancellation_reason,
    appointment.status,
  ])


  useEffect(() => {
    titleRef.current?.focus()

    const closeOnEscape = (
      event,
    ) => {
      if (
        event.key ===
        'Escape'
      ) {
        onClose()
      }
    }

    window.addEventListener(
      'keydown',
      closeOnEscape,
    )

    return () =>
      window.removeEventListener(
        'keydown',
        closeOnEscape,
      )
  }, [onClose])


  const transition = async (
    status,
    extra = {},
  ) => {
    setSaving(true)
    setError(null)

    try {
      await onStatus(
        status,
        extra,
      )

      if (
        status ===
        'CANCELADA'
      ) {
        setCancelling(false)
      }
    } catch (
      requestError
    ) {
      setError(
        requestError,
      )
    } finally {
      setSaving(false)
    }
  }


  const clinicalAction = async (
    action,
  ) => {
    setSaving(true)
    setError(null)

    try {
      await action()
    } catch (
      requestError
    ) {
      setError(
        requestError,
      )
    } finally {
      setSaving(false)
    }
  }


  const scheduled =
    appointment.status ===
    'PROGRAMADA'

  const confirmed =
    appointment.status ===
    'CONFIRMADA'

  const checkedIn =
    appointment.status ===
    'PRESENTE'

  const patientInactive =
    appointment
      .patient_is_active ===
    false

  const editable =
    canEdit &&
    (
      scheduled ||
      confirmed
    )

  const canRegisterArrival =
    canCheckIn &&
    !patientInactive &&
    !appointment.consultation &&
    (
      scheduled ||
      confirmed
    )

  const canCorrectArrival =
    canEdit &&
    checkedIn &&
    !appointment.consultation

  const canStart =
    canStartAttendance &&
    !patientInactive &&
    !appointment.consultation &&
    (
      scheduled ||
      confirmed ||
      checkedIn
    )

  const startAvailable =
    checkedIn ||
    appointment
      .attendance
      ?.can_start === true

  const canContinue =
    canContinueAttendance &&
    appointment.status ===
      'EN_ATENCION' &&
    Boolean(
      appointment
        .consultation,
    )

  const canViewConsultation =
    canContinueAttendance &&
    appointment.status ===
      'COMPLETADA' &&
    Boolean(
      appointment
        .consultation,
    )

  const hasActions =
    editable ||
    canViewPatient ||
    canRegisterArrival ||
    canCorrectArrival ||
    canStart ||
    canContinue ||
    canViewConsultation

  const profileError =
    error?.data?.code ===
    'patient_profile_incomplete'

  const missingFields =
    profileError &&
    Array.isArray(
      error.data
        .missing_fields,
    )
      ? error.data
          .missing_fields
      : []

  const errorMessage =
    typeof error ===
    'string'
      ? error
      : (
          error
            ?.data
            ?.detail ||
          error
            ?.message ||
          ''
        )


  return (
    <div
      className="
        fixed
        inset-0
        z-50
        flex
        items-center
        justify-center
        bg-slate-950/40
        p-0
        backdrop-blur-[3px]
        sm:p-6
      "
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de cita"
        className="
          h-full
          w-full
          overflow-y-auto
          bg-slate-50
          shadow-2xl

          sm:h-auto
          sm:max-h-[calc(100dvh-3rem)]
          sm:max-w-3xl
          sm:rounded-[28px]
          sm:border
          sm:border-slate-200
        "
      >
        {/* ================= HEADER ================= */}

        <header
          className="
            sticky
            top-0
            z-20
            flex
            items-start
            justify-between
            border-b
            border-slate-200
            bg-white/95
            px-5
            py-5
            backdrop-blur
            sm:px-7
          "
        >
          <div>
            <div
              className="
                inline-flex
                items-center
                gap-2
                rounded-full
                bg-blue-50
                px-3
                py-1
                text-xs
                font-bold
                uppercase
                tracking-[0.12em]
                text-blue-700
              "
            >
              <span
                aria-hidden="true"
              >
                ◷
              </span>

              Detalle de cita
            </div>

            <h2
              ref={titleRef}
              tabIndex="-1"
              id="appointment-detail-title"
              className="
                mt-2
                font-sans
                text-2xl
                font-bold
                tracking-tight
                text-slate-900
                outline-none
                sm:text-3xl
              "
            >
              {
                appointment
                  .patient_name
              }
            </h2>

            <p
              className="
                mt-1
                text-sm
                font-semibold
                text-slate-500
              "
            >
              {
                appointment
                  .patient_code
              }
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="
              grid
              h-11
              w-11
              shrink-0
              place-items-center
              rounded-xl
              border
              border-slate-200
              bg-white
              text-2xl
              font-light
              text-slate-500
              transition
              hover:bg-slate-100
              hover:text-slate-800
              focus-visible:outline-2
              focus-visible:outline-offset-2
              focus-visible:outline-blue-600
            "
          >
            ×
          </button>
        </header>


        <div
          className="
            space-y-6
            p-4
            sm:p-6
          "
        >
          {/* ================= AVISOS ================= */}

          {patientInactive ? (
            <div
              className="
                rounded-2xl
                border
                border-amber-200
                bg-amber-50
                px-4
                py-3
                text-sm
                font-semibold
                text-amber-900
              "
            >
              Paciente inactivo
            </div>
          ) : null}


          {error ? (
            <div
              role="alert"
              className="
                rounded-2xl
                border
                border-red-200
                bg-red-50
                p-4
                text-sm
                text-red-800
              "
            >
              <div
                className="
                  flex
                  gap-3
                "
              >
                <span
                  aria-hidden="true"
                  className="
                    grid
                    h-8
                    w-8
                    shrink-0
                    place-items-center
                    rounded-full
                    bg-red-100
                    font-bold
                    text-red-700
                  "
                >
                  !
                </span>

                <div>
                  <strong
                    className="
                      block
                      text-[15px]
                    "
                  >
                    {
                      errorMessage
                    }
                  </strong>

                  {missingFields
                    .length >
                  0 ? (
                    <>
                      <p
                        className="
                          mt-3
                          text-xs
                          font-bold
                          uppercase
                          tracking-wide
                          text-red-700
                        "
                      >
                        Campos faltantes
                      </p>

                      <ul
                        className="
                          mt-1
                          list-disc
                          space-y-1
                          pl-5
                        "
                      >
                        {missingFields
                          .map(
                            (
                              field,
                            ) => (
                              <li
                                key={
                                  field
                                }
                              >
                                {profileFieldLabel(
                                  field,
                                )}
                              </li>
                            ),
                          )}
                      </ul>
                    </>
                  ) : null}

                  {profileError &&
                  canCompletePatientProfile ? (
                    <button
                      type="button"
                      onClick={
                        onCompletePatientProfile
                      }
                      className="
                        mt-4
                        rounded-xl
                        border
                        border-red-300
                        bg-white
                        px-4
                        py-2.5
                        text-sm
                        font-bold
                        text-red-800
                        transition
                        hover:bg-red-100
                      "
                    >
                      Completar perfil
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}


          {/* ================= RESUMEN ================= */}

          <section
            className="
              overflow-hidden
              rounded-2xl
              border
              border-blue-100
              bg-gradient-to-br
              from-blue-50
              to-indigo-50
              p-5
            "
          >
            <div
              className="
                flex
                flex-col
                gap-4
                sm:flex-row
                sm:items-start
                sm:justify-between
              "
            >
              <div>
                <span
                  className={`
                    inline-flex
                    rounded-full
                    px-3
                    py-1.5
                    text-xs
                    font-bold
                    ring-1
                    ${
                      statusTone[
                        appointment
                          .status
                      ] ||
                      statusTone
                        .PROGRAMADA
                    }
                  `}
                >
                  {
                    appointment
                      .status_display
                  }
                </span>

                <p
                  className="
                    mt-4
                    text-lg
                    font-bold
                    text-slate-900
                    sm:text-xl
                  "
                >
                  {formatLongDate(
                    appointment
                      .date,
                  )}
                </p>

                <p
                  className="
                    mt-2
                    text-base
                    font-bold
                    text-blue-800
                  "
                >
                  {formatClock(
                    appointment
                      .start_time,
                  )}
                  {' – '}
                  {formatClock(
                    appointment
                      .end_time,
                  )}
                </p>

                <p
                  className="
                    mt-1
                    text-sm
                    font-medium
                    text-slate-500
                  "
                >
                  {
                    appointment
                      .duration_minutes
                  }{' '}
                  minutos
                </p>
              </div>

              <div
                className="
                  rounded-xl
                  bg-white/70
                  px-4
                  py-3
                  text-sm
                  shadow-sm
                  ring-1
                  ring-blue-100
                "
              >
                <p
                  className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wide
                    text-slate-400
                  "
                >
                  Odontólogo
                </p>

                <p
                  className="
                    mt-1
                    font-bold
                    text-slate-800
                  "
                >
                  {
                    appointment
                      .dentist_name
                  }
                </p>
              </div>
            </div>
          </section>


          {/* ================= INFORMACIÓN ================= */}

          <section
            className="
              rounded-2xl
              border
              border-slate-200
              bg-white
              p-5
              shadow-sm
            "
          >
            <h3
              className="
                text-base
                font-bold
                text-slate-900
              "
            >
              Información de la cita
            </h3>

            <dl
              className="
                mt-5
                grid
                gap-5
                sm:grid-cols-2
              "
            >
              <div>
                <dt
                  className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-slate-400
                  "
                >
                  Servicio
                </dt>

                <dd
                  className="
                    mt-1.5
                    text-sm
                    font-medium
                    leading-6
                    text-slate-700
                  "
                >
                  {
                    appointment
                      .service_name ||
                    'Sin servicio asociado.'
                  }
                </dd>
              </div>

              <div>
                <dt
                  className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-slate-400
                  "
                >
                  Motivo
                </dt>

                <dd
                  className="
                    mt-1.5
                    text-sm
                    font-medium
                    leading-6
                    text-slate-700
                  "
                >
                  {
                    appointment
                      .reason
                  }
                </dd>
              </div>

              <div
                className="
                  sm:col-span-2
                "
              >
                <dt
                  className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-slate-400
                  "
                >
                  Notas
                </dt>

                <dd
                  className="
                    mt-1.5
                    whitespace-pre-wrap
                    text-sm
                    leading-6
                    text-slate-700
                  "
                >
                  {
                    appointment
                      .notes ||
                    'Sin notas adicionales.'
                  }
                </dd>
              </div>

              {appointment
                .consultation ? (
                <div>
                  <dt
                    className="
                      text-xs
                      font-bold
                      uppercase
                      tracking-wider
                      text-slate-400
                    "
                  >
                    Consulta asociada
                  </dt>

                  <dd
                    className="
                      mt-1.5
                      text-sm
                      font-bold
                      text-slate-800
                    "
                  >
                    Consulta #
                    {
                      appointment
                        .consultation
                    }
                  </dd>
                </div>
              ) : null}

              {appointment
                .attendance_started_at ? (
                <div>
                  <dt
                    className="
                      text-xs
                      font-bold
                      uppercase
                      tracking-wider
                      text-slate-400
                    "
                  >
                    Inicio real
                  </dt>

                  <dd
                    className="
                      mt-1.5
                      text-sm
                      text-slate-700
                    "
                  >
                    {formatStartedAt(
                      appointment
                        .attendance_started_at,
                      timeZone,
                    )}
                  </dd>
                </div>
              ) : null}

              {appointment
                .cancellation_reason ? (
                <div
                  className="
                    sm:col-span-2
                  "
                >
                  <dt
                    className="
                      text-xs
                      font-bold
                      uppercase
                      tracking-wider
                      text-slate-400
                    "
                  >
                    Motivo de cancelación
                  </dt>

                  <dd
                    className="
                      mt-1.5
                      text-sm
                      text-slate-700
                    "
                  >
                    {
                      appointment
                        .cancellation_reason
                    }
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>


          {/* =============== HISTORIAL =============== */}

          <section
            aria-label="Historial de reprogramaciones"
            className="
              rounded-2xl
              border
              border-slate-200
              bg-white
              p-5
              shadow-sm
            "
          >
            <div
              className="
                flex
                items-center
                justify-between
                gap-3
              "
            >
              <div>
                <h3
                  className="
                    text-base
                    font-bold
                    text-slate-900
                  "
                >
                  Historial de reprogramaciones
                </h3>

                <p
                  className="
                    mt-1
                    text-sm
                    text-slate-500
                  "
                >
                  Cambios de fecha y horario registrados.
                </p>
              </div>

              {rescheduleHistory
                .length >
              0 ? (
                <span
                  className="
                    rounded-full
                    bg-slate-100
                    px-3
                    py-1
                    text-xs
                    font-bold
                    text-slate-600
                  "
                >
                  {
                    rescheduleHistory
                      .length
                  }
                </span>
              ) : null}
            </div>

            {rescheduleHistoryLoading ? (
              <p
                role="status"
                className="
                  mt-4
                  text-sm
                  text-slate-500
                "
              >
                Cargando historial…
              </p>
            ) : null}

            {rescheduleHistoryError ? (
              <p
                role="alert"
                className="
                  mt-4
                  text-sm
                  text-red-700
                "
              >
                {
                  rescheduleHistoryError
                }
              </p>
            ) : null}

            {!rescheduleHistoryLoading &&
            !rescheduleHistoryError &&
            rescheduleHistory
              .length ===
              0 ? (
              <div
                className="
                  mt-4
                  rounded-xl
                  bg-slate-50
                  px-4
                  py-3
                  text-sm
                  text-slate-500
                "
              >
                Sin reprogramaciones registradas.
              </div>
            ) : null}

            {!rescheduleHistoryLoading &&
            !rescheduleHistoryError &&
            rescheduleHistory
              .length >
              0 ? (
              <ol
                className="
                  mt-4
                  space-y-3
                "
              >
                {rescheduleHistory
                  .map(
                    (event) => (
                      <li
                        key={
                          event.id
                        }
                        className="
                          rounded-xl
                          border
                          border-slate-200
                          bg-slate-50/70
                          p-4
                          text-sm
                          text-slate-700
                        "
                      >
                        <div
                          className="
                            grid
                            gap-2
                            sm:grid-cols-2
                          "
                        >
                          <p>
                            <span
                              className="
                                block
                                text-xs
                                font-bold
                                uppercase
                                tracking-wide
                                text-slate-400
                              "
                            >
                              Anterior
                            </span>

                            <span
                              className="
                                mt-1
                                block
                                font-medium
                              "
                            >
                              {rescheduleInterval(
                                event,
                                'previous',
                              )}
                            </span>
                          </p>

                          <p>
                            <span
                              className="
                                block
                                text-xs
                                font-bold
                                uppercase
                                tracking-wide
                                text-slate-400
                              "
                            >
                              Nuevo
                            </span>

                            <span
                              className="
                                mt-1
                                block
                                font-medium
                              "
                            >
                              {rescheduleInterval(
                                event,
                                'new',
                              )}
                            </span>
                          </p>
                        </div>

                        {event.reason ? (
                          <p
                            className="
                              mt-3
                              rounded-lg
                              bg-white
                              px-3
                              py-2
                            "
                          >
                            {
                              event.reason
                            }
                          </p>
                        ) : null}

                        <p
                          className="
                            mt-3
                            text-xs
                            text-slate-500
                          "
                        >
                          {
                            event
                              .changed_by_name
                          }
                          {' · '}
                          {formatStartedAt(
                            event
                              .created_at,
                            timeZone,
                          )}
                        </p>
                      </li>
                    ),
                  )}
              </ol>
            ) : null}
          </section>


          {/* ============== CANCELACIÓN ============== */}

          {cancelling ? (
            <section
              className="
                rounded-2xl
                border
                border-red-200
                bg-red-50
                p-5
              "
            >
              <div
                className="
                  flex
                  items-start
                  gap-3
                "
              >
                <div
                  aria-hidden="true"
                  className="
                    grid
                    h-10
                    w-10
                    shrink-0
                    place-items-center
                    rounded-xl
                    bg-red-100
                    text-lg
                    font-bold
                    text-red-700
                  "
                >
                  !
                </div>

                <div
                  className="
                    flex-1
                  "
                >
                  <h3
                    className="
                      text-base
                      font-bold
                      text-red-900
                    "
                  >
                    Cancelar cita
                  </h3>

                  <p
                    className="
                      mt-1
                      text-sm
                      text-red-700
                    "
                  >
                    La cita permanecerá registrada en el historial como cancelada.
                  </p>
                </div>
              </div>

              <label
                className="
                  mt-4
                  block
                  text-sm
                  font-bold
                  text-red-900
                "
              >
                Motivo de cancelación

                <span
                  className="
                    ml-1
                    font-normal
                    text-red-600
                  "
                >
                  (opcional)
                </span>

                <textarea
                  value={
                    cancellationReason
                  }
                  onChange={(
                    event,
                  ) =>
                    setCancellationReason(
                      event.target
                        .value,
                    )
                  }
                  rows="3"
                  placeholder="Ej. El paciente solicitó reprogramar."
                  className="
                    mt-2
                    w-full
                    resize-y
                    rounded-xl
                    border
                    border-red-200
                    bg-white
                    p-3
                    text-sm
                    font-medium
                    text-slate-800
                    outline-none
                    focus:border-red-400
                    focus:ring-4
                    focus:ring-red-100
                  "
                />
              </label>

              <div
                className="
                  mt-4
                  flex
                  flex-col-reverse
                  gap-2
                  sm:flex-row
                  sm:justify-end
                "
              >
                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={() =>
                    setCancelling(
                      false,
                    )
                  }
                  className="
                    h-11
                    rounded-xl
                    border
                    border-slate-300
                    bg-white
                    px-5
                    text-sm
                    font-bold
                    text-slate-700
                    transition
                    hover:bg-slate-50
                  "
                >
                  Volver
                </button>

                <button
                  disabled={
                    saving
                  }
                  type="button"
                  onClick={() =>
                    transition(
                      'CANCELADA',
                      {
                        cancellation_reason:
                          cancellationReason
                            .trim(),
                      },
                    )
                  }
                  className="
                    h-11
                    rounded-xl
                    bg-red-700
                    px-5
                    text-sm
                    font-bold
                    text-white
                    shadow-sm
                    transition
                    hover:bg-red-800
                    disabled:opacity-60
                  "
                >
                  {saving
                    ? 'Cancelando…'
                    : 'Confirmar cancelación'}
                </button>
              </div>
            </section>
          ) : null}


          {/* ============ CORREGIR LLEGADA ============ */}

          {correctingArrival ? (
            <section
              className="
                rounded-2xl
                border
                border-amber-200
                bg-amber-50
                p-5
              "
            >
              <h3
                className="
                  text-base
                  font-bold
                  text-amber-900
                "
              >
                Corregir llegada
              </h3>

              <p
                className="
                  mt-1
                  text-sm
                  text-amber-700
                "
              >
                Indica el motivo de la corrección para conservar la trazabilidad.
              </p>

              <label
                className="
                  mt-4
                  block
                  text-sm
                  font-bold
                  text-amber-900
                "
              >
                Motivo de corrección de llegada

                <textarea
                  maxLength={1000}
                  value={
                    arrivalReason
                  }
                  onChange={(
                    event,
                  ) =>
                    setArrivalReason(
                      event.target
                        .value,
                    )
                  }
                  rows="3"
                  className="
                    mt-2
                    w-full
                    rounded-xl
                    border
                    border-amber-200
                    bg-white
                    p-3
                    text-sm
                    outline-none
                    focus:border-amber-400
                    focus:ring-4
                    focus:ring-amber-100
                  "
                />
              </label>

              <div
                className="
                  mt-4
                  flex
                  flex-col-reverse
                  gap-2
                  sm:flex-row
                  sm:justify-end
                "
              >
                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={() =>
                    setCorrectingArrival(
                      false,
                    )
                  }
                  className="
                    h-11
                    rounded-xl
                    border
                    border-slate-300
                    bg-white
                    px-5
                    text-sm
                    font-bold
                    text-slate-700
                  "
                >
                  Volver
                </button>

                <button
                  type="button"
                  disabled={
                    saving ||
                    !arrivalReason
                      .trim()
                  }
                  onClick={() =>
                    clinicalAction(
                      () =>
                        onUndoCheckIn(
                          arrivalReason
                            .trim(),
                        ),
                    )
                  }
                  className="
                    h-11
                    rounded-xl
                    bg-amber-700
                    px-5
                    text-sm
                    font-bold
                    text-white
                    transition
                    hover:bg-amber-800
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  Confirmar corrección
                </button>
              </div>
            </section>
          ) : null}


          {/* ================= ACCIONES ================= */}

          {hasActions &&
          !cancelling &&
          !correctingArrival ? (
            <section
              aria-label="Acciones de la cita"
              className="
                rounded-2xl
                border
                border-slate-200
                bg-white
                p-4
                shadow-sm
                sm:p-5
              "
            >
              <div
                className="
                  mb-4
                "
              >
                <h3
                  className="
                    text-base
                    font-bold
                    text-slate-900
                  "
                >
                  Acciones
                </h3>

                <p
                  className="
                    mt-1
                    text-sm
                    text-slate-500
                  "
                >
                  Gestiona la cita y la atención del paciente.
                </p>
              </div>


              {/* ACCIONES PRINCIPALES */}

              <div
                className="
                  grid
                  gap-3
                  sm:grid-cols-2
                  lg:grid-cols-4
                "
              >
                {canViewPatient ? (
                  <button
                    type="button"
                    onClick={
                      onOpenPatient
                    }
                    className="
                      flex
                      min-h-[58px]
                      items-center
                      justify-center
                      gap-2.5
                      rounded-xl
                      border
                      border-blue-200
                      bg-white
                      px-4
                      py-3
                      text-sm
                      font-bold
                      text-blue-800
                      shadow-sm
                      transition
                      hover:border-blue-300
                      hover:bg-blue-50
                      focus-visible:outline-2
                      focus-visible:outline-offset-2
                      focus-visible:outline-blue-600
                    "
                  >
                    <ActionIcon>
                      ▤
                    </ActionIcon>

                    Abrir expediente
                  </button>
                ) : null}


                {canRegisterArrival ? (
                  <button
                    disabled={
                      saving
                    }
                    type="button"
                    onClick={() =>
                      clinicalAction(
                        onCheckIn,
                      )
                    }
                    className="
                      flex
                      min-h-[58px]
                      items-center
                      justify-center
                      gap-2.5
                      rounded-xl
                      bg-violet-700
                      px-4
                      py-3
                      text-sm
                      font-bold
                      text-white
                      shadow-md
                      shadow-violet-100
                      transition
                      hover:bg-violet-800
                      disabled:cursor-wait
                      disabled:opacity-60
                      focus-visible:outline-2
                      focus-visible:outline-offset-2
                      focus-visible:outline-violet-700
                    "
                  >
                    <ActionIcon>
                      ＋
                    </ActionIcon>

                    {saving
                      ? 'Registrando…'
                      : 'Registrar llegada'}
                  </button>
                ) : null}


                {canStart ? (
                  <button
                    disabled={
                      saving ||
                      !startAvailable
                    }
                    type="button"
                    onClick={() =>
                      clinicalAction(
                        onStartAttendance,
                      )
                    }
                    className="
                      flex
                      min-h-[58px]
                      items-center
                      justify-center
                      gap-2.5
                      rounded-xl
                      bg-blue-700
                      px-4
                      py-3
                      text-sm
                      font-bold
                      text-white
                      shadow-md
                      shadow-blue-100
                      transition
                      hover:bg-blue-800
                      disabled:cursor-not-allowed
                      disabled:bg-blue-400
                      disabled:opacity-70
                      focus-visible:outline-2
                      focus-visible:outline-offset-2
                      focus-visible:outline-blue-700
                    "
                  >
                    <ActionIcon>
                      ✚
                    </ActionIcon>

                    {saving
                      ? 'Iniciando…'
                      : 'Iniciar consulta'}
                  </button>
                ) : null}


                {editable ? (
                  <button
                    type="button"
                    onClick={
                      onEdit
                    }
                    className="
                      flex
                      min-h-[58px]
                      items-center
                      justify-center
                      gap-2.5
                      rounded-xl
                      border
                      border-slate-300
                      bg-white
                      px-4
                      py-3
                      text-sm
                      font-bold
                      text-slate-700
                      shadow-sm
                      transition
                      hover:bg-slate-50
                      hover:text-slate-900
                      focus-visible:outline-2
                      focus-visible:outline-offset-2
                      focus-visible:outline-slate-500
                    "
                  >
                    <ActionIcon>
                      ✎
                    </ActionIcon>

                    Editar
                  </button>
                ) : null}


                {canCorrectArrival ? (
                  <button
                    type="button"
                    disabled={
                      saving
                    }
                    onClick={() =>
                      setCorrectingArrival(
                        true,
                      )
                    }
                    className="
                      flex
                      min-h-[58px]
                      items-center
                      justify-center
                      gap-2
                      rounded-xl
                      border
                      border-amber-300
                      bg-amber-50
                      px-4
                      py-3
                      text-sm
                      font-bold
                      text-amber-800
                      transition
                      hover:bg-amber-100
                    "
                  >
                    Corregir llegada
                  </button>
                ) : null}


                {canContinue ? (
                  <button
                    type="button"
                    onClick={
                      onContinueAttendance
                    }
                    className="
                      flex
                      min-h-[58px]
                      items-center
                      justify-center
                      gap-2
                      rounded-xl
                      bg-blue-700
                      px-4
                      py-3
                      text-sm
                      font-bold
                      text-white
                      shadow-sm
                      transition
                      hover:bg-blue-800
                    "
                  >
                    Continuar atención
                  </button>
                ) : null}


                {canViewConsultation ? (
                  <button
                    type="button"
                    onClick={
                      onContinueAttendance
                    }
                    className="
                      flex
                      min-h-[58px]
                      items-center
                      justify-center
                      gap-2
                      rounded-xl
                      bg-blue-700
                      px-4
                      py-3
                      text-sm
                      font-bold
                      text-white
                      shadow-sm
                      transition
                      hover:bg-blue-800
                    "
                  >
                    Ver consulta
                  </button>
                ) : null}
              </div>


              {/* INFO DISPONIBILIDAD */}

              {canStart &&
              !checkedIn &&
              !startAvailable ? (
                <div
                  role="status"
                  className="
                    mt-4
                    flex
                    items-start
                    gap-3
                    rounded-xl
                    border
                    border-blue-100
                    bg-blue-50
                    px-4
                    py-3
                    text-sm
                    text-blue-900
                  "
                >
                  <span
                    aria-hidden="true"
                    className="
                      grid
                      h-8
                      w-8
                      shrink-0
                      place-items-center
                      rounded-full
                      bg-blue-100
                      font-bold
                      text-blue-700
                    "
                  >
                    i
                  </span>

                  <p
                    className="
                      pt-1
                      leading-5
                    "
                  >
                    {
                      appointment
                        .attendance
                        ?.detail ||
                      'Consultando disponibilidad de atención…'
                    }
                  </p>
                </div>
              ) : null}


              {/* ACCIONES DE ESTADO */}

              {editable ? (
                <div
                  className="
                    mt-5
                    border-t
                    border-slate-200
                    pt-5
                  "
                >
                  <p
                    className="
                      mb-3
                      text-xs
                      font-bold
                      uppercase
                      tracking-[0.12em]
                      text-slate-400
                    "
                  >
                    Estado de la cita
                  </p>

                  <div
                    className="
                      flex
                      flex-col
                      gap-3
                      sm:flex-row
                      sm:flex-wrap
                    "
                  >
                    {scheduled ? (
                      <button
                        disabled={
                          saving
                        }
                        type="button"
                        onClick={() =>
                          transition(
                            'CONFIRMADA',
                          )
                        }
                        className="
                          inline-flex
                          min-h-[48px]
                          items-center
                          justify-center
                          gap-2
                          rounded-xl
                          bg-emerald-700
                          px-5
                          py-3
                          text-sm
                          font-bold
                          text-white
                          shadow-sm
                          transition
                          hover:bg-emerald-800
                          disabled:opacity-60
                        "
                      >
                        <span
                          aria-hidden="true"
                        >
                          ✓
                        </span>

                        {
                          actionLabels
                            .CONFIRMADA
                        }
                      </button>
                    ) : null}


                    {confirmed ? (
                      <button
                        disabled={
                          saving
                        }
                        type="button"
                        onClick={() =>
                          transition(
                            'NO_ASISTIO',
                          )
                        }
                        className="
                          inline-flex
                          min-h-[48px]
                          items-center
                          justify-center
                          gap-2
                          rounded-xl
                          border
                          border-amber-300
                          bg-amber-50
                          px-5
                          py-3
                          text-sm
                          font-bold
                          text-amber-800
                          transition
                          hover:bg-amber-100
                        "
                      >
                        {
                          actionLabels
                            .NO_ASISTIO
                        }
                      </button>
                    ) : null}


                    <button
                      type="button"
                      onClick={() =>
                        setCancelling(
                          true,
                        )
                      }
                      className="
                        inline-flex
                        min-h-[48px]
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        border
                        border-red-300
                        bg-white
                        px-5
                        py-3
                        text-sm
                        font-bold
                        text-red-700
                        transition
                        hover:bg-red-50
                      "
                    >
                      <span
                        aria-hidden="true"
                      >
                        ×
                      </span>

                      Cancelar cita
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  )
}