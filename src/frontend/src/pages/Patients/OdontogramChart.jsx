import {
  memo,
  useCallback,
  useEffect,
  useRef,
} from 'react'

import {
  FINDING_LABELS,
  PERMANENT_ARCHES,
  PRIMARY_ARCHES,
  SURFACE_LABELS,
  findingTone,
  toothSurfaces,
} from './odontogramSchema'


const REGION_PATHS = {
  MESIAL:
    'M4 7 L18 18 L18 34 L4 45 Z',

  DISTAL:
    'M46 7 L32 18 L32 34 L46 45 Z',

  VESTIBULAR:
    'M4 7 L18 18 L32 18 L46 7 Q25 -1 4 7 Z',

  INNER:
    'M4 45 L18 34 L32 34 L46 45 Q25 53 4 45 Z',

  CENTER:
    'M18 18 H32 V34 H18 Z',
}


function surfacePath(
  surface,
  index,
) {
  if (index === 3) {
    return REGION_PATHS.INNER
  }

  if (index === 4) {
    return REGION_PATHS.CENTER
  }

  return REGION_PATHS[
    surface
  ]
}


function findingPattern(
  finding,
  layer,
) {
  if (
    layer ===
    'planned'
  ) {
    return '5 2'
  }

  if (
    finding ===
    'FRACTURE'
  ) {
    return '2 2'
  }

  if (
    finding ===
    'SEALANT'
  ) {
    return '4 2'
  }

  return undefined
}


/* ============================================================
   PIEZA DENTAL
   ============================================================ */

function Tooth({
  code,
  tooth,
  layer,
  canModify,
  isSelected,
  highlighted,
  onSelect,
  onSurfaceClick,
}) {
  const surfaces =
    toothSurfaces(
      code,
    )

  const whole =
    tooth?.[
      layer
    ]?.whole || []

  const statusLabel =
    whole
      .map(
        (
          finding,
        ) =>
          FINDING_LABELS[
            finding
          ],
      )
      .join(', ')

  const outerStroke =
    highlighted
      ? '#C77A00'
      : isSelected
        ? '#087C91'
        : whole.length
          ? '#475569'
          : '#CBD5E1'

  return (
    <div
      className="
        w-14
        shrink-0
        text-center

        [@media(pointer:coarse)]:w-20
      "
    >
      <svg
        viewBox="0 0 50 52"
        className="
          mx-auto
          h-14
          w-14
          overflow-visible

          [@media(pointer:coarse)]:h-20
          [@media(pointer:coarse)]:w-20
        "
        aria-label={`Pieza ${code}${
          statusLabel
            ? `, ${statusLabel}`
            : ''
        }`}
        style={{
          touchAction:
            'manipulation',
        }}
      >
        {/* CONTORNO GENERAL DEL DIENTE */}

        <path
          d="
            M4 7
            Q25 -1 46 7
            V45
            Q25 53 4 45
            Z
          "
          fill={
            isSelected
              ? '#ECFEFF'
              : '#F8FAFC'
          }
          stroke={
            outerStroke
          }
          strokeWidth={
            highlighted ||
            isSelected
              ? 2.5
              : 1.5
          }
          strokeDasharray={
            whole.includes(
              'MISSING',
            )
              ? '4 3'
              : undefined
          }
        />

        {/* SUPERFICIES */}

        {surfaces.map(
          (
            surface,
            index,
          ) => {
            const finding =
              tooth?.[
                layer
              ]?.surfaces?.[
                surface
              ]?.[0]

            const tone =
              findingTone(
                finding,
                layer,
              )

            const label =
              `Pieza ${code}, superficie ${SURFACE_LABELS[surface]}`

            const select =
              () => {
                onSelect?.(
                  code,
                )

                onSurfaceClick?.(
                  code,
                  surface,
                )
              }

            return (
              <path
                key={
                  surface
                }
                d={surfacePath(
                  surface,
                  index,
                )}
                fill={
                  tone.fill
                }
                stroke={
                  finding
                    ? tone.stroke
                    : isSelected
                      ? '#94A3B8'
                      : '#CBD5E1'
                }
                strokeWidth={
                  finding
                    ? 2
                    : 1
                }
                strokeDasharray={findingPattern(
                  finding,
                  layer,
                )}
                role={
                  canModify
                    ? 'button'
                    : undefined
                }
                tabIndex={
                  canModify
                    ? 0
                    : undefined
                }
                aria-label={
                  canModify
                    ? label
                    : undefined
                }
                onClick={
                  canModify
                    ? select
                    : undefined
                }
                onKeyDown={
                  canModify
                    ? (
                        event,
                      ) => {
                        if (
                          event.key ===
                            'Enter' ||
                          event.key ===
                            ' '
                        ) {
                          event.preventDefault()

                          select()
                        }
                      }
                    : undefined
                }
                className={
                  canModify
                    ? `
                        cursor-pointer
                        outline-none

                        transition-[stroke,fill]
                        duration-150

                        hover:stroke-cyan-600
                        hover:stroke-[2.5]

                        focus:stroke-cyan-700
                        focus:stroke-[3]
                      `
                    : ''
                }
                style={
                  canModify
                    ? {
                        touchAction:
                          'manipulation',
                      }
                    : undefined
                }
              >
                <title>
                  {`${label}${
                    finding
                      ? `: ${FINDING_LABELS[finding]}`
                      : ': sin hallazgo'
                  }`}
                </title>
              </path>
            )
          },
        )}

        {/* MARCA DE PIEZA REVISADA Y SANA */}

        {layer ===
          'current' &&
        tooth?.reviewed &&
        !whole.length &&
        Object.keys(
          tooth?.current
            ?.surfaces ||
            {},
        ).length ===
          0 ? (
          <text
            x="25"
            y="31"
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="#087C91"
            aria-hidden="true"
            pointerEvents="none"
          >
            ✓
          </text>
        ) : null}

        {/* ESTADO DE PIEZA COMPLETA */}

        {whole.length ? (
          <text
            x="25"
            y="31"
            textAnchor="middle"
            fontSize="9"
            fontWeight="800"
            fill="#475569"
            aria-hidden="true"
            pointerEvents="none"
          >
            {whole
              .map(
                (
                  item,
                ) =>
                  FINDING_LABELS[
                    item
                  ]?.[0] ||
                  '',
              )
              .join('')}
          </text>
        ) : null}
      </svg>

      {/* NÚMERO DE PIEZA */}

      <button
        type="button"
        onClick={() =>
          onSelect?.(
            code,
          )
        }
        aria-label={`Seleccionar pieza ${code}`}
        className={`
          mt-1

          min-h-7

          rounded-md

          px-2
          py-1

          font-mono
          text-[10px]
          font-semibold

          transition

          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-cyan-600
          focus-visible:ring-offset-1

          [@media(pointer:coarse)]:min-h-11
          [@media(pointer:coarse)]:min-w-12
          [@media(pointer:coarse)]:px-3
          [@media(pointer:coarse)]:text-xs

          ${
            isSelected
              ? `
                  bg-cyan-700
                  text-white
                  shadow-sm
                `
              : `
                  text-slate-600

                  hover:bg-cyan-50
                  hover:text-cyan-800
                `
          }
        `}
      >
        {code}
      </button>
    </div>
  )
}


const MemoTooth =
  memo(Tooth)


/* ============================================================
   ARCADA
   ============================================================ */

function Arch({
  label,
  codes,
  teeth,
  layer,
  canModify,
  selectedTooth,
  highlightedTeeth,
  onSelectTooth,
  onSurfaceClick,
}) {
  return (
    <section
      aria-label={
        label
      }
    >
      <p
        className="
          mb-3
          text-center
          text-[10px]
          font-bold
          uppercase
          tracking-[0.2em]
          text-slate-400

          [@media(pointer:coarse)]:mb-5
          [@media(pointer:coarse)]:text-xs
        "
      >
        {label}
      </p>

      <div
        className="
          flex
          min-w-max
          justify-center

          gap-0.5

          [@media(pointer:coarse)]:gap-2
        "
      >
        {codes.map(
          (
            code,
          ) => (
            <MemoTooth
              key={
                code
              }
              code={
                code
              }
              tooth={
                teeth[
                  code
                ]
              }
              layer={
                layer
              }
              canModify={
                canModify
              }
              isSelected={
                selectedTooth ===
                code
              }
              highlighted={
                highlightedTeeth.includes(
                  code,
                )
              }
              onSelect={
                onSelectTooth
              }
              onSurfaceClick={
                onSurfaceClick
              }
            />
          ),
        )}
      </div>
    </section>
  )
}


/* ============================================================
   SCROLL HORIZONTAL
   ============================================================ */

function verticalWheelPixels(
  event,
  container,
) {
  if (
    event.deltaMode ===
    WheelEvent.DOM_DELTA_LINE
  ) {
    const computedLineHeight =
      Number.parseFloat(
        getComputedStyle(
          container,
        ).lineHeight,
      )

    return (
      event.deltaY *
      (
        Number.isFinite(
          computedLineHeight,
        )
          ? computedLineHeight
          : 16
      )
    )
  }

  if (
    event.deltaMode ===
    WheelEvent.DOM_DELTA_PAGE
  ) {
    return (
      event.deltaY *
      container.clientWidth
    )
  }

  return event.deltaY
}


function handleHorizontalWheel(
  event,
) {
  if (
    event.ctrlKey ||
    event.shiftKey ||
    event.deltaX !==
      0 ||
    event.deltaY ===
      0
  ) {
    return
  }

  const container =
    event.currentTarget

  const maximum =
    Math.max(
      0,
      container.scrollWidth -
        container.clientWidth,
    )

  const next =
    Math.min(
      maximum,
      Math.max(
        0,
        container.scrollLeft +
          verticalWheelPixels(
            event,
            container,
          ),
      ),
    )

  if (
    next ===
    container.scrollLeft
  ) {
    return
  }

  event.preventDefault()

  container.scrollLeft =
    next
}


/* ============================================================
   ODONTOGRAMA
   ============================================================ */

function OdontogramChart({
  dentition,
  teeth,
  layer = 'current',
  canModify = false,
  selectedTooth = '',
  highlightedTeeth = [],
  onSelectTooth,
  onSurfaceClick,
  scrollContainerRef,
  onScroll,
  ariaLabel = 'Odontograma dental',
}) {
  const containerRef =
    useRef(null)

  const assignContainerRef =
    useCallback(
      (
        node,
      ) => {
        containerRef.current =
          node

        if (
          typeof scrollContainerRef ===
          'function'
        ) {
          scrollContainerRef(
            node,
          )
        } else if (
          scrollContainerRef
        ) {
          scrollContainerRef.current =
            node
        }
      },
      [
        scrollContainerRef,
      ],
    )


  useEffect(
    () => {
      const container =
        containerRef.current

      if (
        !container
      ) {
        return undefined
      }

      container.addEventListener(
        'wheel',
        handleHorizontalWheel,
        {
          passive:
            false,
        },
      )

      return () =>
        container.removeEventListener(
          'wheel',
          handleHorizontalWheel,
        )
    },
    [],
  )


  const showPermanent =
    dentition !==
    'PRIMARY'

  const showPrimary =
    dentition !==
    'PERMANENT'


  return (
    <div
      ref={
        assignContainerRef
      }
      onScroll={
        onScroll
      }
      role="region"
      aria-label={
        ariaLabel
      }
      tabIndex={0}
      className="
        overflow-x-auto
        overflow-y-hidden

        rounded-xl

        border
        border-slate-200

        bg-slate-50/70

        px-4
        py-6

        outline-none

        focus-visible:ring-2
        focus-visible:ring-cyan-600
        focus-visible:ring-offset-2

        [@media(pointer:coarse)]:px-6
        [@media(pointer:coarse)]:py-8
      "
    >
      <div
        className="
          mx-auto

          min-w-[940px]

          space-y-7

          [@media(pointer:coarse)]:min-w-[1280px]
          [@media(pointer:coarse)]:space-y-10
        "
      >
        {showPermanent ? (
          <Arch
            label="Maxilar superior · permanente"
            codes={
              PERMANENT_ARCHES.upper
            }
            teeth={
              teeth
            }
            layer={
              layer
            }
            canModify={
              canModify
            }
            selectedTooth={
              selectedTooth
            }
            highlightedTeeth={
              highlightedTeeth
            }
            onSelectTooth={
              onSelectTooth
            }
            onSurfaceClick={
              onSurfaceClick
            }
          />
        ) : null}

        {showPrimary ? (
          <Arch
            label="Maxilar superior · temporal"
            codes={
              PRIMARY_ARCHES.upper
            }
            teeth={
              teeth
            }
            layer={
              layer
            }
            canModify={
              canModify
            }
            selectedTooth={
              selectedTooth
            }
            highlightedTeeth={
              highlightedTeeth
            }
            onSelectTooth={
              onSelectTooth
            }
            onSurfaceClick={
              onSurfaceClick
            }
          />
        ) : null}

        <div
          className="
            mx-auto
            flex
            max-w-xl
            items-center
            gap-4

            [@media(pointer:coarse)]:my-3
            [@media(pointer:coarse)]:max-w-2xl
          "
          aria-hidden="true"
        >
          <span
            className="
              h-px
              flex-1
              bg-cyan-100
            "
          />

          <span
            className="
              rounded-full
              bg-cyan-50

              px-8
              py-2

              text-[9px]
              font-bold
              uppercase
              tracking-[0.2em]
              text-cyan-700

              [@media(pointer:coarse)]:px-10
              [@media(pointer:coarse)]:py-3
              [@media(pointer:coarse)]:text-[10px]
            "
          >
            Paladar · lengua
          </span>

          <span
            className="
              h-px
              flex-1
              bg-cyan-100
            "
          />
        </div>

        {showPrimary ? (
          <Arch
            label="Mandíbula inferior · temporal"
            codes={
              PRIMARY_ARCHES.lower
            }
            teeth={
              teeth
            }
            layer={
              layer
            }
            canModify={
              canModify
            }
            selectedTooth={
              selectedTooth
            }
            highlightedTeeth={
              highlightedTeeth
            }
            onSelectTooth={
              onSelectTooth
            }
            onSurfaceClick={
              onSurfaceClick
            }
          />
        ) : null}

        {showPermanent ? (
          <Arch
            label="Mandíbula inferior · permanente"
            codes={
              PERMANENT_ARCHES.lower
            }
            teeth={
              teeth
            }
            layer={
              layer
            }
            canModify={
              canModify
            }
            selectedTooth={
              selectedTooth
            }
            highlightedTeeth={
              highlightedTeeth
            }
            onSelectTooth={
              onSelectTooth
            }
            onSurfaceClick={
              onSurfaceClick
            }
          />
        ) : null}
      </div>
    </div>
  )
}


export default memo(
  OdontogramChart,
)