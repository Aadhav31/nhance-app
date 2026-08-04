/**
 * transferCertificatePDF.js — Equipment Transfer Certificate generator
 *
 * Layout (A4, 210 × 297 mm):
 *  ╔══════════════════════════════════════════════════╗
 *  ║  [Company Letterhead — same as letterheadPDF]    ║
 *  ╠══════════════════════════════════════════════════╣
 *  ║        EQUIPMENT TRANSFER CERTIFICATE            ║
 *  ║  TC No: TC-2026-001          Date: 04 Aug 2026   ║
 *  ╠══════════════════════════════════════════════════╣
 *  ║  ◼ MACHINE DETAILS                               ║
 *  ║  Equipment Name | Type | Reg No | Meter Reading  ║
 *  ╠══════════════════════════════════════════════════╣
 *  ║  ◼ TRANSFER DETAILS                              ║
 *  ║  From Project   | To Project | Transfer Date     ║
 *  ║  Fuel Level     | Condition  | Notes             ║
 *  ╠══════════════════════════════════════════════════╣
 *  ║  OUTGOING INCHARGE     |  INCOMING INCHARGE      ║
 *  ║  _________________     |  ___________________    ║
 *  ║  Name / Designation    |  Name / Designation     ║
 *  ╠══════════════════════════════════════════════════╣
 *  ║  Authorized by: _____________   [Seal]           ║
 *  ╚══════════════════════════════════════════════════╝
 */

import jsPDF from 'jspdf'

// ── Colours ───────────────────────────────────────────────────────────────────
const GREEN      = [26, 92, 42]
const BLACK      = [15, 15, 15]
const DARK_GREY  = [60, 60, 60]
const LIGHT_GREY = [120, 120, 120]
const BG_LIGHT   = [245, 248, 245]   // section header fill

// ── Page constants ────────────────────────────────────────────────────────────
const W       = 210
const ML      = 12
const MR      = 12
const MT      = 8
const IW      = W - ML - MR          // 186 mm
const BORDER_H = 279

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

function drawBorder(pdf) {
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(1.2)
  pdf.rect(ML, MT, IW, BORDER_H)
  pdf.setLineWidth(0.4)
  pdf.rect(ML + 2, MT + 2, IW - 4, BORDER_H - 4)
}

function hLine(pdf, y) {
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.5)
  pdf.line(ML + 2, y, ML + IW - 2, y)
}

// ── Company header (reused from letterheadPDF style) ──────────────────────────
function drawHeader(pdf, company) {
  let y = MT + 7

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(...GREEN)
  const coName = (company?.name || 'Your Company').toUpperCase()
  pdf.splitTextToSize(coName, IW - 8).forEach(line => { pdf.text(line, W / 2, y, { align: 'center' }); y += 6 })

  if (company?.address) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(...BLACK)
    pdf.splitTextToSize(company.address.toUpperCase(), IW - 8).forEach(line => { pdf.text(line, W / 2, y, { align: 'center' }); y += 4.5 })
    y += 1
  }

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...DARK_GREY)
  const cinText   = company?.cin   ? `CIN: ${company.cin}`     : null
  const gstinText = company?.gstin ? `GSTIN: ${company.gstin}` : null
  if (cinText || gstinText) {
    if (cinText && gstinText) {
      pdf.text(cinText, ML + 4, y)
      pdf.text(gstinText, W - MR - 4, y, { align: 'right' })
    } else {
      pdf.text(gstinText || cinText, W / 2, y, { align: 'center' })
    }
    y += 4.5
  }

  const emailText = company?.contact_email ? `E-mail: ${company.contact_email}` : null
  const phoneText = company?.contact_phone ? `Mobile: ${company.contact_phone}` : null
  if (emailText || phoneText) {
    if (emailText && phoneText) {
      const halfW = (IW - 12) / 2
      pdf.text(pdf.splitTextToSize(emailText, halfW)[0], ML + 4, y)
      pdf.text(phoneText, W - MR - 4, y, { align: 'right' })
    } else {
      pdf.text(emailText || phoneText, W / 2, y, { align: 'center' })
    }
    y += 4.5
  }

  const divY = y + 2
  hLine(pdf, divY)
  return divY
}

// ── Section header band ───────────────────────────────────────────────────────
function sectionHeader(pdf, y, title) {
  pdf.setFillColor(...BG_LIGHT)
  pdf.rect(ML + 2, y, IW - 4, 6.5, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(...GREEN)
  pdf.text(title, ML + 5, y + 4.5)
  return y + 6.5
}

// ── Key–value row ─────────────────────────────────────────────────────────────
function kvRow(pdf, y, label, value, labelW = 55) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  pdf.setTextColor(...DARK_GREY)
  pdf.text(label, ML + 5, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(...BLACK)
  const valueLines = pdf.splitTextToSize(value || '—', IW - labelW - 10)
  valueLines.forEach((line, i) => pdf.text(line, ML + 5 + labelW, y + i * 4.5))
  return y + Math.max(1, valueLines.length) * 4.5 + 1
}

// ── Two-column layout helper ──────────────────────────────────────────────────
function twoCol(pdf, y, items) {
  // items: [{label, value}, {label, value}] — left and right
  const colW = (IW - 14) / 2
  const [left, right] = items
  if (left) {
    pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...DARK_GREY)
    pdf.text(left.label, ML + 5, y)
    pdf.setFont('helvetica', 'normal').setTextColor(...BLACK)
    pdf.text(String(left.value || '—'), ML + 5, y + 4.5)
  }
  if (right) {
    const rx = ML + 5 + colW + 4
    pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...DARK_GREY)
    pdf.text(right.label, rx, y)
    pdf.setFont('helvetica', 'normal').setTextColor(...BLACK)
    pdf.text(String(right.value || '—'), rx, y + 4.5)
  }
  return y + 10
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * @param {object} company - { name, address, cin, gstin, contact_email, contact_phone }
 * @param {object} tc - transfer certificate data
 *   tc.tcNumber       - TC reference number
 *   tc.tcDate         - date of transfer
 *   tc.equipmentName  - equipment name + number
 *   tc.equipmentType  - category/type
 *   tc.registrationNo - reg/serial number
 *   tc.meterReading   - meter reading at transfer
 *   tc.meterUnit      - 'hrs' | 'km' | 'km/hrs'
 *   tc.fromProject    - project/site left
 *   tc.fromIncharge   - outgoing incharge name
 *   tc.fromDesig      - outgoing incharge designation
 *   tc.toProject      - project/site entering
 *   tc.toIncharge     - incoming incharge name
 *   tc.toDesig        - incoming incharge designation
 *   tc.fuelLevel      - e.g. '3/4 tank', '60%'
 *   tc.condition      - 'Good' | 'Fair' | 'Damaged'
 *   tc.conditionNotes - description
 *   tc.authorizedBy   - authorized signatory name
 * @returns {Blob} PDF blob
 */
export async function generateTransferCertificate(company, tc = {}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  drawBorder(pdf)

  // ── Header ────────────────────────────────────────────────────────────────
  let y = await drawHeader(pdf, company)
  y += 4

  // ── Title ─────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(...GREEN)
  pdf.text('EQUIPMENT TRANSFER CERTIFICATE', W / 2, y + 6, { align: 'center' })
  y += 12

  // TC No + Date row
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(...DARK_GREY)
  pdf.text(`TC No: ${tc.tcNumber || 'TC-____-____'}`, ML + 5, y)
  pdf.text(`Date: ${fmtDate(tc.tcDate)}`, W - MR - 5, y, { align: 'right' })
  y += 8

  hLine(pdf, y); y += 4

  // ── Machine Details ────────────────────────────────────────────────────────
  y = sectionHeader(pdf, y, '  MACHINE DETAILS')
  y += 3
  y = kvRow(pdf, y, 'Equipment Name', tc.equipmentName)
  y = twoCol(pdf, y, [
    { label: 'Equipment Type / Category', value: tc.equipmentType },
    { label: 'Reg. / Serial No.',         value: tc.registrationNo || tc.serialNo },
  ])
  y = twoCol(pdf, y, [
    { label: `Meter Reading (${tc.meterUnit || 'hrs'})`, value: tc.meterReading ? `${tc.meterReading} ${tc.meterUnit || 'hrs'}` : '—' },
    { label: 'Transfer Date',             value: fmtDate(tc.tcDate) },
  ])
  y += 2

  hLine(pdf, y); y += 4

  // ── Transfer Details ───────────────────────────────────────────────────────
  y = sectionHeader(pdf, y, '  TRANSFER DETAILS')
  y += 3
  y = twoCol(pdf, y, [
    { label: 'FROM Project / Site',  value: tc.fromProject },
    { label: 'TO Project / Site',    value: tc.toProject   },
  ])
  y = twoCol(pdf, y, [
    { label: 'Fuel Level at Transfer', value: tc.fuelLevel || '—' },
    { label: 'Machine Condition',      value: tc.condition  || '—' },
  ])
  if (tc.conditionNotes) {
    y = kvRow(pdf, y, 'Condition Notes', tc.conditionNotes, 45)
  }
  y += 2

  // Condition checklist boxes
  const condItems = ['Engine & Drivetrain — OK', 'Hydraulics — OK', 'Electrical & Lights — OK', 'Attachments — OK', 'Tyres / Undercarriage — OK', 'Body & Structure — OK']
  pdf.setFontSize(7.5)
  pdf.setTextColor(...DARK_GREY)
  pdf.setFont('helvetica', 'normal')
  const colW2 = (IW - 14) / 2
  condItems.forEach((item, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const cx  = ML + 5 + col * (colW2 + 4)
    const cy  = y + row * 5.5
    pdf.rect(cx, cy - 3.5, 3.5, 3.5)          // checkbox
    pdf.text(item, cx + 5, cy - 0.5)
  })
  y += Math.ceil(condItems.length / 2) * 5.5 + 4

  hLine(pdf, y); y += 4

  // ── Remarks ────────────────────────────────────────────────────────────────
  if (tc.remarks) {
    y = sectionHeader(pdf, y, '  REMARKS')
    y += 3
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(...BLACK)
    pdf.splitTextToSize(tc.remarks, IW - 10).forEach(line => { pdf.text(line, ML + 5, y); y += 4.5 })
    y += 4
    hLine(pdf, y); y += 4
  }

  // ── Signature blocks ───────────────────────────────────────────────────────
  y = sectionHeader(pdf, y, '  SIGNATURES')
  y += 6

  const sigColW = (IW - 20) / 2
  const sigSpacing = 10

  // Left sig block — Outgoing
  const lx = ML + 5
  const rx = ML + 5 + sigColW + sigSpacing

  // Signature lines
  pdf.setDrawColor(...LIGHT_GREY)
  pdf.setLineWidth(0.3)
  pdf.line(lx, y + 14, lx + sigColW, y + 14)
  pdf.line(rx, y + 14, rx + sigColW, y + 14)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(...DARK_GREY)
  pdf.text('OUTGOING INCHARGE', lx, y)
  pdf.text('INCOMING INCHARGE', rx, y)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...BLACK)
  if (tc.fromIncharge) {
    pdf.text(tc.fromIncharge, lx, y + 18)
    pdf.setFontSize(7).setTextColor(...DARK_GREY)
    pdf.text(tc.fromDesig || '', lx, y + 22)
  }
  if (tc.toIncharge) {
    pdf.setFontSize(8).setTextColor(...BLACK)
    pdf.text(tc.toIncharge, rx, y + 18)
    pdf.setFontSize(7).setTextColor(...DARK_GREY)
    pdf.text(tc.toDesig || '', rx, y + 22)
  }

  y += 30
  hLine(pdf, y); y += 5

  // ── Authorized by ──────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(...DARK_GREY)
  pdf.text('AUTHORIZED BY:', ML + 5, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(...BLACK)
  if (tc.authorizedBy) pdf.text(tc.authorizedBy, ML + 45, y)

  // Seal box
  pdf.setDrawColor(...LIGHT_GREY)
  pdf.setLineWidth(0.3)
  pdf.rect(W - MR - 5 - 32, y - 4, 32, 20)
  pdf.setFontSize(7).setTextColor(...LIGHT_GREY)
  pdf.text('Seal / Stamp', W - MR - 5 - 16, y + 8, { align: 'center' })

  y += 24

  // Authorized signatory line
  pdf.setDrawColor(...LIGHT_GREY)
  pdf.setLineWidth(0.3)
  pdf.line(ML + 5, y, ML + 5 + 60, y)
  pdf.setFontSize(7).setTextColor(...DARK_GREY)
  pdf.text('Signature & Designation', ML + 5, y + 4)

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = MT + BORDER_H - 4
  hLine(pdf, footerY - 5)
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(7)
  pdf.setTextColor(...LIGHT_GREY)
  pdf.text(
    `${(company?.name || '').toUpperCase()} · Equipment Transfer Certificate · ${fmtDate(tc.tcDate)}`,
    W / 2, footerY, { align: 'center' }
  )

  return pdf.output('blob')
}

// ── Generate blob URL for immediate download ──────────────────────────────────
export async function downloadTransferCertificate(company, tc) {
  const blob = await generateTransferCertificate(company, tc)
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `TC-${tc.tcNumber || 'transfer'}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
