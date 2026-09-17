import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createClosure, getBusinessHours, listClosures, updateBusinessHours, updateClosure } from '../../services/clinicService'

const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const normalizeDays = (days) => days.map((day) => ({
  ...day,
  opens_at: day.opens_at?.slice(0, 5) || null,
  closes_at: day.closes_at?.slice(0, 5) || null,
  breaks: day.breaks.map((item) => ({
    starts_at: item.starts_at.slice(0, 5), ends_at: item.ends_at.slice(0, 5),
  })),
}))

export default function BusinessHoursPanel({ accessToken }) {
  const [days, setDays] = useState([])
  const [closures, setClosures] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [conflicts, setConflicts] = useState([])
  const [modal, setModal] = useState(false)
  const [closure, setClosure] = useState({ name: '', date: '', repeats_annually: false })

  useEffect(() => {
    Promise.all([getBusinessHours(accessToken), listClosures(accessToken)])
      .then(([hours, items]) => { setDays(normalizeDays(hours.days)); setClosures(items) })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false))
  }, [accessToken])

  const updateDay = (index, changes) => setDays((current) => current.map((day, itemIndex) => itemIndex === index ? { ...day, ...changes } : day))
  const updateBreak = (dayIndex, breakIndex, changes) => updateDay(dayIndex, { breaks: days[dayIndex].breaks.map((item, index) => index === breakIndex ? { ...item, ...changes } : item) })
  const validation = days.find((day) => day.is_open && (!day.opens_at || !day.closes_at || day.opens_at >= day.closes_at || day.breaks.some((item, index) => item.starts_at >= item.ends_at || item.starts_at < day.opens_at || item.ends_at > day.closes_at || day.breaks.some((other, otherIndex) => otherIndex !== index && other.starts_at < item.ends_at && other.ends_at > item.starts_at))))

  const save = async () => {
    if (validation) { setMessage(`Revisa los intervalos de ${names[validation.weekday]}.`); return }
    setSaving(true); setMessage(''); setConflicts([])
    try { setDays(normalizeDays((await updateBusinessHours(accessToken, { days })).days)); setMessage('Horarios guardados correctamente.') }
    catch (error) { setMessage(error.message); setConflicts(error.data?.conflicting_appointments || []) }
    finally { setSaving(false) }
  }
  const saveClosure = async (event) => {
    event.preventDefault()
    try { const saved = await createClosure(accessToken, closure); setClosures((current) => [...current, saved]); setModal(false); setClosure({ name: '', date: '', repeats_annually: false }) }
    catch (error) { setMessage(error.message); setConflicts(error.data?.conflicting_appointments || []); setModal(false) }
  }
  const archiveClosure = async (item) => {
    const saved = await updateClosure(accessToken, item.id, { is_active: false })
    setClosures((current) => current.map((value) => value.id === saved.id ? saved : value))
  }

  if (loading) return <PanelState text="Cargando horarios…" />
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="hours-title">
    <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5"><div><h2 id="hours-title" className="font-sans text-2xl font-semibold text-slate-900">Horarios de atención</h2><p className="mt-1 text-xs text-slate-500">Configura jornadas, pausas y cierres de la clínica.</p></div><button type="button" onClick={save} disabled={saving} className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar cambios'}</button></header>
    {message ? <div role={message.includes('correctamente') ? 'status' : 'alert'} className={`mx-5 mt-5 rounded-xl px-4 py-3 text-sm ${message.includes('correctamente') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      <p>{message}</p>
      {conflicts.length ? <div className="mt-3 border-t border-red-200 pt-3">
        <strong>Citas afectadas</strong>
        <p className="mt-1">Reprograma o cancela estas citas antes de guardar el cambio de horario.</p>
        <ul className="mt-2 space-y-1">{conflicts.map((item) => <li key={item.id}>{item.date} · {item.start_time.slice(0, 5)} · {item.patient_name}</li>)}</ul>
        <Link to="/citas" className="mt-3 inline-block font-semibold text-blue-700 underline underline-offset-2">Revisar agenda</Link>
      </div> : null}
    </div> : null}
    <div className="space-y-3 p-5">{days.map((day, index) => <div key={day.weekday} className={`rounded-xl border p-4 ${day.is_open ? 'border-slate-200' : 'border-slate-100 bg-slate-50'}`}>
      <div className="flex flex-wrap items-center gap-3"><label className="flex min-w-32 items-center gap-3 font-semibold text-slate-800"><input type="checkbox" checked={day.is_open} onChange={(event) => updateDay(index, { is_open: event.target.checked, opens_at: event.target.checked ? day.opens_at || '08:00' : null, closes_at: event.target.checked ? day.closes_at || '17:00' : null, breaks: event.target.checked ? day.breaks : [] })} className="h-5 w-5 accent-blue-700" />{names[day.weekday]}</label>{day.is_open ? <><input aria-label={`Apertura ${names[day.weekday]}`} type="time" value={day.opens_at || ''} onChange={(event) => updateDay(index, { opens_at: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2" /><span>–</span><input aria-label={`Cierre ${names[day.weekday]}`} type="time" value={day.closes_at || ''} onChange={(event) => updateDay(index, { closes_at: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2" /><button type="button" onClick={() => updateDay(index, { breaks: [...day.breaks, { starts_at: '12:00', ends_at: '13:00' }] })} className="ml-auto text-xs font-semibold text-blue-700">＋ Añadir pausa</button></> : <span className="text-sm text-slate-400">Cerrado</span>}</div>
      {day.breaks.map((item, breakIndex) => <div key={`${breakIndex}-${item.starts_at}`} className="mt-3 flex items-center gap-2 pl-8 text-xs text-slate-500"><span>Pausa</span><input aria-label={`Inicio pausa ${names[day.weekday]} ${breakIndex + 1}`} type="time" value={item.starts_at} onChange={(event) => updateBreak(index, breakIndex, { starts_at: event.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" /><span>–</span><input aria-label={`Fin pausa ${names[day.weekday]} ${breakIndex + 1}`} type="time" value={item.ends_at} onChange={(event) => updateBreak(index, breakIndex, { ends_at: event.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5" /><button type="button" aria-label="Eliminar pausa" onClick={() => updateDay(index, { breaks: day.breaks.filter((_, itemIndex) => itemIndex !== breakIndex) })} className="rounded p-1 text-red-700">×</button></div>)}
    </div>)}</div>
    <div className="border-t border-slate-100 p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-slate-900">Festivos y cierres</h3><p className="text-xs text-slate-500">Bloqueos de día completo, únicos o anuales.</p></div><button type="button" onClick={() => setModal(true)} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700">＋ Añadir cierre</button></div>
      <ul className="mt-4 space-y-2">{closures.filter((item) => item.is_active).map((item) => <li key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span><strong>{item.name}</strong> · {item.date}{item.repeats_annually ? ' · cada año' : ''}</span><button type="button" onClick={() => archiveClosure(item)} className="text-xs font-semibold text-red-700">Archivar</button></li>)}</ul>
    </div>
    {modal ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={saveClosure} role="dialog" aria-modal="true" aria-labelledby="closure-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 id="closure-title" className="font-sans text-2xl font-semibold">Nuevo cierre</h2><label className="mt-5 grid gap-1 text-sm font-semibold">Descripción<input required value={closure.name} onChange={(event) => setClosure((value) => ({ ...value, name: event.target.value }))} className="rounded-lg border p-2.5 font-normal" /></label><label className="mt-4 grid gap-1 text-sm font-semibold">Fecha<input required type="date" value={closure.date} onChange={(event) => setClosure((value) => ({ ...value, date: event.target.value }))} className="rounded-lg border p-2.5 font-normal" /></label><label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={closure.repeats_annually} onChange={(event) => setClosure((value) => ({ ...value, repeats_annually: event.target.checked }))} /> Repetir cada año</label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Guardar cierre</button></div></form></div> : null}
  </section>
}

function PanelState({ text }) { return <div className="grid min-h-80 place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">{text}</div> }
