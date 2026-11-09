import { useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import InventoryErrorBoundary from './components/InventoryErrorBoundary.jsx'
import ModuleIllustration from './components/ModuleIllustration.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import loginHeroImage from './img/Atención dental en clínica moderna.png'
import { isSupabaseConfigured, supabase } from './lib/supabase.js'
import StaffPage from './pages/StaffPage.jsx'
import PatientsPage from './pages/PatientsPage.jsx'
import AgendaPage from './pages/AgendaPage.jsx'
import ClinicalPage from './pages/ClinicalPage.jsx'
import FinancePage from './pages/FinancePage.jsx'
import InventoryPage from './pages/InventoryPage.jsx'

function LoginPage() {
  const { user, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    if (recoveryMode) {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/update-password`,
      })
      setSubmitting(false)
      if (recoveryError) {
        setError('No se pudo solicitar el enlace. Inténtalo nuevamente.')
        return
      }
      setRecoverySent(true)
      return
    }
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      setError('No pudimos iniciar sesión. Revisa tu correo y contraseña.')
      return
    }
    navigate(location.state?.from?.pathname || '/', { replace: true })
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-mark" aria-hidden="true">S</div>
        <p className="eyebrow">Clínica Dental Sonrisa</p>
        <h1>{recoveryMode ? 'Recupera tu acceso.' : 'Bienvenido de vuelta.'}</h1>
        <p className="login-intro">{recoveryMode ? 'Te enviaremos un enlace para definir una contraseña nueva.' : 'Ingresa con tu cuenta de personal para continuar.'}</p>
        {!isSupabaseConfigured ? (
          <div className="notice notice-warning" role="status">
            <strong>Falta conectar Supabase</strong>
            <p>Completa la URL y la clave pública del proyecto en <code>.env.local</code> y reinicia Vite.</p>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
            {!recoveryMode && <><label htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {recoverySent && <p className="form-success" role="status">Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.</p>}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Enviando…' : recoveryMode ? 'Enviar enlace de recuperación' : 'Iniciar sesión'}</button>
            <button className="recovery-toggle" type="button" onClick={() => { setRecoveryMode(!recoveryMode); setRecoverySent(false); setError('') }}>{recoveryMode ? 'Volver al inicio de sesión' : '¿Olvidaste tu contraseña?'}</button>
          </form>
        )}
        <p className="login-footnote">Acceso exclusivo para el personal de la clínica.</p>
      </section>
      <aside className="login-aside">
        <img className="login-hero-image" src={loginHeroImage} alt="Odontólogo y asistente atendiendo a una paciente en la clínica dental" fetchPriority="high" />
        <div className="aside-orbit orbit-one" aria-hidden="true" />
        <div className="aside-orbit orbit-two" aria-hidden="true" />
        <div className="aside-copy">
          <span>SONRISA · GESTIÓN CLÍNICA</span>
          <h2>Una atención más clara Y TESTEO, desde la recepción hasta el box.</h2>
          <p>Agenda, pacientes y gestión clínica en un solo lugar.</p>
        </div>
        <span className="aside-caption">Cuidamos cada detalle de tu clínica.</span>
      </aside>
    </main>
  )
}

function UpdatePasswordPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!user) return <Navigate to="/login" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSaving(false)
      return setError('No se pudo guardar la contraseña. Vuelve a abrir el enlace de invitación o solicita uno nuevo.')
    }
    const { error: completionError } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'complete-password-setup' },
    })
    setSaving(false)
    if (completionError) return setError('La contraseña se guardó, pero falta completar la activación. Recarga esta página para intentarlo de nuevo.')
    setMessage('Contraseña creada. Ya puedes entrar al sistema.')
    window.setTimeout(() => window.location.replace('/'), 900)
  }

  return (
    <main className="password-shell">
      <section className="password-card">
        <div className="brand-mark" aria-hidden="true">S</div>
        <p className="eyebrow">Activación de cuenta</p>
        <h1>Define tu contraseña.</h1>
        <p className="login-intro">Crea una contraseña de al menos 8 caracteres para acceder a la clínica.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="new-password">Contraseña nueva</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          <label htmlFor="confirm-password">Confirma la contraseña</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar contraseña'}</button>
        </form>
      </section>
    </main>
  )
}

function DashboardPage() {
  const { profile, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  const roleNames = {
    administrador: 'Administrador',
    recepcionista: 'Recepcionista',
    odontologo: 'Odontólogo',
    asistente_dental: 'Asistente dental',
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <Link className="brand-lockup" to="/">
          <span className="brand-mark small-mark">S</span>
          <span>Sonrisa<span className="brand-subtitle">GESTIÓN CLÍNICA</span></span>
        </Link>
        <div className="user-menu">
          <div className="user-avatar">{(profile.full_name || 'U').charAt(0).toUpperCase()}</div>
          <div className="user-info"><strong>{profile.full_name || 'Personal'}</strong><span>{roleNames[profile.role] || profile.role}</span></div>
          <button className="quiet-button" onClick={handleSignOut} disabled={signingOut}>{signingOut ? 'Saliendo…' : 'Cerrar sesión'}</button>
        </div>
      </header>
      <section className="welcome-section">
        <p className="eyebrow">Panel de gestión</p>
        <h1>Hola, {(profile.full_name || 'equipo').split(' ')[0]}.</h1>
        <p>Tu espacio de trabajo para organizar la atención de hoy.</p>
      </section>
      <section className="module-grid" aria-label="Módulos del sistema">
        <Link className="module-card module-link-card module-agenda" to="/agenda"><span className="module-icon">◷</span><span className="module-tag">AGENDA</span><h2>Agenda</h2><p>Consulta citas, disponibilidad de boxes y llegadas de pacientes.</p><span className="module-cta">Abrir agenda <span aria-hidden="true">→</span></span><ModuleIllustration type="agenda" /></Link>
        <Link className="module-card module-link-card module-patients" to="/patients"><span className="module-icon">＋</span><span className="module-tag">REGISTRO</span><h2>Pacientes</h2><p>Registra pacientes y consulta sus datos de contacto.</p><span className="module-cta">Abrir módulo <span aria-hidden="true">→</span></span><ModuleIllustration type="patients" /></Link>
        {['odontologo', 'administrador'].includes(profile.role) && <Link className="module-card module-link-card module-clinical" to="/clinical"><span className="module-icon">⌂</span><span className="module-tag">CLÍNICA</span><h2>Gestión clínica</h2><p>Registros clínicos, tratamientos y órdenes de laboratorio.</p><span className="module-cta">Abrir ficha clínica <span aria-hidden="true">→</span></span><ModuleIllustration type="clinical" /></Link>}
        {['administrador', 'recepcionista'].includes(profile.role) && <Link className="module-card module-link-card module-admin" to="/finance"><span className="module-icon">▤</span><span className="module-tag">FINANZAS</span><h2>Presupuestos y pagos</h2><p>Controla saldos, registra ingresos y consulta el reporte diario.</p><span className="module-cta">Abrir finanzas <span aria-hidden="true">→</span></span><ModuleIllustration type="finance" /></Link>}
        <Link className="module-card module-link-card module-inventory" to="/inventory"><span className="module-icon">▦</span><span className="module-tag">ABASTECIMIENTO</span><h2>Inventario</h2><p>Consulta el stock y envía alertas de materiales que se deben reponer.</p><span className="module-cta">Abrir inventario <span aria-hidden="true">→</span></span><ModuleIllustration type="inventory" /></Link>
      </section>
      {profile.role === 'administrador' && <Link className="staff-link" to="/staff">Gestionar personal <span>→</span></Link>}
      <footer className="dashboard-footer">Clínica Dental Sonrisa <span>·</span> MVP académico</footer>
    </main>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/update-password" element={<UpdatePasswordPage />} />
      <Route path="/staff" element={<ProtectedRoute allowedRoles={['administrador']}><StaffPage /></ProtectedRoute>} />
      <Route path="/patients" element={<ProtectedRoute><PatientsPage /></ProtectedRoute>} />
      <Route path="/agenda" element={<ProtectedRoute><AgendaPage /></ProtectedRoute>} />
      <Route path="/clinical" element={<ProtectedRoute allowedRoles={['odontologo', 'administrador']}><ClinicalPage /></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute allowedRoles={['administrador', 'recepcionista']}><FinancePage /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryErrorBoundary><InventoryPage /></InventoryErrorBoundary></ProtectedRoute>} />
      <Route path="*" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><AppRoutes /><ThemeToggle /></AuthProvider>
}
