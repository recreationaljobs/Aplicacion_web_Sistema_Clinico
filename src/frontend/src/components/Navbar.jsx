import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/authContextValue'
import AuthenticatedAvatar from './AuthenticatedAvatar'

export default function Navbar() {
  const { user, accessToken, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const displayName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'Usuario'

  useEffect(() => {
    if (!open) return undefined
    const closeMenu = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (event.type === 'pointerdown' && !menuRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', closeMenu)
    document.addEventListener('pointerdown', closeMenu)
    return () => {
      document.removeEventListener('keydown', closeMenu)
      document.removeEventListener('pointerdown', closeMenu)
    }
  }, [open])

  const logout = () => {
    setOpen(false)
    signOut()
  }

  return (
    <header className="relative z-30 flex min-h-16 shrink-0 items-center justify-end border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label={`Abrir menú de ${displayName}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="flex items-center gap-2 rounded-full p-1 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <span className="hidden max-w-36 truncate text-xs font-semibold text-slate-600 sm:block">{displayName}</span>
            <AuthenticatedAvatar user={user} accessToken={accessToken} alt={displayName} className="h-9 w-9" />
            <span aria-hidden="true" className="hidden text-xs text-slate-400 sm:inline">⌄</span>
          </button>
          {open ? (
            <div role="menu" aria-label="Cuenta" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
              <div className="border-b border-slate-100 px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-slate-800">{displayName}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              <Link role="menuitem" to="/mi-perfil" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 no-underline hover:bg-blue-50 hover:text-blue-700">Mi perfil</Link>
              <Link role="menuitem" to="/cambiar-contrasena" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 no-underline hover:bg-blue-50 hover:text-blue-700">Cambiar contraseña</Link>
              <button role="menuitem" type="button" onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50">Cerrar sesión</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
