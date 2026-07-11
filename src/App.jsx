import { useState, lazy, Suspense, useEffect } from 'react'
import VerifyPage from './pages/verify/VerifyPage'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DisplayModeProvider } from './contexts/DisplayModeContext'
import { ThemeProvider } from './contexts/ThemeContext'
import LoadingScreen from './components/shared/LoadingScreen'
import LoginPage from './pages/auth/LoginPage'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import { MODULES, ROLES } from './lib/constants'
import OperatorPortal from './pages/operator/OperatorPortal'
import { useRealtimeSync } from './hooks/useRealtimeSync'
import {
  LayoutDashboard, Receipt, ClipboardList, BarChart3,
  Users, Wallet, Package, X, Truck, Wrench, FolderOpen,
  Settings, ShoppingCart, TrendingUp, CalendarDays,
} from 'lucide-react'

// Lazy-load all pages for performance
const DashboardPage      = lazy(() => import('./pages/dashboard/DashboardPage'))
const FleetPage          = lazy(() => import('./pages/fleet/FleetPage'))
const OperationsPage     = lazy(() => import('./pages/operations/OperationsPage'))
const MaintenancePage    = lazy(() => import('./pages/maintenance/MaintenancePage'))
const InventoryPage      = lazy(() => import('./pages/inventory/InventoryPage'))
const ClientsPage        = lazy(() => import('./pages/clients/ClientsPage'))
const ProjectsPage       = lazy(() => import('./pages/projects/ProjectsPage'))
const AccountsPage       = lazy(() => import('./pages/accounts/AccountsPage'))
const SalesPage          = lazy(() => import('./pages/sales/SalesPage'))
const PurchasePage       = lazy(() => import('./pages/purchase/PurchasePage'))
const ReportsPage        = lazy(() => import('./pages/reports/ReportsPage'))
const HRPage             = lazy(() => import('./pages/hr/HrPage'))
const ExpensePlannerPage = lazy(() => import('./pages/planner/ExpensePlannerPage'))
const FieldExpensePage   = lazy(() => import('./pages/fieldexpense/FieldExpensePage'))
const SettingsPage       = lazy(() => import('./pages/settings/SettingsPage'))
const ProfilePage        = lazy(() => import('./pages/settings/ProfilePage'))
const SuperAdminPage     = lazy(() => import('./pages/superadmin/SuperAdminPage'))
const LettersPage        = lazy(() => import('./pages/letters/LettersPage'))

// ── Connectivity hook ─────────────────────────────────────────────────────────
function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up   = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}

// ── Contextual error screens ───────────────────────────────────────────────────
function OfflineScreen() {
  const [checking, setChecking] = useState(false)
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
      <div className="text-6xl">📡</div>
      <div>
        <p className="text-base font-bold text-slate-200">No Internet Connection</p>
        <p className="text-sm text-slate-500 mt-1">Check your Wi-Fi or mobile data and try again.</p>
      </div>
      <button
        onClick={() => { setChecking(true); setTimeout(() => { setChecking(false); window.location.reload() }, 1000) }}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold transition-colors"
      >
        {checking ? '⏳ Checking…' : '🔄 Retry'}
      </button>
      <p className="text-xs text-slate-600">Your data is safe — it will sync when you reconnect.</p>
    </div>
  )
}

function ModuleNotActive({ page }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
      <div className="text-6xl">🔒</div>
      <div>
        <p className="text-base font-bold text-slate-200 capitalize">{page}</p>
        <p className="text-sm text-slate-500 mt-1">This module hasn't been activated for your account.</p>
        <p className="text-xs text-slate-600 mt-2">Contact your administrator to enable access.</p>
      </div>
    </div>
  )
}

function ComingSoon({ page }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
      <div className="text-6xl">🚧</div>
      <div>
        <p className="text-base font-bold text-slate-200 capitalize">{page}</p>
        <p className="text-sm text-slate-500 mt-1">This page is under construction — coming soon!</p>
      </div>
    </div>
  )
}

// ── Role-specific mobile bottom nav items ─────────────────────────────────────
const MOBILE_QUICK = {
  supervisor: [
    { key: 'dashboard',    Icon: LayoutDashboard, label: 'Home'       },
    { key: 'fieldexpense', Icon: Receipt,         label: 'Expenses'   },
    { key: 'operations',   Icon: ClipboardList,   label: 'Operations' },
    { key: 'inventory',    Icon: Package,         label: 'Inventory'  },
  ],
  manager: [
    { key: 'dashboard',    Icon: LayoutDashboard, label: 'Home'       },
    { key: 'fieldexpense', Icon: Receipt,         label: 'Expenses'   },
    { key: 'operations',   Icon: ClipboardList,   label: 'Operations' },
    { key: 'reports',      Icon: BarChart3,       label: 'Reports'    },
  ],
  accounts: [
    { key: 'dashboard',    Icon: LayoutDashboard, label: 'Home'       },
    { key: 'fieldexpense', Icon: Receipt,         label: 'Expenses'   },
    { key: 'accounts',     Icon: Wallet,          label: 'Accounts'   },
    { key: 'reports',      Icon: BarChart3,       label: 'Reports'    },
  ],
  admin: [
    { key: 'dashboard',    Icon: LayoutDashboard, label: 'Home'       },
    { key: 'fieldexpense', Icon: Receipt,         label: 'Expenses'   },
    { key: 'operations',   Icon: ClipboardList,   label: 'Operations' },
    { key: 'reports',      Icon: BarChart3,       label: 'Reports'    },
  ],
}

// All pages for the "More" drawer
const ALL_PAGES = [
  { key: 'dashboard',    Icon: LayoutDashboard, label: 'Dashboard'            },
  { key: 'fieldexpense', Icon: Receipt,         label: 'Field Expenses'       },
  { key: 'operations',   Icon: ClipboardList,   label: 'Daily Operations'     },
  { key: 'fleet',        Icon: Truck,           label: 'Equipment & Fleet'    },
  { key: 'maintenance',  Icon: Wrench,          label: 'Maintenance'          },
  { key: 'inventory',    Icon: Package,         label: 'Inventory'            },
  { key: 'projects',     Icon: FolderOpen,      label: 'Projects'             },
  { key: 'accounts',     Icon: Wallet,          label: 'Accounts'             },
  { key: 'planner',      Icon: CalendarDays,    label: 'Expense Planner'      },
  { key: 'sales',        Icon: TrendingUp,      label: 'Sales'                },
  { key: 'purchase',     Icon: ShoppingCart,    label: 'Purchase'             },
  { key: 'reports',      Icon: BarChart3,       label: 'Reports'              },
  { key: 'hr',           Icon: Users,           label: 'Employee Management'  },
  { key: 'settings',     Icon: Settings,        label: 'Settings'             },
]

// ── Mobile bottom nav + "More" drawer ────────────────────────────────────────
function MobileNav({ role, activePage, onNavigate }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const quickItems = MOBILE_QUICK[role] || MOBILE_QUICK.manager

  const go = (key) => {
    onNavigate(key)
    setMoreOpen(false)
  }

  return (
    <>
      {/* Bottom nav bar — visible only on mobile (hidden on lg+) */}
      <div className="lg:hidden shrink-0 fixed bottom-0 left-0 right-0 z-40 bg-dark-800/95 backdrop-blur-md border-t border-dark-700 safe-area-bottom">
        <div className="flex">
          {quickItems.map(({ key, Icon, label }) => {
            const active = activePage === key
            return (
              <button
                key={key}
                onClick={() => go(key)}
                className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${active ? 'text-primary-400' : 'text-slate-500'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
                {active && <div className="w-1 h-1 rounded-full bg-primary-400 mt-0.5" />}
              </button>
            )
          })}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${moreOpen ? 'text-primary-400' : 'text-slate-500'}`}
          >
            <div className="w-5 h-5 flex flex-col justify-center items-center gap-[3px]">
              <span className="w-4 h-0.5 bg-current rounded-full" />
              <span className="w-4 h-0.5 bg-current rounded-full" />
              <span className="w-4 h-0.5 bg-current rounded-full" />
            </div>
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </div>

      {/* "More" slide-up drawer */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />

          {/* Drawer */}
          <div className="relative bg-dark-800 border-t border-dark-700 rounded-t-2xl max-h-[75vh] overflow-y-auto safe-area-bottom">
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700 sticky top-0 bg-dark-800">
              <p className="text-sm font-bold text-slate-100">All Sections</p>
              <button onClick={() => setMoreOpen(false)} className="text-slate-400 hover:text-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              {ALL_PAGES.map(({ key, Icon, label }) => {
                const active = activePage === key
                return (
                  <button
                    key={key}
                    onClick={() => go(key)}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border transition-all ${
                      active
                        ? 'bg-primary-600/20 border-primary-500 text-primary-300'
                        : 'bg-dark-700 border-dark-600 text-slate-400 hover:border-dark-500'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium text-center leading-tight">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  const { loading, session, role, hasModule, isSuperAdmin } = useAuth()
  const [activePage, setActivePage] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const isOnline = useOnlineStatus()

  // Live sync — invalidates React Query cache the moment any table row changes
  useRealtimeSync()

  if (loading) return <LoadingScreen />
  if (!session) return <LoginPage />

  // Operators get their own dedicated mobile portal
  if (role === 'operator') return <OperatorPortal />

  const handleNavigate = (page) => setActivePage(page)

  const defaultPage = isSuperAdmin() ? 'superadmin' : 'dashboard'
  const effectivePage = activePage === 'dashboard' ? defaultPage : activePage

  const renderPage = () => {
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
        if (!isOnline) return <OfflineScreen />
        return <ModuleNotActive page={page} />
      }
      return (
        <Suspense fallback={<LoadingScreen message={`Loading ${page}…`} />}>
          <Component />
        </Suspense>
      )
    }

    switch (page) {
      case 'dashboard':
        if (hasModule && !hasModule(MODULES.CORE)) return isOnline ? <ModuleNotActive page="Dashboard" /> : <OfflineScreen />
        return (
          <Suspense fallback={<LoadingScreen message="Loading dashboard…" />}>
            <DashboardPage onNavigate={handleNavigate} />
          </Suspense>
        )
      case 'fleet':        return wrap(FleetPage,          MODULES.FLEET)
      case 'operations':   return wrap(OperationsPage,     MODULES.OPERATIONS)
      case 'maintenance':  return wrap(MaintenancePage,    MODULES.MAINTENANCE)
      case 'inventory':    return wrap(InventoryPage,      MODULES.INVENTORY)
      case 'clients':      return wrap(ClientsPage,        MODULES.CLIENTS_PROJECTS)
      case 'projects':     return wrap(ProjectsPage,       MODULES.CLIENTS_PROJECTS)
      case 'accounts':     return wrap(AccountsPage,       MODULES.ACCOUNTS)
      case 'planner':      return wrap(ExpensePlannerPage, MODULES.ACCOUNTS)
      case 'fieldexpense': return wrap(FieldExpensePage,   MODULES.OPERATIONS)
      case 'sales':        return wrap(SalesPage,          MODULES.SALES)
      case 'purchase':     return wrap(PurchasePage,       MODULES.PURCHASE)
      case 'reports':      return wrap(ReportsPage,        MODULES.REPORTS)
      case 'hr':           return wrap(HRPage,             MODULES.HR_PAYROLL)
      case 'letters':      return wrap(LettersPage,         MODULES.CORE)
      case 'settings':     return wrap(SettingsPage,       MODULES.CORE)
      case 'profile':      return wrap(ProfilePage,        MODULES.CORE)
      default:             return <ComingSoon page={page} />
    }
  }

  return (
    <DisplayModeProvider>
      <div className="app-container flex h-screen overflow-hidden">
        {/* Sidebar — desktop only */}
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
          {/* Offline banner — shown mid-session when connection drops */}
          {!isOnline && (
            <div className="shrink-0 flex items-center justify-center gap-2 bg-amber-500/20 border-b border-amber-600/40 text-amber-300 text-xs font-semibold py-2 px-4">
              📡 No internet connection — some features may not work until you reconnect.
            </div>
          )}
          {/* pb-16 on mobile to avoid content hiding behind bottom nav */}
          <main className="flex-1 overflow-y-auto bg-dark-900 lg:pb-0 pb-16">
            {renderPage()}
          </main>
        </div>

        {/* Mobile bottom nav — all non-operator roles */}
        {!isSuperAdmin() && (
          <MobileNav
            role={role}
            activePage={effectivePage}
            onNavigate={handleNavigate}
          />
        )}
      </div>
    </DisplayModeProvider>
  )
}

export default function App() {
  // Public verification route — accessible without login
  const path  = window.location.pathname
  const match = path.match(/^\/verify\/([0-9a-f-]{36})$/i)
  if (match) {
    return (
      <ThemeProvider>
        <VerifyPage token={match[1]} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  )
}
