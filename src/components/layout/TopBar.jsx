import { Bell, Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useDisplayMode } from '../../contexts/DisplayModeContext'
import { fmtDate } from '../../lib/utils'

const PAGE_TITLES = {
  dashboard:   { title: 'Dashboard',        subtitle: 'Overview of your operations' },
  fleet:       { title: 'Equipments & Machineries', subtitle: 'Equipment registry & status' },
  operations:  { title: 'Daily Operations', subtitle: 'Shifts, fuel & incidents' },
  maintenance: { title: 'Maintenance',      subtitle: 'Preventive & breakdown tracking' },
  inventory:   { title: 'Inventory',        subtitle: 'Spare parts & consumables' },
  clients:     { title: 'Clients',          subtitle: 'Client profiles & history' },
  projects:    { title: 'Projects',         subtitle: 'Active & completed projects' },
  accounts:    { title: 'Accounts',         subtitle: 'Invoices, expenses & payments' },
  reports:     { title: 'Reports',          subtitle: 'Analytics & insights' },
  hr:          { title: 'HR & Payroll',     subtitle: 'Operators, attendance & salary' },
  settings:    { title: 'Settings',         subtitle: 'Company configuration' },
  profile:     { title: 'My Profile',       subtitle: 'Personal details & preferences' },
  superadmin:  { title: 'Nhance Admin',     subtitle: 'Platform management' },
}

export default function TopBar({ activePage, onMenuToggle }) {
  const { company, session } = useAuth()
  const { mode, setMode } = useDisplayMode()
  const info  = PAGE_TITLES[activePage] || { title: activePage, subtitle: '' }
  const today = fmtDate(new Date())

  return (
    <header className="h-16 bg-dark-800 border-b border-dark-700 flex items-center px-6 gap-4 flex-shrink-0">
      {/* Mobile menu toggle */}
      <button onClick={onMenuToggle} className="lg:hidden btn-ghost p-2">
        <Menu className="w-5 h-5" />
      </button>

      {/* Page info */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold text-slate-100 truncate">{info.title}</h1>
        <p className="text-xs text-slate-500 hidden sm:block">{info.subtitle}</p>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 hidden md:block">{today}</span>

        {/* Basic / Advanced mode toggle */}
        {session && (
          <div className="flex items-center bg-dark-700 border border-dark-600 rounded-lg p-0.5">
            <button
              onClick={() => setMode('basic')}
              title="Basic mode — essential fields only"
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                mode === 'basic'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Basic
            </button>
            <button
              onClick={() => setMode('advanced')}
              title="Advanced mode — all fields"
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                mode === 'advanced'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Advanced
            </button>
          </div>
        )}

        {/* Notifications */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-dark-700 transition-all">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Company badge */}
        {company && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            <span className="text-xs font-medium text-slate-300 truncate max-w-[120px]">
              {company.name}
            </span>
          </div>
        )}
      </div>
    </header>
  )
}
