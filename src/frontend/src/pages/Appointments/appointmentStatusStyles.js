export const appointmentStatusStyles = {
  PROGRAMADA: {
    card: `
      !border-blue-200
      !border-l-blue-600
      !bg-blue-50
      !text-blue-950
      hover:!bg-blue-100
    `,

    badge: `
      bg-blue-100
      text-blue-800
      ring-blue-200
    `,

    dot: 'bg-blue-600',
  },

  CONFIRMADA: {
    card: `
      !border-emerald-200
      !border-l-emerald-600
      !bg-emerald-50
      !text-emerald-950
      hover:!bg-emerald-100
    `,

    badge: `
      bg-emerald-100
      text-emerald-800
      ring-emerald-200
    `,

    dot: 'bg-emerald-600',
  },

  PRESENTE: {
    card: `
      !border-amber-200
      !border-l-amber-500
      !bg-amber-50
      !text-amber-950
      hover:!bg-amber-100
    `,

    badge: `
      bg-amber-100
      text-amber-800
      ring-amber-200
    `,

    dot: 'bg-amber-500',
  },

  EN_ATENCION: {
    card: `
      !border-violet-200
      !border-l-violet-600
      !bg-violet-50
      !text-violet-950
      hover:!bg-violet-100
    `,

    badge: `
      bg-violet-100
      text-violet-800
      ring-violet-200
    `,

    dot: 'bg-violet-600',
  },

  COMPLETADA: {
    card: `
      !border-slate-300
      !border-l-slate-600
      !bg-slate-100
      !text-slate-900
      hover:!bg-slate-200
    `,

    badge: `
      bg-slate-200
      text-slate-800
      ring-slate-300
    `,

    dot: 'bg-slate-600',
  },

  CANCELADA: {
    card: `
      !border-red-200
      !border-l-red-600
      !bg-red-50
      !text-red-950
      hover:!bg-red-100
    `,

    badge: `
      bg-red-100
      text-red-800
      ring-red-200
    `,

    dot: 'bg-red-600',
  },

  NO_ASISTIO: {
    card: `
      !border-orange-200
      !border-l-orange-600
      !bg-orange-50
      !text-orange-950
      hover:!bg-orange-100
    `,

    badge: `
      bg-orange-100
      text-orange-800
      ring-orange-200
    `,

    dot: 'bg-orange-600',
  },
}

const defaultStatusStyle = {
  card: `
    !border-slate-200
    !border-l-slate-500
    !bg-white
    !text-slate-900
    hover:!bg-slate-50
  `,

  badge: `
    bg-slate-100
    text-slate-700
    ring-slate-200
  `,

  dot: 'bg-slate-500',
}

export function getAppointmentStatusStyle(
  status,
) {
  return (
    appointmentStatusStyles[
      status
    ] ||
    defaultStatusStyle
  )
}