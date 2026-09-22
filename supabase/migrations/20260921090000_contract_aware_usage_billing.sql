-- Keep the source and review snapshot on the canonical Sales invoice.
alter table public.hire_contracts
  add column if not exists billing_rules jsonb not null default '{}'::jsonb;

alter table public.client_invoices
  add column if not exists billing_deployment_id uuid references public.equipment_deployments(id) on delete set null,
  add column if not exists billing_contract_id uuid references public.hire_contracts(id) on delete set null,
  add column if not exists billing_period_from date,
  add column if not exists billing_period_to date,
  add column if not exists billing_snapshot jsonb;

-- Permissive legacy policies override tenant policies when both exist.
-- Both invoice tables must use the same company boundary as the rest of Sales.
drop policy if exists invoices_all on public.client_invoices;
drop policy if exists line_items_all on public.invoice_line_items;
drop policy if exists tenant_isolation_client_invoices on public.client_invoices;
drop policy if exists tenant_isolation_invoice_line_items on public.invoice_line_items;
create policy tenant_isolation_client_invoices on public.client_invoices
  for all to authenticated
  using (company_id = (select public.auth_company_id()))
  with check (company_id = (select public.auth_company_id()));
create policy tenant_isolation_invoice_line_items on public.invoice_line_items
  for all to authenticated
  using (company_id = (select public.auth_company_id()))
  with check (company_id = (select public.auth_company_id()));

create unique index if not exists uq_client_invoice_usage_period
  on public.client_invoices(company_id, billing_deployment_id, billing_period_from, billing_period_to)
  where billing_deployment_id is not null and status <> 'cancelled';

-- One transaction: an invoice cannot be saved without its line items and source.
-- The existing invoice RPC authenticates the caller, enforces tenant and role,
-- and inserts the header and its items. This invoker then links the source.
create or replace function public.create_usage_invoice_with_items(
  p_invoice jsonb, p_items jsonb, p_billing jsonb
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_company uuid := (p_invoice ->> 'company_id')::uuid;
  v_deployment uuid := (p_billing ->> 'deployment_id')::uuid;
  v_contract uuid := nullif(p_billing ->> 'contract_id', '')::uuid;
  v_from date := (p_billing ->> 'period_from')::date;
  v_to date := (p_billing ->> 'period_to')::date;
  v_count integer;
begin
  if auth.uid() is null or v_company is distinct from public.auth_company_id()
     or public.auth_role() not in ('admin', 'manager', 'accounts') then
    raise exception 'Invoice permission denied' using errcode = '42501';
  end if;
  if v_from is null or v_to is null or v_from > v_to or p_billing -> 'snapshot' is null
     or jsonb_typeof(p_billing -> 'snapshot') <> 'object'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Complete usage review and period are required';
  end if;
  if not exists (select 1 from public.equipment_deployments
                 where id = v_deployment and company_id = v_company
                   and deployed_date <= v_to
                   and (withdrawn_date is null or withdrawn_date >= v_from)) then
    raise exception 'Deployment does not belong to this company or period';
  end if;
  if v_contract is not null and not exists (
    select 1 from public.hire_contracts h join public.equipment_deployments d
      on d.id = v_deployment left join public.projects p on p.id = d.project_id
    where h.id = v_contract and h.company_id = v_company
      and h.equipment_id = d.equipment_id and h.client_id = coalesce(d.client_id, p.client_id)
      and (h.project_id is null or h.project_id = d.project_id)
      and h.start_date <= v_to and (h.end_date is null or h.end_date >= v_from)
  ) then
    raise exception 'Contract does not match deployment, client, or period';
  end if;

  perform public.create_invoice_with_items(p_invoice, p_items);
  update public.client_invoices set
    billing_deployment_id = v_deployment,
    billing_contract_id = v_contract,
    billing_period_from = v_from,
    billing_period_to = v_to,
    billing_snapshot = p_billing -> 'snapshot',
    balance_due = greatest(0, coalesce(total_amount, 0) - coalesce(paid_amount, 0)),
    project_id = nullif(p_invoice ->> 'project_id', '')::uuid,
    inv_equipment_id = nullif(p_invoice ->> 'inv_equipment_id', '')::uuid
  where id = (p_invoice ->> 'id')::uuid and company_id = v_company;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'Invoice source could not be saved'; end if;
end;
$$;

revoke all on function public.create_usage_invoice_with_items(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_usage_invoice_with_items(jsonb, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
