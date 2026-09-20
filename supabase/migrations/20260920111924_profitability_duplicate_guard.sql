-- Return the tenant-scoped ledger while suppressing purchase expenses that are
-- already represented by a vendor bill with the same vendor, date, machine and amount.
-- Ambiguous same-amount records from different vendors remain visible.

create or replace function public.get_profitability_ledger(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns setof public.profitability_ledger
language sql
stable
security invoker
set search_path = public
as $$
  select ledger.*
  from public.profitability_ledger ledger
  where ledger.company_id = p_company_id
    and ledger.entry_date between p_from and p_to
    and not (
      ledger.source_type = 'expense'
      and exists (
        select 1
        from public.profitability_ledger bill
        where bill.company_id = ledger.company_id
          and bill.source_type = 'bill'
          and bill.entry_date = ledger.entry_date
          and bill.equipment_id is not distinct from ledger.equipment_id
          and abs(bill.amount - ledger.amount) < 0.01
          and nullif(regexp_replace(lower(coalesce(bill.metadata ->> 'vendor_name', '')), '[^a-z0-9]+', '', 'g'), '')
              = nullif(regexp_replace(lower(coalesce(ledger.metadata ->> 'vendor_name', '')), '[^a-z0-9]+', '', 'g'), '')
      )
    )
  order by ledger.entry_date desc, ledger.id;
$$;

comment on function public.get_profitability_ledger(uuid, date, date) is
  'Tenant-scoped profitability evidence with deterministic linked and exact-match duplicate suppression.';

revoke all on function public.get_profitability_ledger(uuid, date, date) from public;
revoke all on function public.get_profitability_ledger(uuid, date, date) from anon;
grant execute on function public.get_profitability_ledger(uuid, date, date) to authenticated;
