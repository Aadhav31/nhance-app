import { Download, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'

export default function InvoicePreviewModal({ inv, lineItems, company, onClose, onDownload }) {
  const isProforma = inv.invoice_type === 'proforma'
  const docTitle = isProforma ? 'Proforma Invoice' : inv.invoice_type === 'non_tax' ? 'Invoice' : 'Tax Invoice'
  const fmtD = d => { if (!d) return ''; try { return format(parseISO(d), 'dd/MM/yyyy') } catch { return d } }
  const fmtAmt = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtQty = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

  const subtotal     = lineItems.reduce((s, l) => s + Number(l.amount || 0), 0)
  const discount     = Number(inv.discount_amount || 0)
  const taxable      = subtotal - discount
  const cgstAmt      = Number(inv.cgst_amount || 0)
  const sgstAmt      = Number(inv.sgst_amount || 0)
  const igstAmt      = Number(inv.igst_amount || 0)
  const total        = Number(inv.total_amount || 0)
  const useIGST      = igstAmt > 0 && !cgstAmt

  const th = 'px-2 py-1.5 text-[10px] font-bold text-slate-500 border border-slate-200 bg-slate-100 text-center'
  const td = 'px-2 py-1.5 text-[10px] text-slate-700 border border-slate-200'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl bg-white rounded-2xl overflow-hidden flex flex-col max-h-[95vh]">

        {/* Top toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary-500 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-sm">{inv.invoice_number}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${isProforma ? 'bg-purple-500/30 text-purple-200' : 'bg-white/20 text-white'}`}>
              {docTitle}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onDownload}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice body — scrollable */}
        <div className="overflow-y-auto flex-1 bg-white">
          <div className="max-w-[794px] mx-auto p-6 font-sans text-slate-900">

            {/* ── Header ── */}
            <div className="border-2 border-slate-800 mb-0">
              {/* Title row */}
              <div className="grid grid-cols-3 border-b-2 border-slate-800">
                <div className="col-span-2 flex items-center justify-center py-3 border-r-2 border-slate-800">
                  <h1 className="text-xl font-black tracking-wide uppercase text-slate-900">
                    {docTitle}
                  </h1>
                </div>
                <div className="flex flex-col items-center justify-center py-3 gap-1">
                  <p className="text-[10px] font-bold text-slate-500">E-Invoice QR Code</p>
                  <div className="w-16 h-16 border border-slate-300 flex items-center justify-center text-center text-[8px] text-slate-400">On PDF</div>
                </div>
              </div>

              {/* IRN block */}
              <div className="grid grid-cols-3 text-[10px] border-b border-slate-400">
                {['IRN :', 'Ack No. :', 'Ack. Date :'].map(label => (
                  <div key={label} className="px-3 py-1 flex gap-2">
                    <span className="font-semibold text-slate-500 whitespace-nowrap">{label}</span>
                    <span className="text-slate-400 italic">N/A</span>
                  </div>
                ))}
              </div>

              {/* Vendor + Invoice meta */}
              <div className="grid grid-cols-2 border-b border-slate-400">
                {/* Vendor */}
                <div className="px-3 py-2 border-r border-slate-400">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Vendor Name and Address (Bill from)</p>
                  <p className="font-bold text-sm text-slate-900">{company?.name || '—'}</p>
                  {company?.address && <p className="text-[10px] text-slate-600 mt-0.5">{company.address}</p>}
                  {company?.gstin && (
                    <p className="text-[10px] text-slate-700 mt-1">
                      <span className="font-semibold">Vendor GST Number:</span> {company.gstin}
                    </p>
                  )}
                </div>
                {/* Invoice meta */}
                <div className="grid grid-cols-2">
                  <div className="px-3 py-2 border-b border-r border-slate-400">
                    <p className="text-[9px] text-slate-500 font-semibold">Invoice No.</p>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">{inv.invoice_number}</p>
                  </div>
                  <div className="px-3 py-2 border-b border-slate-400">
                    <p className="text-[9px] text-slate-500 font-semibold">Invoice Date</p>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">{fmtD(inv.invoice_date)}</p>
                  </div>
                  {inv.work_order_number ? (
                    <>
                      <div className="px-3 py-2 border-b border-r border-slate-400">
                        <p className="text-[9px] text-slate-500 font-semibold">Buyer's Order Number</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5">{inv.work_order_number}</p>
                      </div>
                      <div className="px-3 py-2 border-b border-slate-400">
                        <p className="text-[9px] text-slate-500 font-semibold">Order Date</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5">{fmtD(inv.work_order_date)}</p>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 px-3 py-2 border-b border-slate-400" />
                  )}
                  {(inv.work_done_from || inv.work_done_to) && (
                    <div className="col-span-2 px-3 py-2 border-b border-slate-400">
                      <p className="text-[9px] text-slate-500 font-semibold">Work done Period</p>
                      <p className="text-xs text-slate-800 mt-0.5">
                        From : {fmtD(inv.work_done_from)} &nbsp;&nbsp; To : {fmtD(inv.work_done_to)}
                      </p>
                    </div>
                  )}
                  {inv.nature_of_supply && (
                    <div className="col-span-2 px-3 py-2">
                      <p className="text-[9px] text-slate-500 font-semibold">Nature of Service</p>
                      <p className="text-xs text-slate-800 mt-0.5">{inv.nature_of_supply}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Buyer + Place of supply */}
              <div className="grid grid-cols-2 border-b border-slate-400">
                <div className="px-3 py-2 border-r border-slate-400">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Buyer (Bill to)</p>
                  <p className="font-bold text-sm text-slate-900">{inv.client_name || '—'}</p>
                  {inv.client_address && <p className="text-[10px] text-slate-600 mt-0.5">{inv.client_address}</p>}
                  {inv.client_gstin && (
                    <p className="text-[10px] text-slate-700 mt-1">
                      <span className="font-semibold">Buyer GST Number :</span> {inv.client_gstin}
                    </p>
                  )}
                </div>
                {inv.place_of_supply && (
                  <div className="px-3 py-2">
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Place of Supply with Address</p>
                    <p className="text-[11px] text-slate-800">{inv.place_of_supply}</p>
                    {inv.place_of_supply_address && <p className="text-[10px] text-slate-600 mt-0.5">{inv.place_of_supply_address}</p>}
                  </div>
                )}
              </div>

              {/* Line items table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr>
                      <th className={th}>Sl No.</th>
                      <th className={th}>Item Code</th>
                      <th className={`${th} text-left`} style={{minWidth:'160px'}}>Description</th>
                      <th className={th}>SAC</th>
                      <th className={th}>GST Rate</th>
                      <th className={th}>UOM</th>
                      <th className={th}>Quantity</th>
                      <th className={th}>Basic Rate</th>
                      <th className={th}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((l, i) => (
                      <tr key={l.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className={`${td} text-center`}>{i + 1}</td>
                        <td className={`${td} text-center`}>{l.item_code || ''}</td>
                        <td className={`${td}`}>{l.description}</td>
                        <td className={`${td} text-center`}>{l.sac_hsn_code || ''}</td>
                        <td className={`${td} text-center`}>{l.gst_rate != null ? `${l.gst_rate}%` : ''}</td>
                        <td className={`${td} text-center`}>{l.unit || ''}</td>
                        <td className={`${td} text-right`}>{fmtQty(l.quantity)}</td>
                        <td className={`${td} text-right`}>{fmtQty(l.rate)}</td>
                        <td className={`${td} text-right font-semibold`}>{fmtAmt(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end border-t border-slate-400">
                <div className="w-72">
                  {[
                    { label: 'Subtotal', value: fmtAmt(subtotal) },
                    discount > 0 && { label: 'Discount', value: `– ${fmtAmt(discount)}` },
                    (discount > 0) && { label: 'Taxable Amount', value: fmtAmt(taxable) },
                    !useIGST && cgstAmt > 0 && { label: `CGST @ ${inv.cgst_rate || 0}%`, value: fmtAmt(cgstAmt) },
                    !useIGST && sgstAmt > 0 && { label: `SGST @ ${inv.sgst_rate || 0}%`, value: fmtAmt(sgstAmt) },
                    useIGST && igstAmt > 0 && { label: `IGST @ ${inv.igst_rate || 0}%`, value: fmtAmt(igstAmt) },
                  ].filter(Boolean).map(({ label, value }) => (
                    <div key={label} className="flex justify-between px-3 py-1 border-b border-slate-300 text-[11px]">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-semibold text-slate-800">₹ {value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-3 py-2 bg-primary-500 text-white">
                    <span className="text-xs font-bold">TOTAL</span>
                    <span className="text-sm font-black">₹ {fmtAmt(total)}</span>
                  </div>
                </div>
              </div>

              {/* Notes / Terms */}
              {(inv.notes || inv.terms) && (
                <div className="grid grid-cols-2 border-t border-slate-400 text-[10px]">
                  {inv.notes && (
                    <div className="px-3 py-2 border-r border-slate-400">
                      <p className="font-bold text-slate-500 mb-1">Notes</p>
                      <p className="text-slate-700">{inv.notes}</p>
                    </div>
                  )}
                  {inv.terms && (
                    <div className="px-3 py-2">
                      <p className="font-bold text-slate-500 mb-1">Terms & Conditions</p>
                      <p className="text-slate-700">{inv.terms}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="px-3 py-2 border-t border-slate-400 text-center text-[9px] text-slate-400">
                This is a computer-generated document.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
