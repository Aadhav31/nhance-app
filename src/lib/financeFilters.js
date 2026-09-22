export function filterExpenseEntries(entries, {
  type = 'all', from = '', to = '', mode = '', search = '',
} = {}) {
  const needle = search.trim().toLowerCase()
  return entries.filter(entry => {
    if (type !== 'all' && entry.type !== type) return false
    if (from && entry.date < from) return false
    if (to && entry.date > to) return false
    if (mode && entry.mode !== mode) return false
    if (!needle) return true
    return [entry.title, entry.sub1, entry.sub2, entry.ref]
      .some(value => String(value || '').toLowerCase().includes(needle))
  })
}
