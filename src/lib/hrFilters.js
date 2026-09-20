export function filterReimbursements(rows, { status = 'all', search = '' } = {}) {
  const needle = search.trim().toLowerCase()
  return rows.filter(row => {
    if (status !== 'all' && row.status !== status) return false
    if (!needle) return true
    return [row.employee_name, row.description, row.category, row.flags?.bill_ref]
      .some(value => String(value || '').toLowerCase().includes(needle))
  })
}
