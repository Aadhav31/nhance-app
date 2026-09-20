import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canAccessPage,
  flattenNavigation,
  getAccessibleMobilePages,
  getAccessibleNavigation,
} from '../src/lib/navigation.js'

const allModules = () => true
const fleetOnly = module => ['core', 'fleet_management'].includes(module)

test('desktop navigation respects both role and enabled modules', () => {
  const sections = getAccessibleNavigation('equipment_rental', 'supervisor', fleetOnly)
  const keys = flattenNavigation(sections).map(item => item.key)
  assert.ok(keys.includes('dashboard'))
  assert.ok(keys.includes('control_tower'))
  assert.ok(keys.includes('fleet'))
  assert.ok(!keys.includes('accounts'))
  assert.ok(!keys.includes('settings'))
})
test('mobile navigation includes rental pages and permitted system actions', () => {
  const managerKeys = getAccessibleMobilePages('equipment_rental', 'manager', allModules).map(item => item.key)
  assert.ok(managerKeys.includes('hire_contracts'))
  assert.ok(managerKeys.includes('profitability'))
  assert.ok(managerKeys.includes('chat'))
  assert.ok(managerKeys.includes('approval_center'))
  assert.ok(!managerKeys.includes('audit_log'))
  assert.ok(!managerKeys.includes('settings'))
})

test('mobile navigation never exposes admin pages to a supervisor', () => {
  const keys = getAccessibleMobilePages('equipment_rental', 'supervisor', allModules).map(item => item.key)
  assert.ok(!keys.includes('settings'))
  assert.ok(!keys.includes('company'))
  assert.ok(!keys.includes('audit_log'))
})

test('direct page access uses the same role and module boundary', () => {
  assert.equal(canAccessPage('profitability', { role: 'manager', hasModule: allModules }), true)
  assert.equal(canAccessPage('profitability', { role: 'supervisor', hasModule: allModules }), false)
  assert.equal(canAccessPage('maintenance', { role: 'manager', hasModule: fleetOnly }), false)
  assert.equal(canAccessPage('settings', { role: 'manager', hasModule: allModules }), false)
  assert.equal(canAccessPage('settings', { role: 'admin', hasModule: allModules }), true)
})
