/**
 * letterheadPDF.js — Official company letter generator
 *
 * Layout:
 *  ┌═══════════════════════════════════════════════════╗  ← full-page double green border
 *  ║  Company name (bold centered)                  [QR] ║
 *  ║  Address (bold centered)                           ║
 *  ║  CIN: ...                          GSTIN: ...      ║
 *  ║  E-mail: ...                       Mobile: ...     ║
 *  ╠═══════════════════════════════════════════════════╣  ← header divider
 *  ║                                                    ║
 *  ║  LETTER TYPE TITLE (centered, bold)                ║
 *  ║                                                    ║
 *  ║  Ref: ...                           Date: ...      ║
 *  ║  To, / [hidden for exp cert]                       ║
 *  ║  Sub: ...                                          ║
 *  ║                                                    ║
 *  ║  Body text...                                      ║
 *  ║                                                    ║
 *  ║  Yours faithfully,                                 ║
 *  ║  For COMPANY NAME                                  ║
 *  ║                                                    ║
 *  ║  Signatory Name                                    ║
 *  ║  Designation                                       ║
 *  ╠═══════════════════════════════════════════════════╣  ← footer divider
 *  ║  COMPANY NAME (small centered)                     ║
 *  ╚═══════════════════════════════════════════════════╝
 */

import jsPDF from 'jspdf'
import QRCode from 'qrcode'

// ── Colours ───────────────────────────────────────────────────────────────────
const GREEN     = [26, 92, 42]
const BLACK     = [15, 15, 15]
const DARK_GREY = [60, 60, 60]

// ── Page constants (A4) ───────────────────────────────────────────────────────
const W        = 210
const ML       = 12
const MR       = 12
const MT       = 8
const IW       = W - ML - MR   // 186mm inner width
const HEADER_H = 52             // header block height
const BORDER_H = 279            // full-page border height: MT+BORDER_H = 287mm

// ── Date formatter ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Draw the full-page double border (call once per page) ─────────────────────
function drawPageBorder(pdf) {
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(1.2)
  pdf.rect(ML, MT, IW, BORDER_H)              // outer thick border
  pdf.setLineWidth(0.4)
  pdf.rect(ML + 2, MT + 2, IW - 4, BORDER_H - 4)  // inner thin border
}

// ── QR stamp (async) ──────────────────────────────────────────────────────────
async function stampQR(pdf, verifyUrl) {
  if (!verifyUrl) return
  try {
    const dataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 150, margin: 1, errorCorrectionLevel: 'M',
    })
    if (!dataUrl) return
    // Top-right corner inside header border
    const qx = ML + IW - 4 - 21
    const qy = MT + 4
    pdf.addImage(dataUrl, 'PNG', qx, qy, 20, 20)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(5.5)
    pdf.setTextColor(...DARK_GREY)
    pdf.text('Scan to verify', qx + 10, qy + 22, { align: 'center' })
  } catch { /* silently skip — PDF saves without QR */ }
}

// ── Draw header content (company info + divider) ──────────────────────────────
async function drawHeader(pdf, company, verifyUrl) {
  let y = MT + 7

  // Company name — leave right 44mm free for QR
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(...GREEN)
  const coName = (company?.name || 'Your Company').toUpperCase()
  const nameLines = pdf.splitTextToSize(coName, IW - 48)
  nameLines.forEach(line => {
    pdf.text(line, W / 2, y, { align: 'center' })
    y += 6
  })

  // Address
  if (company?.address) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(...BLACK)
    const addrLines = pdf.splitTextToSize(company.address.toUpperCase(), IW - 48)
    addrLines.forEach(line => {
      pdf.text(line, W / 2, y, { align: 'center' })
      y += 4.5
    })
    y += 1
  }

  // CIN / GSTIN row
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...DARK_GREY)
  const cinText   = company?.cin   ? `CIN: ${company.cin}`     : null
  const gstinText = company?.gstin ? `GSTIN: ${company.gstin}` : null
  if (cinText && gstinText) {
    pdf.text(cinText,   ML + 4, y)
    pdf.text(gstinText, W - MR - 4, y, { align: 'right' })
    y += 4.5
  } else if (gstinText || cinText) {
    pdf.text(gstinText || cinText, W / 2, y, { align: 'center' })
    y += 4.5
  }

  // Email / Mobile row
  const emailText = company?.contact_email ? `E-mail: ${company.contact_email}` : null
  const phoneText = company?.contact_phone ? `Mobile: ${company.contact_phone}` : null
  if (emailText && phoneText) {
    pdf.text(emailText, ML + 4, y)
    pdf.text(phoneText, W - MR - 4, y, { align: 'right' })
  } else if (emailText || phoneText) {
    pdf.text(emailText || phoneText, W / 2, y, { align: 'center' })
  }

  // QR code in header top-right
  await stampQR(pdf, verifyUrl)

  // Horizontal divider below header
  const divY = MT + HEADER_H
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.8)
  pdf.line(ML + 2, divY, ML + IW - 2, divY)

  return divY + 5  // y position for content to start
}

// ── Letter types that hide the To/Address block ───────────────────────────────
export const HIDE_TO_BLOCK = new Set(['Experience Certificate'])

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * @param {Object} company     — from AuthContext
 * @param {Object} letterData  — { letterType, refNumber, date, toName, toAddress,
 *                                 subject, body, signatoryName, signatoryDesignation }
 * @param {string|null} verifyUrl — QR verification URL from createVerification()
 */
export async function generateLetterPDF(company, letterData = {}, verifyUrl = null) {
  const {
    letterType            = 'Letter',
    refNumber             = '',
    date                  = new Date().toISOString().slice(0, 10),
    toName                = '',
    toAddress             = '',
    subject               = '',
    body                  = '',
    signatoryName         = '',
    signatoryDesignation  = '',
  } = letterData

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  // ── Page 1: border + header ───────────────────────────────────────────────
  drawPageBorder(pdf)
  let y = await drawHeader(pdf, company, verifyUrl)

  // ── Letter type title (no underline) ──────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(...BLACK)
  pdf.text(letterType.toUpperCase(), W / 2, y, { align: 'center' })
  y += 9

  // ── Ref / Date ────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...DARK_GREY)
  if (refNumber) pdf.text(`Ref: ${refNumber}`, ML + 4, y)
  pdf.text(`Date: ${fmtDate(date)}`, W - MR - 4, y, { align: 'right' })
  y += 7

  // ── To block (hidden for certain letter types) ────────────────────────────
  if (!HIDE_TO_BLOCK.has(letterType) && (toName || toAddress)) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9.5)
    pdf.setTextColor(...BLACK)
    pdf.text('To,', ML + 4, y)
    y += 5

    if (toName) {
      pdf.setFont('helvetica', 'bold')
      const nl = pdf.splitTextToSize(toName, IW - 8)
      nl.forEach(line => { pdf.text(line, ML + 4, y); y += 5 })
      pdf.setFont('helvetica', 'normal')
    }
    if (toAddress) {
      pdf.setFontSize(9)
      pdf.setTextColor(...DARK_GREY)
      const al = pdf.splitTextToSize(toAddress, IW - 8)
      al.forEach(line => { pdf.text(line, ML + 4, y); y += 4.5 })
      pdf.setTextColor(...BLACK)
    }
    y += 4
  }

  // ── Subject (no underline below) ──────────────────────────────────────────
  if (subject) {
    pdf.setFontSize(9.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...BLACK)
    const subLabel = 'Sub: '
    const subLabelW = pdf.getTextWidth(subLabel)
    pdf.text(subLabel, ML + 4, y)
    pdf.setFont('helvetica', 'bold')
    const subLines = pdf.splitTextToSize(subject, IW - 8 - subLabelW)
    subLines.forEach((line, i) => {
      pdf.text(line, ML + 4 + (i === 0 ? subLabelW : 0), y + i * 5)
    })
    y += subLines.length * 5 + 6
    pdf.setFont('helvetica', 'normal')
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  const LINE_H        = 5.5
  const BOTTOM_MARGIN = 60   // space at bottom for signatory + footer
  const PAGE_H        = 297

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(...BLACK)

  function addLine(text) {
    if (y + LINE_H > PAGE_H - BOTTOM_MARGIN) {
      pdf.addPage()
      drawPageBorder(pdf)
      y = MT + HEADER_H + 10
    }
    pdf.text(text, ML + 4, y)
    y += LINE_H
  }

  body.split('\n').forEach((para, pi, arr) => {
    if (para.trim() === '') { y += LINE_H * 0.5; return }
    pdf.splitTextToSize(para, IW - 8).forEach(line => addLine(line))
    if (pi < arr.length - 1) y += 1.5
  })

  y += 8

  // ── Signatory ─────────────────────────────────────────────────────────────
  if (y + 35 > PAGE_H - BOTTOM_MARGIN + 25) {
    pdf.addPage()
    drawPageBorder(pdf)
    y = MT + HEADER_H + 10
  }

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(...BLACK)
  pdf.text('Yours faithfully,', ML + 4, y)
  y += 5
  pdf.text(`For ${(company?.name || '').toUpperCase()}`, ML + 4, y)
  y += 14  // signature gap

  pdf.setFont('helvetica', 'bold')
  pdf.text(signatoryName || '_________________________', ML + 4, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...DARK_GREY)
  if (signatoryDesignation) pdf.text(signatoryDesignation, ML + 4, y)

  // ── Footer (inside border) ─────────────────────────────────────────────────
  const footDivY = MT + BORDER_H - 8   // footer divider line y
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.5)
  pdf.line(ML + 2, footDivY, ML + IW - 2, footDivY)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(...GREEN)
  pdf.text((company?.name || '').toUpperCase(), W / 2, footDivY + 4, { align: 'center' })

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeType = letterType.replace(/[^a-zA-Z0-9]/g, '_')
  pdf.save(`${safeType}_${date.slice(0, 10)}.pdf`)
}
