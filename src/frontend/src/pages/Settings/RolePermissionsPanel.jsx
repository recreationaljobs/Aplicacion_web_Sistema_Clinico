import { useEffect, useState } from 'react'
import { listRolePermissionPresets, updateRolePermissionPreset } from '../../services/userService'

const roleLabels = {
  RECEPCIONISTA: 'Recepcionista',
  ODONTOLOGO: 'Odontólogo',
}

const viewAllDependencies = {
  'appointments.view_all': 'appointments.view',
  'consultations.view_all': 'consultations.view',
}

export default function RolePermissionsPanel({ accessToken }) {
  const [catalog, setCatalog] = useState([])
  const [presets, setPresets] = useState([])
  const [selectedRole, setSelectedRole] = useState('RECEPCIONISTA')
  const [selectedPermissions, setSelectedPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    listRolePermissionPresets(accessToken)
      .then((data) => {
        if (!active) return
        setCatalog(data.available_permissions)
        setPresets(data.presets)
        setSelectedPermissions(
          data.presets.find((preset) => preset.role === 'RECEPCIONISTA')?.permissions || [],
        )
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [accessToken])

  const selectRole = (role) => {
    setSelectedRole(role)
    setSelectedPermissions(
      presets.find((preset) => preset.role === role)?.permissions || [],
    )
    setError('')
    setNotice('')
  }

  const togglePermission = (code) => {
    setSelectedPermissions((current) => {
      let next = current.includes(code)
        ? current.filter((permission) => permission !== code)
        : [...current, code]
      const dependentViewAll = Object.entries(viewAllDependencies)
        .find(([, basePermission]) => basePermission === code)?.[0]
      if (dependentViewAll && current.includes(code)) {
        next = next.filter((permission) => permission !== dependentViewAll)
      }
      const requiredView = viewAllDependencies[code]
      if (requiredView && !current.includes(code)) {
        next = [...next, requiredView]
      }
      return catalog.filter((permission) => next.includes(permission.code)).map(({ code: value }) => value)
    })
    setNotice('')
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await updateRolePermissionPreset(
        accessToken,
        selectedRole,
        selectedPermissions,
      )
      setPresets((current) => current.map((preset) => (
        preset.role === saved.role ? saved : preset
      )))
      setSelectedPermissions(saved.permissions)
      setNotice(`Permisos de ${roleLabels[saved.role]} actualizados.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const groups = catalog.reduce((current, permission) => {
    const group = current.find((item) => item.name === permission.group)
    if (group) group.permissions.push(permission)
    else current.push({ name: permission.group, permissions: [permission] })
    return current
  }, [])

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="role-permissions-title">
      <div className="border-b border-slate-100 p-5">
        <h2 id="role-permissions-title" className="font-sans text-xl font-semibold text-slate-900">Permisos por rol</h2>
        <p className="mt-1 text-xs text-slate-500">Define el acceso predeterminado de recepcionistas y odontólogos.</p>
      </div>

      {loading ? <p className="p-8 text-center text-sm text-slate-500">Cargando permisos…</p> : null}
      {error ? <p role="alert" className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!loading && catalog.length > 0 ? (
        <div className="p-5">
          <div className="flex flex-wrap gap-2" aria-label="Roles editables">
            {Object.entries(roleLabels).map(([role, label]) => (
              <button
                key={role}
                type="button"
                aria-pressed={selectedRole === role}
                onClick={() => selectRole(role)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${selectedRole === role ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
            Los cambios se aplican a todas las cuentas con el rol {roleLabels[selectedRole]}.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {groups.map((group) => (
              <fieldset key={group.name} className="rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-800">{group.name}</legend>
                <div className="mt-2 grid gap-3">
                  {group.permissions.map((permission) => (
                    <label key={permission.code} className="flex items-center gap-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(permission.code)}
                        onChange={() => togglePermission(permission.code)}
                        className="h-4 w-4 accent-blue-700"
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          {notice ? <p role="status" className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}
          <div className="mt-5 flex justify-end">
            <button disabled={saving} type="button" onClick={save} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
              {saving ? 'Guardando…' : 'Guardar permisos'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
