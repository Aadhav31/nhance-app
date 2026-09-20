-- Authoritative, tax-exclusive profitability evidence across revenue and cost sources.
-- The view is SECURITY INVOKER so every source table continues to enforce its own RLS.

create or replace view public.profitability_ledger
with (security_invoker = true)
as
with raw_ledger as (
  select
    concat('invoice:', i.id)::text as id,
    i.company_id,
    i.invoice_date as entry_date,
    'revenue'::text as entry_type,
    'invoice'::text as source_type,
    i.id as source_id,
    coalesce(i.invoice_number, 'Invoice')::text as reference,
    coalesce(i.client_name, i.project_name, 'Client invoice')::text as description,
    'revenue'::text as category,
    coalesce(
      nullif(i.taxable_amount, 0),
      nullif(i.subtotal, 0),
      nullif(i.total_amount - coalesce(i.cgst_amount, 0) - coalesce(i.sgst_amount, 0) - coalesce(i.igst_amount, 0), 0),
      i.total_amount,
      0
    )::numeric as raw_amount,
    i.project_id,
    i.inv_equipment_id as equipment_id,
    jsonb_build_object(
      'status', i.status,
      'invoice_type', i.invoice_type,
      'client_name', i.client_name,
      'gross_amount', coalesce(i.total_amount, 0),
      'cash_collected', coalesce(i.paid_amount, 0),
      'balance_due', coalesce(i.balance_due, 0)
    ) as metadata
  from public.client_invoices i
  where lower(coalesce(i.invoice_type, 'tax_invoice')) <> 'proforma'
    and lower(coalesce(i.status, 'draft')) in ('sent', 'partial', 'paid', 'overdue')

  union all

  select
    concat('bill:', b.id)::text,
    b.company_id,
    b.bill_date,
    'cost'::text,
    'bill'::text,
    b.id,
    coalesce(b.bill_number, b.bill_ref, 'Vendor bill')::text,
    coalesce(b.vendor_name, b.equipment_name, 'Vendor bill')::text,
    'vendor_bill'::text,
    coalesce(
      nullif(b.taxable_amount, 0),
      nullif(b.subtotal, 0),
      nullif(b.total_amount - coalesce(b.cgst_amount, 0) - coalesce(b.sgst_amount, 0) - coalesce(b.igst_amount, 0), 0),
      b.total_amount,
      0
    )::numeric,
    b.project_id,
    b.equipment_id,
    jsonb_build_object(
      'status', b.status,
      'vendor_name', b.vendor_name,
      'gross_amount', coalesce(b.total_amount, 0),
      'paid_amount', coalesce(b.paid_amount, 0),
      'balance_due', coalesce(b.balance_due, 0)
    )
  from public.bills b
  where lower(coalesce(b.status, 'pending')) not in ('cancelled', 'void')

  union all

  select
    concat('field_expense:', f.id)::text,
    f.company_id,
    f.expense_date,
    'cost'::text,
    'field_expense'::text,
    f.id,
    coalesce(f.bill_number, f.transaction_ref, 'Field expense')::text,
    coalesce(f.description, f.payee_name, f.category, 'Field expense')::text,
    coalesce(f.category, 'field_expense')::text,
    coalesce(f.amount, 0)::numeric,
    f.project_id,
    f.equipment_id,
    jsonb_build_object(
      'payment_status', f.payment_status,
      'payment_mode', f.payment_mode,
      'payee_name', f.payee_name,
      'submitted_by', f.created_by_name
    )
  from public.field_expenses f
  where f.linked_bill_id is null

  union all

  select
    concat('expense:', e.id)::text,
    e.company_id,
    e.expense_date,
    'cost'::text,
    'expense'::text,
    e.id,
    coalesce(e.reference_number, e.bill_number, 'Expense')::text,
    coalesce(e.description, e.vendor_name, e.category, 'Expense')::text,
    coalesce(e.category, e.source, 'expense')::text,
    coalesce(nullif(e.amount, 0), e.total_amount, 0)::numeric,
    e.project_id,
    e.equipment_id,
    jsonb_build_object(
      'status', e.status,
      'source', e.source,
      'scope', e.expense_scope,
      'vendor_name', e.vendor_name,
      'payment_mode', e.payment_mode
    )
  from public.expenses e
  where coalesce(e.source, '') <> 'field_expense'
    and lower(coalesce(e.status::text, 'draft')) not in ('rejected', 'cancelled', 'void')
    and not exists (
      select 1
      from public.bills duplicate_bill
      where duplicate_bill.company_id = e.company_id
        and lower(coalesce(duplicate_bill.status, 'pending')) not in ('cancelled', 'void')
        and (
          (e.bill_number is not null and (duplicate_bill.bill_number = e.bill_number or duplicate_bill.bill_ref = e.bill_number))
          or (e.reference_number is not null and (duplicate_bill.bill_number = e.reference_number or duplicate_bill.bill_ref = e.reference_number))
        )
    )

  union all

  select
    concat('job_card:', j.id)::text,
    j.company_id,
    coalesce(j.closed_date, j.released_at::date, j.approved_at::date, j.updated_at::date),
    'cost'::text,
    'job_card'::text,
    j.id,
    coalesce(j.jc_number, 'Job card')::text,
    coalesce(j.complaint, j.work_done, j.jc_type, 'Workshop job')::text,
    'maintenance'::text,
    coalesce(nullif(j.total_cost, 0), coalesce(j.parts_cost, 0) + coalesce(j.labor_cost, 0) + coalesce(j.external_cost, 0), 0)::numeric,
    j.project_id,
    j.equipment_id,
    jsonb_build_object(
      'job_type', j.jc_type,
      'workflow_stage', j.workflow_stage,
      'parts_cost', coalesce(j.parts_cost, 0),
      'labor_cost', coalesce(j.labor_cost, 0),
      'external_cost', coalesce(j.external_cost, 0),
      'downtime_hours', coalesce(j.downtime_hours, 0)
    )
  from public.job_cards j
  where lower(coalesce(j.status, 'open')) = 'closed'
     or lower(coalesce(j.workflow_stage, 'open')) = 'closed'

  union all

  select
    concat('maintenance:', m.id)::text,
    m.company_id,
    coalesce(m.completed_date, m.service_date),
    'cost'::text,
    'maintenance'::text,
    m.id,
    concat('Maintenance ', left(m.id::text, 8))::text,
    coalesce(m.description, m.maintenance_type_label, m.maintenance_type::text, 'Maintenance')::text,
    'maintenance'::text,
    coalesce(m.total_cost, 0)::numeric,
    m.project_id,
    m.equipment_id,
    jsonb_build_object(
      'status', m.status,
      'maintenance_type', m.maintenance_type,
      'labour_cost', coalesce(m.labour_cost, 0),
      'downtime_hours', coalesce(m.downtime_hours, 0)
    )
  from public.maintenance_records m
  where lower(coalesce(m.status::text, 'planned')) = 'completed'
    and m.job_card_id is null

  union all

  select
    concat('fuel:', f.id)::text,
    f.company_id,
    f.issue_date,
    'cost'::text,
    'fuel'::text,
    f.id,
    coalesce(f.voucher_number, 'Fuel issue')::text,
    coalesce(f.equipment_name, f.tank_name, 'Fuel issue')::text,
    'fuel'::text,
    null::numeric,
    null::uuid,
    f.equipment_id,
    jsonb_build_object(
      'quantity_liters', coalesce(f.quantity_liters, 0),
      'tank_id', f.tank_id,
      'tank_name', f.tank_name,
      'fuel_source', f.fuel_source,
      'issued_by', f.issued_by_name
    )
  from public.fuel_issues f
),
resolved as (
  select
    r.*,
    coalesce(r.project_id, deployment.project_id) as resolved_project_id,
    (r.project_id is null and deployment.project_id is not null) as project_inferred
  from raw_ledger r
  left join lateral (
    select d.project_id
    from public.equipment_deployments d
    where r.project_id is null
      and r.equipment_id is not null
      and d.company_id = r.company_id
      and d.equipment_id = r.equipment_id
      and d.deployed_date <= r.entry_date
      and (d.withdrawn_date is null or d.withdrawn_date >= r.entry_date)
    order by d.deployed_date desc, d.created_at desc
    limit 1
  ) deployment on true
),
named as (
  select
    r.*,
    p.project_name,
    e.name as equipment_name,
    e.equipment_number,
    p.hsd_rate_per_liter
  from resolved r
  left join public.projects p
    on p.id = r.resolved_project_id and p.company_id = r.company_id
  left join public.equipment e
    on e.id = r.equipment_id and e.company_id = r.company_id
),
rated as (
  select
    n.*,
    case when n.source_type = 'fuel' then coalesce(
      (
        select nullif(fr.rate_per_liter, 0)
        from public.fuel_tank_replenishments fr
        where fr.company_id = n.company_id
          and fr.tank_id = nullif(n.metadata ->> 'tank_id', '')::uuid
          and fr.replenish_date <= n.entry_date
          and coalesce(fr.rate_per_liter, 0) > 0
        order by fr.replenish_date desc, fr.created_at desc
        limit 1
      ),
      (
        select sum(coalesce(fr.total_amount, fr.quantity_liters * fr.rate_per_liter)) / nullif(sum(fr.quantity_liters), 0)
        from public.fuel_tank_replenishments fr
        where fr.company_id = n.company_id
          and fr.replenish_date <= n.entry_date
          and coalesce(fr.quantity_liters, 0) > 0
          and (coalesce(fr.total_amount, 0) > 0 or coalesce(fr.rate_per_liter, 0) > 0)
      ),
      nullif(n.hsd_rate_per_liter, 0)
    ) end as fuel_rate
  from named n
)
select
  id,
  company_id,
  entry_date,
  entry_type,
  source_type,
  source_id,
  reference,
  description,
  category,
  round(
    case
      when source_type = 'fuel' then coalesce((metadata ->> 'quantity_liters')::numeric, 0) * coalesce(fuel_rate, 0)
      else coalesce(raw_amount, 0)
    end,
    2
  ) as amount,
  resolved_project_id as project_id,
  equipment_id,
  project_name,
  equipment_name,
  equipment_number,
  case
    when resolved_project_id is not null and equipment_id is not null then 'complete'
    when resolved_project_id is not null then 'project_only'
    when equipment_id is not null then 'equipment_only'
    else 'unallocated'
  end as allocation_status,
  project_inferred,
  case
    when source_type = 'fuel' and fuel_rate is null then 'missing_rate'
    else 'complete'
  end as evidence_status,
  case when source_type = 'fuel' then fuel_rate else null end as unit_rate,
  metadata
from rated;

comment on view public.profitability_ledger is
  'Tax-exclusive revenue and non-duplicated cost evidence with project/equipment allocation for profitability analysis.';

revoke all on public.profitability_ledger from anon;
grant select on public.profitability_ledger to authenticated;
