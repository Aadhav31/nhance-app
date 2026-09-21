import { useState, lazy, Suspense, useEffect, useRef } from 'react'
import VerifyPage from './pages/verify/VerifyPage'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DisplayModeProvider } from './contexts/DisplayModeContext'
import { ThemeProvider } from './contexts/ThemeContext'
import LoadingScreen from './components/shared/LoadingScreen'
import PageErrorBoundary from './components/shared/PageErrorBoundary'
import StickyNotes from './components/shared/StickyNotes'
import LoginPage from './pages/auth/LoginPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import Sidebar from './components/layout/Sidebar'
import RightBar from './components/layout/RightBar'
import TopBar from './components/layout/TopBar'
import { MODULES } from './lib/constants'
import { canAccessPage, getAccessibleMobilePages } from './lib/navigation'
import OperatorPortal from './pages/operator/OperatorPortal'
import { useRealtimeSync } from './hooks/useRealtimeSync'
import * as Icons from 'lucide-react'

// Lazy-load all pages for performance
const DashboardPage      = lazy(() => import('./pages/dashboard/DashboardPage'))
const ControlTowerPage   = lazy(() => import('./pages/controltower/ControlTowerPage'))
const FleetPage          = lazy(() => import('./pages/fleet/FleetPage'))
const FuelReconciliationPage = lazy(() => import('./pages/fuel/FuelReconciliationPage'))
const ProfitabilityPage   = lazy(() => import('./pages/profitability/ProfitabilityPage'))
const OperationsPage     = lazy(() => import('./pages/operations/OperationsPage'))
const MaintenancePage    = lazy(() => import('./pages/maintenance/MaintenancePage'))
const InventoryPage      = lazy(() => import('./pages/inventory/InventoryPage'))
const ClientsPage        = lazy(() => import('./pages/clients/ClientsPage'))
const ProjectsPage       = lazy(() => import('./pages/projects/ProjectsPage'))
const AccountsPage       = lazy(() => import('./pages/accounts/AccountsPage'))
const SalesPage          = lazy(() => import('./pages/sales/SalesPage'))
const PurchasePage       = lazy(() => import('./pages/purchase/PurchasePage'))
const ReportsPage        = lazy(() => import('./pages/reports/ReportsPage'))
const FinancialsPage     = lazy(() => import('./pages/financials/FinancialsPage'))
const HRPage             = lazy(() => import('./pages/hr/HrPage'))
const ExpensePlannerPage = lazy(() => import('./pages/planner/ExpensePlannerPage'))
const FieldExpensePage   = lazy(() => import('./pages/fieldexpense/FieldExpensePage'))
const SettingsPage       = lazy(() => import('./pages/settings/SettingsPage'))
const ProfilePage        = lazy(() => import('./pages/settings/ProfilePage'))
const SuperAdminPage          = lazy(() => import('./pages/superadmin/SuperAdminPage'))
const LettersPage             = lazy(() => import('./pages/letters/LettersPage'))
const ExpensesPage            = lazy(() => import('./pages/expenses/ExpensesPage'))
const ProductionTrackerPage   = lazy(() => import('./pages/production/ProductionTrackerPage'))
const CrusherSalesPage        = lazy(() => import('./pages/crusher/CrusherSalesPage'))
const CompanyProfilePage      = lazy(() => import('./pages/company/CompanyProfilePage'))
const HireContractsPage       = lazy(() => import('./pages/hire/HireContractsPage'))
const ActiveDeploymentsPage   = lazy(() => import('./pages/hire/ActiveDeploymentsPage'))
const AvailabilityPage        = lazy(() => import('./pages/hire/AvailabilityPage'))
const DeploymentPlannerPage   = lazy(() => import('./pages/hire/DeploymentPlannerPage'))
const UsageBillingPage        = lazy(() => import('./pages/hire/UsageBillingPage'))
const BOQPage                 = lazy(() => import('./pages/boq/BOQPage'))
const RABillingPage           = lazy(() => import('./pages/ra_billing/RABillingPage'))
const ApprovalCenterPage      = lazy(() => import('./pages/approvals/ApprovalCenterPage'))
const AuditLogPage            = lazy(() => import('./pages/audit/AuditLogPage'))
const ChatPage                = lazy(() => import('./pages/chat/ChatPage'))
const ReimbursementPage       = lazy(() => import('./pages/hr/ReimbursementPage'))

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

// Keep Control Tower drill-downs in the URL so the selected Fleet filter
// survives refreshes and can be verified/shared directly.
function readNavigationFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const equipmentId = params.get('equipment')
  const page = params.get('page') || (equipmentId ? 'fleet' : 'dashboard')
  const extra = equipmentId ? { equipmentId } : {}

  if (page === 'fleet') {
    const kind = params.get('fleetFilter')
    const label = params.get('fleetLabel') || ''
    if (kind === 'status' && params.get('fleetValue')) {
      extra.fleetFilter = { kind, value: params.get('fleetValue'), label }
    } else if (kind === 'available' || kind === 'all') {
      extra.fleetFilter = { kind, label }
    } else if (kind === 'equipment_ids') {
      extra.fleetFilter = {
        kind,
        ids: (params.get('fleetIds') || '').split(',').filter(Boolean),
        label,
      }
    }
  }
  if (page === 'deployment_planner') {
    extra.plannerStatus = params.get('plannerStatus') || 'all'
    extra.plannerView = params.get('plannerView') || 'plan'
  }
  if (page === 'fuel_reconciliation') {
    const rangeDays = Number(params.get('fuelRange'))
    extra.rangeDays = [30, 90, 180, 365].includes(rangeDays) ? rangeDays : 90
    extra.metric = params.get('fuelMetric') || 'all'
    extra.equipmentId = params.get('fuelEquipment') || 'all'
    extra.projectId = params.get('fuelProject') || 'all'
  }
  if (page === 'projects') {
    if (params.get('project')) extra.projectId = params.get('project')
    extra.status = params.get('projectStatus') || 'all'
  }
  if (page === 'hire_contracts') extra.status = params.get('hireStatus') || 'all'
  if (page === 'boq') {
    extra.status = params.get('boqStatus') || 'all'
    extra.boqId = params.get('boq') || null
  }
  if (page === 'ra_billing') {
    extra.metric = params.get('raMetric') || 'all'
    extra.status = params.get('raStatus') || 'all'
    extra.boqId = params.get('raBoq') || 'all'
    extra.raId = params.get('raBill') || null
  }
  if (page === 'sales') extra.tab = params.get('salesTab') || 'clients'
  if (page === 'purchase') {
    extra.tab = params.get('purchaseTab') || 'vendors'
    extra.createForTxnId = params.get('purchaseStockTxn') || null
  }
  if (page === 'accounts') extra.tab = params.get('accountsTab') || 'dashboard'
  if (page === 'expenses') {
    extra.type = params.get('expenseType') || 'all'
    extra.from = params.get('expenseFrom') || ''
    extra.to = params.get('expenseTo') || ''
    extra.mode = params.get('expenseMode') || ''
  }
  if (page === 'financials') {
    extra.tab = params.get('financeTab') || 'pl'
    extra.period = Number(params.get('financePeriod') || 0)
    extra.from = params.get('financeFrom') || ''
    extra.to = params.get('financeTo') || ''
  }
  if (page === 'hr') extra.tab = params.get('hrTab') || 'employees'
  if (page === 'reimbursements') extra.status = params.get('reimbursementStatus') || 'pending'
  if (page === 'reports') {
    extra.reportId = params.get('reportId') || 'equip_utilization'
    extra.from = params.get('reportFrom') || ''
    extra.to = params.get('reportTo') || ''
  }
  if (page === 'operations') {
    extra.tab = params.get('opsTab') || 'today'
    extra.metric = params.get('opsMetric') || 'all'
    extra.from = params.get('opsFrom') || null
    extra.to = params.get('opsTo') || null
    extra.projectId = params.get('opsProject') || 'all'
    if (params.get('equipmentName')) extra.equipmentName = params.get('equipmentName')
  }
  if (page === 'maintenance') {
    extra.tab = params.get('maintTab') || 'workshop'
    extra.pmState = params.get('pmState') || 'all'
    extra.workshopStatus = params.get('workshopStatus') || 'active'
  }
  if (page === 'profitability') {
    extra.dimension = params.get('profitDimension') || 'project'
    extra.metric = params.get('profitMetric') || 'all'
  }

  return { page, extra }
}

function writeNavigationToUrl(page, extra, { replace = false } = {}) {
  const url = new URL(window.location.href)
  const navigationKeys = ['page', 'equipment', 'equipmentName', 'fleetFilter', 'fleetValue', 'fleetLabel', 'fleetIds', 'plannerStatus', 'plannerView', 'project', 'projectStatus', 'hireStatus', 'boqStatus', 'boq', 'raMetric', 'raStatus', 'raBoq', 'raBill', 'salesTab', 'purchaseTab', 'purchaseStockTxn', 'accountsTab', 'expenseType', 'expenseFrom', 'expenseTo', 'expenseMode', 'financeTab', 'financePeriod', 'financeFrom', 'financeTo', 'hrTab', 'reimbursementStatus', 'reportId', 'reportFrom', 'reportTo', 'opsTab', 'opsMetric', 'opsFrom', 'opsTo', 'opsProject', 'maintTab', 'pmState', 'workshopStatus', 'fuelRange', 'fuelMetric', 'fuelEquipment', 'fuelProject', 'profitDimension', 'profitMetric']
  navigationKeys.forEach(key => url.searchParams.delete(key))

  if (page !== 'dashboard') url.searchParams.set('page', page)
  if (extra.equipmentId && ['fleet', 'operations', 'maintenance', 'deployment_planner'].includes(page)) url.searchParams.set('equipment', extra.equipmentId)
  if (page === 'deployment_planner') {
    if (extra.plannerStatus && extra.plannerStatus !== 'all') url.searchParams.set('plannerStatus', extra.plannerStatus)
    if (extra.plannerView && extra.plannerView !== 'plan') url.searchParams.set('plannerView', extra.plannerView)
  }
  if (page === 'fuel_reconciliation') {
    if (extra.rangeDays && Number(extra.rangeDays) !== 90) url.searchParams.set('fuelRange', String(extra.rangeDays))
    if (extra.metric && extra.metric !== 'all') url.searchParams.set('fuelMetric', extra.metric)
    if (extra.equipmentId && extra.equipmentId !== 'all') url.searchParams.set('fuelEquipment', extra.equipmentId)
    if (extra.projectId && extra.projectId !== 'all') url.searchParams.set('fuelProject', extra.projectId)
  }
  if (page === 'projects') {
    if (extra.projectId) url.searchParams.set('project', extra.projectId)
    if (extra.status && extra.status !== 'all') url.searchParams.set('projectStatus', extra.status)
  }
  if (page === 'hire_contracts' && extra.status && extra.status !== 'all') url.searchParams.set('hireStatus', extra.status)
  if (page === 'boq') {
    if (extra.status && extra.status !== 'all') url.searchParams.set('boqStatus', extra.status)
    if (extra.boqId) url.searchParams.set('boq', extra.boqId)
  }
  if (page === 'ra_billing') {
    if (extra.metric && extra.metric !== 'all') url.searchParams.set('raMetric', extra.metric)
    if (extra.status && extra.status !== 'all') url.searchParams.set('raStatus', extra.status)
    if (extra.boqId && extra.boqId !== 'all') url.searchParams.set('raBoq', extra.boqId)
    if (extra.raId) url.searchParams.set('raBill', extra.raId)
  }
  if (page === 'sales' && extra.tab && extra.tab !== 'clients') url.searchParams.set('salesTab', extra.tab)
  if (page === 'purchase') {
    if (extra.tab && extra.tab !== 'vendors') url.searchParams.set('purchaseTab', extra.tab)
    if (extra.createForTxnId) url.searchParams.set('purchaseStockTxn', extra.createForTxnId)
  }
  if (page === 'accounts' && extra.tab && extra.tab !== 'dashboard') url.searchParams.set('accountsTab', extra.tab)
  if (page === 'expenses') {
    if (extra.type && extra.type !== 'all') url.searchParams.set('expenseType', extra.type)
    if (extra.from) url.searchParams.set('expenseFrom', extra.from)
    if (extra.to) url.searchParams.set('expenseTo', extra.to)
    if (extra.mode) url.searchParams.set('expenseMode', extra.mode)
  }
  if (page === 'financials') {
    if (extra.tab && extra.tab !== 'pl') url.searchParams.set('financeTab', extra.tab)
    if (Number(extra.period) > 0) url.searchParams.set('financePeriod', String(extra.period))
    if (extra.from) url.searchParams.set('financeFrom', extra.from)
    if (extra.to) url.searchParams.set('financeTo', extra.to)
  }
  if (page === 'hr' && extra.tab && extra.tab !== 'employees') url.searchParams.set('hrTab', extra.tab)
  if (page === 'reimbursements' && extra.status && extra.status !== 'pending') url.searchParams.set('reimbursementStatus', extra.status)
  if (page === 'reports') {
    if (extra.reportId && extra.reportId !== 'equip_utilization') url.searchParams.set('reportId', extra.reportId)
    if (extra.from) url.searchParams.set('reportFrom', extra.from)
    if (extra.to) url.searchParams.set('reportTo', extra.to)
  }
  if (page === 'operations') {
    if (extra.tab && extra.tab !== 'today') url.searchParams.set('opsTab', extra.tab)
    if (extra.metric && extra.metric !== 'all') url.searchParams.set('opsMetric', extra.metric)
    if (extra.from) url.searchParams.set('opsFrom', extra.from)
    if (extra.to) url.searchParams.set('opsTo', extra.to)
    if (extra.projectId && extra.projectId !== 'all') url.searchParams.set('opsProject', extra.projectId)
    if (extra.equipmentName) url.searchParams.set('equipmentName', extra.equipmentName)
  }
  if (page === 'maintenance') {
    if (extra.tab && extra.tab !== 'workshop') url.searchParams.set('maintTab', extra.tab)
    if (extra.pmState && extra.pmState !== 'all') url.searchParams.set('pmState', extra.pmState)
    if (extra.workshopStatus && extra.workshopStatus !== 'active') url.searchParams.set('workshopStatus', extra.workshopStatus)
  }
  if (page === 'profitability') {
    if (extra.dimension && extra.dimension !== 'project') url.searchParams.set('profitDimension', extra.dimension)
    if (extra.metric && extra.metric !== 'all') url.searchParams.set('profitMetric', extra.metric)
  }

  const filter = extra.fleetFilter
  if (page === 'fleet' && filter?.kind) {
    url.searchParams.set('fleetFilter', filter.kind)
    if (filter.value) url.searchParams.set('fleetValue', filter.value)
    if (filter.label) url.searchParams.set('fleetLabel', filter.label)
    if (filter.kind === 'equipment_ids') url.searchParams.set('fleetIds', (filter.ids || []).join(','))
  }

  window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
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

function AccessDenied({ onNavigate }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
        <Icons.ShieldAlert className="h-7 w-7 text-amber-400" />
      </div>
      <div>
        <p className="text-base font-bold text-slate-200">Access restricted</p>
        <p className="mt-1 text-sm text-slate-500">This section is not available for your role or enabled modules.</p>
      </div>
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-500"
      >
        Return to dashboard
      </button>
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
  supervisor: ['dashboard', 'fieldexpense', 'operations', 'inventory'],
  manager: ['dashboard', 'fieldexpense', 'operations', 'reports'],
  accounts: ['dashboard', 'fieldexpense', 'accounts', 'reports'],
  admin: ['dashboard', 'fieldexpense', 'operations', 'reports'],
}

// ── Mobile bottom nav + "More" drawer ────────────────────────────────────────
function MobileNav({ role, industryType, hasModule, activePage, onNavigate, moreOpen, onMoreOpenChange }) {
  const allPages = getAccessibleMobilePages(industryType, role, hasModule)
  const [navQuery, setNavQuery] = useState('')
  const drawerRef = useRef(null)
  const searchInputRef = useRef(null)
  const pageByKey = new Map(allPages.map(item => [item.key, item]))
  const quickItems = (MOBILE_QUICK[role] || MOBILE_QUICK.manager)
    .map(key => pageByKey.get(key))
    .filter(Boolean)
  const moreIsActive = moreOpen || (!quickItems.some(item => item.key === activePage) && allPages.some(item => item.key === activePage))
  const normalizedQuery = navQuery.trim().toLowerCase()
  const visiblePages = normalizedQuery
    ? allPages.filter(item => item.label.toLowerCase().includes(normalizedQuery))
    : allPages

  useEffect(() => {
    if (!moreOpen) return undefined
    const previousFocus = document.activeElement
    const drawer = drawerRef.current
    searchInputRef.current?.focus()

    const handleKeyboard = event => {
      if (event.key === 'Escape') {
        onMoreOpenChange(false)
        return
      }
      if (event.key !== 'Tab' || !drawer) return

      const controls = [...drawer.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]',
      )].filter(element => element.offsetParent !== null)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) {
        event.preventDefault()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyboard)
    return () => {
      document.removeEventListener('keydown', handleKeyboard)
      previousFocus?.focus?.()
      setNavQuery('')
    }
  }, [moreOpen, onMoreOpenChange])

  const go = (key) => {
    onNavigate(key)
    onMoreOpenChange(false)
  }

  return (
    <>
      {/* Bottom nav bar — visible only on mobile (hidden on lg+) */}
      <div className="nhance-mobile-nav lg:hidden shrink-0 fixed bottom-0 left-0 right-0 z-40 bg-dark-800/95 backdrop-blur-md border-t border-dark-700 safe-area-bottom">
        <div className="flex">
          {quickItems.map(({ key, icon, label }) => {
            const active = activePage === key
            const Icon = Icons[icon] || Icons.Circle
            return (
              <button
                type="button"
                key={key}
                onClick={() => go(key)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-14 flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${active ? 'bg-primary-600/10 text-primary-400' : 'text-slate-500'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{key === 'dashboard' ? 'Home' : label}</span>
                {active && <div className="w-1 h-1 rounded-full bg-primary-400 mt-0.5" />}
              </button>
            )
          })}
          {/* More button */}
          <button
            type="button"
            onClick={() => onMoreOpenChange(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={`min-h-14 flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${moreIsActive ? 'bg-primary-600/10 text-primary-400' : 'text-slate-500'}`}
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
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title">
          {/* Backdrop */}
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/60" onClick={() => onMoreOpenChange(false)} />

          {/* Drawer */}
          <div ref={drawerRef} className="relative bg-dark-800 border-t border-dark-700 rounded-t-2xl max-h-[78vh] overflow-y-auto safe-area-bottom shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-dark-700 bg-dark-800/95 px-4 pb-3 pt-2 backdrop-blur-md">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-dark-500" aria-hidden="true" />
              <div className="flex items-center justify-between px-1 py-2">
                <div>
                  <p id="mobile-navigation-title" className="text-sm font-bold text-slate-100">All Sections</p>
                  <p className="text-[11px] text-slate-500">Choose where you want to work</p>
                </div>
                <button type="button" onClick={() => onMoreOpenChange(false)} aria-label="Close navigation" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-dark-700 hover:text-slate-100">
                  <Icons.X aria-hidden="true" className="w-5 h-5" />
                </button>
              </div>
              <label className="relative block">
                <span className="sr-only">Find a page</span>
                <Icons.Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={navQuery}
                  onChange={event => setNavQuery(event.target.value)}
                  placeholder="Find a page…"
                  className="h-11 w-full rounded-xl border border-dark-600 bg-dark-700 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25"
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4">
              {visiblePages.map(({ key, icon, label }) => {
                const active = activePage === key
                const Icon = Icons[icon] || Icons.Circle
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => go(key)}
                    aria-current={active ? 'page' : undefined}
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
              {visiblePages.length === 0 && (
                <div className="col-span-3 rounded-xl border border-dashed border-dark-600 px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-300">No matching page</p>
                  <button type="button" onClick={() => setNavQuery('')} className="mt-2 text-xs font-semibold text-primary-400 hover:text-primary-300">
                    Clear search
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  const { loading, session, role, hasModule, isSuperAdmin, industryType } = useAuth()
  const [navigation,       setNavigation]       = useState(readNavigationFromUrl)
  const [notesOpen,        setNotesOpen]        = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false)
  const isOnline = useOnlineStatus()
  const { page: activePage, extra: navExtra } = navigation

  useEffect(() => {
    const syncFromHistory = () => setNavigation(readNavigationFromUrl())
    window.addEventListener('popstate', syncFromHistory)
    return () => window.removeEventListener('popstate', syncFromHistory)
  }, [])

  // Live sync — invalidates React Query cache the moment any table row changes
  useRealtimeSync()

  if (loading) return <LoadingScreen />
  if (!session) return <LoginPage />

  // Operators get their own dedicated mobile portal
  if (role === 'operator') return <OperatorPortal />

  const handleNavigate = (page, extra = {}, options = {}) => {
    setNavigation({ page, extra })
    writeNavigationToUrl(page, extra, options)
    setMobileMenuOpen(false)
  }

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
    if (!canAccessPage(page, { role, hasModule, isSuperAdmin: isSuperAdmin() })) {
      return <AccessDenied onNavigate={handleNavigate} />
    }
    const wrap = (Component, module, props = {}) => {
      if (module && !hasModule(module)) {
        if (!isOnline) return <OfflineScreen />
        return <ModuleNotActive page={page} />
      }
      return (
        <Suspense fallback={<LoadingScreen message={`Loading ${page}…`} />}>
          <Component {...props} />
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
      case 'control_tower':
        return hasModule(MODULES.FLEET) ? (
          <Suspense fallback={<LoadingScreen message="Loading P&M Control Tower…" />}>
            <ControlTowerPage onNavigate={handleNavigate} />
          </Suspense>
        ) : <ModuleNotActive page="P&M Control Tower" />
      case 'fleet':
        return hasModule(MODULES.FLEET) ? (
          <Suspense fallback={<LoadingScreen message="Loading fleet…" />}>
            <FleetPage
              onNavigate={handleNavigate}
              unloggedIds={navExtra.filterUnloggedIds || null}
              initialEquipmentId={navExtra.equipmentId || null}
              initialFleetFilter={navExtra.fleetFilter || null}
            />
          </Suspense>
        ) : <ModuleNotActive page={page} />
      case 'fuel_reconciliation':
        return hasModule(MODULES.FLEET) ? (
          <Suspense fallback={<LoadingScreen message="Loading fuel reconciliation…" />}>
            <FuelReconciliationPage
              onNavigate={handleNavigate}
              initialRangeDays={navExtra.rangeDays}
              initialMetric={navExtra.metric}
              initialEquipmentId={navExtra.equipmentId}
              initialProjectId={navExtra.projectId}
            />
          </Suspense>
        ) : <ModuleNotActive page="Fuel Reconciliation" />
      case 'operations':
        return hasModule(MODULES.OPERATIONS) ? (
          <Suspense fallback={<LoadingScreen message="Loading operations…" />}>
            <OperationsPage
              onNavigate={handleNavigate}
              initialTab={navExtra.tab}
              initialMetric={navExtra.metric}
              initialFrom={navExtra.from}
              initialTo={navExtra.to}
              initialProjectId={navExtra.projectId}
              filterEquipmentId={navExtra.equipmentId}
              filterEquipmentName={navExtra.equipmentName}
            />
          </Suspense>
        ) : <ModuleNotActive page={page} />
      case 'maintenance':  return wrap(MaintenancePage, MODULES.MAINTENANCE, { onNavigate: handleNavigate, initialTab: navExtra.tab, initialPmState: navExtra.pmState, initialWorkshopStatus: navExtra.workshopStatus, initialEquipmentId: navExtra.equipmentId })
      case 'inventory':
        if (hasModule && !hasModule(MODULES.INVENTORY)) return isOnline ? <ModuleNotActive page="inventory" /> : <OfflineScreen />
        return (
          <Suspense fallback={<LoadingScreen message="Loading inventory…" />}>
            <InventoryPage onNavigate={handleNavigate} />
          </Suspense>
        )
      case 'clients':      return wrap(ClientsPage,        MODULES.CLIENTS_PROJECTS)
      case 'projects':     return wrap(ProjectsPage,       MODULES.CLIENTS_PROJECTS, { onNavigate: handleNavigate, initialProjectId: navExtra.projectId, initialStatus: navExtra.status })
      case 'boq':          return wrap(BOQPage,            MODULES.CLIENTS_PROJECTS, { onNavigate: handleNavigate, initialBoqId: navExtra.boqId, initialStatus: navExtra.status })
      case 'ra_billing':
        return hasModule(MODULES.CLIENTS_PROJECTS) ? (
          <Suspense fallback={<LoadingScreen message="Loading RA Billing…" />}>
            <RABillingPage onNavigate={handleNavigate} initialMetric={navExtra.metric} initialStatus={navExtra.status} initialBoqId={navExtra.boqId} initialRaId={navExtra.raId} />
          </Suspense>
        ) : <ModuleNotActive page="ra_billing" />
      case 'accounts':
        if (hasModule && !hasModule(MODULES.ACCOUNTS)) return isOnline ? <ModuleNotActive page="accounts" /> : <OfflineScreen />
        return (
          <Suspense fallback={<LoadingScreen message="Loading accounts…" />}>
            <AccountsPage onNavigate={handleNavigate} initialTab={navExtra.tab} />
          </Suspense>
        )
      case 'planner':      return wrap(ExpensePlannerPage, MODULES.ACCOUNTS)
      case 'fieldexpense': return wrap(FieldExpensePage,   MODULES.OPERATIONS)
      case 'sales':
        if (hasModule && !hasModule(MODULES.SALES)) return isOnline ? <ModuleNotActive page="sales" /> : <OfflineScreen />
        return (
          <Suspense fallback={<LoadingScreen message="Loading sales…" />}>
            <SalesPage onNavigate={handleNavigate} initialTab={navExtra.tab} />
          </Suspense>
        )
      case 'purchase':
        if (hasModule && !hasModule(MODULES.PURCHASE)) return isOnline ? <ModuleNotActive page="purchase" /> : <OfflineScreen />
        return (
          <Suspense fallback={<LoadingScreen message="Loading purchase…" />}>
            <PurchasePage onNavigate={handleNavigate} initialTab={navExtra.tab} initialStockTxnId={navExtra.createForTxnId} />
          </Suspense>
        )
      case 'reports':      return wrap(ReportsPage,        MODULES.REPORTS, { onNavigate: handleNavigate, initialReport: navExtra.reportId, initialFrom: navExtra.from, initialTo: navExtra.to })
      case 'profitability':
        return hasModule(MODULES.REPORTS) ? (
          <Suspense fallback={<LoadingScreen message="Loading profitability…" />}>
            <ProfitabilityPage
              onNavigate={handleNavigate}
              initialDimension={navExtra.dimension}
              initialMetric={navExtra.metric}
            />
          </Suspense>
        ) : <ModuleNotActive page="Profitability" />
      case 'financials':   return wrap(FinancialsPage,     MODULES.ACCOUNTS, { onNavigate: handleNavigate, initialTab: navExtra.tab, initialPeriod: navExtra.period, initialFrom: navExtra.from, initialTo: navExtra.to })
      case 'expenses':
        return hasModule(MODULES.ACCOUNTS) ? (
          <Suspense fallback={<LoadingScreen message="Loading expenses…" />}>
            <ExpensesPage onNavigate={handleNavigate} initialType={navExtra.type} initialFrom={navExtra.from} initialTo={navExtra.to} initialMode={navExtra.mode} />
          </Suspense>
        ) : <ModuleNotActive page="expenses" />
      case 'hr':
        if (!hasModule(MODULES.HR_PAYROLL)) return isOnline ? <ModuleNotActive page="hr" /> : <OfflineScreen />
        return (
          <Suspense fallback={<LoadingScreen message="Loading HR…" />}>
            <HRPage onNavigate={handleNavigate} initialTab={navExtra.tab} />
          </Suspense>
        )
      case 'letters':      return wrap(LettersPage,         MODULES.CORE)
      case 'settings':     return wrap(SettingsPage,       MODULES.CORE, { onNavigate: handleNavigate })
      case 'profile':      return wrap(ProfilePage,        MODULES.CORE)
      // ── Industry-specific pages ────────────────────────────────────────────
      case 'production':
        return (
          <Suspense fallback={<LoadingScreen message="Loading production tracker…" />}>
            <ProductionTrackerPage />
          </Suspense>
        )
      case 'crusher_sales':
        return (
          <Suspense fallback={<LoadingScreen message="Loading crusher sales…" />}>
            <CrusherSalesPage />
          </Suspense>
        )
      case 'company':
        return (
          <Suspense fallback={<LoadingScreen message="Loading company profile…" />}>
            <CompanyProfilePage />
          </Suspense>
        )
      case 'hire_contracts':
        return (
          <Suspense fallback={<LoadingScreen message="Loading hire contracts…" />}>
            <HireContractsPage onNavigate={handleNavigate} initialStatus={navExtra.status} />
          </Suspense>
        )
      case 'active_deployments':
        return (
          <Suspense fallback={<LoadingScreen message="Loading deployments…" />}>
            <DeploymentPlannerPage onNavigate={handleNavigate} initialView="active" />
          </Suspense>
        )
      case 'availability':
        return (
          <Suspense fallback={<LoadingScreen message="Loading availability…" />}>
            <DeploymentPlannerPage onNavigate={handleNavigate} initialView="availability" />
          </Suspense>
        )
      case 'deployment_planner':
        return hasModule(MODULES.FLEET) ? (
          <Suspense fallback={<LoadingScreen message="Loading Deployment Planner…" />}>
            <DeploymentPlannerPage onNavigate={handleNavigate} initialStatus={navExtra.plannerStatus || 'all'} initialView={navExtra.plannerView || 'plan'} initialEquipmentId={navExtra.equipmentId || null} />
          </Suspense>
        ) : <ModuleNotActive page="Deployment Planner" />
      case 'usage_billing':
        return (
          <Suspense fallback={<LoadingScreen message="Loading billing…" />}>
            <UsageBillingPage />
          </Suspense>
        )
      case 'reimbursements':
        return (
          <Suspense fallback={<LoadingScreen message="Loading Reimbursements…" />}>
            <ReimbursementPage onNavigate={handleNavigate} initialStatus={navExtra.status} />
          </Suspense>
        )
      case 'approval_center':
        return (
          <Suspense fallback={<LoadingScreen message="Loading Approval Centre…" />}>
            <ApprovalCenterPage />
          </Suspense>
        )
      case 'audit_log':
        return (
          <Suspense fallback={<LoadingScreen message="Loading Audit Log…" />}>
            <AuditLogPage />
          </Suspense>
        )
      case 'chat':
        return (
          <Suspense fallback={<LoadingScreen message="Loading Chat…" />}>
            <ChatPage navExtra={navExtra} />
          </Suspense>
        )
      case 'showroom':     return <ComingSoon page="Vehicle Stock / Showroom" />
      default:             return <ComingSoon page={page} />
    }
  }

  return (
    <DisplayModeProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only fixed left-4 top-4 z-[100] rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-xl"
      >
        Skip to main content
      </a>
      <div className="app-container flex h-screen overflow-hidden">
        {/* Left sidebar — desktop only */}
        <Sidebar
          activePage={effectivePage}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(p => !p)}
        />

        {/* Main area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar activePage={effectivePage} onMenuToggle={() => setMobileMenuOpen(true)} onNavigate={handleNavigate} />
          {/* Offline banner — shown mid-session when connection drops */}
          {!isOnline && (
            <div role="status" aria-live="polite" className="shrink-0 flex items-center justify-center gap-2 bg-amber-500/20 border-b border-amber-600/40 text-amber-300 text-xs font-semibold py-2 px-4">
              📡 No internet connection — some features may not work until you reconnect.
            </div>
          )}
          {/* pb-16 on mobile to avoid content hiding behind bottom nav */}
          <main id="main-content" tabIndex="-1" className="flex-1 min-w-0 overflow-y-auto bg-dark-900 lg:pb-0 pb-16 relative overflow-hidden">
            <PageErrorBoundary key={effectivePage}>
              {renderPage()}
            </PageErrorBoundary>
          </main>
        </div>

        {/* Mobile bottom nav — all non-operator roles */}
        {!isSuperAdmin() && (
          <MobileNav
            role={role}
            industryType={industryType}
            hasModule={hasModule}
            activePage={effectivePage}
            onNavigate={handleNavigate}
            moreOpen={mobileMenuOpen}
            onMoreOpenChange={setMobileMenuOpen}
          />
        )}

        {/* Right icon strip — desktop only (Chat, Notes, Approvals, Settings…) */}
        {/* Hidden on Chat page — chat already IS the right panel */}
        {!isSuperAdmin() && effectivePage !== 'chat' && (
          <RightBar
            activePage={effectivePage}
            onNavigate={handleNavigate}
            notesOpen={notesOpen}
            onToggleNotes={() => setNotesOpen(p => !p)}
          />
        )}

        {/* Global sticky notes — controlled by RightBar on desktop, floating on mobile */}
        {!isSuperAdmin() && (
          <StickyNotes
            open={notesOpen}
            onToggle={() => setNotesOpen(p => !p)}
          />
        )}
      </div>
    </DisplayModeProvider>
  )
}

export default function App() {
  // Public verification route — no login needed
  const path  = window.location.pathname
  const match = path.match(/^\/verify\/([0-9a-f-]{36})$/i)
  if (match) {
    return (
      <ThemeProvider>
        <VerifyPage token={match[1]} />
      </ThemeProvider>
    )
  }

  // Password reset link — show standalone reset page, never the full app
  const isRecoveryUrl = (
    window.location.search.includes('code=') ||
    window.location.hash.includes('type=recovery') ||
    window.location.hash.includes('access_token')
  )
  if (isRecoveryUrl) {
    return (
      <ThemeProvider>
        <AuthProvider>
          <ResetPasswordPage />
        </AuthProvider>
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
