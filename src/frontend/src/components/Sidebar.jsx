import { NavLink } from 'react-router-dom'
import MenuIcon from './MenuIcon'
import logo from '../assets/logo_login.svg'
import { useAuth } from '../context/authContextValue'
import { useClinic } from '../context/clinicContextValue'
import { hasAnyCapability, hasCapability } from '../utils/capabilities'

const menuItems = [
  { to: '/bienvenida', label: 'Dashboard', icon: 'dashboard' },
  { to: '/pacientes', label: 'Pacientes', icon: 'patients', capability: 'patients.view' },
  { to: '/citas', label: 'Citas', icon: 'appointments', capability: 'appointments.view' },
  {
    to: '/configuracion',
    label: 'Configuración',
    icon: 'settings',
    anyCapabilities: ['clinic.manage', 'users.manage'],
  },
]

export default function Sidebar() {
  const { profile } = useClinic()
  const { user } = useAuth()
  const visibleItems = menuItems.filter(({ capability, anyCapabilities }) => (
    (!capability || hasCapability(user, capability))
    && (!anyCapabilities || hasAnyCapability(user, anyCapabilities))
  ))
  return (
    <aside className="w-full shrink-0 overflow-y-auto border-b border-slate-200 bg-white px-4 py-4 md:h-full md:w-56 md:border-b-0 md:border-r md:px-5 md:py-6">
      <div className="mb-4 flex items-center justify-between md:mb-7 md:block">
        <img src={profile.logo_url || logo} alt="Dental Clinic" className="h-14 w-auto object-contain object-left md:h-20 md:max-w-40" />
        <strong className="hidden truncate font-serif text-lg text-slate-900 md:mt-1 md:block">{profile.name}</strong>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 md:mt-1 md:block">Panel clínico</span>
      </div>
      <nav aria-label="Navegación principal">
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 md:block md:space-y-1.5">
          {visibleItems.map(({ to, label, icon }) => (
            <li key={to} className="shrink-0">
              <NavLink
                to={to}
                className={({ isActive }) => `flex items-center gap-3 rounded-md px-2.5 py-2.5 text-[13px] font-medium no-underline transition-colors ${isActive ? 'bg-[#e5eff8] text-[#0068b5]' : 'text-[#354052] hover:bg-slate-50 hover:text-slate-950'}`}
              >
                <MenuIcon name={icon} />
                {to === '/pacientes' && user.role === 'ODONTOLOGO' ? 'Mis pacientes' : label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
