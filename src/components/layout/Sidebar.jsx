/**
 * Sidebar — VS Code-style activity bar + collapsible section panel
 *
 * Layout:
 *  ┌──────┬──────────────┐
 *  │ 52px │  164px panel │
 *  │icons │  (on demand) │
 *  └──────┴──────────────┘
 *
 * RIGHT-BAR items (settings, audit_log, approval_center, company, chat)
 * are filtered out here — they live in RightBar instead.
 */

import { useState, useEffect } from 'react'
import * as Icons from 'lucide-react'
import {
  LayoutDashboard, Truck, Wallet, Users, Zap, Shield, Factory,
  BarChart3, TrendingUp, ChevronRight, LogOut, User,
  Wrench, Package, ClipboardList,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { NAV_ITEMS } from '../../lib/constants'
import { getIndustryNav } from '../../lib/industryConfig'
import { cn, initials } from '../../lib/utils'

// ── Keys that live in RightBar — filter out of left nav ───────────────────────
const RIGHT_BAR_KEYS = new Set(['settings', 'audit_log', 'approval_center', 'company', 'chat'])

// ── Icon per section name ─────────────────────────────────────────────────────
const SECTION_ICONS = {
  'Core':       LayoutDashboard,
  'Operations': Truck,
  'Finance':    Wallet,
  'People':     Users,
  'Workflow':   Zap,
  'Admin':      Shield,
  'Production': Factory,
  'Reports':    BarChart3,
  'Sales':      TrendingUp,
  'Maintenance':Wrench,
  'Inventory':  Package,
  'Work':       ClipboardList,
}

// ── Section icon button in the activity bar ───────────────────────────────────
function SectionBtn({ section, isOpen, hasActive, onClick }) {
  const Icon = SECTION_ICONS[section] || Icons.Grid3x3

  return (
    <button
      onClick={onClick}
      title={section}
      className={cn(
        'relative w-full flex flex-col items-center gap-1 py-3 transition-all duration-150 group',
        isOpen
          ? 'text-primary-400'
          : hasActive
            ? 'text-slate-200'
            : 'text-slate-500 hover:text-slate-200'
      )}
    >
      {/* Active indicator bar on left edge */}
      {(isOpen || hasActive) && (
        <div className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r-full transition-all',
          isOpen ? 'bg-primary-400' : 'bg-slate-400'
        )} />
      )}
      <Icon className="w-5 h-5" />
      <span className="text-[8px] font-bold uppercase tracking-wide leading-none">
        {section.length > 6 ? section.slice(0, 6) : section}
      </span>
    </button>
  )
}

// ── MAIN SIDEBAR ──────────────────────────────────────────────────────────────
export default function Sidebar({ activePage, onNavigate }) {
  const { userProfile, company, role, hasModule, signOut, industryType } = useAuth()

  const sourceNav = getIndustryNav(industryType) ?? NAV_ITEMS

  // Filter: exclude right-bar keys, exclude empty sections
  const filteredNav = sourceNav.map(section => ({
    ...section,
    items: section.items.filter(item =>
      !RIGHT_BAR_KEYS.has(item.key) &&
      hasModule(item.module) &&
      item.roles.includes(role)
    ),
  })).filter(section => section.items.length > 0)

  // Which section contains the active page
  const activeSectionName = filteredNav.find(s =>
    s.items.some(i => i.key === activePage)
  )?.section

  // Open the active section by default; null = panel closed
  const [openSection, setOpenSection] = useState(activeSectionName || null)

  // When navigation changes page, keep that section open
  useEffect(() => {
    if (activeSectionName) setOpenSection(activeSectionName)
  }, [activeSectionName])

  const toggleSection = (name) => {
    setOpenSection(prev => prev === name ? null : name)
  }

  const openSectionData = filteredNav.find(s => s.section === openSection)

  return (
    <aside className="hidden lg:flex flex-row h-screen flex-shrink-0">

      {/* ── Activity bar (always 52px) ──────────────────────────────────── */}
      <div className="w-[52px] flex flex-col bg-dark-800 border-r border-dark-700 flex-shrink-0">

        {/* Logo */}
        <div className="h-14 flex items-center justify-center border-b border-dark-700 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-600 to-primary-400 flex items-center justify-center">
            <span className="text-white text-[10px] font-black">N</span>
          </div>
        </div>

        {/* Section icons */}
        <div className="flex-1 flex flex-col py-1 overflow-y-auto">
          {filteredNav.map(s => (
            <SectionBtn
              key={s.section}
              section={s.section}
              isOpen={openSection === s.section}
              hasActive={activeSectionName === s.section}
              onClick={() => toggleSection(s.section)}
            />
          ))}
        </div>

        {/* User avatar */}
        <div className="border-t border-dark-700 py-3 flex flex-col items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onNavigate('profile')}
            title={userProfile?.full_name || 'Profile'}
            className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-primary-400 transition-all"
          >
            {initials(userProfile?.full_name || 'U')}
          </button>
          <button
            onClick={signOut}
            title="Sign Out"
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Section panel (164px, only when a section is open) ─────────── */}
      {openSectionData && (
        <div className="w-[164px] flex flex-col bg-dark-850 border-r border-dark-700 flex-shrink-0"
          style={{ background: 'rgb(var(--bg2, 15 23 42))' }}
        >
          {/* Section header */}
          <div className="h-14 flex items-center justify-between px-3 border-b border-dark-700 flex-shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {openSectionData.section}
            </span>
            <button
              onClick={() => setOpenSection(null)}
              className="text-slate-600 hover:text-slate-300 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-2 px-1.5">
            {openSectionData.items.map(item => {
              const Icon     = Icons[item.icon] || Icons.Circle
              const isActive = activePage === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  style={!isActive ? { color: 'rgb(var(--t2))' } : undefined}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 transition-all duration-150 text-xs font-semibold text-left',
                    isActive
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20'
                      : 'hover:bg-dark-700 hover:text-slate-100'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate leading-tight">{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Company name at bottom of panel */}
          {company && (
            <div className="px-3 py-2.5 border-t border-dark-700 flex-shrink-0">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 truncate">
                {company.name}
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
