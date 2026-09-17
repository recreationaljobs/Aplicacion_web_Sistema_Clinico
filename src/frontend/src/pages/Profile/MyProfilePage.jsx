import { useSystemFeatures } from '../../context/systemFeaturesValue'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthenticatedAvatar from '../../components/AuthenticatedAvatar'
import { useAuth } from '../../context/authContextValue'
import { getCurrentUser, updateCurrentProfile } from '../../services/userService'

const roleLabels = {
  ADMINISTRADOR: 'Administrador',
  RECEPCIONISTA: 'Recepcionista',
  ODONTOLOGO: 'Odontólogo',
}

const emptyForm = { first_name: '', last_name: '', phone: '', specialty: '', professional_registration_number: '', email: '', current_password: '' }

export default function MyProfilePage() {
  const { uploads } = useSystemFeatures()
  const { accessToken, updateUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [avatar, setAvatar] = useState(null)
  const [preview, setPreview] = useState('')
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    getCurrentUser(accessToken)
      .then((data) => {
        if (!active) return
        setProfile(data)
        setForm({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          phone: data.phone || '',
          specialty: data.specialty || '',
          professional_registration_number: data.professional_registration_number || '',
          email: data.email || '',
          current_password: '',
        })
        updateUser(data)
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, updateUser])

  useEffect(() => {
    if (!avatar) {
      setPreview('')
      return undefined
    }
    const objectUrl = URL.createObjectURL(avatar)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [avatar])

  const change = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setMessage('')
  }

  const chooseAvatar = (event) => {
    const file = event.target.files?.[0] || null
    setError('')
    if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setError('Usa una imagen PNG, JPEG o WebP de máximo 2 MB.')
      event.target.value = ''
      return
    }
    setAvatar(file)
    setRemoveAvatar(false)
    setMessage('')
  }

  const removePhoto = () => {
    setAvatar(null)
    setRemoveAvatar(true)
    setMessage('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    const values = {
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
      specialty: form.specialty,
      professional_registration_number: form.professional_registration_number,
      email: form.email,
    }
    if (form.email !== profile.email) values.current_password = form.current_password
    if (avatar) values.avatar = avatar
    if (removeAvatar) values.remove_avatar = true
    try {
      const saved = await updateCurrentProfile(accessToken, values)
      setProfile(saved)
      setForm((current) => ({ ...current, email: saved.email, current_password: '' }))
      setAvatar(null)
      setRemoveAvatar(false)
      updateUser(saved)
      setMessage('Perfil actualizado correctamente.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="mx-auto max-w-5xl text-sm text-slate-500">Cargando tu perfil…</p>
  if (!profile) return <p role="alert" className="mx-auto max-w-5xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>

  const emailChanged = form.email !== profile.email
  const displayName = `${form.first_name} ${form.last_name}`.trim() || form.email

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Cuenta personal</p>
        <h1 className="mt-1 font-sans text-4xl font-semibold tracking-tight text-slate-900">Mi perfil</h1>
        <p className="mt-2 text-sm text-slate-500">Mantén actualizados tus datos de contacto e identificación.</p>
      </header>

      <form onSubmit={submit} className="mt-8 grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-50/80 p-6 lg:border-b-0 lg:border-r">
          <div className="mx-auto flex max-w-56 flex-col items-center text-center">
            {preview ? (
              <span className="grid h-36 w-36 overflow-hidden rounded-full border-4 border-white bg-blue-100 shadow-md"><img src={preview} alt="Vista previa de la foto" className="h-full w-full object-cover" /></span>
            ) : removeAvatar ? (
              <span className="grid h-36 w-36 place-items-center rounded-full border-4 border-white bg-blue-100 text-3xl font-bold text-blue-700 shadow-md">{(form.first_name || form.email).slice(0, 2).toUpperCase()}</span>
            ) : (
              <AuthenticatedAvatar user={profile} accessToken={accessToken} alt={`Foto de ${displayName}`} className="h-36 w-36 border-4 border-white text-3xl shadow-md" />
            )}
            <h2 className="mt-4 font-sans text-2xl font-semibold text-slate-900">{displayName}</h2>
            <span className="mt-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">{roleLabels[profile.role] || profile.role}</span>
            {profile.role === 'ODONTOLOGO' ? (
              <dl className="mt-4 w-full rounded-xl border border-cyan-100 bg-white p-3 text-left text-xs">
                <div><dt className="font-semibold text-slate-500">Especialidad</dt><dd className="mt-0.5 text-slate-800">{profile.specialty || 'Sin especificar'}</dd></div>
                <div className="mt-3"><dt className="font-semibold text-slate-500">Código MINSA</dt><dd className="mt-0.5 text-slate-800">{profile.professional_registration_number || 'Sin especificar'}</dd></div>
              </dl>
            ) : null}
            <label className="mt-6 w-full cursor-pointer rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              Seleccionar foto
              <input className="sr-only" type="file" disabled={!uploads} accept="image/png,image/jpeg,image/webp" aria-label="Seleccionar foto" onChange={chooseAvatar} />
            </label>
            {(profile.avatar_url || avatar) && !removeAvatar ? <button type="button" onClick={removePhoto} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white">Quitar foto</button> : null}
            <p className="mt-3 text-xs leading-5 text-slate-400">PNG, JPEG o WebP · máximo 2 MB</p>
          </div>
        </aside>

        <section className="p-6 sm:p-8" aria-labelledby="identity-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 id="identity-title" className="font-sans text-2xl font-semibold text-slate-900">Datos personales</h2><p className="mt-1 text-sm text-slate-500">Esta información identifica tu cuenta dentro de la clínica.</p></div>
            <Link to="/cambiar-contrasena" className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 no-underline hover:bg-blue-50">Cambiar contraseña</Link>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">Nombre<input required name="first_name" value={form.first_name} onChange={change} className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">Apellidos<input required name="last_name" value={form.last_name} onChange={change} className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">Especialidad<input maxLength="200" name="specialty" value={form.specialty} onChange={change} className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">Código MINSA<input maxLength="100" name="professional_registration_number" value={form.professional_registration_number} onChange={change} className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">Teléfono<input name="phone" value={form.phone} onChange={change} placeholder="+505 8888 8888" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">Correo electrónico<input required type="email" name="email" value={form.email} onChange={change} className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></label>
            {emailChanged ? <label className="grid gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">Contraseña actual<input required aria-label="Contraseña actual" type="password" name="current_password" value={form.current_password} onChange={change} autoComplete="current-password" className="rounded-xl border border-amber-300 bg-amber-50/40 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /><span className="text-xs font-normal text-slate-500">Confírmala para proteger el cambio de tu correo de acceso.</span></label> : null}
          </div>
          {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          {message ? <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
          <div className="mt-7 flex justify-end border-t border-slate-100 pt-5"><button disabled={saving} type="submit" className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
        </section>
      </form>
    </div>
  )
}
