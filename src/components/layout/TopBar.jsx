import { Menu, Sun, Moon } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useDisplayMode } from '../../contexts/DisplayModeContext'
import { useTheme } from '../../contexts/ThemeContext'
import { fmtDate } from '../../lib/utils'
import { useApprovalBadge } from '../../hooks/useApprovalBadge'
import ApprovalIcon from './ApprovalIcon'
import NotificationBell from './NotificationBell'

const PAGE_TITLES = {
  dashboard:   { title: 'Dashboard',               subtitle: 'Overview of your operations' },
  control_tower: { title: 'P&M Control Tower',      subtitle: 'Fleet health, deployment & performance' },
  deployment_planner: { title: 'Deployment Planner', subtitle: 'Reservations, mobilisation & returns' },
  availability: { title: 'Daily Availability', subtitle: 'Equipment activity by day' },
  active_deployments: { title: 'Active Deployments', subtitle: 'Machines currently on site' },
  fleet:       { title: 'Equipments & Machineries', subtitle: 'Equipment registry & status' },
  fuel_reconciliation: { title: 'Fuel Reconciliation', subtitle: 'Diesel variance, efficiency & cost exposure' },
  profitability: { title: 'Profitability', subtitle: 'Project and equipment margins with source evidence' },
  operations:  { title: 'Daily Operations',         subtitle: 'Shifts, fuel & incidents' },
  maintenance: { title: 'Equipment Health',         subtitle: 'Preventive care, repairs & workshop visibility' },
  inventory:   { title: 'Inventory',                subtitle: 'Spare parts & consumables' },
  fieldexpense:{ title: 'Field Expenses',           subtitle: 'Site spending, evidence & approvals' },
  clients:     { title: 'Clients',                  subtitle: 'Client profiles & history' },
  projects:    { title: 'Projects',                 subtitle: 'Active & completed projects' },
  accounts:    { title: 'Accounts',                 subtitle: 'Invoices, expenses & payments' },
  expenses:    { title: 'Expenses',                 subtitle: 'Company costs, allocations & evidence' },
  planner:     { title: 'Expense Planner',          subtitle: 'Planned spending and due commitments' },
  sales:       { title: 'Sales & Invoicing',        subtitle: 'Quotes, orders, invoices & receipts' },
  purchase:    { title: 'Purchase',                 subtitle: 'Requests, orders, bills & payments' },
  reports:     { title: 'Reports',                  subtitle: 'Analytics & insights' },
  financials:  { title: 'Financial Statements',     subtitle: 'Performance, position & cash movement' },
  hr:          { title: 'HR & Payroll',             subtitle: 'Operators, attendance & salary' },
  letters:     { title: 'Letters',                  subtitle: 'Company letters and document records' },
  settings:    { title: 'Settings',                 subtitle: 'Company configuration' },
  profile:     { title: 'My Profile',               subtitle: 'Personal details & preferences' },
  superadmin:      { title: 'Nhance Admin',             subtitle: 'Platform management' },
  reimbursements:  { title: 'Reimbursements',           subtitle: 'Employee out-of-pocket expense claims' },
  approval_center: { title: 'Approval Centre',         subtitle: 'Approvals & acknowledgments' },
  audit_log:       { title: 'Audit Log',               subtitle: 'Immutable record of all system actions' },
  chat:            { title: 'Team Chat',               subtitle: 'Channels, direct messages & calls' },
  ra_billing:      { title: 'RA Billing',              subtitle: 'Running account bills & payments' },
  hire_contracts:  { title: 'Hire Contracts',          subtitle: 'Equipment hire agreements' },
  usage_billing:   { title: 'Usage Billing',           subtitle: 'Billable usage and rental charges' },
  production:      { title: 'Production Tracker',      subtitle: 'Daily plant output and performance' },
  crusher_sales:   { title: 'Crusher Sales',           subtitle: 'Dispatch, invoicing and collections' },
  company:         { title: 'Company Profile',         subtitle: 'Business identity and registrations' },
  boq:             { title: 'BOQ',                     subtitle: 'Bill of Quantities' },
}

export default function TopBar({ activePage, onMenuToggle, onNavigate }) {
  const { company, session } = useAuth()
  const { mode, setMode }    = useDisplayMode()
  const { theme, toggle }    = useTheme()
  const info  = PAGE_TITLES[activePage] || { title: activePage, subtitle: '' }
  const today = fmtDate(new Date())

  const { canViewApprovals, pendingCount } = useApprovalBadge()

  return (
    <header className="nhance-topbar h-16 bg-dark-800 border-b border-dark-600 flex items-center px-4 sm:px-6 gap-4 flex-shrink-0">
      {/* Mobile menu toggle */}
      <button type="button" onClick={onMenuToggle} aria-label="Open navigation" className="lg:hidden btn-ghost p-2">
        <Menu className="w-5 h-5" />
      </button>

      {/* Page info */}
      <div className="flex-1 min-w-0" aria-live="polite">
        <button
          type="button"
          onClick={() => onNavigate?.('dashboard')}
          aria-label="Nhance Home"
          title="Go to Home"
          className="brand-word block rounded lg:hidden text-[11px] font-black tracking-[0.08em] hover:underline"
        >
          NHANCE
        </button>
        <h1 className="text-base font-bold truncate" style={{ color: 'rgb(var(--t1))' }}>{info.title}</h1>
        <p className="text-xs hidden sm:block" style={{ color: 'rgb(var(--t3))' }}>{info.subtitle}</p>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <span className="text-xs hidden md:block" style={{ color: 'rgb(var(--t3))' }}>{today}</span>

        {/* Basic / Advanced mode toggle */}
        {session && (
          <div className="hidden sm:flex items-center bg-dark-700 border border-dark-600 rounded-lg p-0.5" role="group" aria-label="Display detail">
            <button
              type="button"
              onClick={() => setMode('basic')}
              title="Basic mode — essential fields only"
              aria-pressed={mode === 'basic'}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                mode === 'basic'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'hover:bg-dark-600'
              }`}
              style={mode !== 'basic' ? { color: 'rgb(var(--t2))' } : undefined}
            >
              Basic
            </button>
            <button
              type="button"
              onClick={() => setMode('advanced')}
              title="Advanced mode — all fields"
              aria-pressed={mode === 'advanced'}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                mode === 'advanced'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'hover:bg-dark-600'
              }`}
              style={mode !== 'advanced' ? { color: 'rgb(var(--t2))' } : undefined}
            >
              Advanced
            </button>
          </div>
        )}

        {/* Light / Dark mode toggle */}
        <button
          type="button"
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-dark-700 transition-all"
          style={{ color: 'rgb(var(--t2))' }}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Mobile shortcut; Chat hides the desktop right strip. */}
        {canViewApprovals && (
          <button
            type="button"
            onClick={() => onNavigate?.('approval_center')}
            title={pendingCount > 0 ? `Approval Centre, ${pendingCount} pending approval${pendingCount > 1 ? 's' : ''}` : 'Approval Centre'}
            aria-label={pendingCount > 0 ? `Approval Centre, ${pendingCount} pending approval${pendingCount > 1 ? 's' : ''}` : 'Approval Centre'}
            aria-current={activePage === 'approval_center' ? 'page' : undefined}
            className={`relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-dark-700 transition-all ${activePage === 'chat' ? '' : 'lg:hidden'}`}
            style={{ color: 'rgb(var(--t2))' }}
          >
            <ApprovalIcon className="w-5 h-5" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            )}
          </button>
        )}

        {/* Bell is dedicated to operational notifications. */}
        <NotificationBell onNavigate={onNavigate} />

        {/* Company badge */}
        {company && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600 max-w-[220px]">
            <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
            <span className="text-xs font-medium leading-tight" style={{ color: 'rgb(var(--t1))' }}>
              {company.name}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
