const dayNumber = value => {
  if (!value) return null
  const timestamp = Date.parse(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 86_400_000)
}

export function filterHireContracts(contracts, { status = 'all', search = '', today }) {
  const todayDay = dayNumber(today)
  const needle = search.trim().toLowerCase()
  return contracts.filter(contract => {
    const endDay = dayNumber(contract.end_date)
    if (status === 'ending') {
      if (contract.status !== 'active' || endDay == null || todayDay == null || endDay < todayDay || endDay - todayDay > 7) return false
    } else if (status === 'overdue') {
      if (contract.status !== 'active' || endDay == null || todayDay == null || endDay >= todayDay) return false
    } else if (status !== 'all' && contract.status !== status) {
      return false
    }

    if (!needle) return true
    return [contract.contract_number, contract.equipment_name, contract.client_name, contract.site_location]
      .some(value => String(value || '').toLowerCase().includes(needle))
  })
}

export function filterRABills(rows, { metric = 'all', status = 'all', boqId = 'all', search = '' }) {
  const needle = search.trim().toLowerCase()
  return rows.filter(row => {
    if (metric === 'billed' && row.status === 'draft') return false
    if (metric === 'outstanding' && !['submitted', 'approved'].includes(row.status)) return false
    if (metric === 'paid' && row.status !== 'paid') return false
    if (metric === 'approved' && row.status !== 'approved') return false
    if (status !== 'all' && row.status !== status) return false
    if (boqId !== 'all' && row.boq_id !== boqId) return false
    if (!needle) return true
    return [row.ra_number, row.boq?.client_name, row.boq?.title, row.boq?.contract_number]
      .some(value => String(value || '').toLowerCase().includes(needle))
  })
}
