import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function ProtectedRoute() {
  const { user, profile, loading, error } = useAuth()

  if (loading) {
    return (
      <div className="screen-center">
        <p className="muted">Yükleniyor…</p>
      </div>
    )
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }

  if (error) {
    return (
      <div className="screen-center">
        <p className="error" role="alert">
          {error}
        </p>
      </div>
    )
  }

  return <Outlet />
}
