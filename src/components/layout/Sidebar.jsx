import { useState, useEffect } from 'react'
import * as Icons from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { NAV_ITEMS } from '../../lib/constants'
import { getIndustryNav } from '../../lib/industryConfig'
import { cn, initials } from '../../lib/utils'
import { ChevronLeft, ChevronDown, LogOut, User } from 'lucide-react'

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle }) {
  const { userProfile, company, role, hasModule, signOut, industryType } = useAuth()

  // Use industry-specific nav if one is defined; fall back to NAV_ITEMS
  const sourceNav = getIndustryNav(industryType) ?? NAV_ITEMS

  const filteredNav = sourceNav.map(section => ({
    ...section,
    items: section.items.filter(item =>
      hasModule(item.module) && item.roles.includes(role)
    ),
  })).filter(section => section.items.length > 0)

  // Find which section contains the active page so we can open it by default
  const activeSection = filteredNav.find(s => s.items.some(i => i.key === activePage))?.section

  const [openSections, setOpenSections] = useState(() => {
    // Open the section containing the current active page on first render
    const init = {}
    if (activeSection) init[activeSection] = true
    return init
  })

  // When activePage changes (navigation), ensure that section is open
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
        'flex flex-col bg-dark-800 border-r border-dark-700 transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className={cn(
        'flex items-center border-b border-dark-700 h-16 px-4 gap-3',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <div>
            <div className="text-lg font-black tracking-tight bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
              NHANCE
            </div>
            {company && (
              <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider leading-tight">
                {company.name}
              </div>
            )}
          </div>
        )}
        <button
          onClick={onToggle}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-dark-700 transition-all"
        >
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {filteredNav.map((section) => {
          const isOpen     = !!openSections[section.section]
          const hasActive  = section.items.some(i => i.key === activePage)

          return (
            <div key={section.section} className="mb-1">

              {/* Section header — clickable toggle (expanded sidebar only) */}
              {!collapsed ? (
                <button
                  onClick={() => toggleSection(section.section)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg mb-0.5 transition-all duration-150 group',
                    hasActive && !isOpen
                      ? 'bg-primary-600/10 border border-primary-600/20'
                      : 'hover:bg-dark-700',
                  )}
                >
                  <span
                    className={cn(
                      'text-[11px] font-bold uppercase tracking-widest transition-colors',
                      hasActive ? 'text-primary-400' : 'text-slate-500 group-hover:text-slate-300'
                    )}
                  >
                    {section.section}
                  </span>
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 transition-all duration-200',
                      hasActive ? 'text-primary-400' : 'text-slate-600 group-hover:text-slate-400',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>
              ) : (
                /* Collapsed: just a faint divider line between sections */
                <div className="h-px bg-dark-700 mx-2 my-2" />
              )}

              {/* Items — visible when section is open (or always in collapsed mode) */}
              <div
                className={cn(
                  'overflow-hidden transition-all duration-200',
                  !collapsed && !isOpen ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'
                )}
              >
                {section.items.map((item) => {
                  const Icon     = Icons[item.icon] || Icons.Circle
                  const isActive = activePage === item.key
                  return (
                    <button
                      key={item.key}
                      onClick={() => onNavigate(item.key)}
                      title={collapsed ? item.label : undefined}
                      style={!isActive ? { color: 'rgb(var(--t2))' } : undefined}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150 text-sm font-medium',
                        isActive
                          ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                          : 'hover:bg-dark-700 hover:text-slate-100',
                        collapsed ? 'justify-center' : 'pl-5'   // indent items under section header
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
