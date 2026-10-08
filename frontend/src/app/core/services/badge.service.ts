import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

export interface BadgeInput {
  /** Encoded in the Code128 barcode and shown small in the corner. */
  id: string;
  /** Full name or company name shown as the badge headline. */
  displayName: string;
  /** Localized user-type label (Person / Employee / Company). */
  typeLabel: string;
}

/** Hex → [r,g,b] so jsPDF colour setters always get numeric channels. */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Palette lifted from the app UI (styles.css :root) so the badge matches the product.
const ACCENT = rgb('#007aff');
const ACCENT_SOFT = rgb('#e5f0ff');
const TEXT_DARK = rgb('#1d1d1f');
const MUTED = rgb('#86868b');
const WHITE = rgb('#ffffff');
const BARCODE = rgb('#1d1d1f');

/**
 * Generates a CR80 credit-card-sized (85.6 × 54 mm) PDF badge for a user and
 * triggers a browser download. The badge carries the name, type, a small id in
 * the corner and a large Code128 barcode of the user id for scanner-based
 * identification.
 */
@Injectable({ providedIn: 'root' })
export class BadgeService {
  downloadUserBadge(input: BadgeInput): void {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 54] });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const headerH = 15;

    // Card background (kept light regardless of the app theme, for printing).
    pdf.setFillColor(...WHITE);
    pdf.rect(0, 0, W, H, 'F');

    // Accent header band with the product name and the small id in the corner.
    pdf.setFillColor(...ACCENT);
    pdf.rect(0, 0, W, headerH, 'F');

    pdf.setTextColor(...WHITE);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('SmartVision', margin, 9.6);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    pdf.text(`ID ${input.id}`, W - margin, 5.5, { align: 'right' });

    // Headline: full name / company name, auto-shrunk to fit the card width.
    const maxTextWidth = W - margin * 2;
    pdf.setTextColor(...TEXT_DARK);
    pdf.setFont('helvetica', 'bold');
    const nameSize = this.fitFontSize(pdf, input.displayName, maxTextWidth, 16, 9);
    pdf.setFontSize(nameSize);
    pdf.text(input.displayName, margin, headerH + 9, { maxWidth: maxTextWidth });

    // Type pill (accent-soft background, accent text).
    const typeLabel = (input.typeLabel || '').toUpperCase();
    if (typeLabel) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const padX = 2.6;
      const pillH = 5.4;
      const pillTop = headerH + 12;
      const pillW = pdf.getTextWidth(typeLabel) + padX * 2;
      pdf.setFillColor(...ACCENT_SOFT);
      pdf.roundedRect(margin, pillTop, pillW, pillH, 1.6, 1.6, 'F');
      pdf.setTextColor(...ACCENT);
      pdf.text(typeLabel, margin + padX, pillTop + pillH / 2 + 1.1);
    }

    // Large Code128 barcode of the user id, anchored to the bottom of the card.
    const barcodeDataUrl = this.buildBarcode(input.id);
    const bcH = 15;
    const bcW = W - margin * 2;
    const bcY = H - margin - bcH;
    pdf.addImage(barcodeDataUrl, 'PNG', margin, bcY, bcW, bcH);

    // Thin framing line above the barcode for a finished look.
    pdf.setDrawColor(...MUTED);
    pdf.setLineWidth(0.1);
    pdf.line(margin, bcY - 2, W - margin, bcY - 2);

    pdf.save(this.fileName(input));
  }

  /** Renders the id as a Code128 barcode on an offscreen canvas → PNG data URL. */
  private buildBarcode(value: string): string {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      displayValue: false,
      background: '#ffffff',
      lineColor: `#${BARCODE.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
      margin: 10,
      width: 2,
      height: 120,
    });
    return canvas.toDataURL('image/png');
  }

  /** Shrinks the font size until the text fits maxWidth (or hits the floor). */
  private fitFontSize(pdf: jsPDF, text: string, maxWidth: number, start: number, min: number): number {
    let size = start;
    pdf.setFontSize(size);
    while (size > min && pdf.getTextWidth(text) > maxWidth) {
      size -= 0.5;
      pdf.setFontSize(size);
    }
    return size;
  }

  private fileName(input: BadgeInput): string {
    const slug = (input.displayName || input.id)
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40) || input.id;
    return `SmartVision-Badge-${slug}.pdf`;
  }
}
