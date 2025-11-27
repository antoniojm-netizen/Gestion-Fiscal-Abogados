
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Invoice, ProfessionalProfile } from "../types";

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
  doc.text(invoice.date ? new Date(invoice.date).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES'), pageWidth - margin, metaY, { align: "right" });


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
    `${feesAmount.toFixed(2)} €`
  ]);

  // Fila 2: Gastos/Suplidos (si existen y son > 0)
  if (invoice.taxableExpenses && invoice.taxableExpenses > 0) {
      tableBody.push([
          "Gastos / Suplidos incluidos en base",
          `${invoice.taxableExpenses.toFixed(2)} €`
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
  doc.text(`${(invoice.baseAmount || 0).toFixed(2)} €`, rightValX, finalY, { align: 'right' });
  
  finalY += 6;

  // IVA
  doc.setTextColor(colorDarkGray);
  doc.text(`IVA ${invoice.ivaRate}%`, rightColX, finalY, { align: 'right' });
  doc.setTextColor(colorBlack);
  doc.text(`${(invoice.ivaAmount || 0).toFixed(2)} €`, rightValX, finalY, { align: 'right' });
  
  finalY += 6;

  // IRPF (Si aplica)
  if (invoice.irpfRate && invoice.irpfRate > 0) {
    doc.setTextColor(colorDarkGray);
    doc.text(`Retención IRPF ${invoice.irpfRate}%`, rightColX, finalY, { align: 'right' });
    doc.setTextColor(colorBlack);
    doc.text(`- ${(invoice.irpfAmount || 0).toFixed(2)} €`, rightValX, finalY, { align: 'right' });
    finalY += 6;
  }

  // SUPLIDOS (Si aplica)
  if (invoice.supplies && invoice.supplies > 0) {
      doc.setTextColor(colorDarkGray);
      doc.text("Suplidos (Exento)", rightColX, finalY, { align: 'right' });
      doc.setTextColor(colorBlack);
      doc.text(`+ ${(invoice.supplies).toFixed(2)} €`, rightValX, finalY, { align: 'right' });
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
  doc.text(`${totalInvoice.toFixed(2)} €`, rightValX, finalY, { align: 'right' });

  // --- PROVISIÓN DE FONDOS Y TOTAL A PAGAR ---
  // Si hay provisión de fondos, mostramos el desglose final
  if (invoice.retainer && invoice.retainer > 0) {
      finalY += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(colorDarkGray);
      doc.text("Menos Provisión de Fondos", rightColX, finalY, { align: 'right' });
      doc.setTextColor(colorBlack); // Destacamos en negro al ser una resta importante
      doc.text(`- ${invoice.retainer.toFixed(2)} €`, rightValX, finalY, { align: 'right' });
      
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
      doc.text(`${toPay.toFixed(2)} €`, rightValX, finalY, { align: 'right' });
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
