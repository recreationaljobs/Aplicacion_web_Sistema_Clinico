export const cedulaPattern = '[0-9]{3}-[0-9]{6}-[0-9]{4}[A-Z]'

export function formatCedula(value) {
  const input = String(value ?? '').toUpperCase()
  const compact = input.replace(/[\s-]+/g, '')
  if (!/^[0-9]{13}[A-Z]$/.test(compact)) return input
  return `${compact.slice(0, 3)}-${compact.slice(3, 9)}-${compact.slice(9)}`
}
