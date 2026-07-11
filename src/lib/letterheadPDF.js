/**
 * letterheadPDF.js — Official company letter generator
 *
 * Recreates the SRA MINING AND CONSTRUCTIONS letterhead:
 *  - Dark forest green (#1A5C2A) double border (thick outer, thin inner)
 *  - Company name bold centered
 *  - Address bold centered
 *  - CIN / GSTIN in two-column layout
 *  - Email / Mobile in two-column layout
 *  - Horizontal green divider below header
 *  - Content area: letter type, ref, date, To, subject, body, signatory
 *
 * Usage:
 *   import { generateLetterPDF } from '../lib/letterheadPDF'
 *   generateLetterPDF(company, letterData)
 *
 * @param {Object} company        — from AuthContext: { name, address, gstin, contact_email, contact_phone, cin? }
 * @param {Object} letterData     — {
 *     letterType,    // e.g. 'Experience Certificate'
 *     refNumber,
 *     date,          // ISO date string
 *     toName,
 *     toAddress,
 *     subject,
 *     body,          // plain text — line breaks preserved
 *     signatoryName,
 *     signatoryDesignation,
 *   }
 */

import jsPDF from 'jspdf'

// ── Colours ───────────────────────────────────────────────────────────────────
const GREEN     = [26, 92, 42]   // #1A5C2A — dark forest green (SRA letterhead)
const BLACK     = [15, 15, 15]
const DARK_GREY = [60, 60, 60]

// ── Page constants ─────────────────────────────────────────────────────────────
const W  = 210   // A4 width mm
const ML = 12    // margin left
const MR = 12    // margin right
const MT = 8     // margin top
const IW = W - ML - MR  // inner width

// ── Date formatter ──────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ── Draw the letterhead header ─────────────────────────────────────────────────
function drawHeader(pdf, company) {
  const HEADER_H = 52  // mm — total header block height

  // Outer thick border
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(1.2)
  pdf.rect(ML, MT, IW, HEADER_H)

  // Inner thin border (2 mm inset)
  pdf.setLineWidth(0.4)
  pdf.rect(ML + 2, MT + 2, IW - 4, HEADER_H - 4)

  // ── Company name ────────────────────────────────────────────────────────────
  const coName = (company?.name || 'Your Company').toUpperCase()
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(...GREEN)
  const nameLines = pdf.splitTextToSize(coName, IW - 20)
  let y = MT + 10
  nameLines.forEach(line => {
    pdf.text(line, W / 2, y, { align: 'center' })
    y += 6
  })

  // ── Address ──────────────────────────────────────────────────────────────────
  if (company?.address) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(...BLACK)
    const addrLines = pdf.splitTextToSize(company.address.toUpperCase(), IW - 16)
    addrLines.forEach(line => {
      pdf.text(line, W / 2, y, { align: 'center' })
      y += 4.5
    })
    y += 1
  }

  // ── CIN / GSTIN row ──────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...DARK_GREY)

  const cinText   = company?.cin   ? `CIN: ${company.cin}`     : null
  const gstinText = company?.gstin ? `GSTIN: ${company.gstin}` : null

  if (cinText && gstinText) {
    pdf.text(cinText,   ML + 10, y)
    pdf.text(gstinText, W - MR - 10, y, { align: 'right' })
    y += 4.5
  } else if (gstinText) {
    pdf.text(gstinText, W / 2, y, { align: 'center' })
    y += 4.5
  } else if (cinText) {
    pdf.text(cinText, W / 2, y, { align: 'center' })
    y += 4.5
  }

  // ── Email / Mobile row ───────────────────────────────────────────────────────
  const emailText = company?.contact_email ? `E-mail: ${company.contact_email}` : null
  const phoneText = company?.contact_phone ? `Mobile: ${company.contact_phone}` : null

  if (emailText && phoneText) {
    pdf.text(emailText, ML + 10, y)
    pdf.text(phoneText, W - MR - 10, y, { align: 'right' })
  } else if (emailText) {
    pdf.text(emailText, W / 2, y, { align: 'center' })
  } else if (phoneText) {
    pdf.text(phoneText, W / 2, y, { align: 'center' })
  }

  // ── Horizontal green divider ─────────────────────────────────────────────────
  const divY = MT + HEADER_H + 2
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.8)
  pdf.line(ML, divY, ML + IW, divY)

  return divY + 5  // return y position after divider
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * Generates a PDF letter on company letterhead and triggers download.
 * @param {Object} company    — company object from AuthContext
 * @param {Object} letterData — letter content fields (see module JSDoc)
 */
export function generateLetterPDF(company, letterData = {}) {
  const {
    letterType        = 'Letter',
    refNumber         = '',
    date              = new Date().toISOString().slice(0, 10),
    toName            = '',
    toAddress         = '',
    subject           = '',
    body              = '',
    signatoryName     = '',
    signatoryDesignation = '',
  } = letterData

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  let y = drawHeader(pdf, company)

  // ── Letter type title ────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(...BLACK)
  pdf.text(letterType.toUpperCase(), W / 2, y, { align: 'center' })
  y += 3

  // Underline
  const titleW = pdf.getTextWidth(letterType.toUpperCase())
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.4)
  pdf.line(W / 2 - titleW / 2, y, W / 2 + titleW / 2, y)
  y += 6

  // ── Ref / Date ───────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...DARK_GREY)
  if (refNumber) pdf.text(`Ref: ${refNumber}`, ML, y)
  pdf.text(`Date: ${fmtDate(date)}`, W - MR, y, { align: 'right' })
  y += 7

  // ── To block ─────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(...BLACK)
  pdf.text('To,', ML, y)
  y += 5

  if (toName) {
    pdf.setFont('helvetica', 'bold')
    const nameLines = pdf.splitTextToSize(toName, IW)
    nameLines.forEach(line => { pdf.text(line, ML, y); y += 5 })
    pdf.setFont('helvetica', 'normal')
  }

  if (toAddress) {
    pdf.setFontSize(9)
    pdf.setTextColor(...DARK_GREY)
    const addrLines = pdf.splitTextToSize(toAddress, IW)
    addrLines.forEach(line => { pdf.text(line, ML, y); y += 4.5 })
    pdf.setTextColor(...BLACK)
  }
  y += 4

  // ── Subject ───────────────────────────────────────────────────────────────────
  if (subject) {
    pdf.setFontSize(9.5)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Sub: ', ML, y)
    const subjectX = ML + pdf.getTextWidth('Sub: ')
    pdf.setFont('helvetica', 'bold')
    const subjectLines = pdf.splitTextToSize(subject, IW - pdf.getTextWidth('Sub: '))
    subjectLines.forEach((line, i) => {
      pdf.text(line, i === 0 ? subjectX : ML + pdf.getTextWidth('Sub: '), y + i * 5)
    })
    y += subjectLines.length * 5 + 3

    // Underline
    pdf.setFont('helvetica', 'normal')
    pdf.setDrawColor(100, 100, 100)
    pdf.setLineWidth(0.2)
    pdf.line(ML, y - 1, ML + IW, y - 1)
    y += 3
  }

  // ── Body ──────────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(...BLACK)

  const LINE_H = 5.5
  const BOTTOM_MARGIN = 50   // space reserved at bottom for signatory block
  const PAGE_H = 297

  function addLine(text) {
    if (y + LINE_H > PAGE_H - BOTTOM_MARGIN) {
      pdf.addPage()
      y = MT + 10
    }
    pdf.text(text, ML, y)
    y += LINE_H
  }

  // Split body by newline, then wrap each paragraph
  const paragraphs = body.split('\n')
  paragraphs.forEach((para, pi) => {
    if (para.trim() === '') {
      y += LINE_H * 0.5  // blank line between paragraphs
      return
    }
    const wrapped = pdf.splitTextToSize(para, IW)
    wrapped.forEach(line => addLine(line))
    if (pi < paragraphs.length - 1) y += 1.5  // paragraph spacing
  })

  y += 8

  // ── Signatory ─────────────────────────────────────────────────────────────────
  // If near bottom, ensure we have room
  if (y + 30 > PAGE_H - 15) {
    pdf.addPage()
    y = MT + 10
  }

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  pdf.text('Yours faithfully,', ML, y)
  y += 5
  pdf.text(`For ${(company?.name || '').toUpperCase()}`, ML, y)
  y += 14  // space for signature

  pdf.setFont('helvetica', 'bold')
  pdf.text(signatoryName || '_________________________', ML, y)
  y += 4.5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...DARK_GREY)
  if (signatoryDesignation) pdf.text(signatoryDesignation, ML, y)

  // ── Footer divider + company name ─────────────────────────────────────────────
  const footY = PAGE_H - 10
  pdf.setDrawColor(...GREEN)
  pdf.setLineWidth(0.5)
  pdf.line(ML, footY - 6, ML + IW, footY - 6)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(...GREEN)
  pdf.text((company?.name || '').toUpperCase(), W / 2, footY - 2, { align: 'center' })

  // ── Save ──────────────────────────────────────────────────────────────────────
  const safeType = letterType.replace(/[^a-zA-Z0-9]/g, '_')
  const safeDate = date.slice(0, 10)
  pdf.save(`${safeType}_${safeDate}.pdf`)
}
