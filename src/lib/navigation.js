import { MODULES, NAV_ITEMS, ROLES } from './constants.js'
import { getIndustryNav } from './industryConfig.js'

export const RIGHT_BAR_PAGE_KEYS = new Set([
  'chat',
  'approval_center',
  'audit_log',
  'settings',
  'company',
])

export const SYSTEM_NAV_ITEMS = [
  { key: 'chat', label: 'Team Chat', icon: 'MessageSquare', module: MODULES.CORE,
    roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  { key: 'approval_center', label: 'Approval Centre', icon: 'CheckCircle2', module: MODULES.CORE,
    roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  { key: 'audit_log', label: 'Audit Log', icon: 'Shield', module: MODULES.CORE,
    roles: [ROLES.ADMIN] },
  { key: 'settings', label: 'Settings', icon: 'Settings', module: MODULES.CORE,
    roles: [ROLES.ADMIN] },
  { key: 'company', label: 'Company Profile', icon: 'Building2', module: MODULES.CORE,
    roles: [ROLES.ADMIN] },
  { key: 'profile', label: 'My Profile', icon: 'User', module: MODULES.CORE,
    roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
]

// Pages that are intentionally reachable from another feature even when they
// are not present in a particular industry's main navigation.
const PAGE_ACCESS = {
  dashboard:          { module: MODULES.CORE,             roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  control_tower:      { module: MODULES.FLEET,            roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
  fleet:              { module: MODULES.FLEET,            roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  fuel_reconciliation:{ module: MODULES.FLEET,            roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  deployment_planner: { module: MODULES.FLEET,            roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  maintenance:        { module: MODULES.MAINTENANCE,      roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
  inventory:          { module: MODULES.INVENTORY,        roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  operations:         { module: MODULES.OPERATIONS,       roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
  fieldexpense:       { module: MODULES.OPERATIONS,       roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  production:         { module: MODULES.OPERATIONS,       roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ADMIN] },
  clients:            { module: MODULES.CLIENTS_PROJECTS, roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  projects:           { module: MODULES.CLIENTS_PROJECTS, roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  boq:                { module: MODULES.CLIENTS_PROJECTS, roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  ra_billing:         { module: MODULES.CLIENTS_PROJECTS, roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  hire_contracts:     { module: MODULES.CLIENTS_PROJECTS, roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  active_deployments: { module: MODULES.CLIENTS_PROJECTS, roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  availability:       { module: MODULES.CLIENTS_PROJECTS, roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  usage_billing:      { module: MODULES.CLIENTS_PROJECTS, roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  accounts:           { module: MODULES.ACCOUNTS,         roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  expenses:           { module: MODULES.ACCOUNTS,         roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  planner:            { module: MODULES.ACCOUNTS,         roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  financials:         { module: MODULES.ACCOUNTS,         roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  sales:              { module: MODULES.SALES,            roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  crusher_sales:      { module: MODULES.SALES,            roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  purchase:           { module: MODULES.PURCHASE,         roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  reports:            { module: MODULES.REPORTS,          roles: [ROLES.SUPERVISOR, ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  profitability:      { module: MODULES.REPORTS,          roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  hr:                 { module: MODULES.HR_PAYROLL,       roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  reimbursements:     { module: MODULES.HR_PAYROLL,       roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  letters:            { module: MODULES.CORE,             roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
  showroom:           { module: MODULES.INVENTORY,        roles: [ROLES.MANAGER, ROLES.ACCOUNTS, ROLES.ADMIN] },
}
function itemIsAccessible(item, role, hasModule) {
  return Boolean(
    item &&
    item.roles?.includes(role) &&
    (!item.module || hasModule?.(item.module))
  )
}

export function getAccessibleNavigation(industryType, role, hasModule, { includeRightBar = false } = {}) {
  const source = getIndustryNav(industryType) || NAV_ITEMS
  return source
    .map(section => ({
      ...section,
      items: section.items.filter(item => (
        (includeRightBar || !RIGHT_BAR_PAGE_KEYS.has(item.key)) &&
        itemIsAccessible(item, role, hasModule)
      )),
    }))
    .filter(section => section.items.length > 0)
}

export function flattenNavigation(sections) {
  return sections.flatMap(section => section.items)
}

export function getAccessibleMobilePages(industryType, role, hasModule) {
  const contentItems = flattenNavigation(getAccessibleNavigation(
    industryType,
    role,
    hasModule,
    { includeRightBar: true },
  ))
  const systemItems = SYSTEM_NAV_ITEMS.filter(item => itemIsAccessible(item, role, hasModule))
  const seen = new Set()
  return [...contentItems, ...systemItems].filter(item => {
    if (seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}

export function canAccessPage(page, { role, hasModule, isSuperAdmin = false }) {
  if (isSuperAdmin) return page === 'superadmin' || page === 'dashboard'
  const systemRule = SYSTEM_NAV_ITEMS.find(item => item.key === page)
  const rule = systemRule || PAGE_ACCESS[page]
  return itemIsAccessible(rule, role, hasModule)
}
