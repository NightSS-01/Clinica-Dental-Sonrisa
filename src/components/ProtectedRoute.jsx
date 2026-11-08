import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <main className="auth-state"><span className="loader" /><p>Comprobando tu sesión…</p></main>
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (!profile) {
    return (
      <main className="auth-state">
        <h1>Perfil no disponible</h1>
        <p>Tu cuenta no tiene un perfil de personal asociado. Contacta a administración.</p>
      </main>
    )
  }
  if (!profile.active) {
    return <main className="auth-state"><h1>Cuenta desactivada</h1><p>Tu acceso está desactivado. Contacta a una persona administradora de la clínica.</p></main>
  }
  if (profile.must_change_password) return <Navigate to="/update-password" replace />
  if (allowedRoles && !allowedRoles.includes(profile.role)) return <Navigate to="/" replace />

  return children
}
