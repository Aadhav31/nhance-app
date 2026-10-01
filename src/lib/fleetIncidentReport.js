const TYPES = new Set(['breakdown', 'unscheduled_maintenance', 'regular_maintenance', 'damage',
  'theft', 'safety_issue', 'accident', 'near_miss', 'other'])
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical'])
const clean = value => String(value ?? '').trim() || null

export function localIncidentDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function buildFleetIncidentDetails(type, form, location, now = new Date()) {
  if (!TYPES.has(type)) throw new Error('Select incident type')
  const date = form.incident_date
  const occurred = new Date(`${date}T${now.toTimeString().slice(0, 8)}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(occurred.getTime()) || localIncidentDate(occurred) !== date)
    throw new Error('Enter a valid incident date')
  if (date > localIncidentDate(now)) throw new Error('Incident date cannot be in the future')
  const cause = type === 'breakdown' ? clean(form.breakdown_cause) : null
  const damage = type === 'damage' ? clean(form.damage_cause) : null
  if (type === 'breakdown' && !cause) throw new Error('Cause of breakdown is required')
  if (type === 'damage' && !damage) throw new Error('Describe how the damage happened')
  const description = clean(form.description) || cause || damage
  if (!description) throw new Error('Description is required')
  const severe = ['safety_issue', 'accident', 'near_miss'].includes(type)
  if (severe && !SEVERITIES.has(form.severity)) throw new Error('Select a valid severity')
  return {
    incident_type: type, occurred_at: occurred.toISOString(), description,
    severity: severe ? form.severity : null,
    action_taken: ['unscheduled_maintenance', 'regular_maintenance', 'safety_issue', 'accident', 'near_miss'].includes(type) ? clean(form.action_taken) : null,
    breakdown_cause: cause, rectification_needed: type === 'breakdown' ? clean(form.rectification_needed) : null,
    damage_cause: damage, what_needs_to_be_done: type === 'damage' ? clean(form.what_needs_to_be_done) : null,
    location_lat: location?.lat ?? null, location_lng: location?.lng ?? null,
    location_address: clean(location?.address),
  }
}
