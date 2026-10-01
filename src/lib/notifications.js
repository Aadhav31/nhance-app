const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function legacyNotificationReadIds(key) {
  if (!key) return []
  try {
    const ids = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && uuid.test(id)))].slice(-1000) : []
  } catch { return [] }
}

export function notificationTarget(notification) {
  const meta = notification.metadata || {}
  const equipmentId = meta.equipment_id
  const type = notification.type || ''
  if (type.startsWith('incident_')) return { page: 'fleet', extra: equipmentId ? { equipmentId } : {} }
  if (type === 'meter_discrepancy') return { page: 'operations', extra: {} }
  if (type === 'outstanding_dues') return { page: 'projects', extra: meta.project_id ? { projectId: meta.project_id } : {} }
  const reference = notification.reference_id
  switch (notification.reference_type) {
    case 'equipment': return { page: 'fleet', extra: reference ? { equipmentId: reference } : {} }
    case 'project': return { page: 'projects', extra: reference ? { projectId: reference } : {} }
    case 'invoice': case 'client_invoice': return { page: 'sales', extra: { tab: 'invoices', invoiceId: reference } }
    case 'ra_bill': return { page: 'ra_billing', extra: { raId: reference } }
    case 'job_card': return { page: 'maintenance', extra: { tab: 'workshop', ...(equipmentId ? { equipmentId } : {}) } }
    case 'approval_case': return { page: 'approval_center', extra: {} }
    default: return typeof meta.page === 'string' ? { page: meta.page, extra: {} } : null
  }
}

export function notificationDate(value) {
  const date = new Date(value)
  return value && !Number.isNaN(date.getTime()) ? date : null
}
