/**
 * letterheadPDF.js — Official company letter generator
 *
 * Page layout:
 *  ╔════════════════════════════════════════════════════╗  ← full-page double green border
 *  ║  SRA MINING AND CONSTRUCTIONS (OPC) PVT LTD       ║
 *  ║  71/3, VENKATESAPURAM COLONY, PERAMBALUR 621212   ║
 *  ║  CIN: U14200TN2023OPC157908    GSTIN: 33ABKCS...  ║
 *  ║  E-mail: aadhav_kannan@yahoo.in   Mobile: +91-... ║
 *  ╠════════════════════════════════════════════════════╣  ← dynamic divider (no wasted space)
 *  ║                                                [QR]║
 *  ║         EXPERIENCE CERTIFICATE                    ║
 *  ║                                                    ║
 *  ║  Ref: SRA/HR/001/2026             Date: 11 Jul 26 ║
 *  ║  ...                                               ║
 *  ║  Yours faithfully,                                 ║
 *  ║  For SRA MINING AND CONSTRUCTIONS...               ║
 *  ║                                                    ║
 *  ║  Signatory Name                                    ║
 *  ║  Designation                                       ║
 *  ╠════════════════════════════════════════════════════╣
 *  ║          SRA MINING AND CONSTRUCTIONS...           ║
 *  ╚════════════════════════════════════════════════════╝
 */

import jsPDF from 'jspdf'
import QRCode from 'qrcode'

// ── Colours ───────────────────────────────────────────────────────────────────
const GREEN     = [26, 92, 42]
const BLACK     = [15, 15, 15]
const DARK_GREY = [60, 60, 60]

// ── Page constants (A4 = 210 × 297 mm) ───────────────────────────────────────
const W        = 210
const ML       = 12
const MR       = 12
const MT       = 8
const IW       = W - ML - MR     // 186 mm
const BORDER_H = 279              // full-page border height (ends at y = 287)
const CONT_Y   = MT + 18          // content start y on continuation pages (no header)

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Full-page double border ───────────────────────────────────────────────────
function drawPageBorder(pdf) {
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(1.2)
  pdf.rect(ML, MT, IW, BORDER_H)
  pdf.setLineWidth(0.4)
  pdf.rect(ML + 2, MT + 2, IW - 4, BORDER_H - 4)
}

// ── QR stamp ─────────────────────────────────────────────────────────────────
async function stampQR(pdf, verifyUrl, qx, qy, size) {
  if (!verifyUrl) return
  try {
    const dataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 130, margin: 1, errorCorrectionLevel: 'M',
    })
    if (!dataUrl) return
    pdf.addImage(dataUrl, 'PNG', qx, qy, size, size)
  } catch { /* silently skip */ }
}

// ── Header: company info + dynamic divider ────────────────────────────────────
// Returns divY (position of the horizontal divider line)
async function drawHeader(pdf, company) {
  let y = MT + 7

  // Company name — full width centered
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(...GREEN)
  const coName = (company?.name || 'Your Company').toUpperCase()
  const nameLines = pdf.splitTextToSize(coName, IW - 8)
  nameLines.forEach(line => { pdf.text(line, W / 2, y, { align: 'center' }); y += 6 })

  // Address
  if (company?.address) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(...BLACK)
    const addrLines = pdf.splitTextToSize(company.address.toUpperCase(), IW - 8)
    addrLines.forEach(line => { pdf.text(line, W / 2, y, { align: 'center' }); y += 4.5 })
    y += 1
  }

  // CIN / GSTIN
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...DARK_GREY)
  const cinText   = company?.cin   ? `CIN: ${company.cin}`     : null
  const gstinText = company?.gstin ? `GSTIN: ${company.gstin}` : null
  if (cinText || gstinText) {
    if (cinText && gstinText) {
      pdf.text(cinText,   ML + 4, y)
      pdf.text(gstinText, W - MR - 4, y, { align: 'right' })
    } else {
      pdf.text(gstinText || cinText, W / 2, y, { align: 'center' })
    }
    y += 4.5
  }

  // Email / Mobile
  const emailText = company?.contact_email ? `E-mail: ${company.contact_email}` : null
  const phoneText = company?.contact_phone ? `Mobile: ${company.contact_phone}` : null
  if (emailText || phoneText) {
    if (emailText && phoneText) {
      // Constrain email to left half so it never runs into the right-anchored phone
      const halfW = (IW - 12) / 2
      const safeEmail = pdf.splitTextToSize(emailText, halfW)[0]
      pdf.text(safeEmail, ML + 4, y)
      pdf.text(phoneText, W - MR - 4, y, { align: 'right' })
    } else {
      pdf.text(emailText || phoneText, W / 2, y, { align: 'center' })
    }
    y += 4.5
  }

  // Dynamic divider — sits just after last content line
  const divY = y + 2
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.8)
  pdf.line(ML + 2, divY, ML + IW - 2, divY)

  return divY
}

// ── Parse rich HTML body → array of { text, align, bold, italic } blocks ─────
function htmlToBlocks(html) {
  if (!html) return []
  const parser = new DOMParser()
  const doc    = parser.parseFromString('<div id="r">' + html + '</div>', 'text/html')
  const root   = doc.getElementById('r')
  if (!root) return []

  const blocks = []

  root.childNodes.forEach(node => {
    if (node.nodeType === 3 /* TEXT */) {
      const text = node.textContent || ''
      if (text.trim()) blocks.push({ text: text.trim(), align: 'left', bold: false, italic: false })
      return
    }
    if (node.nodeType !== 1 /* ELEMENT */) return

    const tag = node.tagName.toLowerCase()

    if (tag === 'br') {
      blocks.push({ text: '', align: 'left', empty: true }); return
    }

    // Get inline alignment style (set by execCommand justify*)
    const rawAlign = (node.style && node.style.textAlign) || node.getAttribute('align') || 'left'
    const align    = ['center','right','justify'].includes(rawAlign.toLowerCase()) ? rawAlign.toLowerCase() : 'left'

    const inner = node.innerHTML || ''
    if (inner === '<br>' || inner === '' || (node.textContent || '').replace(/\n/g,'').trim() === '') {
      blocks.push({ text: '', align, empty: true }); return
    }

    const bold   = !!node.querySelector('b, strong')
    const italic = !!node.querySelector('i, em')
    const text   = (node.textContent || '').replace(/\n/g, ' ').trim()
    blocks.push({ text, align, bold, italic })
  })

  return blocks
}

// ── Letter types that hide To/Address block in PDF ────────────────────────────
// 'To' block hidden for these types (address fields not relevant)
export const HIDE_TO_BLOCK = new Set(['Experience Certificate'])

// ── Main export ───────────────────────────────────────────────────────────────
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
    // Body formatting
    bodyAlign             = 'left',
    bodyFontSize          = '10',
    bodyFont              = 'helvetica',
    bodyBold              = false,
    bodyItalic            = false,
    bodyHtml              = null,       // rich text HTML from contentEditable editor
  } = letterData

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  // Page border + header
  drawPageBorder(pdf)
  const divY = await drawHeader(pdf, company)

  // ── QR: below divider, right side ──────────────────────────────────────────
  const qrSize = 16
  const qrX    = ML + IW - 4 - qrSize  // = 178 mm (right-aligned inside inner border)
  const qrY    = divY + 3
  if (verifyUrl) await stampQR(pdf, verifyUrl, qrX, qrY, qrSize)

  // ── Letter type title: centered, width limited to avoid QR zone ───────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(...BLACK)
  const titleMaxW  = IW - 52             // leaves ~38mm on right for QR
  const titleLines = pdf.splitTextToSize(letterType.toUpperCase(), titleMaxW)
  const titleY     = divY + 13
  titleLines.forEach((line, i) => {
    pdf.text(line, W / 2, titleY + i * 6, { align: 'center' })
  })
  const titleBottom = titleY + titleLines.length * 6

  // y moves past whichever is taller: QR block or title block
  let y = Math.max(qrY + qrSize + 4, titleBottom) + 3

  // ── Ref / Date ─────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...DARK_GREY)
  if (refNumber) pdf.text(`Ref: ${refNumber}`, ML + 4, y)
  pdf.text(`Date: ${fmtDate(date)}`, W - MR - 4, y, { align: 'right' })
  y += 7

  // ── To block (hidden for Experience Certificate etc.) ─────────────────────
  if (!HIDE_TO_BLOCK.has(letterType) && (toName || toAddress)) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9.5)
    pdf.setTextColor(...BLACK)
    pdf.text('To,', ML + 4, y)
    y += 5

    if (toName) {
      pdf.setFont('helvetica', 'bold')
      pdf.splitTextToSize(toName, IW - 8).forEach(line => {
        pdf.text(line, ML + 4, y); y += 5
      })
      pdf.setFont('helvetica', 'normal')
    }
    if (toAddress) {
      pdf.setFontSize(9)
      pdf.setTextColor(...DARK_GREY)
      pdf.splitTextToSize(toAddress, IW - 8).forEach(line => {
        pdf.text(line, ML + 4, y); y += 4.5
      })
      pdf.setTextColor(...BLACK)
    }
    y += 4
  }

  // ── Subject (no underline) ─────────────────────────────────────────────────
  if (subject) {
    pdf.setFontSize(9.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...BLACK)
    const subLabel  = 'Sub: '
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
  const bodyPtSize    = Math.max(8, Math.min(16, Number(bodyFontSize) || 10))
  const LINE_H        = bodyPtSize * 0.352 * 1.5   // pt → mm at 150% leading
  const BOTTOM_MARGIN = 60
  const PAGE_H        = 297

  const safeFont = ['helvetica', 'times', 'courier'].includes(bodyFont) ? bodyFont : 'helvetica'

  pdf.setFontSize(bodyPtSize)
  pdf.setTextColor(...BLACK)

  function addLine(text, textX, align) {
    if (y + LINE_H > PAGE_H - BOTTOM_MARGIN) {
      pdf.addPage()
      drawPageBorder(pdf)
      y = CONT_Y
    }
    pdf.text(text, textX, y, { align })
    y += LINE_H
  }

  // Parse HTML if available (rich text), otherwise fall back to plain body string
  const blocks = bodyHtml
    ? htmlToBlocks(bodyHtml)
    : body.split('\n').map(line => ({ text: line, align: 'left', bold: false, italic: false }))

  blocks.forEach((block, bi, arr) => {
    if (block.empty || !block.text || block.text.trim() === '') {
      y += LINE_H * 0.5; return
    }

    // Per-block font style (HTML bold/italic tags take priority)
    const bStyle = block.bold && block.italic ? 'bolditalic'
                 : block.bold   ? 'bold'
                 : block.italic ? 'italic'
                 : 'normal'
    pdf.setFont(safeFont, bStyle)

    // Per-block alignment (justify → left in PDF; jsPDF doesn't support it)
    const bAlign = block.align === 'center' ? 'center'
                 : block.align === 'right'  ? 'right'
                 : 'left'
    const textX  = bAlign === 'center' ? W / 2
                 : bAlign === 'right'  ? W - MR - 4
                 : ML + 4
    const wrapW  = bAlign === 'center' ? IW - 16 : IW - 8

    pdf.splitTextToSize(block.text, wrapW).forEach(line => addLine(line, textX, bAlign))
    if (bi < arr.length - 1) y += 1.5
  })

  y += 8

  // ── Signatory ─────────────────────────────────────────────────────────────
  if (y + 36 > PAGE_H - BOTTOM_MARGIN + 26) {
    pdf.addPage()
    drawPageBorder(pdf)
    y = CONT_Y
  }

  // Always use helvetica for signatory block (consistent regardless of body font)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(...BLACK)
  pdf.text('Yours faithfully,', ML + 4, y);  y += 5
  pdf.text(`For ${(company?.name || '').toUpperCase()}`, ML + 4, y);  y += 14

  pdf.setFont('helvetica', 'bold')
  pdf.text(signatoryName || '_________________________', ML + 4, y);  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...DARK_GREY)
  if (signatoryDesignation) pdf.text(signatoryDesignation, ML + 4, y)

  // ── Footer ────────────────────────────────────────────────────────────────
  const footDivY = MT + BORDER_H - 8
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.5)
  pdf.line(ML + 2, footDivY, ML + IW - 2, footDivY)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(...GREEN)
  const footName = pdf.splitTextToSize((company?.name || '').toUpperCase(), IW - 8)[0]
  pdf.text(footName, W / 2, footDivY + 4, { align: 'center' })

  // ── Save ──────────────────────────────────────────────────────────────────
  pdf.save(`${letterType.replace(/[^a-zA-Z0-9]/g, '_')}_${date.slice(0, 10)}.pdf`)
}
