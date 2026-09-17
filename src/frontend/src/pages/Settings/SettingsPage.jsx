import { useSystemFeatures } from '../../context/systemFeaturesValue'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/authContextValue'
import { createUser, listUsers, updateUser } from '../../services/userService'
import AuthenticatedAvatar from '../../components/AuthenticatedAvatar'
import RolePermissionsPanel from './RolePermissionsPanel'
import PaginationControls from '../../components/PaginationControls'
import { normalizePage } from '../../services/pagination'
import { hasCapability } from '../../utils/capabilities'

const ClinicProfilePanel = lazy(() => import('./ClinicProfilePanel'))
const BusinessHoursPanel = lazy(() => import('./BusinessHoursPanel'))
const ServicesPanel = lazy(() => import('./ServicesPanel'))

const settingsSections = [
  ['▤', 'Perfil de la clínica', 'Datos básicos y logo', 'clinic.manage'],
  ['◷', 'Horarios de atención', 'Días y horas laborales', 'clinic.manage'],
  ['✚', 'Servicios y tarifas', 'Tratamientos y precios', 'clinic.manage'],
  ['▣', 'Gestión de Staff', 'Doctores y asistentes', 'users.manage'],
  ['◈', 'Permisos por rol', 'Accesos por perfil', 'users.manage'],
]

const sectionKeys = {
  perfil: 'Perfil de la clínica',
  horarios: 'Horarios de atención',
  servicios: 'Servicios y tarifas',
  staff: 'Gestión de Staff',
  permisos: 'Permisos por rol',
}
const keysBySection = Object.fromEntries(
  Object.entries(sectionKeys).map(([key, section]) => [section, key]),
)
const PAGE_SIZE = 25

const roleLabels = {
  ADMINISTRADOR: 'Administrador',
  RECEPCIONISTA: 'Recepcionista',
  ODONTOLOGO: 'Odontólogo',
}

const userDisplayName = (user) => (
  `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
)

const emptyForm = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  role: 'ODONTOLOGO',
  specialty: '',
  professional_registration_number: '',
  password: '',
  confirm_password: '',
}

function MemberForm({ onClose, onSaved, accessToken, editingUser }) {
  const { uploads } = useSystemFeatures()
  const isEditing = Boolean(editingUser)
  const [form, setForm] = useState(() => editingUser ? {
    email: editingUser.email,
    first_name: editingUser.first_name,
    last_name: editingUser.last_name,
    phone: editingUser.phone || '',
    role: editingUser.role,
    specialty: editingUser.specialty || '',
    professional_registration_number: editingUser.professional_registration_number || '',
  } : emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatar, setAvatar] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false)
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
    dialog?.querySelector('input[name="first_name"]')?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll(focusableSelector)]
        .filter((element) => element.getAttribute('aria-hidden') !== 'true')
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    if (!avatar) {
      setAvatarPreview('')
      return undefined
    }
    const objectUrl = URL.createObjectURL(avatar)
    setAvatarPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [avatar])

  const update = (event) => {
    const { checked, name, type, value } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  const togglePasswordChange = () => {
    setError('')
    setForm((current) => {
      if (!passwordChangeOpen) {
        return { ...current, new_password: '', confirm_password: '' }
      }
      const next = { ...current }
      delete next.new_password
      delete next.confirm_password
      return next
    })
    setPasswordChangeOpen((current) => !current)
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (isEditing && passwordChangeOpen) {
      if (!form.new_password || !form.confirm_password) {
        setError('Completa ambos campos de contraseña.')
        return
      }
      if (form.new_password !== form.confirm_password) {
        setError('Las contraseñas no coinciden.')
        return
      }
    }
    setSaving(true)
    try {
      const payload = { ...form }
      if (
        !payload.specialty
        && !Object.prototype.hasOwnProperty.call(editingUser || {}, 'specialty')
      ) delete payload.specialty
      if (
        !payload.professional_registration_number
        && !Object.prototype.hasOwnProperty.call(
          editingUser || {},
          'professional_registration_number',
        )
      ) {
        delete payload.professional_registration_number
      }
      if (avatar) payload.avatar = avatar
      if (removeAvatar) payload.remove_avatar = true
      const saved = isEditing
        ? await updateUser(accessToken, editingUser.id, payload)
        : await createUser(accessToken, payload)
      onSaved(saved)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="member-form-title" className="max-h-[92vh] w-full max-w-xl overscroll-contain overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="member-form-title" className="font-sans text-2xl font-semibold text-slate-900">{isEditing ? 'Editar miembro' : 'Añadir miembro'}</h2>
            <p className="mt-1 text-sm text-slate-500">{isEditing ? 'Actualiza los datos y el acceso de esta cuenta.' : 'Crea las credenciales para el personal autorizado.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar formulario" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">×</button>
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">Nombre
            <input required name="first_name" value={form.first_name} onChange={update} autoComplete="given-name" className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">Apellidos
            <input required name="last_name" value={form.last_name} onChange={update} className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">Correo electrónico
            <input required type="email" name="email" value={form.email} onChange={update} className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">Teléfono
            <input name="phone" value={form.phone} onChange={update} placeholder="+505 8888 8888" className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-4">
              {avatarPreview ? <span className="grid h-14 w-14 overflow-hidden rounded-full bg-blue-100"><img src={avatarPreview} alt="Vista previa de la foto del miembro" className="h-full w-full object-cover" /></span> : <AuthenticatedAvatar user={removeAvatar ? { ...editingUser, avatar_url: '' } : editingUser} accessToken={accessToken} alt={editingUser ? `Foto de ${`${editingUser.first_name} ${editingUser.last_name}`.trim()}` : 'Foto del nuevo miembro'} className="h-14 w-14" />}
              <div className="min-w-0 flex-1">
                <label className="inline-flex cursor-pointer rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Foto de perfil<input type="file" disabled={!uploads} aria-label="Foto de perfil" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { setAvatar(event.target.files?.[0] || null); setRemoveAvatar(false) }} /></label>
                <p className="mt-1 text-[11px] text-slate-400">PNG, JPEG o WebP · máximo 2 MB</p>
              </div>
              {isEditing && editingUser.avatar_url && !removeAvatar ? <button type="button" onClick={() => { setAvatar(null); setRemoveAvatar(true) }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Quitar foto</button> : null}
            </div>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">Rol
            <select name="role" value={form.role} onChange={update} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100">
              <option value="ODONTOLOGO">Odontólogo</option>
              <option value="RECEPCIONISTA">Recepcionista</option>
              <option value="ADMINISTRADOR">Administrador</option>
            </select>
          </label>
          {form.role === 'ODONTOLOGO' ? (
            <div className="grid gap-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 sm:col-span-2 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">Especialidad
                <input maxLength="200" name="specialty" value={form.specialty || ''} onChange={update} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">Código MINSA
                <input maxLength="100" name="professional_registration_number" value={form.professional_registration_number || ''} onChange={update} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              </label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Ambos datos son opcionales y se conservan si posteriormente cambia el rol.</p>
            </div>
          ) : null}
          {isEditing ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:col-span-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Acceso</p>
                    <p className="mt-0.5 text-xs text-slate-500">La contraseña actual se conserva si no solicitas un cambio.</p>
                  </div>
                  <button type="button" aria-expanded={passwordChangeOpen} aria-controls="staff-password-fields" onClick={togglePasswordChange} className="self-start rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                    {passwordChangeOpen ? 'Cancelar cambio de contraseña' : 'Cambiar contraseña'}
                  </button>
                </div>
                {passwordChangeOpen ? (
                  <div id="staff-password-fields" className="mt-4 grid gap-3 border-t border-blue-100 pt-4 sm:grid-cols-2">
                    <p id="staff-password-warning" className="text-xs leading-5 text-slate-600 sm:col-span-2">Al guardar la nueva contraseña, se cerrarán las sesiones activas de este usuario.</p>
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">Nueva contraseña
                      <input required type="password" name="new_password" value={form.new_password || ''} onChange={update} autoComplete="new-password" aria-describedby="staff-password-warning" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">Confirmar nueva contraseña
                      <input required type="password" name="confirm_password" value={form.confirm_password || ''} onChange={update} autoComplete="new-password" aria-describedby="staff-password-warning" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                    </label>
                  </div>
                ) : null}
            </div>
          ) : (
            <>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">Contraseña
                <input required type="password" name="password" value={form.password} onChange={update} autoComplete="new-password" className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">Confirmar contraseña
                <input required type="password" name="confirm_password" value={form.confirm_password} onChange={update} autoComplete="new-password" className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              </label>
            </>
          )}
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p> : null}
          <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button disabled={saving} type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Guardar usuario'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ArchiveMemberDialog({ accessToken, member, onClose, onArchived }) {
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const archivingRef = useRef(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    const focusableSelector = 'button:not([disabled])'
    dialog?.querySelector('[data-archive-cancel]')?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !archivingRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll(focusableSelector)]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  const confirmArchive = async () => {
    archivingRef.current = true
    setArchiving(true)
    setError('')
    try {
      await updateUser(accessToken, member.id, { is_active: false })
      onArchived(member)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      archivingRef.current = false
      setArchiving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="archive-member-title" aria-describedby="archive-member-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-amber-50 text-xl text-amber-700" aria-hidden="true">↓</div>
        <h2 id="archive-member-title" className="mt-4 font-sans text-2xl font-semibold text-slate-900">Archivar usuario</h2>
        <p id="archive-member-description" className="mt-2 text-sm leading-6 text-slate-600">
          ¿Quieres archivar a <strong className="text-slate-900">{userDisplayName(member)}</strong>?
        </p>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          Este usuario dejará de poder iniciar sesión y no aparecerá en operaciones activas. Su historial se conservará.
        </p>
        {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button data-archive-cancel type="button" disabled={archiving} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancelar</button>
          <button type="button" disabled={archiving} onClick={confirmArchive} className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">{archiving ? 'Archivando…' : 'Confirmar archivo'}</button>
        </div>
      </section>
    </div>
  )
}

export default function SettingsPage() {
  const { accessToken, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [users, setUsers] = useState([])
  const [userCount, setUserCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [archivingUser, setArchivingUser] = useState(null)
  const [reactivatingUserId, setReactivatingUserId] = useState(null)
  const [staffStatus, setStaffStatus] = useState('active')
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const visibleSettingsSections = settingsSections.filter(([, , , capability]) => (
    hasCapability(user, capability)
  ))
  const requestedSection = sectionKeys[searchParams.get('seccion')]
  const activeSection = visibleSettingsSections.some(([, title]) => title === requestedSection)
    ? requestedSection
    : visibleSettingsSections[0]?.[1]
  const canManageUsers = hasCapability(user, 'users.manage')

  useEffect(() => {
    if (!canManageUsers) {
      setLoading(false)
      return undefined
    }
    let active = true
    setLoading(true)
    setLoadError('')
    const options = { status: staffStatus, search }
    if (page > 1) options.page = page
    listUsers(accessToken, options)
      .then((data) => {
        if (!active) return
        const loaded = normalizePage(data)
        setUsers(loaded.results)
        setUserCount(loaded.count)
      })
      .catch((error) => { if (active) setLoadError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken, canManageUsers, page, search, staffStatus])

  const saveUser = (user) => {
    setUsers((current) => editingUser
      ? current.map((item) => item.id === user.id ? user : item)
      : staffStatus === 'active' && current.length < PAGE_SIZE ? [...current, user] : current)
    if (!editingUser && staffStatus === 'active') {
      setUserCount((current) => current + 1)
    }
    setFormOpen(false)
    setEditingUser(null)
  }

  const openCreateForm = () => {
    setEditingUser(null)
    setFormOpen(true)
  }

  const openEditForm = (user) => {
    setEditingUser(user)
    setFormOpen(true)
  }

  const removeUserFromCurrentView = (changedUser) => {
    setUsers((current) => current.filter((item) => item.id !== changedUser.id))
    setUserCount((current) => Math.max(0, current - 1))
    setArchivingUser(null)
    if (users.length === 1 && page > 1) setPage((current) => current - 1)
  }

  const changeStaffStatus = (nextStatus) => {
    setStaffStatus(nextStatus)
    setPage(1)
    setActionError('')
  }

  const submitSearch = (event) => {
    event.preventDefault()
    setSearch(searchDraft.trim())
    setPage(1)
    setActionError('')
  }

  const clearSearch = () => {
    setSearchDraft('')
    setSearch('')
    setPage(1)
  }

  const reactivateUser = async (member) => {
    setReactivatingUserId(member.id)
    setActionError('')
    try {
      await updateUser(accessToken, member.id, { is_active: true })
      removeUserFromCurrentView(member)
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setReactivatingUserId(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Administración</p>
        <h1 className="mt-1 font-sans text-4xl font-semibold tracking-tight text-slate-900">Configuración</h1>
        <p className="mt-2 text-sm text-slate-500">Administra los parámetros de la clínica, servicios y personal.</p>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Secciones de configuración" className="flex gap-2 overflow-x-auto lg:block lg:space-y-3">
          {visibleSettingsSections.map(([icon, title, description]) => {
            const active = title === activeSection
            return (
              <button key={title} type="button" onClick={() => setSearchParams({ seccion: keysBySection[title] })} aria-current={active ? 'page' : undefined} className={`flex min-w-60 items-center gap-3 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? 'border-2 border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{icon}</span>
                <span><strong className="block text-sm">{title}</strong><small className="block text-[11px] opacity-70">{description}</small></span>
              </button>
            )
          })}
        </nav>

        {activeSection === 'Gestión de Staff' ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="staff-title">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 id="staff-title" className="font-sans text-xl font-semibold text-slate-900">Gestión de Staff</h2><p className="mt-1 text-xs text-slate-500">Administra los profesionales y asistentes de la clínica.</p></div>
            <button type="button" aria-label="Añadir miembro" onClick={openCreateForm} className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">＋ Añadir miembro</button>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" aria-label="Estado del personal" className="inline-flex self-start rounded-xl bg-slate-100 p-1">
              {[
                ['active', 'Activos'],
                ['archived', 'Archivados'],
              ].map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={staffStatus === value} onClick={() => changeStaffStatus(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${staffStatus === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
              ))}
            </div>
            <form role="search" onSubmit={submitSearch} className="flex w-full gap-2 sm:max-w-sm">
              <input type="search" aria-label="Buscar personal" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Nombre o correo" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              {search ? <button type="button" onClick={clearSearch} className="rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Limpiar</button> : null}
              <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">Buscar</button>
            </form>
          </div>

          {loading ? <p className="p-8 text-center text-sm text-slate-500">Cargando miembros…</p> : null}
          {loadError ? <p role="alert" className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</p> : null}
          {actionError ? <p role="alert" className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
          {!loading && !loadError && users.length === 0 ? (
            <div className="grid min-h-64 place-content-center px-6 py-12 text-center">
              <span aria-hidden="true" className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-700">♙</span>
              <p className="text-sm font-semibold text-slate-700">{staffStatus === 'active' ? 'No hay usuarios activos.' : 'No hay usuarios archivados.'}</p>
              <p className="mt-1 text-xs text-slate-400">{search ? 'Prueba con otro nombre o correo.' : staffStatus === 'active' ? 'Añade un integrante o reactiva una cuenta archivada.' : 'Las cuentas archivadas aparecerán aquí.'}</p>
            </div>
          ) : null}
          {!loading && !loadError && users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Usuario</th><th className="px-5 py-3">Rol</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4"><div className="flex items-center gap-3"><AuthenticatedAvatar user={member} accessToken={accessToken} alt={`Foto de ${userDisplayName(member)}`} className="h-9 w-9" /><span><strong className="block text-sm text-slate-800">{userDisplayName(member)}</strong><small className="text-xs text-slate-500">{member.email}</small></span></div></td>
                      <td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{roleLabels[member.role] || member.role}</span></td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${member.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{member.is_active ? 'Activo' : 'Archivado'}</span></td>
                      <td className="px-5 py-4 text-right">{staffStatus === 'active' ? <div className="flex justify-end gap-2"><button type="button" onClick={() => openEditForm(member)} aria-label={`Editar a ${userDisplayName(member)}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:border-blue-200 hover:bg-blue-50">Editar</button>{member.id !== user.id ? <button type="button" onClick={() => setArchivingUser(member)} aria-label={`Archivar a ${userDisplayName(member)}`} className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50">Archivar</button> : null}</div> : <button type="button" disabled={reactivatingUserId === member.id} onClick={() => reactivateUser(member)} aria-label={`Reactivar a ${userDisplayName(member)}`} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">{reactivatingUserId === member.id ? 'Reactivando…' : 'Reactivar'}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!loading && !loadError ? <PaginationControls count={userCount} label="Personal" onPageChange={setPage} page={page} pageSize={PAGE_SIZE} /> : null}
        </section> : <Suspense fallback={<div className="grid min-h-80 place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">Cargando configuración…</div>}>
          {activeSection === 'Perfil de la clínica' ? <ClinicProfilePanel accessToken={accessToken} /> : null}
          {activeSection === 'Horarios de atención' ? <BusinessHoursPanel accessToken={accessToken} /> : null}
          {activeSection === 'Servicios y tarifas' ? <ServicesPanel accessToken={accessToken} /> : null}
          {activeSection === 'Permisos por rol' ? <RolePermissionsPanel accessToken={accessToken} /> : null}
        </Suspense>}
      </div>
      {formOpen ? <MemberForm onClose={() => setFormOpen(false)} onSaved={saveUser} accessToken={accessToken} editingUser={editingUser} /> : null}
      {archivingUser ? <ArchiveMemberDialog accessToken={accessToken} member={archivingUser} onClose={() => setArchivingUser(null)} onArchived={removeUserFromCurrentView} /> : null}
    </div>
  )
}
