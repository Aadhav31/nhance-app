import { useState, useEffect } from 'react'
import * as Icons from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getAccessibleNavigation } from '../../lib/navigation'
import { cn, initials } from '../../lib/utils'
import { ChevronLeft, ChevronDown, LogOut, User } from 'lucide-react'

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle }) {
  const { userProfile, company, role, hasModule, signOut, industryType } = useAuth()
  const [navQuery, setNavQuery] = useState('')

  const accessibleNav = getAccessibleNavigation(industryType, role, hasModule)
  const normalizedQuery = navQuery.trim().toLowerCase()
  const filteredNav = normalizedQuery
    ? accessibleNav
        .map(section => ({
          ...section,
          items: section.items.filter(item => (
            item.label.toLowerCase().includes(normalizedQuery) ||
            section.section.toLowerCase().includes(normalizedQuery)
          )),
        }))
        .filter(section => section.items.length > 0)
    : accessibleNav

  const activeSection = accessibleNav.find(s => s.items.some(i => i.key === activePage))?.section

  const [openSections, setOpenSections] = useState(() => {
    const init = {}
    if (activeSection) init[activeSection] = true
    return init
  })

  useEffect(() => {
    if (activeSection) {
      setOpenSections(prev => prev[activeSection] ? prev : { ...prev, [activeSection]: true })
    }
  }, [activeSection])

  const toggleSection = (sectionName) => {
    setOpenSections(prev => ({ ...prev, [sectionName]: !prev[sectionName] }))
  }

  return (
    <aside
      className={cn(
        'nhance-sidebar hidden lg:flex flex-col bg-dark-800 border-r border-dark-700 transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className={cn(
        'flex items-center border-b border-dark-700 h-16 px-4 gap-3',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-800 text-sm font-black text-white shadow-lg shadow-primary-900/20">
              N
            </div>
            <div className="min-w-0">
              <div className="brand-word text-lg font-black tracking-[0.08em]">
                NHANCE
              </div>
              {company && (
                <div className="max-w-[128px] truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 leading-tight">
                  {company.name}
                </div>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-dark-700 transition-all flex-shrink-0"
        >
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pt-3">
          <label className="relative block">
            <span className="sr-only">Find a page</span>
            <Icons.Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={navQuery}
              onChange={event => setNavQuery(event.target.value)}
              placeholder="Find a page…"
              className="h-10 w-full rounded-xl border border-dark-600 bg-dark-700/60 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25"
            />
          </label>
        </div>
      )}

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {filteredNav.map((section) => {
          const isOpen    = normalizedQuery ? true : !!openSections[section.section]
          const hasActive = section.items.some(i => i.key === activePage)

          return (
            <div key={section.section} className="mb-1">

              {/* Section header — clickable toggle (expanded only) */}
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.section)}
                  aria-expanded={isOpen}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg mb-0.5 transition-all duration-150 group',
                    hasActive && !isOpen
                      ? 'bg-primary-600/10 border border-primary-600/20'
                      : 'hover:bg-dark-700',
                  )}
                >
                  <span className={cn(
                    'text-[11px] font-bold uppercase tracking-widest transition-colors',
                    hasActive ? 'text-primary-400' : 'text-slate-500 group-hover:text-slate-300'
                  )}>
                    {section.section}
                  </span>
                  <ChevronDown className={cn(
                    'w-3.5 h-3.5 transition-all duration-200',
                    hasActive ? 'text-primary-400' : 'text-slate-600 group-hover:text-slate-400',
                    isOpen && 'rotate-180'
                  )} />
                </button>
              ) : (
                <div className="h-px bg-dark-700 mx-2 my-2" />
              )}

              {/* Items */}
              <div className={cn(
                'overflow-hidden transition-all duration-200',
                !collapsed && !isOpen ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'
              )}>
                {section.items.map((item) => {
                  const Icon     = Icons[item.icon] || Icons.Circle
                  const isActive = activePage === item.key
                  return (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => onNavigate(item.key)}
                      aria-current={isActive ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      style={!isActive ? { color: 'rgb(var(--t2))' } : undefined}
                      className={cn(
                        'w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 transition-all duration-150 text-sm font-medium',
                        isActive
                          ? 'nhance-nav-active bg-primary-600 text-white shadow-lg shadow-primary-900/20'
                          : 'hover:bg-dark-700 hover:text-slate-100',
                        collapsed ? 'justify-center' : 'pl-5'
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  )
                })}
              </div>

            </div>
          )
        })}
        {filteredNav.length === 0 && !collapsed && (
          <div className="mx-2 rounded-xl border border-dashed border-dark-600 px-3 py-6 text-center">
            <p className="text-xs font-semibold text-slate-400">No matching page</p>
            <button type="button" onClick={() => setNavQuery('')} className="mt-2 text-xs font-semibold text-primary-400 hover:text-primary-300">
              Clear search
            </button>
          </div>
        )}
      </nav>

      {/* ── User footer ─────────────────────────────────────────────────── */}
      <div className={cn(
        'border-t border-dark-700 p-3',
        collapsed ? 'flex flex-col items-center gap-2' : ''
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-3 px-1 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {initials(userProfile?.full_name || 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-200 truncate">
                {userProfile?.full_name || 'User'}
              </p>
              <p className="text-[11px] text-slate-500 capitalize">{role}</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold text-white">
            {initials(userProfile?.full_name || 'U')}
          </div>
        )}

        <div className={cn('flex gap-2', collapsed ? 'flex-col' : '')}>
          <button
            onClick={() => onNavigate('profile')}
            className="btn-ghost flex-1 justify-center py-1.5 text-xs"
            title="My Profile"
          >
            <User className="w-3.5 h-3.5" />
            {!collapsed && 'Profile'}
          </button>
          <button
            onClick={signOut}
            className="btn-ghost flex-1 justify-center py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            {!collapsed && 'Sign Out'}
          </button>
        </div>
      </div>
    </aside>
  )
}
