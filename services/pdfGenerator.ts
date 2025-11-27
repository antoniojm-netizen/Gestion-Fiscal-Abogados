
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Invoice, ProfessionalProfile, InvoiceType } from "../types";

// Helper for European Currency Format
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

export const generateInvoicePDF = (invoice: Partial<Invoice>, profile: ProfessionalProfile) => {
  const doc = new jsPDF();

  // --- CONFIGURACIÓN DE ESTILO (ESCALA DE GRISES MODERNOS) ---
  const colorBlack = "#000000";       // Textos principales
  const colorDarkGray = "#404040";    // Encabezados secundarios
  const colorLightGray = "#9ca3af";   // Líneas sutiles
  const colorTableHead = "#262626";   // Fondo cabecera tabla (Gris muy oscuro)
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  
  // --- ENCABEZADO (DATOS DEL PROFESIONAL - IZQUIERDA) ---
  let yPos = 20;

  // Nombre del Profesional (Grande y en Negrita)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(colorBlack);
  doc.text((profile.name || "NOMBRE DEL PROFESIONAL").toUpperCase(), margin, yPos);

  yPos += 7;

  // Condición de Abogado y Datos Colegiales
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(colorDarkGray);
  doc.text("ABOGADO", margin, yPos);
  
  yPos += 5;

  if (profile.barAssociation || profile.collegiateNumber) {
      doc.setFont("helvetica", "normal");
      const colegiadoText = [
          profile.barAssociation,
          profile.collegiateNumber ? `Col. Nº ${profile.collegiateNumber}` : null
      ].filter(Boolean).join("  |  ");
      
      if (colegiadoText) {
          doc.text(colegiadoText, margin, yPos);
          yPos += 6;
      }
  } else {
      yPos += 1;
  }

  // Detalles de contacto (Normal, tamaño 10)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(colorDarkGray);

  // Dirección (Sin Provincia)
  // Construimos la dirección: Calle + CP + Ciudad
  const addressParts = [];
  if (profile.address) addressParts.push(profile.address);
  if (profile.zipCode || profile.city) addressParts.push(`${profile.zipCode || ''} ${profile.city || ''}`.trim());
  
  addressParts.forEach(part => {
    if (part) {
        doc.text(part, margin, yPos);
        yPos += 5;
    }
  });

  // NIF
  if (profile.nif) {
      doc.text(`NIF: ${profile.nif}`, margin, yPos);
      yPos += 5;
  }

  yPos += 2; // Pequeño espacio

  // Datos de Contacto (Teléfono | Email) en una línea si caben, o dos
  const contactLine = [profile.phone, profile.email].filter(Boolean).join("  |  ");
  if (contactLine) {
      doc.text(contactLine, margin, yPos);
      yPos += 5;
  }

  // Página Web (Destacada)
  if (profile.website) {
      doc.setFont("helvetica", "bold"); // Un poco más destacado
      doc.text(profile.website, margin, yPos);
      yPos += 5;
  }

  // --- BLOQUE FACTURA (DERECHA SUPERIOR) ---
  // Un diseño limpio alineado a la derecha
  const metaStartX = pageWidth - margin - 70;
  let metaY = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(colorBlack);
  doc.text("FACTURA", pageWidth - margin, metaY, { align: "right" });

  metaY += 10;

  // Línea separadora fina bajo "FACTURA"
  doc.setDrawColor(colorBlack);
  doc.setLineWidth(0.5);
  doc.line(metaStartX, metaY - 4, pageWidth - margin, metaY - 4);

  // Número
  doc.setFontSize(10);
  doc.setTextColor(colorDarkGray);
  doc.text("NÚMERO:", metaStartX + 20, metaY, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(colorBlack);
  doc.text(invoice.number || "---", pageWidth - margin, metaY, { align: "right" });

  metaY += 6;

  // Fecha
  doc.setFont("helvetica", "normal");
  doc.setTextColor(colorDarkGray);
  doc.text("FECHA:", metaStartX + 20, metaY, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(colorBlack);
  const dateStr = invoice.date ? new Date(invoice.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(dateStr, pageWidth - margin, metaY, { align: "right" });


  // --- SEPARADOR GRÁFICO ---
  // Una línea gruesa negra que cruza la página antes de los datos del cliente
  const dividerY = Math.max(yPos, metaY) + 10;
  doc.setDrawColor(colorBlack);
  doc.setLineWidth(1); // Línea gruesa para dar peso visual
  doc.line(margin, dividerY, pageWidth - margin, dividerY);


  // --- DATOS DEL CLIENTE ---
  const clientY = dividerY + 10;
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(colorLightGray); // Etiqueta sutil
  doc.text("FACTURAR A:", margin, clientY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(colorBlack);
  doc.text(invoice.entityName || "CLIENTE GENERAL", margin, clientY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(colorDarkGray);
  
  let clientDetailY = clientY + 11;
  if (invoice.nif) {
      doc.text(`NIF/CIF: ${invoice.nif}`, margin, clientDetailY);
      clientDetailY += 5;
  }
  if (invoice.fiscalAddress) {
      doc.text(invoice.fiscalAddress, margin, clientDetailY);
  }


  // --- TABLA DE CONCEPTOS ---
  // Construimos las filas dependiendo de si hay desglose de Honorarios vs Gastos
  const tableStartY = clientDetailY + 15;
  const tableBody = [];

  // Fila 1: Concepto Principal (Honorarios)
  // Si invoice.fees está definido, lo usamos. Si no (facturas antiguas), usamos baseAmount como honorario
  const feesAmount = (invoice.fees !== undefined && invoice.fees !== null) ? invoice.fees : (invoice.baseAmount || 0);
  
  tableBody.push([
    invoice.concept || "Servicios Profesionales",
    formatCurrency(feesAmount)
  ]);

  // Fila 2: Gastos/Suplidos (si existen y son > 0)
  if (invoice.taxableExpenses && invoice.taxableExpenses > 0) {
      tableBody.push([
          "Gastos / Suplidos incluidos en base",
          formatCurrency(invoice.taxableExpenses)
      ]);
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [['CONCEPTO / DESCRIPCIÓN', 'IMPORTE']],
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fillColor: colorTableHead,
      textColor: "#ffffff",
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 6
    },
    bodyStyles: {
        cellPadding: 6,
        lineColor: colorLightGray,
        lineWidth: { bottom: 0.1 },
        textColor: colorBlack
    },
    columnStyles: {
      0: { cellWidth: 'auto' }, // Concepto ocupa todo el espacio posible
      1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' } // Importe alineado derecha
    },
    styles: {
      font: "helvetica",
      fontSize: 10
    },
    margin: { left: margin, right: margin }
  });

  // --- TOTALES ---
  // @ts-ignore
  let finalY = doc.lastAutoTable.finalY + 10;
  const rightColX = pageWidth - margin - 60;  // Posición etiqueta
  const rightValX = pageWidth - margin;       // Posición valor

  // Base Imponible
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(colorDarkGray);
  doc.text("Base Imponible", rightColX, finalY, { align: 'right' });
  doc.setTextColor(colorBlack);
  doc.text(formatCurrency(invoice.baseAmount || 0), rightValX, finalY, { align: 'right' });
  
  finalY += 6;

  // IVA
  doc.setTextColor(colorDarkGray);
  doc.text(`IVA ${invoice.ivaRate}%`, rightColX, finalY, { align: 'right' });
  doc.setTextColor(colorBlack);
  doc.text(formatCurrency(invoice.ivaAmount || 0), rightValX, finalY, { align: 'right' });
  
  finalY += 6;

  // IRPF (Si aplica)
  if (invoice.irpfRate && invoice.irpfRate > 0) {
    doc.setTextColor(colorDarkGray);
    doc.text(`Retención IRPF ${invoice.irpfRate}%`, rightColX, finalY, { align: 'right' });
    doc.setTextColor(colorBlack);
    doc.text(`- ${formatCurrency(invoice.irpfAmount || 0)}`, rightValX, finalY, { align: 'right' });
    finalY += 6;
  }

  // SUPLIDOS (Si aplica)
  if (invoice.supplies && invoice.supplies > 0) {
      doc.setTextColor(colorDarkGray);
      doc.text("Suplidos (Exento)", rightColX, finalY, { align: 'right' });
      doc.setTextColor(colorBlack);
      doc.text(`+ ${formatCurrency(invoice.supplies)}`, rightValX, finalY, { align: 'right' });
      finalY += 6;
  }

  finalY += 4;
  
  // Línea Total Factura
  doc.setDrawColor(colorBlack);
  doc.setLineWidth(0.5);
  doc.line(rightColX - 10, finalY, rightValX, finalY);
  
  finalY += 8;

  const totalInvoice = invoice.totalAmount || 0;
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(colorBlack);
  doc.text("TOTAL FACTURA", rightColX, finalY, { align: 'right' });
  doc.text(formatCurrency(totalInvoice), rightValX, finalY, { align: 'right' });

  // --- PROVISIÓN DE FONDOS Y TOTAL A PAGAR ---
  // Si hay provisión de fondos, mostramos el desglose final
  if (invoice.retainer && invoice.retainer > 0) {
      finalY += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(colorDarkGray);
      doc.text("Menos Provisión de Fondos", rightColX, finalY, { align: 'right' });
      doc.setTextColor(colorBlack); // Destacamos en negro al ser una resta importante
      doc.text(`- ${formatCurrency(invoice.retainer)}`, rightValX, finalY, { align: 'right' });
      
      finalY += 5;
      
      // Línea gruesa para el total final
      doc.setDrawColor(colorBlack);
      doc.setLineWidth(0.5);
      doc.line(rightColX - 10, finalY, rightValX, finalY);
      
      finalY += 10;
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(colorBlack);
      doc.text("TOTAL A PAGAR", rightColX, finalY, { align: 'right' });
      
      const toPay = totalInvoice - invoice.retainer;
      doc.text(formatCurrency(toPay), rightValX, finalY, { align: 'right' });
  }

  // --- PIE DE PÁGINA ---
  const footerY = pageHeight - 40;

  // Información de Pago (IBAN)
  doc.setDrawColor(colorLightGray);
  doc.setLineWidth(0.1);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(colorBlack);
  doc.text("FORMA DE PAGO:", margin, footerY + 5);

  doc.setFont("helvetica", "normal");
  doc.text("Transferencia Bancaria", margin + 35, footerY + 5);

  if (profile.iban) {
      doc.setFont("helvetica", "bold");
      doc.text("IBAN:", margin, footerY + 11);
      doc.setFont("courier", "normal"); // Monoespaciado para números
      doc.setFontSize(10);
      doc.text(profile.iban, margin + 35, footerY + 11);
  }

  // Texto Legal (Centrado al fondo)
  const gdprText = "Tratamiento de Datos: Sus datos personales serán tratados para la gestión administrativa y contable conforme al RGPD. Puede ejercer sus derechos contactando con el emisor de esta factura.";
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(colorLightGray); // Gris muy claro para no distraer
  doc.text(gdprText, pageWidth / 2, pageHeight - 15, { align: "center", maxWidth: pageWidth - (margin * 2) });

  // Guardar archivo
  doc.save(`Factura_${invoice.number}.pdf`);
};

export const generateFiscalYearReport = (year: number, invoices: Invoice[], profile: ProfessionalProfile) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;

    // --- Title Page / Header ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(`INFORME CIERRE FISCAL ${year}`, margin, 30);
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado el: ${new Date().toLocaleDateString('es-ES')}`, margin, 40);
    
    // Professional Details
    doc.setFontSize(10);
    doc.text(`${profile.name}`, margin, 50);
    doc.text(`NIF: ${profile.nif}`, margin, 55);
    if(profile.barAssociation) doc.text(`${profile.barAssociation} - Col. ${profile.collegiateNumber}`, margin, 60);

    // Calculations
    const yearInvoices = invoices.filter(inv => new Date(inv.date).getFullYear() === year);
    const incomes = yearInvoices.filter(i => i.type === InvoiceType.INCOME);
    const expenses = yearInvoices.filter(i => i.type === InvoiceType.EXPENSE && i.deductible);

    const totalIncome = incomes.reduce((sum, i) => sum + i.baseAmount, 0);
    const totalExpense = expenses.reduce((sum, i) => sum + i.baseAmount, 0);
    const netResult = totalIncome - totalExpense;

    const ivaRepercutido = incomes.reduce((sum, i) => sum + i.ivaAmount, 0);
    const ivaSoportado = expenses.reduce((sum, i) => sum + i.ivaAmount, 0);
    const ivaResult = ivaRepercutido - ivaSoportado;

    const irpfSoportado = incomes.reduce((sum, i) => sum + i.irpfAmount, 0); // Retenciones sufridas
    const irpfPracticado = expenses.reduce((sum, i) => sum + i.irpfAmount, 0); // Retenciones practicadas

    // --- Executive Summary ---
    let yPos = 75;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("1. Resumen Ejecutivo (Estimación Directa)", margin, yPos);
    yPos += 10;

    autoTable(doc, {
        startY: yPos,
        head: [['Concepto', 'Importe']],
        body: [
            ['Total Ingresos (Base Imponible)', formatCurrency(totalIncome)],
            ['Total Gastos Deducibles (Base)', formatCurrency(totalExpense)],
            ['RENDIMIENTO NETO', formatCurrency(netResult)]
        ],
        theme: 'striped',
        headStyles: { fillColor: [63, 81, 181] },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // --- VAT Summary ---
    doc.text("2. Resumen de IVA (Modelo 303/390)", margin, yPos);
    yPos += 10;

    autoTable(doc, {
        startY: yPos,
        head: [['Concepto', 'Importe']],
        body: [
            ['IVA Repercutido (Devengado)', formatCurrency(ivaRepercutido)],
            ['IVA Soportado (Deducible)', formatCurrency(ivaSoportado)],
            ['RESULTADO LIQUIDACIÓN IVA', formatCurrency(ivaResult)]
        ],
        theme: 'striped',
        headStyles: { fillColor: [234, 88, 12] }, // Orange
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // --- Withholding Summary ---
    doc.text("3. Retenciones IRPF", margin, yPos);
    yPos += 10;

    autoTable(doc, {
        startY: yPos,
        head: [['Concepto', 'Modelo Asociado', 'Importe']],
        body: [
            ['Retenciones Soportadas (Pagos a cuenta)', 'Mod. 130 / 100', formatCurrency(irpfSoportado)],
            ['Retenciones Practicadas (A ingresar)', 'Mod. 111 / 190', formatCurrency(irpfPracticado)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }, // Green
        columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } }
    });
    
    // Footer explanation regarding numbering
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100);
    doc.text(`Nota: El cierre fiscal no impide consultar datos históricos.`, margin, pageHeight - 20);
    doc.text(`La numeración de facturas para el ejercicio ${year + 1} comenzará automáticamente con la secuencia A-${(year + 1).toString().slice(-2)}-1.`, margin, pageHeight - 15);

    doc.save(`Cierre_Fiscal_${year}.pdf`);
};
