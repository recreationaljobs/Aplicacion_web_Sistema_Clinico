import { useEffect, useMemo, useState } from 'react'
import Dialog from '../../components/Dialog'
import { useClinic } from '../../context/clinicContextValue'
import { createClinicService, createServiceCategory, listClinicServices, listServiceCategories, updateClinicService, updateServiceCategory } from '../../services/clinicService'

const emptyService = { category: '', name: '', duration_minutes: 30, price: '' }

export default function ServicesPanel({ accessToken }) {
  const { profile } = useClinic()
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState(null)
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)

  const load = () => Promise.all([listServiceCategories(accessToken), listClinicServices(accessToken)])
    .then(([categoryData, serviceData]) => { setCategories(categoryData); setServices(serviceData) })
    .catch((error) => setMessage(error.message)).finally(() => setLoading(false))
  useEffect(() => { load() }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCategories = useMemo(() => categories.filter((item) => item.is_active), [categories])
  const money = (value) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: profile.currency }).format(Number(value))
  const openCategory = (item) => { setModal('category'); setValues(item || { name: '', position: categories.length }) }
  const openService = (item) => { setModal('service'); setValues(item || { ...emptyService, category: activeCategories[0]?.id || '' }) }
  const save = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setMessage('')
    try {
      if (modal === 'category') {
        const saved = values.id ? await updateServiceCategory(accessToken, values.id, values) : await createServiceCategory(accessToken, values)
        setCategories((current) => values.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
      } else {
        const payload = { ...values, category: Number(values.category), duration_minutes: Number(values.duration_minutes), price: String(values.price) }
        const saved = values.id ? await updateClinicService(accessToken, values.id, payload) : await createClinicService(accessToken, payload)
        setServices((current) => values.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved])
      }
      setModal(null); setMessage('Catálogo actualizado correctamente.')
    } catch (error) { setMessage(error.message) }
    finally { setSaving(false) }
  }
  const archiveCategory = async (item) => {
    try { const saved = await updateServiceCategory(accessToken, item.id, { is_active: false }); setCategories((current) => current.map((value) => value.id === saved.id ? saved : value)) }
    catch (error) { setMessage(error.message) }
  }
  const archiveService = async (item) => {
    try {
      const saved = await updateClinicService(accessToken, item.id, { is_active: false })
      setServices((current) => current.map((value) => value.id === saved.id ? saved : value))
    } catch (error) { setMessage(error.message) }
  }

  if (loading) return <div className="grid min-h-80 place-items-center rounded-2xl border bg-white text-sm text-slate-500">Cargando catálogo…</div>
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="services-title">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5"><div><h2 id="services-title" className="font-sans text-2xl font-semibold text-slate-900">Servicios y tarifas</h2><p className="mt-1 text-xs text-slate-500">Catálogo clínico usado al programar citas.</p></div><div className="flex gap-2"><button type="button" onClick={() => openCategory()} className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700">＋ Categoría</button><button type="button" disabled={!activeCategories.length} onClick={() => openService()} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">＋ Añadir servicio</button></div></header>
    <div className="space-y-6 p-5">{activeCategories.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center"><strong className="text-slate-700">Aún no hay categorías.</strong><p className="mt-1 text-sm text-slate-500">Crea una categoría para organizar los tratamientos.</p></div> : activeCategories.map((category) => {
      const categoryServices = services.filter((item) => item.category === category.id && item.is_active)
      return <section key={category.id}><div className="mb-2 flex items-center justify-between"><button type="button" onClick={() => openCategory(category)} className="font-semibold text-blue-700 hover:underline">{category.name}</button><button type="button" onClick={() => archiveCategory(category)} className="text-xs font-semibold text-red-700">Archivar categoría</button></div><div className="overflow-hidden rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Servicio</th><th className="px-4 py-3">Duración</th><th className="px-4 py-3">Precio</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{categoryServices.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium text-slate-800">{item.name}</td><td className="px-4 py-3 text-slate-600">{item.duration_minutes} min</td><td className="px-4 py-3 text-slate-600">{money(item.price)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => openService(item)} className="mr-3 text-xs font-semibold text-blue-700">Editar</button><button type="button" onClick={() => archiveService(item)} className="text-xs font-semibold text-red-700">Archivar</button></td></tr>)}{!categoryServices.length ? <tr><td colSpan="4" className="px-4 py-6 text-center text-slate-400">Sin servicios activos</td></tr> : null}</tbody></table></div></section>
    })}</div>
    {message ? <p role="status" className={`mx-5 mb-5 rounded-xl px-4 py-3 text-sm ${message.includes('correctamente') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message}</p> : null}
    {modal ? <Dialog as="form" onSubmit={save} onClose={saving ? undefined : () => setModal(null)} aria-labelledby="catalog-modal-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">{message && !message.includes("correctamente") ? <p role="alert" className="mb-3 text-sm text-red-700">{message}</p> : null}<h2 id="catalog-modal-title" className="font-sans text-2xl font-semibold">{modal === 'category' ? `${values.id ? 'Editar' : 'Nueva'} categoría` : `${values.id ? 'Editar' : 'Nuevo'} servicio`}</h2>{modal === 'category' ? <><Label text="Nombre"><input required value={values.name || ''} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} /></Label><Label text="Orden"><input min="0" type="number" value={values.position || 0} onChange={(event) => setValues((current) => ({ ...current, position: Number(event.target.value) }))} /></Label></> : <><Label text="Categoría"><select value={values.category || ''} onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))}>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Label><Label text="Nombre"><input required value={values.name || ''} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} /></Label><div className="grid grid-cols-2 gap-4"><Label text="Duración"><select value={values.duration_minutes || 30} onChange={(event) => setValues((current) => ({ ...current, duration_minutes: event.target.value }))}>{Array.from({ length: 16 }, (_, index) => (index + 1) * 15).map((item) => <option key={item} value={item}>{item} minutos</option>)}</select></Label><Label text={`Precio (${profile.currency})`}><input required min="0" step="0.01" type="number" value={values.price || ''} onChange={(event) => setValues((current) => ({ ...current, price: event.target.value }))} /></Label></div></>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setModal(null)} className="rounded-lg border px-4 py-2">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">{saving ? "Guardando…" : "Guardar"}</button></div></Dialog> : null}
  </section>
}

function Label({ text, children }) { return <label className="mt-4 grid gap-1.5 text-sm font-semibold text-slate-700">{text}<span className="contents [&>*]:rounded-lg [&>*]:border [&>*]:border-slate-200 [&>*]:p-2.5 [&>*]:font-normal">{children}</span></label> }
