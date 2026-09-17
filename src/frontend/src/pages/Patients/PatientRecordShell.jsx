import { Link } from 'react-router-dom'

export function PatientHeader({
  patient,
  title,
  initials,
  isActive,
  identityText,
  profileComplete = patient?.profile_complete !== false,
}) {
  return <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-cyan-700 font-sans text-2xl font-semibold text-white">{initials}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{patient?.code || 'Código pendiente'}</span>
          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{isActive ? 'Paciente activo' : 'Paciente inactivo'}</span>
          {!profileComplete ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Perfil incompleto</span> : null}
        </div>
        <h1 className="mt-1 font-sans text-3xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-xs text-slate-500">{identityText}</p>
      </div>
    </div>
  </header>
}

export function PatientTabs({ patientId, active = 'summary', isNew = false }) {
  const tabs = [
    { key: 'summary', label: 'Resumen clínico', to: patientId ? `/pacientes/${patientId}` : '' },
    { key: 'consultations', label: 'Consultas', to: patientId ? `/pacientes/${patientId}/consultas` : '' },
    { key: 'odontogram', label: 'Odontograma', to: patientId ? `/pacientes/${patientId}/odontogramas` : '' },
    { key: 'documents', label: 'Documentos', to: patientId ? `/pacientes/${patientId}/documentos` : '' },
  ]
  const classes = (key, disabled) => `whitespace-nowrap border-b-2 py-3 text-xs transition-colors ${active === key ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'} ${disabled ? 'cursor-not-allowed opacity-45' : ''}`

  return <nav aria-label="Secciones del expediente" role="tablist" className="mt-1 flex gap-4 overflow-x-auto border-b border-slate-200 sm:gap-6 sm:px-4">
    {tabs.map((tab) => {
      const disabled = isNew
      return disabled
        ? <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} disabled className={classes(tab.key, true)}>{tab.label}</button>
        : <Link key={tab.key} to={tab.to} role="tab" aria-selected={active === tab.key} className={classes(tab.key, false)}>{tab.label}</Link>
    })}
  </nav>
}
