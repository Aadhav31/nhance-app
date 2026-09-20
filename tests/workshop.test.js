import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWorkshopMetrics,
  filterWorkshopJobs,
  isWorkshopOverdue,
  workshopActions,
  workshopStage,
} from '../src/lib/workshop.js'

const now = new Date('2026-09-20T12:00:00Z')
const jobs = [
  { id: 'open', workflow_stage: 'open', sla_due_at: '2026-09-20T10:00:00Z', total_cost: 100, downtime_hours: 2 },
  { id: 'parts', workflow_stage: 'awaiting_parts', sla_due_at: '2026-09-21T10:00:00Z', total_cost: 200, downtime_hours: 3 },
  { id: 'testing', workflow_stage: 'testing', total_cost: 300, downtime_hours: 4 },
  { id: 'closed', workflow_stage: 'closed', sla_due_at: '2026-09-19T10:00:00Z', total_cost: 400, downtime_hours: 8 },
]

test('legacy status maps to a workshop stage', () => {
  assert.equal(workshopStage({ status: 'in_progress' }), 'in_progress')
  assert.equal(workshopStage({ status: 'closed' }), 'closed')
  assert.equal(workshopStage({ status: 'open' }), 'open')
})

test('tile filters return only the exact drill-down rows', () => {
  assert.deepEqual(filterWorkshopJobs(jobs, 'awaiting_parts', now).map(job => job.id), ['parts'])
  assert.deepEqual(filterWorkshopJobs(jobs, 'testing', now).map(job => job.id), ['testing'])
  assert.deepEqual(filterWorkshopJobs(jobs, 'overdue', now).map(job => job.id), ['open'])
  assert.deepEqual(filterWorkshopJobs(jobs, 'active', now).map(job => job.id), ['open', 'parts', 'testing'])
})

test('closed jobs are never reported overdue', () => {
  assert.equal(isWorkshopOverdue(jobs[0], now), true)
  assert.equal(isWorkshopOverdue(jobs[3], now), false)
})

test('metrics separate active exposure from closed repair time', () => {
  const metrics = buildWorkshopMetrics(jobs, now)
  assert.equal(metrics.active, 3)
  assert.equal(metrics.overdue, 1)
  assert.equal(metrics.awaiting_parts, 1)
  assert.equal(metrics.activeCost, 600)
  assert.equal(metrics.activeDowntime, 9)
  assert.equal(metrics.mttr, 8)
})

test('approval action is available only to approvers', () => {
  const job = { workflow_stage: 'pending_approval' }
  assert.deepEqual(workshopActions(job, false).map(action => action.stage), ['testing'])
  assert.deepEqual(workshopActions(job, true).map(action => action.stage), ['testing', 'closed'])
})
