import { useState } from 'react'
import { useClinic } from '../../context/clinicContextValue'
import { createConsultationAmendment, listClinicalRevisions, listConsultationAmendments } from '../../services/patientService'
import { normalizePage } from '../../services/pagination'
import { examinationFields, generalFields, narrativeCards, systemsFields, vitalFields } from './consultationSchema'

const labels = {
  ...Object.fromEntries([...generalFields, ...systemsFields, ...vitalFields, ...examinationFields].map(({ field, label }) => [field, label])),
  ...Object.fromEntries(narrativeCards.map(([, label, field]) => [field, label])),
  allergies: 'Alergias', current_medications: 'Medicamentos actuales', relevant_conditions: 'Condiciones relevantes',
  other_clinical_alerts: 'Otras alertas', present_illness_history: 'Historia de enfermedad actual', family_history: 'Antecedentes familiares',
  infectious_diseases: 'Antecedentes infectocontagiosos', hereditary_diseases: 'Antecedentes hereditarios',
  radiographic_exams: 'Exámenes radiográficos', clinical_photographs: 'Fotografías clínicas',
  examiner_name: 'Examinador', consultation_date: 'Fecha del expediente', consultation_time: 'Hora del expediente',
  professional_name_snapshot: 'Profesional', completed_at: 'Fecha de cierre',
}
const presentValue = (value) => {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) return value.join('; ')
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${presentValue(item)}`).join('; ')
  return String(value ?? '')
}

export default function ClinicalHistoryPanel({ accessToken, patientId, consultationId, canAmend = false }) {
  const { profile } = useClinic()
  const timeLabel = (value) => new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: profile.timezone,
  }).format(new Date(value))
  const [revisions, setRevisions] = useState(null)
  const [amendments, setAmendments] = useState(null)
  const [revisionPage, setRevisionPage] = useState(1)
  const [amendmentPage, setAmendmentPage] = useState(1)
  const [hasMoreRevisions, setHasMoreRevisions] = useState(false)
  const [hasMoreAmendments, setHasMoreAmendments] = useState(false)
  const [reason, setReason] = useState('')
  const [content, setContent] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const load = async (kind, page = 1) => {
    setPending(true); setError('')
    try {
      const result = normalizePage(await (kind === 'revisions'
        ? listClinicalRevisions(accessToken, patientId, consultationId, page)
        : listConsultationAmendments(accessToken, patientId, consultationId, page)))
      if (kind === 'revisions') {
        setRevisions((current) => page === 1 ? result.results : [...current, ...result.results])
        setRevisionPage(page); setHasMoreRevisions(Boolean(result.next))
      } else {
        setAmendments((current) => page === 1 ? result.results : [...current, ...result.results])
        setAmendmentPage(page); setHasMoreAmendments(Boolean(result.next))
      }
    } catch (requestError) { setError(requestError.message) }
    finally { setPending(false) }
  }
  const save = async () => {
    if (pending) return
    if (!reason.trim() || !content.trim()) { setError('Escribe el motivo y el contenido de la adenda.'); return }
    setPending(true); setError('')
    try {
      const result = await createConsultationAmendment(accessToken, patientId, consultationId, { reason, content })
      setAmendments((current) => [...(current || []), result])
      setReason(''); setContent('')
    } catch (requestError) { setError(requestError.message) }
    finally { setPending(false) }
  }
  return <section aria-label="Trazabilidad clínica" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-semibold text-slate-900">Historial de revisiones{consultationId ? ' y adendas' : ''}</h2>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={pending} onClick={() => load('revisions')} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Ver revisiones</button>
      {consultationId ? <button type="button" disabled={pending} onClick={() => load('amendments')} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Ver adendas</button> : null}
    </div>
    {pending ? <p role="status" className="mt-3 text-sm text-slate-500">Procesando…</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {revisions?.length === 0 ? <p className="mt-3 text-sm text-slate-500">Sin revisiones registradas.</p> : null}
    {revisions?.map((revision) => <details key={revision.id} className="mt-3 rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Revisión {revision.resource_version} · {revision.author_name} · {timeLabel(revision.created_at)}</summary>
      <p className="mt-2 text-sm text-slate-600">{revision.reason}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(revision.snapshot).filter(([field]) => labels[field]).map(([field, value]) => <div key={field}><dt className="text-xs font-semibold text-slate-500">{labels[field]}</dt><dd className="whitespace-pre-wrap break-words text-sm">{presentValue(value) || 'Sin información registrada'}</dd></div>)}</dl>
    </details>)}
    {hasMoreRevisions ? <button type="button" disabled={pending} onClick={() => load('revisions', revisionPage + 1)} className="mt-3 text-sm font-semibold text-blue-700">Más revisiones</button> : null}
    {amendments?.length === 0 ? <p className="mt-3 text-sm text-slate-500">Sin adendas registradas.</p> : null}
    {amendments?.map((amendment) => <article key={amendment.id} className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
      <p className="text-xs font-semibold text-slate-600">{amendment.author_name} · {timeLabel(amendment.created_at)}</p>
      <p className="mt-2 text-sm font-semibold">{amendment.reason}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{amendment.content}</p>
    </article>)}
    {hasMoreAmendments ? <button type="button" disabled={pending} onClick={() => load('amendments', amendmentPage + 1)} className="mt-3 text-sm font-semibold text-blue-700">Más adendas</button> : null}
    {canAmend ? <fieldset disabled={pending} className="mt-5 grid gap-3 border-t border-slate-200 pt-4">
      <legend className="text-sm font-semibold">Registrar adenda</legend>
      <p className="text-xs text-slate-600">La consulta original permanecerá intacta. La aclaración conservará tu nombre y la fecha.</p>
      <label className="grid gap-1 text-sm">Motivo de la adenda<textarea aria-label="Motivo de la adenda" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={2} className="rounded-lg border border-slate-300 p-2" /></label>
      <label className="grid gap-1 text-sm">Contenido de la adenda<textarea aria-label="Contenido de la adenda" value={content} onChange={(event) => setContent(event.target.value)} maxLength={10000} rows={4} className="rounded-lg border border-slate-300 p-2" /></label>
      <button type="button" onClick={save} className="justify-self-start rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Guardar adenda</button>
    </fieldset> : null}
  </section>
}
