import {
  formatClock,
  formatLongDate,
  shiftDate,
  startOfWeek,
  todayValue,
} from './appointmentDisplay'

import {
  getAppointmentStatusStyle,
} from './appointmentStatusStyles'

const shortDay =
  new Intl.DateTimeFormat(
    'es-NI',
    {
      weekday: 'short',
      timeZone: 'UTC',
    },
  )

export default function AppointmentWeekView({
  appointments,
  selectedDate,
  onOpenDay,
  onSelect,
}) {
  const firstDay =
    startOfWeek(
      selectedDate,
    )

  const days =
    Array.from(
      {
        length: 7,
      },
      (
        _,
        index,
      ) =>
        shiftDate(
          firstDay,
          index,
        ),
    )

  return (
    <div
      className="
        overflow-x-auto
        rounded-2xl
        border
        border-slate-200
        bg-white
        shadow-sm
      "
      role="region"
      aria-label="Vista semanal"
      tabIndex="0"
    >
      <div
        className="
          grid
          min-w-[980px]
          grid-cols-7
          divide-x
          divide-slate-200
        "
      >
        {days.map(
          (day) => {
            const dayAppointments =
              appointments
                .filter(
                  (item) =>
                    item.date ===
                    day,
                )
                .sort(
                  (
                    a,
                    b,
                  ) =>
                    a.start_time.localeCompare(
                      b.start_time,
                    ),
                )

            const isToday =
              day ===
              todayValue()

            const date =
              new Date(
                `${day}T12:00:00Z`,
              )

            const label =
              shortDay
                .format(
                  date,
                )
                .replace(
                  '.',
                  '',
                )

            return (
              <section
                key={day}
                className="
                  min-h-[420px]
                  bg-white
                "
              >
                <button
                  type="button"
                  onClick={() =>
                    onOpenDay(
                      day,
                    )
                  }
                  aria-label={`Abrir agenda del ${formatLongDate(
                    day,
                  )}`}
                  className={`
                    flex
                    w-full
                    items-center
                    justify-between

                    border-b
                    border-slate-200

                    px-4
                    py-4

                    text-left

                    focus-visible:outline-2
                    focus-visible:outline-offset-[-2px]
                    focus-visible:outline-blue-600

                    ${
                      isToday
                        ? 'bg-blue-50'
                        : 'bg-slate-50/70 hover:bg-slate-50'
                    }
                  `}
                >
                  <span
                    className="
                      text-xs
                      font-bold
                      uppercase
                      tracking-wider
                      text-slate-500
                    "
                  >
                    {label}
                  </span>

                  <span
                    className={`
                      grid
                      h-8
                      w-8
                      place-items-center

                      rounded-full

                      text-sm
                      font-bold

                      ${
                        isToday
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-800'
                      }
                    `}
                  >
                    {
                      date.getUTCDate()
                    }
                  </span>
                </button>

                <div
                  className="
                    space-y-2
                    p-2.5
                  "
                >
                  {dayAppointments.length ===
                  0 ? (
                    <p
                      className="
                        px-2
                        py-5
                        text-center
                        text-xs
                        text-slate-400
                      "
                    >
                      Sin citas
                    </p>
                  ) : null}

                  {dayAppointments.map(
                    (
                      appointment,
                    ) => {
                      const statusStyle =
                        getAppointmentStatusStyle(
                          appointment.status,
                        )

                      return (
                        <button
                          key={
                            appointment.id
                          }
                          type="button"
                          onClick={() =>
                            onSelect(
                              appointment,
                            )
                          }
                          aria-label={`${appointment.patient_name}, ${formatClock(
                            appointment.start_time,
                          )} a ${formatClock(
                            appointment.end_time,
                          )}, ${appointment.status_display}`}
                          title={`${appointment.patient_name} • ${formatClock(
                            appointment.start_time,
                          )}–${formatClock(
                            appointment.end_time,
                          )} • ${appointment.status_display}`}
                          className={`
                            w-full

                            rounded-xl

                            border
                            border-l-4

                            p-3

                            text-left

                            shadow-sm

                            transition

                            hover:-translate-y-px
                            hover:shadow-md

                            focus-visible:outline-none
                            focus-visible:ring-2
                            focus-visible:ring-blue-500
                            focus-visible:ring-offset-1

                            motion-reduce:transition-none
                            motion-reduce:hover:translate-y-0

                            ${
                              statusStyle.card
                            }
                          `}
                        >
                          <div
                            className="
                              flex
                              items-center
                              justify-between
                              gap-2
                            "
                          >
                            <span
                              className="
                                text-[11px]
                                font-extrabold
                                text-inherit
                              "
                            >
                              {formatClock(
                                appointment.start_time,
                              )}

                              –

                              {formatClock(
                                appointment.end_time,
                              )}
                            </span>

                            <span
                              aria-hidden="true"
                              className={`
                                h-2
                                w-2
                                shrink-0
                                rounded-full

                                ${
                                  statusStyle.dot
                                }
                              `}
                            />
                          </div>

                          <strong
                            className="
                              mt-1
                              block

                              overflow-hidden

                              text-sm
                              font-extrabold
                              leading-5
                              text-inherit

                              [display:-webkit-box]
                              [-webkit-box-orient:vertical]
                              [-webkit-line-clamp:2]
                            "
                          >
                            {
                              appointment.patient_name
                            }
                          </strong>

                          {appointment.reason ? (
                            <span
                              className="
                                mt-1
                                block

                                overflow-hidden

                                text-xs
                                leading-4
                                text-inherit
                                opacity-75

                                [display:-webkit-box]
                                [-webkit-box-orient:vertical]
                                [-webkit-line-clamp:2]
                              "
                            >
                              {
                                appointment.reason
                              }
                            </span>
                          ) : null}

                          <span
                            className="
                              mt-2

                              block

                              overflow-hidden
                              text-ellipsis
                              whitespace-nowrap

                              text-[10px]
                              font-semibold
                              text-inherit
                              opacity-65
                            "
                          >
                            {
                              appointment.dentist_name
                            }
                          </span>

                          <span
                            className={`
                              mt-2

                              inline-flex
                              w-fit
                              items-center
                              gap-1.5

                              rounded-full

                              px-2
                              py-1

                              text-[10px]
                              font-bold

                              ring-1

                              ${
                                statusStyle.badge
                              }
                            `}
                          >
                            <span
                              aria-hidden="true"
                              className={`
                                h-1.5
                                w-1.5
                                rounded-full

                                ${
                                  statusStyle.dot
                                }
                              `}
                            />

                            {
                              appointment.status_display
                            }
                          </span>
                        </button>
                      )
                    },
                  )}
                </div>
              </section>
            )
          },
        )}
      </div>
    </div>
  )
}