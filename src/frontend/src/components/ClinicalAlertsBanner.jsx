const HISTORICAL_ALLERGY_NOTE = 'Alergia registrada previamente; completar detalle'

const alertFields = [
  ['allergies', 'Alergias'],
  ['current_medications', 'Medicamentos actuales'],
  ['relevant_conditions', 'Condiciones relevantes'],
  ['other_clinical_alerts', 'Otras alertas'],
]


export default function ClinicalAlertsBanner({ clinicalRecord }) {
  const alerts = alertFields.flatMap(([field, label]) => {
    const value = typeof clinicalRecord?.[field] === 'string'
      ? clinicalRecord[field].trim()
      : ''
    return value ? [{ field, label, value }] : []
  })
  const hasAlerts = alerts.length > 0
  const hasPendingHistoricalAllergy = clinicalRecord?.allergies?.trim() === HISTORICAL_ALLERGY_NOTE

  return <section
    aria-label="Alertas clínicas"
    className={`rounded-2xl border px-5 py-4 shadow-sm ${hasAlerts ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${hasAlerts ? 'text-amber-800' : 'text-slate-500'}`}>Seguridad del paciente</p>
        <h2 className="mt-1 font-sans text-xl font-semibold text-slate-950">Alertas clínicas</h2>
      </div>
      {hasPendingHistoricalAllergy
        ? <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900">Información pendiente de completar</span>
        : null}
    </div>

    {hasAlerts
      ? <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {alerts.map(({ field, label, value }) => <div key={field}>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-amber-800">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-900">{value}</dd>
        </div>)}
      </dl>
      : <p className="mt-3 text-sm font-medium text-slate-600">No hay alertas clínicas registradas.</p>}
  </section>
}
