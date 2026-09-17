import { useState } from 'react'
import { SURFACE_LABELS } from './odontogramSchema'

const displaySurface = (surface) => {
  const label = SURFACE_LABELS[surface] || surface.toLowerCase()
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`
}

const treatmentLocation = (item) => (
  item.tooth_code
    ? `Pieza ${item.tooth_code}${item.surfaces?.length ? ` · ${item.surfaces.map(displaySurface).join(', ')}` : ''}`
    : 'Tratamiento general'
)

const serviceContext = (service) => {
  if (!service) return 'Sin servicio de catálogo asociado'
  if (!service.is_active) return `${service.name} · no disponible para nuevas citas`
  return `${service.name} · ${service.duration_minutes} minutos`
}

export default function ConsultationFollowUpSection({
  status,
  items = [],
  canSchedule = false,
  onSchedule = () => {},
}) {
  const [selectedItemId, setSelectedItemId] = useState('')
  if (status !== 'COMPLETADA') return null

  const pendingItems = items.filter(({ status: itemStatus }) => (
    ['PROPUESTO', 'ACEPTADO'].includes(itemStatus)
  ))
  const selectedItem = pendingItems.find(({ id }) => String(id) === selectedItemId) || null

  return <section
    aria-label="Seguimiento de la atención"
    className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm sm:p-6 lg:col-span-2"
  >
    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Continuidad clínica</p>
    <h2 id="consultation-follow-up-title" className="mt-1 font-sans text-2xl font-semibold text-slate-900">Atención completada</h2>
    <h3 className="mt-5 text-base font-semibold text-slate-800">Tratamientos pendientes</h3>
    {pendingItems.length > 0 ? <fieldset className="mt-3 space-y-3">
      <legend className="sr-only">Contexto para la próxima cita</legend>
      <label className="flex cursor-pointer gap-3 rounded-xl border border-emerald-200 bg-white p-4">
        <input
          type="radio"
          name="follow-up-treatment"
          value=""
          checked={selectedItemId === ''}
          onChange={({ target }) => setSelectedItemId(target.value)}
        />
        <span><strong className="block text-sm text-slate-900">Seguimiento general</strong><span className="mt-1 block text-xs text-slate-500">Programar sin sugerir un procedimiento específico.</span></span>
      </label>
      {pendingItems.map((item) => <label key={item.id} className="flex cursor-pointer gap-3 rounded-xl border border-emerald-200 bg-white p-4">
        <input
          type="radio"
          name="follow-up-treatment"
          value={item.id}
          checked={selectedItemId === String(item.id)}
          onChange={({ target }) => setSelectedItemId(target.value)}
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-slate-900">{item.description}</strong>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{item.status_display || item.status}</span>
          </span>
          <span className="mt-1 block text-xs text-slate-600">{treatmentLocation(item)}</span>
          <span className="mt-1 block text-xs text-slate-500">{serviceContext(item.service)}</span>
        </span>
      </label>)}
    </fieldset> : <p className="mt-3 rounded-xl border border-dashed border-emerald-300 bg-white/70 p-4 text-sm text-slate-600">No hay tratamientos pendientes.</p>}
    {canSchedule ? <div className="mt-5 flex justify-end">
      <button type="button" onClick={() => onSchedule(selectedItem)} className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">Programar próxima cita</button>
    </div> : null}
  </section>
}
