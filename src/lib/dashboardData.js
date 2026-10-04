export async function fetchPendingDashboardLeaves(db, companyId) {
  const { data, error } = await db.from('hr_leaves')
    .select('id,from_date,to_date,status,leave_type,employee:employee_id(name)')
    .eq('company_id', companyId).eq('status', 'pending')
  if (error) throw error
  return (data || []).map(leave => ({ ...leave, employee_name: leave.employee?.name || 'Employee' }))
}

export async function fetchDashboardShifts(db, companyId, range, operatorId = null) {
  let query = db.from('shifts')
    .select('id,status,shift_date,start_time,operator_name,working_hours,equipment:equipment_id(name),fuel_entries:shift_fuel_entries(quantity_liters)')
    .eq('company_id', companyId)
    .gte('shift_date', range.from).lte('shift_date', range.to)
    .order('shift_date', { ascending: false })
  if (operatorId) query = query.eq('operator_id', operatorId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(shift => ({
    ...shift,
    equipment_name: shift.equipment?.name || 'Equipment',
    fuel_filled: (shift.fuel_entries || []).reduce((total, entry) => total + (Number(entry.quantity_liters) || 0), 0),
  }))
}
