import Dialog from './Dialog'

const reasonLabels = {
  phone: 'Coincide el teléfono',
  name_and_date_of_birth: 'Coinciden nombre y fecha de nacimiento',
}

export default function PatientDuplicateDialog({
  matches = [],
  busy = false,
  onReview,
  onSelect,
  onBack,
  onContinue,
}) {
  if (matches.length === 0) return null

  return <Dialog onClose={busy ? undefined : onBack} aria-labelledby="patient-duplicate-title" className="w-full max-w-2xl rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Revisión administrativa</p>
      <h2 id="patient-duplicate-title" className="mt-1 font-sans text-2xl font-semibold text-slate-900">Posible paciente duplicado</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Encontramos registros con datos similares. Revisa las coincidencias antes de continuar.</p>

      <ul className="mt-5 space-y-3">
        {matches.map((match) => <li key={match.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong className="block text-sm text-slate-900">{match.full_name}</strong>
              <span className="mt-0.5 block text-xs font-semibold text-blue-700">{match.code}</span>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${match.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
              {match.is_active ? 'Paciente activo' : 'Paciente inactivo'}
            </span>
          </div>
          <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
            <div><dt className="font-semibold text-slate-500">Nacimiento</dt><dd>{match.date_of_birth || 'Sin registrar'}</dd></div>
            <div><dt className="font-semibold text-slate-500">Teléfono</dt><dd>{match.phone || 'Sin teléfono'}</dd></div>
          </dl>
          <ul className="mt-3 flex flex-wrap gap-2">
            {match.matched_on.map((reason) => <li key={reason} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{reasonLabels[reason]}</li>)}
          </ul>
          {onReview ? <button type="button" disabled={busy} onClick={() => onReview(match)} className="mt-4 text-sm font-semibold text-blue-700 underline-offset-2 hover:underline disabled:opacity-50">Revisar paciente</button> : null}
          {onSelect ? <button type="button" disabled={busy || !match.is_active} onClick={() => onSelect(match)} className="mt-4 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">Usar paciente existente</button> : null}
        </li>)}
      </ul>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={busy} onClick={onBack} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Volver</button>
        <button type="button" disabled={busy} onClick={onContinue} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Creando…' : 'Crear de todos modos'}</button>
      </div>
  </Dialog>
}
