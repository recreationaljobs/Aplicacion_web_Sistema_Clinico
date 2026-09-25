import { useSystemFeatures } from '../../context/systemFeaturesValue'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import logo from '../../assets/logo_login.svg'
import image from '../../assets/imagen_login.webp'
import CustomButton from '../../components/CustomButton'
import { useAuth } from '../../context/authContextValue'
import { login } from '../../services/authService'

export default function LoginPage() {
  const { password_reset: passwordResetEnabled } = useSystemFeatures()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [notice] = useState(() => {
    const storedNotice = sessionStorage.getItem('dentalclinic_auth_notice')
    sessionStorage.removeItem('dentalclinic_auth_notice')
    return location.state?.notice || storedNotice || ''
  })
  const change = ({ target }) => setForm((current) => ({ ...current, [target.name]: target.value }))
  const submit = async (event) => {
    event.preventDefault(); setError('')
    if (!form.email.trim() || !form.password) return setError('Ingresa tu correo electrónico y contraseña.')
    try { setLoading(true); const session = await login({ email: form.email.trim(), password: form.password }); signIn(session); navigate('/bienvenida', { replace: true }) }
    catch (err) { setError(err.message || 'Correo electrónico o contraseña incorrectos.') }
    finally { setLoading(false) }
  }
  return (
    <main className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <section className="hidden overflow-hidden lg:block lg:w-[42%] xl:w-[45%]" aria-hidden="true">
        <img src={image} alt="" width="720" height="1023" className="h-full min-h-screen w-full object-cover" />
      </section>
      <section className="grid min-w-0 flex-1 place-items-center px-5 py-10 sm:px-8">
          <form onSubmit={submit} className="flex flex-col w-[min(100%,390px)]" noValidate>
            <img src={logo} width="560" height="144" className="mb-2 h-auto w-[210px] self-center" alt="DentalClinic" />
            <p className="self-center text-slate-600 text-sm mb-8">Sistema de Gestión Odontológica</p>
            <h1 className="m-0 text-[25px] font-medium">Bienvenido</h1>
            <p className="mt-1 mb-6 text-slate-600 text-sm">Ingresa tus credenciales para acceder</p>
            {notice ? <div role="status" className="bg-[#eefaf4] text-[#17603e] px-3 py-2.5 mb-3.5 rounded-md text-sm">{notice}</div> : null}
            {error && <div role="alert" className="bg-[#fff0f0] text-[#a51d1d] px-3 py-2.5 mb-3.5 rounded-md text-sm">{error}</div>}
            <label htmlFor="email" className="text-sm font-bold mb-1.5">Correo electrónico</label>
            <input id="email" name="email" type="email" value={form.email} onChange={change} placeholder="nombre@clinica.com" autoComplete="email" inputMode="email" spellCheck="false" className="mb-4 rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            <label htmlFor="password" className="text-sm font-bold mb-1.5">Contraseña</label>
            <div className="relative mb-4">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={change} placeholder="Tu contraseña…" autoComplete="current-password" className="w-full rounded-lg border border-slate-300 py-3 pl-3 pr-12 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
              <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} aria-controls="password" className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-slate-500 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword ? <path d="m3 3 18 18" /> : null}
                </svg>
              </button>
            </div>
            <div className="flex justify-end items-center mb-10 text-xs">
              {passwordResetEnabled ? <Link to="/recuperar-contrasena" className="text-[#252525] no-underline font-semibold">¿Has olvidado tu contraseña?</Link> : <p>Para cambiar tu contraseña, contacta al administrador de la demo.</p>}
            </div>
           
          </form>
        </section>
    </main>
  )
}
