// ─── Roles ───────────────────────────────────────────────────────────────────
export const ROLES = {
  OPERATOR:   'operator',
  SUPERVISOR: 'supervisor',
  MANAGER:    'manager',
  ACCOUNTS:   'accounts',
  ADMIN:      'admin',
  SUPERADMIN: 'superadmin', // Nhance platform admin (you)
}

export const ROLE_LABELS = {
  operator:   'Operator',
  supervisor: 'Supervisor',
  manager:    'Manager',
  accounts:   'Accounts',
  admin:      'Admin',
  superadmin: 'Nhance Admin',
}

// ─── Modules ─────────────────────────────────────────────────────────────────
export const MODULES = {
  CORE:             'core',
  FLEET:            'fleet_management',
  OPERATIONS:       'daily_operations',
  MAINTENANCE:      'maintenance',
  INVENTORY:        'inventory',
  CLIENTS_PROJECTS: 'clients_projects',
  ACCOUNTS:         'accounts',
  SALES:            'sales',
  PURCHASE:         'purchase',
  REPORTS:          'reports_analytics',
  HR_PAYROLL:       'hr_payroll',
}

export const MODULE_LABELS = {
  core:             'Core',
  fleet_management: 'Equipments & Machineries',
  daily_operations: 'Daily Operations',
  maintenance:      'Maintenance',
  inventory:        'Inventory',
  clients_projects: 'Clients & Projects',
  accounts:         'Accounts',
  sales:            'Sales',
  purchase:         'Purchase',
  reports_analytics:'Reports & Analytics',
  hr_payroll:       'Employee Management',
}

// ─── Equipment status ─────────────────────────────────────────────────────────
export const EQUIPMENT_STATUS = {
  ACTIVE:      'active',
  IDLE:        'idle',
  BREAKDOWN:   'breakdown',
  MAINTENANCE: 'maintenance',
  DISPOSED:    'disposed',
}

export const EQUIPMENT_STATUS_COLORS = {
  active:      'badge-success',
  idle:        'badge-info',
  breakdown:   'badge-danger',
  maintenance: 'badge-warning',
  disposed:    'badge-neutral',
}

// ─── Shift status ─────────────────────────────────────────────────────────────
export const SHIFT_STATUS = {
  OPEN:     'open',
  CLOSED:   'closed',
  APPROVED: 'approved',
  DISPUTED: 'disputed',
}

// ─── Invoice status ───────────────────────────────────────────────────────────
export const INVOICE_STATUS = {
  DRAFT:     'draft',
  SENT:      'sent',
  PARTIAL:   'partial',
  PAID:      'paid',
  OVERDUE:   'overdue',
  CANCELLED: 'cancelled',
}

// ─── Permissions map ──────────────────────────────────────────────────────────
// true = allowed, false = denied
export const PERMISSIONS = {
  // Shifts
  'shift.create':      [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN],
  'shift.view_own':    [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'shift.view_all':    [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'shift.approve':     [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN],
  'shift.edit':        [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN],

  // Equipment
  'equipment.view':    [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'equipment.create':  [ROLES.MANAGER, ROLES.ADMIN],
  'equipment.edit':    [ROLES.MANAGER, ROLES.ADMIN],
  'equipment.delete':  [ROLES.ADMIN],

  // Maintenance
  'maintenance.view':  [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'maintenance.create':[ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN],
  'maintenance.edit':  [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN],

  // Inventory
  'inventory.view':    [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'inventory.create':  [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN],
  'inventory.issue':   [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN],

  // Clients & Projects
  'clients.view':      [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'clients.create':    [ROLES.MANAGER, ROLES.ADMIN],
  'projects.view':     [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'projects.create':   [ROLES.MANAGER, ROLES.ADMIN],

  // Field Expenses
  'fieldexpense.submit': [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'fieldexpense.view':   [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'fieldexpense.delete': [ROLES.MANAGER, ROLES.ADMIN],

  // Accounts
  'invoice.view':      [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'invoice.create':    [ROLES.ACCOUNTS, ROLES.ADMIN],
  'expense.view':      [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'expense.create':    [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'expense.approve':   [ROLES.MANAGER, ROLES.ADMIN],

  // Reports
  'reports.view':      [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],

  // HR / Payroll
  'hr.view':           [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN],
  'hr.manage':         [ROLES.MANAGER, ROLES.ADMIN],
  'salary.view':       [ROLES.ACCOUNTS, ROLES.ADMIN],
  'salary.manage':     [ROLES.ACCOUNTS, ROLES.ADMIN],

  // Users & Settings (admin only)
  'users.manage':      [ROLES.ADMIN],
  'settings.manage':   [ROLES.ADMIN],
}

// ─── Navigation (sidebar) ────────────────────────────────────────────────────
// Each item declares which module it needs and which roles can see it
export const NAV_ITEMS = [
  {
    section: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', module: MODULES.CORE,
        roles: [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
    ],
  },
  {
    section: 'Operations',
    items: [
      { key: 'operations', label: 'Daily Operations', icon: 'ClipboardList', module: MODULES.OPERATIONS,
        roles: [ROLES.OPERATOR, ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
      { key: 'fleet',      label: 'Equipments & Machineries', icon: 'Truck', module: MODULES.FLEET,
        roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      { key: 'maintenance',label: 'Maintenance',       icon: 'Wrench',        module: MODULES.MAINTENANCE,
        roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
      { key: 'inventory',    label: 'Inventory',         icon: 'Package',       module: MODULES.INVENTORY,
        roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      { key: 'fieldexpense', label: 'Field Expenses',   icon: 'Receipt',       module: MODULES.OPERATIONS,
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
      { key: 'projects', label: 'Projects', icon: 'FolderOpen',   module: MODULES.CLIENTS_PROJECTS,
        roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
    ],
  },
  {
    section: 'Finance',
    items: [
      { key: 'accounts',  label: 'Accounts',        icon: 'Wallet',       module: MODULES.ACCOUNTS,
        roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      { key: 'expenses',  label: 'Expenses',         icon: 'Wallet',       module: MODULES.ACCOUNTS,
        roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
      { key: 'planner',   label: 'Expense Planner',  icon: 'CalendarDays', module: MODULES.ACCOUNTS,
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
      { key: 'letters', label: 'Letters',           icon: 'FileText', module: MODULES.CORE,
        roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
    ],
  },
  {
    section: 'Admin',
    items: [
      { key: 'settings', label: 'Settings',        icon: 'Settings',   module: MODULES.CORE,
        roles: [ROLES.ADMIN] },
      { key: 'company',  label: 'Company Profile', icon: 'Building2',  module: MODULES.CORE,
        roles: [ROLES.ADMIN] },
    ],
  },
]
