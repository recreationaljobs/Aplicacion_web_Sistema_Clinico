import Swal from 'sweetalert2'

const baseConfig = {
  buttonsStyling: false,
  reverseButtons: true,

  customClass: {
    popup: 'rounded-3xl px-6 pb-6 pt-7',
    title:
      'text-xl font-bold text-slate-900',
    htmlContainer:
      'text-sm leading-6 text-slate-600',

    actions:
      'mt-6 flex flex-row-reverse gap-3',

    confirmButton:
      'min-w-[130px] rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-100',

    cancelButton:
      'min-w-[110px] rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100',
  },
}

export function showSuccess(
  title,
  text = '',
) {
  return Swal.fire({
    ...baseConfig,
    icon: 'success',
    title,
    text,
    confirmButtonText: 'Aceptar',
    timer: 2200,
    timerProgressBar: true,
  })
}

export function showError(
  title,
  text = '',
) {
  return Swal.fire({
    ...baseConfig,
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Aceptar',
  })
}

export function showWarning(
  title,
  text = '',
) {
  return Swal.fire({
    ...baseConfig,
    icon: 'warning',
    title,
    text,
    confirmButtonText: 'Aceptar',
  })
}

export function showConfirm({
  title,
  text = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  icon = 'question',
}) {
  return Swal.fire({
    ...baseConfig,
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    allowOutsideClick: false,
  })
}