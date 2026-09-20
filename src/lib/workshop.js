export const WORKSHOP_STAGES = [
  { key: 'open', label: 'Open' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'awaiting_parts', label: 'Awaiting Parts' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'testing', label: 'Testing' },
  { key: 'pending_approval', label: 'Approval' },
  { key: 'closed', label: 'Closed' },
]

export function workshopStage(job) {
  if (job?.workflow_stage) return job.workflow_stage
  if (job?.status === 'closed') return 'closed'
  if (job?.status === 'in_progress') return 'in_progress'
  return 'open'
}

export function isWorkshopOverdue(job, now = new Date()) {
  const stage = workshopStage(job)
  if (!job?.sla_due_at || stage === 'closed' || stage === 'cancelled') return false
  return new Date(job.sla_due_at).getTime() < new Date(now).getTime()
}

export function filterWorkshopJobs(jobs, filter = 'active', now = new Date()) {
  const rows = Array.isArray(jobs) ? jobs : []
  if (filter === 'all') return rows
  if (filter === 'active') return rows.filter(job => !['closed', 'cancelled'].includes(workshopStage(job)))
  if (filter === 'overdue') return rows.filter(job => isWorkshopOverdue(job, now))
  return rows.filter(job => workshopStage(job) === filter)
}

export function buildWorkshopMetrics(jobs, now = new Date()) {
  const rows = Array.isArray(jobs) ? jobs : []
  const counts = Object.fromEntries(WORKSHOP_STAGES.map(stage => [stage.key, 0]))
  let active = 0
  let overdue = 0
  let activeCost = 0
  let activeDowntime = 0
  let closedRepairHours = 0
  let closedRepairs = 0

  rows.forEach(job => {
    const stage = workshopStage(job)
    counts[stage] = (counts[stage] || 0) + 1
    if (!['closed', 'cancelled'].includes(stage)) {
      active += 1
      activeCost += Number(job.total_cost || 0)
      activeDowntime += Number(job.downtime_hours || 0)
    }
    if (isWorkshopOverdue(job, now)) overdue += 1
    if (stage === 'closed' && Number(job.downtime_hours || 0) > 0) {
      closedRepairs += 1
      closedRepairHours += Number(job.downtime_hours || 0)
    }
  })

  return {
    ...counts,
    active,
    overdue,
    activeCost,
    activeDowntime,
    mttr: closedRepairs ? closedRepairHours / closedRepairs : 0,
  }
}

export function workshopActions(job, canApprove = false) {
  const stage = workshopStage(job)
  const actions = {
    open: [
      { stage: 'assigned', label: 'Assign' },
      { stage: 'in_progress', label: 'Start work' },
    ],
    assigned: [
      { stage: 'awaiting_parts', label: 'Await parts' },
      { stage: 'in_progress', label: 'Start work' },
    ],
    awaiting_parts: [{ stage: 'in_progress', label: 'Start work' }],
    in_progress: [
      { stage: 'awaiting_parts', label: 'Await parts' },
      { stage: 'testing', label: 'Send to testing' },
    ],
    testing: [
      { stage: 'in_progress', label: 'Return to repair' },
      { stage: 'pending_approval', label: 'Request approval' },
    ],
    pending_approval: [
      { stage: 'testing', label: 'Return to testing' },
      ...(canApprove ? [{ stage: 'closed', label: 'Approve & release' }] : []),
    ],
  }
  return actions[stage] || []
}
