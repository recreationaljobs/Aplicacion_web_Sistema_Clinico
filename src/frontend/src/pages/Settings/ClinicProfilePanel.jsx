import { useSystemFeatures } from '../../context/systemFeaturesValue'
import { useEffect, useState } from 'react'
import { useClinic } from '../../context/clinicContextValue'
import { getClinicOptions, updateClinicProfile } from '../../services/clinicService'
import fallbackLogo from '../../assets/logo_login.svg'

export default function ClinicProfilePanel({ accessToken }) {
  const { uploads } = useSystemFeatures()
  const { profile, setProfile } = useClinic()
  const [values, setValues] = useState(profile)
  const [options, setOptions] = useState({ currencies: [], timezones: [] })
  const [logo, setLogo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => setValues(profile), [profile])
  useEffect(() => { getClinicOptions(accessToken).then(setOptions).catch((error) => setMessage(error.message)) }, [accessToken])

  const change = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    const data = new FormData()
    ;['name', 'phone', 'email', 'address', 'currency', 'timezone'].forEach((key) => data.append(key, values[key] || ''))
    if (logo) data.append('logo', logo)
    try {
      const saved = await updateClinicProfile(accessToken, data)
      setProfile(saved)
      setValues(saved)
      setLogo(null)
      setMessage('Perfil de la clínica actualizado.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="clinic-profile-title">
    <form onSubmit={submit}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
        <div><h2 id="clinic-profile-title" className="font-sans text-2xl font-semibold text-slate-900">Perfil de la clínica</h2><p className="mt-1 text-xs text-slate-500">Identidad, contacto y preferencias regionales.</p></div>
        <button disabled={saving} className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </header>
      <div className="grid gap-6 p-5 md:grid-cols-[170px_1fr]">
        <div>
          <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4"><img src={logo ? URL.createObjectURL(logo) : profile.logo_url || fallbackLogo} alt="Vista previa del logo" className="max-h-full max-w-full object-contain" /></div>
          <label className="mt-3 block cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-center text-xs font-semibold text-blue-700 hover:bg-blue-50">Reemplazar logo<input className="sr-only" type="file" disabled={!uploads} accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogo(event.target.files[0] || null)} /></label>
          <p className="mt-2 text-[11px] text-slate-400">PNG, JPEG o WebP · máximo 2 MB</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la clínica" wide><input required name="name" value={values.name || ''} onChange={change} /></Field>
          <Field label="Teléfono"><input name="phone" value={values.phone || ''} onChange={change} /></Field>
          <Field label="Correo electrónico"><input type="email" name="email" value={values.email || ''} onChange={change} /></Field>
          <Field label="Dirección" wide><textarea rows="3" name="address" value={values.address || ''} onChange={change} /></Field>
          <Field label="Moneda"><select name="currency" value={values.currency || 'NIO'} onChange={change}>{options.currencies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          <Field label="Zona horaria"><select name="timezone" value={values.timezone || 'America/Managua'} onChange={change}>{options.timezones.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
        </div>
      </div>
      {message ? <p role="status" className={`mx-5 mb-5 rounded-xl px-4 py-3 text-sm ${message.includes('actualizado') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message}</p> : null}
    </form>
  </section>
}

function Field({ label, wide, children }) {
  return <label className={`grid gap-1.5 text-sm font-semibold text-slate-700 ${wide ? 'sm:col-span-2' : ''}`}>{label}<span className="contents [&>*]:rounded-xl [&>*]:border [&>*]:border-slate-200 [&>*]:bg-white [&>*]:px-3 [&>*]:py-2.5 [&>*]:font-normal [&>*]:outline-none focus-within:[&>*]:border-blue-500 focus-within:[&>*]:ring-2 focus-within:[&>*]:ring-blue-100">{children}</span></label>
}
