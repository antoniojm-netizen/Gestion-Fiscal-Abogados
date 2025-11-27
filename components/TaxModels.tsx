import React, { useMemo } from 'react';
import { Invoice, InvoiceType } from '../types';
import { FileBarChart, Calendar, Calculator, TrendingUp, TrendingDown, Scale, FileText, Download, PiggyBank, Users, Sparkles, PieChart } from 'lucide-react';
import { Button } from './Button';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface TaxModelsProps {
  invoices: Invoice[];
  onAskAi?: (prompt: string) => void;
}

export const TaxModels: React.FC<TaxModelsProps> = ({ invoices, onAskAi }) => {
  const currentYear = new Date().getFullYear();

  const calculations = useMemo(() => {
    // Filter invoices for the current year to ensure "Annual" and current models are accurate
    const yearInvoices = invoices.filter(inv => new Date(inv.date).getFullYear() === currentYear);

    // Model 303 (IVA) & 390 (Resumen Anual)
    const incomes = yearInvoices.filter(i => i.type === InvoiceType.INCOME);
    const expenses = yearInvoices.filter(i => i.type === InvoiceType.EXPENSE && i.deductible);
    
    const ivaDevengado = incomes.reduce((sum, i) => sum + i.ivaAmount, 0);
    const baseDevengado = incomes.reduce((sum, i) => sum + i.baseAmount, 0);
    
    const ivaSoportado = expenses.reduce((sum, i) => sum + i.ivaAmount, 0);
    const baseSoportado = expenses.reduce((sum, i) => sum + i.baseAmount, 0);
    
    const result303 = ivaDevengado - ivaSoportado;

    // Desglose por tipos de IVA para el Modelo 390 (Gastos)
    const desgloseSoportado = expenses.reduce((acc, inv) => {
        const rate = inv.ivaRate;
        if (!acc[rate]) {
            acc[rate] = { base: 0, quota: 0 };
        }
        acc[rate].base += inv.baseAmount;
        acc[rate].quota += inv.ivaAmount;
        return acc;
    }, {} as Record<number, { base: number, quota: number }>);

    // Convertir a array y ordenar por tipo de IVA descendente
    const listadoDesgloseSoportado = Object.entries(desgloseSoportado)
        .map(([rate, data]) => {
            const d = data as { base: number, quota: number };
            return { rate: Number(rate), base: d.base, quota: d.quota };
        })
        .sort((a, b) => b.rate - a.rate);


    // Model 130 (IRPF) - Estimación Directa Simplificada
    const totalIngresos = incomes.reduce((sum, i) => sum + i.baseAmount, 0);
    const totalGastos = expenses.reduce((sum, i) => sum + i.baseAmount, 0);
    const rendimientoNeto = totalIngresos - totalGastos;
    
    // 1. Cálculo de la cuota teórica (20% del rendimiento neto)
    const pagoTeorico = rendimientoNeto > 0 ? rendimientoNeto * 0.20 : 0;
    
    // 2. Cálculo de Retenciones Soportadas (IRPF en facturas emitidas)
    const retencionesSoportadas = incomes.reduce((sum, i) => sum + i.irpfAmount, 0);

    // 3. Resultado final (Cuota - Retenciones)
    const resultadoIrpfAnual = pagoTeorico - retencionesSoportadas;


    // Model 111 (Retenciones a profesionales/trabajadores - Gastos)
    // Assuming expenses with IRPF are from professionals checking invoices received
    const retencionesPracticadas = expenses.reduce((sum, i) => sum + i.irpfAmount, 0);

    // Model 347 (Operations > 3005.06€)
    const operationsByNif = yearInvoices.reduce((acc, curr) => {
      if (!acc[curr.nif]) {
        acc[curr.nif] = { name: curr.entityName, total: 0, type: curr.type };
      }
      acc[curr.nif].total += Math.abs(curr.totalAmount);
      return acc;
    }, {} as Record<string, {name: string, total: number, type: InvoiceType}>);

    const model347List = (Object.entries(operationsByNif) as [string, { name: string; total: number; type: InvoiceType }][])
      .filter(([_, data]) => data.total > 3005.06)
      .map(([nif, data]) => ({ nif, ...data }));

    // Model 190 (Annual Summary of Withholdings Suffered / Retenciones Soportadas)
    // Grouping clients who withheld tax from us
    const incomesWithWithholding = incomes.filter(i => i.irpfAmount > 0);
    const model190Map = incomesWithWithholding.reduce((acc, curr) => {
        if (!acc[curr.nif]) {
            acc[curr.nif] = { name: curr.entityName, nif: curr.nif, base: 0, retention: 0 };
        }
        acc[curr.nif].base += curr.baseAmount;
        acc[curr.nif].retention += curr.irpfAmount;
        return acc;
    }, {} as Record<string, {name: string, nif: string, base: number, retention: number}>);
    
    const model190List = Object.values(model190Map);

    return { 
        ivaDevengado, 
        baseDevengado,
        ivaSoportado, 
        baseSoportado,
        listadoDesgloseSoportado,
        result303, 
        totalIngresos, 
        totalGastos, 
        rendimientoNeto, 
        pagoTeorico,
        retencionesSoportadas,
        resultadoIrpfAnual,
        retencionesPracticadas, 
        model347List,
        model190List
    };
  }, [invoices, currentYear]);

  const generatePDFReport = (modelType: 'ALL' | '303' | '390' | '130' | '111' | '347' | '190' = 'ALL') => {
    const doc = new jsPDF();
    const currentQuarter = Math.floor((new Date().getMonth() + 3) / 3);
    
    let title = `Informe Fiscal ${currentYear}`;
    if (modelType === '303') title = `Modelo 303 (IVA) - ${currentYear}`;
    if (modelType === '390') title = `Modelo 390 (Resumen Anual IVA) - ${currentYear}`;
    if (modelType === '130') title = `Modelo 130 (IRPF) - ${currentYear}`;
    if (modelType === '111') title = `Modelo 111 (Retenciones Practicadas) - ${currentYear}`;
    if (modelType === '347') title = `Modelo 347 (Operaciones con Terceros) - ${currentYear}`;
    if (modelType === '190') title = `Modelo 190 (Retenciones Soportadas) - ${currentYear}`;

    doc.setFontSize(18);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleDateString()} - AbogadoGestor AI`, 14, 28);
    if (['303', '130', '111'].includes(modelType)) {
        doc.text(`Periodo: 1T - ${currentQuarter}T`, 14, 34);
    } else {
        doc.text(`Periodo: Anual`, 14, 34);
    }

    // Prepare Data by Quarter for periodic models
    const quarters = [1, 2, 3, 4].filter(q => q <= currentQuarter);
    
    const quarterData = quarters.map(q => {
        const startMonth = (q - 1) * 3;
        const endMonth = startMonth + 2;
        
        const qInvoices = invoices.filter(inv => {
            const d = new Date(inv.date);
            return d.getFullYear() === currentYear && d.getMonth() >= startMonth && d.getMonth() <= endMonth;
        });
        
        const qIncomes = qInvoices.filter(i => i.type === InvoiceType.INCOME);
        const qExpenses = qInvoices.filter(i => i.type === InvoiceType.EXPENSE && i.deductible);
        
        const devengado = qIncomes.reduce((s, i) => s + i.ivaAmount, 0);
        const soportado = qExpenses.reduce((s, i) => s + i.ivaAmount, 0);
        
        const ingresos = qIncomes.reduce((s, i) => s + i.baseAmount, 0);
        const gastos = qExpenses.reduce((s, i) => s + i.baseAmount, 0);
        const rend = ingresos - gastos;
        
        // Cálculo aproximado trimestre
        const pagoCuenta = rend > 0 ? rend * 0.20 : 0;
        const retenciones = qIncomes.reduce((s, i) => s + i.irpfAmount, 0);
        const result130 = pagoCuenta - retenciones;

        // Model 111 quarterly
        const retencionesPracticadas = qExpenses.reduce((s, i) => s + i.irpfAmount, 0);

        return { 
            q, 
            devengado, 
            soportado, 
            res303: devengado - soportado, 
            ingresos, 
            gastos, 
            rend, 
            pagoCuenta,
            retenciones,
            result130,
            retencionesPracticadas
        };
    });

    let finalY = 45;

    // Table 303
    if (modelType === 'ALL' || modelType === '303') {
        doc.setFontSize(14);
        doc.text("Modelo 303 (IVA)", 14, finalY);
        
        autoTable(doc, {
            startY: finalY + 5,
            head: [['Trimestre', 'IVA Devengado', 'IVA Soportado', 'Resultado']],
            body: quarterData.map(d => [
                `T${d.q}`, 
                `${d.devengado.toFixed(2)} €`, 
                `${d.soportado.toFixed(2)} €`, 
                `${d.res303.toFixed(2)} €`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229] }
        });
        // @ts-ignore
        finalY = doc.lastAutoTable.finalY + 15;
    }

    // Table 390
    if (modelType === 'ALL' || modelType === '390') {
        doc.setFontSize(14);
        doc.text("Modelo 390 (Resumen Anual IVA)", 14, finalY);
        
        // Tabla 1: Totales Generales
        autoTable(doc, {
            startY: finalY + 5,
            head: [['Concepto', 'Base Imponible Total', 'Cuota IVA Total']],
            body: [
                ['IVA Devengado (Facturas Emitidas)', `${calculations.baseDevengado.toFixed(2)} €`, `${calculations.ivaDevengado.toFixed(2)} €`],
                ['IVA Soportado (Facturas Recibidas)', `${calculations.baseSoportado.toFixed(2)} €`, `${calculations.ivaSoportado.toFixed(2)} €`],
                ['RESULTADO ANUAL', '-', `${calculations.result303.toFixed(2)} €`]
            ],
            theme: 'striped',
            headStyles: { fillColor: [124, 58, 237] } // Violet
        });
        
        // @ts-ignore
        finalY = doc.lastAutoTable.finalY + 10;

        // Tabla 2: Desglose Soportado
        doc.setFontSize(12);
        doc.text("Desglose IVA Soportado por Tipos", 14, finalY);
        
        autoTable(doc, {
            startY: finalY + 5,
            head: [['Tipo Impositivo', 'Base Imponible', 'Cuota IVA']],
            body: calculations.listadoDesgloseSoportado.map(item => [
                `${item.rate}%`,
                `${item.base.toFixed(2)} €`,
                `${item.quota.toFixed(2)} €`
            ]),
            theme: 'grid',
        });

        // @ts-ignore
        finalY = doc.lastAutoTable.finalY + 15;
    }

    // Table 130
    if (modelType === 'ALL' || modelType === '130') {
        doc.setFontSize(14);
        doc.text("Modelo 130 (IRPF)", 14, finalY);

        autoTable(doc, {
            startY: finalY + 5,
            head: [['Trimestre', 'Ingresos', 'Gastos Ded.', 'Rend. Neto', 'Cuota (20%)', 'Retenciones', 'A Ingresar']],
            body: quarterData.map(d => [
                `T${d.q}`, 
                `${d.ingresos.toFixed(2)} €`, 
                `${d.gastos.toFixed(2)} €`, 
                `${d.rend.toFixed(2)} €`,
                `${d.pagoCuenta.toFixed(2)} €`,
                `${d.retenciones.toFixed(2)} €`,
                `${d.result130.toFixed(2)} €`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129] }
        });
        // @ts-ignore
        finalY = doc.lastAutoTable.finalY + 15;
    }

    // Table 111
    if (modelType === 'ALL' || modelType === '111') {
        doc.setFontSize(14);
        doc.text("Modelo 111 (Retenciones Practicadas - Gastos)", 14, finalY);
        
        autoTable(doc, {
            startY: finalY + 5,
            head: [['Trimestre', 'Total Retenido (A Ingresar)']],
            body: quarterData.map(d => [
                `T${d.q}`, 
                `${d.retencionesPracticadas.toFixed(2)} €`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [245, 158, 11] }
        });
         // @ts-ignore
         finalY = doc.lastAutoTable.finalY + 15;
    }

    // Table 347
    if (modelType === 'ALL' || modelType === '347') {
        doc.setFontSize(14);
        doc.text("Modelo 347 (Operaciones > 3.005,06 €)", 14, finalY);

        if (calculations.model347List.length === 0) {
            doc.setFontSize(10);
            doc.text("No existen operaciones que superen el límite anual.", 14, finalY + 10);
            finalY += 20;
        } else {
            autoTable(doc, {
                startY: finalY + 5,
                head: [['NIF', 'Nombre / Razón Social', 'Tipo', 'Importe Total']],
                body: calculations.model347List.map(item => [
                    item.nif,
                    item.name,
                    item.type === InvoiceType.INCOME ? 'CLIENTE' : 'PROVEEDOR',
                    `${item.total.toFixed(2)} €`
                ]),
                theme: 'striped',
                headStyles: { fillColor: [71, 85, 105] }
            });
             // @ts-ignore
            finalY = doc.lastAutoTable.finalY + 15;
        }
    }

    // Table 190 (Custom Report for User)
    if (modelType === 'ALL' || modelType === '190') {
        doc.setFontSize(14);
        doc.text("Modelo 190 - Certificados (Retenciones Soportadas)", 14, finalY);

        if (calculations.model190List.length === 0) {
             doc.setFontSize(10);
             doc.text("No se han registrado retenciones soportadas.", 14, finalY + 10);
        } else {
            autoTable(doc, {
                startY: finalY + 5,
                head: [['NIF', 'Cliente (Pagador)', 'Base Imponible', 'Retención Practicada']],
                body: calculations.model190List.map(item => [
                    item.nif,
                    item.name,
                    `${item.base.toFixed(2)} €`,
                    `${item.retention.toFixed(2)} €`
                ]),
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246] }
            });
        }
    }

    doc.save(`${title.replace(/ /g, '_')}.pdf`);
  };

  const handleConsultAi = (type: '303' | '390' | '130' | '111' | '347' | '190') => {
      if (!onAskAi) return;

      let prompt = "";
      if (type === '303') {
          prompt = `Actúa como experto fiscal en España. Explícame cómo rellenar el Modelo 303 (IVA) con mis datos actuales del año ${currentYear}:
          - IVA Devengado (Repercutido): ${calculations.ivaDevengado.toFixed(2)}€
          - IVA Soportado (Deducible): ${calculations.ivaSoportado.toFixed(2)}€
          - Resultado: ${calculations.result303.toFixed(2)}€
          
          ¿En qué casillas generales debería poner estos importes?`;
      } else if (type === '390') {
          prompt = `Actúa como experto fiscal. Necesito ayuda con el Modelo 390 (Resumen Anual IVA) para el ejercicio ${currentYear}.
          Mis totales son:
          - Base Devengado: ${calculations.baseDevengado.toFixed(2)}€ | Cuota: ${calculations.ivaDevengado.toFixed(2)}€
          - Base Soportado: ${calculations.baseSoportado.toFixed(2)}€ | Cuota: ${calculations.ivaSoportado.toFixed(2)}€
          
          Detalle Soportado por tipos:
          ${calculations.listadoDesgloseSoportado.map(d => `- Tipo ${d.rate}%: Base ${d.base.toFixed(2)}€, Cuota ${d.quota.toFixed(2)}€`).join('\n')}
          
          ¿Cómo debo trasladar este desglose a las casillas del modelo?`;
      } else if (type === '130') {
          prompt = `Actúa como experto fiscal. Ayúdame con el Modelo 130 (IRPF Estimación Directa) para el año ${currentYear}. Mis datos acumulados son:
          - Ingresos computables: ${calculations.totalIngresos.toFixed(2)}€
          - Gastos deducibles: ${calculations.totalGastos.toFixed(2)}€
          - Rendimiento Neto: ${calculations.rendimientoNeto.toFixed(2)}€
          - Retenciones que me han practicado (Soportadas): ${calculations.retencionesSoportadas.toFixed(2)}€
          - Resultado Final a ingresar (aprox): ${calculations.resultadoIrpfAnual.toFixed(2)}€
          
          Explica brevemente el cálculo y cómo declararlo.`;
      } else if (type === '111') {
          prompt = `Explícame el Modelo 111 (Retenciones e Ingresos a Cuenta).
          Tengo un total retenido en facturas recibidas (profesionales) de: ${calculations.retencionesPracticadas.toFixed(2)}€.
          ¿Cómo debo declarar e ingresar esto en Hacienda?`;
      } else if (type === '347') {
          const count = calculations.model347List.length;
          prompt = `Sobre el Modelo 347 (Declaración anual de operaciones con terceras personas).
          Según mis registros, tengo ${count} terceros que superan los 3.005,06€.
          ¿Cuándo se presenta este modelo y qué datos exactos necesito de cada uno?`;
      } else if (type === '190') {
          prompt = `Tengo dudas sobre el Modelo 190 (Resumen Anual de Retenciones).
          He soportado retenciones por valor de ${calculations.retencionesSoportadas.toFixed(2)}€ en mis facturas emitidas.
          ¿Debo presentar yo el 190 o lo presentan mis clientes? ¿Cómo obtengo mis certificados de retenciones?`;
      }

      onAskAi(prompt);
  };

  return (
    <div className="space-y-6">
      
      {/* Resumen Anual Global */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-indigo-400" />
                    Resumen Anual Global ({currentYear})
                </h3>
            </div>
            <div className="flex items-center gap-2">
                <Button onClick={() => generatePDFReport('ALL')} variant="secondary" className="text-xs h-8 px-3">
                    <FileText className="h-4 w-4 text-red-500" />
                    Informe Completo PDF
                </Button>
            </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* IVA Annual Section */}
            <div className="space-y-5 pt-4 md:pt-0">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-indigo-100 rounded-lg">
                        <Calculator className="h-4 w-4 text-indigo-600" />
                    </div>
                    <h4 className="font-bold text-slate-700">IVA Anual</h4>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                            <TrendingUp className="h-3 w-3 text-green-500" />
                            Devengado (Cobrado)
                        </div>
                        <p className="text-lg font-bold text-slate-800">{calculations.ivaDevengado.toFixed(2)} €</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                            <TrendingDown className="h-3 w-3 text-red-500" />
                            Soportado (Pagado)
                        </div>
                        <p className="text-lg font-bold text-slate-800">{calculations.ivaSoportado.toFixed(2)} €</p>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-medium text-slate-600">Balance IVA Anual</span>
                    <span className={`text-xl font-bold ${calculations.result303 >= 0 ? 'text-indigo-600' : 'text-green-600'}`}>
                        {calculations.result303 >= 0 ? '+ ' : ''}{calculations.result303.toFixed(2)} €
                    </span>
                </div>
                <p className="text-xs text-slate-400">* Diferencia entre IVA repercutido en facturas y soportado en gastos.</p>
            </div>

            {/* IRPF Annual Section */}
            <div className="space-y-5 pt-6 md:pt-0 md:pl-8">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-emerald-100 rounded-lg">
                        <Scale className="h-4 w-4 text-emerald-600" />
                    </div>
                    <h4 className="font-bold text-slate-700">IRPF (Estimación Directa)</h4>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                            <TrendingUp className="h-3 w-3 text-green-500" />
                            Ingresos Computables
                        </div>
                        <p className="text-lg font-bold text-slate-800">{calculations.totalIngresos.toFixed(2)} €</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                            <TrendingDown className="h-3 w-3 text-red-500" />
                            Gastos Deducibles
                        </div>
                        <p className="text-lg font-bold text-slate-800">{calculations.totalGastos.toFixed(2)} €</p>
                    </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mt-2">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Scale className="h-3 w-3 text-emerald-500" />
                            Rendimiento Neto
                        </div>
                        <span className="font-semibold text-slate-700">{calculations.rendimientoNeto.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200 pt-1 mt-1">
                         <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <PiggyBank className="h-3 w-3 text-blue-500" />
                            Retenciones Soportadas (-)
                        </div>
                        <span className="font-semibold text-blue-600">- {calculations.retencionesSoportadas.toFixed(2)} €</span>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-medium text-slate-600">Total a Ingresar (Pago a Cuenta)</span>
                    <span className={`text-xl font-bold ${calculations.resultadoIrpfAnual > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {calculations.resultadoIrpfAnual.toFixed(2)} €
                    </span>
                </div>
                 <p className="text-xs text-slate-400">* (20% del Rend. Neto) - Retenciones Soportadas.</p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Modelo 303 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-indigo-600" />
                Modelo 303 (IVA)
            </h3>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleConsultAi('303')}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded transition-colors"
                >
                    <Sparkles className="h-3 w-3" /> Ayuda IA
                </button>
                <button 
                    onClick={() => generatePDFReport('303')} 
                    className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded transition-colors"
                    title="Descargar PDF Trimestres Modelo 303"
                >
                    <Download className="h-5 w-5" />
                </button>
                <span className={`px-2 py-1 rounded text-xs font-bold ${calculations.result303 >= 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'}`}>
                    {calculations.result303 >= 0 ? 'A Ingresar' : 'A Devolver'}
                </span>
            </div>
            </div>
            <div className="p-6 space-y-4">
            <div className="flex justify-between text-sm">
                <span className="text-slate-600">IVA Devengado</span>
                <span className="font-medium text-slate-900">{calculations.ivaDevengado.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm">
                <span className="text-slate-600">IVA Soportado</span>
                <span className="font-medium text-slate-900">- {calculations.ivaSoportado.toFixed(2)} €</span>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="font-semibold text-slate-800">Resultado Liquidación</span>
                <span className="text-xl font-bold text-slate-900">{calculations.result303.toFixed(2)} €</span>
            </div>
            </div>
        </div>

        {/* Modelo 390 (Resumen Anual IVA) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <PieChart className="h-5 w-5 text-violet-600" />
                Modelo 390 (Anual IVA)
            </h3>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleConsultAi('390')}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded transition-colors"
                >
                    <Sparkles className="h-3 w-3" /> Ayuda IA
                </button>
                <button 
                    onClick={() => generatePDFReport('390')} 
                    className="text-violet-600 hover:bg-violet-50 p-1.5 rounded transition-colors"
                    title="Descargar Informe Detallado Modelo 390"
                >
                    <Download className="h-5 w-5" />
                </button>
            </div>
            </div>
            <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                     <div>
                        <p className="text-xs text-slate-500 mb-1">Base Devengado</p>
                        <p className="font-mono text-sm font-semibold">{calculations.baseDevengado.toFixed(2)} €</p>
                        <p className="text-[10px] text-slate-400">Cuota: {calculations.ivaDevengado.toFixed(2)} €</p>
                     </div>
                     <div>
                        <p className="text-xs text-slate-500 mb-1">Base Soportado</p>
                        <p className="font-mono text-sm font-semibold">{calculations.baseSoportado.toFixed(2)} €</p>
                        <p className="text-[10px] text-slate-400">Cuota: {calculations.ivaSoportado.toFixed(2)} €</p>
                     </div>
                </div>
                
                <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-600 uppercase">Desglose Gastos (Soportado)</p>
                    {calculations.listadoDesgloseSoportado.length === 0 ? (
                         <p className="text-xs text-slate-400 italic">No hay gastos deducibles registrados.</p>
                    ) : (
                        calculations.listadoDesgloseSoportado.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs items-center bg-slate-50 p-2 rounded">
                                <span className="font-medium text-slate-700">IVA {item.rate}%</span>
                                <div className="text-right">
                                    <span className="block text-slate-800 font-mono">{item.quota.toFixed(2)} €</span>
                                    <span className="block text-slate-400 text-[10px]">Base: {item.base.toFixed(2)} €</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* Modelo 130 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-indigo-600" />
                Modelo 130 (IRPF)
            </h3>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleConsultAi('130')}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded transition-colors"
                >
                    <Sparkles className="h-3 w-3" /> Ayuda IA
                </button>
                <button 
                    onClick={() => generatePDFReport('130')} 
                    className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded transition-colors"
                    title="Descargar PDF Trimestres Modelo 130"
                >
                    <Download className="h-5 w-5" />
                </button>
            </div>
            </div>
            <div className="p-6 space-y-4">
            <div className="flex justify-between text-sm">
                <span className="text-slate-600">Ingresos</span>
                <span className="font-medium text-slate-900">{calculations.totalIngresos.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm">
                <span className="text-slate-600">Gastos</span>
                <span className="font-medium text-slate-900">- {calculations.totalGastos.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm font-medium bg-slate-50 p-2 rounded">
                <span className="text-slate-700">Rendimiento Neto</span>
                <span className="text-slate-900">{calculations.rendimientoNeto.toFixed(2)} €</span>
            </div>
            
            {/* Detail calculation 130 */}
            <div className="text-xs space-y-1 text-slate-500 pl-2 border-l-2 border-slate-100">
                <div className="flex justify-between">
                   <span>Cuota (20% Rend.)</span>
                   <span>{calculations.pagoTeorico.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between">
                   <span>Retenciones (-)</span>
                   <span>- {calculations.retencionesSoportadas.toFixed(2)} €</span>
                </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                <span className="text-sm text-slate-600">Total A Ingresar</span>
                <span className="text-lg font-bold text-slate-900">{calculations.resultadoIrpfAnual.toFixed(2)} €</span>
            </div>
            </div>
        </div>

        {/* Modelo 111 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-indigo-600" />
                Modelo 111 (Retenciones)
            </h3>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleConsultAi('111')}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded transition-colors"
                >
                    <Sparkles className="h-3 w-3" /> Ayuda IA
                </button>
                <button 
                    onClick={() => generatePDFReport('111')} 
                    className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded transition-colors"
                    title="Descargar Informe Trimestral"
                >
                    <Download className="h-5 w-5" />
                </button>
            </div>
            </div>
            <div className="p-6">
            <p className="text-sm text-slate-600 mb-4">Retenciones practicadas a profesionales o trabajadores en nómina.</p>
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg">
                <span className="font-semibold text-slate-800">Total a Ingresar (Anual)</span>
                <span className="text-xl font-bold text-slate-900">{calculations.retencionesPracticadas.toFixed(2)} €</span>
            </div>
            </div>
        </div>

        {/* Modelo 347 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-indigo-600" />
                Modelo 347 (&gt; 3.005€)
            </h3>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleConsultAi('347')}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded transition-colors"
                >
                    <Sparkles className="h-3 w-3" /> Ayuda IA
                </button>
                <button 
                    onClick={() => generatePDFReport('347')} 
                    className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded transition-colors"
                    title="Descargar Informe Anual Detallado"
                >
                    <Download className="h-5 w-5" />
                </button>
            </div>
            </div>
            <div className="p-6">
            {calculations.model347List.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No hay terceros que superen el límite anual.</p>
            ) : (
                <ul className="space-y-3">
                {calculations.model347List.slice(0, 3).map((op, idx) => (
                    <li key={idx} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                    <div>
                        <p className="font-medium text-slate-900">{op.name}</p>
                        <p className="text-xs text-slate-500">{op.nif} ({op.type === InvoiceType.INCOME ? 'Cliente' : 'Proveedor'})</p>
                    </div>
                    <span className="font-bold text-slate-700">{op.total.toFixed(2)} €</span>
                    </li>
                ))}
                {calculations.model347List.length > 3 && (
                    <li className="text-xs text-center text-indigo-600 pt-2">
                        + {calculations.model347List.length - 3} registros más (Ver PDF)
                    </li>
                )}
                </ul>
            )}
            </div>
        </div>

         {/* Modelo 190 (Retenciones Soportadas) */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-600" />
                Modelo 190 (Ret. Soportadas)
            </h3>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => handleConsultAi('190')}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded transition-colors"
                >
                    <Sparkles className="h-3 w-3" /> Ayuda IA
                </button>
                <button 
                    onClick={() => generatePDFReport('190')} 
                    className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded transition-colors"
                    title="Descargar Certificados de Retención"
                >
                    <Download className="h-5 w-5" />
                </button>
            </div>
            </div>
            <div className="p-6">
            <p className="text-sm text-slate-600 mb-4">Terceros que nos han practicado retenciones (Clientes).</p>
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg mb-3">
                <span className="font-semibold text-slate-800">Total Retenido (Anual)</span>
                <span className="text-xl font-bold text-slate-900">{calculations.retencionesSoportadas.toFixed(2)} €</span>
            </div>
            <div className="text-xs text-slate-500">
                {calculations.model190List.length > 0 ? (
                    <span>{calculations.model190List.length} clientes retenedores.</span>
                ) : (
                    <span>Sin registros.</span>
                )}
            </div>
            </div>
        </div>

      </div>
    </div>
  );
};