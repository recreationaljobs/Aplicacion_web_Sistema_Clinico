import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { createRoot } from 'react-dom/client'

import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

import {
  FINDING_LABELS,
  PERMANENT_ARCHES,
  PRIMARY_ARCHES,
  SURFACE_LABELS,
  toothSurfaces,
} from './odontogramSchema'

import LongitudinalTreatmentPlan from './LongitudinalTreatmentPlan'
import TreatmentResultDialog from './TreatmentResultDialog'

import {
  treatmentConsultationId,
} from './treatmentPlanUtils'


const fieldClass = `
  mt-1.5
  w-full
  rounded-xl
  border
  border-slate-300
  bg-white
  px-3.5
  py-3
  text-sm
  text-slate-800
  outline-none
  transition
  placeholder:text-slate-400
  hover:border-slate-400
  focus:border-cyan-600
  focus:ring-4
  focus:ring-cyan-100
`


const toothOptions = [
  ...PERMANENT_ARCHES.upper,
  ...PERMANENT_ARCHES.lower,
  ...PRIMARY_ARCHES.upper,
  ...PRIMARY_ARCHES.lower,
]


const plannedFindings = [
  'RESTORATION',
  'SEALANT',
  'CROWN',
  'IMPLANT',
  'ROOT_CANAL',
  'EXTRACTION',
]


const emptyForm = () => ({
  serviceId: '',
  serviceSearch: '',
  description: '',
  diagnosisText: '',
  toothCode: '',
  surfaces: [],
  plannedFinding: '',
  notes: '',
})


const displaySurface = (
  surface,
) => {
  const label =
    SURFACE_LABELS[surface] ||
    surface.toLowerCase()

  return `${label
    .charAt(0)
    .toUpperCase()}${label.slice(1)}`
}


/* =========================================================
   FORMULARIO DEL SWEETALERT
========================================================= */

function TreatmentFormModal({
  services,
  onCreate,
  onCreated,
  onClose,
}) {
  const submittingRef =
    useRef(false)

  const [
    form,
    setForm,
  ] = useState(
    emptyForm,
  )

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    formError,
    setFormError,
  ] = useState('')


  const selectedService =
    services.find(
      ({ id }) =>
        String(id) ===
        form.serviceId,
    )


  const availableSurfaces =
    form.toothCode
      ? toothSurfaces(
          form.toothCode,
        )
      : []


  const filteredServices =
    useMemo(() => {
      const search =
        form.serviceSearch
          .trim()
          .toLowerCase()

      if (!search) {
        return []
      }

      return services
        .filter(
          (service) => {
            const text = [
              service.name,
              service.category_name,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()

            return text.includes(
              search,
            )
          },
        )
        .slice(
          0,
          8,
        )
    }, [
      form.serviceSearch,
      services,
    ])


  const update = ({
    target,
  }) => {
    const {
      name,
      value,
    } = target

    setForm(
      (current) => ({
        ...current,

        [name]:
          value,

        ...(name ===
        'toothCode'
          ? {
              surfaces: [],
            }
          : {}),
      }),
    )
  }


  const selectService = (
    service,
  ) => {
    setForm(
      (current) => ({
        ...current,

        serviceId:
          String(
            service.id,
          ),

        serviceSearch:
          service.name,

        description:
          '',
      }),
    )

    setFormError('')
  }


  const clearService = () => {
    setForm(
      (current) => ({
        ...current,

        serviceId:
          '',

        serviceSearch:
          '',
      }),
    )
  }


  const toggleSurface = ({
    target,
  }) => {
    setForm(
      (current) => ({
        ...current,

        surfaces:
          target.checked
            ? [
                ...current.surfaces,
                target.value,
              ]
            : current.surfaces.filter(
                (
                  surface,
                ) =>
                  surface !==
                  target.value,
              ),
      }),
    )
  }


  const submit =
    async () => {
      if (
        submittingRef.current
      ) {
        return
      }

      if (
        !form.serviceId &&
        !form.description.trim()
      ) {
        setFormError(
          'Selecciona un tratamiento del catálogo o escribe un procedimiento personalizado.',
        )

        return
      }

      submittingRef.current =
        true

      setSaving(true)
      setFormError('')

      try {
        const created =
          await onCreate({
            service_id:
              form.serviceId
                ? Number(
                    form.serviceId,
                  )
                : null,

            description:
              form.description.trim(),

            diagnosis_text:
              form.diagnosisText.trim(),

            tooth_code:
              form.toothCode ||
              null,

            surfaces:
              form.surfaces,

            planned_finding:
              form.plannedFinding,

            notes:
              form.notes.trim(),
          })

        onCreated(
          created,
        )

        Swal.close()

        setTimeout(() => {
          Swal.fire({
            icon:
              'success',

            title:
              'Tratamiento agregado',

            text:
              'El tratamiento fue agregado correctamente al plan.',

            confirmButtonText:
              'Aceptar',

            confirmButtonColor:
              '#0e7490',

            heightAuto:
              false,
          })
        }, 150)
      } catch (
        requestError
      ) {
        setFormError(
          requestError.message ||
            'No fue posible guardar el tratamiento.',
        )
      } finally {
        submittingRef.current =
          false

        setSaving(false)
      }
    }


  return (
    <div
      className="
        text-left
      "
    >
      {/* ============================================
          CABECERA
      ============================================ */}

      <div
        className="
          border-b
          border-slate-100
          px-1
          pb-5
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
            className="
              grid
              h-11
              w-11
              shrink-0
              place-items-center
              rounded-xl
              bg-cyan-50
              text-xl
              text-cyan-700
              ring-1
              ring-cyan-100
            "
          >
            +
          </div>

          <div>
            <h2
              className="
                text-xl
                font-bold
                text-slate-900
              "
            >
              Agregar tratamiento
            </h2>

            <p
              className="
                mt-1
                text-sm
                leading-6
                text-slate-500
              "
            >
              Selecciona un tratamiento del catálogo.
              Utiliza texto libre únicamente cuando el
              procedimiento no exista.
            </p>
          </div>
        </div>
      </div>


      <div
        className="
          mt-5
          space-y-5
        "
      >
        {/* ============================================
            BUSCADOR
        ============================================ */}

        <div>
          <div
            className="
              flex
              flex-col
              gap-1
              sm:flex-row
              sm:items-center
              sm:justify-between
            "
          >
            <label
              className="
                text-sm
                font-bold
                text-slate-800
              "
            >
              Buscar tratamiento
            </label>

            <span
              className="
                text-xs
                text-slate-400
              "
            >
              Busca por nombre o categoría
            </span>
          </div>

          <div
            className="
              relative
              mt-2
            "
          >
            <span
              className="
                pointer-events-none
                absolute
                left-4
                top-1/2
                -translate-y-1/2
                text-slate-400
              "
            >
              ⌕
            </span>

            <input
              name="serviceSearch"
              value={
                form.serviceSearch
              }
              onChange={
                update
              }
              disabled={
                Boolean(
                  form.serviceId,
                )
              }
              autoComplete="off"
              placeholder="Ej. Profilaxis, restauración, endodoncia..."
              className="
                w-full
                rounded-xl
                border
                border-slate-300
                bg-white
                py-3
                pl-11
                pr-24
                text-sm
                text-slate-800
                outline-none
                transition
                placeholder:text-slate-400
                focus:border-cyan-600
                focus:ring-4
                focus:ring-cyan-100
                disabled:bg-slate-50
              "
            />

            {form.serviceId ? (
              <button
                type="button"
                onClick={
                  clearService
                }
                className="
                  absolute
                  right-2
                  top-1/2
                  -translate-y-1/2
                  rounded-lg
                  border
                  border-slate-200
                  bg-white
                  px-3
                  py-1.5
                  text-xs
                  font-semibold
                  text-slate-600
                  shadow-sm
                  transition
                  hover:bg-slate-50
                "
              >
                Cambiar
              </button>
            ) : null}
          </div>


         {!form.serviceId &&
          form.serviceSearch.trim() ? (
            <div
              className="
                mt-2
                max-h-52
                overflow-y-auto
                rounded-xl
                border
                border-slate-200
                bg-white
                shadow-sm
              "
            >
              {filteredServices.length ? (
                filteredServices.map(
                  (
                    service,
                  ) => (
                    <button
                      key={
                        service.id
                      }
                      type="button"
                      onClick={() =>
                        selectService(
                          service,
                        )
                      }
                      className="
                        flex
                        w-full
                        items-center
                        justify-between
                        gap-4
                        border-b
                        border-slate-100
                        px-4
                        py-3
                        text-left
                        transition
                        last:border-b-0
                        hover:bg-cyan-50
                      "
                    >
                      <div
                        className="
                          min-w-0
                        "
                      >
                        <p
                          className="
                            truncate
                            text-sm
                            font-bold
                            text-slate-800
                          "
                        >
                          {
                            service.name
                          }
                        </p>

                        {service.category_name ? (
                          <p
                            className="
                              mt-0.5
                              text-xs
                              text-slate-500
                            "
                          >
                            {
                              service.category_name
                            }
                          </p>
                        ) : null}
                      </div>

                      {service.price !==
                      undefined ? (
                        <span
                          className="
                            shrink-0
                            rounded-lg
                            bg-cyan-50
                            px-3
                            py-1.5
                            text-xs
                            font-bold
                            text-cyan-800
                          "
                        >
                          C${' '}
                          {
                            service.price
                          }
                        </span>
                      ) : null}
                    </button>
                  ),
                )
              ) : (
                <p
                  className="
                    px-4
                    py-4
                    text-sm
                    text-slate-500
                  "
                >
                  No se encontraron tratamientos.
                </p>
              )}
            </div>
          ) : null}


          {selectedService ? (
            <div
              className="
                mt-3
                flex
                items-center
                justify-between
                gap-4
                rounded-xl
                border
                border-cyan-200
                bg-cyan-50/70
                px-4
                py-3.5
              "
            >
              <div
                className="
                  flex
                  min-w-0
                  items-center
                  gap-3
                "
              >
                <div
                  className="
                    grid
                    h-10
                    w-10
                    shrink-0
                    place-items-center
                    rounded-xl
                    bg-white
                    text-lg
                    shadow-sm
                    ring-1
                    ring-cyan-100
                  "
                >
                  🦷
                </div>

                <div
                  className="
                    min-w-0
                  "
                >
                  <p
                    className="
                      truncate
                      text-sm
                      font-bold
                      text-slate-900
                    "
                  >
                    {
                      selectedService.name
                    }
                  </p>

                  <p
                    className="
                      mt-0.5
                      text-xs
                      text-slate-500
                    "
                  >
                    {
                      selectedService.category_name ||
                      'Tratamiento'
                    }
                  </p>
                </div>
              </div>

              {selectedService.price !==
              undefined ? (
                <div
                  className="
                    shrink-0
                    rounded-xl
                    bg-white
                    px-3
                    py-2
                    text-sm
                    font-bold
                    text-cyan-800
                    shadow-sm
                    ring-1
                    ring-cyan-100
                  "
                >
                  C${' '}
                  {
                    selectedService.price
                  }
                </div>
              ) : null}
            </div>
          ) : null}
        </div>


        {/* ============================================
            PROCEDIMIENTO PERSONALIZADO
        ============================================ */}

        {!form.serviceId ? (
          <label
            className="
              block
            "
          >
            <span
              className="
                text-sm
                font-bold
                text-slate-800
              "
            >
              Procedimiento personalizado
            </span>

            <span
              className="
                ml-2
                text-xs
                font-normal
                text-slate-400
              "
            >
              Solo si no existe en el catálogo
            </span>

            <input
              name="description"
              value={
                form.description
              }
              onChange={
                update
              }
              maxLength="255"
              className={
                fieldClass
              }
              placeholder="Escribe el procedimiento personalizado"
            />
          </label>
        ) : null}


        {/* ============================================
            DIAGNÓSTICO
        ============================================ */}

        <label
          className="
            block
          "
        >
          <span
            className="
              text-sm
              font-bold
              text-slate-800
            "
          >
            Diagnóstico o justificación
          </span>

          <textarea
            name="diagnosisText"
            value={
              form.diagnosisText
            }
            onChange={
              update
            }
            rows="3"
            maxLength="1000"
            className={
              fieldClass
            }
            placeholder="Agrega únicamente la información clínica necesaria"
          />
        </label>


        {/* ============================================
            PIEZA / HALLAZGO
        ============================================ */}

        <div
          className="
            grid
            gap-4
            sm:grid-cols-2
          "
        >
          <label
            className="
              block
            "
          >
            <span
              className="
                text-sm
                font-bold
                text-slate-800
              "
            >
              Pieza dental
            </span>

            <select
              name="toothCode"
              value={
                form.toothCode
              }
              onChange={
                update
              }
              className={
                fieldClass
              }
            >
              <option value="">
                Tratamiento general
              </option>

              {toothOptions.map(
                (
                  code,
                ) => (
                  <option
                    key={
                      code
                    }
                    value={
                      code
                    }
                  >
                    Pieza{' '}
                    {
                      code
                    }
                  </option>
                ),
              )}
            </select>

            <p
              className="
                mt-1.5
                text-xs
                text-slate-400
              "
            >
              Selecciona la pieza relacionada.
            </p>
          </label>


          <label
            className="
              block
            "
          >
            <span
              className="
                text-sm
                font-bold
                text-slate-800
              "
            >
              Hallazgo planificado
            </span>

            <select
              name="plannedFinding"
              value={
                form.plannedFinding
              }
              onChange={
                update
              }
              className={
                fieldClass
              }
            >
              <option value="">
                Sin hallazgo asociado
              </option>

              {plannedFindings.map(
                (
                  finding,
                ) => (
                  <option
                    key={
                      finding
                    }
                    value={
                      finding
                    }
                  >
                    {
                      FINDING_LABELS[
                        finding
                      ]
                    }
                  </option>
                ),
              )}
            </select>

            <p
              className="
                mt-1.5
                text-xs
                text-slate-400
              "
            >
              Selecciona el hallazgo si aplica.
            </p>
          </label>
        </div>


        {/* ============================================
            SUPERFICIES
        ============================================ */}

        {availableSurfaces.length ? (
          <fieldset>
            <legend
              className="
                text-sm
                font-bold
                text-slate-800
              "
            >
              Superficies
            </legend>

            <div
              className="
                mt-2
                flex
                flex-wrap
                gap-2
              "
            >
              {availableSurfaces.map(
                (
                  surface,
                ) => {
                  const checked =
                    form.surfaces.includes(
                      surface,
                    )

                  return (
                    <label
                      key={
                        surface
                      }
                      className={`
                        flex
                        min-h-11
                        cursor-pointer
                        items-center
                        gap-2
                        rounded-xl
                        border
                        px-3.5
                        py-2.5
                        text-xs
                        font-semibold
                        transition

                        ${
                          checked
                            ? `
                              border-cyan-500
                              bg-cyan-50
                              text-cyan-900
                              ring-2
                              ring-cyan-100
                            `
                            : `
                              border-slate-200
                              bg-white
                              text-slate-700
                              hover:border-cyan-300
                              hover:bg-cyan-50/50
                            `
                        }
                      `}
                    >
                      <input
                        type="checkbox"
                        value={
                          surface
                        }
                        checked={
                          checked
                        }
                        onChange={
                          toggleSurface
                        }
                        className="
                          h-4
                          w-4
                          accent-cyan-700
                        "
                      />

                      {
                        displaySurface(
                          surface,
                        )
                      }
                    </label>
                  )
                },
              )}
            </div>
          </fieldset>
        ) : null}


        {/* ============================================
            NOTAS
        ============================================ */}

        <label
          className="
            block
          "
        >
          <span
            className="
              text-sm
              font-bold
              text-slate-800
            "
          >
            Observaciones adicionales
          </span>

          <textarea
            name="notes"
            value={
              form.notes
            }
            onChange={
              update
            }
            rows="3"
            maxLength="1000"
            className={
              fieldClass
            }
            placeholder="Opcional. Agrega solo detalles que no estén representados en el catálogo."
          />
        </label>


        {/* ============================================
            ERROR
        ============================================ */}

        {formError ? (
          <p
            role="alert"
            className="
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
            {
              formError
            }
          </p>
        ) : null}


        {/* ============================================
            ACCIONES
        ============================================ */}

        <div
          className="
            flex
            flex-col-reverse
            gap-2
            border-t
            border-slate-100
            pt-5
            sm:flex-row
            sm:justify-end
          "
        >
          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              saving
            }
            className="
              rounded-xl
              border
              border-slate-300
              bg-white
              px-5
              py-2.5
              text-sm
              font-semibold
              text-slate-700
              transition
              hover:bg-slate-50
              disabled:opacity-50
            "
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={
              submit
            }
            disabled={
              saving
            }
            className="
              rounded-xl
              bg-cyan-700
              px-5
              py-2.5
              text-sm
              font-semibold
              text-white
              shadow-sm
              transition
              hover:bg-cyan-800
              disabled:cursor-wait
              disabled:opacity-60
            "
          >
            {saving
              ? 'Guardando…'
              : 'Guardar tratamiento'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export default function TreatmentPlanSection({
  items,
  services,
  canEdit,
  canTransition = false,
  canPerform = false,
  currentConsultationId = null,
  loading = false,
  error = '',
  pendingHasMore = false,
  historyHasMore = false,
  loadingMoreScope = '',
  onLoadMore = () => {},
  onItemChanged = () => {},
  onCreate,
  onAccept = async (itemId) => itemId,
  onPerform = async (itemId) => itemId,
  onCancel = async (itemId) => itemId,
}) {
  const pendingItemsRef =
    useRef(
      new Set(),
    )

  const [
    displayItems,
    setDisplayItems,
  ] = useState(items)

  const [
    pending,
    setPending,
  ] = useState(null)

  const [
    actionError,
    setActionError,
  ] = useState('')

  const [
    cancelTarget,
    setCancelTarget,
  ] = useState(null)

  const [
    cancelReason,
    setCancelReason,
  ] = useState('')

  const [
    performTarget,
    setPerformTarget,
  ] = useState(null)


  useEffect(() => {
    setDisplayItems(
      items,
    )
  }, [
    items,
  ])


  /* =======================================================
     SWEETALERT - AGREGAR TRATAMIENTO
  ======================================================= */

  const openTreatmentModal =
    () => {
      let root = null

      Swal.fire({
        html:
          '<div id="treatment-form-swal-root"></div>',

        width:
          'min(920px, 96vw)',

        padding:
          '24px',

        background:
          '#ffffff',

        showConfirmButton:
          false,

        showCancelButton:
          false,

        showCloseButton:
          true,

        allowOutsideClick:
          false,

        allowEscapeKey:
          true,

        heightAuto:
          false,

        customClass: {
          popup:
            'rounded-3xl',

          htmlContainer:
            '!m-0 !p-0 !overflow-visible',

          closeButton:
            '!text-slate-400 hover:!text-slate-700',
        },

        didOpen: () => {
          const container =
            document.getElementById(
              'treatment-form-swal-root',
            )

          if (!container) {
            return
          }

          root =
            createRoot(
              container,
            )

          root.render(
            <TreatmentFormModal
              services={
                services
              }
              onCreate={
                onCreate
              }
              onCreated={(
                created,
              ) => {
                setDisplayItems(
                  (current) => [
                    ...current,
                    created,
                  ],
                )

                onItemChanged(
                  created,
                )
              }}
              onClose={() =>
                Swal.close()
              }
            />,
          )
        },

        willClose: () => {
          /*
           * React no debe desmontarse durante
           * el mismo ciclo en que SweetAlert
           * elimina el contenedor.
           */
          if (root) {
            setTimeout(
              () => {
                try {
                  root.unmount()
                } catch {
                  // El popup ya fue retirado.
                }
              },
              0,
            )
          }
        },
      })
    }


  /* =======================================================
     TRANSICIONES DEL PLAN
  ======================================================= */

  const transition =
    async (
      item,
      action,
      operation,
    ) => {
      if (
        pendingItemsRef.current.has(
          item.id,
        )
      ) {
        return
      }

      pendingItemsRef.current.add(
        item.id,
      )

      setPending({
        itemId:
          item.id,

        action,
      })

      setActionError('')

      try {
        const updated =
          await operation()

        setDisplayItems(
          (current) =>
            current.map(
              (
                candidate,
              ) =>
                candidate.id ===
                updated.id
                  ? updated
                  : candidate,
            ),
        )

        onItemChanged(
          updated,
        )

        if (
          action ===
          'cancel'
        ) {
          setCancelTarget(
            null,
          )

          setCancelReason(
            '',
          )
        }

        if (
          action ===
          'perform'
        ) {
          setPerformTarget(
            null,
          )
        }
      } catch (
        requestError
      ) {
        setActionError(
          requestError.message,
        )
      } finally {
        pendingItemsRef.current.delete(
          item.id,
        )

        setPending(
          null,
        )
      }
    }


  const accept = (
    item,
  ) =>
    transition(
      item,
      'accept',
      () =>
        onAccept(
          item.id,
          treatmentConsultationId(
            item.proposed_in,
          ),
        ),
    )


  const perform = (
    odontogramResult,
  ) =>
    transition(
      performTarget,
      'perform',
      () =>
        onPerform(
          performTarget.id,
          treatmentConsultationId(
            performTarget.proposed_in,
          ),
          Number(
            currentConsultationId,
          ),
          odontogramResult,
        ),
    )


  const openPerform = (
    item,
  ) => {
    setActionError('')

    setPerformTarget(
      item,
    )
  }


  const openCancellation = (
    item,
  ) => {
    setActionError('')

    setCancelReason('')

    setCancelTarget(
      item,
    )
  }


  const cancel = () => {
    if (
      !cancelTarget
    ) {
      return
    }

    const reason =
      cancelReason.trim()

    transition(
      cancelTarget,
      'cancel',
      () =>
        onCancel(
          cancelTarget.id,
          treatmentConsultationId(
            cancelTarget.proposed_in,
          ),
          reason,
        ),
    )
  }


  return (
    <LongitudinalTreatmentPlan
      items={
        displayItems
      }
      loading={
        loading
      }
      error={
        error
      }
      currentConsultationId={
        currentConsultationId
      }
      canTransition={
        canTransition
      }
      canPerform={
        canPerform
      }
      pendingAction={
        pending
      }
      onAccept={
        accept
      }
      onPerform={
        openPerform
      }
      onCancel={
        openCancellation
      }
      pendingHasMore={
        pendingHasMore
      }
      historyHasMore={
        historyHasMore
      }
      loadingMoreScope={
        loadingMoreScope
      }
      onLoadMore={
        onLoadMore
      }
      headerAction={
        canEdit ? (
          <button
            type="button"
            onClick={
              openTreatmentModal
            }
            className="
              inline-flex
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-cyan-700
              px-4
              py-2.5
              text-sm
              font-semibold
              text-white
              shadow-sm
              transition
              hover:bg-cyan-800
              focus:outline-none
              focus:ring-4
              focus:ring-cyan-100
            "
          >
            <span
              className="
                text-lg
                leading-none
              "
            >
              +
            </span>

            Agregar tratamiento
          </button>
        ) : null
      }
    >
      {actionError ? (
        <p
          role="alert"
          className="
            mt-5
            rounded-xl
            border
            border-red-200
            bg-red-50
            p-3
            text-sm
            text-red-700
          "
        >
          {
            actionError
          }
        </p>
      ) : null}


      {cancelTarget ? (
        <section
          aria-labelledby="treatment-cancel-title"
          className="
            mt-5
            rounded-2xl
            border
            border-red-200
            bg-red-50/60
            p-4
          "
        >
          <h3
            id="treatment-cancel-title"
            className="
              font-semibold
              text-slate-900
            "
          >
            Cancelar{' '}
            {
              cancelTarget.description
            }
          </h3>

          <label
            className="
              mt-3
              block
              text-xs
              font-semibold
              text-slate-700
            "
          >
            Motivo de cancelación

            <textarea
              value={
                cancelReason
              }
              onChange={({
                target,
              }) =>
                setCancelReason(
                  target.value,
                )
              }
              maxLength="1000"
              rows="2"
              className={
                fieldClass
              }
            />
          </label>

          <div
            className="
              mt-4
              flex
              justify-end
              gap-2
            "
          >
            <button
              type="button"
              onClick={() =>
                setCancelTarget(
                  null,
                )
              }
              disabled={
                pending?.action ===
                'cancel'
              }
              className="
                rounded-lg
                border
                border-slate-300
                bg-white
                px-3
                py-2
                text-xs
                font-semibold
                text-slate-700
              "
            >
              Volver
            </button>

            <button
              type="button"
              onClick={
                cancel
              }
              disabled={
                pending?.action ===
                'cancel'
              }
              className="
                rounded-lg
                bg-red-700
                px-3
                py-2
                text-xs
                font-semibold
                text-white
                disabled:cursor-wait
                disabled:opacity-60
              "
            >
              {pending?.action ===
              'cancel'
                ? 'Cancelando…'
                : 'Confirmar cancelación'}
            </button>
          </div>
        </section>
      ) : null}


      {performTarget ? (
        <TreatmentResultDialog
          key={
            performTarget.id
          }
          item={
            performTarget
          }
          pending={
            pending?.action ===
            'perform'
          }
          requestError={
            actionError
          }
          onCancel={() =>
            setPerformTarget(
              null,
            )
          }
          onConfirm={
            perform
          }
        />
      ) : null}
    </LongitudinalTreatmentPlan>
  )
}