// supabase/functions/delete-company/index.ts
// Hard-deletes a company and all its related data.
// Only callable by the Nhance superadmin.
// Deploy: supabase functions deploy delete-company

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ── Verify caller is authenticated ─────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !caller) throw new Error('Unauthorized')

    // ── Only Nhance superadmin can delete companies ─────────────────────────────
    const nhanceAdminEmail = Deno.env.get('NHANCE_ADMIN_EMAIL') || ''
    if (caller.email !== nhanceAdminEmail) {
      throw new Error('Only Nhance superadmin can delete companies')
    }

    const { company_id } = await req.json()
    if (!company_id) throw new Error('company_id is required')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Helper: silent delete (ignore if table doesn't exist) ─────────────────
    const del = (table: string) =>
      admin.from(table).delete().eq('company_id', company_id).then(() => {})

    // ── Delete in dependency order (children before parents) ──────────────────

    // 1. Sales — line items first
    const { data: invoices } = await admin.from('client_invoices').select('id').eq('company_id', company_id)
    if (invoices?.length) await admin.from('invoice_line_items').delete().in('invoice_id', invoices.map((i:any)=>i.id))

    const { data: quotes } = await admin.from('quotes').select('id').eq('company_id', company_id)
    if (quotes?.length) await admin.from('quote_line_items').delete().in('quote_id', quotes.map((i:any)=>i.id))

    const { data: sos } = await admin.from('sales_orders').select('id').eq('company_id', company_id)
    if (sos?.length) await admin.from('so_line_items').delete().in('so_id', sos.map((i:any)=>i.id))

    const { data: dcs } = await admin.from('delivery_challans').select('id').eq('company_id', company_id)
    if (dcs?.length) await admin.from('dc_line_items').delete().in('dc_id', dcs.map((i:any)=>i.id))

    const { data: cns } = await admin.from('credit_notes').select('id').eq('company_id', company_id)
    if (cns?.length) await admin.from('cn_line_items').delete().in('cn_id', cns.map((i:any)=>i.id))

    // 2. Purchase — line items first
    const { data: bills } = await admin.from('bills').select('id').eq('company_id', company_id)
    if (bills?.length) {
      await admin.from('bill_line_items').delete().in('bill_id', bills.map((i:any)=>i.id))
      await admin.from('stock_transactions').delete().in('bill_id', bills.map((i:any)=>i.id))
    }

    const { data: pos } = await admin.from('purchase_orders').select('id').eq('company_id', company_id)
    if (pos?.length) await admin.from('po_line_items').delete().in('po_id', pos.map((i:any)=>i.id))

    // 3. Payment records
    await del('payments_received')
    await del('payments_made')
    await del('payment_links')
    await del('vendor_credits')

    // 4. Parent sales/purchase docs
    await del('client_invoices')
    await del('quotes')
    await del('sales_orders')
    await del('delivery_challans')
    await del('credit_notes')
    await del('bills')
    await del('purchase_orders')

    // 5. Vendors
    await del('vendors')

    // 6. Stock
    await del('stock_transactions')
    await del('inventory_issues')
    await del('inventory_items')

    // 7. Shifts
    const { data: shifts } = await admin.from('shifts').select('id').eq('company_id', company_id)
    if (shifts?.length) {
      await admin.from('shift_fuel_entries').delete().in('shift_id', shifts.map((s:any)=>s.id))
      await admin.from('shift_incidents').delete().in('shift_id', shifts.map((s:any)=>s.id))
    }
    await del('shifts')

    // 8. Expenses
    await del('expenses')

    // 9. Projects + Clients
    await del('projects')
    await del('clients')

    // 10. Equipment
    const { data: equipment } = await admin.from('equipment').select('id').eq('company_id', company_id)
    if (equipment?.length) {
      const eqIds = equipment.map((e:any)=>e.id)
      await admin.from('equipment_documents').delete().in('equipment_id', eqIds)
      await admin.from('equipment_attachments').delete().in('equipment_id', eqIds)
      await admin.from('operator_assignments').delete().in('equipment_id', eqIds)
    }
    await del('shift_log_entries')
    await del('equipment_shifts')
    await del('equipment_schedule')
    await del('maintenance_records')
    await del('equipment')

    // 11. HR
    await del('attendance_records')
    await del('leave_requests')
    await del('salary_records')
    await del('hr_employees')

    // 12. Users
    await admin.from('user_roles').delete().eq('company_id', company_id)
    await admin.from('user_profiles').delete().eq('company_id', company_id)

    // 13. Company modules
    await admin.from('company_modules').delete().eq('company_id', company_id)

    // 14. Finally the company itself
    const { error: companyErr } = await admin.from('companies').delete().eq('id', company_id)
    if (companyErr) throw companyErr

    console.log(`✅ Company ${company_id} deleted by ${caller.email}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Company permanently deleted' }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('delete-company error:', e)
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
