import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import { DailyPlanPage } from './pages/DailyPlanPage'
import { ExceptionsPage } from './pages/ExceptionsPage'
import { LoginPage } from './pages/LoginPage'
import { PatientDetailPage } from './pages/PatientDetailPage'
import { PatientsPage } from './pages/PatientsPage'
import { SearchPage } from './pages/SearchPage'
import { SettingsPage } from './pages/SettingsPage'
import { TrackingPage } from './pages/TrackingPage'
import { WeeklyPlanPage } from './pages/WeeklyPlanPage'

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DailyPlanPage />} />
                <Route path="week" element={<WeeklyPlanPage />} />
                <Route path="agenda" element={<Navigate to="/" replace />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="patients/:id" element={<PatientDetailPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="tracking" element={<TrackingPage />} />
                <Route path="exceptions" element={<ExceptionsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
