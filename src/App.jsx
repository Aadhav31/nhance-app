import { useState, lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DisplayModeProvider } from './contexts/DisplayModeContext'
import LoadingScreen from './components/shared/LoadingScreen'
import LoginPage from './pages/auth/LoginPage'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import { MODULES } from './lib/constants'

// Lazy-load all pages for performance
const DashboardPage   = lazy(() => import('./pages/dashboard/DashboardPage'))
const FleetPage       = lazy(() => import('./pages/fleet/FleetPage'))
const OperationsPage  = lazy(() => import('./pages/operations/OperationsPage'))
const MaintenancePage = lazy(() => import('./pages/maintenance/MaintenancePage'))
const InventoryPage   = lazy(() => import('./pages/inventory/InventoryPage'))
const ClientsPage     = lazy(() => import('./pages/clients/ClientsPage'))
const ProjectsPage    = lazy(() => import('./pages/projects/ProjectsPage'))
const AccountsPage    = lazy(() => import('./pages/accounts/AccountsPage'))
const ReportsPage     = lazy(() => import('./pages/reports/ReportsPage'))
const HRPage          = lazy(() => import('./pages/hr/HrPage'))
const SettingsPage    = lazy(() => import('./pages/settings/SettingsPage'))
const ProfilePage     = lazy(() => import('./pages/settings/ProfilePage'))
const SuperAdminPage  = lazy(() => import('./pages/superadmin/SuperAdminPage'))

// Placeholder for pages not yet built
function ComingSoon({ page }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
      <div className="text-4xl">🚧</div>
      <p className="text-sm font-semibold capitalize">{page} — coming soon</p>
    </div>
  )
}

function AppShell() {
  const { loading, session, role, hasModule, isSuperAdmin } = useAuth()
  const [activePage, setActivePage] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  if (loading) return <LoadingScreen />
  if (!session) return <LoginPage />

  const handleNavigate = (page) => setActivePage(page)

  // If super-admin and not on a company page, go to super-admin panel
  const effectivePage = isSuperAdmin() && activePage === 'dashboard' ? 'superadmin' : activePage

  const renderPage = () => {
    // Super-admin panel
    if (isSuperAdmin() && (effectivePage === 'superadmin' || effectivePage === 'dashboard')) {
      return (
        <Suspense fallback={<LoadingScreen message="Loading panel…" />}>
          <SuperAdminPage />
        </Suspense>
      )
    }

    const page = effectivePage
    const wrap = (Component, module) => {
      if (module && !hasModule(module)) {
        return <ComingSoon page={`${page} (module not activated)`} />
      }
      return (
        <Suspense fallback={<LoadingScreen message={`Loading ${page}…`} />}>
          <Component />
        </Suspense>
      )
    }

    switch (page) {
      case 'dashboard':   return wrap(DashboardPage,   MODULES.CORE)
      case 'fleet':       return wrap(FleetPage,       MODULES.FLEET)
      case 'operations':  return wrap(OperationsPage,  MODULES.OPERATIONS)
      case 'maintenance': return wrap(MaintenancePage, MODULES.MAINTENANCE)
      case 'inventory':   return wrap(InventoryPage,   MODULES.INVENTORY)
      case 'clients':     return wrap(ClientsPage,     MODULES.CLIENTS_PROJECTS)
      case 'projects':    return wrap(ProjectsPage,    MODULES.CLIENTS_PROJECTS)
      case 'accounts':    return wrap(AccountsPage,    MODULES.ACCOUNTS)
      case 'reports':     return wrap(ReportsPage,     MODULES.REPORTS)
      case 'hr':          return wrap(HRPage,          MODULES.HR_PAYROLL)
      case 'settings':    return wrap(SettingsPage,    MODULES.CORE)
      case 'profile':     return wrap(ProfilePage,     MODULES.CORE)
      default:            return <ComingSoon page={page} />
    }
  }

  return (
    <DisplayModeProvider>
    <div className="app-container flex h-screen overflow-hidden">
      {/* Sidebar — hidden on mobile, shown on lg+ */}
      <div className="hidden lg:flex">
        <Sidebar
          activePage={effectivePage}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(p => !p)}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar activePage={effectivePage} onMenuToggle={() => setSidebarCollapsed(p => !p)} />
        <main className="flex-1 overflow-hidden bg-dark-900">
          {renderPage()}
        </main>
      </div>
    </div>
    </DisplayModeProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
