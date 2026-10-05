import image from '../assets/imagen_login.webp'
//import logo from '../assets/logo_login.svg'
// AuthRecoveryShell.jsx
import logo from '../assets/vite.jpeg'

const steps = ['Solicitud', 'Correo', 'Nueva contraseña']

export default function AuthRecoveryShell({ currentStep, title, subtitle, children }) {
  return (
    <main className="min-h-screen bg-[#f4f8fb] text-[#1e2933] md:grid md:grid-cols-[minmax(300px,42%)_1fr]">
      <aside className="relative hidden overflow-hidden md:block">
        <img src={image} alt="" width="720" height="1023" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(155deg,rgba(8,67,111,.9),rgba(18,105,173,.7))]" />
        <div className="relative flex h-full flex-col justify-end p-10 text-white lg:p-14">
          <p className="mb-3 text-xs font-bold uppercase tracking-[.22em] text-blue-100">Acceso protegido</p>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Recupera tu acceso sin comprometer la información clínica.</h2>
          <div className="mt-10 grid grid-cols-3 gap-2" aria-label="Progreso de recuperación">
            {steps.map((step, index) => (
              <div key={step} className="min-w-0">
                <div className={`mb-2 h-1 rounded-full ${index <= currentStep ? 'bg-white' : 'bg-white/30'}`} />
                <span className={`text-xs ${index === currentStep ? 'font-bold text-white' : 'text-blue-100'}`}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <section className="grid min-h-screen place-items-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[430px]">
          <img src={logo} width="560" height="144" className="mb-10 h-auto w-[170px]" alt="DentalClinic" />
          <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#1269ad]">Recuperación segura</p>
          <h1 className="m-0 text-3xl font-semibold tracking-[-.02em]">{title}</h1>
          <p className="mb-8 mt-3 leading-6 text-[#64717d]">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  )
}
