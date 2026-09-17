import { FINDING_LABELS, SURFACE_LABELS } from './odontogramSchema'
import { mergeTreatmentItems, treatmentConsultationId } from './treatmentPlanUtils'

const statusClasses = {
  PROPUESTO: 'bg-amber-100 text-amber-800',
  ACEPTADO: 'bg-blue-100 text-blue-800',
  REALIZADO: 'bg-emerald-100 text-emerald-800',
  CANCELADO: 'bg-slate-200 text-slate-700',
}

const displaySurface = (surface) => {
  const label = SURFACE_LABELS[surface] || surface.toLowerCase()
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`
}

const consultationValue = (value, field) => (
  value && typeof value === 'object' ? value[field] : field === 'id' ? value : null
)

const displayDate = (value, withTime = false) => {
  if (!value) return ''
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const options = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium', ...(isDateOnly ? { timeZone: 'UTC' } : {}) }
  const date = new Date(isDateOnly ? `${value}T00:00:00Z` : value)
  return new Intl.DateTimeFormat('es-NI', options).format(date)
}

function TreatmentItemCard({
  item,
  currentConsultationId,
  canTransition,
  canPerform,
  pendingAction,
  onAccept,
  onPerform,
  onCancel,
}) {
  const location = item.tooth_code
    ? `Pieza ${item.tooth_code}${item.surfaces?.length ? ` · ${item.surfaces.map(displaySurface).join(', ')}` : ''}`
    : 'Tratamiento general'
  const originId = treatmentConsultationId(item.proposed_in)
  const originDate = consultationValue(item.proposed_in, 'date')
  const performedId = treatmentConsultationId(item.performed_in)
  const performedDate = consultationValue(item.performed_in, 'date')
  const fromCurrentConsultation = Number(originId) === Number(currentConsultationId)

  return <article aria-label={item.description} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h4 className="font-semibold text-slate-900">{item.description}</h4>
        {item.service?.category_name ? <p className="mt-0.5 text-xs text-slate-500">{item.service.category_name}</p> : null}
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${statusClasses[item.status] || statusClasses.PROPUESTO}`}>{item.status_display || item.status}</span>
    </div>
    <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ubicación</dt><dd>{location}</dd></div>
      {item.diagnosis_text ? <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Diagnóstico / justificación</dt><dd>{item.diagnosis_text}</dd></div> : null}
      {item.planned_finding ? <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Hallazgo planificado</dt><dd>{FINDING_LABELS[item.planned_finding] || item.planned_finding}</dd></div> : null}
      {item.unit_price_snapshot !== null && item.unit_price_snapshot !== undefined ? <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Precio de referencia histórico</dt><dd>C$ {item.unit_price_snapshot}</dd></div> : null}
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Consulta de origen</dt><dd>Consulta #{originId}{originDate ? ` · ${displayDate(originDate)}` : ''}{fromCurrentConsultation ? ' · Propuesto en esta consulta' : ''}</dd></div>
      {item.notes ? <div className="sm:col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Notas</dt><dd className="whitespace-pre-wrap">{item.notes}</dd></div> : null}
      {item.performed_at ? <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Realizado</dt><dd>{displayDate(item.performed_at, true)}</dd></div> : null}
      {performedId ? <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Consulta de realización</dt><dd>Consulta #{performedId}{performedDate ? ` · ${displayDate(performedDate)}` : ''}</dd></div> : null}
      {item.status === 'CANCELADO' && item.status_reason ? <div className="sm:col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Motivo de cancelación</dt><dd className="whitespace-pre-wrap">{item.status_reason}</dd></div> : null}
    </dl>
    {canTransition && ['PROPUESTO', 'ACEPTADO'].includes(item.status) ? <div className="mt-4 flex flex-wrap justify-end gap-2">
      {item.status === 'PROPUESTO' ? <button type="button" onClick={() => onAccept(item)} disabled={Boolean(pendingAction)} aria-label={`${pendingAction === 'accept' ? 'Aceptando' : 'Aceptar'} ${item.description}`} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{pendingAction === 'accept' ? 'Aceptando…' : 'Aceptar'}</button> : null}
      {item.status === 'ACEPTADO' && canPerform ? <button type="button" onClick={() => onPerform(item)} disabled={Boolean(pendingAction)} aria-label={`${pendingAction === 'perform' ? 'Realizando' : 'Realizar'} ${item.description}`} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{pendingAction === 'perform' ? 'Realizando…' : 'Realizar'}</button> : null}
      <button type="button" onClick={() => onCancel(item)} disabled={Boolean(pendingAction)} aria-label={`Cancelar ${item.description}`} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-wait disabled:opacity-60">Cancelar</button>
    </div> : null}
  </article>
}

function TreatmentGroup({ title, label, items, emptyText, hasMore, loadingMore, onLoadMore, cardProps, pending }) {
  return <section aria-label={label} className="mt-5">
    <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
    <div className="mt-3 space-y-3">
      {items.length
        ? items.map((item) => <TreatmentItemCard
          key={item.id}
          item={item}
          {...cardProps}
          pendingAction={pending?.itemId === item.id ? pending.action : null}
        />)
        : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{emptyText}</p>}
    </div>
    {hasMore ? <button type="button" onClick={onLoadMore} disabled={loadingMore} className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">{loadingMore ? 'Cargando…' : `Cargar más ${title.toLowerCase()}`}</button> : null}
  </section>
}

export default function LongitudinalTreatmentPlan({
  items = [],
  loading = false,
  error = '',
  currentConsultationId = null,
  canTransition = false,
  canPerform = false,
  pendingAction = null,
  onAccept = () => {},
  onPerform = () => {},
  onCancel = () => {},
  pendingHasMore = false,
  historyHasMore = false,
  loadingMoreScope = '',
  onLoadMore = () => {},
  headerAction = null,
  children = null,
}) {
  const deduplicated = mergeTreatmentItems([], items)
  const pendingItems = deduplicated.filter(({ status }) => ['PROPUESTO', 'ACEPTADO'].includes(status))
  const historyItems = deduplicated.filter(({ status }) => ['REALIZADO', 'CANCELADO'].includes(status))
  const cardProps = {
    currentConsultationId,
    canTransition,
    canPerform,
    onAccept,
    onPerform,
    onCancel,
  }

  return <section aria-labelledby="treatment-plan-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="treatment-plan-title" className="font-sans text-2xl font-semibold text-slate-900">Plan de tratamiento</h2>
        <p className="mt-1 text-sm text-slate-500">Plan longitudinal estructurado del paciente.</p>
      </div>
      {headerAction}
    </div>
    {children}
    {loading ? <p className="mt-5 text-sm text-slate-500">Cargando plan de tratamiento…</p> : null}
    {error ? <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {!loading && !error ? <>
      <TreatmentGroup
        title="Pendientes"
        label="Tratamientos pendientes"
        items={pendingItems}
        emptyText="No hay tratamientos pendientes."
        hasMore={pendingHasMore}
        loadingMore={loadingMoreScope === 'pending'}
        onLoadMore={() => onLoadMore('pending')}
        cardProps={cardProps}
        pending={pendingAction}
      />
      <TreatmentGroup
        title="Historial"
        label="Historial de tratamientos"
        items={historyItems}
        emptyText="Aún no existe historial de tratamientos estructurados."
        hasMore={historyHasMore}
        loadingMore={loadingMoreScope === 'history'}
        onLoadMore={() => onLoadMore('history')}
        cardProps={cardProps}
      />
    </> : null}
  </section>
}
