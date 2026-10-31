import { jsPDF } from 'jspdf';

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  subscriptionId: string;
  billingPeriodKey: string;
  amountSubtotal: number;
  taxAmount: number;
  discountAmount: number;
  discountCode?: string | null;
  totalAmount: number;
  status: string;
  dueDate: string;
  createdAt: string;
}

export function downloadInvoicePdf(invoice: InvoiceRecord, customerName: string, customerEmail: string, planName: string) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  // Top Orange Banner
  doc.setFillColor(234, 88, 12); // #EA580C
  doc.rect(0, 0, 595, 92, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('BRIGHTLOOP GAMING', 44, 46);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Official Subscription & Battlepass Tax Invoice (18% GST)', 44, 66);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`INVOICE #${invoice.invoiceNumber}`, 550, 46, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`Status: ${invoice.status}`, 550, 66, { align: 'right' });

  // Customer & Billing Metadata
  doc.setTextColor(28, 25, 23);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Billed To:', 44, 130);
  doc.setFont('helvetica', 'normal');
  doc.text(customerName, 44, 148);
  doc.text(customerEmail, 44, 164);

  doc.setFont('helvetica', 'bold');
  doc.text('Invoice Details:', 360, 130);
  doc.setFont('helvetica', 'normal');
  doc.text(`Billing Period: ${invoice.billingPeriodKey}`, 360, 148);
  doc.text(`Issued Date: ${new Date(invoice.createdAt).toLocaleDateString()}`, 360, 164);
  doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 360, 180);

  // Table Header
  doc.setFillColor(255, 247, 237);
  doc.rect(44, 215, 506, 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(154, 52, 18);
  doc.text('Description', 56, 233);
  doc.text('Period', 320, 233);
  doc.text('Amount (USD)', 536, 233, { align: 'right' });

  // Line Item
  doc.setTextColor(28, 25, 23);
  doc.setFont('helvetica', 'normal');
  doc.text(`${planName} Subscription`, 56, 266);
  doc.text(invoice.billingPeriodKey, 320, 266);
  doc.text(`$${(invoice.amountSubtotal / 100).toFixed(2)}`, 536, 266, { align: 'right' });

  doc.setDrawColor(231, 229, 228);
  doc.line(44, 284, 550, 284);

  // Totals Breakdown
  let y = 312;
  doc.text('Subtotal:', 380, y);
  doc.text(`$${(invoice.amountSubtotal / 100).toFixed(2)}`, 536, y, { align: 'right' });

  if (invoice.discountAmount > 0) {
    y += 22;
    doc.setTextColor(22, 163, 74);
    doc.text(`Discount (${invoice.discountCode || 'PROMO'}):`, 380, y);
    doc.text(`-$${(invoice.discountAmount / 100).toFixed(2)}`, 536, y, { align: 'right' });
    doc.setTextColor(28, 25, 23);
  }

  y += 22;
  doc.text('GST (18%):', 380, y);
  doc.text(`$${(invoice.taxAmount / 100).toFixed(2)}`, 536, y, { align: 'right' });

  y += 28;
  doc.setFillColor(254, 243, 199);
  doc.rect(368, y - 16, 182, 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total Amount:', 380, y + 2);
  doc.text(`$${(invoice.totalAmount / 100).toFixed(2)}`, 536, y + 2, { align: 'right' });

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108);
  doc.text(
    'Brightloop Gaming Platform · All monetary values calculated in integer minor units with 18% GST compliance.',
    44,
    780
  );

  doc.save(`${invoice.invoiceNumber}-Brightloop-Invoice.pdf`);
}
