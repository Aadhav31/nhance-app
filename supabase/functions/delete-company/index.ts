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

    // ── Delete in dependency order ─────────────────────────────────────────────
    // 1. Invoice line items (depend on client_invoices)
    const { data: invoices } = await admin
      .from('client_invoices')
      .select('id')
      .eq('company_id', company_id)

    if (invoices && invoices.length > 0) {
      const invoiceIds = invoices.map((i: any) => i.id)
      await admin.from('invoice_line_items').delete().in('invoice_id', invoiceIds)
    }

    // 2. Payment links (if table exists)
    await admin.from('payment_links').delete().eq('company_id', company_id).then(() => {})

    // 3. Invoices
    await admin.from('client_invoices').delete().eq('company_id', company_id)

    // 4. Expenses
    await admin.from('expenses').delete().eq('company_id', company_id)

    // 5. Projects (depends on clients)
    await admin.from('projects').delete().eq('company_id', company_id)

    // 6. Clients
    await admin.from('clients').delete().eq('company_id', company_id)

    // 7. Equipment documents + attachments
    const { data: equipment } = await admin
      .from('equipment')
      .select('id')
      .eq('company_id', company_id)

    if (equipment && equipment.length > 0) {
      const eqIds = equipment.map((e: any) => e.id)
      await admin.from('equipment_documents').delete().in('equipment_id', eqIds)
      await admin.from('equipment_attachments').delete().in('equipment_id', eqIds)
    }

    // 8. Shift log entries (depends on equipment_shifts)
    await admin.from('shift_log_entries').delete().eq('company_id', company_id).then(() => {})
    await admin.from('equipment_shifts').delete().eq('company_id', company_id).then(() => {})
    await admin.from('equipment_schedule').delete().eq('company_id', company_id).then(() => {})

    // 9. Maintenance records
    await admin.from('maintenance_records').delete().eq('company_id', company_id).then(() => {})

    // 10. Inventory
    await admin.from('inventory_issues').delete().eq('company_id', company_id).then(() => {})
    await admin.from('inventory_items').delete().eq('company_id', company_id).then(() => {})

    // 11. Equipment
    await admin.from('equipment').delete().eq('company_id', company_id)

    // 12. HR employees
    await admin.from('hr_employees').delete().eq('company_id', company_id)

    // 13. User roles + profiles
    await admin.from('user_roles').delete().eq('company_id', company_id)
    await admin.from('user_profiles').delete().eq('company_id', company_id)

    // 14. Company modules
    await admin.from('company_modules').delete().eq('company_id', company_id)

    // 15. Finally, delete the company itself
    const { error: companyErr } = await admin
      .from('companies')
      .delete()
      .eq('id', company_id)

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
