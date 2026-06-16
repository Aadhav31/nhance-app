import { useState } from 'react'
import * as Icons from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { NAV_ITEMS } from '../../lib/constants'
import { cn, initials } from '../../lib/utils'
import { ChevronLeft, LogOut, User } from 'lucide-react'

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle }) {
  const { userProfile, company, role, hasModule, signOut } = useAuth()

  const filteredNav = NAV_ITEMS.map(section => ({
    ...section,
    items: section.items.filter(item =>
      hasModule(item.module) && item.roles.includes(role)
    ),
  })).filter(section => section.items.length > 0)

  return (
    <aside
      className={cn(
        'flex flex-col bg-dark-800 border-r border-dark-700 transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center border-b border-dark-700 h-16 px-4 gap-3',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        {!collapsed && (
          <div>
            <div className="text-lg font-black tracking-tight bg-gradient-to-r from-primary-400 to-cyan-400 bg-clip-text text-transparent">
              NHANCE
            </div>
            {company && (
              <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider truncate max-w-[160px]">
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {filteredNav.map((section) => (
          <div key={section.section} className="mb-4">
            {!collapsed && (
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-1">
                {section.section}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = Icons[item.icon] || Icons.Circle
              const isActive = activePage === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150 text-sm font-medium',
                    isActive
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-dark-700',
                    collapsed && 'justify-center'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
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
