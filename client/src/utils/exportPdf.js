import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

/**
 * Generate a comprehensive trip report PDF with route map, expense breakdown, and payment summary.
 *
 * @param {Object} trip - Trip data from API (with stops, expenses, payments, dieselRefills)
 * @param {HTMLElement|null} mapContainerEl - Optional DOM element containing the Leaflet map to capture as image
 * @returns {Promise<jsPDF>} The generated PDF document
 */
export async function generateTripReport(trip, mapContainerEl = null) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  let yPos = margin;

  // Color palette
  const primaryColor = [37, 99, 235];
  const darkColor = [31, 41, 55];
  const grayColor = [107, 114, 128];
  const lightGray = [243, 244, 246];
  const successColor = [22, 163, 74];
  const warningColor = [234, 88, 12];
  const dangerColor = [220, 38, 38];

  // ---------- helpers ----------

  const addPageIfNeeded = (needed = 40) => {
    if (yPos > pageHeight - needed) {
      doc.addPage();
      yPos = margin;
    }
  };

  const addHeader = () => {
    // Brand bar
    doc.setFillColor(...primaryColor);
    doc.rect(margin, yPos, contentWidth, 22, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('KUMARAN TRAVELS', margin + 5, yPos + 15);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Trip Report', margin + contentWidth - 5, yPos + 15, { align: 'right' });
    yPos += 30;
  };

  const addSectionTitle = (title) => {
    addPageIfNeeded(40);
    doc.setFillColor(...primaryColor);
    doc.rect(margin, yPos, 4, 10, 'F');
    doc.setTextColor(...darkColor);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 10, yPos + 8);
    yPos += 16;
  };

  const addKeyValue = (label, value, color = null) => {
    addPageIfNeeded(20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text(label, margin + 2, yPos);
    const labelW = doc.getTextWidth(label);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(color || darkColor));
    doc.text(value, margin + labelW + 4, yPos);
    yPos += 5.5;
  };

  const addDivider = () => {
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, margin + contentWidth, yPos);
    yPos += 4;
  };

  const addText = (text, size = 9, bold = false, color = darkColor) => {
    addPageIfNeeded(20);
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    doc.text(text, margin, yPos);
    yPos += size + 3;
  };

  // ================================================================
  //  BUILD CONTENT
  // ================================================================

  addHeader();

  // Trip title + status badge
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(trip.title, margin, yPos);
  yPos += 8;

  const statusColors = {
    planned: [59, 130, 246],
    ongoing: [217, 119, 6],
    completed: [22, 163, 74],
    cancelled: [239, 68, 68],
  };
  const stColor = statusColors[trip.status] || grayColor;
  doc.setFillColor(...stColor);
  doc.roundedRect(margin, yPos - 4, 22, 6, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(trip.status.toUpperCase(), margin + 11, yPos + 1, { align: 'center' });
  yPos += 14;

  // Info box
  doc.setFillColor(...lightGray);
  doc.roundedRect(margin, yPos, contentWidth, 38, 2, 2, 'F');
  const infoY = yPos + 6;
  const colW = contentWidth / 2 - 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Vehicle:', margin + 5, infoY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(`${trip.vehicle_name} (${trip.registration_number || ''})`, margin + 27, infoY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Driver:', margin + 5, infoY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(trip.driver_name || 'Not assigned', margin + 22, infoY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Partner:', margin + 5, infoY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(trip.partner_name || 'None', margin + 24, infoY + 12);

  // Right column
  const rX = margin + colW + 10;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Start Date:', rX, infoY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(
    new Date(trip.start_date).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    rX + 28, infoY,
  );

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('End Date:', rX, infoY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(
    new Date(trip.end_date).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    rX + 25, infoY + 6,
  );

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Distance:', rX, infoY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(`${trip.total_distance_km || 0} km`, rX + 24, infoY + 12);

  yPos += 46;
  addDivider();

  // ================================================================
  //  ROUTE & STOPS
  // ================================================================
  addSectionTitle('Route & Stops');

  if (trip.start_location) {
    addKeyValue('From: ', trip.start_location);
  }
  if (trip.end_location) {
    addKeyValue('To: ', trip.end_location);
  }
  yPos += 2;

  if (trip.stops && trip.stops.length > 0) {
    const stopsBody = trip.stops.map((s, i) => [
      i + 1,
      s.place_name || 'Unknown',
      s.stop_type || 'stop',
      s.latitude ? `${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}` : '-',
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['#', 'Place', 'Type', 'Coordinates']],
      body: stopsBody,
      theme: 'grid',
      headStyles: {
        fillColor: primaryColor, fontSize: 8, fontStyle: 'bold', textColor: [255, 255, 255],
      },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      styles: { cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 50, halign: 'center' },
      },
    });
    yPos = doc.lastAutoTable.finalY + 6;
  }

  // ================================================================
  //  ROUTE MAP (captured from DOM)
  // ================================================================
  if (mapContainerEl) {
    try {
      const canvas = await html2canvas(mapContainerEl, {
        useCORS: true,
        allowTaint: false,
        scale: 2,
        width: mapContainerEl.offsetWidth,
        height: mapContainerEl.offsetHeight,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.85);

      addPageIfNeeded(90);
      addSectionTitle('Route Map');

      const mapW = contentWidth;
      const mapH = mapW * 0.45;
      addPageIfNeeded(mapH + 20);

      doc.addImage(imgData, 'JPEG', margin, yPos, mapW, mapH);
      yPos += mapH + 10;
    } catch (err) {
      console.warn('Map capture skipped (tab not visible or rendering issue):', err.message);
    }
  }

  // ================================================================
  //  EXPENSE BREAKDOWN
  // ================================================================
  if (trip.expenses && trip.expenses.length > 0) {
    addPageIfNeeded(50);
    addSectionTitle('Expense Breakdown');

    const expBody = trip.expenses.map((e) => [
      e.expense_type || 'other',
      e.description || '-',
      e.liters ? `${e.liters} L` : '-',
      `\u20B9${(e.amount || 0).toLocaleString('en-IN')}`,
      new Date(e.created_at).toLocaleDateString('en-IN'),
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['Type', 'Description', 'Liters', 'Amount', 'Date']],
      body: expBody,
      theme: 'grid',
      headStyles: {
        fillColor: primaryColor, fontSize: 8, fontStyle: 'bold', textColor: [255, 255, 255],
      },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      styles: { cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 25 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'center' },
      },
      foot: [[
        {
          content: 'TOTAL',
          colSpan: 3,
          styles: { fontStyle: 'bold', halign: 'right', fillColor: lightGray, fontSize: 8 },
        },
        {
          content: `\u20B9${trip.expenses.reduce((s, e) => s + (e.amount || 0), 0).toLocaleString('en-IN')}`,
          styles: { fontStyle: 'bold', fillColor: lightGray, halign: 'right', fontSize: 8 },
        },
        { content: '', styles: { fillColor: lightGray } },
      ]],
    });
    yPos = doc.lastAutoTable.finalY + 6;

    // Category summary
    const catTotals = {};
    trip.expenses.forEach((e) => {
      const t = e.expense_type || 'other';
      catTotals[t] = (catTotals[t] || 0) + (e.amount || 0);
    });

    if (Object.keys(catTotals).length > 1) {
      addText('Expenses by Category:', 9, true);
      doc.autoTable({
        startY: yPos,
        head: [['Category', 'Amount']],
        body: Object.entries(catTotals).map(([type, total]) => [
          type.charAt(0).toUpperCase() + type.slice(1),
          `\u20B9${total.toLocaleString('en-IN')}`,
        ]),
        theme: 'grid',
        headStyles: {
          fillColor: [107, 114, 128], fontSize: 8, fontStyle: 'bold', textColor: [255, 255, 255],
        },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        margin: { left: margin + 10, right: margin + 10 },
        tableWidth: contentWidth - 20,
        styles: { cellPadding: 2.5 },
        columnStyles: { 1: { halign: 'right' } },
      });
      yPos = doc.lastAutoTable.finalY + 6;
    }
  } else {
    addSectionTitle('Expenses');
    addText('No expenses recorded for this trip.', 9, false, grayColor);
  }

  // ================================================================
  //  PAYMENT SUMMARY
  // ================================================================
  if (trip.payments && trip.payments.length > 0) {
    addPageIfNeeded(50);
    addSectionTitle('Payment Summary');

    const payBody = trip.payments.map((p) => [
      p.payment_type || 'other',
      p.payer_type || 'customer',
      p.description || '-',
      `\u20B9${(p.amount || 0).toLocaleString('en-IN')}`,
      new Date(p.created_at).toLocaleDateString('en-IN'),
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['Type', 'Payer', 'Description', 'Amount', 'Date']],
      body: payBody,
      theme: 'grid',
      headStyles: {
        fillColor: primaryColor, fontSize: 8, fontStyle: 'bold', textColor: [255, 255, 255],
      },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      styles: { cellPadding: 2.5 },
      columnStyles: {
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 28, halign: 'center' },
      },
      foot: [[
        {
          content: 'TOTAL COLLECTED',
          colSpan: 3,
          styles: { fontStyle: 'bold', halign: 'right', fillColor: lightGray, fontSize: 8 },
        },
        {
          content: `\u20B9${trip.payments.reduce((s, p) => s + (p.amount || 0), 0).toLocaleString('en-IN')}`,
          styles: { fontStyle: 'bold', fillColor: lightGray, halign: 'right', fontSize: 8, textColor: successColor },
        },
        { content: '', styles: { fillColor: lightGray } },
      ]],
    });
    yPos = doc.lastAutoTable.finalY + 6;
  } else {
    addSectionTitle('Payments');
    addText('No payments recorded for this trip.', 9, false, grayColor);
  }

  // ================================================================
  //  FINANCIAL SUMMARY
  // ================================================================
  addPageIfNeeded(75);
  addSectionTitle('Financial Summary');

  const totalExpenses = trip.expenses
    ? trip.expenses.reduce((s, e) => s + (e.amount || 0), 0)
    : 0;
  const netProfit = (trip.total_rent || 0) - totalExpenses;
  const dieselRefillTotal = trip.payments
    ? trip.payments
        .filter((p) => p.payment_type === 'diesel_refill')
        .reduce((s, p) => s + (p.amount || 0), 0)
    : 0;

  // Boxed summary
  doc.setFillColor(249, 250, 251);
  doc.roundedRect(margin, yPos, contentWidth, 55, 2, 2, 'F');

  const finY = yPos + 7;
  const finCw = contentWidth / 2 - 8;

  const labelW = (lbl) => doc.getTextWidth(lbl);

  // Row 1
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Total Rent:', margin + 5, finY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(`\u20B9${(trip.total_rent || 0).toLocaleString('en-IN')}`, margin + labelW('Total Rent:') + 8, finY);

  const rX2 = margin + finCw + 15;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Total Expenses:', rX2, finY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dangerColor);
  doc.text(`\u20B9${totalExpenses.toLocaleString('en-IN')}`, rX2 + labelW('Total Expenses:') + 6, finY);

  // Row 2
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Advance Collected:', margin + 5, finY + 7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...successColor);
  doc.text(`\u20B9${(trip.advance_amount || 0).toLocaleString('en-IN')}`, margin + labelW('Advance Collected:') + 6, finY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Balance Due:', rX2, finY + 7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(trip.balance_amount > 0 ? warningColor : successColor);
  doc.text(`\u20B9${(trip.balance_amount || 0).toLocaleString('en-IN')}`, rX2 + labelW('Balance Due:') + 6, finY + 7);

  // Row 3
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Diesel Paid by Driver:', margin + 5, finY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text(`\u20B9${dieselRefillTotal.toLocaleString('en-IN')}`, margin + labelW('Diesel Paid by Driver:') + 6, finY + 14);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);
  doc.text('Net Profit:', rX2, finY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(netProfit >= 0 ? successColor : dangerColor);
  doc.text(`\u20B9${netProfit.toLocaleString('en-IN')}`, rX2 + labelW('Net Profit:') + 6, finY + 14);

  yPos += 62;
  addDivider();

  // ================================================================
  //  DIESEL & MILEAGE
  // ================================================================
  addSectionTitle('Diesel & Mileage');

  const distFromKm =
    trip.start_km_reading && trip.end_km_reading
      ? trip.end_km_reading - trip.start_km_reading
      : null;

  addKeyValue('Est. Diesel Required: ', `${trip.diesel_required_est || 0} liters`);
  addKeyValue('Diesel Used: ', `${trip.diesel_used_liters || 0} liters`);
  addKeyValue('Map Distance: ', `${trip.total_distance_km || 0} km`);
  if (distFromKm) {
    addKeyValue('Odometer Distance: ', `${distFromKm} km`);
  }
  if (trip.mileage) {
    addKeyValue('Mileage: ', `${trip.mileage} km/l`);
  }
  yPos += 2;

  if (trip.dieselRefills && trip.dieselRefills.length > 0) {
    addText('Diesel Refill History:', 9, true);

    const refillBody = trip.dieselRefills.map((r) => [
      `${r.liters} L`,
      `\u20B9${(r.amount || 0).toLocaleString('en-IN')}`,
      `\u20B9${((r.amount || 0) / r.liters).toFixed(2)}/L`,
      r.filled_by_name || 'Driver',
      new Date(r.created_at).toLocaleDateString('en-IN'),
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['Liters', 'Amount', 'Rate/L', 'Filled By', 'Date']],
      body: refillBody,
      theme: 'grid',
      headStyles: {
        fillColor: [107, 114, 128], fontSize: 8, fontStyle: 'bold', textColor: [255, 255, 255],
      },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      styles: { cellPadding: 2.5 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'center' },
        3: { cellWidth: 30 },
        4: { cellWidth: 25, halign: 'center' },
      },
    });
    yPos = doc.lastAutoTable.finalY + 6;
  }

  // ================================================================
  //  FOOTER
  // ================================================================
  addDivider();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...grayColor);
  doc.text(
    `Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}  |  Kumaran Travels`,
    margin,
    yPos,
  );
  doc.text(
    `Trip #${trip.id}  |  ${trip.vehicle_name}`,
    margin + contentWidth,
    yPos,
    { align: 'right' },
  );

  return doc;
}

/**
 * Generate and download a trip report PDF.
 *
 * @param {Object} trip - Trip data object
 * @param {HTMLElement|null} mapContainerEl - Optional map container DOM element for route image capture
 */
export async function downloadTripReport(trip, mapContainerEl = null) {
  const doc = await generateTripReport(trip, mapContainerEl);
  const dateStr = new Date().toISOString().split('T')[0];
  const safeTitle = trip.title.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Kumaran_Travels_${safeTitle}_${dateStr}.pdf`);
}
