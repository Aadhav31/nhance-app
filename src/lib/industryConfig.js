/**
 * industryConfig.js
 *
 * Defines per-industry labels, nav overrides, and default module sets.
 *
 * BACKWARD COMPATIBILITY RULE:
 *   - 'construction', 'equipment_rental', 'transport' → null nav override → Sidebar falls
 *     back to the existing NAV_ITEMS from constants.js. Zero change to current behaviour.
 *   - New industries (crusher, readymix, automobile) → custom nav defined here.
 */

import { MODULES, ROLES } from './constants'

// ── Industry display labels ───────────────────────────────────────────────────
export const INDUSTRY_LABELS = {
  construction:    'Construction & Mining',
  equipment_rental:'Equipment Rental',
  transport:       'Transport & Logistics',
  crusher:         'Crusher / Quarry',
  readymix:        'Readymix Concrete',
  automobile:      'Automobile Retail',
}

// ── Industry icons (emoji) ────────────────────────────────────────────────────
export const INDUSTRY_ICONS = {
  construction:    '🏗️',
  equipment_rental:'🚜',
  transport:       '🚚',
  crusher:         '⛏️',
  readymix:        '🏭',
  automobile:      '🚗',
}

// ── Default module bundles per industry ──────────────────────────────────────
// Used by SuperAdminPage when auto-seeding company_modules on creation
export const INDUSTRY_DEFAULT_MODULES = {
  construction: [
    'core', 'fleet_management', 'daily_operations', 'maintenance',
    'inventory', 'clients_projects', 'accounts', 'sales', 'purchase',
    'reports_analytics', 'hr_payroll',
  ],
  equipment_rental: [
    'core', 'fleet_management', 'daily_operations', 'maintenance',
    'inventory', 'accounts', 'sales', 'purchase', 'reports_analytics', 'hr_payroll',
  ],
  transport: [
    'core', 'fleet_management', 'daily_operations', 'maintenance',
    'inventory', 'accounts', 'sales', 'purchase', 'reports_analytics', 'hr_payroll',
  ],
  crusher: [
    'core', 'fleet_management', 'daily_operations', 'maintenance',
    'inventory', 'accounts', 'sales', 'purchase', 'reports_analytics', 'hr_payroll',
    'production', // future industry-specific module key
  ],
  readymix: [
    'core', 'fleet_management', 'daily_operations', 'maintenance',
    'inventory', 'accounts', 'sales', 'purchase', 'reports_analytics', 'hr_payroll',
    'production',
  ],
  automobile: [
    'core', 'inventory', 'accounts', 'sales', 'purchase',
    'reports_analytics', 'hr_payroll',
    'showroom', // future industry-specific module key
  ],
}

// ── Nav overrides per industry ────────────────────────────────────────────────
// null → use existing NAV_ITEMS from constants.js (backward compatible)
// array → use this instead of NAV_ITEMS in Sidebar
//
// IMPORTANT: new pages (production, showroom, etc.) are placeholders — they
// render a ComingSoon screen until the full page is built.
//
export const INDUSTRY_NAV = {
  // Existing industries — null means "use constants.js NAV_ITEMS unchanged"
  construction:    null,
  equipment_rental: null,
  transport:       null,

  // ── Crusher / Quarry ────────────────────────────────────────────────────────
  crusher: [
    {
      section: 'Overview',
      items: [
        { key: 'dashboard',    label: 'Dashboard',          icon: 'LayoutDashboard', module: MODULES.CORE,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Operations',
      items: [
        { key: 'production',   label: 'Production Tracker', icon: 'Factory',         module: MODULES.OPERATIONS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
        { key: 'fleet',        label: 'Equipment & Machines',icon: 'Truck',           module: MODULES.FLEET,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'maintenance',  label: 'Maintenance',        icon: 'Wrench',          module: MODULES.MAINTENANCE,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
        { key: 'inventory',    label: 'Inventory',          icon: 'Package',         module: MODULES.INVENTORY,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'fieldexpense', label: 'Field Expenses',     icon: 'Receipt',         module: MODULES.OPERATIONS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Business',
      items: [
        { key: 'crusher_sales', label: 'Sales & Invoicing', icon: 'FileText',    module: MODULES.SALES,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'purchase',      label: 'Purchase',          icon: 'ShoppingCart', module: MODULES.PURCHASE,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Finance',
      items: [
        { key: 'accounts',  label: 'Accounts',       icon: 'Wallet',       module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'expenses',  label: 'Expenses',        icon: 'Wallet',       module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'planner',   label: 'Expense Planner', icon: 'CalendarDays', module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Insights',
      items: [
        { key: 'reports', label: 'Reports', icon: 'BarChart3', module: MODULES.REPORTS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'People',
      items: [
        { key: 'hr',      label: 'Employee Management', icon: 'Users',    module: MODULES.HR_PAYROLL,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'letters', label: 'Letters',             icon: 'FileText', module: MODULES.CORE,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Admin',
      items: [
        { key: 'settings', label: 'Settings', icon: 'Settings', module: MODULES.CORE,
          roles: [ROLES.ADMIN] },
        { key: 'company',  label: 'Company Profile', icon: 'Building2', module: MODULES.CORE,
          roles: [ROLES.ADMIN] },
      ],
    },
  ],

  // ── Readymix Concrete ───────────────────────────────────────────────────────
  readymix: [
    {
      section: 'Overview',
      items: [
        { key: 'dashboard',  label: 'Dashboard', icon: 'LayoutDashboard', module: MODULES.CORE,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Plant',
      items: [
        { key: 'production',   label: 'Batch & Production',    icon: 'Factory',      module: MODULES.OPERATIONS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
        { key: 'operations',   label: 'Delivery & Pour Log',   icon: 'ClipboardList',module: MODULES.OPERATIONS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
        { key: 'fleet',        label: 'Transit Mixers & Pumps',icon: 'Truck',        module: MODULES.FLEET,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'maintenance',  label: 'Maintenance',           icon: 'Wrench',       module: MODULES.MAINTENANCE,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
        { key: 'inventory',    label: 'Raw Materials',         icon: 'Package',      module: MODULES.INVENTORY,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'fieldexpense', label: 'Field Expenses',        icon: 'Receipt',      module: MODULES.OPERATIONS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Business',
      items: [
        { key: 'sales',    label: 'Sales',    icon: 'TrendingUp',   module: MODULES.SALES,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'purchase', label: 'Purchase', icon: 'ShoppingCart', module: MODULES.PURCHASE,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'projects', label: 'Pour Projects', icon: 'FolderOpen', module: MODULES.CLIENTS_PROJECTS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Finance',
      items: [
        { key: 'accounts',  label: 'Accounts',       icon: 'Wallet',       module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'expenses',  label: 'Expenses',        icon: 'Wallet',       module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'planner',   label: 'Expense Planner', icon: 'CalendarDays', module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Insights',
      items: [
        { key: 'reports', label: 'Reports', icon: 'BarChart3', module: MODULES.REPORTS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'People',
      items: [
        { key: 'hr',      label: 'Employee Management', icon: 'Users',    module: MODULES.HR_PAYROLL,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'letters', label: 'Letters',             icon: 'FileText', module: MODULES.CORE,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Admin',
      items: [
        { key: 'settings', label: 'Settings', icon: 'Settings', module: MODULES.CORE,
          roles: [ROLES.ADMIN] },
        { key: 'company',  label: 'Company Profile', icon: 'Building2', module: MODULES.CORE,
          roles: [ROLES.ADMIN] },
      ],
    },
  ],

  // ── Automobile Retail ───────────────────────────────────────────────────────
  automobile: [
    {
      section: 'Overview',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', module: MODULES.CORE,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Showroom',
      items: [
        { key: 'showroom',   label: 'Vehicle Stock',      icon: 'Car',         module: MODULES.INVENTORY,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'operations', label: 'Enquiries & Bookings',icon: 'ClipboardList',module: MODULES.OPERATIONS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
        { key: 'inventory',  label: 'Spare Parts Store',  icon: 'Package',     module: MODULES.INVENTORY,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'fieldexpense',label: 'Field Expenses',    icon: 'Receipt',     module: MODULES.OPERATIONS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Business',
      items: [
        { key: 'sales',    label: 'Sales',    icon: 'TrendingUp',   module: MODULES.SALES,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'purchase', label: 'Purchase', icon: 'ShoppingCart', module: MODULES.PURCHASE,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Finance',
      items: [
        { key: 'accounts',  label: 'Accounts',       icon: 'Wallet',       module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'expenses',  label: 'Expenses',        icon: 'Wallet',       module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'planner',   label: 'Expense Planner', icon: 'CalendarDays', module: MODULES.ACCOUNTS,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Insights',
      items: [
        { key: 'reports', label: 'Reports', icon: 'BarChart3', module: MODULES.REPORTS,
          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'People',
      items: [
        { key: 'hr',      label: 'Employee Management', icon: 'Users',    module: MODULES.HR_PAYROLL,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
        { key: 'letters', label: 'Letters',             icon: 'FileText', module: MODULES.CORE,
          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      ],
    },
    {
      section: 'Admin',
      items: [
        { key: 'settings', label: 'Settings', icon: 'Settings', module: MODULES.CORE,
          roles: [ROLES.ADMIN] },
        { key: 'company',  label: 'Company Profile', icon: 'Building2', module: MODULES.CORE,
          roles: [ROLES.ADMIN] },
      ],
    },
  ],
}

// Helper: get the nav config for a given industry (null = use default NAV_ITEMS)
export const getIndustryNav = (industryType) =>
  INDUSTRY_NAV[industryType] ?? null

// Helper: get default modules for a given industry
export const getIndustryModules = (industryType) =>
  INDUSTRY_DEFAULT_MODULES[industryType] ?? INDUSTRY_DEFAULT_MODULES.construction
